import { dual } from '@stopcock/fp'
import type { Task } from './task'
import { of } from './task'
import { linkedController, abortableDelay } from './internals'
import { TimeoutError, type RetryOptions } from './types'

function computeDelay(opts: Required<Pick<RetryOptions, 'delay' | 'backoff' | 'jitter' | 'maxDelay'>>, attempt: number): number {
  const { delay: base, backoff, jitter, maxDelay } = opts
  let ms: number
  switch (backoff) {
    case 'constant': ms = base; break
    case 'linear': ms = base * attempt; break
    case 'exponential': ms = base * (1 << (attempt - 1)); break
  }
  if (jitter) ms += Math.random() * ms * 0.5
  return Math.min(ms, maxDelay)
}

export const retry = (options: RetryOptions) =>
  <A, E>(task: Task<A, E>): Task<A, E> =>
    of(async (signal?) => {
      const { attempts, delay = 100, backoff = 'exponential', jitter = true, maxDelay = 30000, retryIf } = options
      let lastError: unknown

      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await task.run(signal)
        } catch (e) {
          lastError = e
          signal?.throwIfAborted()
          if (retryIf && !retryIf(e, attempt)) throw e
          if (attempt < attempts) {
            const ms = computeDelay({ delay, backoff, jitter, maxDelay }, attempt)
            await abortableDelay(ms, signal)
          }
        }
      }
      throw lastError
    })

export const timeout = (ms: number) =>
  <A, E>(task: Task<A, E>): Task<A, E | TimeoutError> =>
    of((signal?) => {
      const linked = linkedController(signal)
      return new Promise<A>((resolve, reject) => {
        const timer = setTimeout(() => {
          linked.abort(new TimeoutError(ms))
          reject(new TimeoutError(ms))
        }, ms)
        task.run(linked.signal).then(
          (v) => { clearTimeout(timer); resolve(v) },
          (e) => { clearTimeout(timer); reject(e) },
        )
      })
    })

export const fallback: {
  <A, E, B, E2>(task: Task<A, E>, backup: Task<B, E2>): Task<A | B, E2>
  <B, E2>(backup: Task<B, E2>): <A, E>(task: Task<A, E>) => Task<A | B, E2>
} = dual(2, <A, E, B, E2>(task: Task<A, E>, backup: Task<B, E2>): Task<A | B, E2> =>
  of(async (signal?) => {
    try { return await task.run(signal) }
    catch { return backup.run(signal) }
  })
)
