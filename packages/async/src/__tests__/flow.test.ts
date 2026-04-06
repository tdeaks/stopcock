import { describe, it, expect, vi } from 'vitest'
import { throttle, debounce, rateLimit } from '../flow'

describe('throttle', () => {
  it('calls immediately on first invocation', () => {
    const fn = vi.fn((x: number) => x * 2)
    const throttled = throttle(100, fn)
    expect(throttled(5)).toBe(10)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('suppresses calls within window', () => {
    const fn = vi.fn((x: number) => x)
    const throttled = throttle(100, fn)
    throttled(1)
    throttled(2)
    throttled(3)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('debounce', () => {
  it('delays execution', async () => {
    const fn = vi.fn()
    const debounced = debounce(50, fn)
    debounced()
    debounced()
    debounced()
    expect(fn).not.toHaveBeenCalled()
    await new Promise(r => setTimeout(r, 80))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancel stops pending call', async () => {
    const fn = vi.fn()
    const debounced = debounce(50, fn)
    debounced()
    debounced.cancel()
    await new Promise(r => setTimeout(r, 80))
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('rateLimit', () => {
  it('allows calls within budget', async () => {
    let calls = 0
    const limited = rateLimit(3, 1000, async () => { calls++; return calls })
    await Promise.all([limited(), limited(), limited()])
    expect(calls).toBe(3)
  })

  it('queues excess calls', async () => {
    let calls = 0
    const limited = rateLimit(2, 50, async () => { calls++; return calls })
    const results = Promise.all([limited(), limited(), limited()])
    // first 2 fire immediately, 3rd waits for refill
    await new Promise(r => setTimeout(r, 20))
    expect(calls).toBe(2)
    await results
    expect(calls).toBe(3)
  })
})
