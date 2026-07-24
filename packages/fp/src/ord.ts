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

export const contramap =
  <B, A>(project: (value: B) => A) =>
  (instance: Ord<A>): Ord<B> =>
    make((self, that) => instance.compare(project(self), project(that)))

export const reverse = <A>(instance: Ord<A>): Ord<A> =>
  make((self, that) => instance.compare(that, self))

export const combine = <A>(self: Ord<A>, that: Ord<A>): Ord<A> =>
  make((left, right) => {
    const first = self.compare(left, right)
    return first === 0 ? that.compare(left, right) : first
  })

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

export const lessThan = <A>(instance: Ord<A>, self: A, that: A): boolean =>
  instance.compare(self, that) === -1

export const lessThanOrEqual = <A>(instance: Ord<A>, self: A, that: A): boolean =>
  instance.compare(self, that) !== 1

export const greaterThan = <A>(instance: Ord<A>, self: A, that: A): boolean =>
  instance.compare(self, that) === 1

export const greaterThanOrEqual = <A>(instance: Ord<A>, self: A, that: A): boolean =>
  instance.compare(self, that) !== -1

export const min = <A>(instance: Ord<A>, self: A, that: A): A =>
  instance.compare(self, that) === 1 ? that : self

export const max = <A>(instance: Ord<A>, self: A, that: A): A =>
  instance.compare(self, that) === -1 ? that : self

export const clamp = <A>(instance: Ord<A>, value: A, minimum: A, maximum: A): A =>
  min(instance, max(instance, value, minimum), maximum)

export const between = <A>(instance: Ord<A>, value: A, minimum: A, maximum: A): boolean =>
  greaterThanOrEqual(instance, value, minimum) && lessThanOrEqual(instance, value, maximum)

/** Returns a dense, stable, sorted copy. */
export const sort = <A>(instance: Ord<A>, values: readonly A[]): A[] => {
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
