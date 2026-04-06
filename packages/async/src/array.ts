import type { Task } from './task'
import { of } from './task'
import { linkedController, Semaphore } from './internals'

function boundedMap<A, B>(arr: readonly A[], fn: (a: A, signal?: AbortSignal) => Promise<B>, concurrency: number): Task<B[], unknown> {
  return of(async (signal?) => {
    if (arr.length === 0) return []
    if (!isFinite(concurrency) || concurrency >= arr.length) {
      return Promise.all(arr.map(a => fn(a, signal)))
    }
    const sem = new Semaphore(concurrency)
    const linked = linkedController(signal)
    const results = new Array<B>(arr.length)
    let failed = false

    const execute = async (a: A, i: number) => {
      await sem.acquire()
      if (failed || linked.signal.aborted) { sem.release(); throw linked.signal.reason }
      try {
        results[i] = await fn(a, linked.signal)
      } catch (e) {
        failed = true
        linked.abort()
        throw e
      } finally {
        sem.release()
      }
    }

    await Promise.all(arr.map((a, i) => execute(a, i)))
    return results
  })
}

export function mapAsync<A, B>(arr: readonly A[], fn: (a: A, signal?: AbortSignal) => Promise<B>, concurrency?: number): Task<B[], unknown>
export function mapAsync<A, B>(fn: (a: A, signal?: AbortSignal) => Promise<B>, concurrency?: number): (arr: readonly A[]) => Task<B[], unknown>
export function mapAsync(...args: any[]): any {
  if (Array.isArray(args[0])) return boundedMap(args[0], args[1], args[2] ?? Infinity)
  const fn = args[0], c = args[1] ?? Infinity
  return (arr: any[]) => boundedMap(arr, fn, c)
}

function boundedFilter<A>(arr: readonly A[], pred: (a: A, signal?: AbortSignal) => Promise<boolean>, concurrency: number): Task<A[], unknown> {
  return of(async (signal?) => {
    if (arr.length === 0) return []
    if (!isFinite(concurrency) || concurrency >= arr.length) {
      const bits = await Promise.all(arr.map(a => pred(a, signal)))
      const out: A[] = []
      for (let i = 0; i < arr.length; i++) { if (bits[i]) out.push(arr[i]) }
      return out
    }
    const sem = new Semaphore(concurrency)
    const linked = linkedController(signal)
    const bits = new Array<boolean>(arr.length)
    let failed = false

    const execute = async (a: A, i: number) => {
      await sem.acquire()
      if (failed || linked.signal.aborted) { sem.release(); throw linked.signal.reason }
      try {
        bits[i] = await pred(a, linked.signal)
      } catch (e) {
        failed = true
        linked.abort()
        throw e
      } finally {
        sem.release()
      }
    }

    await Promise.all(arr.map((a, i) => execute(a, i)))
    const out: A[] = []
    for (let i = 0; i < arr.length; i++) { if (bits[i]) out.push(arr[i]) }
    return out
  })
}

export function filterAsync<A>(arr: readonly A[], pred: (a: A, signal?: AbortSignal) => Promise<boolean>, concurrency?: number): Task<A[], unknown>
export function filterAsync<A>(pred: (a: A, signal?: AbortSignal) => Promise<boolean>, concurrency?: number): (arr: readonly A[]) => Task<A[], unknown>
export function filterAsync(...args: any[]): any {
  if (Array.isArray(args[0])) return boundedFilter(args[0], args[1], args[2] ?? Infinity)
  const pred = args[0], c = args[1] ?? Infinity
  return (arr: any[]) => boundedFilter(arr, pred, c)
}

function boundedForEach<A>(arr: readonly A[], fn: (a: A, signal?: AbortSignal) => Promise<void>, concurrency: number): Task<void, unknown> {
  return of(async (signal?) => {
    if (arr.length === 0) return
    if (!isFinite(concurrency) || concurrency >= arr.length) {
      await Promise.all(arr.map(a => fn(a, signal)))
      return
    }
    const sem = new Semaphore(concurrency)
    const linked = linkedController(signal)
    let failed = false

    const execute = async (a: A) => {
      await sem.acquire()
      if (failed || linked.signal.aborted) { sem.release(); throw linked.signal.reason }
      try {
        await fn(a, linked.signal)
      } catch (e) {
        failed = true
        linked.abort()
        throw e
      } finally {
        sem.release()
      }
    }

    await Promise.all(arr.map(a => execute(a)))
  })
}

export function forEachAsync<A>(arr: readonly A[], fn: (a: A, signal?: AbortSignal) => Promise<void>, concurrency?: number): Task<void, unknown>
export function forEachAsync<A>(fn: (a: A, signal?: AbortSignal) => Promise<void>, concurrency?: number): (arr: readonly A[]) => Task<void, unknown>
export function forEachAsync(...args: any[]): any {
  if (Array.isArray(args[0])) return boundedForEach(args[0], args[1], args[2] ?? Infinity)
  const fn = args[0], c = args[1] ?? Infinity
  return (arr: any[]) => boundedForEach(arr, fn, c)
}

export function reduceAsync<A, B>(arr: readonly A[], fn: (acc: B, a: A, signal?: AbortSignal) => Promise<B>, init: B): Task<B, unknown>
export function reduceAsync<A, B>(fn: (acc: B, a: A, signal?: AbortSignal) => Promise<B>, init: B): (arr: readonly A[]) => Task<B, unknown>
export function reduceAsync(...args: any[]): any {
  if (Array.isArray(args[0])) return reduceImpl(args[0], args[1], args[2])
  const fn = args[0], init = args[1]
  return (arr: any[]) => reduceImpl(arr, fn, init)
}

function reduceImpl<A, B>(arr: readonly A[], fn: (acc: B, a: A, signal?: AbortSignal) => Promise<B>, init: B): Task<B, unknown> {
  return of(async (signal?) => {
    let acc = init
    for (let i = 0; i < arr.length; i++) {
      signal?.throwIfAborted()
      acc = await fn(acc, arr[i], signal)
    }
    return acc
  })
}

export const collectAsync = <A>(iterable: AsyncIterable<A>): Task<A[], unknown> =>
  of(async (signal?) => {
    const out: A[] = []
    for await (const item of iterable) {
      signal?.throwIfAborted()
      out.push(item)
    }
    return out
  })
