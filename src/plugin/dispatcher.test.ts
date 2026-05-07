import { describe, it, expect, vi } from 'vitest'
import { createDispatcher, type DispatcherDeps } from './dispatcher.js'
import type { ParsedReply } from './protocol.js'

function makeDeps(overrides: Partial<DispatcherDeps> = {}): DispatcherDeps {
  return {
    sendCommand: vi.fn(async () => ({ kind: 'write', id: 0 } as ParsedReply)),
    isConnected: () => true,
    snapshot: () => ({
      connection: 'connected',
      deviceStatus: 'OK',
      inputs:  Array<boolean>(16).fill(false),
      outputs: Array<boolean>(16).fill(false),
      leds: Array.from({ length: 25 }, () => ({ r: 0, g: 0, b: 0 })),
      uart: { 0: [], 1: [] },
    }),
    ...overrides,
  }
}

describe('createDispatcher', () => {
  it('getSnapshot returns the snapshot regardless of connection state', async () => {
    const deps = makeDeps({ isConnected: () => false })
    const dispatch = createDispatcher(deps)
    const reply = await dispatch({ type: 'getSnapshot' })
    expect(reply).toMatchObject({ connection: 'connected' /* whatever snapshot says */ })
  })

  it('setOutput issues W4 with index+value when connected', async () => {
    const send = vi.fn(async () => ({ kind: 'write', id: 4 } as ParsedReply))
    const dispatch = createDispatcher(makeDeps({ sendCommand: send }))
    const reply = await dispatch({ type: 'setOutput', index: 3, value: 1 })
    expect(send).toHaveBeenCalledWith('W', 4, null, 3, 1)
    expect(reply).toEqual({ ok: true })
  })

  it('setOutput rejects with {error} when disconnected', async () => {
    const send = vi.fn()
    const dispatch = createDispatcher(makeDeps({ isConnected: () => false, sendCommand: send }))
    const reply = await dispatch({ type: 'setOutput', index: 3, value: 1 })
    expect(send).not.toHaveBeenCalled()
    expect(reply).toEqual({ error: 'not connected' })
  })

  it('subscribeInputs issues W5 with all 16 pins', async () => {
    const send = vi.fn(async () => ({ kind: 'write', id: 5 } as ParsedReply))
    const dispatch = createDispatcher(makeDeps({ sendCommand: send }))
    await dispatch({ type: 'subscribeInputs' })
    expect(send).toHaveBeenCalledWith('W', 5, null,
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    )
  })

  it('unsubscribeInputs issues W6 with all 16 pins', async () => {
    const send = vi.fn(async () => ({ kind: 'write', id: 6 } as ParsedReply))
    const dispatch = createDispatcher(makeDeps({ sendCommand: send }))
    await dispatch({ type: 'unsubscribeInputs' })
    expect(send).toHaveBeenCalledWith('W', 6, null,
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    )
  })

  it('uartSend issues W7.<channel> <length> <data> matching firmware framing', async () => {
    const send = vi.fn(async () => ({ kind: 'write', id: 7 } as ParsedReply))
    const dispatch = createDispatcher(makeDeps({ sendCommand: send }))
    await dispatch({ type: 'uartSend', channel: 1, data: 'hello' })
    expect(send).toHaveBeenCalledWith('W', 7, 1, 5, 'hello')
  })

  it('setLed issues W8 with index, r, g, b', async () => {
    const send = vi.fn(async () => ({ kind: 'write', id: 8 } as ParsedReply))
    const dispatch = createDispatcher(makeDeps({ sendCommand: send }))
    await dispatch({ type: 'setLed', index: 0, r: 255, g: 64, b: 0 })
    expect(send).toHaveBeenCalledWith('W', 8, null, 0, 255, 64, 0)
  })

  it('unknown type returns an error envelope', async () => {
    const dispatch = createDispatcher(makeDeps())
    const reply = await dispatch({ type: 'whoops' } as any)
    expect(reply).toEqual({ error: 'unknown type: whoops' })
  })

  it('command failures surface as {error: <message>}', async () => {
    const send = vi.fn(async () => { throw new Error('Device error ERR221') })
    const dispatch = createDispatcher(makeDeps({ sendCommand: send }))
    const reply = await dispatch({ type: 'setOutput', index: 0, value: 1 })
    expect(reply).toEqual({ error: 'Device error ERR221' })
  })
})
