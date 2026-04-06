import { describe, it, expect, vi } from 'vitest'
import { pipe } from '@stopcock/fp'
import { of, resolve, reject, run, runWithCancel } from '../task'
import { retry, timeout, fallback } from '../resilience'
import { TimeoutError } from '../types'

describe('retry', () => {
  it('succeeds on first attempt', async () => {
    const task = pipe(resolve(42), retry({ attempts: 3 }))
    expect(await run(task)).toBe(42)
  })

  it('succeeds on Nth attempt', async () => {
    let attempt = 0
    const task = retry({ attempts: 3, delay: 10 })(
      of(async () => {
        attempt++
        if (attempt < 3) throw 'not yet'
        return 'done'
      })
    )
    expect(await run(task)).toBe('done')
    expect(attempt).toBe(3)
  })

  it('exhausts retries and fails', async () => {
    let attempts = 0
    const task = retry({ attempts: 3, delay: 10 })(
      of(async () => { attempts++; throw 'always fails' })
    )
    await expect(run(task)).rejects.toBe('always fails')
    expect(attempts).toBe(3)
  })

  it('respects retryIf predicate', async () => {
    let attempts = 0
    const task = retry({
      attempts: 5,
      delay: 10,
      retryIf: (e) => e === 'retryable',
    })(
      of(async () => { attempts++; throw attempts === 1 ? 'retryable' : 'fatal' })
    )
    await expect(run(task)).rejects.toBe('fatal')
    expect(attempts).toBe(2)
  })

  it('cancellation stops retries', async () => {
    let attempts = 0
    const task = retry({ attempts: 10, delay: 50 })(
      of(async () => { attempts++; throw 'fail' })
    )
    const [promise, cancel] = runWithCancel(task)
    setTimeout(cancel, 80)
    await expect(promise).rejects.toThrow()
    expect(attempts).toBeLessThan(10)
  })
})

describe('timeout', () => {
  it('completes before timeout', async () => {
    const task = pipe(resolve(42), timeout(1000))
    expect(await run(task)).toBe(42)
  })

  it('rejects on timeout', async () => {
    const slow = of(async () => { await new Promise(r => setTimeout(r, 500)); return 'done' })
    const task = pipe(slow, timeout(30))
    await expect(run(task)).rejects.toBeInstanceOf(TimeoutError)
  })
})

describe('fallback', () => {
  it('returns primary when it succeeds', async () => {
    const task = pipe(resolve('primary'), fallback(resolve('backup')))
    expect(await run(task)).toBe('primary')
  })

  it('returns backup when primary fails', async () => {
    const task = pipe(reject('fail'), fallback(resolve('backup')))
    expect(await run(task)).toBe('backup')
  })

  it('data-first calling convention', async () => {
    const task = fallback(reject('fail'), resolve('backup'))
    expect(await run(task)).toBe('backup')
  })
})
