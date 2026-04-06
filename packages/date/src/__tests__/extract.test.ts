import { describe, it, expect } from 'vitest'
import { compose } from '../core'
import {
  getYear, getMonth, getDay, getWeekday, getHours, getMinutes, getSeconds, getMilliseconds,
  getDayOfYear, getWeekOfYear, getQuarter, getDaysInMonth, getDaysInYear, isLeapYear,
} from '../extract'

const ts = compose(2024, 3, 15, 14, 30, 45, 123) // Friday

describe('getters', () => {
  it('getYear', () => expect(getYear(ts)).toBe(2024))
  it('getMonth', () => expect(getMonth(ts)).toBe(3))
  it('getDay', () => expect(getDay(ts)).toBe(15))
  it('getWeekday (Friday = 5)', () => expect(getWeekday(ts)).toBe(5))
  it('getHours', () => expect(getHours(ts)).toBe(14))
  it('getMinutes', () => expect(getMinutes(ts)).toBe(30))
  it('getSeconds', () => expect(getSeconds(ts)).toBe(45))
  it('getMilliseconds', () => expect(getMilliseconds(ts)).toBe(123))
})

describe('getWeekday edge cases', () => {
  it('Sunday = 0', () => expect(getWeekday(compose(2024, 3, 17, 0, 0, 0, 0))).toBe(0))
  it('Monday = 1', () => expect(getWeekday(compose(2024, 3, 11, 0, 0, 0, 0))).toBe(1))
  it('Saturday = 6', () => expect(getWeekday(compose(2024, 3, 16, 0, 0, 0, 0))).toBe(6))
})

describe('getDayOfYear', () => {
  it('Jan 1 = 1', () => expect(getDayOfYear(compose(2024, 1, 1, 0, 0, 0, 0))).toBe(1))
  it('Mar 15 2024 (leap year) = 75', () => expect(getDayOfYear(ts)).toBe(75))
  it('Dec 31 2024 (leap year) = 366', () => expect(getDayOfYear(compose(2024, 12, 31, 0, 0, 0, 0))).toBe(366))
})

describe('getWeekOfYear', () => {
  it('first week of 2024', () => expect(getWeekOfYear(compose(2024, 1, 1, 0, 0, 0, 0))).toBe(1))
  it('mid-year', () => {
    const w = getWeekOfYear(ts)
    expect(w).toBeGreaterThan(10)
    expect(w).toBeLessThan(13)
  })
  it('Dec 31 that belongs to week 1 of next year', () => {
    // 2024-12-30 is a Monday. Jan 4 2025 is a Saturday. Week 1 of 2025 starts Dec 30.
    expect(getWeekOfYear(compose(2024, 12, 30, 0, 0, 0, 0))).toBe(1)
  })
  it('early Jan belonging to previous year week', () => {
    // 2023-01-01 is a Sunday. ISO week 52 of 2022.
    expect(getWeekOfYear(compose(2023, 1, 1, 0, 0, 0, 0))).toBe(52)
  })
})

describe('getQuarter', () => {
  it('Jan = Q1', () => expect(getQuarter(compose(2024, 1, 15, 0, 0, 0, 0))).toBe(1))
  it('Apr = Q2', () => expect(getQuarter(compose(2024, 4, 15, 0, 0, 0, 0))).toBe(2))
  it('Jul = Q3', () => expect(getQuarter(compose(2024, 7, 15, 0, 0, 0, 0))).toBe(3))
  it('Oct = Q4', () => expect(getQuarter(compose(2024, 10, 15, 0, 0, 0, 0))).toBe(4))
})

describe('getDaysInMonth', () => {
  it('Feb 2024 (leap) = 29', () => expect(getDaysInMonth(compose(2024, 2, 1, 0, 0, 0, 0))).toBe(29))
  it('Feb 2023 = 28', () => expect(getDaysInMonth(compose(2023, 2, 1, 0, 0, 0, 0))).toBe(28))
  it('Jan = 31', () => expect(getDaysInMonth(compose(2024, 1, 1, 0, 0, 0, 0))).toBe(31))
})

describe('getDaysInYear', () => {
  it('2024 (leap) = 366', () => expect(getDaysInYear(compose(2024, 1, 1, 0, 0, 0, 0))).toBe(366))
  it('2023 = 365', () => expect(getDaysInYear(compose(2023, 1, 1, 0, 0, 0, 0))).toBe(365))
})

describe('isLeapYear', () => {
  it('2024 is leap', () => expect(isLeapYear(2024)).toBe(true))
  it('2023 is not', () => expect(isLeapYear(2023)).toBe(false))
  it('1900 is not', () => expect(isLeapYear(1900)).toBe(false))
  it('2000 is leap', () => expect(isLeapYear(2000)).toBe(true))
})
