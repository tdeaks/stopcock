import type { Option } from './option'
import { none, some } from './option'
import type { Result } from './result'
import { err, ok } from './result'

export type Nullable<A> = A | null | undefined
export type Predicate<A> = (value: A) => boolean
export type Refinement<A, B extends A> = (value: A) => value is B

export const isNullable = (value: unknown): value is null | undefined => value == null

export const isNonNullable = <A>(value: Nullable<A>): value is A => value != null

export function map<A, B>(value: Nullable<A>, transform: (value: A) => B): Nullable<B>
export function map<A, B>(transform: (value: A) => B): (value: Nullable<A>) => Nullable<B>
export function map<A, B>(
  valueOrTransform: Nullable<A> | ((value: A) => B),
  maybeTransform?: (value: A) => B,
): Nullable<B> | ((value: Nullable<A>) => Nullable<B>) {
  if (arguments.length === 2) {
    const value = valueOrTransform as Nullable<A>
    const transform = maybeTransform as (value: A) => B
    return value === null ? null : value === undefined ? undefined : transform(value)
  }
  const transform = valueOrTransform as (value: A) => B
  return (value: Nullable<A>): Nullable<B> =>
    value === null ? null : value === undefined ? undefined : transform(value)
}

export function flatMap<A, B>(
  value: Nullable<A>,
  transform: (value: A) => Nullable<B>,
): Nullable<B>
export function flatMap<A, B>(
  transform: (value: A) => Nullable<B>,
): (value: Nullable<A>) => Nullable<B>
export function flatMap<A, B>(
  valueOrTransform: Nullable<A> | ((value: A) => Nullable<B>),
  maybeTransform?: (value: A) => Nullable<B>,
): Nullable<B> | ((value: Nullable<A>) => Nullable<B>) {
  if (arguments.length === 2) {
    const value = valueOrTransform as Nullable<A>
    const transform = maybeTransform as (value: A) => Nullable<B>
    return value === null ? null : value === undefined ? undefined : transform(value)
  }
  const transform = valueOrTransform as (value: A) => Nullable<B>
  return (value: Nullable<A>): Nullable<B> =>
    value === null ? null : value === undefined ? undefined : transform(value)
}

export function tap<A>(value: Nullable<A>, effect: (value: A) => void): Nullable<A>
export function tap<A>(effect: (value: A) => void): (value: Nullable<A>) => Nullable<A>
export function tap<A>(
  valueOrEffect: Nullable<A> | ((value: A) => void),
  maybeEffect?: (value: A) => void,
): Nullable<A> | ((value: Nullable<A>) => Nullable<A>) {
  if (arguments.length === 2) {
    const value = valueOrEffect as Nullable<A>
    if (value != null) (maybeEffect as (value: A) => void)(value)
    return value
  }
  const effect = valueOrEffect as (value: A) => void
  return (value: Nullable<A>): Nullable<A> => {
    if (value != null) effect(value)
    return value
  }
}

export function filter<A, B extends A>(
  value: Nullable<A>,
  refinement: Refinement<A, B>,
): Nullable<B>
export function filter<A>(value: Nullable<A>, predicate: Predicate<A>): Nullable<A>
export function filter<A, B extends A>(
  refinement: Refinement<A, B>,
): (value: Nullable<A>) => Nullable<B>
export function filter<A>(predicate: Predicate<A>): (value: Nullable<A>) => Nullable<A>
export function filter<A>(
  valueOrPredicate: Nullable<A> | Predicate<A>,
  maybePredicate?: Predicate<A>,
): Nullable<A> | ((value: Nullable<A>) => Nullable<A>) {
  if (arguments.length === 2) {
    const value = valueOrPredicate as Nullable<A>
    return value != null && (maybePredicate as Predicate<A>)(value) ? value : undefined
  }
  const predicate = valueOrPredicate as Predicate<A>
  return (value) => (value != null && predicate(value) ? value : undefined)
}

export function match<A, B, C = B>(
  value: Nullable<A>,
  onNullable: () => B,
  onValue: (value: A) => C,
): B | C
export function match<B, A, C = B>(
  onNullable: () => B,
  onValue: (value: A) => C,
): (value: Nullable<A>) => B | C
export function match<A, B, C = B>(
  valueOrOnNullable: Nullable<A> | (() => B),
  onNullableOrOnValue: (() => B) | ((value: A) => C),
  maybeOnValue?: (value: A) => C,
): B | C | ((value: Nullable<A>) => B | C) {
  if (arguments.length === 3) {
    const value = valueOrOnNullable as Nullable<A>
    return value == null
      ? (onNullableOrOnValue as () => B)()
      : (maybeOnValue as (value: A) => C)(value)
  }
  const onNullable = valueOrOnNullable as () => B
  const onValue = onNullableOrOnValue as (value: A) => C
  return (value: Nullable<A>): B | C =>
    value == null ? onNullable() : onValue(value)
}

export function getOrElse<A, B>(value: Nullable<A>, onNullable: () => B): A | B
export function getOrElse<B>(onNullable: () => B): <A>(value: Nullable<A>) => A | B
export function getOrElse<A, B>(
  valueOrOnNullable: Nullable<A> | (() => B),
  maybeOnNullable?: () => B,
): A | B | (<C>(value: Nullable<C>) => C | B) {
  if (arguments.length === 2) {
    const value = valueOrOnNullable as Nullable<A>
    return value == null ? (maybeOnNullable as () => B)() : value
  }
  const onNullable = valueOrOnNullable as () => B
  return <A>(value: Nullable<A>): A | B =>
    value == null ? onNullable() : value
}

export function getWithDefault<A, B>(value: Nullable<A>, defaultValue: B): A | B
export function getWithDefault<B>(defaultValue: B): <A>(value: Nullable<A>) => A | B
export function getWithDefault<A, B>(
  valueOrDefault: Nullable<A> | B,
  maybeDefault?: B,
): A | B | (<C>(value: Nullable<C>) => C | B) {
  if (arguments.length === 2) {
    const value = valueOrDefault as Nullable<A>
    return value == null ? (maybeDefault as B) : value
  }
  const defaultValue = valueOrDefault as B
  return <A>(value: Nullable<A>): A | B =>
    value == null ? defaultValue : value
}

export const toOption = <A>(value: Nullable<A>): Option<A> =>
  value == null ? none : some(value)

export const fromOption = <A>(value: Option<A>): A | undefined =>
  value._tag === 1 ? value.value : undefined

export function toResult<A, E>(value: Nullable<A>, onNullable: () => E): Result<A, E>
export function toResult<E>(onNullable: () => E): <A>(value: Nullable<A>) => Result<A, E>
export function toResult<A, E>(
  valueOrOnNullable: Nullable<A> | (() => E),
  maybeOnNullable?: () => E,
): Result<A, E> | (<B>(value: Nullable<B>) => Result<B, E>) {
  if (arguments.length === 2) {
    const value = valueOrOnNullable as Nullable<A>
    return value == null ? err((maybeOnNullable as () => E)()) : ok(value)
  }
  const onNullable = valueOrOnNullable as () => E
  return <A>(value: Nullable<A>): Result<A, E> =>
    value == null ? err(onNullable()) : ok(value)
}

const zipValues = <A, B>(self: Nullable<A>, that: Nullable<B>): Nullable<readonly [A, B]> =>
  self === null
    ? null
    : self === undefined
      ? undefined
      : that === null
        ? null
        : that === undefined
          ? undefined
          : [self, that]

export function zip<A, B>(self: Nullable<A>, that: Nullable<B>): Nullable<readonly [A, B]>
export function zip<B>(that: Nullable<B>): <A>(self: Nullable<A>) => Nullable<readonly [A, B]>
export function zip<A, B>(
  selfOrThat: Nullable<A> | Nullable<B>,
  maybeThat?: Nullable<B>,
): Nullable<readonly [A, B]> | (<C>(self: Nullable<C>) => Nullable<readonly [C, B]>) {
  if (arguments.length === 2) return zipValues(selfOrThat as Nullable<A>, maybeThat)
  const that = selfOrThat as Nullable<B>
  return <A>(self: Nullable<A>): Nullable<readonly [A, B]> =>
    self === null
      ? null
      : self === undefined
        ? undefined
        : that === null
          ? null
          : that === undefined
            ? undefined
            : [self, that]
}

const zipWithValues = <A, B, C>(
  self: Nullable<A>,
  that: Nullable<B>,
  combine: (self: A, that: B) => C,
): Nullable<C> =>
  self === null
    ? null
    : self === undefined
      ? undefined
      : that === null
        ? null
        : that === undefined
          ? undefined
          : combine(self, that)

export function zipWith<A, B, C>(
  self: Nullable<A>,
  that: Nullable<B>,
  combine: (self: A, that: B) => C,
): Nullable<C>
export function zipWith<A, B, C>(
  that: Nullable<B>,
  combine: (self: A, that: B) => C,
): (self: Nullable<A>) => Nullable<C>
export function zipWith<A, B, C>(
  selfOrThat: Nullable<A> | Nullable<B>,
  thatOrCombine: Nullable<B> | ((self: A, that: B) => C),
  maybeCombine?: (self: A, that: B) => C,
): Nullable<C> | ((self: Nullable<A>) => Nullable<C>) {
  if (arguments.length === 3) {
    return zipWithValues(
      selfOrThat as Nullable<A>,
      thatOrCombine as Nullable<B>,
      maybeCombine as (self: A, that: B) => C,
    )
  }
  const that = selfOrThat as Nullable<B>
  const combine = thatOrCombine as (self: A, that: B) => C
  return (self: Nullable<A>): Nullable<C> =>
    self === null
      ? null
      : self === undefined
        ? undefined
        : that === null
          ? null
          : that === undefined
            ? undefined
            : combine(self, that)
}

export const toNull = <A>(value: Nullable<A>): A | null => value ?? null
export const toUndefined = <A>(value: Nullable<A>): A | undefined => value ?? undefined

/** Traverses with dense array semantics and returns `undefined` on the first nullish result. */
const traverseReadonlyArrayValues = <A, B>(
  values: readonly A[],
  transform: (value: A, index: number) => Nullable<B>,
): Nullable<readonly B[]> => {
  const result = new Array<B>(values.length)
  for (let index = 0; index < values.length; index += 1) {
    const value = transform(values[index] as A, index)
    if (value == null) return undefined
    result[index] = value
  }
  return result
}

export function traverseReadonlyArray<A, B>(
  values: readonly A[],
  transform: (value: A, index: number) => Nullable<B>,
): Nullable<readonly B[]>
export function traverseReadonlyArray<A, B>(
  transform: (value: A, index: number) => Nullable<B>,
): (values: readonly A[]) => Nullable<readonly B[]>
export function traverseReadonlyArray<A, B>(
  valuesOrTransform: readonly A[] | ((value: A, index: number) => Nullable<B>),
  maybeTransform?: (value: A, index: number) => Nullable<B>,
): Nullable<readonly B[]> | ((values: readonly A[]) => Nullable<readonly B[]>) {
  if (arguments.length === 2) {
    return traverseReadonlyArrayValues(
      valuesOrTransform as readonly A[],
      maybeTransform as (value: A, index: number) => Nullable<B>,
    )
  }
  const transform = valuesOrTransform as (value: A, index: number) => Nullable<B>
  return (values: readonly A[]): Nullable<readonly B[]> => {
    const result = new Array<B>(values.length)
    for (let index = 0; index < values.length; index += 1) {
      const value = transform(values[index] as A, index)
      if (value == null) return undefined
      result[index] = value
    }
    return result
  }
}

export const sequenceReadonlyArray = <A>(
  values: readonly Nullable<A>[],
): Nullable<readonly A[]> => traverseReadonlyArray((value: Nullable<A>) => value)(values)
