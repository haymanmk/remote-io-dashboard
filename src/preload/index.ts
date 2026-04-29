import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export type RemoteIOEvent =
  | { type: 'input-change'; pin: number; state: boolean }
  | { type: 'uart-data'; channel: number; payload: string }
  | { type: 'status-update'; status: string }
  | { type: 'connected'; inputs: boolean[]; outputs: boolean[]; status: string }
  | { type: 'disconnected' }
  | { type: 'config-changed'; config: { host: string; portOffset: number; autoConnect: boolean } }

export interface ConnectResult {
  ok: boolean
  inputs?: boolean[]
  outputs?: boolean[]
  status?: string
  error?: string
}

export interface CommandResult {
  ok: boolean
  reply?: {
    kind: string
    id?: number
    variant?: number | null
    values?: string[]
  }
  error?: string
}

export interface BackgroundState {
  connected: boolean
  status: string | null
  inputs: boolean[]
  outputs: boolean[]
}

export interface AppConfig {
  host: string
  portOffset: number
  autoConnect: boolean
}

contextBridge.exposeInMainWorld('remoteio', {
  connect(host: string, portOffset: number): Promise<ConnectResult> {
    return ipcRenderer.invoke('remoteio:connect', host, portOffset)
  },

  disconnect(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke('remoteio:disconnect')
  },

  command(
    type: 'R' | 'W',
    id: number,
    variant: number | null,
    params: (string | number)[],
  ): Promise<CommandResult> {
    return ipcRenderer.invoke('remoteio:command', { type, id, variant, params })
  },

  subscribeInputs(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke('remoteio:subscribe-inputs')
  },

  unsubscribeInputs(): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke('remoteio:unsubscribe-inputs')
  },

  getBackgroundState(): Promise<BackgroundState> {
    return ipcRenderer.invoke('remoteio:get-background-state')
  },

  getConfig(): Promise<AppConfig> {
    return ipcRenderer.invoke('remoteio:get-config')
  },

  setAutoConnect(enabled: boolean): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke('remoteio:set-auto-connect', enabled)
  },

  dismissAlert(status: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke('remoteio:dismiss-alert', status)
  },

  testAlert(status: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke('remoteio:test-alert', status)
  },

  on(cb: (event: RemoteIOEvent) => void): () => void {
    const handler = (_evt: IpcRendererEvent, data: RemoteIOEvent) => cb(data)
    ipcRenderer.on('remoteio:event', handler)
    return () => ipcRenderer.removeListener('remoteio:event', handler)
  },

  onAlertStatus(cb: (status: string) => void): () => void {
    const handler = (_evt: IpcRendererEvent, status: string) => cb(status)
    ipcRenderer.on('remoteio:alert-status', handler)
    return () => ipcRenderer.removeListener('remoteio:alert-status', handler)
  },
})
