import { describe, it, expect } from 'vitest'
import { compose } from '../core'
import { duration, addDuration, subtractDuration, toDuration, durationToUnit, scaleDuration, negateDuration } from '../duration'
import type { Duration, Timestamp } from '../types'

const ts = compose(2024, 3, 15, 12, 0, 0, 0)

describe('duration', () => {
  it('millisecond', () => expect(duration(500, 'millisecond') as number).toBe(500))
  it('second', () => expect(duration(1, 'second') as number).toBe(1000))
  it('minute', () => expect(duration(1, 'minute') as number).toBe(60_000))
  it('hour', () => expect(duration(1, 'hour') as number).toBe(3_600_000))
  it('day', () => expect(duration(1, 'day') as number).toBe(86_400_000))
  it('week', () => expect(duration(1, 'week') as number).toBe(604_800_000))
  it('month', () => expect(duration(1, 'month') as number).toBe(30 * 86_400_000))
  it('year', () => expect(duration(1, 'year') as number).toBe(365 * 86_400_000))
})

describe('addDuration', () => {
  it('direct', () => {
    const d = duration(1, 'hour')
    const result = addDuration(ts, d)
    expect((result as number) - (ts as number)).toBe(3_600_000)
  })

  it('data-last', () => {
    const d = duration(2, 'day')
    const fn = addDuration(d)
    expect((fn(ts) as number) - (ts as number)).toBe(2 * 86_400_000)
  })
})

describe('subtractDuration', () => {
  it('direct', () => {
    const d = duration(1, 'hour')
    const result = subtractDuration(ts, d)
    expect((ts as number) - (result as number)).toBe(3_600_000)
  })

  it('data-last', () => {
    const d = duration(1, 'day')
    const fn = subtractDuration(d)
    expect((ts as number) - (fn(ts) as number)).toBe(86_400_000)
  })
})

describe('toDuration', () => {
  it('absolute difference', () => {
    const a = compose(2024, 3, 15, 12, 0, 0, 0)
    const b = compose(2024, 3, 15, 14, 0, 0, 0)
    expect(toDuration(a, b) as number).toBe(2 * 3_600_000)
  })

  it('order does not matter', () => {
    const a = compose(2024, 3, 15, 12, 0, 0, 0)
    const b = compose(2024, 3, 15, 14, 0, 0, 0)
    expect(toDuration(b, a) as number).toBe(2 * 3_600_000)
  })
})

describe('durationToUnit', () => {
  const d = duration(2, 'hour')
  it('to hours', () => expect(durationToUnit(d, 'hour')).toBe(2))
  it('to minutes', () => expect(durationToUnit(d, 'minute')).toBe(120))
  it('to millisecond', () => expect(durationToUnit(d, 'millisecond')).toBe(7_200_000))

  it('data-last', () => {
    const fn = durationToUnit('minute')
    expect(fn(d)).toBe(120)
  })
})

describe('scaleDuration', () => {
  it('doubles', () => {
    const d = duration(1, 'hour')
    expect(scaleDuration(d, 2) as number).toBe(7_200_000)
  })
})

describe('negateDuration', () => {
  it('negates', () => {
    const d = duration(1, 'hour')
    expect(negateDuration(d) as number).toBe(-3_600_000)
  })
})
