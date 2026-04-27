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
}

type Action =
  | { type: 'CONNECTING' }
  | { type: 'CONNECTED'; inputs: boolean[]; outputs: boolean[] }
  | { type: 'DISCONNECTED' }
  | { type: 'ERROR'; message: string }
  | { type: 'INPUT_CHANGED'; pin: number; state: boolean }
  | { type: 'OUTPUT_CHANGED'; pin: number; state: boolean }
  | { type: 'LED_CHANGED'; index: number; color: LedColor }

const initial: RemoteIOState = {
  connection: 'idle',
  errorMessage: '',
  inputs:  Array<boolean>(16).fill(false),
  outputs: Array<boolean>(16).fill(false),
  leds:    Array<LedColor>(25).fill({ r: 0, g: 0, b: 0 }),
}

function reducer(state: RemoteIOState, action: Action): RemoteIOState {
  switch (action.type) {
    case 'CONNECTING':
      return { ...state, connection: 'connecting', errorMessage: '' }
    case 'CONNECTED': {
      return { ...state, connection: 'connected', inputs: action.inputs, outputs: action.outputs }
    }
    case 'DISCONNECTED':
      return { ...initial, connection: 'idle' }
    case 'ERROR':
      return { ...state, connection: 'error', errorMessage: action.message }
    case 'INPUT_CHANGED': {
      const inputs = [...state.inputs]
      inputs[action.pin - 1] = action.state  // pin is 1-based
      return { ...state, inputs }
    }
    case 'OUTPUT_CHANGED': {
      const outputs = [...state.outputs]
      outputs[action.pin - 1] = action.state
      return { ...state, outputs }
    }
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

  useEffect(() => {
    const unsub = window.remoteio.on((event: RemoteIOEvent) => {
      if (event.type === 'input-change') {
        dispatch({ type: 'INPUT_CHANGED', pin: event.pin, state: event.state })
      } else if (event.type === 'disconnected') {
        dispatch({ type: 'DISCONNECTED' })
      }
      // uart-data is handled locally in UartPanel
    })
    return unsub
  }, [])

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useRemoteIO(): ContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRemoteIO must be used inside RemoteIOProvider')
  return ctx
}
