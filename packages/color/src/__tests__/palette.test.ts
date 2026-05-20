import { describe, it, expect } from 'vitest'
import { fromHex, oklch } from '../create'
import { complementary, triadic, tetradic, splitComplementary, analogous } from '../palette'
import { hue } from '../channel'

const around = (h: number, target: number, eps = 0.5) => {
  const diff = ((h - target) % 360 + 540) % 360 - 180
  return Math.abs(diff) < eps
}

describe('palettes', () => {
  it('complementary is 180° opposite', () => {
    const base = oklch(0.6, 0.15, 100)
    const c = complementary(base)
    expect(around(hue(c), 280)).toBe(true)
  })

  it('triadic returns 3 colors at 0/120/240', () => {
    const base = oklch(0.6, 0.15, 0)
    const [a, b, c] = triadic(base)
    expect(around(hue(a), 0)).toBe(true)
    expect(around(hue(b), 120)).toBe(true)
    expect(around(hue(c), 240)).toBe(true)
  })

  it('tetradic returns 4 colors at 0/90/180/270', () => {
    const t = tetradic(oklch(0.6, 0.15, 0))
    expect(t.length).toBe(4)
    expect(around(hue(t[1]), 90)).toBe(true)
    expect(around(hue(t[3]), 270)).toBe(true)
  })

  it('splitComplementary returns 3 colors at 0/150/210', () => {
    const s = splitComplementary(oklch(0.6, 0.15, 0))
    expect(around(hue(s[1]), 150)).toBe(true)
    expect(around(hue(s[2]), 210)).toBe(true)
  })

  it('analogous default returns 5 colors centered on the source', () => {
    const a = analogous(oklch(0.6, 0.15, 100))
    expect(a.length).toBe(5)
    expect(around(hue(a[2]), 100)).toBe(true)
  })

  it('analogous count param respected', () => {
    expect(analogous(oklch(0.6, 0.15, 100), 7).length).toBe(7)
  })
})
