import type { Option } from './option'
import { none, some } from './option'
import type { Result } from './result'
import { err, ok } from './result'

export type Nullable<A> = A | null | undefined
export type Predicate<A> = (value: A) => boolean
export type Refinement<A, B extends A> = (value: A) => value is B

export const isNullable = (value: unknown): value is null | undefined => value == null

export const isNonNullable = <A>(value: Nullable<A>): value is A => value != null

export const map =
  <A, B>(transform: (value: A) => B) =>
  (value: Nullable<A>): Nullable<B> =>
    value === null ? null : value === undefined ? undefined : transform(value)

export const flatMap =
  <A, B>(transform: (value: A) => Nullable<B>) =>
  (value: Nullable<A>): Nullable<B> =>
    value === null ? null : value === undefined ? undefined : transform(value)

export const tap =
  <A>(effect: (value: A) => void) =>
  (value: Nullable<A>): Nullable<A> => {
    if (value != null) effect(value)
    return value
  }

export function filter<A, B extends A>(
  refinement: Refinement<A, B>,
): (value: Nullable<A>) => Nullable<B>
export function filter<A>(predicate: Predicate<A>): (value: Nullable<A>) => Nullable<A>
export function filter<A>(predicate: Predicate<A>): (value: Nullable<A>) => Nullable<A> {
  return (value) => (value != null && predicate(value) ? value : undefined)
}

export const match =
  <B, A, C = B>(onNullable: () => B, onValue: (value: A) => C) =>
  (value: Nullable<A>): B | C =>
    value == null ? onNullable() : onValue(value)

export const getOrElse =
  <B>(onNullable: () => B) =>
  <A>(value: Nullable<A>): A | B =>
    value == null ? onNullable() : value

export const getWithDefault =
  <B>(defaultValue: B) =>
  <A>(value: Nullable<A>): A | B =>
    value == null ? defaultValue : value

export const toOption = <A>(value: Nullable<A>): Option<A> =>
  value == null ? none : some(value)

export const fromOption = <A>(value: Option<A>): A | undefined =>
  value._tag === 1 ? value.value : undefined

export const toResult =
  <E>(onNullable: () => E) =>
  <A>(value: Nullable<A>): Result<A, E> =>
    value == null ? err(onNullable()) : ok(value)

export const zip =
  <B>(that: Nullable<B>) =>
  <A>(self: Nullable<A>): Nullable<readonly [A, B]> =>
    self === null
      ? null
      : self === undefined
        ? undefined
        : that === null
          ? null
          : that === undefined
            ? undefined
            : [self, that]

export const zipWith =
  <A, B, C>(that: Nullable<B>, combine: (self: A, that: B) => C) =>
  (self: Nullable<A>): Nullable<C> =>
    self === null
      ? null
      : self === undefined
        ? undefined
        : that === null
          ? null
          : that === undefined
            ? undefined
            : combine(self, that)

export const toNull = <A>(value: Nullable<A>): A | null => value ?? null
export const toUndefined = <A>(value: Nullable<A>): A | undefined => value ?? undefined

/** Traverses with dense array semantics and returns `undefined` on the first nullish result. */
export const traverseReadonlyArray =
  <A, B>(transform: (value: A, index: number) => Nullable<B>) =>
  (values: readonly A[]): Nullable<readonly B[]> => {
    const result = new Array<B>(values.length)
    for (let index = 0; index < values.length; index += 1) {
      const value = transform(values[index] as A, index)
      if (value == null) return undefined
      result[index] = value
    }
    return result
  }

export const sequenceReadonlyArray = <A>(
  values: readonly Nullable<A>[],
): Nullable<readonly A[]> => traverseReadonlyArray((value: Nullable<A>) => value)(values)
