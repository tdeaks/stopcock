import { describe, it, expect } from 'vitest'
import { compose, decompose } from '../core'
import { range, rangeBy, daysIn, weekdaysIn, sequence } from '../range'
import { add } from '../arithmetic'
import type { Timestamp } from '../types'

const start = compose(2024, 3, 1, 0, 0, 0, 0)
const end = compose(2024, 3, 5, 0, 0, 0, 0)

describe('range', () => {
  it('daily range', () => {
    const result = range(start, end, 1, 'day')
    expect(result).toHaveLength(5)
    expect(decompose(result[0]!).day).toBe(1)
    expect(decompose(result[4]!).day).toBe(5)
  })

  it('2-day step', () => {
    const result = range(start, end, 2, 'day')
    expect(result).toHaveLength(3) // day 1, 3, 5
    expect(decompose(result[1]!).day).toBe(3)
  })

  it('hourly range', () => {
    const s = compose(2024, 3, 1, 0, 0, 0, 0)
    const e = compose(2024, 3, 1, 3, 0, 0, 0)
    const result = range(s, e, 1, 'hour')
    expect(result).toHaveLength(4) // 0, 1, 2, 3
  })

  it('data-last', () => {
    const fn = range(end, 1, 'day')
    const result = fn(start)
    expect(result).toHaveLength(5)
  })
})

describe('rangeBy', () => {
  it('custom step function', () => {
    const result = rangeBy(start, end, (ts) => add(ts, 2, 'day'))
    expect(result).toHaveLength(3)
  })

  it('data-last', () => {
    const fn = rangeBy(end, (ts: Timestamp) => add(ts, 1, 'day'))
    const result = fn(start)
    expect(result).toHaveLength(5)
  })
})

describe('daysIn', () => {
  it('March 2024 = 31 days', () => {
    const result = daysIn(2024, 3)
    expect(result).toHaveLength(31)
    expect(decompose(result[0]!).day).toBe(1)
    expect(decompose(result[30]!).day).toBe(31)
  })

  it('Feb 2024 (leap) = 29 days', () => {
    expect(daysIn(2024, 2)).toHaveLength(29)
  })

  it('Feb 2023 = 28 days', () => {
    expect(daysIn(2023, 2)).toHaveLength(28)
  })
})

describe('weekdaysIn', () => {
  it('only weekdays returned', () => {
    const result = weekdaysIn(2024, 3)
    expect(result.length).toBe(21) // March 2024 has 21 weekdays
    for (const ts of result) {
      const d = new Date(ts as number)
      const dow = d.getUTCDay()
      expect(dow).not.toBe(0)
      expect(dow).not.toBe(6)
    }
  })
})

describe('sequence', () => {
  it('generates count items', () => {
    const result = sequence(start, 5, 1, 'day')
    expect(result).toHaveLength(5)
    expect(decompose(result[0]!).day).toBe(1)
    expect(decompose(result[4]!).day).toBe(5)
  })

  it('data-last', () => {
    const fn = sequence(3, 1, 'day')
    const result = fn(start)
    expect(result).toHaveLength(3)
  })
})
