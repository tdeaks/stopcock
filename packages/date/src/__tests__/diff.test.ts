import { describe, it, expect } from 'vitest'
import { pipe } from '@stopcock/fp'
import { compose } from '../core'
import { diff, diffInDays, diffInHours, diffInMinutes, diffInSeconds, diffInMonths, diffInYears } from '../diff'

const a = compose(2024, 1, 1, 0, 0, 0, 0)
const b = compose(2024, 3, 15, 12, 30, 45, 0)

describe('diff', () => {
  it('millisecond', () => expect(diff(b, a, 'millisecond')).toBe(b as number - (a as number)))
  it('second', () => expect(diff(b, a, 'second')).toBe(((b as number - (a as number)) / 1000) | 0))
  it('minute', () => expect(diff(b, a, 'minute')).toBe(((b as number - (a as number)) / 60000) | 0))
  it('hour', () => expect(diff(b, a, 'hour')).toBe(((b as number - (a as number)) / 3600000) | 0))
  it('day', () => expect(diff(b, a, 'day')).toBe(((b as number - (a as number)) / 86400000) | 0))
  it('week', () => expect(diff(b, a, 'week')).toBe(((b as number - (a as number)) / (86400000 * 7)) | 0))
  it('month', () => expect(diff(b, a, 'month')).toBe(2))
  it('year', () => {
    const c = compose(2026, 6, 1, 0, 0, 0, 0)
    expect(diff(c, a, 'year')).toBe(2)
  })

  it('data-last', () => {
    const fn = diff(a, 'day')
    expect(fn(b)).toBe(((b as number - (a as number)) / 86400000) | 0)
  })
})

describe('diffInDays', () => {
  it('direct', () => expect(diffInDays(b, a)).toBe(74))
  it('data-last', () => expect(pipe(b, diffInDays(a))).toBe(74))
})

describe('diffInHours', () => {
  it('direct', () => expect(diffInHours(b, a)).toBe(74 * 24 + 12))
  it('data-last', () => expect(pipe(b, diffInHours(a))).toBe(74 * 24 + 12))
})

describe('diffInMinutes', () => {
  it('direct', () => expect(diffInMinutes(b, a)).toBe((74 * 24 + 12) * 60 + 30))
})

describe('diffInSeconds', () => {
  it('direct', () => expect(diffInSeconds(b, a)).toBe(((74 * 24 + 12) * 60 + 30) * 60 + 45))
})

describe('diffInMonths', () => {
  it('direct', () => expect(diffInMonths(b, a)).toBe(2))
  it('data-last', () => expect(pipe(b, diffInMonths(a))).toBe(2))
})

describe('diffInYears', () => {
  it('direct', () => {
    const c = compose(2026, 1, 1, 0, 0, 0, 0)
    expect(diffInYears(c, a)).toBe(2)
  })
  it('data-last', () => {
    const c = compose(2026, 1, 1, 0, 0, 0, 0)
    expect(pipe(c, diffInYears(a))).toBe(2)
  })
})
