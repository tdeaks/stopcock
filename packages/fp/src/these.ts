import type { Option } from './option'
import { none, some } from './option'
import type { Semigroup } from './semigroup'

export interface Left<E> {
  readonly _tag: 'Left'
  readonly left: E
}

export interface Right<A> {
  readonly _tag: 'Right'
  readonly right: A
}

export interface Both<E, A> {
  readonly _tag: 'Both'
  readonly left: E
  readonly right: A
}

export type These<E, A> = Left<E> | Right<A> | Both<E, A>

export const left = <E>(value: E): Left<E> => ({ _tag: 'Left', left: value })
export const right = <A>(value: A): Right<A> => ({ _tag: 'Right', right: value })
export const both = <E, A>(leftValue: E, rightValue: A): Both<E, A> => ({
  _tag: 'Both',
  left: leftValue,
  right: rightValue,
})

export const isLeft = <E, A>(value: These<E, A>): value is Left<E> => value._tag === 'Left'
export const isRight = <E, A>(value: These<E, A>): value is Right<A> => value._tag === 'Right'
export const isBoth = <E, A>(value: These<E, A>): value is Both<E, A> => value._tag === 'Both'

export const match: {
  <E, A, B, C = B, D = B>(
    value: These<E, A>,
    onLeft: (value: E) => B,
    onRight: (value: A) => C,
    onBoth: (leftValue: E, rightValue: A) => D,
  ): B | C | D
  <E, A, B, C = B, D = B>(
    onLeft: (value: E) => B,
    onRight: (value: A) => C,
    onBoth: (leftValue: E, rightValue: A) => D,
  ): (value: These<E, A>) => B | C | D
} = function match<E, A, B, C = B, D = B>(
  __arg0: any,
  __arg1?: any,
  __arg2?: any,
  __arg3?: any,
): any {
  if (arguments.length >= 4) return match(__arg1, __arg2, __arg3)(__arg0)
  const onLeft = __arg0
  const onRight = __arg1
  const onBoth = __arg2
  return (value: These<E, A>): B | C | D => {
    switch (value._tag) {
      case 'Left':
        return onLeft(value.left)
      case 'Right':
        return onRight(value.right)
      case 'Both':
        return onBoth(value.left, value.right)
    }
  }
} as any

export const map: {
  <A, B, E>(value: These<E, A>, transform: (value: A) => B): These<E, B>
  <A, B>(transform: (value: A) => B): <E>(value: These<E, A>) => These<E, B>
} = function map<A, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return map(__arg1)(__arg0)
  const transform = __arg0
  return <E>(value: These<E, A>): These<E, B> => {
    switch (value._tag) {
      case 'Left':
        return value
      case 'Right':
        return right(transform(value.right))
      case 'Both':
        return both(value.left, transform(value.right))
    }
  }
} as any

export const mapLeft: {
  <E, G, A>(value: These<E, A>, transform: (value: E) => G): These<G, A>
  <E, G>(transform: (value: E) => G): <A>(value: These<E, A>) => These<G, A>
} = function mapLeft<E, G>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return mapLeft(__arg1)(__arg0)
  const transform = __arg0
  return <A>(value: These<E, A>): These<G, A> => {
    switch (value._tag) {
      case 'Left':
        return left(transform(value.left))
      case 'Right':
        return value
      case 'Both':
        return both(transform(value.left), value.right)
    }
  }
} as any

export const bimap: {
  <E, G, A, B>(
    value: These<E, A>,
    mapError: (value: E) => G,
    mapValue: (value: A) => B,
  ): These<G, B>
  <E, G, A, B>(
    mapError: (value: E) => G,
    mapValue: (value: A) => B,
  ): (value: These<E, A>) => These<G, B>
} = function bimap<E, G, A, B>(__arg0: any, __arg1?: any, __arg2?: any): any {
  if (arguments.length >= 3) return bimap(__arg1, __arg2)(__arg0)
  const mapError = __arg0
  const mapValue = __arg1
  return (value: These<E, A>): These<G, B> => {
    switch (value._tag) {
      case 'Left':
        return left(mapError(value.left))
      case 'Right':
        return right(mapValue(value.right))
      case 'Both':
        return both(mapError(value.left), mapValue(value.right))
    }
  }
} as any

export const swap = <E, A>(value: These<E, A>): These<A, E> => {
  switch (value._tag) {
    case 'Left':
      return right(value.left)
    case 'Right':
      return left(value.right)
    case 'Both':
      return both(value.right, value.left)
  }
}

export const getLeft = <E, A>(value: These<E, A>): Option<E> =>
  value._tag === 'Right' ? none : some(value.left)

export const getRight = <E, A>(value: These<E, A>): Option<A> =>
  value._tag === 'Left' ? none : some(value.right)

export const getBoth = <E, A>(value: These<E, A>): Option<readonly [E, A]> =>
  value._tag === 'Both' ? some([value.left, value.right] as const) : none

export const fromOptions = <E, A>(
  leftValue: Option<E>,
  rightValue: Option<A>,
): Option<These<E, A>> => {
  if (leftValue._tag === 1) {
    return rightValue._tag === 1
      ? some(both(leftValue.value, rightValue.value))
      : some(left(leftValue.value))
  }
  return rightValue._tag === 1 ? some(right(rightValue.value)) : none
}

export const flatMap: {
  <E, A, B>(
    value: These<E, A>,
    errors: Semigroup<E>,
    transform: (value: A) => These<E, B>,
  ): These<E, B>
  <E>(
    errors: Semigroup<E>,
  ): <A, B>(transform: (value: A) => These<E, B>) => (value: These<E, A>) => These<E, B>
} = function flatMap<E>(__arg0: any, __arg1?: any, __arg2?: any): any {
  if (arguments.length >= 3) return flatMap(__arg1)(__arg2)(__arg0)
  const errors = __arg0
  return <A, B>(transform: (value: A) => These<E, B>) =>
  (value: These<E, A>): These<E, B> => {
    if (value._tag === 'Left') return value
    if (value._tag === 'Right') return transform(value.right)

    const next = transform(value.right)
    switch (next._tag) {
      case 'Left':
        return left(errors.combine(value.left, next.left))
      case 'Right':
        return both(value.left, next.right)
      case 'Both':
        return both(errors.combine(value.left, next.left), next.right)
    }
  }
} as any

export const zipWith: {
  <E, A, B, C>(
    self: These<E, A>,
    errors: Semigroup<E>,
    that: These<E, B>,
    combineValues: (self: A, that: B) => C,
  ): These<E, C>
  <E>(
    errors: Semigroup<E>,
  ): <A, B, C>(
    that: These<E, B>,
    combineValues: (self: A, that: B) => C,
  ) => (self: These<E, A>) => These<E, C>
} = function zipWith<E>(__arg0: any, __arg1?: any, __arg2?: any, __arg3?: any): any {
  if (arguments.length >= 4) return zipWith(__arg1)(__arg2, __arg3)(__arg0)
  const errors = __arg0
  return <A, B, C>(that: These<E, B>, combineValues: (self: A, that: B) => C) =>
  (self: These<E, A>): These<E, C> => {
    // Inline the previous flatMap(map(...)) graph while retaining its exact
    // property-read and callback order. In particular, flatMap reads the tag
    // twice for non-Left values, and map reads a Both's left before combining
    // its right value.
    if (self._tag === 'Left') return self

    if (self._tag === 'Right') {
      const selfValue = self.right
      switch (that._tag) {
        case 'Left':
          return that
        case 'Right':
          return right(combineValues(selfValue, that.right))
        case 'Both':
          return both(that.left, combineValues(selfValue, that.right))
      }
    }

    const selfValue = self.right
    let next: These<E, C>
    switch (that._tag) {
      case 'Left':
        next = that
        break
      case 'Right':
        next = right(combineValues(selfValue, that.right))
        break
      case 'Both':
        next = both(that.left, combineValues(selfValue, that.right))
        break
    }
    switch (next._tag) {
      case 'Left':
        return left(errors.combine(self.left, next.left))
      case 'Right':
        return both(self.left, next.right)
      case 'Both':
        return both(errors.combine(self.left, next.left), next.right)
    }
  }
} as any

export const getSemigroup = <E, A>(
  errors: Semigroup<E>,
  values: Semigroup<A>,
): Semigroup<These<E, A>> => {
  const combine = (self: These<E, A>, that: These<E, A>): These<E, A> => {
    if (self._tag === 'Left') {
      if (that._tag === 'Left') return left(errors.combine(self.left, that.left))
      if (that._tag === 'Right') return both(self.left, that.right)
      return both(errors.combine(self.left, that.left), that.right)
    }

    if (self._tag === 'Right') {
      if (that._tag === 'Left') return both(that.left, self.right)
      if (that._tag === 'Right') return right(values.combine(self.right, that.right))
      return both(that.left, values.combine(self.right, that.right))
    }

    if (that._tag === 'Left') return both(errors.combine(self.left, that.left), self.right)
    if (that._tag === 'Right') return both(self.left, values.combine(self.right, that.right))
    return both(errors.combine(self.left, that.left), values.combine(self.right, that.right))
  }

  return {
    combine,
    combineMany: (self, collection) => {
      let result = self
      for (const value of collection) result = combine(result, value)
      return result
    },
  }
}
