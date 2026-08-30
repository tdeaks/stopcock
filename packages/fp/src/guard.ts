import { deep } from './eq'

export type Predicate<A> = (a: A) => boolean
export type Refinement<A, B extends A> = (a: A) => a is B
export type Guard<A> = Refinement<unknown, A>
export type Brand<T, B extends string> = T & { readonly __brand: B }

type Constructor<T> = abstract new (...args: never[]) => T

const isConstructor = (value: unknown): value is Constructor<unknown> => {
  if (typeof value !== 'function') return false
  try {
    Reflect.construct(Object, [], value)
    return true
  } catch {
    return false
  }
}

export function is<T>(val: unknown, ctor: Constructor<T>): val is T
export function is<T>(ctor: Constructor<T>): (val: unknown) => val is T
export function is<T>(ctor: Constructor<T>, val: unknown): val is T
export function is<T>(
  valOrCtor: unknown,
  ctorOrVal?: unknown,
): boolean | ((val: unknown) => val is T) {
  if (arguments.length === 1) {
    const ctor = valOrCtor as Constructor<T>
    return (val: unknown): val is T => val instanceof ctor
  }
  if (isConstructor(ctorOrVal)) {
    return valOrCtor instanceof (ctorOrVal as Constructor<T>)
  }
  return ctorOrVal instanceof (valOrCtor as Constructor<T>)
}

export const isNil = (val: unknown): val is null | undefined => val === null || val === undefined

export const isNotNil = <T>(val: T | null | undefined): val is T =>
  val !== null && val !== undefined

export function propIs<T>(
  obj: Readonly<Record<PropertyKey, unknown>>,
  ctor: Constructor<T>,
  prop: PropertyKey,
): boolean
export function propIs<T>(
  ctor: Constructor<T>,
  prop: PropertyKey,
): (obj: Readonly<Record<PropertyKey, unknown>>) => boolean
export function propIs<T>(
  ctor: Constructor<T>,
  prop: PropertyKey,
  obj: Readonly<Record<PropertyKey, unknown>>,
): boolean
export function propIs<T>(
  objOrCtor: Readonly<Record<PropertyKey, unknown>> | Constructor<T>,
  ctorOrProp: Constructor<T> | PropertyKey,
  propOrObj?: PropertyKey | Readonly<Record<PropertyKey, unknown>>,
): boolean | ((obj: Readonly<Record<PropertyKey, unknown>>) => boolean) {
  if (arguments.length === 2) {
    const ctor = objOrCtor as Constructor<T>
    const prop = ctorOrProp as PropertyKey
    return (obj: Readonly<Record<PropertyKey, unknown>>): boolean => obj[prop] instanceof ctor
  }
  if (typeof objOrCtor === 'function') {
    return (
      (propOrObj as Readonly<Record<PropertyKey, unknown>>)[ctorOrProp as PropertyKey] instanceof
      objOrCtor
    )
  }
  return objOrCtor[propOrObj as PropertyKey] instanceof (ctorOrProp as Constructor<T>)
}

export const isArray = (val: unknown): val is unknown[] => Array.isArray(val)

export const isBigInt = (val: unknown): val is bigint => typeof val === 'bigint'

export const isBoolean = (val: unknown): val is boolean => typeof val === 'boolean'

export const isDate = (val: unknown): val is Date => val instanceof Date

export function isDeepEqual(self: unknown, that: unknown): boolean
export function isDeepEqual(that: unknown): (self: unknown) => boolean
export function isDeepEqual(
  selfOrThat: unknown,
  that?: unknown,
): boolean | ((self: unknown) => boolean) {
  if (arguments.length === 1) {
    return (self: unknown): boolean => deep.equals(self, selfOrThat)
  }
  return deep.equals(selfOrThat, that)
}

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

const isShallowEqualImpl = (a: unknown, b: unknown): boolean => {
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

export function isShallowEqual(self: unknown, that: unknown): boolean
export function isShallowEqual(that: unknown): (self: unknown) => boolean
export function isShallowEqual(
  selfOrThat: unknown,
  that?: unknown,
): boolean | ((self: unknown) => boolean) {
  if (arguments.length === 1) {
    return (self: unknown): boolean => isShallowEqualImpl(self, selfOrThat)
  }
  return isShallowEqualImpl(selfOrThat, that)
}

export function isStrictEqual(self: unknown, that: unknown): boolean
export function isStrictEqual(that: unknown): (self: unknown) => boolean
export function isStrictEqual(
  selfOrThat: unknown,
  that?: unknown,
): boolean | ((self: unknown) => boolean) {
  if (arguments.length === 1) {
    return (self: unknown): boolean => self === selfOrThat
  }
  return selfOrThat === that
}

export const isString = (val: unknown): val is string => typeof val === 'string'

export const isNonBlankString = (val: unknown): val is string =>
  typeof val === 'string' && val.trim().length > 0

export function isArrayOf<A>(val: unknown, guard: Guard<A>): val is A[]
export function isArrayOf<A>(guard: Guard<A>): Guard<A[]>
export function isArrayOf<A>(
  valOrGuard: unknown,
  maybeGuard?: Guard<A>,
): boolean | Guard<A[]> {
  if (arguments.length === 2) {
    const val = valOrGuard
    const guard = maybeGuard as Guard<A>
    return Array.isArray(val) && val.every(guard)
  }
  const guard = valOrGuard as Guard<A>
  return (val: unknown): val is A[] =>
    Array.isArray(val) && val.every(guard)
}

const isRecordOfImpl = <A>(val: unknown, guard: Guard<A>): val is Record<PropertyKey, A> => {
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

export function isRecordOf<A>(val: unknown, guard: Guard<A>): val is Record<PropertyKey, A>
export function isRecordOf<A>(guard: Guard<A>): Guard<Record<PropertyKey, A>>
export function isRecordOf<A>(
  valOrGuard: unknown,
  maybeGuard?: Guard<A>,
): boolean | Guard<Record<PropertyKey, A>> {
  if (arguments.length === 2) return isRecordOfImpl(valOrGuard, maybeGuard as Guard<A>)
  const guard = valOrGuard as Guard<A>
  return (val: unknown): val is Record<PropertyKey, A> => {
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
}

export const isSymbol = (val: unknown): val is symbol => typeof val === 'symbol'

export const isTruthy = (val: unknown): boolean => !!val

export function and<A, B extends A, C extends B>(
  value: A,
  left: Refinement<A, B>,
  right: Refinement<B, C>,
): value is C
export function and<A, B extends A, C extends A>(
  value: A,
  left: Refinement<A, B>,
  right: Refinement<A, C>,
): value is B & C
export function and<A>(value: A, left: Predicate<A>, right: Predicate<A>): boolean
export function and<A, B extends A, C extends B>(
  left: Refinement<A, B>,
  right: Refinement<B, C>,
): Refinement<A, C>
export function and<A, B extends A, C extends A>(
  left: Refinement<A, B>,
  right: Refinement<A, C>,
): Refinement<A, B & C>
export function and<A>(left: Predicate<A>, right: Predicate<A>): Predicate<A>
export function and<A>(
  valueOrLeft: A | Predicate<A>,
  leftOrRight: Predicate<A>,
  maybeRight?: Predicate<A>,
): boolean | Predicate<A> {
  if (arguments.length === 3) {
    const value = valueOrLeft as A
    return leftOrRight(value) && (maybeRight as Predicate<A>)(value)
  }
  const left = valueOrLeft as Predicate<A>
  const right = leftOrRight
  return (a: A) => left(a) && right(a)
}

export function or<A, B extends A, C extends A>(
  value: A,
  left: Refinement<A, B>,
  right: Refinement<A, C>,
): value is B | C
export function or<A>(value: A, left: Predicate<A>, right: Predicate<A>): boolean
export function or<A, B extends A, C extends A>(
  left: Refinement<A, B>,
  right: Refinement<A, C>,
): Refinement<A, B | C>
export function or<A>(left: Predicate<A>, right: Predicate<A>): Predicate<A>
export function or<A>(
  valueOrLeft: A | Predicate<A>,
  leftOrRight: Predicate<A>,
  maybeRight?: Predicate<A>,
): boolean | Predicate<A> {
  if (arguments.length === 3) {
    const value = valueOrLeft as A
    return leftOrRight(value) || (maybeRight as Predicate<A>)(value)
  }
  const left = valueOrLeft as Predicate<A>
  const right = leftOrRight
  return (a: A) => left(a) || right(a)
}

export function not<A, B extends A>(value: A, refinement: Refinement<A, B>): value is Exclude<A, B>
export function not<A>(value: A, predicate: Predicate<A>): boolean
export function not<A, B extends A>(refinement: Refinement<A, B>): Refinement<A, Exclude<A, B>>
export function not<A>(predicate: Predicate<A>): Predicate<A>
export function not<A>(
  valueOrPredicate: A | Predicate<A>,
  maybePredicate?: Predicate<A>,
): boolean | Predicate<A> {
  if (arguments.length === 2) return !(maybePredicate as Predicate<A>)(valueOrPredicate as A)
  const predicate = valueOrPredicate as Predicate<A>
  return (a: A) => !predicate(a)
}
