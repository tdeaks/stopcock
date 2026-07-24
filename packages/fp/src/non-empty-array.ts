import type { Eq } from './eq'
import type { Option } from './option'
import { none, some } from './option'
import type { Ord } from './ord'
import { sort as sortWith } from './ord'

export type NonEmptyArray<A> = readonly [A, ...A[]]
export type Predicate<A> = (value: A, index: number) => boolean
export type Refinement<A, B extends A> = (value: A, index: number) => value is B

const asNonEmpty = <A>(values: A[]): NonEmptyArray<A> => values as [A, ...A[]]

export const isNonEmpty = <A>(values: readonly A[]): values is NonEmptyArray<A> =>
  values.length > 0

export const of = <A>(value: A): NonEmptyArray<A> => [value]

/** Copies and densifies an array before refining it. */
export const fromReadonlyArray = <A>(values: readonly A[]): Option<NonEmptyArray<A>> => {
  if (values.length === 0) return none
  const result = new Array<A>(values.length)
  for (let index = 0; index < values.length; index += 1) result[index] = values[index] as A
  return some(asNonEmpty(result))
}

export const fromIterable = <A>(values: Iterable<A>): Option<NonEmptyArray<A>> => {
  const result = Array.from(values)
  return result.length === 0 ? none : some(asNonEmpty(result))
}

export const unsafeFromReadonlyArray = <A>(values: readonly A[]): NonEmptyArray<A> => {
  if (values.length === 0) throw new RangeError('Expected a non-empty array')
  const result = new Array<A>(values.length)
  for (let index = 0; index < values.length; index += 1) result[index] = values[index] as A
  return asNonEmpty(result)
}

export const head = <A>(values: NonEmptyArray<A>): A => values[0]
export const last = <A>(values: NonEmptyArray<A>): A => values[values.length - 1] as A

export const tail = <A>(values: NonEmptyArray<A>): readonly A[] => {
  const result = new Array<A>(values.length - 1)
  for (let index = 1; index < values.length; index += 1) result[index - 1] = values[index] as A
  return result
}

export const init = <A>(values: NonEmptyArray<A>): readonly A[] => {
  const result = new Array<A>(values.length - 1)
  for (let index = 0; index < values.length - 1; index += 1) result[index] = values[index] as A
  return result
}

export const prepend =
  <B>(value: B) =>
  <A>(values: NonEmptyArray<A>): NonEmptyArray<A | B> => {
    const result = new Array<A | B>(values.length + 1)
    result[0] = value
    for (let index = 0; index < values.length; index += 1) result[index + 1] = values[index] as A
    return asNonEmpty(result)
  }

export const append =
  <B>(value: B) =>
  <A>(values: NonEmptyArray<A>): NonEmptyArray<A | B> => {
    const result = new Array<A | B>(values.length + 1)
    for (let index = 0; index < values.length; index += 1) result[index] = values[index] as A
    result[values.length] = value
    return asNonEmpty(result)
  }

export const concat =
  <B>(that: NonEmptyArray<B>) =>
  <A>(self: NonEmptyArray<A>): NonEmptyArray<A | B> => {
    const result = new Array<A | B>(self.length + that.length)
    for (let index = 0; index < self.length; index += 1) result[index] = self[index] as A
    for (let index = 0; index < that.length; index += 1) {
      result[self.length + index] = that[index] as B
    }
    return asNonEmpty(result)
  }

export const concatReadonlyArray =
  <B>(that: readonly B[]) =>
  <A>(self: NonEmptyArray<A>): NonEmptyArray<A | B> => {
    const result = new Array<A | B>(self.length + that.length)
    for (let index = 0; index < self.length; index += 1) result[index] = self[index] as A
    for (let index = 0; index < that.length; index += 1) {
      result[self.length + index] = that[index] as B
    }
    return asNonEmpty(result)
  }

export const map =
  <A, B>(transform: (value: A, index: number) => B) =>
  (values: NonEmptyArray<A>): NonEmptyArray<B> => {
    const result = new Array<B>(values.length)
    for (let index = 0; index < values.length; index += 1) {
      result[index] = transform(values[index] as A, index)
    }
    return asNonEmpty(result)
  }

export const flatMap =
  <A, B>(transform: (value: A, index: number) => NonEmptyArray<B>) =>
  (values: NonEmptyArray<A>): NonEmptyArray<B> => {
    const result: B[] = []
    for (let index = 0; index < values.length; index += 1) {
      const chunk = transform(values[index] as A, index)
      for (let chunkIndex = 0; chunkIndex < chunk.length; chunkIndex += 1) {
        result.push(chunk[chunkIndex] as B)
      }
    }
    return asNonEmpty(result)
  }

export function filter<A, B extends A>(
  refinement: Refinement<A, B>,
): (values: NonEmptyArray<A>) => Option<NonEmptyArray<B>>
export function filter<A>(
  predicate: Predicate<A>,
): (values: NonEmptyArray<A>) => Option<NonEmptyArray<A>>
export function filter<A>(
  predicate: Predicate<A>,
): (values: NonEmptyArray<A>) => Option<NonEmptyArray<A>> {
  return (values) => {
    const result: A[] = []
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index] as A
      if (predicate(value, index)) result.push(value)
    }
    return result.length === 0 ? none : some(asNonEmpty(result))
  }
}

export const filterMap =
  <A, B>(transform: (value: A, index: number) => Option<B>) =>
  (values: NonEmptyArray<A>): Option<NonEmptyArray<B>> => {
    const result: B[] = []
    for (let index = 0; index < values.length; index += 1) {
      const value = transform(values[index] as A, index)
      if (value._tag === 1) result.push(value.value)
    }
    return result.length === 0 ? none : some(asNonEmpty(result))
  }

export const reduce =
  <A>(combine: (accumulator: A, value: A, index: number) => A) =>
  (values: NonEmptyArray<A>): A => {
    let result = values[0]
    for (let index = 1; index < values.length; index += 1) {
      result = combine(result, values[index] as A, index)
    }
    return result
  }

export const reduceWith =
  <A, B>(initial: B, combine: (accumulator: B, value: A, index: number) => B) =>
  (values: NonEmptyArray<A>): B => {
    let result = initial
    for (let index = 0; index < values.length; index += 1) {
      result = combine(result, values[index] as A, index)
    }
    return result
  }

export const reverse = <A>(values: NonEmptyArray<A>): NonEmptyArray<A> => {
  const result = new Array<A>(values.length)
  for (let index = 0; index < values.length; index += 1) {
    result[index] = values[values.length - index - 1] as A
  }
  return asNonEmpty(result)
}

export const intersperse =
  <B>(separator: B) =>
  <A>(values: NonEmptyArray<A>): NonEmptyArray<A | B> => {
    if (values.length === 1) return [values[0]]
    const result = new Array<A | B>(values.length * 2 - 1)
    for (let index = 0; index < values.length; index += 1) {
      result[index * 2] = values[index] as A
      if (index < values.length - 1) result[index * 2 + 1] = separator
    }
    return asNonEmpty(result)
  }

export const zipWith =
  <A, B, C>(that: NonEmptyArray<B>, combine: (self: A, that: B, index: number) => C) =>
  (self: NonEmptyArray<A>): NonEmptyArray<C> => {
    const length = Math.min(self.length, that.length)
    const result = new Array<C>(length)
    for (let index = 0; index < length; index += 1) {
      result[index] = combine(self[index] as A, that[index] as B, index)
    }
    return asNonEmpty(result)
  }

export const zip =
  <B>(that: NonEmptyArray<B>) =>
  <A>(self: NonEmptyArray<A>): NonEmptyArray<readonly [A, B]> => {
    const length = Math.min(self.length, that.length)
    const result = new Array<readonly [A, B]>(length)
    for (let index = 0; index < length; index += 1) {
      result[index] = [self[index] as A, that[index] as B]
    }
    return asNonEmpty(result)
  }

export const sort =
  <A>(instance: Ord<A>) =>
  (values: NonEmptyArray<A>): NonEmptyArray<A> =>
    asNonEmpty(sortWith(instance, values))

export const min =
  <A>(instance: Ord<A>) =>
  (values: NonEmptyArray<A>): A => {
    let result = values[0]
    for (let index = 1; index < values.length; index += 1) {
      const value = values[index] as A
      if (instance.compare(result, value) > 0) result = value
    }
    return result
  }

export const max =
  <A>(instance: Ord<A>) =>
  (values: NonEmptyArray<A>): A => {
    let result = values[0]
    for (let index = 1; index < values.length; index += 1) {
      const value = values[index] as A
      if (instance.compare(result, value) < 0) result = value
    }
    return result
  }

export const uniq =
  <A>(instance: Eq<A>) =>
  (values: NonEmptyArray<A>): NonEmptyArray<A> => {
    const result: A[] = []
    outer: for (let index = 0; index < values.length; index += 1) {
      const value = values[index] as A
      for (const existing of result) {
        if (instance.equals(existing, value)) continue outer
      }
      result.push(value)
    }
    return asNonEmpty(result)
  }

export const groupAdjacent =
  <A>(instance: Eq<A>) =>
  (values: NonEmptyArray<A>): NonEmptyArray<NonEmptyArray<A>> => {
    const groups: NonEmptyArray<A>[] = []
    let current: A[] = [values[0]]
    for (let index = 1; index < values.length; index += 1) {
      const value = values[index] as A
      if (instance.equals(current[current.length - 1] as A, value)) current.push(value)
      else {
        groups.push(asNonEmpty(current))
        current = [value]
      }
    }
    groups.push(asNonEmpty(current))
    return asNonEmpty(groups)
  }

export const chunksOf =
  (size: number) =>
  <A>(values: NonEmptyArray<A>): Option<NonEmptyArray<NonEmptyArray<A>>> => {
    if (!Number.isSafeInteger(size) || size <= 0) return none
    const chunks: NonEmptyArray<A>[] = []
    for (let offset = 0; offset < values.length; offset += size) {
      const end = Math.min(offset + size, values.length)
      const chunk = new Array<A>(end - offset)
      for (let index = offset; index < end; index += 1) {
        chunk[index - offset] = values[index] as A
      }
      chunks.push(asNonEmpty(chunk))
    }
    return some(asNonEmpty(chunks))
  }
