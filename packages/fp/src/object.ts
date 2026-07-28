import { dual } from './dual-untagged'
import { none, some, type Option } from './option'
import type {
  IsPathConstructible,
  IsRemovablePath,
  LiteralPath,
  PathSegments,
  PathValue,
  PathWriteValue,
  ValidPath,
} from './types'

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

const isEnumerable = (value: object, key: PropertyKey): boolean =>
  Object.prototype.propertyIsEnumerable.call(value, key)

const enumerableKeys = (value: object): PropertyKey[] => {
  // Native `Object.keys` for the string prefix, symbols filtered explicitly
  // after -- see `record.ts#enumerableKeys`, same trade.
  const keys = Object.keys(value) as PropertyKey[]
  const symbols = Object.getOwnPropertySymbols(value)
  for (let index = 0; index < symbols.length; index += 1) {
    const symbol = symbols[index]!
    if (isEnumerable(value, symbol)) keys.push(symbol)
  }
  return keys
}

const isUnsafeKey = (key: PropertyKey): boolean =>
  key === '__proto__' || key === 'constructor' || key === 'prototype'

const assertSafeKey = (key: PropertyKey): void => {
  if (isUnsafeKey(key)) throw new TypeError(`Unsafe object key: ${String(key)}`)
}

const define = (target: object, key: PropertyKey, value: unknown): void => {
  assertSafeKey(key)
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  })
}

const cloneEnumerable = <T extends object>(value: T): T => {
  const output = Object.create(Object.getPrototypeOf(value)) as object
  for (const key of enumerableKeys(value)) define(output, key, Reflect.get(value, key))
  return output as T
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

/**
 * Guarded plain-data clone.
 *
 * The exact clone copies every own descriptor, which is the only correct thing
 * to do for accessors, non-enumerables, frozen slots, and exotic prototypes.
 * When a container is provably ordinary plain data the descriptor is
 * redundant: assigning an own default data property onto a fresh object with
 * the same prototype produces exactly what the exact path would define.
 *
 * The guard reads through the same `Reflect.ownKeys` plus
 * `getOwnPropertyDescriptor` sequence as the exact path, so a Proxy source
 * observes the same traps, and no accessor or modifier can run before the
 * shortcut has been chosen. Anything it cannot prove ordinary returns
 * `undefined` and falls back to the exact clone.
 *
 * `changedKey` must already be normalized. Arrays are excluded up front rather
 * than left to the descriptor scan: a null-prototype array would otherwise
 * reach it, and it should not depend on `length` happening to be
 * non-enumerable. The unsafe-key and accessor checks are likewise deliberate
 * belt and braces, since assignment is the one place a `__proto__` setter
 * could fire.
 */
const plainCloneWith = (
  source: object,
  changedKey: PropertyKey,
  replacement: unknown,
): object | undefined => {
  const prototype = Object.getPrototypeOf(source)
  if (prototype !== Object.prototype && prototype !== null) return undefined
  if (isUnsafeKey(changedKey)) return undefined

  const ownKeys = Reflect.ownKeys(source)
  const values = new Array<unknown>(ownKeys.length)
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index]!
    // An own `__proto__` data property is legal but cannot be reproduced by
    // assignment, and the other two are rejected by the write contract anyway.
    if (isUnsafeKey(key)) return undefined
    const descriptor = Object.getOwnPropertyDescriptor(source, key)
    if (
      descriptor === undefined ||
      !('value' in descriptor) ||
      descriptor.writable !== true ||
      descriptor.enumerable !== true ||
      descriptor.configurable !== true
    ) {
      return undefined
    }
    values[index] = descriptor.value
  }

  const output = (prototype === null ? Object.create(null) : {}) as Record<PropertyKey, unknown>
  // Same write order as the exact clone: every untouched key first, then the
  // changed key last whether or not it was already there.
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index]!
    if (key === changedKey) continue
    output[key] = values[index]
  }
  output[changedKey] = replacement
  return output
}

const clonePathContainer = (
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

  if (!remove && !sourceIsArray) {
    const plain = plainCloneWith(source, keyToChange, replacement)
    if (plain !== undefined) return plain
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

export const keys = <T extends object>(value: T): Array<keyof T> =>
  enumerableKeys(value) as Array<keyof T>

export const values = <T extends object>(value: T): Array<T[keyof T]> => {
  const result = enumerableKeys(value) as unknown[]
  for (let index = 0; index < result.length; index += 1) {
    const key = result[index] as PropertyKey
    result[index] = Reflect.get(value, key)
  }
  return result as Array<T[keyof T]>
}

export const entries = <T extends object>(value: T): Array<readonly [keyof T, T[keyof T]]> => {
  const result = enumerableKeys(value) as unknown[]
  for (let index = 0; index < result.length; index += 1) {
    const key = result[index] as keyof T
    result[index] = [key, Reflect.get(value, key) as T[keyof T]]
  }
  return result as Array<readonly [keyof T, T[keyof T]]>
}

export const pick: {
  <T extends object, const K extends readonly (keyof T)[]>(
    value: T,
    selected: K,
  ): Pick<T, K[number]>
  <T extends object, const K extends readonly (keyof T)[]>(
    selected: K,
  ): (value: T) => Pick<T, K[number]>
} = /* @__PURE__ */ dual(
  2,
  <T extends object, const K extends readonly (keyof T)[]>(
    value: T,
    selected: K,
  ): Pick<T, K[number]> => {
    const output = Object.create(null) as object
    for (const key of selected) {
      if (hasOwn(value, key) && isEnumerable(value, key)) {
        define(output, key, Reflect.get(value, key))
      }
    }
    return output as Pick<T, K[number]>
  },
)

export const omit: {
  <T extends object, const K extends readonly (keyof T)[]>(value: T, omitted: K): Omit<T, K[number]>
  <T extends object, const K extends readonly (keyof T)[]>(
    omitted: K,
  ): (value: T) => Omit<T, K[number]>
} = /* @__PURE__ */ dual(
  2,
  <T extends object, const K extends readonly (keyof T)[]>(
    value: T,
    omitted: K,
  ): Omit<T, K[number]> => {
    const excluded = new Set<PropertyKey>(omitted)
    const output = Object.create(null) as object
    for (const key of enumerableKeys(value)) {
      if (!excluded.has(key)) define(output, key, Reflect.get(value, key))
    }
    return output as Omit<T, K[number]>
  },
)

export const assoc: {
  <T extends object, K extends PropertyKey, V>(
    value: T,
    key: K,
    replacement: V,
  ): Omit<T, K> & { readonly [P in K]: V }
  <K extends PropertyKey, V>(
    key: K,
    replacement: V,
  ): <T extends object>(value: T) => Omit<T, K> & { readonly [P in K]: V }
} = /* @__PURE__ */ dual(
  3,
  <T extends object, K extends PropertyKey, V>(
    value: T,
    key: K,
    replacement: V,
  ): Omit<T, K> & { readonly [P in K]: V } => {
    const output = cloneEnumerable(value)
    define(output, key, replacement)
    return output as Omit<T, K> & { readonly [P in K]: V }
  },
)

export const dissoc: {
  <T extends object, K extends keyof T>(value: T, key: K): Omit<T, K>
  <K extends PropertyKey>(key: K): <T extends object>(value: T) => Omit<T, Extract<K, keyof T>>
} = /* @__PURE__ */ dual(2, <T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> => {
  const output = Object.create(Object.getPrototypeOf(value)) as object
  for (const current of enumerableKeys(value)) {
    if (current !== key) define(output, current, Reflect.get(value, current))
  }
  return output as Omit<T, K>
})

export const mapValues: {
  <T extends object, B>(value: T, f: (value: T[keyof T], key: keyof T) => B): { [K in keyof T]: B }
  <T extends object, B>(
    f: (value: T[keyof T], key: keyof T) => B,
  ): (value: T) => { [K in keyof T]: B }
} = /* @__PURE__ */ dual(
  2,
  <T extends object, B>(
    value: T,
    f: (value: T[keyof T], key: keyof T) => B,
  ): { [K in keyof T]: B } => {
    const output = Object.create(null) as object
    for (const key of enumerableKeys(value)) {
      define(output, key, f(Reflect.get(value, key) as T[keyof T], key as keyof T))
    }
    return output as { [K in keyof T]: B }
  },
)

export const mapKeys: {
  <T extends object, K extends PropertyKey>(
    value: T,
    f: (key: keyof T, value: T[keyof T]) => K,
  ): Record<K, T[keyof T]>
  <T extends object, K extends PropertyKey>(
    f: (key: keyof T, value: T[keyof T]) => K,
  ): (value: T) => Record<K, T[keyof T]>
} = /* @__PURE__ */ dual(
  2,
  <T extends object, K extends PropertyKey>(
    value: T,
    f: (key: keyof T, value: T[keyof T]) => K,
  ): Record<K, T[keyof T]> => {
    const output = Object.create(null) as object
    for (const key of enumerableKeys(value)) {
      const current = Reflect.get(value, key) as T[keyof T]
      define(output, f(key as keyof T, current), current)
    }
    return output as Record<K, T[keyof T]>
  },
)

export const pickBy: {
  <T extends object>(value: T, predicate: (value: T[keyof T], key: keyof T) => boolean): Partial<T>
  <T extends object>(
    predicate: (value: T[keyof T], key: keyof T) => boolean,
  ): (value: T) => Partial<T>
} = /* @__PURE__ */ dual(
  2,
  <T extends object>(
    value: T,
    predicate: (value: T[keyof T], key: keyof T) => boolean,
  ): Partial<T> => {
    const output = Object.create(null) as object
    for (const key of enumerableKeys(value)) {
      const current = Reflect.get(value, key) as T[keyof T]
      if (predicate(current, key as keyof T)) define(output, key, current)
    }
    return output as Partial<T>
  },
)

export const omitBy: typeof pickBy = /* @__PURE__ */ dual(
  2,
  <T extends object>(
    value: T,
    predicate: (value: T[keyof T], key: keyof T) => boolean,
  ): Partial<T> => {
    const output = Object.create(null) as object
    for (const key of enumerableKeys(value)) {
      const current = Reflect.get(value, key) as T[keyof T]
      if (!predicate(current, key as keyof T)) define(output, key, current)
    }
    return output as Partial<T>
  },
)

export const invert = <T extends Readonly<Record<PropertyKey, PropertyKey>>>(
  value: T,
): Record<T[keyof T], keyof T> => {
  const output = Object.create(null) as object
  for (const key of enumerableKeys(value)) {
    define(output, Reflect.get(value, key) as PropertyKey, key)
  }
  return output as Record<T[keyof T], keyof T>
}

export const mergeWith: {
  <A extends object, B extends object>(
    left: A,
    right: B,
    resolve: (left: unknown, right: unknown, key: keyof A | keyof B) => unknown,
  ): A & B
  <A extends object, B extends object>(
    right: B,
    resolve: (left: unknown, right: unknown, key: keyof A | keyof B) => unknown,
  ): (left: A) => A & B
} = /* @__PURE__ */ dual(
  3,
  <A extends object, B extends object>(
    left: A,
    right: B,
    resolve: (left: unknown, right: unknown, key: keyof A | keyof B) => unknown,
  ): A & B => {
    const output = cloneEnumerable(left)
    for (const key of enumerableKeys(right)) {
      const rightValue = Reflect.get(right, key)
      define(
        output,
        key,
        hasOwn(left, key)
          ? resolve(Reflect.get(left, key), rightValue, key as keyof A | keyof B)
          : rightValue,
      )
    }
    return output as A & B
  },
)

export interface DeepMergeOptions {
  readonly bias?: 'left' | 'right'
  readonly arrays?: 'replace' | 'concat' | 'merge-index'
  readonly onConflict?: (left: unknown, right: unknown, path: readonly PropertyKey[]) => unknown
}

const deepMerge = (
  left: unknown,
  right: unknown,
  options: DeepMergeOptions,
  path: readonly PropertyKey[],
  seen: WeakMap<object, WeakMap<object, unknown>>,
): unknown => {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (options.arrays === 'concat') return [...left, ...right]
    if (options.arrays === 'merge-index') {
      const length = Math.max(left.length, right.length)
      const output = new Array<unknown>(length)
      for (let index = 0; index < length; index++) {
        output[index] =
          index in left && index in right
            ? deepMerge(left[index], right[index], options, [...path, index], seen)
            : index in right
              ? right[index]
              : left[index]
      }
      return output
    }
    return options.bias === 'left' ? left.slice() : right.slice()
  }

  if (!isPlainObject(left) || !isPlainObject(right)) {
    if (options.onConflict) return options.onConflict(left, right, path)
    return options.bias === 'left' ? left : right
  }

  let rightSeen = seen.get(left)
  if (!rightSeen) {
    rightSeen = new WeakMap()
    seen.set(left, rightSeen)
  } else if (rightSeen.has(right)) {
    return rightSeen.get(right)
  }

  const output = Object.create(null) as Record<PropertyKey, unknown>
  rightSeen.set(right, output)
  for (const key of enumerableKeys(left)) define(output, key, Reflect.get(left, key))
  for (const key of enumerableKeys(right)) {
    const rightValue = Reflect.get(right, key)
    define(
      output,
      key,
      hasOwn(left, key)
        ? deepMerge(Reflect.get(left, key), rightValue, options, [...path, key], seen)
        : rightValue,
    )
  }
  return output
}

export const mergeDeep: {
  <A, B>(left: A, right: B, options?: DeepMergeOptions): A & B
  <B>(right: B, options?: DeepMergeOptions): <A>(left: A) => A & B
} = function mergeDeep<A, B>(
  leftOrRight: A | B,
  rightOrOptions?: B | DeepMergeOptions,
  maybeOptions: DeepMergeOptions = {},
): (A & B) | (<T>(left: T) => T & A) {
  if (
    arguments.length < 2 ||
    (arguments.length === 2 &&
      rightOrOptions !== null &&
      typeof rightOrOptions === 'object' &&
      ('bias' in rightOrOptions || 'arrays' in rightOrOptions || 'onConflict' in rightOrOptions))
  ) {
    const right = leftOrRight as A
    const options = (rightOrOptions as DeepMergeOptions | undefined) ?? {}
    return <T>(left: T): T & A => deepMerge(left, right, options, [], new WeakMap()) as T & A
  }
  return deepMerge(leftOrRight, rightOrOptions, maybeOptions, [], new WeakMap()) as A & B
} as {
  <A, B>(left: A, right: B, options?: DeepMergeOptions): A & B
  <B>(right: B, options?: DeepMergeOptions): <A>(left: A) => A & B
}

const readPath = <T, const P extends PathSegments>(value: T, path: P): Option<PathValue<T, P>> => {
  let current: unknown = value
  for (const key of path) {
    if (current === null || (typeof current !== 'object' && typeof current !== 'function')) {
      return none
    }
    if (!hasOwn(current, key)) return none
    current = Reflect.get(current, key)
  }
  return some(current as PathValue<T, P>)
}

export const getPathOrUndefined: {
  <T, const P extends PathSegments>(value: T, path: P): PathValue<T, P> | undefined
  <const P extends PathSegments>(path: P): <T>(value: T) => PathValue<T, P> | undefined
} = /* @__PURE__ */ dual(
  2,
  <T, const P extends PathSegments>(value: T, path: P): PathValue<T, P> | undefined => {
    let current: unknown = value
    for (const key of path) {
      if (current === null || (typeof current !== 'object' && typeof current !== 'function')) {
        return undefined
      }
      if (!hasOwn(current, key)) return undefined
      current = Reflect.get(current, key)
    }
    return current as PathValue<T, P>
  },
)

export const getPath: {
  <T, const P extends PathSegments>(value: T, path: P): Option<PathValue<T, P>>
  <const P extends PathSegments>(path: P): <T>(value: T) => Option<PathValue<T, P>>
} = /* @__PURE__ */ dual(
  2,
  <T, const P extends PathSegments>(value: T, path: P): Option<PathValue<T, P>> =>
    readPath(value, path),
)

export const hasPath: {
  <T>(value: T, path: PathSegments): boolean
  (path: PathSegments): <T>(value: T) => boolean
} = /* @__PURE__ */ dual(2, <T>(value: T, path: PathSegments): boolean => {
  let current: unknown = value
  for (const key of path) {
    if (current === null || (typeof current !== 'object' && typeof current !== 'function')) {
      return false
    }
    if (!hasOwn(current, key)) return false
    current = Reflect.get(current, key)
  }
  return true
})

const updatePath = (
  value: unknown,
  path: PathSegments,
  modify: (current: unknown, present: boolean) => unknown,
  readLeaf: boolean,
  depth = 0,
): unknown => {
  if (depth === path.length) return modify(value, true)
  const key = path[depth]
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
    : updatePath(current, path, modify, readLeaf, depth + 1)
  return clonePathContainer(source, key, next, false)
}

type ValidSetSource<T, P extends PathSegments, B> = [P] extends [ValidPath<T>]
  ? IsPathConstructible<T, P> extends true
    ? [B] extends [PathWriteValue<T, P>]
      ? unknown
      : never
    : never
  : never

type ValidModifySource<T, P extends PathSegments, A, B> = [P] extends [ValidPath<T>]
  ? IsPathConstructible<T, P> extends true
    ? [PathValue<T, P>] extends [A]
      ? [B] extends [PathWriteValue<T, P>]
        ? unknown
        : never
      : never
    : never
  : never

type ValidRemoveSource<T, P extends PathSegments> = [P] extends [ValidPath<T>]
  ? IsRemovablePath<T, P> extends true
    ? unknown
    : never
  : never

/**
 * Immutably replaces the focus at a valid tuple path.
 *
 * This is deliberately type-preserving: `replacement` must fit the declared
 * focus type and the result remains `T`. The empty path focuses the whole
 * value. Use an optic when changing a focus type should also change the source
 * type. A write that could encounter a missing container is accepted only when
 * the path itself supplies every required sibling needed to construct it.
 */
export const setPath: {
  <T, const P extends PathSegments>(
    value: T,
    path: P &
      LiteralPath<P> &
      ([P] extends [ValidPath<T>] ? unknown : never) &
      (IsPathConstructible<T, P> extends true ? unknown : never),
    replacement: NoInfer<PathWriteValue<T, P>>,
  ): T
  <const P extends PathSegments, B>(
    path: P & LiteralPath<P>,
    replacement: B,
  ): <T>(value: T & ValidSetSource<T, P, B>) => T
} = /* @__PURE__ */ dual(
  3,
  <T, const P extends PathSegments>(value: T, path: P, replacement: PathWriteValue<T, P>): T =>
    (path.length === 0 ? replacement : updatePath(value, path, () => replacement, false)) as T,
)

/**
 * Immutably modifies the focus at a valid tuple path.
 *
 * The callback receives the observable focus type, including `undefined` when
 * an optional intermediate or unchecked array index can be absent. Its result
 * must fit the declared write type, so this operation also preserves `T`.
 * Missing containers follow the same complete-construction rule as `setPath`.
 */
export const modifyPath: {
  <T, const P extends PathSegments>(
    value: T,
    path: P &
      LiteralPath<P> &
      ([P] extends [ValidPath<T>] ? unknown : never) &
      (IsPathConstructible<T, P> extends true ? unknown : never),
    f: (current: PathValue<T, P>) => NoInfer<PathWriteValue<T, P>>,
  ): T
  <const P extends PathSegments, A, B>(
    path: P & LiteralPath<P>,
    f: (current: A) => B,
  ): <T>(value: T & ValidModifySource<T, P, A, B>) => T
} = /* @__PURE__ */ dual(
  3,
  <T, const P extends PathSegments>(
    value: T,
    path: P,
    f: (current: PathValue<T, P>) => PathWriteValue<T, P>,
  ): T =>
    (path.length === 0
      ? f(value as PathValue<T, P>)
      : updatePath(value, path, (current) => f(current as PathValue<T, P>), true)) as T,
)

const removePathValue = (value: unknown, path: PathSegments, depth: number): unknown => {
  if (value === null || value === undefined) return value
  if (!isSupportedArray(value) && !isPlainObject(value)) {
    throw new TypeError('Object paths can only traverse arrays and plain objects')
  }

  const key = path[depth]
  assertSafeKey(key)
  if (!hasOwn(value, key)) return value

  if (depth + 1 === path.length) {
    return clonePathContainer(value, key, undefined, true)
  }

  const current = Reflect.get(value, key)
  const next = removePathValue(current, path, depth + 1)
  if (next === current) return value
  return clonePathContainer(value, key, next, false)
}

/**
 * Immutably removes an optional object property or optional tuple element.
 *
 * Required leaves and array indices are rejected because deleting either while
 * returning `T` would be unsound. An empty path is an identity operation.
 */
export const removePath: {
  <T, const P extends PathSegments>(
    value: T,
    path: P &
      LiteralPath<P> &
      ([P] extends [ValidPath<T>] ? unknown : never) &
      (IsRemovablePath<T, P> extends true ? unknown : never),
  ): T
  <const P extends PathSegments>(
    path: P & LiteralPath<P>,
  ): <T>(value: T & ValidRemoveSource<T, P>) => T
} = /* @__PURE__ */ dual(
  2,
  <T>(value: T, path: PathSegments): T =>
    (path.length === 0 ? value : removePathValue(value, path, 0)) as T,
)

export const pathOf =
  <T>() =>
  <const P extends ValidPath<T>>(...path: P & LiteralPath<P>): P =>
    path

/** Module-private, so no caller value can ever collide with it. */
const ABSENT = Symbol('absent path')

const isTraversable = (value: unknown): value is object =>
  value !== null && (typeof value === 'object' || typeof value === 'function')

const readSegments = (value: unknown, path: PathSegments): unknown => {
  let current = value
  for (let depth = 0; depth < path.length; depth += 1) {
    const key = path[depth]
    if (!isTraversable(current) || !hasOwn(current, key)) return ABSENT
    current = (current as Record<PropertyKey, unknown>)[key]
  }
  return current
}

/**
 * Bounded static depth branches. Beyond three segments the generic loop wins
 * back nothing worth unrolling, so it stays the fallback.
 */
const compileReader = (path: PathSegments): ((value: unknown) => unknown) => {
  if (path.length === 1) {
    const k0 = path[0]!
    return (value) =>
      isTraversable(value) && hasOwn(value, k0)
        ? (value as Record<PropertyKey, unknown>)[k0]
        : ABSENT
  }
  if (path.length === 2) {
    const k0 = path[0]!
    const k1 = path[1]!
    return (value) => {
      if (!isTraversable(value) || !hasOwn(value, k0)) return ABSENT
      const inner = (value as Record<PropertyKey, unknown>)[k0]
      return isTraversable(inner) && hasOwn(inner, k1)
        ? (inner as Record<PropertyKey, unknown>)[k1]
        : ABSENT
    }
  }
  if (path.length === 3) {
    const k0 = path[0]!
    const k1 = path[1]!
    const k2 = path[2]!
    return (value) => {
      if (!isTraversable(value) || !hasOwn(value, k0)) return ABSENT
      const inner = (value as Record<PropertyKey, unknown>)[k0]
      if (!isTraversable(inner) || !hasOwn(inner, k1)) return ABSENT
      const leaf = (inner as Record<PropertyKey, unknown>)[k1]
      return isTraversable(leaf) && hasOwn(leaf, k2)
        ? (leaf as Record<PropertyKey, unknown>)[k2]
        : ABSENT
    }
  }
  return (value) => readSegments(value, path)
}

export interface CompiledPath<T, P extends PathSegments> {
  /** The frozen copy the reader was compiled from. */
  readonly path: P
  readonly get: (value: T) => Option<PathValue<T, P>>
  readonly getOrUndefined: (value: T) => PathValue<T, P> | undefined
  readonly has: (value: T) => boolean
}

/**
 * Compiles a path once so repeated reads stop re-walking it.
 *
 * The segments are copied and frozen at compile time, so a later mutation of
 * the caller's array cannot change what the reader does. Results match
 * `getPath`, `getPathOrUndefined`, and `hasPath` exactly, including a present
 * `undefined` leaf, which stays `Some(undefined)`.
 *
 * There is no compiled write. A path write is dominated by structurally
 * cloning each container, not by walking the path, so compiling one buys
 * nothing measurable.
 */
export const compilePathOf =
  <T>() =>
  <const P extends ValidPath<T>>(...path: P & LiteralPath<P>): CompiledPath<T, P> => {
    const segments = Object.freeze([...path]) as unknown as PathSegments
    const read = compileReader(segments)
    return Object.freeze({
      path: segments as unknown as P,
      get: (value: T): Option<PathValue<T, P>> => {
        const found = read(value)
        return found === ABSENT ? none : some(found as PathValue<T, P>)
      },
      getOrUndefined: (value: T): PathValue<T, P> | undefined => {
        const found = read(value)
        return found === ABSENT ? undefined : (found as PathValue<T, P>)
      },
      has: (value: T): boolean => read(value) !== ABSENT,
    })
  }

export const evolve: {
  <T extends object>(
    value: T,
    transformations: Partial<{ readonly [K in keyof T]: (value: T[K]) => T[K] }>,
  ): T
  <T extends object>(
    transformations: Partial<{ readonly [K in keyof T]: (value: T[K]) => T[K] }>,
  ): (value: T) => T
} = /* @__PURE__ */ dual(
  2,
  <T extends object>(
    value: T,
    transformations: Partial<{ readonly [K in keyof T]: (value: T[K]) => T[K] }>,
  ): T => {
    const output = cloneEnumerable(value)
    for (const key of enumerableKeys(transformations)) {
      if (!hasOwn(value, key)) continue
      const transform = Reflect.get(transformations, key) as
        | ((current: unknown) => unknown)
        | undefined
      if (transform) define(output, key, transform(Reflect.get(value, key)))
    }
    return output
  },
)
