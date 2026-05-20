import { describe, it, expect } from 'vitest'
import { rgb, fromHex } from '../create'
import { simulate } from '../cvd'
import { toHex } from '../format'
import { luminance, deltaE } from '../contrast'
import { toSRGB } from '../convert'

const close = (a: number, b: number, eps = 0.02) => Math.abs(a - b) < eps

describe('simulate', () => {
  it('severity 0 is approximately identity', () => {
    const c = rgb(0.6, 0.2, 0.4)
    for (const type of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      const out = simulate(c, type, 0)
      expect(out.channels[0]).toBeCloseTo(c.channels[0], 4)
      expect(out.channels[1]).toBeCloseTo(c.channels[1], 4)
      expect(out.channels[2]).toBeCloseTo(c.channels[2], 4)
    }
  })

  it('deuteranopia substantially collapses the red/green axis', () => {
    const simRed = simulate(rgb(1, 0, 0), 'deuteranopia', 1)
    const simGreen = simulate(rgb(0, 1, 0), 'deuteranopia', 1)
    const simRedVsGreenAfter = deltaE(simRed, simGreen)
    const realRedVsGreen = deltaE(rgb(1, 0, 0), rgb(0, 1, 0))
    // After full deuteranopia, the red-green distance should drop by at least half.
    expect(simRedVsGreenAfter).toBeLessThan(realRedVsGreen * 0.5)
  })

  it('protanopia reduces the red/green distance (but less aggressively than deuteranopia)', () => {
    const simRed = simulate(rgb(1, 0, 0), 'protanopia', 1)
    const simGreen = simulate(rgb(0, 1, 0), 'protanopia', 1)
    const simRedVsGreenAfter = deltaE(simRed, simGreen)
    const realRedVsGreen = deltaE(rgb(1, 0, 0), rgb(0, 1, 0))
    expect(simRedVsGreenAfter).toBeLessThan(realRedVsGreen * 0.7)
  })

  it('tritanopia collapses the blue/yellow axis (not blue/green)', () => {
    const simBlue = simulate(rgb(0, 0, 1), 'tritanopia', 1)
    const simYellow = simulate(rgb(1, 1, 0), 'tritanopia', 1)
    const simBlueVsYellow = deltaE(simBlue, simYellow)
    const realBlueVsYellow = deltaE(rgb(0, 0, 1), rgb(1, 1, 0))
    expect(simBlueVsYellow).toBeLessThan(realBlueVsYellow * 0.8)
  })

  it('achromatopsia removes all color (grayscale)', () => {
    const c = rgb(0.7, 0.3, 0.5)
    const gray = simulate(c, 'achromatopsia')
    const s = toSRGB(gray)
    // R, G, B should all be approximately equal
    expect(close(s.channels[0], s.channels[1])).toBe(true)
    expect(close(s.channels[1], s.channels[2])).toBe(true)
  })

  it('achromatopsia preserves luminance', () => {
    const c = rgb(0.7, 0.3, 0.5)
    expect(luminance(simulate(c, 'achromatopsia'))).toBeCloseTo(luminance(c), 4)
  })

  it('grayscale is unchanged under proto/deutero/tritan simulation', () => {
    // Gray has equal RGB components, so any rotation in RGB space leaves it close to gray
    const gray = rgb(0.5, 0.5, 0.5)
    for (const type of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      const out = toSRGB(simulate(gray, type, 1))
      expect(close(out.channels[0], 0.5, 0.05)).toBe(true)
      expect(close(out.channels[1], 0.5, 0.05)).toBe(true)
      expect(close(out.channels[2], 0.5, 0.05)).toBe(true)
    }
  })

  it('preserves the source space', () => {
    const c = fromHex('#2563eb')
    expect(simulate(c, 'deuteranopia').space).toBe('srgb')
  })

  it('returns a black for pure black under any CVD', () => {
    for (const type of ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'] as const) {
      const out = toSRGB(simulate(rgb(0, 0, 0), type))
      expect(out.channels[0]).toBeCloseTo(0, 4)
      expect(out.channels[1]).toBeCloseTo(0, 4)
      expect(out.channels[2]).toBeCloseTo(0, 4)
    }
  })
})
