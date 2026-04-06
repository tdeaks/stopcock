import { describe, it, expect, beforeAll } from 'vitest'
import { pipe } from '@stopcock/fp'
import { compose, decompose } from '../core'
import { now, fromDate } from '../create'
import { format as utcFormat } from '../format'
import * as Tz from '../tz'
import type { Timestamp } from '../types'

beforeAll(() => Tz.clearCache())

// ── Helpers ──────────────────────────────────────────────────────────

function utc(y: number, m: number, d: number, h = 0, min = 0, s = 0): Timestamp {
  return compose(y, m, d, h, min, s, 0)
}

// ── Scenario 1: Normal time (no DST boundary) ───────────────────────

describe('normal time', () => {
  it('resolves EST offset', () => {
    const ts = utc(2024, 1, 15, 18, 0, 0) // Jan 15 18:00 UTC
    const offset = Tz.resolveOffset('America/New_York', ts as number)
    expect(offset).toBe(-5 * 3_600_000) // EST = -5h
  })

  it('resolves EDT offset', () => {
    const ts = utc(2024, 6, 15, 18, 0, 0) // Jun 15 18:00 UTC
    const offset = Tz.resolveOffset('America/New_York', ts as number)
    expect(offset).toBe(-4 * 3_600_000) // EDT = -4h
  })

  it('formats in timezone', () => {
    const ts = utc(2024, 6, 15, 18, 0, 0)
    expect(Tz.format(ts, 'HH:mm', 'America/New_York')).toBe('14:00')
  })

  it('format data-last in pipe', () => {
    const ts = utc(2024, 6, 15, 18, 0, 0)
    const result = pipe(ts, Tz.format('HH:mm', 'America/New_York'))
    expect(result).toBe('14:00')
  })

  it('extracts local hour', () => {
    const ts = utc(2024, 6, 15, 18, 0, 0)
    expect(Tz.getHours(ts, 'America/New_York')).toBe(14)
  })

  it('extracts local day', () => {
    // 2024-01-15 03:00 UTC = 2024-01-14 22:00 EST (previous day!)
    const ts = utc(2024, 1, 15, 3, 0, 0)
    expect(Tz.getDay(ts, 'America/New_York')).toBe(14)
  })
})

// ── Scenario 2: Spring forward (gap) ────────────────────────────────
// US/Eastern Mar 10 2024: 2:00 AM local → 3:00 AM (clocks skip forward)
// Transition at 2024-03-10T07:00:00Z

describe('spring forward (gap)', () => {
  it('offset changes at transition', () => {
    const beforeTransition = utc(2024, 3, 10, 6, 59, 0)
    const afterTransition = utc(2024, 3, 10, 7, 1, 0)
    expect(Tz.resolveOffset('America/New_York', beforeTransition as number)).toBe(-5 * 3_600_000)
    expect(Tz.resolveOffset('America/New_York', afterTransition as number)).toBe(-4 * 3_600_000)
  })

  it('parse nonexistent time with compatible disambiguation', () => {
    // 2:30 AM doesn't exist on this day
    const ts = Tz.parseTz('2024-03-10 02:30', 'YYYY-MM-DD HH:mm', 'America/New_York', 'compatible')
    // 'compatible' shifts forward → becomes 3:30 AM EDT
    expect(Tz.format(ts, 'HH:mm', 'America/New_York')).toBe('03:30')
  })

  it('parse nonexistent time with later disambiguation', () => {
    const ts = Tz.parseTz('2024-03-10 02:30', 'YYYY-MM-DD HH:mm', 'America/New_York', 'later')
    // 'later' → first valid time after gap = 3:00 AM EDT
    const local = Tz.getHours(ts, 'America/New_York')
    expect(local).toBeGreaterThanOrEqual(3)
  })

  it('format around spring forward', () => {
    const before = utc(2024, 3, 10, 6, 30, 0) // 1:30 AM EST
    const after = utc(2024, 3, 10, 7, 30, 0)  // 3:30 AM EDT
    expect(Tz.format(before, 'HH:mm', 'America/New_York')).toBe('01:30')
    expect(Tz.format(after, 'HH:mm', 'America/New_York')).toBe('03:30')
  })
})

// ── Scenario 3: Fall back (fold) ────────────────────────────────────
// US/Eastern Nov 3 2024: 2:00 AM EDT → 1:00 AM EST (clocks repeat 1:00-1:59)
// Transition at 2024-11-03T06:00:00Z

describe('fall back (fold)', () => {
  it('offset changes at transition', () => {
    const beforeTransition = utc(2024, 11, 3, 5, 59, 0)
    const afterTransition = utc(2024, 11, 3, 6, 1, 0)
    expect(Tz.resolveOffset('America/New_York', beforeTransition as number)).toBe(-4 * 3_600_000)
    expect(Tz.resolveOffset('America/New_York', afterTransition as number)).toBe(-5 * 3_600_000)
  })

  it('parse ambiguous time with earlier disambiguation', () => {
    const ts = Tz.parseTz('2024-11-03 01:30', 'YYYY-MM-DD HH:mm', 'America/New_York', 'earlier')
    // 'earlier' → first occurrence (EDT) → UTC 05:30
    const utcHour = decompose(ts).hour
    expect(utcHour).toBe(5)
    expect(decompose(ts).minute).toBe(30)
  })

  it('parse ambiguous time with later disambiguation', () => {
    const ts = Tz.parseTz('2024-11-03 01:30', 'YYYY-MM-DD HH:mm', 'America/New_York', 'later')
    // 'later' → second occurrence (EST) → UTC 06:30
    const utcHour = decompose(ts).hour
    expect(utcHour).toBe(6)
    expect(decompose(ts).minute).toBe(30)
  })

  it('both occurrences format to the same local time', () => {
    const earlier = utc(2024, 11, 3, 5, 30, 0) // 01:30 EDT
    const later = utc(2024, 11, 3, 6, 30, 0)   // 01:30 EST
    expect(Tz.format(earlier, 'HH:mm', 'America/New_York')).toBe('01:30')
    expect(Tz.format(later, 'HH:mm', 'America/New_York')).toBe('01:30')
  })
})

// ── Scenario 4: startOf('day') crossing DST ─────────────────────────

describe('startOf with timezone', () => {
  it('start of day on spring forward day', () => {
    // Mar 10 2024, 11:00 AM EDT (15:00 UTC)
    const ts = utc(2024, 3, 10, 15, 0, 0)
    const result = Tz.startOf(ts, 'day', 'America/New_York')
    // Midnight local = 05:00 UTC (still EST at midnight)
    expect(Tz.format(result, 'HH:mm', 'America/New_York')).toBe('00:00')
    expect(Tz.getDay(result, 'America/New_York')).toBe(10)
  })

  it('start of day on fall back day', () => {
    const ts = utc(2024, 11, 3, 15, 0, 0) // 10:00 AM EST
    const result = Tz.startOf(ts, 'day', 'America/New_York')
    expect(Tz.format(result, 'HH:mm', 'America/New_York')).toBe('00:00')
    expect(Tz.getDay(result, 'America/New_York')).toBe(3)
  })

  it('start of month', () => {
    const ts = utc(2024, 3, 15, 20, 0, 0) // Mar 15
    const result = Tz.startOf(ts, 'month', 'America/New_York')
    expect(Tz.getDay(result, 'America/New_York')).toBe(1)
    expect(Tz.getMonth(result, 'America/New_York')).toBe(3)
  })

  it('data-last in pipe', () => {
    const ts = utc(2024, 6, 15, 18, 0, 0)
    const result = pipe(ts, Tz.startOf('day', 'America/New_York'))
    expect(Tz.format(result, 'HH:mm', 'America/New_York')).toBe('00:00')
  })
})

// ── Scenario 5: add(1, 'day') crossing DST ──────────────────────────

describe('add with timezone', () => {
  it('add 1 day across spring forward preserves wall clock time', () => {
    // Mar 9, 10:00 AM EST (15:00 UTC)
    const ts = utc(2024, 3, 9, 15, 0, 0)
    const result = Tz.add(ts, 1, 'day', 'America/New_York')
    // Should be Mar 10, 10:00 AM EDT (14:00 UTC). 23 real hours later
    expect(Tz.format(result, 'YYYY-MM-DD HH:mm', 'America/New_York')).toBe('2024-03-10 10:00')
    expect((result as number) - (ts as number)).toBe(23 * 3_600_000) // 23 hours, not 24
  })

  it('add 1 day across fall back preserves wall clock time', () => {
    // Nov 2, 10:00 AM EDT (14:00 UTC)
    const ts = utc(2024, 11, 2, 14, 0, 0)
    const result = Tz.add(ts, 1, 'day', 'America/New_York')
    // Should be Nov 3, 10:00 AM EST (15:00 UTC). 25 real hours later
    expect(Tz.format(result, 'YYYY-MM-DD HH:mm', 'America/New_York')).toBe('2024-11-03 10:00')
    expect((result as number) - (ts as number)).toBe(25 * 3_600_000) // 25 hours, not 24
  })

  it('add 1 month crossing DST', () => {
    // Feb 15, 10:00 AM EST
    const ts = utc(2024, 2, 15, 15, 0, 0)
    const result = Tz.add(ts, 1, 'month', 'America/New_York')
    // Mar 15, 10:00 AM EDT
    expect(Tz.format(result, 'YYYY-MM-DD HH:mm', 'America/New_York')).toBe('2024-03-15 10:00')
  })

  it('add hours is absolute (no tz adjustment)', () => {
    const ts = utc(2024, 3, 10, 6, 0, 0) // 1:00 AM EST, just before spring forward
    const result = Tz.add(ts, 2, 'hour', 'America/New_York')
    // 2 real hours later = 08:00 UTC = 4:00 AM EDT
    expect((result as number) - (ts as number)).toBe(2 * 3_600_000)
  })

  it('data-last in pipe', () => {
    const ts = utc(2024, 6, 15, 18, 0, 0)
    const result = pipe(ts, Tz.add(1, 'day', 'America/New_York'))
    expect(Tz.getDay(result, 'America/New_York')).toBe(16)
  })
})

// ── Scenario 6: No-DST timezone ─────────────────────────────────────

describe('no-DST timezone', () => {
  it('Nepal has constant offset', () => {
    const jan = utc(2024, 1, 15, 12, 0, 0)
    const jul = utc(2024, 7, 15, 12, 0, 0)
    const offsetJan = Tz.resolveOffset('Asia/Kathmandu', jan as number)
    const offsetJul = Tz.resolveOffset('Asia/Kathmandu', jul as number)
    expect(offsetJan).toBe(offsetJul)
    expect(offsetJan).toBe(5 * 3_600_000 + 45 * 60_000) // UTC+05:45
  })

  it('formats correctly', () => {
    const ts = utc(2024, 1, 15, 12, 0, 0) // noon UTC
    expect(Tz.format(ts, 'HH:mm', 'Asia/Kathmandu')).toBe('17:45')
  })
})

// ── Scenario 7: Offset string ────────────────────────────────────────

describe('getOffsetString', () => {
  it('EST', () => {
    const ts = utc(2024, 1, 15, 12, 0, 0)
    expect(Tz.getOffsetString(ts, 'America/New_York')).toBe('UTC-05:00')
  })

  it('Nepal', () => {
    const ts = utc(2024, 1, 15, 12, 0, 0)
    expect(Tz.getOffsetString(ts, 'Asia/Kathmandu')).toBe('UTC+05:45')
  })
})

// ── Scenario 8: Southern hemisphere ──────────────────────────────────

describe('southern hemisphere', () => {
  it('Australia/Sydney has opposite DST schedule', () => {
    // Sydney is AEDT (UTC+11) in Jan, AEST (UTC+10) in Jul
    const jan = utc(2024, 1, 15, 0, 0, 0)
    const jul = utc(2024, 7, 15, 0, 0, 0)
    const offJan = Tz.resolveOffset('Australia/Sydney', jan as number)
    const offJul = Tz.resolveOffset('Australia/Sydney', jul as number)
    expect(offJan).toBe(11 * 3_600_000)  // AEDT
    expect(offJul).toBe(10 * 3_600_000)  // AEST
  })
})

// ── Scenario 9: UTC itself ───────────────────────────────────────────

describe('UTC timezone', () => {
  it('offset is always 0', () => {
    const ts = utc(2024, 6, 15, 12, 0, 0)
    expect(Tz.resolveOffset('UTC', ts as number)).toBe(0)
  })

  it('format matches UTC format', () => {
    const ts = utc(2024, 6, 15, 14, 30, 0)
    expect(Tz.format(ts, 'HH:mm', 'UTC')).toBe(utcFormat(ts, 'HH:mm'))
  })
})

describe('diff with timezone', () => {
  it('diff in days', () => {
    const a = utc(2024, 3, 15, 18, 0, 0) // Mar 15
    const b = utc(2024, 3, 10, 18, 0, 0) // Mar 10
    expect(Tz.diff(a, b, 'day', 'America/New_York')).toBe(5)
  })

  it('diff in months', () => {
    const a = utc(2024, 6, 15, 12, 0, 0)
    const b = utc(2024, 1, 15, 12, 0, 0)
    expect(Tz.diff(a, b, 'month', 'America/New_York')).toBe(5)
  })

  it('diff in years', () => {
    const a = utc(2026, 1, 1, 12, 0, 0)
    const b = utc(2024, 1, 1, 12, 0, 0)
    expect(Tz.diff(a, b, 'year', 'America/New_York')).toBe(2)
  })

  it('diff in weeks', () => {
    const a = utc(2024, 3, 22, 12, 0, 0)
    const b = utc(2024, 3, 1, 12, 0, 0)
    expect(Tz.diff(a, b, 'week', 'America/New_York')).toBe(3)
  })

  it('diff in hours (absolute)', () => {
    const a = utc(2024, 3, 15, 18, 0, 0)
    const b = utc(2024, 3, 15, 12, 0, 0)
    expect(Tz.diff(a, b, 'hour', 'America/New_York')).toBe(6)
  })

  it('diff in minutes', () => {
    const a = utc(2024, 3, 15, 12, 30, 0)
    const b = utc(2024, 3, 15, 12, 0, 0)
    expect(Tz.diff(a, b, 'minute', 'America/New_York')).toBe(30)
  })

  it('diff in seconds', () => {
    const a = utc(2024, 3, 15, 12, 0, 45)
    const b = utc(2024, 3, 15, 12, 0, 0)
    expect(Tz.diff(a, b, 'second', 'America/New_York')).toBe(45)
  })

  it('diff in milliseconds', () => {
    const a = utc(2024, 3, 15, 12, 0, 1)
    const b = utc(2024, 3, 15, 12, 0, 0)
    expect(Tz.diff(a, b, 'millisecond', 'America/New_York')).toBe(1000)
  })

  it('data-last', () => {
    const a = utc(2024, 3, 15, 18, 0, 0)
    const b = utc(2024, 3, 10, 18, 0, 0)
    const fn = Tz.diff(b, 'day', 'America/New_York')
    expect(fn(a)).toBe(5)
  })
})

describe('getOffsetMinutes', () => {
  it('EST = -300', () => {
    const ts = utc(2024, 1, 15, 12, 0, 0)
    expect(Tz.getOffsetMinutes(ts, 'America/New_York')).toBe(-300)
  })

  it('Nepal = +345', () => {
    const ts = utc(2024, 1, 15, 12, 0, 0)
    expect(Tz.getOffsetMinutes(ts, 'Asia/Kathmandu')).toBe(345)
  })
})

describe('endOf with timezone', () => {
  it('end of day', () => {
    const ts = utc(2024, 6, 15, 18, 0, 0)
    const result = Tz.endOf(ts, 'day', 'America/New_York')
    expect(Tz.format(result, 'HH:mm:ss', 'America/New_York')).toBe('23:59:59')
    expect(Tz.getDay(result, 'America/New_York')).toBe(15)
  })
})

describe('subtract with timezone', () => {
  it('subtract 1 day', () => {
    const ts = utc(2024, 6, 15, 18, 0, 0)
    const result = Tz.subtract(ts, 1, 'day', 'America/New_York')
    expect(Tz.getDay(result, 'America/New_York')).toBe(14)
  })

  it('data-last', () => {
    const ts = utc(2024, 6, 15, 18, 0, 0)
    const result = pipe(ts, Tz.subtract(1, 'day', 'America/New_York'))
    expect(Tz.getDay(result, 'America/New_York')).toBe(14)
  })
})

describe('parserTz', () => {
  it('returns a reusable parser', () => {
    const p = Tz.parserTz('YYYY-MM-DD HH:mm', 'America/New_York')
    const ts = p('2024-06-15 10:00')
    expect(Tz.format(ts, 'HH:mm', 'America/New_York')).toBe('10:00')
  })
})

describe('formatter', () => {
  it('returns a reusable formatter', () => {
    const f = Tz.formatter('HH:mm', 'America/New_York')
    const ts = utc(2024, 6, 15, 18, 0, 0)
    expect(f(ts)).toBe('14:00')
  })
})

describe('tz-aware predicates', () => {
  it('isSameDay across midnight UTC', () => {
    const a = utc(2024, 6, 16, 3, 0, 0)  // Jun 15 11pm in NYC
    const b = utc(2024, 6, 16, 2, 0, 0)  // Jun 15 10pm in NYC
    expect(Tz.isSameDay(a, b, 'America/New_York')).toBe(true)
  })

  it('isWeekend', () => {
    const sat = utc(2024, 3, 16, 12, 0, 0)
    expect(Tz.isWeekend(sat, 'America/New_York')).toBe(true)
    expect(Tz.isWeekday(sat, 'America/New_York')).toBe(false)
  })
})

describe('tz getters', () => {
  it('getYear', () => {
    const ts = utc(2025, 1, 1, 3, 0, 0) // Still Dec 31 in NYC
    expect(Tz.getYear(ts, 'America/New_York')).toBe(2024)
  })

  it('getMonth', () => {
    const ts = utc(2024, 7, 1, 3, 0, 0) // Still June in NYC
    expect(Tz.getMonth(ts, 'America/New_York')).toBe(6)
  })

  it('getMinutes', () => {
    const ts = utc(2024, 6, 15, 18, 45, 0)
    expect(Tz.getMinutes(ts, 'UTC')).toBe(45)
  })

  it('getSeconds', () => {
    const ts = utc(2024, 6, 15, 18, 0, 33)
    expect(Tz.getSeconds(ts, 'UTC')).toBe(33)
  })
})
