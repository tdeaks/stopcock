/**
 * A law-abiding equality relation.
 *
 * Instances should be reflexive, symmetric, and transitive.
 */
export interface Eq<A> {
  readonly equals: (self: A, that: A) => boolean
}

export type Equivalence<A> = Eq<A>['equals']

/** JavaScript collection equality: `NaN` equals itself and both zero signs are equal. */
export const sameValueZero = (self: unknown, that: unknown): boolean =>
  self === that || (self !== self && that !== that)

export const make = <A>(equals: Equivalence<A>): Eq<A> => ({ equals })

export const equals = <A>(instance: Eq<A>, self: A, that: A): boolean =>
  instance.equals(self, that)

export const contramap =
  <B, A>(project: (value: B) => A) =>
  (instance: Eq<A>): Eq<B> =>
    make((self, that) => instance.equals(project(self), project(that)))

export const lazy = <A>(instance: () => Eq<A>): Eq<A> => {
  let cached: Eq<A> | undefined
  return make((self, that) => {
    cached ??= instance()
    return cached.equals(self, that)
  })
}

export const tuple = <T extends readonly unknown[]>(
  ...elements: { readonly [K in keyof T]: Eq<T[K]> }
): Eq<T> =>
  make((self, that) => {
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index] as Eq<T[number]>
      if (!element.equals(self[index], that[index])) return false
    }
    return true
  })

export const struct = <A extends Readonly<Record<PropertyKey, unknown>>>(
  fields: { readonly [K in keyof A]: Eq<A[K]> },
): Eq<A> => {
  const keys = Reflect.ownKeys(fields) as (keyof A)[]
  return make((self, that) => {
    for (const key of keys) {
      if (!fields[key].equals(self[key], that[key])) return false
    }
    return true
  })
}

export const array = <A>(element: Eq<A>): Eq<readonly A[]> =>
  make((self, that) => {
    if (self.length !== that.length) return false
    for (let index = 0; index < self.length; index += 1) {
      // Indexing intentionally gives sparse arrays dense `undefined` semantics.
      if (!element.equals(self[index] as A, that[index] as A)) return false
    }
    return true
  })

export const iterable = <A>(element: Eq<A>): Eq<Iterable<A>> =>
  make((self, that) => {
    const left = self[Symbol.iterator]()
    const right = that[Symbol.iterator]()
    while (true) {
      const leftNext = left.next()
      const rightNext = right.next()
      if (leftNext.done || rightNext.done) return leftNext.done === rightNext.done
      if (!element.equals(leftNext.value, rightNext.value)) return false
    }
  })

export const strict: Eq<unknown> = make((self, that) => self === that)
export const objectIs: Eq<unknown> = make(Object.is)
export const unknown: Eq<unknown> = make(sameValueZero)
export const string: Eq<string> = unknown
export const number: Eq<number> = unknown
export const boolean: Eq<boolean> = unknown
export const bigint: Eq<bigint> = unknown
export const symbol: Eq<symbol> = unknown
export const date: Eq<Date> = contramap((value: Date) => value.getTime())(number)

const enumerableKeys = (value: object): PropertyKey[] => {
  const keys = Reflect.ownKeys(value)
  let count = 0
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (Object.prototype.propertyIsEnumerable.call(value, key)) {
      keys[count] = key
      count += 1
    }
  }
  keys.length = count
  return keys
}

const isPlainObject = (value: unknown): value is Readonly<Record<PropertyKey, unknown>> => {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Cycle-safe structural equality for dense arrays and plain records.
 *
 * Other built-ins and class instances are atomic: only the initial
 * SameValueZero check can make them equal.
 */
export const deep: Eq<unknown> = make((left, right) => {
  let seen: WeakMap<object, WeakSet<object>> | undefined

  const visit = (self: unknown, that: unknown): boolean => {
    if (self === that) return true
    const selfType = typeof self
    if (selfType === 'number' && self !== self && that !== that) return true
    if (
      self === null ||
      that === null ||
      selfType !== 'object' ||
      typeof that !== 'object'
    ) {
      return false
    }

    const selfArray = Array.isArray(self)
    const thatArray = Array.isArray(that)
    if (selfArray !== thatArray) return false
    if (!selfArray && (!isPlainObject(self) || !isPlainObject(that))) return false

    let pairs = seen?.get(self)
    if (pairs?.has(that)) return true
    if (!pairs) {
      pairs = new WeakSet()
      const references = seen ?? (seen = new WeakMap())
      references.set(self, pairs)
    }
    // Optimistically record the pair before descending through cycles.
    pairs.add(that)

    if (selfArray && thatArray) {
      if (self.length !== that.length) return false
      for (let index = 0; index < self.length; index++) {
        if (!visit(self[index], that[index])) return false
      }
      return true
    }

    const selfKeys = enumerableKeys(self)
    const thatKeys = enumerableKeys(that)
    if (selfKeys.length !== thatKeys.length) return false
    for (let index = 0; index < selfKeys.length; index += 1) {
      const key = selfKeys[index]
      if (
        !Object.prototype.propertyIsEnumerable.call(that, key) ||
        !visit(Reflect.get(self, key), Reflect.get(that, key))
      ) {
        return false
      }
    }
    return true
  }

  return visit(left, right)
})
