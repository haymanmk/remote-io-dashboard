export class UartRingBuffer {
  private buffers = new Map<number, string[]>()

  constructor(private readonly capacity: number) {}

  push(channel: number, line: string): void {
    let buf = this.buffers.get(channel)
    if (!buf) { buf = []; this.buffers.set(channel, buf) }
    buf.push(line)
    if (buf.length > this.capacity) buf.splice(0, buf.length - this.capacity)
  }

  snapshot(channel: number): string[] {
    return [...(this.buffers.get(channel) ?? [])]
  }

  clear(): void {
    this.buffers.clear()
  }
}
