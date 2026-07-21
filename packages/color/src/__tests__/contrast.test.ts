import { describe, it, expect } from 'vite-plus/test'
import { rgb, lab, fromHex } from '../create'
import { contrastRatio, luminance, deltaE, meetsAA, meetsAAA, meetsAALarge } from '../contrast'

describe('luminance', () => {
  it('black is 0', () => expect(luminance(rgb(0, 0, 0))).toBeCloseTo(0, 6))
  it('white is 1', () => expect(luminance(rgb(1, 1, 1))).toBeCloseTo(1, 6))
  it('mid-gray ≈ 0.215', () => expect(luminance(rgb(0.5, 0.5, 0.5))).toBeCloseTo(0.214, 3))
})

describe('contrastRatio', () => {
  it('black on white is 21', () => {
    expect(contrastRatio(rgb(0, 0, 0), rgb(1, 1, 1))).toBeCloseTo(21, 3)
  })

  it('symmetric (order does not matter)', () => {
    expect(contrastRatio(rgb(0.2, 0.4, 0.6), rgb(1, 1, 1))).toBeCloseTo(
      contrastRatio(rgb(1, 1, 1), rgb(0.2, 0.4, 0.6)),
      6,
    )
  })

  it('curried', () => {
    expect(contrastRatio(rgb(1, 1, 1))(rgb(0, 0, 0))).toBeCloseTo(21, 3)
  })
})

describe('WCAG thresholds', () => {
  it('black/white passes AAA', () => expect(meetsAAA(rgb(0, 0, 0), rgb(1, 1, 1))).toBe(true))
  it('white/white fails AA', () => expect(meetsAA(rgb(1, 1, 1), rgb(1, 1, 1))).toBe(false))
  it('low contrast passes AA Large but not AA', () => {
    // ~3.4:1 contrast
    const fg = rgb(0.55, 0.55, 0.55)
    const bg = rgb(1, 1, 1)
    const r = contrastRatio(fg, bg)
    expect(r).toBeGreaterThan(3)
    expect(r).toBeLessThan(4.5)
    expect(meetsAALarge(fg, bg)).toBe(true)
    expect(meetsAA(fg, bg)).toBe(false)
  })
})

describe('deltaE (CIEDE2000)', () => {
  // Sharma et al. 2005 reference pairs (Table 1)
  // Use a generous epsilon — published values rounded to 4 decimals.
  it.each([
    // [L1, a1, b1, L2, a2, b2, expected]
    [50.0, 2.6772, -79.7751, 50.0, 0.0, -82.7485, 2.0425],
    [50.0, 3.1571, -77.2803, 50.0, 0.0, -82.7485, 2.8615],
    [50.0, 2.8361, -74.02, 50.0, 0.0, -82.7485, 3.4412],
    [50.0, -1.3802, -84.2814, 50.0, 0.0, -82.7485, 1.0],
    [50.0, -1.1848, -84.8006, 50.0, 0.0, -82.7485, 1.0],
  ])('Sharma pair L1=%s ... expected %s', (L1, a1, b1, L2, a2, b2, exp) => {
    const c1 = lab(L1, a1, b1)
    const c2 = lab(L2, a2, b2)
    expect(deltaE(c1, c2)).toBeCloseTo(exp, 2)
  })

  it('returns 0 for identical colors', () => {
    expect(deltaE(rgb(0.3, 0.5, 0.7), rgb(0.3, 0.5, 0.7))).toBeCloseTo(0, 6)
  })
})
