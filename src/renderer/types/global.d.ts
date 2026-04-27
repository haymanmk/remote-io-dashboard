export type RemoteIOEvent =
  | { type: 'input-change'; pin: number; state: boolean }
  | { type: 'uart-data'; channel: number; payload: string }
  | { type: 'disconnected' }
  | { type: 'config-changed'; config: { host: string; portOffset: number } }

export interface ConnectResult {
  ok: boolean
  inputs?: boolean[]
  outputs?: boolean[]
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
      on(cb: (event: RemoteIOEvent) => void): () => void
    }
  }
}
