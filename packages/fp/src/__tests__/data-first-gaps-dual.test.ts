import { describe, expect, it } from 'vite-plus/test'
import * as MapOps from '../map'
import * as RecordOps from '../record'
import * as SetOps from '../set'
import * as TypedArrayOps from '../typed-array'

describe('data-first gap operations are dual', () => {
  it('preserves Map targets in both lanes', () => {
    const source = new Map([['a', 1], ['b', 2]])
    const directFrom = new Map<string, number>()
    const curriedFrom = new Map<string, number>()
    expect(MapOps.fromIterableInto(source, directFrom)).toBe(directFrom)
    expect(MapOps.fromIterableInto(curriedFrom)(source)).toBe(curriedFrom)

    const directMap = new Map<string, string>()
    const curriedMap = new Map<string, string>()
    expect(MapOps.mapInto(source, directMap, String)).toBe(directMap)
    expect(MapOps.mapInto(curriedMap, String)(source)).toBe(curriedMap)

    const directFilter = new Map<string, number>()
    const curriedFilter = new Map<string, number>()
    expect(MapOps.filterInto(source, directFilter, (value) => value > 1)).toBe(directFilter)
    expect(MapOps.filterInto(curriedFilter, (value: number) => value > 1)(source)).toBe(
      curriedFilter,
    )
    expect([...curriedFilter]).toEqual([['b', 2]])
  })

  it('preserves Record targets in both lanes', () => {
    const source: RecordOps.ReadonlyRecord<number> = { a: 1, b: 2 }
    const target = (): RecordOps.MutableRecord<number> => Object.create(null)
    const directFrom = target()
    const curriedFrom = target()
    expect(RecordOps.fromEntriesInto(Object.entries(source), directFrom)).toBe(directFrom)
    expect(RecordOps.fromEntriesInto(curriedFrom)(Object.entries(source))).toBe(curriedFrom)

    const directMap = target()
    const curriedMap = target()
    expect(RecordOps.mapInto(source, directMap, (value) => value * 2)).toBe(directMap)
    expect(RecordOps.mapInto(curriedMap, (value: number) => value * 2)(source)).toBe(curriedMap)

    const directFilter = target()
    const curriedFilter = target()
    expect(RecordOps.filterInto(source, directFilter, (value) => value > 1)).toBe(directFilter)
    expect(RecordOps.filterInto(curriedFilter, (value: number) => value > 1)(source)).toBe(
      curriedFilter,
    )
    expect({ ...curriedFilter }).toEqual({ b: 2 })
  })

  it('preserves Set targets in both lanes', () => {
    const source = new Set([1, 2])
    for (const operation of [SetOps.fromIterableInto, SetOps.unionInto]) {
      const direct = new Set<number>()
      const curried = new Set<number>()
      expect(operation(source, direct)).toBe(direct)
      expect(operation(curried)(source)).toBe(curried)
    }
    const directMap = new Set<string>()
    const curriedMap = new Set<string>()
    expect(SetOps.mapInto(source, directMap, String)).toBe(directMap)
    expect(SetOps.mapInto(curriedMap, String)(source)).toBe(curriedMap)
    const directFilter = new Set<number>()
    const curriedFilter = new Set<number>()
    expect(SetOps.filterInto(source, directFilter, (value) => value > 1)).toBe(directFilter)
    expect(SetOps.filterInto(curriedFilter, (value: number) => value > 1)(source)).toBe(
      curriedFilter,
    )
  })

  it('preserves TypedArray targets and optional offsets in both lanes', () => {
    const source = new Uint16Array([1, 2])
    const directCopy = new Uint16Array(4)
    const curriedCopy = new Uint16Array(4)
    expect(TypedArrayOps.copyInto(source, directCopy, 1)).toBe(directCopy)
    expect(TypedArrayOps.copyInto(curriedCopy, 1)(source)).toBe(curriedCopy)

    const directMap = new Uint16Array(4)
    const curriedMap = new Uint16Array(4)
    expect(TypedArrayOps.mapInto(source, directMap, (value) => value * 2, 1)).toBe(directMap)
    expect(TypedArrayOps.mapInto(curriedMap, (value) => value * 2, 1)(source)).toBe(curriedMap)

    const directFilter = new Uint16Array(4)
    const curriedFilter = new Uint16Array(4)
    expect(TypedArrayOps.filterInto(source, directFilter, (value) => value > 1, 1)).toEqual({
      target: directFilter,
      written: 1,
    })
    expect(TypedArrayOps.filterInto(curriedFilter, (value) => value > 1, 1)(source)).toEqual({
      target: curriedFilter,
      written: 1,
    })
  })

  it('restores TypedArray slice and sort data-first lanes', () => {
    const source = new Uint16Array([3, 1, 2])
    expect(TypedArrayOps.slice(source, 1, 3)).toEqual(TypedArrayOps.slice(1, 3)(source))
    expect(TypedArrayOps.sort(source)).toEqual(TypedArrayOps.sort()(source))
    expect(TypedArrayOps.sort(source, (left, right) => right - left)).toEqual(
      TypedArrayOps.sort((left: number, right: number) => right - left)(source),
    )
  })
})
