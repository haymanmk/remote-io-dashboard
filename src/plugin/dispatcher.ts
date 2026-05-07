import type { CommandType, ParsedReply } from './protocol.js'

export interface PanelSnapshot {
  connection: 'connected' | 'disconnected'
  deviceStatus: string | null
  inputs: boolean[]
  outputs: boolean[]
  leds: Array<{ r: number; g: number; b: number }>
  uart: Record<number, string[]>
}

export interface DispatcherDeps {
  sendCommand: (
    type: CommandType,
    id: number,
    variant: number | null,
    ...params: (string | number)[]
  ) => Promise<ParsedReply>
  isConnected: () => boolean
  snapshot: () => PanelSnapshot
}

export type PanelMessage =
  | { type: 'getSnapshot' }
  | { type: 'setOutput';   index: number; value: 0 | 1 }
  | { type: 'setLed';      index: number; r: number; g: number; b: number }
  | { type: 'uartSend';    channel: number; data: string }
  | { type: 'subscribeInputs' }
  | { type: 'unsubscribeInputs' }

const ALL_PINS = Array.from({ length: 16 }, (_, i) => i + 1)

export function createDispatcher(deps: DispatcherDeps) {
  return async (raw: unknown): Promise<unknown> => {
    const msg = raw as PanelMessage
    if (msg?.type === 'getSnapshot') return deps.snapshot()
    if (!deps.isConnected()) return { error: 'not connected' }
    try {
      switch (msg.type) {
        case 'setOutput':
          await deps.sendCommand('W', 4, null, msg.index, msg.value)
          return { ok: true }
        case 'setLed':
          await deps.sendCommand('W', 8, null, msg.index, msg.r, msg.g, msg.b)
          return { ok: true }
        case 'uartSend':
          await deps.sendCommand('W', 7, msg.channel, msg.data.length, msg.data)
          return { ok: true }
        case 'subscribeInputs':
          await deps.sendCommand('W', 5, null, ...ALL_PINS)
          return { ok: true }
        case 'unsubscribeInputs':
          await deps.sendCommand('W', 6, null, ...ALL_PINS)
          return { ok: true }
        default:
          return { error: `unknown type: ${(msg as { type?: string })?.type ?? 'undefined'}` }
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }
}
