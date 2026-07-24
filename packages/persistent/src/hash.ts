/**
 * A coherent hashing and equality strategy for persistent hash collections.
 *
 * `equals(a, b) === true` must imply `hash(a) === hash(b)`.
 */
export interface HashEq<A> {
  readonly hash: (value: A) => number
  readonly equals: (self: A, that: A) => boolean
}

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const floatBuffer = new ArrayBuffer(8)
const floatView = new DataView(floatBuffer)
const objectHashes = new WeakMap<object, number>()
const symbolHashes = new Map<symbol, number>()
let nextIdentityHash = 1

const mix = (value: number): number => {
  let hash = value | 0
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b)
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
  return (hash ^ (hash >>> 16)) | 0
}

const hashString = (value: string): number => {
  let hash = FNV_OFFSET
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), FNV_PRIME)
  }
  return mix(hash)
}

const identityHash = (value: object): number => {
  const existing = objectHashes.get(value)
  if (existing !== undefined) return existing
  const created = mix(nextIdentityHash++)
  objectHashes.set(value, created)
  return created
}

const symbolHash = (value: symbol): number => {
  const existing = symbolHashes.get(value)
  if (existing !== undefined) return existing
  const created = mix(nextIdentityHash++)
  symbolHashes.set(value, created)
  return created
}

/** JavaScript `Map` key equality: `NaN` equals itself and both zero signs are equal. */
export const sameValueZero = (self: unknown, that: unknown): boolean =>
  self === that || (self !== self && that !== that)

/**
 * Hashes values with the same semantics as JavaScript `Map`.
 *
 * Objects, functions, and non-global symbols use stable process-local identity.
 * Primitive values are hashed by value.
 */
export const hashUnknown = (value: unknown): number => {
  if (value === null) return 0x42108421
  if (value === undefined) return 0x42108422

  switch (typeof value) {
    case 'string':
      return hashString(`s:${value}`)
    case 'boolean':
      return value ? 0x42108423 : 0x42108424
    case 'number': {
      if (Number.isNaN(value)) return 0x42108425
      if (value === 0) return 0
      if (Number.isSafeInteger(value)) return mix(value)
      floatView.setFloat64(0, value)
      return mix(floatView.getInt32(0) ^ floatView.getInt32(4))
    }
    case 'bigint':
      return hashString(`i:${value}`)
    case 'symbol':
      return symbolHash(value)
    case 'function':
    case 'object':
      return identityHash(value)
  }

  // All JavaScript `typeof` cases are handled above.
  return 0
}

/** The default `HashEq`, matching JavaScript `Map` key behavior. */
export const defaultHashEq: HashEq<unknown> = {
  hash: hashUnknown,
  equals: sameValueZero,
}

/** Creates a strategy and normalizes hashes to signed 32-bit integers. */
export const makeHashEq = <A>(
  hash: (value: A) => number,
  equals: (self: A, that: A) => boolean,
): HashEq<A> => ({
  hash: (value) => hash(value) | 0,
  equals,
})

/** Derives a strategy through a stable projection. */
export const contramapHashEq = <B, A>(project: (value: B) => A, strategy: HashEq<A>): HashEq<B> =>
  makeHashEq(
    (value) => strategy.hash(project(value)),
    (self, that) => strategy.equals(project(self), project(that)),
  )
