import { app, BrowserWindow, ipcMain, Tray, Menu, screen } from 'electron'
import path from 'node:path'
import { RemoteIOClient } from './tcp-client.js'
import { startSettingsServer, type DeviceConfig } from './settings-server.js'
import { parseBitfield } from './protocol.js'

// Required on Linux for transparent BrowserWindow to actually composite correctly
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals')
}

let mainWindow:  BrowserWindow | null = null
let alertWindow: BrowserWindow | null = null
let tray:        Tray          | null = null

const client = new RemoteIOClient()

const config: DeviceConfig = {
  host: '192.168.1.10',
  portOffset: 0,
  autoConnect: false,
}

// Background state tracked while window may be closed
let lastStatus:          string | null  = null
let lastInputs:          boolean[]      = Array<boolean>(16).fill(false)
let lastOutputs:         boolean[]      = Array<boolean>(16).fill(false)
let currentAlertStatus:  string | null  = null  // status shown in the alert window right now
let lastDismissedStatus: string | null  = null  // prevents re-showing the same dismissed status

// Auto-reconnect state
const AUTO_RECONNECT_DELAY_MS = 5_000
let autoConnectInFlight = false
let autoReconnectTimer: ReturnType<typeof setTimeout> | null = null

const CRITICAL_STATUSES = new Set([
  'UPDATE_AVAILABLE', 'UPDATING',
  'MENDER_DOWNLOADING', 'MENDER_INSTALLING', 'MENDER_REBOOTING',
  'ERROR',
])

// ---------------------------------------------------------------------------
// Window factories
// ---------------------------------------------------------------------------

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Remote IO Dashboard',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

function createAlertWindow(status: string): void {
  // Same status already on screen — don't duplicate
  if (currentAlertStatus === status) return

  // Window already open with a different status — push the new status and let React rerender
  if (alertWindow) {
    currentAlertStatus = status
    alertWindow.webContents.send('remoteio:alert-status', status)
    return
  }

  const { x, y, width, height } = screen.getPrimaryDisplay().workArea

  alertWindow = new BrowserWindow({
    x, y, width, height,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  currentAlertStatus = status

  const encodedStatus = encodeURIComponent(status)
  if (process.env['ELECTRON_RENDERER_URL']) {
    alertWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?alert=${encodedStatus}`)
  } else {
    alertWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      query: { alert: status },
    })
  }

  alertWindow.on('closed', () => {
    alertWindow = null
    currentAlertStatus = null
  })
}

// ---------------------------------------------------------------------------
// Connect helper — used by both the user-driven IPC handler and auto-connect
// ---------------------------------------------------------------------------

type ConnectOk    = { ok: true; inputs: boolean[]; outputs: boolean[]; status: string }
type ConnectFail  = { ok: false; error: string }
type ConnectResult = ConnectOk | ConnectFail

async function connectAndHydrate(): Promise<ConnectResult> {
  try {
    const port = 8500 + config.portOffset
    await client.connect(config.host, port)
    const inputReply  = await client.sendCommand('R', 3, null, -1)
    const inputs  = inputReply.kind  === 'read' ? parseBitfield(inputReply.values)  : Array(16).fill(false) as boolean[]
    const outputReply = await client.sendCommand('R', 4, null, -1)
    const outputs = outputReply.kind === 'read' ? parseBitfield(outputReply.values) : Array(16).fill(false) as boolean[]
    const statusReply = await client.sendCommand('R', 1, null)
    const status  = statusReply.kind === 'read' ? (statusReply.values[0] ?? '') : ''
    lastInputs  = inputs
    lastOutputs = outputs
    lastStatus  = status
    if (CRITICAL_STATUSES.has(status) && status !== lastDismissedStatus) {
      createAlertWindow(status)
    }
    return { ok: true, inputs, outputs, status }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

function cancelAutoReconnect(): void {
  if (autoReconnectTimer !== null) {
    clearTimeout(autoReconnectTimer)
    autoReconnectTimer = null
  }
}

function scheduleAutoReconnect(): void {
  if (!config.autoConnect || client.connected || autoConnectInFlight || autoReconnectTimer !== null) return
  autoReconnectTimer = setTimeout(() => {
    autoReconnectTimer = null
    void tryAutoConnect()
  }, AUTO_RECONNECT_DELAY_MS)
}

async function tryAutoConnect(): Promise<void> {
  if (!config.autoConnect || client.connected || autoConnectInFlight) return
  cancelAutoReconnect()
  autoConnectInFlight = true
  try {
    const result = await connectAndHydrate()
    if (result.ok) {
      mainWindow?.webContents.send('remoteio:event', {
        type: 'connected',
        inputs:  result.inputs,
        outputs: result.outputs,
        status:  result.status,
      })
    } else {
      scheduleAutoReconnect()
    }
  } finally {
    autoConnectInFlight = false
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('remoteio:connect', async (_evt, host: string, portOffset: number) => {
  // User took over — drop any pending auto-retry
  cancelAutoReconnect()
  config.host = host
  config.portOffset = portOffset
  return await connectAndHydrate()
})

ipcMain.handle('remoteio:disconnect', async () => {
  // User-initiated disconnect — also stop auto-reconnect chasing them
  cancelAutoReconnect()
  client.disconnect()
  return { ok: true }
})

ipcMain.handle('remoteio:command', async (
  _evt,
  args: { type: 'R' | 'W'; id: number; variant: number | null; params: (string | number)[] },
) => {
  try {
    const reply = await client.sendCommand(args.type, args.id, args.variant, ...args.params)
    return { ok: true, reply }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('remoteio:subscribe-inputs', async () => {
  try {
    await client.sendCommand('W', 5, null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('remoteio:unsubscribe-inputs', async () => {
  try {
    await client.sendCommand('W', 6, null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('remoteio:get-background-state', () => ({
  connected: client.connected,
  status:    lastStatus,
  inputs:    lastInputs,
  outputs:   lastOutputs,
}))

ipcMain.handle('remoteio:get-config', () => ({ ...config }))

ipcMain.handle('remoteio:set-auto-connect', (_evt, enabled: boolean) => {
  if (config.autoConnect === enabled) return { ok: true }
  config.autoConnect = enabled
  mainWindow?.webContents.send('remoteio:event', { type: 'config-changed', config: { ...config } })
  if (enabled) {
    if (!client.connected) void tryAutoConnect()
  } else {
    cancelAutoReconnect()
  }
  return { ok: true }
})

ipcMain.handle('remoteio:dismiss-alert', (_evt, status: string) => {
  lastDismissedStatus = status
  alertWindow?.close()
  return { ok: true }
})

// Dev-only: open alert window with an arbitrary status for UI testing
ipcMain.handle('remoteio:test-alert', (_evt, status: string) => {
  createAlertWindow(status)
  return { ok: true }
})

// ---------------------------------------------------------------------------
// Forward TCP async events to renderer
// ---------------------------------------------------------------------------

client.on('inputChange', (data: { pin: number; state: boolean }) => {
  lastInputs = [...lastInputs]
  lastInputs[data.pin - 1] = data.state
  mainWindow?.webContents.send('remoteio:event', { type: 'input-change', pin: data.pin, state: data.state })
})

client.on('uartData', (data: { channel: number; payload: string }) => {
  mainWindow?.webContents.send('remoteio:event', { type: 'uart-data', channel: data.channel, payload: data.payload })
})

client.on('statusUpdate', (status: string) => {
  lastStatus = status

  if (!CRITICAL_STATUSES.has(status)) {
    // Status returned to normal — reset dismiss memory and close any open alert
    lastDismissedStatus = null
    alertWindow?.close()
  } else if (status !== lastDismissedStatus) {
    createAlertWindow(status)
  }

  mainWindow?.webContents.send('remoteio:event', { type: 'status-update', status })
})

client.on('close', () => {
  lastStatus = null
  mainWindow?.webContents.send('remoteio:event', { type: 'disconnected' })
  scheduleAutoReconnect()
})

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  createWindow()

  // System tray for background operation
  const iconPath = path.join(__dirname, '../../resources/tray.png')
  tray = new Tray(iconPath)
  tray.setToolTip('Remote IO Dashboard')
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus() }
        else createWindow()
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { client.disconnect(); app.exit(0) } },
  ]))
  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus() }
    else createWindow()
  })

  const settingsPort = await startSettingsServer(config, async (partial) => {
    // Always notify the renderer so any in-app config UI stays in sync with host-side edits
    mainWindow?.webContents.send('remoteio:event', { type: 'config-changed', config: { ...config } })

    const endpointChanged = partial.host !== undefined || partial.portOffset !== undefined

    if (client.connected && endpointChanged) {
      try {
        await client.connect(config.host, 8500 + config.portOffset)
      } catch (_err) { /* surfaced via 'close' event */ }
      return
    }

    if (partial.autoConnect === false) {
      cancelAutoReconnect()
    } else if (config.autoConnect && !client.connected) {
      // Either autoConnect was just enabled, or endpoint changed while we were waiting to retry
      void tryAutoConnect()
    }
  })

  process.stdout.write(`NODALCORE_READY ${settingsPort}\n`)

  // Kick off auto-connect if it's already enabled at launch (e.g. host pre-populated config)
  if (config.autoConnect) void tryAutoConnect()
})

// Keep process alive when window closes — background worker continues TCP keepalive
app.on('window-all-closed', () => { /* intentionally empty */ })

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
