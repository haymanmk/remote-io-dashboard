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

const COMMAND_TIMEOUT_MS = 5_000

export class RemoteIOClient extends EventEmitter {
  private socket: net.Socket | null = null
  private buffer = ''
  private pending: Pending | null = null
  private _connected = false

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
        this._connected = true
        resolve()
      })
    })
  }

  disconnect(): void {
    this.destroySocket()
  }

  async sendCommand(
    type: CommandType,
    id: number,
    variant: number | null,
    ...params: (string | number)[]
  ): Promise<ParsedReply> {
    if (!this.socket || !this._connected) {
      throw new Error('Not connected')
    }
    if (this.pending) {
      throw new Error('Another command is already in flight')
    }

    const cmd = buildCommand(type, id, variant, ...params)
    const prefix = expectedReplyPrefix(type, id, variant)

    return new Promise<ParsedReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null
        reject(new Error(`Command "${cmd.trim()}" timed out after ${COMMAND_TIMEOUT_MS}ms`))
      }, COMMAND_TIMEOUT_MS)

      this.pending = {
        prefix,
        resolve: (reply) => { clearTimeout(timer); resolve(reply) },
        reject: (err)  => { clearTimeout(timer); reject(err) },
        timer,
      }

      this.socket!.write(cmd)
    })
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
      const { reject } = this.pending
      this.pending = null
      reject(new Error(`Device error ERR${reply.code}`))
      return
    }

    if (line.startsWith(this.pending.prefix + ' ') || line === this.pending.prefix) {
      const { resolve } = this.pending
      this.pending = null
      resolve(reply)
    }
  }

  private onClose(): void {
    this._connected = false
    if (this.pending) {
      const { reject } = this.pending
      this.pending = null
      reject(new Error('Connection closed'))
    }
    this.emit('close')
  }

  private destroySocket(): void {
    if (this.pending) {
      clearTimeout(this.pending.timer)
      this.pending.reject(new Error('Disconnected'))
      this.pending = null
    }
    this.socket?.destroy()
    this.socket = null
    this._connected = false
  }
}
