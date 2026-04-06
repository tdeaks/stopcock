import { describe, it, expect } from 'vitest'
import { compose, decompose } from '../core'
import { now, fromDate, toDate, fromParts, fromTimestamp, fromISO, toTimestamp, toISO, clone } from '../create'
import type { Timestamp } from '../types'

describe('now', () => {
  it('returns a value close to Date.now', () => {
    const before = Date.now()
    const ts = now()
    const after = Date.now()
    expect(ts as number).toBeGreaterThanOrEqual(before)
    expect(ts as number).toBeLessThanOrEqual(after)
  })
})

describe('fromDate / toDate', () => {
  it('roundtrips', () => {
    const d = new Date('2024-06-15T10:30:00Z')
    const ts = fromDate(d)
    const back = toDate(ts)
    expect(back.getTime()).toBe(d.getTime())
  })
})

describe('fromParts', () => {
  it('full parts', () => {
    const ts = fromParts({ year: 2024, month: 3, day: 15, hour: 14, minute: 30, second: 45, millisecond: 123 })
    const p = decompose(ts)
    expect(p).toEqual({ year: 2024, month: 3, day: 15, hour: 14, minute: 30, second: 45, millisecond: 123 })
  })

  it('defaults missing fields', () => {
    const ts = fromParts({ year: 2024, month: 6 })
    const p = decompose(ts)
    expect(p).toMatchObject({ year: 2024, month: 6, day: 1, hour: 0, minute: 0 })
  })
})

describe('fromTimestamp / toTimestamp', () => {
  it('roundtrips', () => {
    const ms = Date.UTC(2024, 5, 15)
    const ts = fromTimestamp(ms)
    expect(toTimestamp(ts)).toBe(ms)
  })
})

describe('fromISO / toISO', () => {
  it('roundtrips', () => {
    const iso = '2024-06-15T10:30:00.000Z'
    const ts = fromISO(iso)
    expect(toISO(ts)).toBe(iso)
  })
})

describe('clone', () => {
  it('returns same value', () => {
    const ts = compose(2024, 1, 1, 0, 0, 0, 0)
    expect(clone(ts)).toBe(ts)
  })
})
