import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { RemoteIOClient } from './tcp-client.js'
import { startSettingsServer, type DeviceConfig } from './settings-server.js'
import { parseBitfield } from './protocol.js'

let mainWindow: BrowserWindow | null = null

const client = new RemoteIOClient()

const config: DeviceConfig = {
  host: '192.168.1.10',
  portOffset: 0,
}

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

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('remoteio:connect', async (_evt, host: string, portOffset: number) => {
  try {
    const port = 8500 + portOffset
    config.host = host
    config.portOffset = portOffset
    await client.connect(host, port)
    // Read initial state BEFORE subscribing so S5 events can only arrive after CONNECTED is dispatched
    const inputReply = await client.sendCommand('R', 3, null, -1)
    const inputs = inputReply.kind === 'read' ? parseBitfield(inputReply.values) : Array(16).fill(false) as boolean[]
    const outputReply = await client.sendCommand('R', 4, null, -1)
    const outputs = outputReply.kind === 'read' ? parseBitfield(outputReply.values) : Array(16).fill(false) as boolean[]
    // Subscribe all 16 inputs for async S5 notifications (last, after initial state is captured)
    await client.sendCommand('W', 5, null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)
    // Read initial device status
    const statusReply = await client.sendCommand('R', 1, null)
    const status = statusReply.kind === 'read' ? (statusReply.values[0] ?? '') : ''
    return { ok: true, inputs, outputs, status }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('remoteio:disconnect', async () => {
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

// ---------------------------------------------------------------------------
// Forward TCP async events to renderer
// ---------------------------------------------------------------------------

client.on('inputChange', (data: { pin: number; state: boolean }) => {
  mainWindow?.webContents.send('remoteio:event', { type: 'input-change', pin: data.pin, state: data.state })
})

client.on('uartData', (data: { channel: number; payload: string }) => {
  mainWindow?.webContents.send('remoteio:event', { type: 'uart-data', channel: data.channel, payload: data.payload })
})

client.on('statusUpdate', (status: string) => {
  mainWindow?.webContents.send('remoteio:event', { type: 'status-update', status })
})

client.on('close', () => {
  mainWindow?.webContents.send('remoteio:event', { type: 'disconnected' })
})

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  createWindow()

  // Start HTTP settings server for NodalCore integration
  const settingsPort = await startSettingsServer(config, async (partial) => {
    // If host/port changed while connected, reconnect
    if (client.connected) {
      try {
        await client.connect(config.host, 8500 + config.portOffset)
        mainWindow?.webContents.send('remoteio:event', { type: 'config-changed', config })
      } catch (_err) {
        // reconnect failure is surfaced via 'close' event
      }
    }
  })

  // Signal NodalCore (or any parent process) that we are ready
  process.stdout.write(`NODALCORE_READY ${settingsPort}\n`)
})

app.on('window-all-closed', () => {
  client.disconnect()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
