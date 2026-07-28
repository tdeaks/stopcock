import { describe, expect, it } from 'vite-plus/test'
import * as MapOps from '../map'
import * as Obj from '../object'
import { none, some } from '../option'
import type { PathSegments } from '../types'

/**
 * Pinned copy of the exact clone the plain-data tier shortcuts.
 *
 * This is the whole point of the file: the tier is only allowed to exist
 * because its output is indistinguishable from this, down to prototype, key
 * order, and every property flag.
 */
const exactClonePathContainer = (
  source: object,
  changedKey: PropertyKey,
  replacement: unknown,
  remove: boolean,
): object => {
  const keyToChange = typeof changedKey === 'symbol' ? changedKey : String(changedKey)
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
    Object.defineProperty(
      output,
      keyToChange,
      current !== undefined && 'value' in current
        ? { ...current, value: replacement }
        : {
            configurable: current?.configurable ?? true,
            enumerable: current?.enumerable ?? true,
            value: replacement,
            writable: true,
          },
    )
  }

  if (sourceIsArray) {
    const sourceLength = Object.getOwnPropertyDescriptor(source, 'length')
    if (sourceLength === undefined)
      throw new TypeError('Array path source has no length descriptor')
    const index = typeof keyToChange === 'string' ? Number(keyToChange) : Number.NaN
    const isIndex =
      Number.isInteger(index) && index >= 0 && index < 0xffff_ffff && String(index) === keyToChange
    Object.defineProperty(output, 'length', {
      ...sourceLength,
      value: !remove && isIndex ? Math.max(source.length, index + 1) : source.length,
    })
  }
  return output
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
  if (constructor === undefined || !('value' in constructor)) return false
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

const isPlainObject = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return (
    prototype === Object.prototype || prototype === null || isOrdinaryObjectPrototype(prototype)
  )
}

const exactUpdatePath = (
  value: unknown,
  path: PathSegments,
  modify: (current: unknown, present: boolean) => unknown,
  readLeaf: boolean,
  depth = 0,
): unknown => {
  if (depth === path.length) return modify(value, true)
  const key = path[depth]!
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    throw new TypeError(`Unsafe object key: ${String(key)}`)
  }
  let source: object
  if (value === null || value === undefined) source = typeof key === 'number' ? [] : {}
  else if (isSupportedArray(value) || isPlainObject(value)) source = value as object
  else throw new TypeError('Object paths can only traverse arrays and plain objects')

  const present = Object.prototype.hasOwnProperty.call(source, key)
  const atLeaf = depth + 1 === path.length
  const current = present && (!atLeaf || readLeaf) ? Reflect.get(source, key) : undefined
  const next = atLeaf
    ? modify(current, present)
    : exactUpdatePath(current, path, modify, readLeaf, depth + 1)
  return exactClonePathContainer(source, key, next, false)
}

const exactSetPath = (value: unknown, path: PathSegments, replacement: unknown): unknown =>
  path.length === 0 ? replacement : exactUpdatePath(value, path, () => replacement, false)

/** Structural identity, not `toEqual`: prototype, key order, and every flag. */
const expectIndistinguishable = (actual: unknown, expected: unknown, where: string): void => {
  if (typeof expected !== 'object' || expected === null) {
    expect(actual, where).toBe(expected)
    return
  }
  expect(typeof actual, where).toBe('object')
  expect(Object.getPrototypeOf(actual as object), `${where} prototype`).toBe(
    Object.getPrototypeOf(expected),
  )
  const actualKeys = Reflect.ownKeys(actual as object)
  expect(actualKeys, `${where} own key order`).toEqual(Reflect.ownKeys(expected))
  for (const key of actualKeys) {
    const actualDescriptor = Object.getOwnPropertyDescriptor(actual as object, key)!
    const expectedDescriptor = Object.getOwnPropertyDescriptor(expected, key)!
    expect({ ...actualDescriptor, value: undefined }, `${where}.${String(key)} flags`).toEqual({
      ...expectedDescriptor,
      value: undefined,
    })
    if ('value' in expectedDescriptor) {
      expectIndistinguishable(
        actualDescriptor.value,
        expectedDescriptor.value,
        `${where}.${String(key)}`,
      )
    }
  }
}

const marker = Symbol('marker')

const withDescriptor = (base: Record<string, unknown>, key: string, extra: PropertyDescriptor) => {
  const target = { ...base }
  Object.defineProperty(target, key, {
    value: 1,
    writable: true,
    enumerable: true,
    configurable: true,
    ...extra,
  })
  return target
}

class Instance {
  constructor(public inner: Record<string, unknown>) {}
}

/**
 * Stands in for a cross-realm `Object.prototype`: traversable, ordinary, and
 * still not the prototype the fast tier knows how to reproduce.
 */
const foreignObjectPrototype = (): object => {
  const prototype = Object.create(null) as object
  const constructor = function Foreign() {} as unknown as { prototype: object }
  Object.defineProperty(constructor, 'prototype', { value: prototype })
  const flags = { writable: true, configurable: true }
  Object.defineProperty(prototype, 'constructor', { value: constructor, ...flags })
  for (const key of [
    'hasOwnProperty',
    'propertyIsEnumerable',
    'isPrototypeOf',
    'toString',
    'valueOf',
  ] as const) {
    Object.defineProperty(prototype, key, { value: Object.prototype[key], ...flags })
  }
  return prototype
}

const nullPrototypeArray = (): unknown[] => Object.setPrototypeOf([1, 2, 3], null) as unknown[]

const shapes = (): ReadonlyArray<readonly [string, unknown]> => [
  ['plain', { a: 1, b: 2, inner: { c: 3, d: 4 } }],
  ['null prototype', Object.assign(Object.create(null), { a: 1, inner: { c: 3 } })],
  ['null prototype nested', { a: 1, inner: Object.assign(Object.create(null), { c: 3 }) }],
  ['symbol keys', { a: 1, [marker]: 'm', inner: { c: 3, [marker]: 'n' } }],
  ['non-enumerable', withDescriptor({ a: 1, inner: { c: 3 } }, 'hidden', { enumerable: false })],
  [
    'nested non-enumerable',
    { a: 1, inner: withDescriptor({ c: 3 }, 'hidden', { enumerable: false }) },
  ],
  ['non-writable', withDescriptor({ a: 1, inner: { c: 3 } }, 'locked', { writable: false })],
  ['non-configurable', withDescriptor({ a: 1, inner: { c: 3 } }, 'fixed', { configurable: false })],
  [
    'accessor',
    Object.defineProperty({ a: 1, inner: { c: 3 } }, 'computed', {
      get: () => 7,
      enumerable: true,
      configurable: true,
    }),
  ],
  [
    'nested accessor',
    {
      a: 1,
      inner: Object.defineProperty({ c: 3 }, 'computed', {
        get: () => 7,
        enumerable: true,
        configurable: true,
      }),
    },
  ],
  [
    'own __proto__ data property',
    Object.defineProperty({ a: 1, inner: { c: 3 } }, '__proto__', {
      value: 'literal',
      writable: true,
      enumerable: true,
      configurable: true,
    }),
  ],
  ['frozen', Object.freeze({ a: 1, inner: { c: 3 } })],
  ['frozen nested', { a: 1, inner: Object.freeze({ c: 3 }) }],
  ['sealed', Object.seal({ a: 1, inner: { c: 3 } })],
  ['exotic prototype', Object.create(Object.create(null, {}))],
  [
    'foreign object prototype',
    Object.assign(Object.create(foreignObjectPrototype()) as object, { a: 1, inner: { c: 3 } }),
  ],
  [
    'foreign object prototype nested',
    { a: 1, inner: Object.assign(Object.create(foreignObjectPrototype()) as object, { c: 3 }) },
  ],
  ['array leaf', { a: 1, inner: { c: 3 }, list: [1, 2, 3] }],
  ['null prototype array leaf', { a: 1, inner: { c: 3 }, list: nullPrototypeArray() }],
  ['null prototype array root', nullPrototypeArray()],
  ['sparse array', { a: 1, inner: { c: 3 }, list: [1, , 3] }],
  ['missing intermediate', { a: 1 }],
  ['numeric keys', { 0: 'zero', 2: 'two', a: 1, inner: { c: 3 } }],
]

const writePaths: readonly PathSegments[] = [
  ['a'],
  ['b'],
  ['inner', 'c'],
  ['inner', 'fresh'],
  ['inner', 'deeper', 'leaf'],
  ['list', 0],
  ['list', 5],
  ['hidden'],
  ['locked'],
  ['fixed'],
  ['computed'],
  [marker],
  [0],
]

describe('P4 plain-data write tier', () => {
  it('is indistinguishable from the exact clone across the descriptor corpus', () => {
    for (const [name, shape] of shapes()) {
      for (const path of writePaths) {
        const where = `${name} @ ${path.map(String).join('.')}`
        let expected: unknown
        let expectedError: unknown
        try {
          expected = exactSetPath(shape, path, 'written')
        } catch (error) {
          expectedError = error
        }

        if (expectedError !== undefined) {
          expect(
            () => Obj.setPath(path as never, 'written' as never)(shape as never),
            where,
          ).toThrow((expectedError as Error).constructor as never)
          continue
        }
        expectIndistinguishable(
          Obj.setPath(path as never, 'written' as never)(shape as never),
          expected,
          where,
        )
      }
    }
  })

  it('leaves the source untouched', () => {
    const source = { a: 1, inner: { c: 3 } }
    const snapshot = structuredClone(source)
    Obj.setPath(['inner', 'c'] as never, 9 as never)(source)
    expect(source).toEqual(snapshot)
  })

  it('still rejects unsafe write keys', () => {
    const source = { a: 1 }
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      expect(() => Obj.setPath([key] as never, 1 as never)(source)).toThrow(TypeError)
      expect(() => Obj.modifyPath([key] as never, (() => 1) as never)(source)).toThrow(TypeError)
    }
    expect(Object.getPrototypeOf(Obj.setPath(['a'] as never, 1 as never)(source))).toBe(
      Object.prototype,
    )
  })

  it('does not read a source through anything but its own descriptors', () => {
    const traps: string[] = []
    const target = { a: 1, b: 2 }
    const source = new Proxy(target, {
      get(object, key, receiver) {
        traps.push(`get:${String(key)}`)
        return Reflect.get(object, key, receiver)
      },
      getOwnPropertyDescriptor(object, key) {
        traps.push(`descriptor:${String(key)}`)
        return Reflect.getOwnPropertyDescriptor(object, key)
      },
      ownKeys(object) {
        traps.push('ownKeys')
        return Reflect.ownKeys(object)
      },
    })
    Obj.setPath(['a'] as never, 9 as never)(source)
    expect(traps.some((trap) => trap.startsWith('get:'))).toBe(false)
  })

  it('does not invoke an accessor while deciding', () => {
    let reads = 0
    const source = {
      inner: Object.defineProperty({ c: 1 }, 'computed', {
        get: () => {
          reads += 1
          return 7
        },
        enumerable: true,
        configurable: true,
      }),
    }
    Obj.setPath(['inner', 'c'] as never, 9 as never)(source)
    expect(reads).toBe(0)
  })

  it('rejects class instances and callables as before', () => {
    expect(() =>
      Obj.setPath(['inner', 'c'] as never, 2 as never)({ inner: new Instance({ c: 1 }) }),
    ).toThrow(TypeError)
    expect(() =>
      Obj.setPath(['inner', 'c'] as never, 2 as never)({ inner: () => 1 } as never),
    ).toThrow(TypeError)
  })
})

describe('P4 compiled paths', () => {
  interface User {
    readonly id: number
    readonly profile: {
      readonly name: string
      readonly address: { readonly city: string }
      readonly nickname?: string
    }
    readonly deep: { readonly a: { readonly b: { readonly c: number } } }
  }

  const user: User = {
    id: 1,
    profile: { name: 'ada', address: { city: 'bristol' } },
    deep: { a: { b: { c: 5 } } },
  }

  it('matches the generic readers at every compiled depth', () => {
    const cases = [
      Obj.compilePathOf<User>()('id'),
      Obj.compilePathOf<User>()('profile', 'name'),
      Obj.compilePathOf<User>()('profile', 'address', 'city'),
      Obj.compilePathOf<User>()('deep', 'a', 'b', 'c'),
      Obj.compilePathOf<User>()('profile', 'nickname'),
    ]
    for (const compiled of cases) {
      expect(compiled.get(user)).toEqual(Obj.getPath(compiled.path)(user))
      expect(compiled.getOrUndefined(user)).toEqual(Obj.getPathOrUndefined(compiled.path)(user))
      expect(compiled.has(user)).toBe(Obj.hasPath(compiled.path)(user))
    }
  })

  it('keeps a present undefined leaf distinct from an absent one', () => {
    const compiled = Obj.compilePathOf<{ readonly value?: number }>()('value')
    expect(compiled.get({ value: undefined })).toEqual(some(undefined))
    expect(compiled.has({ value: undefined })).toBe(true)
    expect(compiled.get({})).toEqual(none)
    expect(compiled.has({})).toBe(false)
  })

  it('stops at a non-traversable or inherited segment', () => {
    const compiled = Obj.compilePathOf<{ readonly a: { readonly b: number } }>()('a', 'b')
    expect(compiled.get({ a: 1 } as never)).toEqual(none)
    expect(compiled.get({ a: null } as never)).toEqual(none)
    expect(compiled.get(Object.create({ a: { b: 1 } }) as never)).toEqual(none)
    expect(compiled.get(null as never)).toEqual(none)
  })

  it('reads own function properties like the generic path does', () => {
    const holder = () => 1
    Object.assign(holder, { tag: 'callable' })
    const compiled = Obj.compilePathOf<{ readonly f: { readonly tag: string } }>()('f', 'tag')
    expect(compiled.getOrUndefined({ f: holder } as never)).toBe('callable')
  })

  it('freezes a copy so a later mutation of the caller array is inert', () => {
    const segments: PropertyKey[] = ['profile', 'name']
    const compiled = Obj.compilePathOf<User>()(...(segments as never))
    segments[1] = 'address'
    expect(compiled.getOrUndefined(user)).toBe('ada')
    expect(Object.isFrozen(compiled.path)).toBe(true)
    expect(Object.isFrozen(compiled)).toBe(true)
  })
})

describe('P4 Map.getOrElse', () => {
  const source = new Map<string, number | undefined>([
    ['present', 1],
    ['undefined', undefined],
  ])

  it('returns a present value without consulting the fallback', () => {
    let calls = 0
    expect(
      MapOps.getOrElse('present', () => {
        calls += 1
        return -1
      })(source),
    ).toBe(1)
    expect(calls).toBe(0)
  })

  it('treats a stored undefined as present', () => {
    let calls = 0
    expect(
      MapOps.getOrElse('undefined', () => {
        calls += 1
        return -1
      })(source),
    ).toBeUndefined()
    expect(calls).toBe(0)
  })

  it('invokes the fallback exactly once for a missing key', () => {
    let calls = 0
    expect(
      MapOps.getOrElse('missing', () => {
        calls += 1
        return -1
      })(source),
    ).toBe(-1)
    expect(calls).toBe(1)
  })

  it('calls get first and has only when get came back empty', () => {
    const order: string[] = []
    const traced = <K, V>(map: Map<K, V>): ReadonlyMap<K, V> =>
      ({
        get: (key: K) => {
          order.push('get')
          return map.get(key)
        },
        has: (key: K) => {
          order.push('has')
          return map.has(key)
        },
      }) as unknown as ReadonlyMap<K, V>

    MapOps.getOrElse('k', () => 0)(traced(new Map([['k', 1]])))
    expect(order).toEqual(['get'])

    order.length = 0
    MapOps.getOrElse('k', () => 0)(traced(new Map<string, number>()))
    expect(order).toEqual(['get', 'has'])

    order.length = 0
    MapOps.getOrElse('k', () => 0)(traced(new Map([['k', undefined]])))
    expect(order).toEqual(['get', 'has'])
  })

  it('propagates a throwing fallback', () => {
    expect(() =>
      MapOps.getOrElse('missing', () => {
        throw new RangeError('no default')
      })(source),
    ).toThrow(RangeError)
  })

  it('supports a reentrant fallback', () => {
    const inner = new Map<string, number>([['fallback', 42]])
    expect(
      MapOps.getOrElse('missing', () => MapOps.getOrElse('fallback', () => 0)(inner))(source),
    ).toBe(42)
  })

  it('evaluates the data-last form identically and only on application', () => {
    let calls = 0
    const operator = MapOps.getOrElse('missing', () => {
      calls += 1
      return -1
    })
    expect(calls).toBe(0)
    expect(operator(source)).toBe(-1)
    expect(calls).toBe(1)
    expect(operator(source)).toBe(-1)
    expect(calls).toBe(2)
  })

  it('leaves get, getOrUndefined, and the source unchanged', () => {
    expect(MapOps.get('undefined')(source)).toEqual(some(undefined))
    expect(MapOps.get('missing')(source)).toEqual(none)
    expect(MapOps.getOrUndefined('missing')(source)).toBeUndefined()
    expect(source.size).toBe(2)
  })
})
