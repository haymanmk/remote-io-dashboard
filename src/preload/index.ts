import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export type RemoteIOEvent =
  | { type: 'input-change'; pin: number; state: boolean }
  | { type: 'uart-data'; channel: number; payload: string }
  | { type: 'status-update'; status: string }
  | { type: 'disconnected' }
  | { type: 'config-changed'; config: { host: string; portOffset: number } }

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

  on(cb: (event: RemoteIOEvent) => void): () => void {
    const handler = (_evt: IpcRendererEvent, data: RemoteIOEvent) => cb(data)
    ipcRenderer.on('remoteio:event', handler)
    return () => ipcRenderer.removeListener('remoteio:event', handler)
  },
})
