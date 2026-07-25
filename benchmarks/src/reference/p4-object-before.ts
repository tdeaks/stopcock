/*
 * Frozen pre-P4 object path write.
 *
 * This is the exact clone the guarded plain-data tier shortcuts, kept here so
 * the tier is measured against what it actually replaced rather than against
 * an approximation. Benchmark evidence, not an alternate implementation: keep
 * it self-contained and change it only when deliberately replacing the
 * baseline.
 */
type PathSegments = readonly PropertyKey[]

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

const assertSafeKey = (key: PropertyKey): void => {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    throw new TypeError(`Unsafe object key: ${String(key)}`)
  }
}

const isSupportedArray = (value: unknown): value is unknown[] => {
  if (!Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Array.prototype || prototype === null || Array.isArray(prototype)
}

const hasOwnFunctionValue = (value: object, key: PropertyKey): boolean => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor !== undefined && 'value' in descriptor && typeof descriptor.value === 'function'
}

const isOrdinaryObjectPrototype = (prototype: object): boolean => {
  if (Object.getPrototypeOf(prototype) !== null) return false
  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor')
  if (
    constructor === undefined ||
    !('value' in constructor) ||
    typeof constructor.value !== 'function'
  ) {
    return false
  }
  const constructorPrototype = Object.getOwnPropertyDescriptor(constructor.value, 'prototype')
  return (
    constructorPrototype !== undefined &&
    'value' in constructorPrototype &&
    constructorPrototype.value === prototype &&
    hasOwnFunctionValue(prototype, 'hasOwnProperty') &&
    hasOwnFunctionValue(prototype, 'propertyIsEnumerable') &&
    hasOwnFunctionValue(prototype, 'isPrototypeOf') &&
    hasOwnFunctionValue(prototype, 'toString') &&
    hasOwnFunctionValue(prototype, 'valueOf')
  )
}

const isPlainObject = (value: unknown): value is Record<PropertyKey, unknown> => {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return (
    prototype === Object.prototype || prototype === null || isOrdinaryObjectPrototype(prototype)
  )
}

const toPropertyKey = (key: PropertyKey): PropertyKey =>
  typeof key === 'symbol' ? key : String(key)

const arrayIndexOf = (key: PropertyKey): number | undefined => {
  if (typeof key !== 'string') return undefined
  const index = Number(key)
  return Number.isInteger(index) && index >= 0 && index < 0xffff_ffff && String(index) === key
    ? index
    : undefined
}

const clonePathContainerBefore = (
  source: object,
  changedKey: PropertyKey,
  replacement: unknown,
  remove: boolean,
): object => {
  const keyToChange = toPropertyKey(changedKey)
  const sourceIsArray = Array.isArray(source)
  if (sourceIsArray && keyToChange === 'length') {
    throw new TypeError('Object paths cannot write array length')
  }

  const output = sourceIsArray ? [] : Object.create(Object.getPrototypeOf(source))
  if (sourceIsArray) Object.setPrototypeOf(output, Object.getPrototypeOf(source))

  for (const key of Reflect.ownKeys(source)) {
    if (key === keyToChange || (sourceIsArray && key === 'length')) continue
    const descriptor = Object.getOwnPropertyDescriptor(source, key)
    if (descriptor !== undefined) Object.defineProperty(output, key, descriptor)
  }

  if (!remove) {
    const current = Object.getOwnPropertyDescriptor(source, keyToChange)
    const descriptor: PropertyDescriptor =
      current !== undefined && 'value' in current
        ? { ...current, value: replacement }
        : {
            configurable: current?.configurable ?? true,
            enumerable: current?.enumerable ?? true,
            value: replacement,
            writable: true,
          }
    Object.defineProperty(output, keyToChange, descriptor)
  }

  if (sourceIsArray) {
    const sourceLength = Object.getOwnPropertyDescriptor(source, 'length')
    if (sourceLength === undefined) {
      throw new TypeError('Array path source has no length descriptor')
    }
    const changedIndex = arrayIndexOf(keyToChange)
    const length =
      !remove && changedIndex !== undefined
        ? Math.max(source.length, changedIndex + 1)
        : source.length
    Object.defineProperty(output, 'length', { ...sourceLength, value: length })
  }
  return output
}

const updatePathBefore = (
  value: unknown,
  path: PathSegments,
  modify: (current: unknown, present: boolean) => unknown,
  readLeaf: boolean,
  depth = 0,
): unknown => {
  if (depth === path.length) return modify(value, true)
  const key = path[depth]!
  assertSafeKey(key)
  let source: object
  if (value === null || value === undefined) {
    source = typeof key === 'number' ? [] : {}
  } else if (isSupportedArray(value) || isPlainObject(value)) {
    source = value
  } else {
    throw new TypeError('Object paths can only traverse arrays and plain objects')
  }
  const present = hasOwn(source, key)
  const atLeaf = depth + 1 === path.length
  const current = present && (!atLeaf || readLeaf) ? Reflect.get(source, key) : undefined
  const next = atLeaf
    ? modify(current, present)
    : updatePathBefore(current, path, modify, readLeaf, depth + 1)
  return clonePathContainerBefore(source, key, next, false)
}

export const setPathBefore = <T>(value: T, path: PathSegments, replacement: unknown): T =>
  (path.length === 0 ? replacement : updatePathBefore(value, path, () => replacement, false)) as T

export const modifyPathBefore = <T>(
  value: T,
  path: PathSegments,
  f: (current: unknown) => unknown,
): T =>
  (path.length === 0 ? f(value) : updatePathBefore(value, path, (current) => f(current), true)) as T
