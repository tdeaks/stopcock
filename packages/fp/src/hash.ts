export interface Hash<A> {
  readonly hash: (value: A) => number
}

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const NULL_HASH = 0x42108421
const UNDEFINED_HASH = 0x42108422
const TRUE_HASH = 0x42108423
const FALSE_HASH = 0x42108424
const CYCLE_HASH = 0x42108425

const normalize = (value: number): number => value | 0
const defaultMathImul = Math.imul
const defaultStringConstructor = String

const hashStringFrom = (initial: number, value: string): number => {
  let hash = initial
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), FNV_PRIME)
  }
  return hash
}

const hashStringFromDefaultImul = (
  initial: number,
  value: string,
): number => {
  let hash = initial
  for (let index = 0; index < value.length; index += 1) {
    hash = defaultMathImul(hash ^ value.charCodeAt(index), FNV_PRIME)
  }
  return hash
}

const NUMBER_PREFIX_HASH = hashStringFrom(FNV_OFFSET, 'number:')
const BIGINT_PREFIX_HASH = hashStringFrom(FNV_OFFSET, 'bigint:')
const SYMBOL_PREFIX_HASH = hashStringFrom(FNV_OFFSET, 'symbol:')
const NUMBER_NAN_HASH = hashStringFrom(NUMBER_PREFIX_HASH, 'NaN')
const STRING_TAG_HASH = hashStringFrom(FNV_OFFSET, 'string')
const ARRAY_TAG_HASH = hashStringFrom(FNV_OFFSET, 'Array')
const DATE_TAG_HASH = hashStringFrom(FNV_OFFSET, 'Date')
const MAP_TAG_HASH = hashStringFrom(FNV_OFFSET, 'Map')
const SET_TAG_HASH = hashStringFrom(FNV_OFFSET, 'Set')
const FUNCTION_TAG_HASH = hashStringFrom(FNV_OFFSET, 'Function')

export const combine = (self: number, that: number): number => {
  let value = normalize(self ^ that)
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b)
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35)
  return normalize(value ^ (value >>> 16))
}

export const make = <A>(hash: (value: A) => number): Hash<A> => ({
  hash: (value) => normalize(hash(value)),
})

export const contramap =
  <B, A>(project: (value: B) => A) =>
  (instance: Hash<A>): Hash<B> =>
    make((value) => instance.hash(project(value)))

export const string: Hash<string> = make((value) => hashStringFrom(FNV_OFFSET, value))
const defaultStringHash = string.hash

const prefixedStringHash = (
  prefixHash: number,
  prefix: string,
  suffix: string,
): number => {
  const currentStringHash = string.hash
  return Math.imul === defaultMathImul &&
    currentStringHash === defaultStringHash
    ? hashStringFrom(prefixHash, suffix)
    : Reflect.apply(currentStringHash, string, [prefix + suffix])
}

const fixedTagHash = (precomputed: number, tag: string): number => {
  const currentStringHash = string.hash
  return Math.imul === defaultMathImul &&
    currentStringHash === defaultStringHash
    ? precomputed
    : Reflect.apply(currentStringHash, string, [tag])
}

export const number: Hash<number> = make((value) => {
  if (Number.isNaN(value)) {
    return prefixedStringHash(NUMBER_NAN_HASH, 'number:NaN', '')
  }
  const normalized = value === 0 ? 0 : value
  return prefixedStringHash(
    NUMBER_PREFIX_HASH,
    'number:',
    `${normalized}`,
  )
})

export const boolean: Hash<boolean> = make((value) => (value ? TRUE_HASH : FALSE_HASH))
export const bigint: Hash<bigint> = make((value) =>
  prefixedStringHash(BIGINT_PREFIX_HASH, 'bigint:', `${value}`),
)
export const symbol: Hash<symbol> = make((value) =>
  prefixedStringHash(
    SYMBOL_PREFIX_HASH,
    'symbol:',
    Symbol.keyFor(value) ?? value.description ?? '',
  ),
)
export const date: Hash<Date> = contramap((value: Date) => value.getTime())(number)

export const array = <A>(element: Hash<A>): Hash<readonly A[]> =>
  make((values) => {
    let hash = combine(FNV_OFFSET, values.length)
    for (let index = 0; index < values.length; index += 1) {
      // Indexing intentionally gives sparse arrays dense `undefined` semantics.
      hash = combine(hash, element.hash(values[index] as A))
    }
    return hash
  })

export const tuple = <T extends readonly unknown[]>(
  ...elements: { readonly [K in keyof T]: Hash<T[K]> }
): Hash<T> =>
  make((values) => {
    let hash = combine(FNV_OFFSET, values.length)
    for (let index = 0; index < elements.length; index += 1) {
      hash = combine(hash, (elements[index] as Hash<T[number]>).hash(values[index]))
    }
    return hash
  })

export const struct = <A extends Readonly<Record<PropertyKey, unknown>>>(
  fields: { readonly [K in keyof A]: Hash<A[K]> },
): Hash<A> => {
  const keys = Reflect.ownKeys(fields) as (keyof A)[]
  const keyHashes = new Array<number>(keys.length)
  for (let index = 0; index < keys.length; index += 1) {
    keyHashes[index] = normalize(
      hashStringFromDefaultImul(
        FNV_OFFSET,
        defaultStringConstructor(keys[index]),
      ),
    )
  }
  return make((value) => {
    let hash = FNV_OFFSET
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]
      const currentStringHash = string.hash
      hash = combine(
        hash,
        Math.imul === defaultMathImul &&
          currentStringHash === defaultStringHash &&
          String === defaultStringConstructor
          ? keyHashes[index]
          : Reflect.apply(currentStringHash, string, [String(key)]),
      )
      hash = combine(hash, fields[key].hash(value[key]))
    }
    return hash
  })
}

const comparePropertyKeys = (self: PropertyKey, that: PropertyKey): number => {
  const selfIsSymbol = typeof self === 'symbol'
  const thatIsSymbol = typeof that === 'symbol'
  if (selfIsSymbol !== thatIsSymbol) return selfIsSymbol ? 1 : -1
  const left = selfIsSymbol ? self.description ?? '' : `${self}`
  const right = thatIsSymbol ? that.description ?? '' : `${that}`
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Deterministic structural hashing for ordinary JavaScript values.
 *
 * Cycles are encoded by traversal position, arrays are treated densely, object
 * keys are sorted, and Map/Set contribution is order independent.
 */
export const hashUnknown = (input: unknown): number => {
  const seen = new WeakMap<object, number>()
  let nextReference = 0

  const visit = (value: unknown): number => {
    if (value === null) return NULL_HASH
    if (value === undefined) return UNDEFINED_HASH

    switch (typeof value) {
      case 'string':
        return combine(
          fixedTagHash(STRING_TAG_HASH, 'string'),
          string.hash(value),
        )
      case 'number':
        return number.hash(value)
      case 'boolean':
        return boolean.hash(value)
      case 'bigint':
        return bigint.hash(value)
      case 'symbol':
        return symbol.hash(value)
      case 'function':
      case 'object':
        break
    }

    const object = value as object
    const reference = seen.get(object)
    if (reference !== undefined) return combine(CYCLE_HASH, reference)
    const ownReference = nextReference
    nextReference += 1
    seen.set(object, ownReference)

    if (Array.isArray(value)) {
      let hash = combine(fixedTagHash(ARRAY_TAG_HASH, 'Array'), value.length)
      for (let index = 0; index < value.length; index += 1) {
        hash = combine(hash, visit(value[index]))
      }
      return hash
    }

    if (value instanceof Date) {
      return combine(fixedTagHash(DATE_TAG_HASH, 'Date'), date.hash(value))
    }

    if (value instanceof Map) {
      let entries = 0
      for (const [key, item] of value) entries = normalize(entries + combine(visit(key), visit(item)))
      return combine(
        combine(fixedTagHash(MAP_TAG_HASH, 'Map'), value.size),
        entries,
      )
    }

    if (value instanceof Set) {
      let entries = 0
      for (const item of value) entries = normalize(entries + visit(item))
      return combine(
        combine(fixedTagHash(SET_TAG_HASH, 'Set'), value.size),
        entries,
      )
    }

    if (ArrayBuffer.isView(value)) {
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      let hash = combine(string.hash(Object.prototype.toString.call(value)), bytes.length)
      for (const byte of bytes) hash = combine(hash, byte)
      return hash
    }

    if (typeof value === 'function') {
      return combine(
        fixedTagHash(FUNCTION_TAG_HASH, 'Function'),
        ownReference,
      )
    }

    const record = value as Readonly<Record<PropertyKey, unknown>>
    const keys = Reflect.ownKeys(record)
      .filter((key) => Object.prototype.propertyIsEnumerable.call(record, key))
      .sort(comparePropertyKeys)
    let hash = combine(string.hash(Object.prototype.toString.call(value)), keys.length)
    for (const key of keys) {
      hash = combine(hash, string.hash(String(key)))
      hash = combine(hash, visit(record[key]))
    }
    return hash
  }

  return visit(input)
}

export const unknown: Hash<unknown> = make(hashUnknown)
