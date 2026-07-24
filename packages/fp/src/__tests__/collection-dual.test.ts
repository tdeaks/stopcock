import { describe, expect, it } from 'vite-plus/test'
import * as MapOps from '../map'
import { none, some } from '../option'
import * as RecordOps from '../record'
import * as SetOps from '../set'
import * as TypedArray from '../typed-array'

describe('Map dual collection operations', () => {
  const source = new Map<string, number>([
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ])

  it('supports data-last lookups and immutable updates', () => {
    expect(MapOps.has('b')(source)).toBe(MapOps.has(source, 'b'))
    expect(MapOps.get('b')(source)).toEqual(MapOps.get(source, 'b'))
    expect(MapOps.getOrUndefined('missing')(source)).toBe(MapOps.getOrUndefined(source, 'missing'))
    expect(MapOps.set('d', 4)(source)).toEqual(MapOps.set(source, 'd', 4))
    expect(MapOps.set(Symbol.iterator, true)(source)).toEqual(
      new Map<PropertyKey, number | boolean>([...source, [Symbol.iterator, true]]),
    )
    expect(MapOps.remove('a')(source)).toEqual(MapOps.remove(source, 'a'))
    expect(MapOps.modify('b', (value: number) => value * 10)(source)).toEqual(
      MapOps.modify(source, 'b', (value) => value * 10),
    )
    expect(MapOps.update('d', (value) => (value._tag === 0 ? some(4) : none))(source)).toEqual(
      MapOps.update(source, 'd', (value) => (value._tag === 0 ? some(4) : none)),
    )
    expect(source).toEqual(
      new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]),
    )
  })

  it('supports data-last transforms, algebra, folds, and equality', () => {
    expect(MapOps.map((value: number, key: string) => `${key}:${value}`)(source)).toEqual(
      MapOps.map(source, (value, key) => `${key}:${value}`),
    )
    expect(MapOps.filter((value: number) => value % 2 === 1)(source)).toEqual(
      MapOps.filter(source, (value) => value % 2 === 1),
    )
    expect(
      MapOps.filterMap((value: number) => (value % 2 === 0 ? some(String(value)) : none))(source),
    ).toEqual(MapOps.filterMap(source, (value) => (value % 2 === 0 ? some(String(value)) : none)))
    expect(MapOps.mapKeys((key: string) => key.toUpperCase())(source)).toEqual(
      MapOps.mapKeys(source, (key) => key.toUpperCase()),
    )

    const other = new Map<string, number>([
      ['b', 20],
      ['d', 4],
    ])
    expect(MapOps.merge(other)(source)).toEqual(MapOps.merge(source, other))
    expect(MapOps.union(other)(source)).toEqual(MapOps.union(source, other))
    expect(MapOps.intersection(other)(source)).toEqual(MapOps.intersection(source, other))
    expect(MapOps.difference(other)(source)).toEqual(MapOps.difference(source, other))
    expect(MapOps.merge(new Map([[Symbol.iterator, true]]))(source)).toEqual(
      new Map<PropertyKey, number | boolean>([...source, [Symbol.iterator, true]]),
    )
    expect(MapOps.partition((value: number) => value > 1)(source)).toEqual(
      MapOps.partition(source, (value) => value > 1),
    )
    expect(MapOps.reduce((total: number, value: number) => total + value, 0)(source)).toBe(
      MapOps.reduce(source, (total, value) => total + value, 0),
    )
    expect(MapOps.equals(new Map(source))(source)).toBe(true)

    const lower = new Map([['a', 'value']])
    const upper = new Map([['a', 'VALUE']])
    const equalIgnoringCase = (left: string, right: string): boolean =>
      left.toLowerCase() === right.toLowerCase()
    expect(MapOps.equals(upper, equalIgnoringCase)(lower)).toBe(
      MapOps.equals(lower, upper, equalIgnoringCase),
    )

    const callableBacking = new Map(source)
    const callableMap = Object.assign(() => undefined, {
      entries: callableBacking.entries.bind(callableBacking),
      forEach: callableBacking.forEach.bind(callableBacking),
      get: callableBacking.get.bind(callableBacking),
      has: callableBacking.has.bind(callableBacking),
      keys: callableBacking.keys.bind(callableBacking),
      values: callableBacking.values.bind(callableBacking),
      [Symbol.iterator]: callableBacking[Symbol.iterator].bind(callableBacking),
    })
    Object.defineProperty(callableMap, 'size', {
      configurable: true,
      get: () => callableBacking.size,
    })
    expect(MapOps.equals(callableMap)(source)).toBe(true)

    const decoratedComparator = Object.assign(equalIgnoringCase, {
      get: upper.get.bind(upper),
      has: upper.has.bind(upper),
      [Symbol.iterator]: upper[Symbol.iterator].bind(upper),
    })
    Object.defineProperty(decoratedComparator, 'size', {
      configurable: true,
      get: () => upper.size,
    })
    expect(MapOps.equals(upper, decoratedComparator)(lower)).toBe(true)
  })
})

describe('Set dual collection operations', () => {
  const source = new Set([1, 2, 3])

  it('supports data-last updates and transformations', () => {
    expect(SetOps.has(2)(source)).toBe(SetOps.has(source, 2))
    expect(SetOps.add(4)(source)).toEqual(SetOps.add(source, 4))
    expect(SetOps.remove(2)(source)).toEqual(SetOps.remove(source, 2))
    expect(SetOps.toggle(2)(source)).toEqual(SetOps.toggle(source, 2))
    expect(SetOps.toggle(true)(source)).toEqual(new Set<number | boolean>([1, 2, 3, true]))
    expect(SetOps.map((value: number) => String(value))(source)).toEqual(
      SetOps.map(source, (value) => String(value)),
    )
    expect(SetOps.filter((value: number) => value > 1)(source)).toEqual(
      SetOps.filter(source, (value) => value > 1),
    )
    expect(
      SetOps.filterMap((value: number) => (value > 1 ? some(value * 2) : none))(source),
    ).toEqual(SetOps.filterMap(source, (value) => (value > 1 ? some(value * 2) : none)))
    expect(SetOps.flatMap((value: number) => [value, value * 10])(source)).toEqual(
      SetOps.flatMap(source, (value) => [value, value * 10]),
    )
    expect(source).toEqual(new Set([1, 2, 3]))
  })

  it('supports data-last algebra, relations, folds, and equality', () => {
    const overlapping = new Set([3, 4])
    const disjoint = new Set([8, 9])

    expect(SetOps.union(overlapping)(source)).toEqual(SetOps.union(source, overlapping))
    expect(SetOps.intersection(overlapping)(source)).toEqual(
      SetOps.intersection(source, overlapping),
    )
    expect(SetOps.difference(overlapping)(source)).toEqual(SetOps.difference(source, overlapping))
    expect(SetOps.symmetricDifference(overlapping)(source)).toEqual(
      SetOps.symmetricDifference(source, overlapping),
    )
    expect(SetOps.symmetricDifference(new Set([true]))(source)).toEqual(
      new Set<number | boolean>([1, 2, 3, true]),
    )
    expect(SetOps.intersection(new Set([true]))(source)).toEqual(new Set())
    expect(SetOps.difference(new Set([true]))(source)).toEqual(source)
    expect(SetOps.isSubset(new Set([1, 2, 3, 4]))(source)).toBe(true)
    expect(SetOps.isSuperset(new Set([1, 2]))(source)).toBe(true)
    expect(SetOps.isDisjoint(disjoint)(source)).toBe(true)
    expect(SetOps.equals(new Set(source))(source)).toBe(true)
    expect(SetOps.partition((value: number) => value % 2 === 1)(source)).toEqual(
      SetOps.partition(source, (value) => value % 2 === 1),
    )
    expect(SetOps.reduce((total: number, value: number) => total + value, 0)(source)).toBe(6)
  })
})

describe('Record dual collection operations', () => {
  const source: RecordOps.ReadonlyRecord<number> = { a: 1, b: 2, c: 3 }

  it('supports data-last lookups and immutable updates', () => {
    expect(RecordOps.has('b')(source)).toBe(RecordOps.has(source, 'b'))
    expect(RecordOps.get('b')(source)).toEqual(RecordOps.get(source, 'b'))
    expect(RecordOps.getOrUndefined('missing')(source)).toBeUndefined()
    expect(RecordOps.set('d', 4)(source)).toEqual(RecordOps.set(source, 'd', 4))
    expect(RecordOps.remove('a')(source)).toEqual(RecordOps.remove(source, 'a'))
    expect(RecordOps.modify('b', (value: number) => value * 10)(source)).toEqual(
      RecordOps.modify(source, 'b', (value) => value * 10),
    )
    expect(RecordOps.update('d', (value) => (value._tag === 0 ? some(4) : none))(source)).toEqual(
      RecordOps.update(source, 'd', (value) => (value._tag === 0 ? some(4) : none)),
    )
    expect(source).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('supports data-last transforms, selection, folds, and equality', () => {
    expect(RecordOps.map((value: number, key) => `${String(key)}:${value}`)(source)).toEqual(
      RecordOps.map(source, (value, key) => `${String(key)}:${value}`),
    )
    expect(RecordOps.filter((value: number) => value > 1)(source)).toEqual(
      RecordOps.filter(source, (value) => value > 1),
    )
    expect(
      RecordOps.filterMap((value: number) => (value % 2 === 1 ? some(String(value)) : none))(
        source,
      ),
    ).toEqual(
      RecordOps.filterMap(source, (value) => (value % 2 === 1 ? some(String(value)) : none)),
    )
    expect(RecordOps.mapKeys((key, _value: number) => `key:${String(key)}`)(source)).toEqual(
      RecordOps.mapKeys(source, (key) => `key:${String(key)}`),
    )

    const other: RecordOps.ReadonlyRecord<number> = { b: 20, d: 4 }
    expect(RecordOps.merge(other)(source)).toEqual(RecordOps.merge(source, other))
    expect(RecordOps.pick(['a', 'c'])(source)).toEqual(RecordOps.pick(source, ['a', 'c']))
    expect(RecordOps.omit(['b'])(source)).toEqual(RecordOps.omit(source, ['b']))
    expect(RecordOps.partition((value: number) => value > 1)(source)).toEqual(
      RecordOps.partition(source, (value) => value > 1),
    )
    expect(RecordOps.reduce((total: number, value: number) => total + value, 0)(source)).toBe(6)
    expect(RecordOps.equals({ ...source })(source)).toBe(true)

    const lower: RecordOps.ReadonlyRecord<string> = { a: 'value' }
    const upper: RecordOps.ReadonlyRecord<string> = { a: 'VALUE' }
    const equalIgnoringCase = (left: string, right: string): boolean =>
      left.toLowerCase() === right.toLowerCase()
    expect(RecordOps.equals(upper, equalIgnoringCase)(lower)).toBe(
      RecordOps.equals(lower, upper, equalIgnoringCase),
    )
  })
})

describe('writable collection targets', () => {
  it('preserves Map target identity across constructors, transforms, and refinements', () => {
    const target = new Map<PropertyKey, string | number>([['existing', 0]])
    const source = new Map<PropertyKey, string | number>([
      ['text', 'value'],
      ['number', 1],
    ])

    expect(MapOps.fromIterableInto([['constructed', 2]], target)).toBe(target)
    expect(MapOps.mapInto(source, target, (value) => String(value))).toBe(target)
    expect(
      MapOps.filterInto(source, target, (value): value is string => typeof value === 'string'),
    ).toBe(target)
    expect(target).toEqual(
      new Map<PropertyKey, string | number>([
        ['existing', 0],
        ['constructed', 2],
        ['text', 'value'],
        ['number', '1'],
      ]),
    )
  })

  it('preserves Set target identity across constructors, transforms, refinements, and unions', () => {
    const target = new Set<string | number>(['existing'])
    const source = new Set<string | number>(['value', 1])

    expect(SetOps.fromIterableInto([2], target)).toBe(target)
    expect(SetOps.mapInto(source, target, (value) => String(value))).toBe(target)
    expect(
      SetOps.filterInto(source, target, (value): value is string => typeof value === 'string'),
    ).toBe(target)
    expect(SetOps.unionInto(source, target)).toBe(target)
    expect(target).toEqual(new Set<string | number>(['existing', 2, 'value', '1', 1]))
  })

  it('preserves Record target identity across constructors, transforms, and refinements', () => {
    const target = { existing: 0 } as RecordOps.MutableRecord<string | number>
    const source = { text: 'value', number: 1 } as RecordOps.ReadonlyRecord<string | number>

    expect(RecordOps.fromEntriesInto([['constructed', 2]], target)).toBe(target)
    expect(RecordOps.mapInto(source, target, (value) => String(value))).toBe(target)
    expect(
      RecordOps.filterInto(source, target, (value): value is string => typeof value === 'string'),
    ).toBe(target)
    expect(target).toEqual({
      existing: 0,
      constructed: 2,
      text: 'value',
      number: '1',
    })
  })

  it('stores __proto__ as an own Record entry without mutating target prototypes', () => {
    const target = {} as RecordOps.MutableRecord<unknown>
    const originalPrototype = Object.getPrototypeOf(target)
    const value = { safe: true }

    expect(RecordOps.fromEntriesInto([['__proto__', value]], target)).toBe(target)
    expect(Object.getPrototypeOf(target)).toBe(originalPrototype)
    expect(Object.hasOwn(target, '__proto__')).toBe(true)
    expect(target.__proto__).toBe(value)

    const source = RecordOps.fromEntries([['__proto__', value]])
    const mapped = {} as RecordOps.MutableRecord<unknown>
    const filtered = {} as RecordOps.MutableRecord<unknown>
    RecordOps.mapInto(source, mapped, (entry) => entry)
    RecordOps.filterInto(source, filtered, () => true)
    expect(Object.getPrototypeOf(mapped)).toBe(originalPrototype)
    expect(Object.getPrototypeOf(filtered)).toBe(originalPrototype)
    expect(Object.hasOwn(mapped, '__proto__')).toBe(true)
    expect(Object.hasOwn(filtered, '__proto__')).toBe(true)
  })
})

describe('TypedArray dual collection operations', () => {
  const source = new Uint16Array([3, 1, 2, 4])

  it('supports data-last indexing, transforms, bounds, sorting, and folds', () => {
    expect(TypedArray.at(1)(source)).toEqual(TypedArray.at(source, 1))
    expect(TypedArray.atOrUndefined(-1)(source)).toBe(TypedArray.atOrUndefined(source, -1))
    expect(TypedArray.atOrUndefined(1.9)(source)).toBe(source.at(1.9))
    expect(TypedArray.atOrUndefined(Number.NaN)(source)).toBe(source.at(Number.NaN))
    expect(TypedArray.atOrUndefined(-0.5)(source)).toBe(source.at(-0.5))
    expect(TypedArray.at(source, -1.9)).toEqual(some(source.at(-1.9) as number))
    expect(TypedArray.map((value: number) => value * 2)(source)).toEqual(
      TypedArray.map(source, (value) => value * 2),
    )
    expect(TypedArray.filter((value: number) => value % 2 === 0)(source)).toEqual(
      TypedArray.filter(source, (value) => value % 2 === 0),
    )
    expect(TypedArray.slice(1, 3)(source)).toEqual(TypedArray.slice(source, 1, 3))
    expect(TypedArray.slice()(source)).toEqual(TypedArray.slice(source))
    expect(TypedArray.sort((left: number, right: number) => right - left)(source)).toEqual(
      TypedArray.sort(source, (left, right) => right - left),
    )
    expect(TypedArray.sort()(source)).toEqual(TypedArray.sort(source))
    expect(TypedArray.reduce((total: number, value: number) => total + value, 0)(source)).toBe(10)
  })

  it('supports data-last searches and equality for number and bigint families', () => {
    expect(TypedArray.indexOfOrUndefined(2)(source)).toBe(2)
    expect(TypedArray.indexOf(2)(source)).toEqual(some(2))
    expect(TypedArray.includes(2)(source)).toBe(true)
    expect(TypedArray.equals(new Uint16Array(source))(source)).toBe(true)

    const bigints = new BigInt64Array([1n, 2n, 3n])
    expect(TypedArray.map((value: bigint) => value * 2n)(bigints)).toEqual(
      new BigInt64Array([2n, 4n, 6n]),
    )
    expect(TypedArray.filter((value: bigint) => value > 1n)(bigints)).toEqual(
      new BigInt64Array([2n, 3n]),
    )
    expect(TypedArray.includes(2n)(bigints)).toBe(true)
    expect(TypedArray.indexOf(3n)(bigints)).toEqual(some(2))
    expect(TypedArray.filter(() => true)(bigints)).toEqual(bigints)
    expect(TypedArray.sort(() => 0)(bigints)).toEqual(bigints)
    expect(TypedArray.reduce((count: number) => count + 1, 0)(bigints)).toBe(3)

    const bigintTarget = new BigInt64Array(4)
    expect(TypedArray.mapInto(source, bigintTarget, (value) => BigInt(value))).toBe(bigintTarget)
    expect(bigintTarget).toEqual(new BigInt64Array([3n, 1n, 2n, 4n]))

    const numberTarget = new Float64Array(3)
    expect(TypedArray.mapInto(bigints, numberTarget, (value) => Number(value))).toBe(numberTarget)
    expect(numberTarget).toEqual(new Float64Array([1, 2, 3]))
  })

  it('retains the unambiguous data-first concat contract', () => {
    expect(TypedArray.concat(source)).toEqual(source)
    expect(TypedArray.concat(source)).not.toBe(source)
    expect(TypedArray.concat(source, new Uint16Array([5]))).toEqual(
      new Uint16Array([3, 1, 2, 4, 5]),
    )
    expect(TypedArray.concat(new Uint8Array([1]), new Float64Array([2.9]))).toEqual(
      new Uint8Array([1, 2]),
    )
    expect(TypedArray.equals(new Uint8Array([1, 2]), new Float64Array([1, 2]))).toBe(true)
    expect(TypedArray.equals(new Float64Array([1, 2]))(new Uint8Array([1, 2]))).toBe(true)
  })

  it('matches native relative-index normalization in both invocation styles', () => {
    const values = new Uint8Array([1, 2, 3])
    const cases = [
      [Number.NaN, undefined],
      [-0.5, undefined],
      [0, -0.5],
      [Number.POSITIVE_INFINITY, undefined],
      [Number.NEGATIVE_INFINITY, 2],
    ] as const

    for (const [start, end] of cases) {
      const expected = values.slice(start, end)
      expect(TypedArray.slice(values, start, end)).toEqual(expected)
      expect(TypedArray.slice(start, end)(values)).toEqual(expected)
    }
  })
})
