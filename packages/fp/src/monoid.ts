import type { Semigroup } from './semigroup'

export interface Monoid<A> extends Semigroup<A> {
  readonly empty: A
  readonly combineAll: (values: Iterable<A>) => A
}

export const make = <A>(empty: A, combine: (self: A, that: A) => A): Monoid<A> => ({
  empty,
  combine,
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

export const fromSemigroup =
  <A>(empty: A) =>
  (instance: Semigroup<A>): Monoid<A> =>
    make(empty, instance.combine)

export const invariant =
  <A, B>(to: (value: A) => B, from: (value: B) => A) =>
  (instance: Monoid<A>): Monoid<B> =>
    make(to(instance.empty), (self, that) =>
      to(instance.combine(from(self), from(that))),
    )

export const dual = <A>(instance: Monoid<A>): Monoid<A> =>
  make(instance.empty, (self, that) => instance.combine(that, self))

export const string: Monoid<string> = make('', (self, that) => self + that)
export const numberSum: Monoid<number> = make(0, (self, that) => self + that)
export const numberProduct: Monoid<number> = make(1, (self, that) => self * that)
export const bigintSum: Monoid<bigint> = make(0n, (self, that) => self + that)
export const bigintProduct: Monoid<bigint> = make(1n, (self, that) => self * that)
export const booleanAll: Monoid<boolean> = make(true, (self, that) => self && that)
export const booleanAny: Monoid<boolean> = make(false, (self, that) => self || that)
export const booleanXor: Monoid<boolean> = make(false, (self, that) => self !== that)
export const void_: Monoid<void> = make<void>(undefined, () => undefined)

export const array = <A>(): Monoid<readonly A[]> =>
  make<readonly A[]>([], (self, that) => {
    const result = new Array<A>(self.length + that.length)
    for (let index = 0; index < self.length; index += 1) result[index] = self[index] as A
    for (let index = 0; index < that.length; index += 1) {
      result[self.length + index] = that[index] as A
    }
    return result
  })

export const endomorphism = <A>(): Monoid<(value: A) => A> =>
  make(
    (value) => value,
    (self, that) => (value) => that(self(value)),
  )

export const tuple = <T extends readonly unknown[]>(
  ...elements: { readonly [K in keyof T]: Monoid<T[K]> }
): Monoid<T> => {
  const empty = elements.map((element) => element.empty) as unknown as T
  return make(empty, (self, that) => {
    const result: unknown[] = new Array(elements.length)
    for (let index = 0; index < elements.length; index += 1) {
      result[index] = (elements[index] as Monoid<T[number]>).combine(
        self[index],
        that[index],
      )
    }
    return result as unknown as T
  })
}

export const struct = <A extends Readonly<Record<PropertyKey, unknown>>>(
  fields: { readonly [K in keyof A]: Monoid<A[K]> },
): Monoid<A> => {
  const keys = Reflect.ownKeys(fields) as (keyof A)[]
  const empty = Object.create(null) as Record<PropertyKey, unknown>
  for (const key of keys) empty[key] = fields[key].empty
  return make(empty as A, (self, that) => {
    const result = Object.create(null) as Record<PropertyKey, unknown>
    for (const key of keys) result[key] = fields[key].combine(self[key], that[key])
    return result as A
  })
}

export const function_ = <Input, Output>(
  output: Monoid<Output>,
): Monoid<(input: Input) => Output> =>
  make<(input: Input) => Output>(
    (_input: Input) => output.empty,
    (self, that) => (input: Input) => output.combine(self(input), that(input)),
  )
