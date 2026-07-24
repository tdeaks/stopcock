import type { Monoid } from './monoid'

export interface Group<A> extends Monoid<A> {
  readonly inverse: (value: A) => A
  readonly subtract: (self: A, that: A) => A
}

export const make = <A>(
  empty: A,
  combine: (self: A, that: A) => A,
  inverse: (value: A) => A,
): Group<A> => ({
  empty,
  combine,
  inverse,
  subtract: (self, that) => combine(self, inverse(that)),
  combineMany: (self, values) => {
    let result = self
    for (const value of values) result = combine(result, value)
    return result
  },
  combineAll: (values) => {
    let result = empty
    for (const value of values) result = combine(result, value)
    return result
  },
})

export const numberSum: Group<number> = make(0, (self, that) => self + that, (value) => -value)
export const bigintSum: Group<bigint> = make(
  0n,
  (self, that) => self + that,
  (value) => -value,
)
export const booleanXor: Group<boolean> = make(
  false,
  (self, that) => self !== that,
  (value) => value,
)

export const tuple = <T extends readonly unknown[]>(
  ...elements: { readonly [K in keyof T]: Group<T[K]> }
): Group<T> => {
  const empty = elements.map((element) => element.empty) as unknown as T
  return make(
    empty,
    (self, that) => {
      const result: unknown[] = new Array(elements.length)
      for (let index = 0; index < elements.length; index += 1) {
        result[index] = (elements[index] as Group<T[number]>).combine(
          self[index],
          that[index],
        )
      }
      return result as unknown as T
    },
    (value) => {
      const result: unknown[] = new Array(elements.length)
      for (let index = 0; index < elements.length; index += 1) {
        result[index] = (elements[index] as Group<T[number]>).inverse(value[index])
      }
      return result as unknown as T
    },
  )
}

export const struct = <A extends Readonly<Record<PropertyKey, unknown>>>(
  fields: { readonly [K in keyof A]: Group<A[K]> },
): Group<A> => {
  const keys = Reflect.ownKeys(fields) as (keyof A)[]
  const empty = Object.create(null) as Record<PropertyKey, unknown>
  for (const key of keys) empty[key] = fields[key].empty

  return make(
    empty as A,
    (self, that) => {
      const result = Object.create(null) as Record<PropertyKey, unknown>
      for (const key of keys) result[key] = fields[key].combine(self[key], that[key])
      return result as A
    },
    (value) => {
      const result = Object.create(null) as Record<PropertyKey, unknown>
      for (const key of keys) result[key] = fields[key].inverse(value[key])
      return result as A
    },
  )
}

/** Repeated group combination. A bigint exponent keeps this operation total. */
export const power = <A>(instance: Group<A>, value: A, exponent: bigint): A => {
  let remaining = exponent < 0n ? -exponent : exponent
  let base = exponent < 0n ? instance.inverse(value) : value
  let result = instance.empty
  while (remaining > 0n) {
    if (remaining % 2n === 1n) result = instance.combine(result, base)
    remaining /= 2n
    if (remaining > 0n) base = instance.combine(base, base)
  }
  return result
}
