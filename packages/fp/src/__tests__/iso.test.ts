import { describe, it, expect } from 'vitest'
import { iso, reverse, compose } from '../iso'

describe('Iso', () => {
  const strToNum = iso<string, number>(s => parseInt(s, 10), n => String(n))

  it('get', () => expect(strToNum.get('42')).toBe(42))
  it('reverseGet', () => expect(strToNum.reverseGet(42)).toBe('42'))
  it('_tag', () => expect(strToNum._tag).toBe('Iso'))

  it('reverse swaps get and reverseGet', () => {
    const reversed = reverse(strToNum)
    expect(reversed.get(42)).toBe('42')
    expect(reversed.reverseGet('42')).toBe(42)
  })

  it('compose chains two isos', () => {
    const double = iso<number, number>(n => n * 2, n => n / 2)
    const composed = compose(strToNum, double)
    expect(composed.get('5')).toBe(10)
    expect(composed.reverseGet(10)).toBe('5')
  })

  it('compose roundtrip', () => {
    const celsius = iso<number, number>(c => c * 9 / 5 + 32, f => (f - 32) * 5 / 9)
    const offset = iso<number, number>(n => n + 10, n => n - 10)
    const composed = compose(celsius, offset)
    expect(composed.reverseGet(composed.get(100))).toBeCloseTo(100)
  })
})
