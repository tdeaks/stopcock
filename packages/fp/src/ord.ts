import type { Eq } from './eq'
import { sameValueZero } from './eq'

export type Ordering = -1 | 0 | 1

export interface Ord<A> extends Eq<A> {
  readonly compare: (self: A, that: A) => Ordering
}

const normalize = (ordering: number): Ordering => (ordering < 0 ? -1 : ordering > 0 ? 1 : 0)

export const make = <A>(compare: (self: A, that: A) => number): Ord<A> => {
  const normalized = (self: A, that: A): Ordering =>
    sameValueZero(self, that) ? 0 : normalize(compare(self, that))
  return {
    compare: normalized,
    equals: (self, that) => normalized(self, that) === 0,
  }
}

export function contramap<B, A>(instance: Ord<A>, project: (value: B) => A): Ord<B>
export function contramap<B, A>(project: (value: B) => A): (instance: Ord<A>) => Ord<B>
export function contramap<B, A>(
  instanceOrProject: Ord<A> | ((value: B) => A),
  maybeProject?: (value: B) => A,
): Ord<B> | ((instance: Ord<A>) => Ord<B>) {
  if (arguments.length >= 2) {
    const instance = instanceOrProject as Ord<A>
    const project = maybeProject as (value: B) => A
    return make((self, that) => instance.compare(project(self), project(that)))
  }
  const project = instanceOrProject as (value: B) => A
  return (instance: Ord<A>): Ord<B> =>
    make((self, that) => instance.compare(project(self), project(that)))
}

export const reverse = <A>(instance: Ord<A>): Ord<A> =>
  make((self, that) => instance.compare(that, self))

export function combine<A>(self: Ord<A>, that: Ord<A>): Ord<A>
export function combine<A>(that: Ord<A>): (self: Ord<A>) => Ord<A>
export function combine<A>(
  selfOrThat: Ord<A>,
  maybeThat?: Ord<A>,
): Ord<A> | ((self: Ord<A>) => Ord<A>) {
  if (arguments.length >= 2) {
    const self = selfOrThat
    const that = maybeThat as Ord<A>
    return make((left, right) => {
      const first = self.compare(left, right)
      return first === 0 ? that.compare(left, right) : first
    })
  }
  const that = selfOrThat
  return (self: Ord<A>): Ord<A> =>
    make((left, right) => {
      const first = self.compare(left, right)
      return first === 0 ? that.compare(left, right) : first
    })
}

export const combineAll = <A>(instances: Iterable<Ord<A>>): Ord<A> => {
  const cached = Array.from(instances)
  return make((self, that) => {
    for (const instance of cached) {
      const result = instance.compare(self, that)
      if (result !== 0) return result
    }
    return 0
  })
}

export const tuple = <T extends readonly unknown[]>(
  ...elements: { readonly [K in keyof T]: Ord<T[K]> }
): Ord<T> =>
  make((self, that) => {
    for (let index = 0; index < elements.length; index += 1) {
      const result = (elements[index] as Ord<T[number]>).compare(self[index], that[index])
      if (result !== 0) return result
    }
    return 0
  })

export const array = <A>(element: Ord<A>): Ord<readonly A[]> =>
  make((self, that) => {
    const length = Math.min(self.length, that.length)
    for (let index = 0; index < length; index += 1) {
      // Indexing intentionally gives sparse arrays dense `undefined` semantics.
      const result = element.compare(self[index] as A, that[index] as A)
      if (result !== 0) return result
    }
    return normalize(self.length - that.length)
  })

export const string: Ord<string> = make((self, that) => (self < that ? -1 : 1))
export const boolean: Ord<boolean> = make((self, that) => (self ? 1 : that ? -1 : 1))
export const bigint: Ord<bigint> = make((self, that) => (self < that ? -1 : 1))
export const number: Ord<number> = make((self, that) => {
  if (Number.isNaN(self)) return Number.isNaN(that) ? 0 : 1
  if (Number.isNaN(that)) return -1
  return self < that ? -1 : 1
})
export const date: Ord<Date> = contramap((value: Date) => value.getTime())(number)

export function lessThan<A>(instance: Ord<A>, self: A, that: A): boolean
export function lessThan<A>(self: A, that: A): (instance: Ord<A>) => boolean
export function lessThan<A>(
  instanceOrSelf: Ord<A> | A,
  selfOrThat: A,
  maybeThat?: A,
): boolean | ((instance: Ord<A>) => boolean) {
  if (arguments.length >= 3) {
    return (instanceOrSelf as Ord<A>).compare(selfOrThat, maybeThat as A) === -1
  }
  const self = instanceOrSelf as A
  const that = selfOrThat
  return (instance: Ord<A>): boolean => instance.compare(self, that) === -1
}

export function lessThanOrEqual<A>(instance: Ord<A>, self: A, that: A): boolean
export function lessThanOrEqual<A>(self: A, that: A): (instance: Ord<A>) => boolean
export function lessThanOrEqual<A>(
  instanceOrSelf: Ord<A> | A,
  selfOrThat: A,
  maybeThat?: A,
): boolean | ((instance: Ord<A>) => boolean) {
  if (arguments.length >= 3) {
    return (instanceOrSelf as Ord<A>).compare(selfOrThat, maybeThat as A) !== 1
  }
  const self = instanceOrSelf as A
  const that = selfOrThat
  return (instance: Ord<A>): boolean => instance.compare(self, that) !== 1
}

export function greaterThan<A>(instance: Ord<A>, self: A, that: A): boolean
export function greaterThan<A>(self: A, that: A): (instance: Ord<A>) => boolean
export function greaterThan<A>(
  instanceOrSelf: Ord<A> | A,
  selfOrThat: A,
  maybeThat?: A,
): boolean | ((instance: Ord<A>) => boolean) {
  if (arguments.length >= 3) {
    return (instanceOrSelf as Ord<A>).compare(selfOrThat, maybeThat as A) === 1
  }
  const self = instanceOrSelf as A
  const that = selfOrThat
  return (instance: Ord<A>): boolean => instance.compare(self, that) === 1
}

export function greaterThanOrEqual<A>(instance: Ord<A>, self: A, that: A): boolean
export function greaterThanOrEqual<A>(self: A, that: A): (instance: Ord<A>) => boolean
export function greaterThanOrEqual<A>(
  instanceOrSelf: Ord<A> | A,
  selfOrThat: A,
  maybeThat?: A,
): boolean | ((instance: Ord<A>) => boolean) {
  if (arguments.length >= 3) {
    return (instanceOrSelf as Ord<A>).compare(selfOrThat, maybeThat as A) !== -1
  }
  const self = instanceOrSelf as A
  const that = selfOrThat
  return (instance: Ord<A>): boolean => instance.compare(self, that) !== -1
}

export function min<A>(instance: Ord<A>, self: A, that: A): A
export function min<A>(self: A, that: A): (instance: Ord<A>) => A
export function min<A>(
  instanceOrSelf: Ord<A> | A,
  selfOrThat: A,
  maybeThat?: A,
): A | ((instance: Ord<A>) => A) {
  if (arguments.length >= 3) {
    return (instanceOrSelf as Ord<A>).compare(selfOrThat, maybeThat as A) === 1
      ? (maybeThat as A)
      : selfOrThat
  }
  const self = instanceOrSelf as A
  const that = selfOrThat
  return (instance: Ord<A>): A => (instance.compare(self, that) === 1 ? that : self)
}

export function max<A>(instance: Ord<A>, self: A, that: A): A
export function max<A>(self: A, that: A): (instance: Ord<A>) => A
export function max<A>(
  instanceOrSelf: Ord<A> | A,
  selfOrThat: A,
  maybeThat?: A,
): A | ((instance: Ord<A>) => A) {
  if (arguments.length >= 3) {
    return (instanceOrSelf as Ord<A>).compare(selfOrThat, maybeThat as A) === -1
      ? (maybeThat as A)
      : selfOrThat
  }
  const self = instanceOrSelf as A
  const that = selfOrThat
  return (instance: Ord<A>): A => (instance.compare(self, that) === -1 ? that : self)
}

export function clamp<A>(instance: Ord<A>, value: A, minimum: A, maximum: A): A
export function clamp<A>(value: A, minimum: A, maximum: A): (instance: Ord<A>) => A
export function clamp<A>(
  instanceOrValue: Ord<A> | A,
  valueOrMinimum: A,
  minimumOrMaximum: A,
  maybeMaximum?: A,
): A | ((instance: Ord<A>) => A) {
  if (arguments.length >= 4) {
    const instance = instanceOrValue as Ord<A>
    return min(
      instance,
      max(instance, valueOrMinimum, minimumOrMaximum),
      maybeMaximum as A,
    )
  }
  const value = instanceOrValue as A
  const minimum = valueOrMinimum
  const maximum = minimumOrMaximum
  return (instance: Ord<A>): A => min(instance, max(instance, value, minimum), maximum)
}

export function between<A>(instance: Ord<A>, value: A, minimum: A, maximum: A): boolean
export function between<A>(value: A, minimum: A, maximum: A): (instance: Ord<A>) => boolean
export function between<A>(
  instanceOrValue: Ord<A> | A,
  valueOrMinimum: A,
  minimumOrMaximum: A,
  maybeMaximum?: A,
): boolean | ((instance: Ord<A>) => boolean) {
  if (arguments.length >= 4) {
    const instance = instanceOrValue as Ord<A>
    const value = valueOrMinimum
    return (
      instance.compare(value, minimumOrMaximum) !== -1 &&
      instance.compare(value, maybeMaximum as A) !== 1
    )
  }
  const value = instanceOrValue as A
  const minimum = valueOrMinimum
  const maximum = minimumOrMaximum
  return (instance: Ord<A>): boolean =>
    instance.compare(value, minimum) !== -1 && instance.compare(value, maximum) !== 1
}

/** Returns a dense, stable, sorted copy. */
export function sort<A>(instance: Ord<A>, values: readonly A[]): A[]
export function sort<A>(values: readonly A[]): (instance: Ord<A>) => A[]
export function sort<A>(
  instanceOrValues: Ord<A> | readonly A[],
  maybeValues?: readonly A[],
): A[] | ((instance: Ord<A>) => A[]) {
  if (arguments.length === 1) {
    const values = instanceOrValues as readonly A[]
    return (instance: Ord<A>): A[] => sort(instance, values)
  }
  const instance = instanceOrValues as Ord<A>
  const values = maybeValues as readonly A[]
  const result = Array.from(values)
  // Native sort does not invoke the comparator for `undefined`, so retain the
  // decorated path only for that semantic edge case (including dense holes).
  if (result.includes(undefined as unknown as A)) {
    return result
      .map((value, index) => ({ value, index }))
      .sort((self, that) => instance.compare(self.value, that.value) || self.index - that.index)
      .map(({ value }) => value)
  }
  result.sort((self, that) => instance.compare(self, that))
  return result
}
