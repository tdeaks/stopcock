import { describe, it, expect } from 'vitest'
import { compose, decompose } from '../core'
import { parse, parser, parseISO, tryParse, tryParser } from '../parse'

describe('parse', () => {
  it('YYYY-MM-DD', () => {
    const ts = parse('2024-03-15', 'YYYY-MM-DD')
    const parts = decompose(ts)
    expect(parts.year).toBe(2024)
    expect(parts.month).toBe(3)
    expect(parts.day).toBe(15)
  })

  it('DD/MM/YYYY', () => {
    const ts = parse('15/03/2024', 'DD/MM/YYYY')
    const parts = decompose(ts)
    expect(parts.year).toBe(2024)
    expect(parts.month).toBe(3)
    expect(parts.day).toBe(15)
  })

  it('YYYY-MM-DD HH:mm:ss', () => {
    const ts = parse('2024-03-15 14:30:45', 'YYYY-MM-DD HH:mm:ss')
    const parts = decompose(ts)
    expect(parts).toMatchObject({ year: 2024, month: 3, day: 15, hour: 14, minute: 30, second: 45 })
  })

  it('HH:mm:ss.SSS', () => {
    const ts = parse('2024-03-15 14:30:45.123', 'YYYY-MM-DD HH:mm:ss.SSS')
    const parts = decompose(ts)
    expect(parts.millisecond).toBe(123)
  })
})

describe('parseISO', () => {
  it('date only', () => {
    const ts = parseISO('2024-03-15')
    const parts = decompose(ts)
    expect(parts).toMatchObject({ year: 2024, month: 3, day: 15, hour: 0, minute: 0 })
  })

  it('full ISO', () => {
    const ts = parseISO('2024-03-15T14:30:45.123Z')
    const parts = decompose(ts)
    expect(parts).toMatchObject({ year: 2024, month: 3, day: 15, hour: 14, minute: 30, second: 45, millisecond: 123 })
  })

  it('roundtrips with compose', () => {
    const original = compose(2024, 6, 15, 10, 0, 0, 0)
    const iso = new Date(original as number).toISOString()
    const parsed = parseISO(iso)
    expect(parsed).toBe(original)
  })
})

describe('parser (cached)', () => {
  it('returns same function for same template', () => {
    const p1 = parser('YYYY-MM-DD')
    const p2 = parser('YYYY-MM-DD')
    expect(p1).toBe(p2)
  })
})

describe('tryParse', () => {
  it('returns timestamp on valid input', () => {
    const ts = tryParse('2024-03-15', 'YYYY-MM-DD')
    expect(ts).not.toBeNull()
  })

  it('data-last', () => {
    const fn = tryParse('YYYY-MM-DD')
    const ts = fn('2024-03-15')
    expect(ts).not.toBeNull()
    expect(decompose(ts!).year).toBe(2024)
  })
})

describe('tryParser', () => {
  it('returns a function', () => {
    const fn = tryParser('YYYY-MM-DD')
    const ts = fn('2024-03-15')
    expect(ts).not.toBeNull()
    expect(decompose(ts!).day).toBe(15)
  })
})

describe('parse data-last', () => {
  it('returns a function when given only template', () => {
    const fn = parse('YYYY-MM-DD')
    const ts = fn('2024-06-15')
    expect(decompose(ts).month).toBe(6)
  })

  it('12-hour AM/PM format', () => {
    const ts = parse('2024-03-15 02:30 PM', 'YYYY-MM-DD hh:mm A')
    expect(decompose(ts).hour).toBe(14)
  })

  it('12 AM = midnight', () => {
    const ts = parse('2024-03-15 12:00 AM', 'YYYY-MM-DD hh:mm A')
    expect(decompose(ts).hour).toBe(0)
  })

  it('lowercase am/pm', () => {
    const ts = parse('2024-03-15 02:30 pm', 'YYYY-MM-DD hh:mm a')
    expect(decompose(ts).hour).toBe(14)
  })
})
