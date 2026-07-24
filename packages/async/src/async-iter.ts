import { linkedController } from './internals'
import { of, type Task } from './task'
import { CancelledError } from './types'

export interface AsyncIter<A> extends AsyncIterable<A> {
  readonly _tag: 'AsyncIter'
  readonly iterate: (signal?: AbortSignal) => AsyncIterator<A>
}

export type AsyncSource<A> = AsyncIter<A> | AsyncIterable<A> | Iterable<A>

export type AsyncMapper<A, B> = (
  value: A,
  index: number,
  signal: AbortSignal,
) => B | PromiseLike<B>

export type AsyncPredicate<A> = (
  value: A,
  index: number,
  signal: AbortSignal,
) => boolean | PromiseLike<boolean>

export interface ConcurrentMapOptions {
  /**
   * Maximum number of mapper calls in flight. Results are always yielded in
   * source order, regardless of completion order.
   */
  readonly concurrency: number
}

const ITERATION_ENDED = 'AsyncIter iteration ended'

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new CancelledError()
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal)
}

function isAsyncIter<A>(source: AsyncSource<A>): source is AsyncIter<A> {
  return (
    typeof source === 'object' &&
    source !== null &&
    '_tag' in source &&
    source._tag === 'AsyncIter' &&
    'iterate' in source &&
    typeof source.iterate === 'function'
  )
}

function sourceIterator<A>(source: AsyncSource<A>, signal?: AbortSignal): AsyncIterator<A> {
  if (isAsyncIter(source)) return source.iterate(signal)

  const asyncMethod = (source as AsyncIterable<A>)[Symbol.asyncIterator]
  if (typeof asyncMethod === 'function') {
    return asyncMethod.call(source)
  }

  const iteratorMethod = (source as Iterable<A>)[Symbol.iterator]
  if (typeof iteratorMethod !== 'function') {
    throw new TypeError('AsyncIter.from: source is not iterable')
  }
  const iterator = iteratorMethod.call(source)
  return {
    next: async () => iterator.next(),
    return: iterator.return
      ? async (value?: unknown) => iterator.return!(value) as IteratorResult<A>
      : undefined,
    throw: iterator.throw
      ? async (error?: unknown) => iterator.throw!(error) as IteratorResult<A>
      : undefined,
  }
}

function withAbort<A>(promise: PromiseLike<A>, signal: AbortSignal): Promise<A> {
  if (signal.aborted) return Promise.reject(abortReason(signal))

  return new Promise<A>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      callback()
    }
    const onAbort = () => finish(() => reject(abortReason(signal)))

    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(promise).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    )
  })
}

async function closeIterator(iterator: AsyncIterator<unknown>): Promise<void> {
  if (!iterator.return) return
  try {
    await iterator.return()
  } catch {
    // Closing is best-effort and must not replace the iteration's result or
    // original failure.
  }
}

async function* values<A>(
  source: AsyncSource<A>,
  signal: AbortSignal,
): AsyncGenerator<A, void, unknown> {
  const iterator = sourceIterator(source, signal)
  try {
    while (true) {
      throwIfAborted(signal)
      const item = await withAbort(iterator.next(), signal)
      if (item.done) return
      yield item.value
    }
  } finally {
    await closeIterator(iterator)
  }
}

function scoped<A>(
  parent: AbortSignal | undefined,
  body: (
    signal: AbortSignal,
    abort: (reason?: unknown) => void,
  ) => AsyncGenerator<A, void, unknown>,
): AsyncGenerator<A, void, unknown> {
  const controller = linkedController(parent)
  const abort = (reason?: unknown) => controller.abort(reason)
  const iterator = body(controller.signal, abort)

  return (async function* () {
    try {
      yield* iterator
    } finally {
      if (!controller.signal.aborted) {
        controller.abort(new CancelledError(ITERATION_ENDED))
      }
    }
  })()
}

export const make = <A>(
  factory: (signal?: AbortSignal) => AsyncIterator<A>,
): AsyncIter<A> => ({
  _tag: 'AsyncIter',
  iterate: factory,
  [Symbol.asyncIterator]() {
    return factory()
  },
})

export const from = <A>(source: AsyncSource<A>): AsyncIter<A> =>
  isAsyncIter(source)
    ? source
    : make((signal) =>
        scoped(signal, async function* (scope) {
          yield* values(source, scope)
        }),
      )

export const iterate = <A>(
  source: AsyncSource<A>,
  signal?: AbortSignal,
): AsyncIterator<A> =>
  isAsyncIter(source) ? source.iterate(signal) : from(source).iterate(signal)

function mapImpl<A, B>(
  source: AsyncSource<A>,
  mapper: AsyncMapper<A, B>,
): AsyncIter<B> {
  return make((signal) =>
    scoped(signal, async function* (scope) {
      let index = 0
      for await (const value of values(source, scope)) {
        throwIfAborted(scope)
        yield await mapper(value, index++, scope)
      }
    }),
  )
}

export function map<A, B>(
  source: AsyncSource<A>,
  mapper: AsyncMapper<A, B>,
): AsyncIter<B>
export function map<A, B>(
  mapper: AsyncMapper<A, B>,
): (source: AsyncSource<A>) => AsyncIter<B>
export function map<A, B>(
  sourceOrMapper: AsyncSource<A> | AsyncMapper<A, B>,
  maybeMapper?: AsyncMapper<A, B>,
): AsyncIter<B> | ((source: AsyncSource<A>) => AsyncIter<B>) {
  if (maybeMapper === undefined) {
    const mapper = sourceOrMapper as AsyncMapper<A, B>
    return (source) => mapImpl(source, mapper)
  }
  return mapImpl(sourceOrMapper as AsyncSource<A>, maybeMapper)
}

function filterImpl<A>(
  source: AsyncSource<A>,
  predicate: AsyncPredicate<A>,
): AsyncIter<A> {
  return make((signal) =>
    scoped(signal, async function* (scope) {
      let index = 0
      for await (const value of values(source, scope)) {
        throwIfAborted(scope)
        if (await predicate(value, index++, scope)) yield value
      }
    }),
  )
}

export function filter<A>(
  source: AsyncSource<A>,
  predicate: AsyncPredicate<A>,
): AsyncIter<A>
export function filter<A>(
  predicate: AsyncPredicate<A>,
): (source: AsyncSource<A>) => AsyncIter<A>
export function filter<A>(
  sourceOrPredicate: AsyncSource<A> | AsyncPredicate<A>,
  maybePredicate?: AsyncPredicate<A>,
): AsyncIter<A> | ((source: AsyncSource<A>) => AsyncIter<A>) {
  if (maybePredicate === undefined) {
    const predicate = sourceOrPredicate as AsyncPredicate<A>
    return (source) => filterImpl(source, predicate)
  }
  return filterImpl(sourceOrPredicate as AsyncSource<A>, maybePredicate)
}

function filterMapImpl<A, B>(
  source: AsyncSource<A>,
  mapper: AsyncMapper<A, B | null | undefined>,
): AsyncIter<B> {
  return make((signal) =>
    scoped(signal, async function* (scope) {
      let index = 0
      for await (const value of values(source, scope)) {
        throwIfAborted(scope)
        const mapped = await mapper(value, index++, scope)
        if (mapped != null) yield mapped
      }
    }),
  )
}

export function filterMap<A, B>(
  source: AsyncSource<A>,
  mapper: AsyncMapper<A, B | null | undefined>,
): AsyncIter<B>
export function filterMap<A, B>(
  mapper: AsyncMapper<A, B | null | undefined>,
): (source: AsyncSource<A>) => AsyncIter<B>
export function filterMap<A, B>(
  sourceOrMapper: AsyncSource<A> | AsyncMapper<A, B | null | undefined>,
  maybeMapper?: AsyncMapper<A, B | null | undefined>,
): AsyncIter<B> | ((source: AsyncSource<A>) => AsyncIter<B>) {
  if (maybeMapper === undefined) {
    const mapper = sourceOrMapper as AsyncMapper<A, B | null | undefined>
    return (source) => filterMapImpl(source, mapper)
  }
  return filterMapImpl(sourceOrMapper as AsyncSource<A>, maybeMapper)
}

function flatMapImpl<A, B>(
  source: AsyncSource<A>,
  mapper: AsyncMapper<A, AsyncSource<B>>,
): AsyncIter<B> {
  return make((signal) =>
    scoped(signal, async function* (scope) {
      let index = 0
      for await (const value of values(source, scope)) {
        throwIfAborted(scope)
        const inner = await mapper(value, index++, scope)
        yield* values(inner, scope)
      }
    }),
  )
}

export function flatMap<A, B>(
  source: AsyncSource<A>,
  mapper: AsyncMapper<A, AsyncSource<B>>,
): AsyncIter<B>
export function flatMap<A, B>(
  mapper: AsyncMapper<A, AsyncSource<B>>,
): (source: AsyncSource<A>) => AsyncIter<B>
export function flatMap<A, B>(
  sourceOrMapper: AsyncSource<A> | AsyncMapper<A, AsyncSource<B>>,
  maybeMapper?: AsyncMapper<A, AsyncSource<B>>,
): AsyncIter<B> | ((source: AsyncSource<A>) => AsyncIter<B>) {
  if (maybeMapper === undefined) {
    const mapper = sourceOrMapper as AsyncMapper<A, AsyncSource<B>>
    return (source) => flatMapImpl(source, mapper)
  }
  return flatMapImpl(sourceOrMapper as AsyncSource<A>, maybeMapper)
}

function takeImpl<A>(source: AsyncSource<A>, count: number): AsyncIter<A> {
  const limit = Math.max(0, Math.trunc(count))
  return make((signal) =>
    scoped(signal, async function* (scope) {
      if (limit === 0) return
      let seen = 0
      for await (const value of values(source, scope)) {
        yield value
        if (++seen >= limit) return
      }
    }),
  )
}

export function take<A>(source: AsyncSource<A>, count: number): AsyncIter<A>
export function take(count: number): <A>(source: AsyncSource<A>) => AsyncIter<A>
export function take<A>(
  sourceOrCount: AsyncSource<A> | number,
  maybeCount?: number,
): AsyncIter<A> | (<B>(source: AsyncSource<B>) => AsyncIter<B>) {
  if (maybeCount === undefined) {
    const count = sourceOrCount as number
    return <B>(source: AsyncSource<B>) => takeImpl(source, count)
  }
  return takeImpl(sourceOrCount as AsyncSource<A>, maybeCount)
}

function dropImpl<A>(source: AsyncSource<A>, count: number): AsyncIter<A> {
  const limit = Math.max(0, Math.trunc(count))
  return make((signal) =>
    scoped(signal, async function* (scope) {
      let seen = 0
      for await (const value of values(source, scope)) {
        if (seen++ < limit) continue
        yield value
      }
    }),
  )
}

export function drop<A>(source: AsyncSource<A>, count: number): AsyncIter<A>
export function drop(count: number): <A>(source: AsyncSource<A>) => AsyncIter<A>
export function drop<A>(
  sourceOrCount: AsyncSource<A> | number,
  maybeCount?: number,
): AsyncIter<A> | (<B>(source: AsyncSource<B>) => AsyncIter<B>) {
  if (maybeCount === undefined) {
    const count = sourceOrCount as number
    return <B>(source: AsyncSource<B>) => dropImpl(source, count)
  }
  return dropImpl(sourceOrCount as AsyncSource<A>, maybeCount)
}

type ConcurrentOutcome<B> =
  | { readonly ok: true; readonly value: B }
  | { readonly ok: false; readonly error: unknown }

function concurrencyLimit(options: ConcurrentMapOptions): number {
  const value = options.concurrency
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(
      `AsyncIter.mapConcurrent: concurrency must be a positive safe integer, got ${value}`,
    )
  }
  return value
}

function mapConcurrentImpl<A, B>(
  source: AsyncSource<A>,
  mapper: AsyncMapper<A, B>,
  options: ConcurrentMapOptions,
): AsyncIter<B> {
  const concurrency = concurrencyLimit(options)

  return make((signal) =>
    scoped(signal, async function* (scope, abort) {
      const iterator = sourceIterator(source, scope)
      const pending: Array<Promise<ConcurrentOutcome<B>>> = []
      let sourceDone = false
      let index = 0

      const fill = async () => {
        while (!sourceDone && pending.length < concurrency) {
          throwIfAborted(scope)
          const item = await withAbort(iterator.next(), scope)
          if (item.done) {
            sourceDone = true
            return
          }

          const itemIndex = index++
          pending.push(
            Promise.resolve()
              .then(() => mapper(item.value, itemIndex, scope))
              .then(
                (value): ConcurrentOutcome<B> => ({ ok: true, value }),
                (error): ConcurrentOutcome<B> => {
                  if (!scope.aborted) abort(error)
                  return { ok: false, error }
                },
              ),
          )
        }
      }

      try {
        await fill()
        while (pending.length > 0) {
          const outcome = await withAbort(pending[0], scope)
          void pending.shift()
          if (!outcome.ok) {
            if (!scope.aborted) abort(outcome.error)
            throw outcome.error
          }
          yield outcome.value
          await fill()
        }
      } finally {
        await closeIterator(iterator)
      }
    }),
  )
}

export function mapConcurrent<A, B>(
  source: AsyncSource<A>,
  mapper: AsyncMapper<A, B>,
  options: ConcurrentMapOptions,
): AsyncIter<B>
export function mapConcurrent<A, B>(
  mapper: AsyncMapper<A, B>,
  options: ConcurrentMapOptions,
): (source: AsyncSource<A>) => AsyncIter<B>
export function mapConcurrent<A, B>(
  sourceOrMapper: AsyncSource<A> | AsyncMapper<A, B>,
  mapperOrOptions: AsyncMapper<A, B> | ConcurrentMapOptions,
  maybeOptions?: ConcurrentMapOptions,
): AsyncIter<B> | ((source: AsyncSource<A>) => AsyncIter<B>) {
  if (maybeOptions === undefined) {
    const mapper = sourceOrMapper as AsyncMapper<A, B>
    const options = mapperOrOptions as ConcurrentMapOptions
    concurrencyLimit(options)
    return (source) => mapConcurrentImpl(source, mapper, options)
  }
  return mapConcurrentImpl(
    sourceOrMapper as AsyncSource<A>,
    mapperOrOptions as AsyncMapper<A, B>,
    maybeOptions,
  )
}

export const collect = <A>(source: AsyncSource<A>): Task<A[], unknown> =>
  of(async (signal) => {
    const controller = linkedController(signal)
    const out: A[] = []
    try {
      for await (const value of values(source, controller.signal)) out.push(value)
      return out
    } finally {
      if (!controller.signal.aborted) {
        controller.abort(new CancelledError(ITERATION_ENDED))
      }
    }
  })

function reduceImpl<A, B>(
  source: AsyncSource<A>,
  reducer: (
    accumulator: B,
    value: A,
    index: number,
    signal: AbortSignal,
  ) => B | PromiseLike<B>,
  initial: B,
): Task<B, unknown> {
  return of(async (signal) => {
    const controller = linkedController(signal)
    let accumulator = initial
    let index = 0
    try {
      for await (const value of values(source, controller.signal)) {
        throwIfAborted(controller.signal)
        accumulator = await reducer(accumulator, value, index++, controller.signal)
      }
      return accumulator
    } finally {
      if (!controller.signal.aborted) {
        controller.abort(new CancelledError(ITERATION_ENDED))
      }
    }
  })
}

export function reduce<A, B>(
  source: AsyncSource<A>,
  reducer: (
    accumulator: B,
    value: A,
    index: number,
    signal: AbortSignal,
  ) => B | PromiseLike<B>,
  initial: B,
): Task<B, unknown>
export function reduce<A, B>(
  reducer: (
    accumulator: B,
    value: A,
    index: number,
    signal: AbortSignal,
  ) => B | PromiseLike<B>,
  initial: B,
): (source: AsyncSource<A>) => Task<B, unknown>
export function reduce<A, B>(
  sourceOrReducer:
    | AsyncSource<A>
    | ((
        accumulator: B,
        value: A,
        index: number,
        signal: AbortSignal,
      ) => B | PromiseLike<B>),
  reducerOrInitial:
    | B
    | ((
        accumulator: B,
        value: A,
        index: number,
        signal: AbortSignal,
      ) => B | PromiseLike<B>),
  maybeInitial?: B,
): Task<B, unknown> | ((source: AsyncSource<A>) => Task<B, unknown>) {
  if (arguments.length === 2) {
    const reducer = sourceOrReducer as (
      accumulator: B,
      value: A,
      index: number,
      signal: AbortSignal,
    ) => B | PromiseLike<B>
    const initial = reducerOrInitial as B
    return (source) => reduceImpl(source, reducer, initial)
  }
  return reduceImpl(
    sourceOrReducer as AsyncSource<A>,
    reducerOrInitial as (
      accumulator: B,
      value: A,
      index: number,
      signal: AbortSignal,
    ) => B | PromiseLike<B>,
    maybeInitial as B,
  )
}

export const forEach = <A>(
  source: AsyncSource<A>,
  effect: AsyncMapper<A, unknown>,
): Task<void, unknown> =>
  of(async (signal) => {
    const controller = linkedController(signal)
    let index = 0
    try {
      for await (const value of values(source, controller.signal)) {
        throwIfAborted(controller.signal)
        await effect(value, index++, controller.signal)
      }
    } finally {
      if (!controller.signal.aborted) {
        controller.abort(new CancelledError(ITERATION_ENDED))
      }
    }
  })
