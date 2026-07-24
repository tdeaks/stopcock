import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vite-plus/test'
import * as Obj from '../object'

describe('object path writes', () => {
  it('replaces and modifies the complete value at an empty path', () => {
    const source = { count: 1 }
    const replacement = { count: 2 }

    expect(Obj.setPath(source, [], replacement)).toBe(replacement)
    expect(Obj.modifyPath(source, [], (current) => ({ count: current.count + 1 }))).toEqual({
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

    const result = Obj.modifyPath(source, ['profile', 'name'], (name) => {
      observed.push(name)
      return name ?? 'anonymous'
    })

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

    const result = Obj.setPath(source, ['rows', 1, 0], 'changed')

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

    const result = Obj.modifyPath(source, ['values', 2], (value) => {
      observed.push(value)
      return (value ?? 0) + 3
    })

    expect(observed).toEqual([undefined])
    expect(result.values).toEqual([1, , 3])
    expect(source.values).toEqual([1])
  })

  it('updates frozen array indices before restoring their non-writable length', () => {
    const source: readonly number[] = Object.freeze([1])

    const setExisting = Obj.setPath(source, [0], 2)
    const modifyMissing = Obj.modifyPath(source, [2], (value) => (value ?? 0) + 3)

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

    const result = Obj.removePath(source, [1])

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

    expect(Obj.removePath(absent, ['profile', 'nickname'])).toBe(absent)
    const removed = Obj.removePath(present, ['profile', 'nickname'])
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

    expect(() => Obj.setPath(structurallyTyped, ['count'], 2)).toThrow(TypeError)
    expect(() => Obj.modifyPath(structurallyTyped, ['count'], (count) => count + 1)).toThrow(
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

    const result = Obj.setPath(source, ['values', 1], 20)

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

    const result = Obj.setPath(source, ['target'], 2)

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

    const result = Obj.setPath(source, ['value'], 2)

    expect(result.value).toBe(2)
    expect(reads).toBe(0)
    expect(() => Obj.modifyPath(source, ['value'], (value) => value + 1)).toThrow('leaf read')
    expect(reads).toBe(1)
  })

  it('rejects array subclasses and unsafe broad runtime keys', () => {
    class PrivateArray extends Array<number> {
      readonly #brand = true
    }
    const subclass = new PrivateArray(1, 2)
    const structurallyTyped: readonly number[] = subclass
    const unsafeKey: string = '__proto__'

    expect(() => Obj.setPath({ values: structurallyTyped }, ['values', 0], 2)).toThrow(TypeError)
    expect(() => Obj.setPath({} as Readonly<Record<string, number>>, [unsafeKey], 1)).toThrow(
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

    const objectResult = Obj.setPath(foreignObject, ['nested', 'value'], 2)
    const arrayResult = Obj.modifyPath(foreignArray, [1], (value) => (value ?? 0) + 2)

    expect(objectResult).toEqual({ nested: { value: 2 } })
    expect(Object.getPrototypeOf(objectResult)).toBe(Object.getPrototypeOf(foreignObject))
    expect(Object.getPrototypeOf(objectResult.nested)).toBe(
      Object.getPrototypeOf(foreignObject.nested),
    )
    expect(arrayResult).toEqual([1, 4])
    expect(Object.getPrototypeOf(arrayResult)).toBe(Object.getPrototypeOf(foreignArray))
    expect(() => Obj.setPath(foreignClass, ['count'], 2)).toThrow(TypeError)
    expect(() => Obj.setPath(foreignArraySubclass, [0], 2)).toThrow(TypeError)
  })
})
