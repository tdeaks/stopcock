import { describe, it, expect } from 'vite-plus/test'
import { rgb, oklch, fromHex } from '../create'
import { lighten, darken, saturate, desaturate, adjustHue, adjustAlpha } from '../adjust'
import { toOKLCh } from '../convert'
import { lightness, chroma, hue } from '../channel'

describe('lighten', () => {
  it('increases OKLCh lightness', () => {
    const base = fromHex('#2563eb')
    const lighter = lighten(0.1)(base)
    expect(lightness(lighter)).toBeCloseTo(lightness(base) + 0.1, 3)
  })

  it('clamps at 1', () => {
    expect(lightness(lighten(0.5)(oklch(0.95, 0.1, 100)))).toBeCloseTo(1, 3)
  })

  it('returns to the source space', () => {
    expect(lighten(0.1)(rgb(0.5, 0.5, 0.5)).space).toBe('srgb')
  })

  it('curried form works in pipe', () => {
    const f = lighten(0.2)
    const out = f(rgb(0.3, 0.3, 0.3))
    expect(lightness(out)).toBeGreaterThan(lightness(rgb(0.3, 0.3, 0.3)))
  })
})

describe('darken', () => {
  it('decreases lightness', () => {
    const base = oklch(0.7, 0.1, 100)
    expect(lightness(darken(0.1)(base))).toBeCloseTo(0.6, 3)
  })
})

describe('saturate / desaturate', () => {
  it('saturate increases chroma', () => {
    const base = oklch(0.7, 0.1, 100)
    expect(chroma(saturate(0.5)(base))).toBeGreaterThan(0.1)
  })

  it('desaturate decreases chroma, clamped at 0', () => {
    const base = oklch(0.7, 0.05, 100)
    expect(chroma(desaturate(1)(base))).toBe(0)
  })
})

describe('adjustHue', () => {
  it('rotates hue by degrees, wrapping modulo 360', () => {
    const base = oklch(0.7, 0.15, 350)
    expect(hue(adjustHue(20)(base))).toBeCloseTo(10, 1)
  })
})

describe('adjustAlpha', () => {
  it('sets alpha, keeping channels intact', () => {
    const c = adjustAlpha(0.3)(rgb(1, 0, 0, 1))
    expect(c.alpha).toBe(0.3)
    expect(c.channels[0]).toBe(1)
  })

  it('clamps alpha to [0, 1]', () => {
    expect(adjustAlpha(1.5)(rgb(0, 0, 0)).alpha).toBe(1)
    expect(adjustAlpha(-1)(rgb(0, 0, 0)).alpha).toBe(0)
  })
})
