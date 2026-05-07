type Flush = (channel: number, data: string) => void

export class UartThrottle {
  private buffers = new Map<number, string>()
  private timers  = new Map<number, ReturnType<typeof setTimeout>>()

  constructor(private readonly windowMs: number, private readonly onFlush: Flush) {}

  push(channel: number, data: string): void {
    this.buffers.set(channel, (this.buffers.get(channel) ?? '') + data)
    if (this.timers.has(channel)) return
    this.timers.set(channel, setTimeout(() => this.flush(channel), this.windowMs))
  }

  private flush(channel: number): void {
    const data = this.buffers.get(channel)
    this.buffers.delete(channel)
    this.timers.delete(channel)
    if (data !== undefined) this.onFlush(channel, data)
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
    this.buffers.clear()
  }
}
