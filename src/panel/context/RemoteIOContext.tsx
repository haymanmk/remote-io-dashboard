import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'

type ConnectionState = 'connected' | 'disconnected'
type LedRgb = { r: number; g: number; b: number }

export interface RemoteIOState {
  connection: ConnectionState
  deviceStatus: string | null
  inputs:  boolean[]
  outputs: boolean[]
  leds:    LedRgb[]
  uart:    Record<number, string[]>
}

const INITIAL_STATE: RemoteIOState = {
  connection: 'disconnected',
  deviceStatus: null,
  inputs:  Array<boolean>(16).fill(false),
  outputs: Array<boolean>(16).fill(false),
  leds:    Array.from({ length: 25 }, () => ({ r: 0, g: 0, b: 0 })),
  uart:    { 0: [], 1: [] },
}

type Action =
  | { type: 'snapshot'; snapshot: RemoteIOState }
  | { type: 'connectionState'; state: ConnectionState; deviceStatus?: string | null }
  | { type: 'inputs'; values: boolean[] }
  | { type: 'uart'; channel: number; data: string }
  | { type: 'localSetOutput'; index: number; value: 0 | 1 }
  | { type: 'localSetLed'; index: number; r: number; g: number; b: number }

function reducer(state: RemoteIOState, action: Action): RemoteIOState {
  switch (action.type) {
    case 'snapshot':
      return { ...action.snapshot }
    case 'connectionState':
      return { ...state, connection: action.state, deviceStatus: action.deviceStatus ?? state.deviceStatus }
    case 'inputs':
      return { ...state, inputs: [...action.values] }
    case 'uart': {
      const next = { ...state.uart, [action.channel]: [...(state.uart[action.channel] ?? []), action.data] }
      return { ...state, uart: next }
    }
    case 'localSetOutput': {
      const next = [...state.outputs]
      next[action.index - 1] = action.value === 1
      return { ...state, outputs: next }
    }
    case 'localSetLed': {
      const next = [...state.leds]
      next[action.index] = { r: action.r, g: action.g, b: action.b }
      return { ...state, leds: next }
    }
    default:
      return state
  }
}

interface ContextValue {
  state: RemoteIOState
  send:  <T = unknown>(msg: { type: string; [k: string]: unknown }) => Promise<T>
  setOutput: (index: number, value: 0 | 1) => Promise<void>
  setLed:    (index: number, r: number, g: number, b: number) => Promise<void>
  uartSend:  (channel: number, data: string) => Promise<void>
  subscribeInputs:   () => Promise<void>
  unsubscribeInputs: () => Promise<void>
  refresh:           () => Promise<void>
}

const Ctx = createContext<ContextValue | null>(null)

export function RemoteIOProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)

  // Initial snapshot
  useEffect(() => {
    let alive = true
    void window.nodalcore.postMessage({ type: 'getSnapshot' }).then((snap) => {
      if (alive && snap) dispatch({ type: 'snapshot', snapshot: snap as RemoteIOState })
    })
    return () => { alive = false }
  }, [])

  // Subscribe to plugin pushes
  useEffect(() => {
    const off = window.nodalcore.onMessage((raw) => {
      const msg = raw as { type: string; [k: string]: unknown }
      if (msg.type === 'connectionState') {
        dispatch({
          type: 'connectionState',
          state: msg.state as ConnectionState,
          deviceStatus: (msg.deviceStatus as string | null | undefined) ?? null,
        })
      } else if (msg.type === 'inputs') {
        dispatch({ type: 'inputs', values: msg.values as boolean[] })
      } else if (msg.type === 'uart') {
        dispatch({ type: 'uart', channel: msg.channel as number, data: msg.data as string })
      }
    })
    return () => { off() }
  }, [])

  // Re-snapshot on visibility return (panel was hidden, may have missed pushes)
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) {
        void window.nodalcore.postMessage({ type: 'getSnapshot' }).then((snap) => {
          if (snap) dispatch({ type: 'snapshot', snapshot: snap as RemoteIOState })
        })
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  async function send<T = unknown>(msg: { type: string; [k: string]: unknown }): Promise<T> {
    const reply = await window.nodalcore.postMessage(msg)
    if (reply && typeof reply === 'object' && 'error' in reply) {
      throw new Error(String((reply as { error: unknown }).error))
    }
    return reply as T
  }

  async function setOutput(index: number, value: 0 | 1) {
    await send({ type: 'setOutput', index, value })
    dispatch({ type: 'localSetOutput', index, value })
  }

  async function setLed(index: number, r: number, g: number, b: number) {
    await send({ type: 'setLed', index, r, g, b })
    dispatch({ type: 'localSetLed', index, r, g, b })
  }

  async function uartSend(channel: number, data: string) {
    await send({ type: 'uartSend', channel, data })
  }

  async function subscribeInputs()   { await send({ type: 'subscribeInputs' }) }
  async function unsubscribeInputs() { await send({ type: 'unsubscribeInputs' }) }

  async function refresh(): Promise<void> {
    const snap = await window.nodalcore.postMessage({ type: 'getSnapshot' })
    if (snap) dispatch({ type: 'snapshot', snapshot: snap as RemoteIOState })
  }

  return (
    <Ctx.Provider value={{ state, send, setOutput, setLed, uartSend, subscribeInputs, unsubscribeInputs, refresh }}>
      {children}
    </Ctx.Provider>
  )
}

export function useRemoteIO(): ContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRemoteIO must be used within <RemoteIOProvider>')
  return ctx
}
