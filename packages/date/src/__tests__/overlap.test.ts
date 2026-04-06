import { describe, it, expect } from 'vitest'
import { compose, stamp } from '../core'
import { overlaps, contains, intersection, union, gap, mergeIntervals } from '../overlap'
import type { Timestamp } from '../types'

const d = (day: number) => compose(2024, 3, day, 0, 0, 0, 0)

describe('overlaps', () => {
  it('overlapping ranges', () => expect(overlaps(d(1), d(10), d(5), d(15))).toBe(true))
  it('non-overlapping', () => expect(overlaps(d(1), d(5), d(10), d(15))).toBe(false))
  it('adjacent (not overlapping)', () => expect(overlaps(d(1), d(5), d(5), d(10))).toBe(false))
  it('one contains the other', () => expect(overlaps(d(1), d(20), d(5), d(10))).toBe(true))
})

describe('contains', () => {
  it('point inside range', () => expect(contains(d(1), d(10), d(5))).toBe(true))
  it('point at start', () => expect(contains(d(1), d(10), d(1))).toBe(true))
  it('point at end', () => expect(contains(d(1), d(10), d(10))).toBe(true))
  it('point outside', () => expect(contains(d(1), d(10), d(15))).toBe(false))
})

describe('intersection', () => {
  it('overlapping ranges', () => {
    const result = intersection(d(1), d(10), d(5), d(15))
    expect(result).not.toBeNull()
    expect(result![0]).toBe(d(5))
    expect(result![1]).toBe(d(10))
  })

  it('non-overlapping', () => {
    expect(intersection(d(1), d(5), d(10), d(15))).toBeNull()
  })
})

describe('union', () => {
  it('overlapping ranges', () => {
    const result = union(d(1), d(10), d(5), d(15))
    expect(result).not.toBeNull()
    expect(result![0]).toBe(d(1))
    expect(result![1]).toBe(d(15))
  })

  it('non-overlapping', () => {
    expect(union(d(1), d(5), d(10), d(15))).toBeNull()
  })
})

describe('gap', () => {
  it('non-overlapping: returns gap duration', () => {
    const result = gap(d(1), d(5), d(10), d(15))
    expect(result).not.toBeNull()
    expect(result as number).toBe((d(10) as number) - (d(5) as number))
  })

  it('overlapping: returns null', () => {
    expect(gap(d(1), d(10), d(5), d(15))).toBeNull()
  })

  it('gap with reversed order', () => {
    const result = gap(d(10), d(15), d(1), d(5))
    expect(result).not.toBeNull()
    expect(result as number).toBe((d(10) as number) - (d(5) as number))
  })
})

describe('mergeIntervals', () => {
  it('merges overlapping', () => {
    const result = mergeIntervals([[d(1), d(10)], [d(5), d(15)], [d(20), d(25)]])
    expect(result).toHaveLength(2)
    expect(result[0]![0]).toBe(d(1))
    expect(result[0]![1]).toBe(d(15))
    expect(result[1]![0]).toBe(d(20))
    expect(result[1]![1]).toBe(d(25))
  })

  it('empty input', () => expect(mergeIntervals([])).toEqual([]))

  it('adjacent intervals merge', () => {
    const result = mergeIntervals([[d(1), d(5)], [d(5), d(10)]])
    expect(result).toHaveLength(1)
    expect(result[0]![0]).toBe(d(1))
    expect(result[0]![1]).toBe(d(10))
  })

  it('already disjoint', () => {
    const result = mergeIntervals([[d(1), d(3)], [d(5), d(7)]])
    expect(result).toHaveLength(2)
  })
})
