import { deep } from './eq'

export type Predicate<A> = (a: A) => boolean
export type Refinement<A, B extends A> = (a: A) => a is B
export type Guard<A> = Refinement<unknown, A>
export type Brand<T, B extends string> = T & { readonly __brand: B }

type Constructor<T> = abstract new (...args: never[]) => T

export const is = <T>(ctor: Constructor<T>, val: unknown): val is T =>
  val instanceof ctor

export const isNil = (val: unknown): val is null | undefined => val === null || val === undefined

export const isNotNil = <T>(val: T | null | undefined): val is T =>
  val !== null && val !== undefined

export const propIs = <T>(
  ctor: Constructor<T>,
  prop: PropertyKey,
  obj: Readonly<Record<PropertyKey, unknown>>,
): boolean => obj[prop] instanceof ctor

export const isArray = (val: unknown): val is unknown[] => Array.isArray(val)

export const isBigInt = (val: unknown): val is bigint => typeof val === 'bigint'

export const isBoolean = (val: unknown): val is boolean => typeof val === 'boolean'

export const isDate = (val: unknown): val is Date => val instanceof Date

export const isDeepEqual = deep.equals

export const isDefined = <T>(val: T | undefined): val is T => val !== undefined

export const isUndefined = (val: unknown): val is undefined => val === undefined

export const isEmpty = (val: unknown): boolean => {
  if (val == null) return true
  if (typeof val === 'string' || Array.isArray(val)) return val.length === 0
  if (typeof val === 'object') return Object.keys(val as object).length === 0
  return false
}

export const isEmptyish = (val: unknown): boolean =>
  val === null || val === undefined || isEmpty(val)

export const isError = (val: unknown): val is Error => val instanceof Error

export const isFunction = (val: unknown): val is ((...args: never[]) => unknown) =>
  typeof val === 'function'

export const isNonNull = <T>(val: T | null): val is T => val !== null

export const isNull = (val: unknown): val is null => val === null

export const isNonNullish = <T>(val: T | null | undefined): val is T =>
  val !== null && val !== undefined

export const isNullish = (val: unknown): val is null | undefined =>
  val === null || val === undefined

export const isNumber = (val: unknown): val is number => typeof val === 'number'

export const isFiniteNumber = (val: unknown): val is number =>
  typeof val === 'number' && Number.isFinite(val)

export const isObjectType = (val: unknown): val is object => typeof val === 'object' && val !== null

export const isPlainObject = (val: unknown): val is Record<PropertyKey, unknown> => {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return false
  const prototype = Object.getPrototypeOf(val)
  return prototype === Object.prototype || prototype === null
}

export const isPromise = (val: unknown): val is PromiseLike<unknown> =>
  (typeof val === 'object' || typeof val === 'function') &&
  val !== null &&
  'then' in val &&
  typeof (val as { readonly then?: unknown }).then === 'function'

export const isShallowEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  const keysA = Reflect.ownKeys(a).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(a, key),
  )
  const keysB = Reflect.ownKeys(b).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(b, key),
  )
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (
      !Object.prototype.propertyIsEnumerable.call(b, key) ||
      !Object.is(Reflect.get(a, key), Reflect.get(b, key))
    ) {
      return false
    }
  }
  return true
}

export const isStrictEqual = (a: unknown, b: unknown): boolean => a === b

export const isString = (val: unknown): val is string => typeof val === 'string'

export const isNonBlankString = (val: unknown): val is string =>
  typeof val === 'string' && val.trim().length > 0

export const isArrayOf =
  <A>(guard: Guard<A>): Guard<A[]> =>
  (val: unknown): val is A[] =>
    Array.isArray(val) && val.every(guard)

export const isRecordOf =
  <A>(guard: Guard<A>): Guard<Record<PropertyKey, A>> =>
  (val: unknown): val is Record<PropertyKey, A> => {
    if (!isPlainObject(val)) return false
    for (const key of Reflect.ownKeys(val)) {
      if (
        Object.prototype.propertyIsEnumerable.call(val, key) &&
        !guard(Reflect.get(val, key))
      ) {
        return false
      }
    }
    return true
  }

export const isSymbol = (val: unknown): val is symbol => typeof val === 'symbol'

export const isTruthy = (val: unknown): boolean => !!val

export function and<A, B extends A, C extends B>(
  left: Refinement<A, B>,
  right: Refinement<B, C>,
): Refinement<A, C>
export function and<A, B extends A, C extends A>(
  left: Refinement<A, B>,
  right: Refinement<A, C>,
): Refinement<A, B & C>
export function and<A>(left: Predicate<A>, right: Predicate<A>): Predicate<A>
export function and<A>(left: Predicate<A>, right: Predicate<A>): Predicate<A> {
  return (a: A) => left(a) && right(a)
}

export function or<A, B extends A, C extends A>(
  left: Refinement<A, B>,
  right: Refinement<A, C>,
): Refinement<A, B | C>
export function or<A>(left: Predicate<A>, right: Predicate<A>): Predicate<A>
export function or<A>(left: Predicate<A>, right: Predicate<A>): Predicate<A> {
  return (a: A) => left(a) || right(a)
}

export function not<A, B extends A>(refinement: Refinement<A, B>): Refinement<A, Exclude<A, B>>
export function not<A>(predicate: Predicate<A>): Predicate<A>
export function not<A>(predicate: Predicate<A>): Predicate<A> {
  return (a: A) => !predicate(a)
}
