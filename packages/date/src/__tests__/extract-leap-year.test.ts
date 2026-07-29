import { describe, expect, it } from 'vite-plus/test'
import { isLeapYear, getDaysInMonth, getDaysInYear, getDayOfYear } from '../extract'
import { fromISO } from '../create'

/**
 * The public `isLeapYear` takes a Timestamp; `core.isLeapYear` takes a year.
 * For a while the public one was a direct re-export of the core one, so it
 * computed `1785196800000 % 4` and answered `true` for every date.
 *
 * Nothing caught it. The existing tests import the core function and pass
 * years, so they were correct and passing the whole time, and `Timestamp` is
 * `number & brand` — assignable to `number` — so the compiler had no objection
 * either. These cases go through the public, timestamp-taking surface.
 */
const at = (isoDate: string) => fromISO(`${isoDate}T00:00:00.000Z`)!

describe('isLeapYear over a Timestamp', () => {
  it.each([
    ['1900', false], // divisible by 100, not 400
    ['1996', true],
    ['2000', true], // divisible by 400
    ['2023', false],
    ['2024', true],
    ['2025', false],
    ['2026', false],
    ['2027', false],
    ['2100', false],
    ['2400', true],
  ])('%s', (year, expected) => {
    expect(isLeapYear(at(`${year}-07-01`))).toBe(expected)
  })

  it('is not constant across consecutive years', () => {
    // The failure mode was a function that ignored its input. Any single
    // assertion above could pass by luck; this cannot.
    const years = [2023, 2024, 2025, 2026].map((y) => isLeapYear(at(`${y}-06-15`)))
    expect(new Set(years).size).toBe(2)
    expect(years).toEqual([false, true, false, false])
  })

  it('agrees with the day and month counts for the same instant', () => {
    // Cross-check: three functions derived from the same rule must not
    // disagree with each other.
    for (const year of [1900, 2000, 2023, 2024, 2100]) {
      const ts = at(`${year}-02-10`)
      const leap = isLeapYear(ts)
      expect(getDaysInMonth(ts)).toBe(leap ? 29 : 28)
      expect(getDaysInYear(ts)).toBe(leap ? 366 : 365)
      expect(getDayOfYear(at(`${year}-03-01`))).toBe(leap ? 61 : 60)
    }
  })
})
