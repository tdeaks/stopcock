import { describe, it, expect } from 'vite-plus/test'
import { rgb, oklch, fromHex } from '../create'
import { inGamut, toGamut } from '../gamut'
import { toSRGB } from '../convert'

describe('inGamut', () => {
  it('a normal sRGB color is in sRGB gamut', () => {
    expect(inGamut('srgb')(rgb(0.5, 0.3, 0.8))).toBe(true)
  })

  it('a saturated wide-gamut color is NOT in sRGB gamut', () => {
    // Hyper-saturated red in OKLCh
    const wide = oklch(0.7, 0.4, 30)
    expect(inGamut('srgb')(wide)).toBe(false)
  })

  it('lab is unbounded — always reports in-gamut', () => {
    expect(inGamut('lab')(oklch(0.7, 0.4, 30))).toBe(true)
  })
})

describe('toGamut', () => {
  it('passes through in-gamut colors unchanged (after conversion)', () => {
    const c = rgb(0.5, 0.3, 0.8)
    const out = toGamut('srgb')(c)
    expect(out.channels[0]).toBeCloseTo(c.channels[0], 6)
  })

  it('produces an in-gamut color from a wide-gamut one', () => {
    const wide = oklch(0.7, 0.4, 30)
    const mapped = toGamut('srgb')(wide)
    expect(inGamut('srgb')(mapped)).toBe(true)
    expect(mapped.space).toBe('srgb')
  })

  it('preserves lightness approximately', () => {
    const wide = oklch(0.7, 0.4, 30)
    const mapped = toGamut('srgb')(wide)
    const mappedOk = toSRGB(mapped)
    // Should be a reddish color — channel 0 highest
    expect(mappedOk.channels[0]).toBeGreaterThan(mappedOk.channels[1])
    expect(mappedOk.channels[0]).toBeGreaterThan(mappedOk.channels[2])
  })
})
