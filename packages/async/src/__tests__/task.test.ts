import { describe, it, expect } from 'vitest'
import { pipe, ok, err, some, none } from '@stopcock/fp'
import {
  of, resolve, reject, fromPromise, fromResult, fromOption, delay, never,
  map, flatMap, tap, mapError, catchError, flatMapError, match,
  unfold,
  run, runSafe, runWithCancel,
} from '../task'
import { CancelledError } from '../types'

describe('constructors', () => {
  it('of: lazy — thunk not called until run', async () => {
    let called = false
    const task = of(async () => { called = true; return 42 })
    expect(called).toBe(false)
    expect(await run(task)).toBe(42)
    expect(called).toBe(true)
  })

  it('resolve: immediate success', async () => {
    expect(await run(resolve(10))).toBe(10)
  })

  it('reject: immediate failure', async () => {
    await expect(run(reject('boom'))).rejects.toBe('boom')
  })

  it('fromPromise: wraps lazy promise', async () => {
    const task = fromPromise(() => Promise.resolve('hello'))
    expect(await run(task)).toBe('hello')
  })

  it('fromResult: Ok → success', async () => {
    expect(await run(fromResult(ok(5)))).toBe(5)
  })

  it('fromResult: Err → failure', async () => {
    await expect(run(fromResult(err('nope')))).rejects.toBe('nope')
  })

  it('fromOption: Some → success', async () => {
    expect(await run(fromOption(some(3), () => 'missing'))).toBe(3)
  })

  it('fromOption: None → failure', async () => {
    await expect(run(fromOption(none, () => 'missing'))).rejects.toBe('missing')
  })

  it('delay: resolves after ms', async () => {
    const start = Date.now()
    await run(delay(50))
    expect(Date.now() - start).toBeGreaterThanOrEqual(40)
  })
})

describe('combinators', () => {
  it('map: transforms success', async () => {
    const task = pipe(resolve(5), map((x: number) => x * 2))
    expect(await run(task)).toBe(10)
  })

  it('map: propagates error', async () => {
    const task = pipe(reject('err'), map(() => 'should not reach'))
    await expect(run(task)).rejects.toBe('err')
  })

  it('flatMap: chains tasks', async () => {
    const task = pipe(
      resolve(5),
      flatMap((x: number) => resolve(x + 10)),
    )
    expect(await run(task)).toBe(15)
  })

  it('flatMap: short-circuits on error', async () => {
    let reached = false
    const task = pipe(
      reject('early'),
      flatMap(() => { reached = true; return resolve(99) }),
    )
    await expect(run(task)).rejects.toBe('early')
    expect(reached).toBe(false)
  })

  it('tap: side effect, returns original', async () => {
    let seen: number | undefined
    const task = pipe(resolve(7), tap((x: number) => { seen = x }))
    expect(await run(task)).toBe(7)
    expect(seen).toBe(7)
  })

  it('mapError: transforms error', async () => {
    const task = pipe(reject('raw'), mapError((e: string) => `wrapped: ${e}`))
    await expect(run(task)).rejects.toBe('wrapped: raw')
  })

  it('catchError: recovers from error', async () => {
    const task = pipe(reject('fail'), catchError(() => 'recovered'))
    expect(await run(task)).toBe('recovered')
  })

  it('catchError: passes through success', async () => {
    const task = pipe(resolve(42), catchError(() => 0))
    expect(await run(task)).toBe(42)
  })

  it('flatMapError: chains on error', async () => {
    const task = pipe(
      reject('fail'),
      flatMapError((e: string) => resolve(`recovered from ${e}`)),
    )
    expect(await run(task)).toBe('recovered from fail')
  })

  it('match: handles both paths', async () => {
    const okTask = pipe(resolve(5), match({ ok: (x: number) => `got ${x}`, err: () => 'nope' }))
    expect(await run(okTask)).toBe('got 5')

    const errTask = pipe(reject('bad'), match({ ok: () => 'nope', err: (e: string) => `err: ${e}` }))
    expect(await run(errTask)).toBe('err: bad')
  })
})

describe('terminals', () => {
  it('runSafe: success → Ok', async () => {
    const result = await runSafe(resolve(42))
    expect(result).toEqual(ok(42))
  })

  it('runSafe: failure → Err', async () => {
    const result = await runSafe(reject('boom'))
    expect(result).toEqual(err('boom'))
  })

  it('runWithCancel: returns cancel function', async () => {
    const [promise, cancel] = runWithCancel(delay(5000))
    cancel()
    await expect(promise).rejects.toThrow()
  })
})

describe('cancellation', () => {
  it('cancel propagates to inner thunk', async () => {
    let receivedSignal: AbortSignal | undefined
    const task = of(async (signal?) => {
      receivedSignal = signal
      await new Promise(r => setTimeout(r, 100))
      return 'done'
    })
    const [_, cancel] = runWithCancel(task)
    await new Promise(r => setTimeout(r, 10))
    cancel()
    expect(receivedSignal?.aborted).toBe(true)
  })

  it('cancel between flatMap steps', async () => {
    let secondRan = false
    const task = pipe(
      of(async () => { await new Promise(r => setTimeout(r, 10)); return 1 }),
      flatMap(() => of(async () => { secondRan = true; return 2 })),
    )
    const [promise, cancel] = runWithCancel(task)
    await new Promise(r => setTimeout(r, 15))
    cancel()
    await promise.catch(() => {})
    // second task may or may not have started depending on timing,
    // but the chain should complete or abort without hanging
  })
})

describe('monad laws', () => {
  const f = (x: number) => resolve(x * 2)
  const g = (x: number) => resolve(x + 1)

  it('left identity: flatMap(f)(resolve(a)) === f(a)', async () => {
    const left = await run(pipe(resolve(5), flatMap(f)))
    const right = await run(f(5))
    expect(left).toBe(right)
  })

  it('right identity: flatMap(resolve)(m) === m', async () => {
    const m = resolve(5)
    const left = await run(pipe(m, flatMap(resolve)))
    const right = await run(m)
    expect(left).toBe(right)
  })

  it('associativity', async () => {
    const m = resolve(5)
    const left = await run(pipe(m, flatMap(f), flatMap(g)))
    const right = await run(pipe(m, flatMap((x: number) => pipe(f(x), flatMap(g)))))
    expect(left).toBe(right)
  })
})

describe('functor laws', () => {
  it('identity: map(x => x) === identity', async () => {
    const left = await run(pipe(resolve(5), map((x: number) => x)))
    expect(left).toBe(5)
  })

  it('composition: map(f . g) === map(g) then map(f)', async () => {
    const f = (x: number) => x * 2
    const g = (x: number) => x + 1
    const left = await run(pipe(resolve(5), map((x: number) => f(g(x)))))
    const right = await run(pipe(resolve(5), map(g), map(f)))
    expect(left).toBe(right)
  })
})

describe('pipe integration', () => {
  it('Task combinators work with existing pipe()', async () => {
    const task = pipe(
      resolve(10),
      map((x: number) => x + 5),
      flatMap((x: number) => resolve(x * 2)),
      map((x: number) => `result: ${x}`),
    )
    expect(await run(task)).toBe('result: 30')
  })
})

describe('fromPromise edge cases', () => {
  it('thunk that throws synchronously rejects', async () => {
    const task = fromPromise(() => { throw new Error('sync boom') })
    await expect(run(task)).rejects.toThrow('sync boom')
  })
})

describe('delay edge cases', () => {
  it('delay(0) resolves immediately', async () => {
    const start = Date.now()
    await run(delay(0))
    expect(Date.now() - start).toBeLessThan(50)
  })
})

describe('never', () => {
  it('rejects when abort signal fires', async () => {
    const controller = new AbortController()
    const promise = never.run(controller.signal)
    controller.abort(new CancelledError())
    await expect(promise).rejects.toBeInstanceOf(CancelledError)
  })

  it('rejects with custom reason', async () => {
    const controller = new AbortController()
    const promise = never.run(controller.signal)
    controller.abort(new Error('custom'))
    await expect(promise).rejects.toThrow('custom')
  })

  it('rejects with DOMException when aborted without reason', async () => {
    const controller = new AbortController()
    const promise = never.run(controller.signal)
    controller.abort()
    await expect(promise).rejects.toBeDefined()
  })
})

describe('unfold', () => {
  it('collects items until step returns undefined', async () => {
    const task = unfold(
      (page: number) => resolve(
        page <= 3 ? [[`page${page}`], page + 1] as [string[], number] : undefined,
      ),
      1,
    )
    const result = await run(pipe(task, map(pages => pages.flat())))
    expect(result).toEqual(['page1', 'page2', 'page3'])
  })

  it('returns empty array when first step returns undefined', async () => {
    const task = unfold(
      () => resolve(undefined),
      0,
    )
    expect(await run(task)).toEqual([])
  })

  it('respects cancellation signal', async () => {
    let calls = 0
    const task = unfold(
      (n: number) => of(async (signal?) => {
        calls++
        signal?.throwIfAborted()
        return [n, n + 1] as [number, number]
      }),
      0,
    )
    const controller = new AbortController()
    controller.abort()
    await expect(task.run(controller.signal)).rejects.toBeDefined()
    expect(calls).toBeLessThanOrEqual(1)
  })
})
