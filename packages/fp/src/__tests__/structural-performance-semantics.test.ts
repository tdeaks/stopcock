import { describe, expect, it } from 'vite-plus/test'
import type { NonEmptyArray } from '../non-empty-array'
import * as NEA from '../non-empty-array'
import * as Obj from '../object'
import { none, some } from '../option'
import * as Optic from '../optic'
import type { Ord, Ordering } from '../ord'
import * as OrdModule from '../ord'

const keyLabel = (key: PropertyKey): string =>
  typeof key === 'symbol' ? `symbol:${key.description ?? ''}` : String(key)

const observedObject = () => {
  const events: string[] = []
  const symbol = Symbol('value')
  const target = Object.create(null) as Record<PropertyKey, unknown>
  for (const [key, value] of [
    ['2', 2],
    ['alpha', 1],
    [symbol, 3],
  ] as const) {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      get() {
        events.push(`getter:${keyLabel(key)}`)
        return value
      },
    })
  }
  Object.defineProperty(target, 'hidden', {
    configurable: true,
    enumerable: false,
    value: 4,
  })
  const value = new Proxy(target, {
    ownKeys(source) {
      events.push('ownKeys')
      return Reflect.ownKeys(source)
    },
    getOwnPropertyDescriptor(source, key) {
      events.push(`descriptor:${keyLabel(key)}`)
      return Reflect.getOwnPropertyDescriptor(source, key)
    },
    get(source, key, receiver) {
      events.push(`get:${keyLabel(key)}`)
      return Reflect.get(source, key, receiver)
    },
  })
  return { events, symbol, value }
}

describe('structural object fast paths', () => {
  // Hybrid enumeration (`Object.keys` for the string prefix, then
  // `getOwnPropertySymbols` + `propertyIsEnumerable` for symbols) calls the
  // `ownKeys` trap twice instead of once: the string descriptor checks land
  // between the two, since `Object.keys`'s own enumerable check runs before
  // `getOwnPropertySymbols` is ever called. The read order (and the result)
  // is unchanged.
  it('finishes enumeration checks before ordered getter reads', () => {
    const valuesCase = observedObject()
    expect(Obj.values(valuesCase.value)).toEqual([2, 1, 3])
    expect(valuesCase.events).toEqual([
      'ownKeys',
      'descriptor:2',
      'descriptor:alpha',
      'descriptor:hidden',
      'ownKeys',
      'descriptor:symbol:value',
      'get:2',
      'getter:2',
      'get:alpha',
      'getter:alpha',
      'get:symbol:value',
      'getter:symbol:value',
    ])

    const entriesCase = observedObject()
    expect(Obj.entries(entriesCase.value)).toEqual([
      ['2', 2],
      ['alpha', 1],
      [entriesCase.symbol, 3],
    ])
    expect(entriesCase.events.slice(0, 6)).toEqual([
      'ownKeys',
      'descriptor:2',
      'descriptor:alpha',
      'descriptor:hidden',
      'ownKeys',
      'descriptor:symbol:value',
    ])
  })

  it('omits directly into a null-prototype symbol-aware record', () => {
    const symbol = Symbol('kept')
    const events: string[] = []
    const source = Object.create(null) as Record<PropertyKey, number>
    Object.defineProperties(source, {
      first: {
        enumerable: true,
        get() {
          events.push('get:first')
          return 1
        },
      },
      second: {
        enumerable: true,
        get() {
          events.push('get:second')
          return 2
        },
      },
      [symbol]: {
        enumerable: true,
        get() {
          events.push('get:symbol')
          return 3
        },
      },
    })

    const result = Obj.omitBy(source, (value, key) => {
      events.push(`predicate:${keyLabel(key)}:${value}`)
      return key === 'second'
    })
    expect(Reflect.ownKeys(result)).toEqual(['first', symbol])
    expect(result).toEqual({ first: 1, [symbol]: 3 })
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect(events).toEqual([
      'get:first',
      'predicate:first:1',
      'get:second',
      'predicate:second:2',
      'get:symbol',
      'predicate:symbol:kept:3',
    ])
  })

  it('walks own symbol and function paths once and rejects inherited segments', () => {
    const key = Symbol('nested')
    const events: string[] = []
    const callable = () => undefined
    Object.defineProperty(callable, key, {
      configurable: true,
      enumerable: true,
      get() {
        events.push('get:symbol')
        return {
          get leaf() {
            events.push('get:leaf')
            return undefined
          },
        }
      },
    })
    expect(Obj.getPathOrUndefined(callable, [key, 'leaf'])).toBeUndefined()
    expect(events).toEqual(['get:symbol', 'get:leaf'])

    const inherited = Object.create({ leaf: 1 }) as { leaf: number }
    expect(Obj.getPathOrUndefined(inherited, ['leaf'])).toBeUndefined()
    expect(Obj.getPathOrUndefined({ nested: { leaf: 2 } }, ['nested', 'leaf'])).toBe(2)
  })
})

describe('structural optic fast paths', () => {
  it('keeps data-first and curried read behavior for every readable optic shape', () => {
    const events: string[] = []
    const valueLens = Optic.lens(
      (source: { value: number }) => {
        events.push('lens:get')
        return source.value
      },
      (source, value: number) => ({ ...source, value }),
    )
    const present = Optic.optional(
      (source: number | null) => (source === null ? none : some(source)),
      (_source, value: number) => value,
    )
    const items = Optic.fold((source: readonly number[]) => source)

    expect(Optic.view(valueLens, { value: 1 })).toBe(1)
    expect(Optic.view(valueLens)({ value: 2 })).toBe(2)
    expect(Optic.preview(present, 3)).toEqual(some(3))
    expect(Optic.preview(present)(null)).toBe(none)
    expect(Optic.collect(valueLens, { value: 4 })).toEqual([4])
    expect(Optic.collect(valueLens)({ value: 5 })).toEqual([5])
    expect(Optic.collect(items, [1, 2])).toEqual([1, 2])
    expect(events).toEqual(['lens:get', 'lens:get', 'lens:get', 'lens:get'])
  })

  it('sets lenses, isomorphisms, partial optics, and read-only failures consistently', () => {
    const events: string[] = []
    const valueLens = Optic.lens(
      (source: { value: number }) => {
        events.push(`get:${source.value}`)
        return source.value
      },
      (source, value: number) => {
        events.push(`replace:${source.value}:${value}`)
        return { ...source, value }
      },
    )
    const textNumber = Optic.iso(
      (source: string) => {
        events.push(`to:${source}`)
        return Number(source)
      },
      (value: number) => {
        events.push(`from:${value}`)
        return String(value)
      },
    )
    expect(Optic.set(valueLens, { value: 1 }, 2)).toEqual({ value: 2 })
    expect(Optic.set(valueLens, 3)({ value: 2 })).toEqual({ value: 3 })
    expect(Optic.set(textNumber, '1', 4)).toBe('4')
    expect(Optic.set(Optic.some<number>(), none, 1)).toBe(none)
    expect(() => Optic.set(Optic.getter((value: number) => value), 1, 2)).toThrow(
      'Cannot modify a read-only Getter',
    )
    expect(events).toEqual(['replace:1:2', 'replace:2:3', 'from:4'])
  })

  it('flattens composed traversals beyond spread argument limits in order', () => {
    const width = 150_000
    const inner = Optic.traversal(
      (_source: number) => Array.from({ length: width }, (_, index) => index),
      (source: number) => source,
    )
    const nested = Optic.compose(Optic.each<number>(), inner)
    const result = Optic.collect(nested, [0, 1])
    expect(result).toHaveLength(width * 2)
    expect(result[0]).toBe(0)
    expect(result[width - 1]).toBe(width - 1)
    expect(result[width]).toBe(0)
    expect(result[result.length - 1]).toBe(width - 1)
  })

  it('retains custom traversal collection iterator order', () => {
    class Reversed extends Array<number> {
      override *[Symbol.iterator](): ArrayIterator<number> {
        for (let index = this.length - 1; index >= 0; index -= 1) {
          yield this[index] as number
        }
      }
    }
    const inner = Optic.traversal(
      (source: number) => new Reversed(source, source + 1, source + 2),
      (source: number) => source,
    )
    const nested = Optic.compose(Optic.each<number>(), inner)
    expect(Optic.collect(nested, [1, 4])).toEqual([3, 2, 1, 6, 5, 4])
  })
})

describe('stable Ord and NonEmptyArray structural paths', () => {
  it('sorts ties stably with the comparator receiver and preserves iterator order', () => {
    interface Item {
      readonly rank: number
      readonly id: string
    }
    const calls: string[] = []
    let instance: Ord<Item>
    instance = {
      compare(this: Ord<Item>, self, that): Ordering {
        expect(this).toBe(instance)
        calls.push(`${self.id}:${that.id}`)
        return self.rank < that.rank ? -1 : self.rank > that.rank ? 1 : 0
      },
      equals(self, that) {
        return self.rank === that.rank
      },
    }
    class Reversed extends Array<Item> {
      override *[Symbol.iterator](): ArrayIterator<Item> {
        for (let index = this.length - 1; index >= 0; index -= 1) {
          yield this[index] as Item
        }
      }
    }
    const source = new Reversed(
      { rank: 1, id: 'a' },
      { rank: 0, id: 'b' },
      { rank: 1, id: 'c' },
      { rank: 1, id: 'd' },
    )
    const result = OrdModule.sort(instance, source)
    expect(result.map(({ id }) => id)).toEqual(['b', 'd', 'c', 'a'])
    expect(result instanceof Reversed).toBe(false)
    expect(calls.length).toBeGreaterThan(0)
    expect(source.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('retains comparator control of dense holes and undefined', () => {
    const sparse = new Array<number | undefined>(3)
    sparse[1] = 2
    sparse[2] = 1
    const undefinedFirst = OrdModule.make<number | undefined>((self, that) =>
      self === undefined ? -1 : that === undefined ? 1 : self - that,
    )
    const result = OrdModule.sort(undefinedFirst, sparse)
    expect(result).toEqual([undefined, 1, 2])
    expect(0 in result).toBe(true)
  })

  it('constructs, zips, extrema-selects, and chunks densely without subclass leakage', () => {
    const iterableEvents: string[] = []
    const iterable = {
      *[Symbol.iterator]() {
        iterableEvents.push('start')
        yield 3
        iterableEvents.push('middle')
        yield 1
        iterableEvents.push('end')
      },
    }
    expect(NEA.fromIterable(iterable)).toEqual(some([3, 1]))
    expect(iterableEvents).toEqual(['start', 'middle', 'end'])
    expect(NEA.fromIterable([])).toBe(none)

    class Numbers extends Array<number> {}
    const sparse = new Numbers(3)
    sparse[1] = 2
    sparse[2] = 1
    const copied = NEA.unsafeFromReadonlyArray(
      sparse as unknown as NonEmptyArray<number | undefined>,
    )
    expect(copied).toEqual([undefined, 2, 1])
    expect(0 in copied).toBe(true)
    expect(copied instanceof Numbers).toBe(false)
    expect(() => NEA.unsafeFromReadonlyArray([])).toThrow(RangeError)

    const first = { rank: 1, id: 'first' }
    const tied = { rank: 1, id: 'tied' }
    const high = { rank: 2, id: 'high' }
    const comparisons: string[] = []
    const byRank: Ord<typeof first> = {
      compare(self, that) {
        comparisons.push(`${self.id}:${that.id}`)
        return self.rank < that.rank ? -1 : self.rank > that.rank ? 1 : 0
      },
      equals(self, that) {
        return self.rank === that.rank
      },
    }
    const values = [first, tied, high] as unknown as NonEmptyArray<typeof first>
    expect(NEA.min(byRank)(values)).toBe(first)
    expect(comparisons).toEqual(['first:tied', 'first:high'])
    comparisons.length = 0
    expect(NEA.max(byRank)(values)).toBe(high)
    expect(comparisons).toEqual(['first:tied', 'first:high'])
    expect(NEA.zip(['a', 'b'])([1, 2, 3])).toEqual([[1, 'a'], [2, 'b']])
    expect(NEA.chunksOf(2)([1, 2, 3, 4, 5])).toEqual(
      some([[1, 2], [3, 4], [5]]),
    )
  })
})
