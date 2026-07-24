/**
 * Frozen pre-optimization implementations for the scalar/text/hash gate.
 * Keep byte-stable after the contract pins its SHA-256.
 */

import type { Eq } from '../../../packages/fp/src/eq'
import type { Hash } from '../../../packages/fp/src/hash'
import type { RoundingMode } from '../../../packages/fp/src/number'

const wordPartsBefore = (value: string): string[] =>
  value
    .replace(/([a-z\d])([A-Z])/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

const capitalizeBefore = (value: string): string =>
  value === '' ? '' : value[0].toLocaleUpperCase() + value.slice(1)

export const camelCaseBefore = (value: string): string => {
  const parts = wordPartsBefore(value).map((part) => part.toLocaleLowerCase())
  return parts.length === 0
    ? ''
    : parts[0] + parts.slice(1).map(capitalizeBefore).join('')
}

export const titleCaseBefore = (value: string): string =>
  wordPartsBefore(value)
    .map((part) => capitalizeBefore(part.toLocaleLowerCase()))
    .join(' ')

export const codePointLengthBefore = (value: string): number =>
  Array.from(value).length

const gcdBodyBefore = (left: number, right: number): number => {
  let a = Math.abs(Math.trunc(left))
  let b = Math.abs(Math.trunc(right))
  while (b !== 0) [a, b] = [b, a % b]
  return a
}

export const gcdBefore: {
  (left: number, right: number): number
  (right: number): (left: number) => number
} = function (this: unknown): number | ((left: number) => number) {
  if (arguments.length >= 2) {
    return gcdBodyBefore(
      arguments[0] as unknown as number,
      arguments[1] as unknown as number,
    )
  }
  const right = arguments[0] as unknown as number
  return (left: number): number => gcdBodyBefore(left, right)
} as {
  (left: number, right: number): number
  (right: number): (left: number) => number
}

const roundToBefore = (
  value: number,
  digits: number,
  mode: RoundingMode,
): number => {
  const factor = 10 ** Math.trunc(digits)
  return Math[mode](value * factor) / factor
}

export const roundToCurriedBefore =
  (digits: number, mode: RoundingMode) =>
  (value: number): number =>
    roundToBefore(value, digits, mode)

const sameValueZeroBefore = (self: unknown, that: unknown): boolean =>
  self === that || (self !== self && that !== that)

const enumerableKeysBefore = (value: object): PropertyKey[] =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key),
  )

const isPlainObjectBefore = (
  value: unknown,
): value is Readonly<Record<PropertyKey, unknown>> => {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export const deepEqBefore: Eq<unknown> = {
  equals: (left, right) => {
    const seen = new WeakMap<object, WeakMap<object, boolean>>()

    const visit = (self: unknown, that: unknown): boolean => {
      if (sameValueZeroBefore(self, that)) return true
      if (
        self === null ||
        that === null ||
        typeof self !== 'object' ||
        typeof that !== 'object'
      ) {
        return false
      }

      const selfArray = Array.isArray(self)
      const thatArray = Array.isArray(that)
      if (selfArray !== thatArray) return false
      if (
        !selfArray &&
        (!isPlainObjectBefore(self) || !isPlainObjectBefore(that))
      ) {
        return false
      }

      let pairs = seen.get(self)
      if (pairs?.has(that)) return pairs.get(that) as boolean
      if (!pairs) {
        pairs = new WeakMap()
        seen.set(self, pairs)
      }
      pairs.set(that, true)

      if (selfArray && thatArray) {
        if (self.length !== that.length) {
          pairs.set(that, false)
          return false
        }
        for (let index = 0; index < self.length; index += 1) {
          if (!visit(self[index], that[index])) {
            pairs.set(that, false)
            return false
          }
        }
        return true
      }

      const selfKeys = enumerableKeysBefore(self)
      const thatKeys = enumerableKeysBefore(that)
      if (selfKeys.length !== thatKeys.length) {
        pairs.set(that, false)
        return false
      }
      for (const key of selfKeys) {
        if (
          !Object.prototype.propertyIsEnumerable.call(that, key) ||
          !visit(Reflect.get(self, key), Reflect.get(that, key))
        ) {
          pairs.set(that, false)
          return false
        }
      }
      return true
    }

    return visit(left, right)
  },
}

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const NULL_HASH = 0x42108421
const UNDEFINED_HASH = 0x42108422
const TRUE_HASH = 0x42108423
const FALSE_HASH = 0x42108424
const CYCLE_HASH = 0x42108425

const normalizeBefore = (value: number): number => value | 0

const combineBefore = (self: number, that: number): number => {
  let value = normalizeBefore(self ^ that)
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b)
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35)
  return normalizeBefore(value ^ (value >>> 16))
}

const makeHashBefore = <A>(hash: (value: A) => number): Hash<A> => ({
  hash: (value) => normalizeBefore(hash(value)),
})

const contramapHashBefore =
  <B, A>(project: (value: B) => A) =>
  (instance: Hash<A>): Hash<B> =>
    makeHashBefore((value) => instance.hash(project(value)))

const stringBefore: Hash<string> = makeHashBefore((value) => {
  let hash = FNV_OFFSET
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), FNV_PRIME)
  }
  return hash
})

export const numberBefore: Hash<number> = makeHashBefore((value) => {
  if (Number.isNaN(value)) return stringBefore.hash('number:NaN')
  const normalized = value === 0 ? 0 : value
  return stringBefore.hash(`number:${normalized}`)
})

const booleanBefore: Hash<boolean> = makeHashBefore((value) =>
  value ? TRUE_HASH : FALSE_HASH,
)

export const bigintBefore: Hash<bigint> = contramapHashBefore(
  (value: bigint) => `bigint:${value}`,
)(stringBefore)

export const symbolBefore: Hash<symbol> = contramapHashBefore(
  (value: symbol) =>
    `symbol:${Symbol.keyFor(value) ?? value.description ?? ''}`,
)(stringBefore)

const dateBefore: Hash<Date> = contramapHashBefore(
  (value: Date) => value.getTime(),
)(numberBefore)

export const structHashBefore = <
  A extends Readonly<Record<PropertyKey, unknown>>,
>(
  fields: { readonly [K in keyof A]: Hash<A[K]> },
): Hash<A> => {
  const keys = Reflect.ownKeys(fields) as (keyof A)[]
  return makeHashBefore((value) => {
      let hash = FNV_OFFSET
      for (const key of keys) {
        hash = combineBefore(hash, stringBefore.hash(String(key)))
        hash = combineBefore(hash, fields[key].hash(value[key]))
      }
      return hash
    })
}

const comparePropertyKeysBefore = (
  self: PropertyKey,
  that: PropertyKey,
): number => {
  const left =
    typeof self === 'symbol' ? `1:${self.description ?? ''}` : `0:${self}`
  const right =
    typeof that === 'symbol' ? `1:${that.description ?? ''}` : `0:${that}`
  return left < right ? -1 : left > right ? 1 : 0
}

export const hashUnknownBefore = (input: unknown): number => {
  const seen = new WeakMap<object, number>()
  let nextReference = 0

  const visit = (value: unknown): number => {
    if (value === null) return NULL_HASH
    if (value === undefined) return UNDEFINED_HASH

    switch (typeof value) {
      case 'string':
        return combineBefore(
          stringBefore.hash('string'),
          stringBefore.hash(value),
        )
      case 'number':
        return numberBefore.hash(value)
      case 'boolean':
        return booleanBefore.hash(value)
      case 'bigint':
        return bigintBefore.hash(value)
      case 'symbol':
        return symbolBefore.hash(value)
      case 'function':
      case 'object':
        break
    }

    const object = value as object
    const reference = seen.get(object)
    if (reference !== undefined) return combineBefore(CYCLE_HASH, reference)
    const ownReference = nextReference
    nextReference += 1
    seen.set(object, ownReference)

    if (Array.isArray(value)) {
      let hash = combineBefore(stringBefore.hash('Array'), value.length)
      for (let index = 0; index < value.length; index += 1) {
        hash = combineBefore(hash, visit(value[index]))
      }
      return hash
    }

    if (value instanceof Date) {
      return combineBefore(
        stringBefore.hash('Date'),
        dateBefore.hash(value),
      )
    }

    if (value instanceof Map) {
      let entries = 0
      for (const [key, item] of value) {
        entries = normalizeBefore(
          entries + combineBefore(visit(key), visit(item)),
        )
      }
      return combineBefore(
        combineBefore(stringBefore.hash('Map'), value.size),
        entries,
      )
    }

    if (value instanceof Set) {
      let entries = 0
      for (const item of value) {
        entries = normalizeBefore(entries + visit(item))
      }
      return combineBefore(
        combineBefore(stringBefore.hash('Set'), value.size),
        entries,
      )
    }

    if (ArrayBuffer.isView(value)) {
      const bytes = new Uint8Array(
        value.buffer,
        value.byteOffset,
        value.byteLength,
      )
      let hash = combineBefore(
        stringBefore.hash(Object.prototype.toString.call(value)),
        bytes.length,
      )
      for (const byte of bytes) hash = combineBefore(hash, byte)
      return hash
    }

    if (typeof value === 'function') {
      return combineBefore(stringBefore.hash('Function'), ownReference)
    }

    const record = value as Readonly<Record<PropertyKey, unknown>>
    const keys = Reflect.ownKeys(record)
      .filter((key) =>
        Object.prototype.propertyIsEnumerable.call(record, key),
      )
      .sort(comparePropertyKeysBefore)
    let hash = combineBefore(
      stringBefore.hash(Object.prototype.toString.call(value)),
      keys.length,
    )
    for (const key of keys) {
      hash = combineBefore(hash, stringBefore.hash(String(key)))
      hash = combineBefore(hash, visit(record[key]))
    }
    return hash
  }

  return visit(input)
}
