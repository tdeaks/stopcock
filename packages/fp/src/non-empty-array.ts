import type { Eq } from './eq'
import type { Option } from './option'
import { none, some } from './option'
import type { Ord } from './ord'
import { sort as sortWith } from './ord'

export type NonEmptyArray<A> = readonly [A, ...A[]]
export type Predicate<A> = (value: A, index: number) => boolean
export type Refinement<A, B extends A> = (value: A, index: number) => value is B

const asNonEmpty = <A>(values: A[]): NonEmptyArray<A> => values as [A, ...A[]]

export const isNonEmpty = <A>(values: readonly A[]): values is NonEmptyArray<A> => values.length > 0

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

export const prepend: {
  <B, A>(values: NonEmptyArray<A>, value: B): NonEmptyArray<A | B>
  <B>(value: B): <A>(values: NonEmptyArray<A>) => NonEmptyArray<A | B>
} = function prepend<B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return prepend(__arg1)(__arg0)
  const value = __arg0
  return <A>(values: NonEmptyArray<A>): NonEmptyArray<A | B> => {
    const result = new Array<A | B>(values.length + 1)
    result[0] = value
    for (let index = 0; index < values.length; index += 1) result[index + 1] = values[index] as A
    return asNonEmpty(result)
  }
} as any

export const append: {
  <B, A>(values: NonEmptyArray<A>, value: B): NonEmptyArray<A | B>
  <B>(value: B): <A>(values: NonEmptyArray<A>) => NonEmptyArray<A | B>
} = function append<B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return append(__arg1)(__arg0)
  const value = __arg0
  return <A>(values: NonEmptyArray<A>): NonEmptyArray<A | B> => {
    const result = new Array<A | B>(values.length + 1)
    for (let index = 0; index < values.length; index += 1) result[index] = values[index] as A
    result[values.length] = value
    return asNonEmpty(result)
  }
} as any

export const concat: {
  <B, A>(self: NonEmptyArray<A>, that: NonEmptyArray<B>): NonEmptyArray<A | B>
  <B>(that: NonEmptyArray<B>): <A>(self: NonEmptyArray<A>) => NonEmptyArray<A | B>
} = function concat<B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return concat(__arg1)(__arg0)
  const that = __arg0
  return <A>(self: NonEmptyArray<A>): NonEmptyArray<A | B> => {
    const result = new Array<A | B>(self.length + that.length)
    for (let index = 0; index < self.length; index += 1) result[index] = self[index] as A
    for (let index = 0; index < that.length; index += 1) {
      result[self.length + index] = that[index] as B
    }
    return asNonEmpty(result)
  }
} as any

export const concatReadonlyArray: {
  <B, A>(self: NonEmptyArray<A>, that: readonly B[]): NonEmptyArray<A | B>
  <B>(that: readonly B[]): <A>(self: NonEmptyArray<A>) => NonEmptyArray<A | B>
} = function concatReadonlyArray<B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return concatReadonlyArray(__arg1)(__arg0)
  const that = __arg0
  return <A>(self: NonEmptyArray<A>): NonEmptyArray<A | B> => {
    const result = new Array<A | B>(self.length + that.length)
    for (let index = 0; index < self.length; index += 1) result[index] = self[index] as A
    for (let index = 0; index < that.length; index += 1) {
      result[self.length + index] = that[index] as B
    }
    return asNonEmpty(result)
  }
} as any

export const map: {
  <A, B>(values: NonEmptyArray<A>, transform: (value: A, index: number) => B): NonEmptyArray<B>
  <A, B>(transform: (value: A, index: number) => B): (values: NonEmptyArray<A>) => NonEmptyArray<B>
} = function map<A, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return map(__arg1)(__arg0)
  const transform = __arg0
  return (values: NonEmptyArray<A>): NonEmptyArray<B> => {
    const result = new Array<B>(values.length)
    for (let index = 0; index < values.length; index += 1) {
      result[index] = transform(values[index] as A, index)
    }
    return asNonEmpty(result)
  }
} as any

export const flatMap: {
  <A, B>(
    values: NonEmptyArray<A>,
    transform: (value: A, index: number) => NonEmptyArray<B>,
  ): NonEmptyArray<B>
  <A, B>(
    transform: (value: A, index: number) => NonEmptyArray<B>,
  ): (values: NonEmptyArray<A>) => NonEmptyArray<B>
} = function flatMap<A, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return flatMap(__arg1)(__arg0)
  const transform = __arg0
  return (values: NonEmptyArray<A>): NonEmptyArray<B> => {
    const result: B[] = []
    for (let index = 0; index < values.length; index += 1) {
      const chunk = transform(values[index] as A, index)
      for (let chunkIndex = 0; chunkIndex < chunk.length; chunkIndex += 1) {
        result.push(chunk[chunkIndex] as B)
      }
    }
    return asNonEmpty(result)
  }
} as any

export const filter: {
  <A, B extends A>(values: NonEmptyArray<A>, refinement: Refinement<A, B>): Option<NonEmptyArray<B>>
  <A>(values: NonEmptyArray<A>, predicate: Predicate<A>): Option<NonEmptyArray<A>>
  <A, B extends A>(
    refinement: Refinement<A, B>,
  ): (values: NonEmptyArray<A>) => Option<NonEmptyArray<B>>
  <A>(predicate: Predicate<A>): (values: NonEmptyArray<A>) => Option<NonEmptyArray<A>>
} = function filter<A>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return filter(__arg1)(__arg0)
  const predicate = __arg0 as Predicate<A>
  return ((values) => {
    const result: A[] = []
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index] as A
      if (predicate(value, index)) result.push(value)
    }
    return result.length === 0 ? none : some(asNonEmpty(result))
  }) as (values: NonEmptyArray<A>) => Option<NonEmptyArray<A>>
} as any

export const filterMap: {
  <A, B>(
    values: NonEmptyArray<A>,
    transform: (value: A, index: number) => Option<B>,
  ): Option<NonEmptyArray<B>>
  <A, B>(
    transform: (value: A, index: number) => Option<B>,
  ): (values: NonEmptyArray<A>) => Option<NonEmptyArray<B>>
} = function filterMap<A, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return filterMap(__arg1)(__arg0)
  const transform = __arg0
  return (values: NonEmptyArray<A>): Option<NonEmptyArray<B>> => {
    const result: B[] = []
    for (let index = 0; index < values.length; index += 1) {
      const value = transform(values[index] as A, index)
      if (value._tag === 1) result.push(value.value)
    }
    return result.length === 0 ? none : some(asNonEmpty(result))
  }
} as any

export const reduce: {
  <A>(values: NonEmptyArray<A>, combine: (accumulator: A, value: A, index: number) => A): A
  <A>(combine: (accumulator: A, value: A, index: number) => A): (values: NonEmptyArray<A>) => A
} = function reduce<A>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return reduce(__arg1)(__arg0)
  const combine = __arg0
  return (values: NonEmptyArray<A>): A => {
    let result = values[0]
    for (let index = 1; index < values.length; index += 1) {
      result = combine(result, values[index] as A, index)
    }
    return result
  }
} as any

export const reduceWith: {
  <A, B>(
    values: NonEmptyArray<A>,
    initial: B,
    combine: (accumulator: B, value: A, index: number) => B,
  ): B
  <A, B>(
    initial: B,
    combine: (accumulator: B, value: A, index: number) => B,
  ): (values: NonEmptyArray<A>) => B
} = function reduceWith<A, B>(__arg0: any, __arg1?: any, __arg2?: any): any {
  if (arguments.length >= 3) return reduceWith(__arg1, __arg2)(__arg0)
  const initial = __arg0
  const combine = __arg1
  return (values: NonEmptyArray<A>): B => {
    let result = initial
    for (let index = 0; index < values.length; index += 1) {
      result = combine(result, values[index] as A, index)
    }
    return result
  }
} as any

export const reverse = <A>(values: NonEmptyArray<A>): NonEmptyArray<A> => {
  const result = new Array<A>(values.length)
  for (let index = 0; index < values.length; index += 1) {
    result[index] = values[values.length - index - 1] as A
  }
  return asNonEmpty(result)
}

export const intersperse: {
  <B, A>(values: NonEmptyArray<A>, separator: B): NonEmptyArray<A | B>
  <B>(separator: B): <A>(values: NonEmptyArray<A>) => NonEmptyArray<A | B>
} = function intersperse<B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return intersperse(__arg1)(__arg0)
  const separator = __arg0
  return <A>(values: NonEmptyArray<A>): NonEmptyArray<A | B> => {
    if (values.length === 1) return [values[0]]
    const result = new Array<A | B>(values.length * 2 - 1)
    for (let index = 0; index < values.length; index += 1) {
      result[index * 2] = values[index] as A
      if (index < values.length - 1) result[index * 2 + 1] = separator
    }
    return asNonEmpty(result)
  }
} as any

export const zipWith: {
  <A, B, C>(
    self: NonEmptyArray<A>,
    that: NonEmptyArray<B>,
    combine: (self: A, that: B, index: number) => C,
  ): NonEmptyArray<C>
  <A, B, C>(
    that: NonEmptyArray<B>,
    combine: (self: A, that: B, index: number) => C,
  ): (self: NonEmptyArray<A>) => NonEmptyArray<C>
} = function zipWith<A, B, C>(__arg0: any, __arg1?: any, __arg2?: any): any {
  if (arguments.length >= 3) return zipWith(__arg1, __arg2)(__arg0)
  const that = __arg0
  const combine = __arg1
  return (self: NonEmptyArray<A>): NonEmptyArray<C> => {
    const length = Math.min(self.length, that.length)
    const result = new Array<C>(length)
    for (let index = 0; index < length; index += 1) {
      result[index] = combine(self[index] as A, that[index] as B, index)
    }
    return asNonEmpty(result)
  }
} as any

export const zip: {
  <B, A>(self: NonEmptyArray<A>, that: NonEmptyArray<B>): NonEmptyArray<readonly [A, B]>
  <B>(that: NonEmptyArray<B>): <A>(self: NonEmptyArray<A>) => NonEmptyArray<readonly [A, B]>
} = function zip<B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return zip(__arg1)(__arg0)
  const that = __arg0
  return <A>(self: NonEmptyArray<A>): NonEmptyArray<readonly [A, B]> => {
    const length = Math.min(self.length, that.length)
    const result = new Array<readonly [A, B]>(length)
    for (let index = 0; index < length; index += 1) {
      result[index] = [self[index] as A, that[index] as B]
    }
    return asNonEmpty(result)
  }
} as any

export const sort: {
  <A>(values: NonEmptyArray<A>, instance: Ord<A>): NonEmptyArray<A>
  <A>(instance: Ord<A>): (values: NonEmptyArray<A>) => NonEmptyArray<A>
} = function sort<A>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return sort(__arg1)(__arg0)
  const instance = __arg0
  return (values: NonEmptyArray<A>): NonEmptyArray<A> =>
    asNonEmpty(sortWith(instance, values))
} as any

export const min: {
  <A>(values: NonEmptyArray<A>, instance: Ord<A>): A
  <A>(instance: Ord<A>): (values: NonEmptyArray<A>) => A
} = function min<A>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return min(__arg1)(__arg0)
  const instance = __arg0
  return (values: NonEmptyArray<A>): A => {
    let result = values[0]
    for (let index = 1; index < values.length; index += 1) {
      const value = values[index] as A
      if (instance.compare(result, value) > 0) result = value
    }
    return result
  }
} as any

export const max: {
  <A>(values: NonEmptyArray<A>, instance: Ord<A>): A
  <A>(instance: Ord<A>): (values: NonEmptyArray<A>) => A
} = function max<A>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return max(__arg1)(__arg0)
  const instance = __arg0
  return (values: NonEmptyArray<A>): A => {
    let result = values[0]
    for (let index = 1; index < values.length; index += 1) {
      const value = values[index] as A
      if (instance.compare(result, value) < 0) result = value
    }
    return result
  }
} as any

export const uniq: {
  <A>(values: NonEmptyArray<A>, instance: Eq<A>): NonEmptyArray<A>
  <A>(instance: Eq<A>): (values: NonEmptyArray<A>) => NonEmptyArray<A>
} = function uniq<A>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return uniq(__arg1)(__arg0)
  const instance = __arg0
  return (values: NonEmptyArray<A>): NonEmptyArray<A> => {
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
} as any

export const groupAdjacent: {
  <A>(values: NonEmptyArray<A>, instance: Eq<A>): NonEmptyArray<NonEmptyArray<A>>
  <A>(instance: Eq<A>): (values: NonEmptyArray<A>) => NonEmptyArray<NonEmptyArray<A>>
} = function groupAdjacent<A>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return groupAdjacent(__arg1)(__arg0)
  const instance = __arg0
  return (values: NonEmptyArray<A>): NonEmptyArray<NonEmptyArray<A>> => {
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
} as any

export const chunksOf: {
  <A>(values: NonEmptyArray<A>, size: number): Option<NonEmptyArray<NonEmptyArray<A>>>
  (size: number): <A>(values: NonEmptyArray<A>) => Option<NonEmptyArray<NonEmptyArray<A>>>
} = function chunksOf(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return chunksOf(__arg1)(__arg0)
  const size = __arg0
  return <A>(values: NonEmptyArray<A>): Option<NonEmptyArray<NonEmptyArray<A>>> => {
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
} as any
