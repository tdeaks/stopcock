export interface Semigroup<A> {
  readonly combine: (self: A, that: A) => A
  readonly combineMany: (self: A, values: Iterable<A>) => A
}

export const make = <A>(combine: (self: A, that: A) => A): Semigroup<A> => ({
  combine,
  combineMany: (self, values) => {
    let result = self
    for (const value of values) result = combine(result, value)
    return result
  },
})

export const invariant =
  <A, B>(to: (value: A) => B, from: (value: B) => A) =>
  (instance: Semigroup<A>): Semigroup<B> =>
    make((self, that) => to(instance.combine(from(self), from(that))))

export const reverse = <A>(instance: Semigroup<A>): Semigroup<A> =>
  make((self, that) => instance.combine(that, self))

export const intercalate =
  <A>(separator: A) =>
  (instance: Semigroup<A>): Semigroup<A> =>
    make((self, that) => instance.combine(instance.combine(self, separator), that))

export const first = <A>(): Semigroup<A> => make((self) => self)
export const last = <A>(): Semigroup<A> => make((_self, that) => that)

export const string: Semigroup<string> = make((self, that) => self + that)
export const numberSum: Semigroup<number> = make((self, that) => self + that)
export const numberProduct: Semigroup<number> = make((self, that) => self * that)
export const bigintSum: Semigroup<bigint> = make((self, that) => self + that)
export const bigintProduct: Semigroup<bigint> = make((self, that) => self * that)
export const booleanAll: Semigroup<boolean> = make((self, that) => self && that)
export const booleanAny: Semigroup<boolean> = make((self, that) => self || that)

export const min = <A>(compare: (self: A, that: A) => number): Semigroup<A> =>
  make((self, that) => (compare(self, that) <= 0 ? self : that))

export const max = <A>(compare: (self: A, that: A) => number): Semigroup<A> =>
  make((self, that) => (compare(self, that) >= 0 ? self : that))

export const array = <A>(): Semigroup<readonly A[]> =>
  make((self, that) => {
    const result = new Array<A>(self.length + that.length)
    for (let index = 0; index < self.length; index += 1) result[index] = self[index] as A
    for (let index = 0; index < that.length; index += 1) {
      result[self.length + index] = that[index] as A
    }
    return result
  })

export const tuple = <T extends readonly unknown[]>(
  ...elements: { readonly [K in keyof T]: Semigroup<T[K]> }
): Semigroup<T> =>
  make((self, that) => {
    const result: unknown[] = new Array(elements.length)
    for (let index = 0; index < elements.length; index += 1) {
      result[index] = (elements[index] as Semigroup<T[number]>).combine(
        self[index],
        that[index],
      )
    }
    return result as unknown as T
  })

export const struct = <A extends Readonly<Record<PropertyKey, unknown>>>(
  fields: { readonly [K in keyof A]: Semigroup<A[K]> },
): Semigroup<A> => {
  const keys = Reflect.ownKeys(fields) as (keyof A)[]
  return make((self, that) => {
    const result = Object.create(null) as Record<PropertyKey, unknown>
    for (const key of keys) result[key] = fields[key].combine(self[key], that[key])
    return result as A
  })
}

export const function_ = <Input, Output>(
  output: Semigroup<Output>,
): Semigroup<(input: Input) => Output> =>
  make((self, that) => (input) => output.combine(self(input), that(input)))

