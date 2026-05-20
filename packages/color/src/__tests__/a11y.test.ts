import { describe, it, expect } from 'vitest'
import { rgb, fromHex } from '../create'
import { paletteContrastMatrix, minDistinguishableDistance } from '../a11y'

describe('paletteContrastMatrix', () => {
  it('is square with the right size', () => {
    const m = paletteContrastMatrix([rgb(0, 0, 0), rgb(0.5, 0.5, 0.5), rgb(1, 1, 1)])
    expect(m.length).toBe(3)
    expect(m[0].length).toBe(3)
  })

  it('diagonal is always 1', () => {
    const m = paletteContrastMatrix([fromHex('#2563eb'), fromHex('#facc15')])
    expect(m[0][0].ratio).toBe(1)
    expect(m[1][1].ratio).toBe(1)
  })

  it('is symmetric', () => {
    const m = paletteContrastMatrix([rgb(0, 0, 0), rgb(0.4, 0.6, 0.8)])
    expect(m[0][1].ratio).toBeCloseTo(m[1][0].ratio, 6)
  })

  it('flags AA/AAA correctly', () => {
    const m = paletteContrastMatrix([rgb(0, 0, 0), rgb(1, 1, 1)])
    expect(m[0][1].ratio).toBeCloseTo(21, 3)
    expect(m[0][1].aa).toBe(true)
    expect(m[0][1].aaa).toBe(true)
    expect(m[0][1].aaLarge).toBe(true)
  })

  it('fails when contrast too low', () => {
    const m = paletteContrastMatrix([rgb(0.9, 0.9, 0.9), rgb(0.85, 0.85, 0.85)])
    expect(m[0][1].aa).toBe(false)
  })
})

describe('minDistinguishableDistance', () => {
  it('returns Infinity for palettes < 2', () => {
    expect(minDistinguishableDistance([], 'protanopia')).toBe(Infinity)
    expect(minDistinguishableDistance([rgb(1, 0, 0)], 'protanopia')).toBe(Infinity)
  })

  it('red/green pair has reduced distinguishability under deuteranopia', () => {
    const normalDist = Math.hypot(1, -1, 0) // raw RGB distance between red and green
    const simulatedDist = minDistinguishableDistance([rgb(1, 0, 0), rgb(0, 1, 0)], 'deuteranopia')
    // After simulation, they should be measurably closer than they were
    expect(simulatedDist).toBeLessThan(normalDist * 0.7)
  })

  it('black/white pair stays distinguishable under any CVD', () => {
    for (const type of ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'] as const) {
      const d = minDistinguishableDistance([rgb(0, 0, 0), rgb(1, 1, 1)], type)
      expect(d).toBeGreaterThan(0.5)
    }
  })
})
