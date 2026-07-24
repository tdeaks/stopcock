// Frozen pre-optimization/native-equivalent implementations for the compact
// core-utilities gate. This file is a denominator artifact: update its pinned
// hash deliberately rather than importing live implementation helpers.
import type { Option } from '../../../packages/fp/src/option'
import type { Result } from '../../../packages/fp/src/result'
import type { MutableRecord, ReadonlyRecord } from '../../../packages/fp/src/record'

const beforeNone = Object.freeze({ _tag: 0 } as const)
const beforeSome = <A>(value: A): Option<A> => ({ _tag: 1, value })
const beforeOk = <A>(value: A): Result<A, never> => ({ _tag: 1, value })
const beforeErr = <E>(error: E): Result<never, E> => ({ _tag: 0, error })

const dual2Before = (body: Function): any =>
  function () {
    if (arguments.length >= 2) return body(arguments[0], arguments[1])
    const argument = arguments[0]
    return (data: unknown) => body(data, argument)
  }

export const composeBefore =
  <A>(...fns: readonly ((value: A) => A)[]): ((value: A) => A) =>
  (input: A): A => {
    let value = input
    for (let index = fns.length - 1; index >= 0; index--) value = fns[index](value)
    return value
  }

export const curryBefore = <Output>(fn: (...args: readonly unknown[]) => Output): unknown => {
  const next = (received: readonly unknown[]): unknown =>
    received.length >= fn.length ? fn(...received) : (value: unknown) => next([...received, value])
  return next([])
}

export const optionMapBefore: {
  <A, B>(option: Option<A>, f: (value: A) => B): Option<B>
  <A, B>(f: (value: A) => B): (option: Option<A>) => Option<B>
} = dual2Before(
  <A, B>(option: Option<A>, f: (value: A) => B): Option<B> =>
    option._tag === 1 ? beforeSome(f(option.value)) : beforeNone,
)

export const resultMapBefore: {
  <A, E, B>(result: Result<A, E>, f: (value: A) => B): Result<B, E>
  <A, B>(f: (value: A) => B): <E>(result: Result<A, E>) => Result<B, E>
} = dual2Before(
  <A, E, B>(result: Result<A, E>, f: (value: A) => B): Result<B, E> =>
    result._tag === 1 ? beforeOk(f(result.value)) : result,
)

export const resultTryCatchBefore = <A, E = unknown>(
  thunk: () => A,
  onError?: (error: unknown) => E,
): Result<A, E | unknown> => {
  try {
    return beforeOk(thunk())
  } catch (error) {
    return beforeErr(onError ? onError(error) : error)
  }
}

export const resultLiftThrowableBefore =
  <Args extends readonly unknown[], A, E>(
    fn: (...args: Args) => A,
    onError?: (error: unknown) => E,
  ) =>
  (...args: Args): Result<A, E | unknown> =>
    resultTryCatchBefore(() => fn(...args), onError ?? ((error: unknown) => error as E))

export const mapGetBefore = <K, V>(source: ReadonlyMap<K, V>, key: K): Option<V> =>
  source.has(key) ? beforeSome(source.get(key) as V) : beforeNone

export const setIntersectionBefore = <A>(
  source: ReadonlySet<A>,
  other: ReadonlySet<A>,
): ReadonlySet<A> => {
  const result = new globalThis.Set<A>()
  const [smaller, larger] =
    source.size <= other.size ? ([source, other] as const) : ([other, source] as const)
  for (const value of smaller) {
    if (larger.has(value)) result.add(value)
  }
  return result
}

export const setIsDisjointBefore = <A>(source: ReadonlySet<A>, other: ReadonlySet<A>): boolean => {
  const [smaller, larger] =
    source.size <= other.size ? ([source, other] as const) : ([other, source] as const)
  for (const value of smaller) {
    if (larger.has(value)) return false
  }
  return true
}

const createRecord = <A>(): MutableRecord<A> => Object.create(null) as MutableRecord<A>

const normalizeKey = (key: PropertyKey): string | symbol =>
  typeof key === 'number' ? String(key) : key

const enumerableKeys = (source: object): PropertyKey[] => {
  const ownKeys = Reflect.ownKeys(source)
  let written = 0
  for (let index = 0; index < ownKeys.length; index++) {
    const key = ownKeys[index]
    if (Object.prototype.propertyIsEnumerable.call(source, key)) ownKeys[written++] = key
  }
  ownKeys.length = written
  return ownKeys
}

export const recordOmitBefore = <A>(
  source: ReadonlyRecord<A>,
  omitted: Iterable<PropertyKey>,
): MutableRecord<A> => {
  const excluded = new Set(Array.from(omitted, normalizeKey))
  const result = createRecord<A>()
  for (const key of enumerableKeys(source)) {
    if (!excluded.has(normalizeKey(key))) result[key] = source[key]
  }
  return result
}
