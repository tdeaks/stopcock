import { describe, it, expect } from 'vitest'
import { compose } from '../core'
import { format, formatter } from '../format'

const ts = compose(2024, 3, 15, 14, 30, 45, 123)

describe('format', () => {
  it('YYYY-MM-DD', () => expect(format(ts, 'YYYY-MM-DD')).toBe('2024-03-15'))
  it('DD/MM/YYYY', () => expect(format(ts, 'DD/MM/YYYY')).toBe('15/03/2024'))
  it('HH:mm:ss', () => expect(format(ts, 'HH:mm:ss')).toBe('14:30:45'))
  it('HH:mm:ss.SSS', () => expect(format(ts, 'HH:mm:ss.SSS')).toBe('14:30:45.123'))
  it('h:mm A', () => expect(format(ts, 'h:mm A')).toBe('2:30 PM'))
  it('MMMM Do, YYYY', () => expect(format(ts, 'MMMM Do, YYYY')).toBe('March 15th, 2024'))
  it('ddd MMM D', () => expect(format(ts, 'ddd MMM D')).toBe('Fri Mar 15'))
  it('YY', () => expect(format(ts, 'YY')).toBe('24'))
})

describe('formatter (cached)', () => {
  it('returns same function for same template', () => {
    const f1 = formatter('YYYY-MM-DD')
    const f2 = formatter('YYYY-MM-DD')
    expect(f1).toBe(f2)
  })

  it('produces correct output', () => {
    const f = formatter('YYYY-MM-DD HH:mm')
    expect(f(ts)).toBe('2024-03-15 14:30')
  })
})

describe('format edge cases', () => {
  it('midnight', () => {
    const midnight = compose(2024, 1, 1, 0, 0, 0, 0)
    expect(format(midnight, 'h:mm a')).toBe('12:00 am')
  })

  it('noon', () => {
    const noon = compose(2024, 1, 1, 12, 0, 0, 0)
    expect(format(noon, 'h:mm a')).toBe('12:00 pm')
  })
})
