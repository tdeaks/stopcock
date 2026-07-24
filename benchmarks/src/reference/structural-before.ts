/*
 * Frozen pre-structural-wave implementations.
 *
 * This module is benchmark evidence, not an alternate implementation. Keep it
 * self-contained and change it only when deliberately replacing the baseline.
 */
import type { NonEmptyArray } from '../../../packages/fp/src/non-empty-array'
import { none, some, type Option } from '../../../packages/fp/src/option'
import type { Lens, Traversal } from '../../../packages/fp/src/optic'
import type { Ord } from '../../../packages/fp/src/ord'

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

const enumerableKeysBefore = (value: object): PropertyKey[] =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key),
  )

const asNonEmpty = <A>(values: A[]): NonEmptyArray<A> =>
  values as [A, ...A[]]

export const objectValuesBefore = <T extends object>(
  value: T,
): Array<T[keyof T]> =>
  enumerableKeysBefore(value).map((key) =>
    Reflect.get(value, key),
  ) as Array<T[keyof T]>

export const objectEntriesBefore = <T extends object>(
  value: T,
): Array<readonly [keyof T, T[keyof T]]> =>
  enumerableKeysBefore(value).map(
    (key) => [key as keyof T, Reflect.get(value, key) as T[keyof T]] as const,
  )

const objectPickByBefore = <T extends object>(
  value: T,
  predicate: (value: T[keyof T], key: keyof T) => boolean,
): Partial<T> => {
  const output = Object.create(null) as object
  for (const key of enumerableKeysBefore(value)) {
    const current = Reflect.get(value, key) as T[keyof T]
    if (predicate(current, key as keyof T)) {
      Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: current,
      })
    }
  }
  return output as Partial<T>
}

export const objectOmitByBefore = <T extends object>(
  value: T,
  predicate: (value: T[keyof T], key: keyof T) => boolean,
): Partial<T> =>
  objectPickByBefore(
    value,
    (current, key) => !predicate(current, key),
  )

const objectReadPathBefore = (
  value: unknown,
  path: readonly PropertyKey[],
): Option<unknown> => {
  let current: unknown = value
  for (const key of path) {
    if (
      current === null ||
      (typeof current !== 'object' && typeof current !== 'function')
    ) {
      return none
    }
    if (!hasOwn(current, key)) return none
    current = Reflect.get(current, key)
  }
  return some(current)
}

export const objectGetPathOrUndefinedBefore = (
  value: unknown,
  path: readonly PropertyKey[],
): unknown => {
  const result = objectReadPathBefore(value, path)
  return result._tag === 0 ? undefined : result.value
}

export const opticViewLensBefore = <S, A>(
  optic: Lens<S, A>,
  source: S,
): A => {
  const run = (value: S): A => optic.get(value)
  return run(source)
}

export const opticCollectLensBefore = <S, A>(
  optic: Lens<S, A>,
  source: S,
): readonly A[] => {
  const run = (value: S): readonly A[] => {
    const focus = some(optic.get(value))
    return focus._tag === 1 ? [focus.value] : []
  }
  return run(source)
}

const opticModifyLensBefore = <S, A>(
  optic: Lens<S, A>,
  source: S,
  modify: (focus: A) => A,
): S => optic.replace(source, modify(optic.get(source)))

export const opticSetLensBefore = <S, A>(
  optic: Lens<S, A>,
  source: S,
  focus: A,
): S => opticModifyLensBefore(optic, source, (_value: A): A => focus)

export const opticComposeCollectBefore = <S, A, B>(
  outer: Traversal<S, A>,
  inner: Traversal<A, B>,
  source: S,
): readonly B[] => {
  const output: B[] = []
  for (const first of outer.collect(source)) {
    output.push(...inner.collect(first))
  }
  return output
}

export const ordSortBefore = <A>(
  instance: Ord<A>,
  values: readonly A[],
): A[] =>
  Array.from(values, (value, index) => ({ value, index }))
    .sort(
      (self, that) =>
        instance.compare(self.value, that.value) || self.index - that.index,
    )
    .map(({ value }) => value)

export const neaFromIterableBefore = <A>(
  values: Iterable<A>,
): Option<NonEmptyArray<A>> => {
  const array = Array.from(values)
  if (array.length === 0) return none
  const result = new Array<A>(array.length)
  for (let index = 0; index < array.length; index += 1) {
    result[index] = array[index] as A
  }
  return some(asNonEmpty(result))
}

export const neaUnsafeFromReadonlyArrayBefore = <A>(
  values: readonly A[],
): NonEmptyArray<A> => {
  const fromReadonlyArrayBefore = (
    source: readonly A[],
  ): Option<NonEmptyArray<A>> => {
    if (source.length === 0) return none
    const result = new Array<A>(source.length)
    for (let index = 0; index < source.length; index += 1) {
      result[index] = source[index] as A
    }
    return some(asNonEmpty(result))
  }
  const result = fromReadonlyArrayBefore(values)
  if (result._tag === 0) throw new RangeError('Expected a non-empty array')
  return result.value
}

export const neaZipBefore = <A, B>(
  self: NonEmptyArray<A>,
  that: NonEmptyArray<B>,
): NonEmptyArray<readonly [A, B]> => {
  const combine = (left: A, right: B): readonly [A, B] =>
    [left, right] as const
  const run = (values: NonEmptyArray<A>): NonEmptyArray<readonly [A, B]> => {
    const length = Math.min(values.length, that.length)
    const result = new Array<readonly [A, B]>(length)
    for (let index = 0; index < length; index += 1) {
      result[index] = combine(values[index] as A, that[index] as B)
    }
    return asNonEmpty(result)
  }
  return run(self)
}

export const neaMinBefore = <A>(
  instance: Ord<A>,
  values: NonEmptyArray<A>,
): A => {
  const reduceBefore =
    (combine: (self: A, that: A) => A) =>
    (source: NonEmptyArray<A>): A => {
      let result = source[0]
      for (let index = 1; index < source.length; index += 1) {
        result = combine(result, source[index] as A)
      }
      return result
    }
  return reduceBefore(
    (self, that) => (instance.compare(self, that) <= 0 ? self : that),
  )(values)
}

export const neaMaxBefore = <A>(
  instance: Ord<A>,
  values: NonEmptyArray<A>,
): A => {
  const reduceBefore =
    (combine: (self: A, that: A) => A) =>
    (source: NonEmptyArray<A>): A => {
      let result = source[0]
      for (let index = 1; index < source.length; index += 1) {
        result = combine(result, source[index] as A)
      }
      return result
    }
  return reduceBefore(
    (self, that) => (instance.compare(self, that) >= 0 ? self : that),
  )(values)
}

export const neaChunksOfBefore = <A>(
  size: number,
  values: NonEmptyArray<A>,
): Option<NonEmptyArray<NonEmptyArray<A>>> => {
  if (!Number.isSafeInteger(size) || size <= 0) return none
  const chunks: NonEmptyArray<A>[] = []
  for (let offset = 0; offset < values.length; offset += size) {
    const chunk: A[] = []
    const end = Math.min(offset + size, values.length)
    for (let index = offset; index < end; index += 1) {
      chunk.push(values[index] as A)
    }
    chunks.push(asNonEmpty(chunk))
  }
  return some(asNonEmpty(chunks))
}
