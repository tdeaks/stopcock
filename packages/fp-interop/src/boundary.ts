import { none, some, type Option } from '@stopcock/fp/option'
import { err, ok, type Result } from '@stopcock/fp/result'
import { closeAsyncIterator, closeIterator } from './internal'

export function optionFromNullable<A>(
  value: A | null | undefined,
): Option<NonNullable<A>> {
  return value == null ? none : some(value as NonNullable<A>)
}

export function optionToNullable<A>(value: Option<A>): A | null {
  return value._tag === 1 ? value.value : null
}

export function optionToUndefined<A>(value: Option<A>): A | undefined {
  return value._tag === 1 ? value.value : undefined
}

export function resultFromNullable<A, E>(
  value: A | null | undefined,
  onNullish: () => E,
): Result<NonNullable<A>, E> {
  return value == null ? err(onNullish()) : ok(value as NonNullable<A>)
}

export function captureThrown<A>(thunk: () => A): Result<A, unknown>
export function captureThrown<A, E>(
  thunk: () => A,
  onThrown: (error: unknown) => E,
): Result<A, E>
export function captureThrown<A, E>(
  thunk: () => A,
  onThrown?: (error: unknown) => E,
): Result<A, unknown> {
  try {
    return ok(thunk())
  } catch (error) {
    return err(onThrown ? onThrown(error) : error)
  }
}

export function resultOrThrow<A, E>(
  value: Result<A, E>,
  toThrown: (error: E) => unknown,
): A {
  if (value._tag === 1) return value.value
  throw toThrown(value.error)
}

/**
 * Turns Promise rejection into data. `onRejected` should be total; if that
 * callback itself throws, the returned Promise rejects with the callback error.
 */
export async function settlePromise<A>(
  source: PromiseLike<A>,
): Promise<Result<A, unknown>>
export async function settlePromise<A, E>(
  source: PromiseLike<A>,
  onRejected: (reason: unknown) => E,
): Promise<Result<A, E>>
export async function settlePromise<A, E>(
  source: PromiseLike<A>,
  onRejected?: (reason: unknown) => E,
): Promise<Result<A, unknown>> {
  try {
    return ok(await source)
  } catch (error) {
    return err(onRejected ? onRejected(error) : error)
  }
}

/**
 * Converts Result back to native Promise settlement. Err becomes rejection
 * using the exact reason produced by `toRejection`.
 */
export function resultToPromise<A, E>(
  value: Result<A, E>,
  toRejection: (error: E) => unknown,
): Promise<A> {
  return value._tag === 1
    ? Promise.resolve(value.value)
    : Promise.reject(toRejection(value.error))
}

export function optionToPromise<A>(
  value: Option<A>,
  onNone: () => unknown,
): Promise<A> {
  return value._tag === 1
    ? Promise.resolve(value.value)
    : Promise.reject(onNone())
}

/**
 * Reads at most one value and closes a non-exhausted iterator.
 */
export function optionFromIterableFirst<A>(source: Iterable<A>): Option<A> {
  const iterator = source[Symbol.iterator]()
  const first = iterator.next()
  if (first.done) return none
  closeIterator(iterator)
  return some(first.value)
}

/**
 * Reads at most two values. Empty and multiple-value cases are distinct and
 * multiple input closes the iterator before returning.
 */
export function resultFromIterableExactlyOne<A, E>(
  source: Iterable<A>,
  onEmpty: () => E,
  onMultiple: (first: A, second: A) => E,
): Result<A, E> {
  const iterator = source[Symbol.iterator]()
  const first = iterator.next()
  if (first.done) return err(onEmpty())

  const second = iterator.next()
  if (second.done) return ok(first.value)
  closeIterator(iterator)
  return err(onMultiple(first.value, second.value))
}

export function* optionToIterable<A>(
  value: Option<A>,
): IterableIterator<A> {
  if (value._tag === 1) yield value.value
}

export async function optionFromAsyncIterableFirst<A>(
  source: AsyncIterable<A>,
): Promise<Option<A>> {
  const iterator = source[Symbol.asyncIterator]()
  const first = await iterator.next()
  if (first.done) return none
  await closeAsyncIterator(iterator)
  return some(first.value)
}

export async function resultFromAsyncIterableExactlyOne<A, E>(
  source: AsyncIterable<A>,
  onEmpty: () => E,
  onMultiple: (first: A, second: A) => E,
): Promise<Result<A, E>> {
  const iterator = source[Symbol.asyncIterator]()
  const first = await iterator.next()
  if (first.done) return err(onEmpty())

  const second = await iterator.next()
  if (second.done) return ok(first.value)
  await closeAsyncIterator(iterator)
  return err(onMultiple(first.value, second.value))
}

export async function* optionToAsyncIterable<A>(
  value: Option<A>,
): AsyncIterableIterator<A> {
  if (value._tag === 1) yield value.value
}
