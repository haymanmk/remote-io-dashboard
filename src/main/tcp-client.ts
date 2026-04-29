import net from 'node:net'
import { EventEmitter } from 'node:events'
import {
  buildCommand,
  expectedReplyPrefix,
  parseReply,
  type CommandType,
  type ParsedReply,
} from './protocol.js'

interface Pending {
  prefix: string
  resolve: (reply: ParsedReply) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface Queued {
  cmd: string
  prefix: string
  resolve: (reply: ParsedReply) => void
  reject: (err: Error) => void
}

const COMMAND_TIMEOUT_MS = 5_000
const KEEPALIVE_INTERVAL_MS = 5_000

export class RemoteIOClient extends EventEmitter {
  private socket: net.Socket | null = null
  private buffer = ''
  private pending: Pending | null = null
  private queue: Queued[] = []
  private _connected = false
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null

  get connected(): boolean {
    return this._connected
  }

  connect(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket) this.destroySocket()

      const sock = new net.Socket()
      this.socket = sock

      sock.setTimeout(10_000)

      sock.on('data', (chunk: Buffer) => this.onData(chunk))
      sock.on('close', () => this.onClose())
      sock.on('error', (err) => {
        if (!this._connected) {
          reject(err)
        } else {
          this.emit('error', err)
        }
      })
      sock.on('timeout', () => sock.destroy(new Error('Connection timed out')))

      sock.connect({ host, port }, () => {
        sock.setTimeout(0)
        sock.setKeepAlive(true, 5_000)
        this._connected = true
        this.startKeepalive()
        resolve()
      })
    })
  }

  disconnect(): void {
    this.destroySocket()
  }

  sendCommand(
    type: CommandType,
    id: number,
    variant: number | null,
    ...params: (string | number)[]
  ): Promise<ParsedReply> {
    if (!this.socket || !this._connected) {
      return Promise.reject(new Error('Not connected'))
    }

    const cmd = buildCommand(type, id, variant, ...params)
    const prefix = expectedReplyPrefix(type, id, variant)

    return new Promise<ParsedReply>((resolve, reject) => {
      this.queue.push({ cmd, prefix, resolve, reject })
      this.drainQueue()
    })
  }

  // Send the next queued command if nothing is currently in-flight.
  private drainQueue(): void {
    if (this.pending || this.queue.length === 0) return
    const { cmd, prefix, resolve, reject } = this.queue.shift()!

    const timer = setTimeout(() => {
      this.pending = null
      reject(new Error(`Command "${cmd.trim()}" timed out after ${COMMAND_TIMEOUT_MS}ms`))
      this.drainQueue()
    }, COMMAND_TIMEOUT_MS)

    this.pending = { prefix, resolve, reject, timer }
    this.socket!.write(cmd)
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('ascii')
    const lines = this.buffer.split('\r\n')
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.length > 0) this.handleLine(line)
    }
  }

  private handleLine(line: string): void {
    const reply = parseReply(line)

    if (reply.kind === 'event-input') {
      this.emit('inputChange', { pin: reply.pin, state: reply.state })
      return
    }

    if (reply.kind === 'event-uart') {
      this.emit('uartData', { channel: reply.channel, payload: reply.payload })
      return
    }

    if (!this.pending) return

    if (reply.kind === 'error') {
      const { reject, timer } = this.pending
      clearTimeout(timer)
      this.pending = null
      reject(new Error(`Device error ERR${reply.code}`))
      this.drainQueue()
      return
    }

    if (line.startsWith(this.pending.prefix + ' ') || line === this.pending.prefix) {
      const { resolve, timer } = this.pending
      clearTimeout(timer)
      this.pending = null
      resolve(reply)
      this.drainQueue()
    }
  }

  private onClose(): void {
    this.stopKeepalive()
    this._connected = false
    if (this.pending) {
      clearTimeout(this.pending.timer)
      const { reject } = this.pending
      this.pending = null
      reject(new Error('Connection closed'))
    }
    for (const { reject } of this.queue.splice(0)) reject(new Error('Connection closed'))
    this.emit('close')
  }

  private destroySocket(): void {
    this.stopKeepalive()
    if (this.pending) {
      clearTimeout(this.pending.timer)
      const { reject } = this.pending
      this.pending = null
      reject(new Error('Disconnected'))
    }
    for (const { reject } of this.queue.splice(0)) reject(new Error('Disconnected'))
    this.socket?.destroy()
    this.socket = null
    this._connected = false
  }

  private startKeepalive(): void {
    this.stopKeepalive()
    this.keepaliveTimer = setInterval(() => {
      // Skip if busy — an in-flight command already proves the link is alive
      if (!this._connected || this.pending || this.queue.length > 0) return
      this.sendCommand('R', 1, null).then((reply) => {
        if (reply.kind === 'read') this.emit('statusUpdate', reply.values[0] ?? '')
      }).catch(() => {
        if (this._connected) this.destroySocket()
      })
    }, KEEPALIVE_INTERVAL_MS)
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer !== null) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
  }
}
