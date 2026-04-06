import { describe, it, expect } from 'vitest'
import { pipe } from '@stopcock/fp'
import { compose, decompose } from '../core'
import { add, subtract, startOf, endOf, setYear, setMonth, setDay, setHours, setMinutes, setSeconds } from '../arithmetic'
import type { Timestamp } from '../types'

const ts = compose(2024, 3, 15, 14, 30, 45, 123)

describe('add', () => {
  it('adds days', () => {
    const result = decompose(add(ts, 10, 'day'))
    expect(result.day).toBe(25)
  })

  it('adds hours', () => {
    const result = decompose(add(ts, 2, 'hour'))
    expect(result.hour).toBe(16)
  })

  it('adds months with clamping', () => {
    const jan31 = compose(2024, 1, 31, 0, 0, 0, 0)
    const result = decompose(add(jan31, 1, 'month'))
    expect(result).toMatchObject({ year: 2024, month: 2, day: 29 }) // leap year
  })

  it('adds months non-leap', () => {
    const jan31 = compose(2023, 1, 31, 0, 0, 0, 0)
    const result = decompose(add(jan31, 1, 'month'))
    expect(result).toMatchObject({ year: 2023, month: 2, day: 28 })
  })

  it('adds years', () => {
    const result = decompose(add(ts, 1, 'year'))
    expect(result.year).toBe(2025)
  })

  it('adds weeks', () => {
    const result = decompose(add(ts, 1, 'week'))
    expect(result.day).toBe(22)
  })

  it('adds minutes', () => {
    const result = decompose(add(ts, 30, 'minute'))
    expect(result.hour).toBe(15)
    expect(result.minute).toBe(0)
  })

  it('adds seconds', () => {
    const result = decompose(add(ts, 15, 'second'))
    expect(result.second).toBe(0)
    expect(result.minute).toBe(31)
  })

  it('adds milliseconds', () => {
    const result = decompose(add(ts, 877, 'millisecond'))
    expect(result.millisecond).toBe(0)
    expect(result.second).toBe(46)
  })

  it('data-last in pipe', () => {
    const result = pipe(ts, add(1, 'day'))
    expect(decompose(result).day).toBe(16)
  })
})

describe('subtract', () => {
  it('subtracts days', () => {
    const result = decompose(subtract(ts, 5, 'day'))
    expect(result.day).toBe(10)
  })
})

describe('startOf', () => {
  it('day', () => {
    const result = decompose(startOf(ts, 'day'))
    expect(result).toMatchObject({ hour: 0, minute: 0, second: 0, millisecond: 0 })
    expect(result.day).toBe(15)
  })

  it('month', () => {
    const result = decompose(startOf(ts, 'month'))
    expect(result).toMatchObject({ day: 1, hour: 0, minute: 0 })
  })

  it('year', () => {
    const result = decompose(startOf(ts, 'year'))
    expect(result).toMatchObject({ month: 1, day: 1, hour: 0 })
  })

  it('hour', () => {
    const result = decompose(startOf(ts, 'hour'))
    expect(result).toMatchObject({ hour: 14, minute: 0, second: 0, millisecond: 0 })
  })

  it('week', () => {
    const result = decompose(startOf(ts, 'week'))
    expect(result).toMatchObject({ hour: 0, minute: 0, second: 0, millisecond: 0 })
  })

  it('second', () => {
    const result = decompose(startOf(ts, 'second'))
    expect(result).toMatchObject({ second: 45, millisecond: 0 })
  })

  it('minute', () => {
    const result = decompose(startOf(ts, 'minute'))
    expect(result).toMatchObject({ minute: 30, second: 0, millisecond: 0 })
  })

  it('millisecond', () => {
    expect(startOf(ts, 'millisecond')).toBe(ts)
  })

  it('data-last', () => {
    const result = pipe(ts, startOf('day'))
    expect(decompose(result).hour).toBe(0)
  })
})

describe('endOf', () => {
  it('day', () => {
    const result = decompose(endOf(ts, 'day'))
    expect(result).toMatchObject({ hour: 23, minute: 59, second: 59, millisecond: 999 })
  })

  it('month', () => {
    const result = decompose(endOf(ts, 'month'))
    expect(result).toMatchObject({ day: 31, hour: 23, minute: 59 })
  })

  it('year', () => {
    const result = decompose(endOf(ts, 'year'))
    expect(result).toMatchObject({ month: 12, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999 })
  })

  it('week', () => {
    const result = decompose(endOf(ts, 'week'))
    expect(result).toMatchObject({ hour: 23, minute: 59, second: 59, millisecond: 999 })
  })

  it('hour', () => {
    const result = decompose(endOf(ts, 'hour'))
    expect(result).toMatchObject({ hour: 14, minute: 59, second: 59, millisecond: 999 })
  })

  it('minute', () => {
    const result = decompose(endOf(ts, 'minute'))
    expect(result).toMatchObject({ minute: 30, second: 59, millisecond: 999 })
  })

  it('second', () => {
    const result = decompose(endOf(ts, 'second'))
    expect(result).toMatchObject({ second: 45, millisecond: 999 })
  })

  it('millisecond', () => {
    expect(endOf(ts, 'millisecond')).toBe(ts)
  })
})

describe('setters', () => {
  it('setYear', () => expect(decompose(setYear(ts, 2030)).year).toBe(2030))
  it('setMonth', () => expect(decompose(setMonth(ts, 12)).month).toBe(12))
  it('setDay', () => expect(decompose(setDay(ts, 1)).day).toBe(1))
})

describe('setHours / setMinutes / setSeconds', () => {
  it('setHours', () => {
    const result = decompose(setHours(ts, 8))
    expect(result.hour).toBe(8)
    expect(result.minute).toBe(30)
  })

  it('setHours data-last', () => {
    const result = pipe(ts, setHours(8))
    expect(decompose(result).hour).toBe(8)
  })

  it('setMinutes', () => {
    const result = decompose(setMinutes(ts, 0))
    expect(result.minute).toBe(0)
    expect(result.hour).toBe(14)
  })

  it('setMinutes data-last', () => {
    const result = pipe(ts, setMinutes(0))
    expect(decompose(result).minute).toBe(0)
  })

  it('setSeconds', () => {
    const result = decompose(setSeconds(ts, 0))
    expect(result.second).toBe(0)
    expect(result.hour).toBe(14)
  })

  it('setSeconds data-last', () => {
    const result = pipe(ts, setSeconds(0))
    expect(decompose(result).second).toBe(0)
  })
})
