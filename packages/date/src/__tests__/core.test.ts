import { describe, it, expect } from 'vitest'
import { epochDaysToCivil, civilToEpochDays, compose, decompose, isLeapYear, daysInMonth, stamp } from '../core'
import type { Timestamp } from '../types'

describe('epochDaysToCivil / civilToEpochDays', () => {
  const cases: [number, number, number][] = [
    [1970, 1, 1],
    [2000, 1, 1],
    [2000, 2, 29],
    [2024, 3, 15],
    [1969, 12, 31],
    [1900, 1, 1],
    [2100, 12, 31],
  ]

  for (const [y, m, d] of cases) {
    it(`roundtrips ${y}-${m}-${d}`, () => {
      const days = civilToEpochDays(y, m, d)
      const civil = epochDaysToCivil(days)
      expect(civil).toEqual({ year: y, month: m, day: d })
    })

    it(`matches Date for ${y}-${m}-${d}`, () => {
      const days = civilToEpochDays(y, m, d)
      const expected = Date.UTC(y, m - 1, d) / 86_400_000
      expect(days).toBe(expected)
    })
  }

  it('epoch day 0 is 1970-01-01', () => {
    expect(epochDaysToCivil(0)).toEqual({ year: 1970, month: 1, day: 1 })
  })
})

describe('compose / decompose', () => {
  it('roundtrips', () => {
    const ts = compose(2024, 6, 15, 14, 30, 45, 123)
    const parts = decompose(ts)
    expect(parts).toEqual({ year: 2024, month: 6, day: 15, hour: 14, minute: 30, second: 45, millisecond: 123 })
  })

  it('matches Date.UTC', () => {
    const ts = compose(2024, 6, 15, 14, 30, 45, 123)
    const expected = Date.UTC(2024, 5, 15, 14, 30, 45, 123)
    expect(ts as number).toBe(expected)
  })
})

describe('isLeapYear', () => {
  it('2000 is leap', () => expect(isLeapYear(2000)).toBe(true))
  it('2024 is leap', () => expect(isLeapYear(2024)).toBe(true))
  it('1900 is not leap', () => expect(isLeapYear(1900)).toBe(false))
  it('2023 is not leap', () => expect(isLeapYear(2023)).toBe(false))
})

describe('daysInMonth', () => {
  it('Feb 2024 = 29', () => expect(daysInMonth(2024, 2)).toBe(29))
  it('Feb 2023 = 28', () => expect(daysInMonth(2023, 2)).toBe(28))
  it('Jan = 31', () => expect(daysInMonth(2024, 1)).toBe(31))
  it('Apr = 30', () => expect(daysInMonth(2024, 4)).toBe(30))
})
