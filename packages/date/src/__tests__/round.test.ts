import { describe, it, expect } from 'vitest'
import { pipe } from '@stopcock/fp'
import { compose, decompose } from '../core'
import { roundTo, ceilTo, floorTo, snapTo } from '../round'

const ts = compose(2024, 3, 15, 14, 37, 22, 500)

describe('floorTo', () => {
  it('floor to hour', () => {
    const result = decompose(floorTo(ts, 'hour'))
    expect(result).toMatchObject({ hour: 14, minute: 0, second: 0, millisecond: 0 })
  })

  it('floor to day', () => {
    const result = decompose(floorTo(ts, 'day'))
    expect(result).toMatchObject({ day: 15, hour: 0, minute: 0, second: 0 })
  })

  it('floor to minute', () => {
    const result = decompose(floorTo(ts, 'minute'))
    expect(result).toMatchObject({ minute: 37, second: 0, millisecond: 0 })
  })

  it('data-last', () => {
    const result = pipe(ts, floorTo('hour'))
    expect(decompose(result).minute).toBe(0)
  })
})

describe('ceilTo', () => {
  it('ceil to hour', () => {
    const result = decompose(ceilTo(ts, 'hour'))
    expect(result).toMatchObject({ hour: 15, minute: 0, second: 0, millisecond: 0 })
  })

  it('ceil to day', () => {
    const result = decompose(ceilTo(ts, 'day'))
    expect(result.day).toBe(16)
  })

  it('already on boundary returns same', () => {
    const exact = compose(2024, 3, 15, 14, 0, 0, 0)
    expect(ceilTo(exact, 'hour')).toBe(exact)
  })

  it('data-last', () => {
    const result = pipe(ts, ceilTo('hour'))
    expect(decompose(result).hour).toBe(15)
  })
})

describe('roundTo', () => {
  it('round to hour (closer to :37 -> round up)', () => {
    const result = decompose(roundTo(ts, 'hour'))
    expect(result.hour).toBe(15)
  })

  it('round to hour (closer to start -> round down)', () => {
    const early = compose(2024, 3, 15, 14, 10, 0, 0)
    const result = decompose(roundTo(early, 'hour'))
    expect(result.hour).toBe(14)
  })

  it('data-last', () => {
    const result = pipe(ts, roundTo('hour'))
    expect(decompose(result).hour).toBe(15)
  })
})

describe('snapTo', () => {
  it('snap to 15-minute intervals', () => {
    const result = decompose(snapTo(ts, 15, 'minute'))
    expect(result.minute).toBe(30) // 37 rounds to 30 (37*60000 rounds to 30*60000 slot)
  })

  it('data-last', () => {
    const result = pipe(ts, snapTo(15, 'minute'))
    expect(decompose(result).minute % 15).toBe(0)
  })
})
