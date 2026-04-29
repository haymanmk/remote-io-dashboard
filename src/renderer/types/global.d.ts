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

declare global {
  interface Window {
    remoteio: {
      connect(host: string, portOffset: number): Promise<ConnectResult>
      disconnect(): Promise<{ ok: boolean }>
      command(
        type: 'R' | 'W',
        id: number,
        variant: number | null,
        params: (string | number)[],
      ): Promise<CommandResult>
      subscribeInputs(): Promise<{ ok: boolean }>
      unsubscribeInputs(): Promise<{ ok: boolean }>
      getBackgroundState(): Promise<BackgroundState>
      getConfig(): Promise<AppConfig>
      setAutoConnect(enabled: boolean): Promise<{ ok: boolean }>
      dismissAlert(status: string): Promise<{ ok: boolean }>
      testAlert(status: string): Promise<{ ok: boolean }>
      on(cb: (event: RemoteIOEvent) => void): () => void
      onAlertStatus(cb: (status: string) => void): () => void
    }
  }
}
