import { describe, expect, it } from 'vite-plus/test'
import { diffInMonths, diffInYears } from '../diff'
import { add } from '../arithmetic'
import { fromISO } from '../create'

/**
 * `diffInMonths` and `diffInYears` count *complete* periods.
 *
 * They used to count calendar boundaries, which reported one month between
 * 31 January and 1 February and one year between 31 December and 1 January —
 * gaps of a single day. date-fns, dayjs and luxon all answer 0 for those.
 *
 * The subtlety that makes a plain day-of-month comparison wrong is month-end
 * clamping: 31 January plus one month is 28 February, so a whole month really
 * has elapsed by 28 February even though 28 < 31.
 */
const at = (s: string) => fromISO(s)!
const d = (s: string) => at(`${s}T00:00:00.000Z`)

describe('diffInMonths counts complete months', () => {
  it.each([
    ['2026-02-01', '2026-01-31', 0, 'one day apart'],
    ['2026-03-01', '2026-01-31', 1, 'one month and one day'],
    ['2026-02-28', '2026-01-31', 1, 'exactly one clamped month'],
    ['2026-02-27', '2026-01-31', 0, 'one day short of a clamped month'],
    ['2026-01-31', '2026-01-01', 0, 'same month'],
    ['2026-12-31', '2026-01-01', 11, 'not yet a full twelve'],
    ['2027-01-01', '2026-01-01', 12, 'exactly twelve'],
    ['2026-01-31', '2026-03-01', -1, 'negative direction'],
    ['2026-01-31', '2026-02-01', 0, 'negative, one day apart'],
  ])('%s − %s = %i (%s)', (a, b, expected) => {
    expect(diffInMonths(d(a), d(b))).toBe(expected)
  })
})

describe('diffInYears counts complete years', () => {
  it.each([
    ['2026-01-01', '2025-12-31', 0, 'one day apart'],
    ['2026-12-31', '2026-01-01', 0, 'same year'],
    ['2027-01-01', '2026-01-01', 1, 'exactly one'],
    ['2026-02-28', '2024-02-29', 2, 'leap start, clamped anniversary'],
    ['2026-02-27', '2024-02-29', 1, 'one day short'],
    ['2025-12-31', '2026-01-01', 0, 'negative, one day apart'],
  ])('%s − %s = %i (%s)', (a, b, expected) => {
    expect(diffInYears(d(a), d(b))).toBe(expected)
  })
})

describe('diff is the inverse of add', () => {
  // The property that makes the clamping behaviour coherent rather than
  // arbitrary: if diff says n complete periods, then adding n to the earlier
  // instant must not overshoot the later one.
  const samples = [
    '2026-01-31', '2026-02-28', '2024-02-29', '2026-03-31',
    '2025-12-31', '2026-01-01', '2026-06-15', '2000-02-29',
  ]
  it.each(samples)('add(b, diffInMonths(a, b), month) never overshoots a: %s', (b) => {
    for (const a of samples) {
      const n = diffInMonths(d(a), d(b))
      if (n > 0) expect(add(d(b), n, 'month') as number).toBeLessThanOrEqual(d(a) as number)
      if (n < 0) expect(add(d(b), n, 'month') as number).toBeGreaterThanOrEqual(d(a) as number)
    }
  })

  it.each(samples)('add(b, diffInYears(a, b), year) never overshoots a: %s', (b) => {
    for (const a of samples) {
      const n = diffInYears(d(a), d(b))
      if (n > 0) expect(add(d(b), n, 'year') as number).toBeLessThanOrEqual(d(a) as number)
      if (n < 0) expect(add(d(b), n, 'year') as number).toBeGreaterThanOrEqual(d(a) as number)
    }
  })
})
