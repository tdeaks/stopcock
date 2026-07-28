import { describe, it, expect } from 'vite-plus/test'
import { rgb, hsl, oklab, oklch, lab, p3, xyz, fromHex } from '../create'
import {
  convert,
  toOKLCh,
  toSRGB,
  toLab,
  toOKLab,
  toLinearRGB,
  toP3,
  toHSL,
  toXYZ,
} from '../convert'
import type { ColorSpace, Color } from '../types'

const close = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) < eps

const expectChannels = (c: Color, [a, b, ch]: [number, number, number], eps = 1e-4) => {
  expect(close(c.channels[0], a, eps), `ch0: ${c.channels[0]} vs ${a}`).toBe(true)
  expect(close(c.channels[1], b, eps), `ch1: ${c.channels[1]} vs ${b}`).toBe(true)
  expect(close(c.channels[2], ch, eps), `ch2: ${c.channels[2]} vs ${ch}`).toBe(true)
}

describe('convert', () => {
  it('is a no-op when target matches source space', () => {
    const c = rgb(0.5, 0.5, 0.5)
    expect(convert('srgb')(c)).toBe(c)
  })

  it('converts to the target space', () => {
    const c = rgb(1, 0, 0)
    const curried = convert('oklch')(c)
    expect(curried.space).toBe('oklch')
  })

  it('preserves alpha across any conversion', () => {
    const c = rgb(0.4, 0.6, 0.8, 0.42)
    const spaces: ColorSpace[] = [
      'oklch',
      'oklab',
      'lab',
      'lch',
      'hsl',
      'hwb',
      'p3',
      'xyz-d65',
      'xyz-d50',
      'linear-srgb',
    ]
    for (const s of spaces) expect(convert(s)(c).alpha).toBe(0.42)
  })
})

describe('known reference values (CSS Color 4)', () => {
  // sRGB red -> Lab D50 ≈ (54.29, 80.81, 69.89)
  it('srgb red -> lab D50', () => {
    expectChannels(toLab(rgb(1, 0, 0)), [54.29, 80.81, 69.89], 0.05)
  })

  // sRGB red -> OKLab ≈ (0.6279, 0.2249, 0.1258)
  it('srgb red -> oklab', () => {
    expectChannels(toOKLab(rgb(1, 0, 0)), [0.6279, 0.2249, 0.1258], 5e-4)
  })

  // sRGB red -> OKLCh ≈ (0.6279, 0.2577, 29.23 deg)
  it('srgb red -> oklch', () => {
    const c = toOKLCh(rgb(1, 0, 0))
    expect(close(c.channels[0], 0.6279, 5e-4)).toBe(true)
    expect(close(c.channels[1], 0.2577, 5e-4)).toBe(true)
    expect(close(c.channels[2], 29.23, 0.1)).toBe(true)
  })

  // sRGB white -> Y of XYZ-D65 should be ~1
  it('srgb white luminance', () => {
    expectChannels(toXYZ(rgb(1, 1, 1)), [0.9505, 1, 1.089], 1e-3)
  })
})

describe('round-trips within epsilon', () => {
  const start = rgb(0.3, 0.6, 0.2)
  const eps = 1e-6

  it.each([
    'linear-srgb',
    'hsl',
    'hwb',
    'lab',
    'lch',
    'oklab',
    'oklch',
    'p3',
    'xyz-d65',
    'xyz-d50',
  ] as const)('srgb -> %s -> srgb', (mid) => {
    const there = convert(mid)(start)
    const back = convert('srgb')(there)
    expectChannels(back, [start.channels[0], start.channels[1], start.channels[2]], eps)
  })

  it('multi-hop oklch -> lab -> oklch', () => {
    const start = oklch(0.7, 0.15, 250)
    const mid = toLab(start)
    const back = convert('oklch')(mid)
    expectChannels(back, [start.channels[0], start.channels[1], start.channels[2]], 1e-4)
  })
})

describe('grayscale hue stability', () => {
  it('pure gray sRGB has undefined hue (we use 0) and tiny chroma in OKLCh', () => {
    const c = toOKLCh(rgb(0.5, 0.5, 0.5))
    expect(c.channels[1]).toBeLessThan(1e-3)
  })
})

describe('hsl round-trip preserves the hex', () => {
  it('blue', () => {
    const c = fromHex('#2563eb')
    const back = convert('srgb')(convert('hsl')(c))
    expectChannels(back, [c.channels[0], c.channels[1], c.channels[2]], 1e-6)
  })
})
