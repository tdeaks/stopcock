import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vite-plus/test'
import * as Obj from '../object'

describe('object path writes', () => {
  it('replaces and modifies the complete value at an empty path', () => {
    const source = { count: 1 }
    const replacement = { count: 2 }

    expect(Obj.setPath([], replacement)(source)).toBe(replacement)
    expect(
      Obj.modifyPath([], (current: { count: number }) => ({ count: current.count + 1 }))(source),
    ).toEqual({
      count: 2,
    })
    expect(source).toEqual({ count: 1 })
  })

  it('creates absent optional intermediates without mutating the source', () => {
    type User = {
      readonly profile?: {
        readonly name: string
      }
    }
    const source: User = {}
    const observed: Array<string | undefined> = []

    const result = Obj.modifyPath(['profile', 'name'], (name: string | undefined) => {
      observed.push(name)
      return name ?? 'anonymous'
    })(source)

    expect(observed).toEqual([undefined])
    expect(result).toEqual({ profile: { name: 'anonymous' } })
    expect(Object.getPrototypeOf(result.profile)).toBe(Object.prototype)
    expect(source).toEqual({})
  })

  it('clones readonly arrays and tuples along the written path', () => {
    type State = {
      readonly rows: readonly (readonly [string, number])[]
    }
    const source: State = {
      rows: [
        ['a', 1],
        ['b', 2],
      ],
    }

    // IsPathConstructible treats a dynamic array's index as possibly missing, so
    // writing through it into a fixed 2-tuple looks like it could omit the
    // tuple's other required element -- pre-existing limitation of the path
    // types (also present, unexercised, on the old data-first overload), not
    // something this conversion introduced. The cast documents the gap.
    const result = (Obj.setPath(['rows', 1, 0], 'changed') as (value: State) => State)(source)

    expect(result).toEqual({
      rows: [
        ['a', 1],
        ['changed', 2],
      ],
    })
    expect(result).not.toBe(source)
    expect(result.rows).not.toBe(source.rows)
    expect(result.rows[0]).toBe(source.rows[0])
    expect(result.rows[1]).not.toBe(source.rows[1])
    expect(source.rows[1]).toEqual(['b', 2])
  })

  it('passes undefined to an unchecked missing array focus', () => {
    const source: Readonly<{ values: readonly number[] }> = { values: [1] }
    const observed: Array<number | undefined> = []

    const result = Obj.modifyPath(['values', 2], (value: number | undefined) => {
      observed.push(value)
      return (value ?? 0) + 3
    })(source)

    expect(observed).toEqual([undefined])
    expect(result.values).toEqual([1, , 3])
    expect(source.values).toEqual([1])
  })

  it('updates frozen array indices before restoring their non-writable length', () => {
    const source: readonly number[] = Object.freeze([1])

    const setExisting = Obj.setPath([0], 2)(source)
    const modifyMissing = Obj.modifyPath([2], (value: number | undefined) => (value ?? 0) + 3)(
      source,
    )

    expect(setExisting).toEqual([2])
    expect(Object.getOwnPropertyDescriptor(setExisting, '0')).toEqual({
      configurable: false,
      enumerable: true,
      value: 2,
      writable: false,
    })
    expect(Object.getOwnPropertyDescriptor(setExisting, 'length')).toEqual(
      Object.getOwnPropertyDescriptor(source, 'length'),
    )
    expect(modifyMissing).toEqual([1, , 3])
    expect(modifyMissing).toHaveLength(3)
    expect(Object.getOwnPropertyDescriptor(modifyMissing, 'length')).toEqual({
      ...Object.getOwnPropertyDescriptor(source, 'length'),
      value: 3,
    })
    expect(source).toEqual([1])
  })

  it('removes an optional frozen tuple index without changing its locked length', () => {
    const source: readonly [string, number?] = Object.freeze(['ready', 2])

    const result = Obj.removePath([1])(source)

    expect(result).toHaveLength(2)
    expect(result[0]).toBe('ready')
    expect(1 in result).toBe(false)
    expect(Object.getOwnPropertyDescriptor(result, '0')).toEqual(
      Object.getOwnPropertyDescriptor(source, '0'),
    )
    expect(Object.getOwnPropertyDescriptor(result, 'length')).toEqual(
      Object.getOwnPropertyDescriptor(source, 'length'),
    )
    expect(source).toEqual(['ready', 2])
  })

  it('removes optional leaves and does not construct absent intermediates', () => {
    type State = {
      readonly profile?: {
        readonly name: string
        readonly nickname?: string
      }
    }
    const absent: State = {}
    const present: State = { profile: { name: 'Ada', nickname: 'ace' } }

    expect(Obj.removePath(['profile', 'nickname'])(absent)).toBe(absent)
    const removed = Obj.removePath(['profile', 'nickname'])(present)
    expect(removed).toEqual({ profile: { name: 'Ada' } })
    expect(removed).not.toBe(present)
    expect(removed.profile).not.toBe(present.profile)
    expect(present.profile).toEqual({ name: 'Ada', nickname: 'ace' })
  })

  it('fails closed when a path would traverse a class instance', () => {
    class Counter {
      constructor(public count: number) {}
    }
    const counter = new Counter(1)
    const structurallyTyped: { count: number } = counter

    expect(() => Obj.setPath(['count'], 2)(structurallyTyped)).toThrow(TypeError)
    expect(() => Obj.modifyPath(['count'], (count: number) => count + 1)(structurallyTyped)).toThrow(
      TypeError,
    )
    expect(counter.count).toBe(1)
  })

  it('preserves array intersection state and non-enumerable descriptors', () => {
    const metadata = Symbol('metadata')
    const values = [1, 2, 3] as number[] & {
      readonly state: string
      readonly [metadata]: { readonly stable: true }
    }
    Object.defineProperty(values, 'state', {
      configurable: false,
      enumerable: false,
      value: 'ready',
      writable: false,
    })
    Object.defineProperty(values, metadata, {
      configurable: false,
      enumerable: false,
      value: { stable: true },
      writable: false,
    })
    const source = { values }

    const result = Obj.setPath(['values', 1], 20)(source)

    expect(result.values).toEqual([1, 20, 3])
    expect(result.values).not.toBe(values)
    expect(result.values.state).toBe('ready')
    expect(result.values[metadata]).toEqual({ stable: true })
    expect(Object.getOwnPropertyDescriptor(result.values, 'state')).toEqual(
      Object.getOwnPropertyDescriptor(values, 'state'),
    )
    expect(Object.getOwnPropertyDescriptor(result.values, metadata)).toEqual(
      Object.getOwnPropertyDescriptor(values, metadata),
    )
  })

  it('preserves unrelated descriptors without invoking getters or rejecting their keys', () => {
    let reads = 0
    const source = { target: 1 } as {
      target: number
      readonly hidden: number
      readonly __proto__: string
    }
    Object.defineProperty(source, 'hidden', {
      configurable: false,
      enumerable: false,
      get: () => {
        reads += 1
        return 42
      },
    })
    Object.defineProperty(source, '__proto__', {
      configurable: false,
      enumerable: true,
      value: 'own-data',
      writable: false,
    })

    const result = Obj.setPath(['target'], 2)(source)

    expect(reads).toBe(0)
    expect(result.target).toBe(2)
    expect(Object.getOwnPropertyDescriptor(result, 'hidden')).toEqual(
      Object.getOwnPropertyDescriptor(source, 'hidden'),
    )
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')).toEqual(
      Object.getOwnPropertyDescriptor(source, '__proto__'),
    )
    expect(reads).toBe(0)
  })

  it('does not read an accessor when setPath replaces its leaf', () => {
    let reads = 0
    const source = {} as { readonly value: number }
    Object.defineProperty(source, 'value', {
      configurable: false,
      enumerable: true,
      get: () => {
        reads += 1
        throw new Error('leaf read')
      },
    })

    const result = Obj.setPath(['value'], 2)(source)

    expect(result.value).toBe(2)
    expect(reads).toBe(0)
    expect(() => Obj.modifyPath(['value'], (value: number) => value + 1)(source)).toThrow(
      'leaf read',
    )
    expect(reads).toBe(1)
  })

  it('rejects array subclasses and unsafe broad runtime keys', () => {
    class PrivateArray extends Array<number> {
      readonly #brand = true
    }
    const subclass = new PrivateArray(1, 2)
    const structurallyTyped: readonly number[] = subclass
    const unsafeKey: string = '__proto__'

    expect(() => Obj.setPath(['values', 0], 2)({ values: structurallyTyped })).toThrow(TypeError)
    expect(() => Obj.setPath([unsafeKey], 1)({} as Readonly<Record<string, number>>)).toThrow(
      TypeError,
    )
  })

  it('supports cross-realm ordinary containers but rejects cross-realm subclasses', () => {
    const foreignObject = runInNewContext('({ nested: { value: 1 } })') as {
      nested: { value: number }
    }
    const foreignArray = runInNewContext('[1, 2]') as number[]
    const foreignClass = runInNewContext(
      'new (class Counter { constructor() { this.count = 1 } })()',
    ) as { count: number }
    const foreignArraySubclass = runInNewContext(
      'new (class Numbers extends Array {})(1, 2)',
    ) as number[]

    const objectResult = Obj.setPath(['nested', 'value'], 2)(foreignObject)
    const arrayResult = Obj.modifyPath([1], (value: number | undefined) => (value ?? 0) + 2)(
      foreignArray,
    )

    expect(objectResult).toEqual({ nested: { value: 2 } })
    expect(Object.getPrototypeOf(objectResult)).toBe(Object.getPrototypeOf(foreignObject))
    expect(Object.getPrototypeOf(objectResult.nested)).toBe(
      Object.getPrototypeOf(foreignObject.nested),
    )
    expect(arrayResult).toEqual([1, 4])
    expect(Object.getPrototypeOf(arrayResult)).toBe(Object.getPrototypeOf(foreignArray))
    expect(() => Obj.setPath(['count'], 2)(foreignClass)).toThrow(TypeError)
    expect(() => Obj.setPath([0], 2)(foreignArraySubclass)).toThrow(TypeError)
  })
})
