import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UartThrottle } from './uart-throttle.js'

describe('UartThrottle', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(()  => { vi.useRealTimers() })

  it('emits a single batch per channel within a window', () => {
    const flushed: Array<{ channel: number; data: string }> = []
    const t = new UartThrottle(50, (channel, data) => { flushed.push({ channel, data }) })
    t.push(0, 'he')
    t.push(0, 'llo')
    expect(flushed).toEqual([])     // not yet flushed
    vi.advanceTimersByTime(50)
    expect(flushed).toEqual([{ channel: 0, data: 'hello' }])
  })

  it('keeps channels independent', () => {
    const flushed: Array<{ channel: number; data: string }> = []
    const t = new UartThrottle(50, (channel, data) => { flushed.push({ channel, data }) })
    t.push(0, 'A')
    t.push(1, 'B')
    vi.advanceTimersByTime(50)
    expect(flushed).toEqual([
      { channel: 0, data: 'A' },
      { channel: 1, data: 'B' },
    ])
  })

  it('starts a fresh window after flush', () => {
    const flushed: Array<{ channel: number; data: string }> = []
    const t = new UartThrottle(50, (channel, data) => { flushed.push({ channel, data }) })
    t.push(0, 'A')
    vi.advanceTimersByTime(50)
    t.push(0, 'B')
    vi.advanceTimersByTime(50)
    expect(flushed).toEqual([
      { channel: 0, data: 'A' },
      { channel: 0, data: 'B' },
    ])
  })

  it('dispose clears pending timers without emitting', () => {
    const flushed: Array<{ channel: number; data: string }> = []
    const t = new UartThrottle(50, (channel, data) => { flushed.push({ channel, data }) })
    t.push(0, 'pending')
    t.dispose()
    vi.advanceTimersByTime(100)
    expect(flushed).toEqual([])
  })
})
