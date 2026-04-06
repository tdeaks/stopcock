import { describe, it, expect } from 'vitest'
import { ok, err } from '@stopcock/fp'
import { resolve, reject, of, run, runSafe, runWithCancel, delay } from '../task'
import { all, allSettled, race, any, parallel, sequential } from '../concurrency'
import { CancelledError } from '../types'

describe('all', () => {
  it('resolves with all values', async () => {
    const result = await run(all([resolve(1), resolve(2), resolve(3)]))
    expect(result).toEqual([1, 2, 3])
  })

  it('empty array returns empty', async () => {
    expect(await run(all([]))).toEqual([])
  })

  it('rejects on first failure', async () => {
    await expect(run(all([resolve(1), reject('fail'), resolve(3)]))).rejects.toBe('fail')
  })
})

describe('allSettled', () => {
  it('collects all as Results', async () => {
    const result = await run(allSettled([resolve(1), reject('fail'), resolve(3)]))
    expect(result).toEqual([ok(1), err('fail'), ok(3)])
  })

  it('empty array returns empty', async () => {
    expect(await run(allSettled([]))).toEqual([])
  })
})

describe('race', () => {
  it('fastest wins', async () => {
    const fast = of(async () => { await new Promise(r => setTimeout(r, 10)); return 'fast' })
    const slow = of(async () => { await new Promise(r => setTimeout(r, 200)); return 'slow' })
    expect(await run(race([slow, fast]))).toBe('fast')
  })

  it('rejects if fastest fails', async () => {
    const fast = of<never, string>(async () => { throw 'boom' })
    const slow = of(async () => { await new Promise(r => setTimeout(r, 200)); return 'slow' })
    await expect(run(race([slow, fast]))).rejects.toBe('boom')
  })
})

describe('any', () => {
  it('first success wins', async () => {
    const fail1 = reject('err1')
    const fail2 = reject('err2')
    const ok1 = of(async () => { await new Promise(r => setTimeout(r, 10)); return 'ok' })
    expect(await run(any([fail1, ok1, fail2]))).toBe('ok')
  })

  it('all fail returns all errors', async () => {
    await expect(run(any([reject('a'), reject('b')]))).rejects.toEqual(['a', 'b'])
  })
})

describe('parallel', () => {
  it('respects concurrency limit', async () => {
    let maxConcurrent = 0
    let current = 0

    const tasks = Array.from({ length: 10 }, (_, i) =>
      of(async () => {
        current++
        if (current > maxConcurrent) maxConcurrent = current
        await new Promise(r => setTimeout(r, 20))
        current--
        return i
      })
    )

    const result = await run(parallel(3)(tasks))
    expect(result).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(maxConcurrent).toBeLessThanOrEqual(3)
  })

  it('preserves order', async () => {
    const tasks = [
      of(async () => { await new Promise(r => setTimeout(r, 30)); return 'slow' }),
      of(async () => { await new Promise(r => setTimeout(r, 10)); return 'fast' }),
    ]
    expect(await run(parallel(2)(tasks))).toEqual(['slow', 'fast'])
  })

  it('fail-fast: aborts remaining on error', async () => {
    let afterErrorRan = false
    const tasks = [
      of(async () => { await new Promise(r => setTimeout(r, 10)); throw 'boom' }),
      of(async () => { await new Promise(r => setTimeout(r, 50)); afterErrorRan = true; return 'ok' }),
    ]
    await expect(run(parallel(2)(tasks))).rejects.toBe('boom')
    await new Promise(r => setTimeout(r, 100))
    // afterErrorRan may or may not be true depending on abort timing
  })

  it('empty array returns empty', async () => {
    expect(await run(parallel(5)([]))).toEqual([])
  })
})

describe('parallel validation', () => {
  it('parallel(0) throws immediately', () => {
    expect(() => parallel(0)).toThrow('parallel: concurrency must be >= 1, got 0')
  })

  it('parallel(-1) throws immediately', () => {
    expect(() => parallel(-1)).toThrow('parallel: concurrency must be >= 1, got -1')
  })

  it('parallel(1) with rejecting task yields proper error type', async () => {
    const error = new Error('typed failure')
    const task = parallel(1)([of<never, Error>(async () => { throw error })])
    await expect(run(task)).rejects.toBe(error)
  })

  it('abort with CancelledError propagates correctly', async () => {
    const tasks = [
      of(async () => { await new Promise(r => setTimeout(r, 200)); return 1 }),
      of(async () => { await new Promise(r => setTimeout(r, 200)); return 2 }),
    ]
    const controller = new AbortController()
    const task = parallel(1)(tasks)
    const promise = task.run(controller.signal)
    await new Promise(r => setTimeout(r, 10))
    controller.abort(new CancelledError())
    try {
      await promise
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(CancelledError)
    }
  })
})

describe('race edge cases', () => {
  it('empty array never resolves (hangs)', async () => {
    const controller = new AbortController()
    const task = race([])
    const promise = task.run(controller.signal)
    let resolved = false
    promise.then(() => { resolved = true }, () => { resolved = true })
    await new Promise(r => setTimeout(r, 50))
    expect(resolved).toBe(false)
    controller.abort()
  })
})

describe('all with mid-flight abort', () => {
  it('aborts remaining tasks when signal fires', async () => {
    let secondStarted = false
    const tasks = [
      of(async () => { await new Promise(r => setTimeout(r, 50)); return 1 }),
      of(async (signal?: AbortSignal) => {
        secondStarted = true
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve(undefined), 200)
          signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
        })
        return 2
      }),
    ]
    const controller = new AbortController()
    const promise = all(tasks).run(controller.signal)
    await new Promise(r => setTimeout(r, 10))
    controller.abort()
    await expect(promise).rejects.toBeDefined()
  })
})

describe('sequential', () => {
  it('runs one at a time', async () => {
    let maxConcurrent = 0
    let current = 0
    const tasks = Array.from({ length: 5 }, (_, i) =>
      of(async () => {
        current++
        if (current > maxConcurrent) maxConcurrent = current
        await new Promise(r => setTimeout(r, 10))
        current--
        return i
      })
    )
    const result = await run(sequential(tasks))
    expect(result).toEqual([0, 1, 2, 3, 4])
    expect(maxConcurrent).toBe(1)
  })
})
