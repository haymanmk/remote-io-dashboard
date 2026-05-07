import type { ConnectionOptions, ExtensionContext } from '@nodalcore/sdk'
import { DevicePlugin } from '@nodalcore/sdk'
import { RemoteIOClient } from './tcp-client.js'
import { createDispatcher, type PanelSnapshot } from './dispatcher.js'
import { UartThrottle } from './uart-throttle.js'
import { UartRingBuffer } from './uart-ring-buffer.js'
import { parseBitfield } from './protocol.js'

const SLOT = 'dashboard'
const UART_THROTTLE_MS = 50
const UART_HISTORY_LINES = 256

let ctxRef: ExtensionContext | null = null
const client = new RemoteIOClient()
const uartHistory = new UartRingBuffer(UART_HISTORY_LINES)
let uartThrottle: UartThrottle | null = null

let lastInputs:  boolean[]      = Array<boolean>(16).fill(false)
let lastOutputs: boolean[]      = Array<boolean>(16).fill(false)
let lastLeds:    Array<{ r: number; g: number; b: number }> =
  Array.from({ length: 25 }, () => ({ r: 0, g: 0, b: 0 }))
let lastStatus:  string | null  = null

function pushToPanel(payload: unknown): void {
  if (!ctxRef) return
  void ctxRef.views.postMessage(SLOT, payload).catch(() => { /* panel not open */ })
}

function snapshot(): PanelSnapshot {
  return {
    connection: client.connected ? 'connected' : 'disconnected',
    deviceStatus: lastStatus,
    inputs:  [...lastInputs],
    outputs: [...lastOutputs],
    leds:    lastLeds.map((v) => ({ ...v })),
    uart: {
      0: uartHistory.snapshot(0),
      1: uartHistory.snapshot(1),
    },
  }
}

const dispatch = createDispatcher({
  sendCommand: (type, id, variant, ...params) =>
    client.sendCommand(type, id, variant, ...params),
  isConnected: () => client.connected,
  snapshot,
})

export default class RemoteIOPlugin extends DevicePlugin {
  readonly connectionType = 'tcp' as const

  async connect(options: ConnectionOptions): Promise<void> {
    const cfg = await ctxRef!.workspace.getConfiguration()
    // Prefer the host-supplied ConnectionOptions when populated. As of SDK
    // 0.2.0 the desktop renderer doesn't surface a Configure-and-Connect
    // dialog, so options arrives as an empty object cast — fall back to
    // ctx.workspace.getConfiguration() in that case. Once the host wires
    // up the dialog, options.host/options.port will take over automatically.
    const tcp = options?.connectionType === 'tcp' ? options : null
    const host = tcp?.host ?? (cfg.host as string | undefined) ?? '192.168.1.10'
    const port = tcp?.port ?? (8500 + ((cfg.portOffset as number | undefined) ?? 0))

    await client.connect(host, port)

    // Hydrate state with the same R3/R4/R1 sequence the old main process used.
    try {
      const inR  = await client.sendCommand('R', 3, null, -1)
      lastInputs  = inR.kind  === 'read' ? parseBitfield(inR.values)  : Array<boolean>(16).fill(false)
      const outR = await client.sendCommand('R', 4, null, -1)
      lastOutputs = outR.kind === 'read' ? parseBitfield(outR.values) : Array<boolean>(16).fill(false)
      const stR  = await client.sendCommand('R', 1, null)
      lastStatus = stR.kind  === 'read' ? (stR.values[0] ?? '') : ''
    } catch {
      // Hydration failures are non-fatal; the panel will retry via getSnapshot.
    }

    pushToPanel({ type: 'connectionState', state: 'connected', deviceStatus: lastStatus })
  }

  async disconnect(): Promise<void> {
    client.disconnect()
    pushToPanel({ type: 'connectionState', state: 'disconnected' })
  }
}

export async function activate(ctx: ExtensionContext): Promise<void> {
  ctxRef = ctx

  uartThrottle = new UartThrottle(UART_THROTTLE_MS, (channel, data) => {
    pushToPanel({ type: 'uart', channel, data })
  })

  ctx.views.onMessage(SLOT, dispatch)

  client.on('inputChange', (data: { pin: number; state: boolean }) => {
    lastInputs = [...lastInputs]
    lastInputs[data.pin - 1] = data.state
    pushToPanel({ type: 'inputs', values: lastInputs })
  })

  client.on('uartData', (data: { channel: number; payload: string }) => {
    uartHistory.push(data.channel, data.payload)
    uartThrottle!.push(data.channel, data.payload)
  })

  client.on('statusUpdate', (status: string) => {
    lastStatus = status
    pushToPanel({ type: 'connectionState', state: 'connected', deviceStatus: status })
  })

  client.on('close', () => {
    lastStatus = null
    pushToPanel({ type: 'connectionState', state: 'disconnected', deviceStatus: 'CONNECTION_LOST' })
  })

  await ctx.window.showMessage('Remote IO plugin activated')
}

export async function deactivate(): Promise<void> {
  client.disconnect()
  uartThrottle?.dispose()
  uartThrottle = null
  uartHistory.clear()
  ctxRef = null
}
