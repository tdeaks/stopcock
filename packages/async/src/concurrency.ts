import { ok, err, type Result } from '@stopcock/fp'
import type { Task } from './task'
import { of } from './task'
import { linkedController, Semaphore } from './internals'
import { CancelledError } from './types'

export const all = <A, E>(tasks: readonly Task<A, E>[]): Task<A[], E> =>
  of(async (signal?) => {
    if (tasks.length === 0) return []
    const linked = linkedController(signal)
    try {
      return await Promise.all(tasks.map(t => t.run(linked.signal)))
    } catch (e) {
      linked.abort()
      throw e
    }
  })

export const allSettled = <A, E>(tasks: readonly Task<A, E>[]): Task<Result<A, E>[], never> =>
  of(async (signal?) => {
    if (tasks.length === 0) return []
    const promises = tasks.map(t =>
      t.run(signal).then(
        (a): Result<A, E> => ok(a),
        (e): Result<A, E> => err(e as E),
      )
    )
    return Promise.all(promises)
  })

export const race = <A, E>(tasks: readonly Task<A, E>[]): Task<A, E> =>
  of(async (signal?) => {
    const linked = linkedController(signal)
    try {
      const result = await Promise.race(tasks.map(t => t.run(linked.signal)))
      linked.abort()
      return result
    } catch (e) {
      linked.abort()
      throw e
    }
  })

export const any = <A, E>(tasks: readonly Task<A, E>[]): Task<A, E[]> =>
  of(async (signal?) => {
    const linked = linkedController(signal)
    const errors: E[] = new Array(tasks.length)
    let resolved = false

    return new Promise<A>((resolve, reject) => {
      let remaining = tasks.length
      if (remaining === 0) { reject([] as E[]); return }

      tasks.forEach((t, i) => {
        t.run(linked.signal).then(
          (a) => {
            if (!resolved) {
              resolved = true
              linked.abort()
              resolve(a)
            }
          },
          (e) => {
            errors[i] = e as E
            remaining--
            if (remaining === 0 && !resolved) reject(errors)
          },
        )
      })
    })
  })

export const parallel = (concurrency: number) => {
  if (concurrency < 1) throw new Error(`parallel: concurrency must be >= 1, got ${concurrency}`)
  return <A, E>(tasks: readonly Task<A, E>[]): Task<A[], E> =>
    of(async (signal?) => {
      if (tasks.length === 0) return []
      const sem = new Semaphore(concurrency)
      const linked = linkedController(signal)
      const results = new Array<A>(tasks.length)
      let failed = false

      const execute = async (task: Task<A, E>, index: number) => {
        await sem.acquire()
        if (failed || linked.signal.aborted) { sem.release(); throw linked.signal.reason ?? new CancelledError() }
        try {
          results[index] = await task.run(linked.signal)
        } catch (e) {
          failed = true
          linked.abort()
          throw e
        } finally {
          sem.release()
        }
      }

      await Promise.all(tasks.map((t, i) => execute(t, i)))
      return results
    })
}

export const sequential = <A, E>(tasks: readonly Task<A, E>[]): Task<A[], E> =>
  parallel(1)(tasks)
