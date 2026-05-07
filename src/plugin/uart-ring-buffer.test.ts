import { describe, it, expect } from 'vitest'
import { UartRingBuffer } from './uart-ring-buffer.js'

describe('UartRingBuffer', () => {
  it('stores up to capacity per channel', () => {
    const rb = new UartRingBuffer(3)
    rb.push(0, 'a'); rb.push(0, 'b'); rb.push(0, 'c')
    expect(rb.snapshot(0)).toEqual(['a', 'b', 'c'])
  })

  it('drops oldest when over capacity', () => {
    const rb = new UartRingBuffer(3)
    rb.push(0, 'a'); rb.push(0, 'b'); rb.push(0, 'c'); rb.push(0, 'd')
    expect(rb.snapshot(0)).toEqual(['b', 'c', 'd'])
  })

  it('keeps channels independent', () => {
    const rb = new UartRingBuffer(2)
    rb.push(0, 'a'); rb.push(1, 'x'); rb.push(0, 'b'); rb.push(1, 'y')
    expect(rb.snapshot(0)).toEqual(['a', 'b'])
    expect(rb.snapshot(1)).toEqual(['x', 'y'])
  })

  it('snapshot returns a copy (mutation does not affect the buffer)', () => {
    const rb = new UartRingBuffer(3)
    rb.push(0, 'a')
    const snap = rb.snapshot(0)
    snap.push('mutated')
    expect(rb.snapshot(0)).toEqual(['a'])
  })

  it('returns empty array for unknown channel', () => {
    const rb = new UartRingBuffer(3)
    expect(rb.snapshot(0)).toEqual([])
  })
})
