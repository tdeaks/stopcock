import { describe, it, expect, vi } from 'vitest'
import { create } from '../index.js'
import { asyncAction } from '../async.js'

type State = { data: string | null; loading: boolean; error: string | null }

const initial = (): State => ({ data: null, loading: false, error: null })

describe('asyncAction', () => {
  it('runs onStart, onSuccess, onFinally in order', async () => {
    const store = create(initial())
    const action = asyncAction(store, {
      task: { run: async () => 'hello' },
      onStart: (s) => s.set(s => s.loading, true),
      onSuccess: (s, result) => s.set(s => s.data, result),
      onFinally: (s) => s.set(s => s.loading, false),
    })
    await action.result
    expect(store.get(s => s.data)).toBe('hello')
    expect(store.get(s => s.loading)).toBe(false)
  })

  it('calls onError on failure', async () => {
    const store = create(initial())
    const action = asyncAction(store, {
      task: { run: async () => { throw new Error('fail') } },
      onSuccess: () => {},
      onError: (s, err) => s.set(s => s.error, (err as Error).message),
      onFinally: (s) => s.set(s => s.loading, false),
    })
    await expect(action.result).rejects.toThrow('fail')
    expect(store.get(s => s.error)).toBe('fail')
  })

  it('abort() signals cancellation', async () => {
    const store = create(initial())
    let receivedSignal: AbortSignal | undefined
    const action = asyncAction(store, {
      task: {
        run: async (signal) => {
          receivedSignal = signal
          return new Promise((_, reject) => {
            signal?.addEventListener('abort', () => reject(new Error('aborted')))
          })
        },
      },
      onSuccess: () => {},
      onError: (s, err) => s.set(s => s.error, (err as Error).message),
    })
    action.abort()
    await expect(action.result).rejects.toThrow('aborted')
    expect(receivedSignal?.aborted).toBe(true)
  })

  it('onFinally runs on both success and failure', async () => {
    const finallyFn = vi.fn()
    const store = create(initial())

    const success = asyncAction(store, {
      task: { run: async () => 'ok' },
      onSuccess: () => {},
      onFinally: finallyFn,
    })
    await success.result
    expect(finallyFn).toHaveBeenCalledTimes(1)

    const fail = asyncAction(store, {
      task: { run: async () => { throw new Error('x') } },
      onSuccess: () => {},
      onFinally: finallyFn,
    })
    await expect(fail.result).rejects.toThrow()
    expect(finallyFn).toHaveBeenCalledTimes(2)
  })

  it('works without optional callbacks', async () => {
    const store = create(initial())
    const action = asyncAction(store, {
      task: { run: async () => 'data' },
      onSuccess: (s, result) => s.set(s => s.data, result),
    })
    await action.result
    expect(store.get(s => s.data)).toBe('data')
  })
})
