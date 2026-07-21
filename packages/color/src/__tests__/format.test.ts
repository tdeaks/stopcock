import { describe, it, expect } from 'vite-plus/test'
import { rgb, oklch, fromHex } from '../create'
import { toHex, toCSS, toRGBString, toHSLString } from '../format'

describe('toHex', () => {
  it('round-trips a hex value', () => {
    expect(toHex(fromHex('#2563eb'))).toBe('#2563eb')
  })

  it('appends alpha when < 1', () => {
    expect(toHex(rgb(1, 0, 0, 0.5))).toBe('#ff000080')
  })

  it('clamps out-of-gamut by default (no toGamut yet)', () => {
    expect(toHex(rgb(1.5, 0, 0))).toBe('#ff0000')
  })

  it('works from oklch source', () => {
    expect(toHex(oklch(0.6279, 0.2577, 29.23))).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('toRGBString', () => {
  it('uses 0-255 ints', () => {
    expect(toRGBString(rgb(1, 0, 0))).toBe('rgb(255 0 0)')
  })

  it('includes alpha when < 1', () => {
    expect(toRGBString(rgb(1, 0, 0, 0.5))).toBe('rgb(255 0 0 / 0.5)')
  })
})

describe('toHSLString', () => {
  it('formats with percentages', () => {
    expect(toHSLString(rgb(1, 0, 0))).toMatch(/^hsl\(0 100% 50%\)$/)
  })
})

describe('toCSS', () => {
  it('uses oklch syntax', () => {
    expect(toCSS(rgb(1, 0, 0))).toMatch(/^oklch\(/)
  })
})
