import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react'
import type { RemoteIOEvent } from '../types/global'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error'

export interface LedColor { r: number; g: number; b: number }

export interface RemoteIOState {
  connection: ConnectionState
  errorMessage: string
  /** 16 booleans, index 0 = input pin 1 */
  inputs: boolean[]
  /** 16 booleans, index 0 = output pin 1 */
  outputs: boolean[]
  /** 25 LED colors, index 0 = LED 0 */
  leds: LedColor[]
  /** Latest status string from R1 (e.g. "OK", "CHECKING_FOR_UPDATE") */
  deviceStatus: string | null
  /** S5 events received while still connecting; applied on top of initial state at CONNECTED */
  _pendingInputs: Record<number, boolean>
}

type Action =
  | { type: 'CONNECTING' }
  | { type: 'CONNECTED'; inputs: boolean[]; outputs: boolean[] }
  | { type: 'BACKGROUND_HYDRATED'; inputs: boolean[]; outputs: boolean[]; status: string }
  | { type: 'DISCONNECTED' }
  | { type: 'ERROR'; message: string }
  | { type: 'INPUT_CHANGED'; pin: number; state: boolean }
  | { type: 'OUTPUT_CHANGED'; pin: number; state: boolean }
  | { type: 'OUTPUTS_REFRESHED'; outputs: boolean[] }
  | { type: 'LED_CHANGED'; index: number; color: LedColor }
  | { type: 'STATUS_UPDATED'; status: string }

const initial: RemoteIOState = {
  connection: 'idle',
  errorMessage: '',
  inputs:  Array<boolean>(16).fill(false),
  outputs: Array<boolean>(16).fill(false),
  leds:    Array<LedColor>(25).fill({ r: 0, g: 0, b: 0 }),
  deviceStatus: null,
  _pendingInputs: {},
}

function reducer(state: RemoteIOState, action: Action): RemoteIOState {
  switch (action.type) {
    case 'CONNECTING':
      return { ...state, connection: 'connecting', errorMessage: '', _pendingInputs: {} }
    case 'CONNECTED': {
      const inputs = [...action.inputs]
      for (const [pin, s] of Object.entries(state._pendingInputs)) {
        inputs[Number(pin) - 1] = s as boolean
      }
      return { ...state, connection: 'connected', inputs, outputs: action.outputs, _pendingInputs: {} }
    }
    case 'BACKGROUND_HYDRATED':
      return {
        ...state,
        connection: 'connected',
        inputs: action.inputs,
        outputs: action.outputs,
        deviceStatus: action.status || null,
        _pendingInputs: {},
      }
    case 'DISCONNECTED':
      return { ...initial }
    case 'ERROR':
      return { ...state, connection: 'error', errorMessage: action.message }
    case 'INPUT_CHANGED': {
      if (state.connection !== 'connected') {
        return { ...state, _pendingInputs: { ...state._pendingInputs, [action.pin]: action.state } }
      }
      const inputs = [...state.inputs]
      inputs[action.pin - 1] = action.state
      return { ...state, inputs }
    }
    case 'OUTPUT_CHANGED': {
      const outputs = [...state.outputs]
      outputs[action.pin - 1] = action.state
      return { ...state, outputs }
    }
    case 'OUTPUTS_REFRESHED':
      return { ...state, outputs: action.outputs }
    case 'STATUS_UPDATED':
      return { ...state, deviceStatus: action.status }
    case 'LED_CHANGED': {
      const leds = [...state.leds]
      leds[action.index] = action.color
      return { ...state, leds }
    }
    default:
      return state
  }
}

interface ContextValue {
  state: RemoteIOState
  dispatch: React.Dispatch<Action>
}

const Ctx = createContext<ContextValue | null>(null)

export function RemoteIOProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)

  // Hydrate from background state on mount (main process may still be connected)
  useEffect(() => {
    window.remoteio.getBackgroundState().then((bg) => {
      if (bg.connected) {
        dispatch({
          type: 'BACKGROUND_HYDRATED',
          inputs: bg.inputs,
          outputs: bg.outputs,
          status: bg.status ?? '',
        })
      }
    })
  }, [])

  useEffect(() => {
    const unsub = window.remoteio.on((event: RemoteIOEvent) => {
      if (event.type === 'input-change') {
        dispatch({ type: 'INPUT_CHANGED', pin: event.pin, state: event.state })
      } else if (event.type === 'status-update') {
        dispatch({ type: 'STATUS_UPDATED', status: event.status })
      } else if (event.type === 'connected') {
        dispatch({
          type: 'BACKGROUND_HYDRATED',
          inputs:  event.inputs,
          outputs: event.outputs,
          status:  event.status,
        })
      } else if (event.type === 'disconnected') {
        dispatch({ type: 'DISCONNECTED' })
      }
      // uart-data is handled locally in UartPanel
    })
    return unsub
  }, [])

  // Dev-only console helper
  useEffect(() => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__rio = {
        alert:   (status: string) => window.remoteio.testAlert(status),
        dismiss: (status = '')    => window.remoteio.dismissAlert(status),
      }
    }
  }, [])

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useRemoteIO(): ContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRemoteIO must be used inside RemoteIOProvider')
  return ctx
}
