import { describe, it, expect } from 'vite-plus/test'
import { compose } from '../core'
import {
  isBefore,
  isAfter,
  isEqual,
  isSameDay,
  isSameMonth,
  isSameYear,
  isBetween,
  isWeekend,
  isWeekday,
  isToday,
  isPast,
  isFuture,
  isValid,
} from '../predicate'
import type { Timestamp } from '../types'

const a = compose(2024, 3, 15, 10, 0, 0, 0) // Friday
const b = compose(2024, 3, 15, 22, 0, 0, 0) // same day, later
const c = compose(2024, 6, 20, 10, 0, 0, 0)
const sat = compose(2024, 3, 16, 0, 0, 0, 0)
const sun = compose(2024, 3, 17, 0, 0, 0, 0)

describe('isBefore', () => {
  it('direct true', () => expect(isBefore(a, c)).toBe(true))
  it('direct false', () => expect(isBefore(c, a)).toBe(false))
  it('data-last', () => expect(isBefore(c)(a)).toBe(true))
})

describe('isAfter', () => {
  it('direct true', () => expect(isAfter(c, a)).toBe(true))
  it('direct false', () => expect(isAfter(a, c)).toBe(false))
  it('data-last', () => expect(isAfter(a)(c)).toBe(true))
})

describe('isEqual', () => {
  it('same', () => expect(isEqual(a, a)).toBe(true))
  it('different', () => expect(isEqual(a, b)).toBe(false))
  it('data-last', () => expect(isEqual(a)(a)).toBe(true))
})

describe('isSameDay', () => {
  it('same day different time', () => expect(isSameDay(a, b)).toBe(true))
  it('different day', () => expect(isSameDay(a, c)).toBe(false))
  it('data-last', () => expect(isSameDay(b)(a)).toBe(true))
})

describe('isSameMonth', () => {
  it('same month', () => expect(isSameMonth(a, b)).toBe(true))
  it('different month', () => expect(isSameMonth(a, c)).toBe(false))
  it('data-last', () => expect(isSameMonth(b)(a)).toBe(true))
})

describe('isSameYear', () => {
  it('same year', () => expect(isSameYear(a, c)).toBe(true))
  it('different year', () => {
    const other = compose(2025, 1, 1, 0, 0, 0, 0)
    expect(isSameYear(a, other)).toBe(false)
  })
  it('data-last', () => expect(isSameYear(c)(a)).toBe(true))
})

describe('isBetween', () => {
  it('inside range', () => expect(isBetween(b, a, c)).toBe(true))
  it('at start', () => expect(isBetween(a, a, c)).toBe(true))
  it('at end', () => expect(isBetween(c, a, c)).toBe(true))
  it('outside', () => {
    const before = compose(2023, 1, 1, 0, 0, 0, 0)
    expect(isBetween(before, a, c)).toBe(false)
  })
  it('data-last', () => expect(isBetween(a, c)(b)).toBe(true))
})

describe('isWeekend / isWeekday', () => {
  it('Friday is weekday', () => expect(isWeekday(a)).toBe(true))
  it('Friday is not weekend', () => expect(isWeekend(a)).toBe(false))
  it('Saturday is weekend', () => expect(isWeekend(sat)).toBe(true))
  it('Saturday is not weekday', () => expect(isWeekday(sat)).toBe(false))
  it('Sunday is weekend', () => expect(isWeekend(sun)).toBe(true))
})

describe('isToday', () => {
  it('past date is not today', () => expect(isToday(a)).toBe(false))
})

describe('isPast / isFuture', () => {
  it('old date is past', () => expect(isPast(a)).toBe(true))
  it('old date is not future', () => expect(isFuture(a)).toBe(false))
  it('far future is future', () => {
    const future = compose(2099, 1, 1, 0, 0, 0, 0)
    expect(isFuture(future)).toBe(true)
    expect(isPast(future)).toBe(false)
  })
})

describe('isValid', () => {
  it('valid timestamp', () => expect(isValid(a)).toBe(true))
  it('NaN is invalid', () => expect(isValid(NaN as Timestamp)).toBe(false))
})
