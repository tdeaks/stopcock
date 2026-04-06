export const is = <T>(ctor: new (...args: any[]) => T, val: unknown): val is T =>
  val instanceof ctor

export const isNil = (val: unknown): val is null | undefined =>
  val === null || val === undefined

export const isNotNil = <T>(val: T | null | undefined): val is T =>
  val !== null && val !== undefined

export const propIs = <T>(
  ctor: new (...args: any[]) => T,
  prop: string,
  obj: Record<string, unknown>,
): boolean => obj[prop] instanceof ctor

export const isArray = (val: unknown): val is unknown[] => Array.isArray(val)

export const isBigInt = (val: unknown): val is bigint => typeof val === 'bigint'

export const isBoolean = (val: unknown): val is boolean => typeof val === 'boolean'

export const isDate = (val: unknown): val is Date => val instanceof Date

export const isDeepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      const ai = a[i], bi = b[i]
      if (ai !== bi && !isDeepEqual(ai, bi)) return false
    }
    return true
  }
  if (Array.isArray(b)) return false

  if (a instanceof Date) return b instanceof Date && a.getTime() === b.getTime()
  if (a instanceof RegExp) return b instanceof RegExp && a.source === b.source && a.flags === b.flags

  if (a instanceof Map) {
    if (!(b instanceof Map) || a.size !== b.size) return false
    for (const [k, v] of a) if (!b.has(k) || !isDeepEqual(v, b.get(k))) return false
    return true
  }
  if (a instanceof Set) {
    if (!(b instanceof Set) || a.size !== b.size) return false
    for (const v of a) if (!b.has(v)) return false
    return true
  }

  const keysA = Object.keys(a as Record<string, unknown>)
  if (keysA.length !== Object.keys(b as Record<string, unknown>).length) return false
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i]
    if (!Object.prototype.hasOwnProperty.call(b, k) || !isDeepEqual((a as any)[k], (b as any)[k])) return false
  }
  return true
}

export const isDefined = <T>(val: T | undefined): val is T => val !== undefined

export const isEmpty = (val: unknown): boolean => {
  if (val == null) return true
  if (typeof val === 'string' || Array.isArray(val)) return (val as any).length === 0
  if (typeof val === 'object') return Object.keys(val as object).length === 0
  return false
}

export const isEmptyish = (val: unknown): boolean =>
  val === null || val === undefined || isEmpty(val)

export const isError = (val: unknown): val is Error => val instanceof Error

export const isFunction = (val: unknown): val is Function => typeof val === 'function'

export const isNonNull = <T>(val: T | null): val is T => val !== null

export const isNonNullish = <T>(val: T | null | undefined): val is T =>
  val !== null && val !== undefined

export const isNullish = (val: unknown): val is null | undefined =>
  val === null || val === undefined

export const isNumber = (val: unknown): val is number => typeof val === 'number'

export const isObjectType = (val: unknown): val is object =>
  typeof val === 'object' && val !== null

export const isPlainObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null && !Array.isArray(val) &&
  Object.getPrototypeOf(val) === Object.prototype

export const isPromise = (val: unknown): val is Promise<unknown> =>
  val instanceof Promise

export const isShallowEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  const keysA = Object.keys(a as Record<string, unknown>)
  if (keysA.length !== Object.keys(b as Record<string, unknown>).length) return false
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i]
    if ((a as any)[k] !== (b as any)[k]) return false
  }
  return true
}

export const isStrictEqual = (a: unknown, b: unknown): boolean => a === b

export const isString = (val: unknown): val is string => typeof val === 'string'

export const isSymbol = (val: unknown): val is symbol => typeof val === 'symbol'

export const isTruthy = (val: unknown): boolean => !!val
