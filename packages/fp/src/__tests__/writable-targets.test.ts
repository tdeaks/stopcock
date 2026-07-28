import { describe, expect, it } from 'vite-plus/test'
import * as ArrayOps from '../array'
import * as Indexed from '../indexed'
import * as Iter from '../iter'
import * as Tuple from '../tuple'

class NumberBucket extends Array<number> {
  readonly kind = 'number' as const
}

describe('writable-target collection helpers', () => {
  it('returns the exact array target for mapInto and filterInto', () => {
    const direct = new NumberBucket()
    const curried = new NumberBucket()

    expect(ArrayOps.mapInto(direct, (value: number) => value * 2)([1, 2])).toBe(direct)
    expect([...direct]).toEqual([2, 4])
    expect(ArrayOps.filterInto(curried, (value: number) => value > 1)([1, 2, 3])).toBe(curried)
    expect([...curried]).toEqual([2, 3])
  })

  it('preserves caller-owned targets for Indexed and Tuple writes', () => {
    const indexed = new NumberBucket(3)
    const appended = new NumberBucket()

    expect(Indexed.copyInto([1, 2, 3], indexed)).toBe(indexed)
    expect([...indexed]).toEqual([1, 2, 3])
    expect(Tuple.mapInto([1, 2] as const, appended, (value) => value * 3)).toBe(appended)
    expect([...appended]).toEqual([3, 6])
  })

  it('allows a guard to safely populate narrower storage', () => {
    const target: string[] = []
    const source: readonly (string | number)[] = ['one', 2, 'three']
    const isString = (value: string | number): value is string => typeof value === 'string'

    expect(Indexed.filterInto(source, target, isString)).toBe(target)
    expect(target).toEqual(['one', 'three'])
  })

  it('preserves exact targets for iterable Into terminals', () => {
    const iterTarget = new NumberBucket()

    expect(Iter.toArrayInto(iterTarget)([1, 2])).toBe(iterTarget)
    expect([...iterTarget]).toEqual([1, 2])
  })
})
