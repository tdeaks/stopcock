import { describe, it, expect } from 'vitest'
import { rgb, rgb255, hsl, oklab, oklch, lab, lch, p3, xyz, hwb, linearRgb, fromHex } from '../create'

describe('rgb', () => {
  it('builds an sRGB color with alpha 1 by default', () => {
    const c = rgb(0.5, 0.25, 0.75)
    expect(c.space).toBe('srgb')
    expect(c.alpha).toBe(1)
    expect(Array.from(c.channels)).toEqual([0.5, 0.25, 0.75])
  })

  it('respects explicit alpha', () => {
    expect(rgb(0, 0, 0, 0.3).alpha).toBe(0.3)
  })

  it('uses Float64Array for channels', () => {
    expect(rgb(0, 0, 0).channels).toBeInstanceOf(Float64Array)
    expect(rgb(0, 0, 0).channels.length).toBe(3)
  })
})

describe('rgb255', () => {
  it('scales 0-255 inputs to 0-1', () => {
    const c = rgb255(255, 128, 0)
    expect(c.channels[0]).toBe(1)
    expect(c.channels[1]).toBeCloseTo(128 / 255)
    expect(c.channels[2]).toBe(0)
  })
})

describe('constructors set the correct space tag', () => {
  it.each([
    ['hsl', hsl, 'hsl'],
    ['oklab', oklab, 'oklab'],
    ['oklch', oklch, 'oklch'],
    ['lab', lab, 'lab'],
    ['lch', lch, 'lch'],
    ['p3', p3, 'p3'],
    ['xyz', xyz, 'xyz-d65'],
    ['hwb', hwb, 'hwb'],
    ['linearRgb', linearRgb, 'linear-srgb'],
  ] as const)('%s -> %s', (_name, ctor, space) => {
    expect(ctor(0.1, 0.2, 0.3).space).toBe(space)
  })
})

describe('fromHex', () => {
  it('parses #rrggbb', () => {
    const c = fromHex('#ff8000')
    expect(c.space).toBe('srgb')
    expect(c.channels[0]).toBe(1)
    expect(c.channels[1]).toBeCloseTo(128 / 255)
    expect(c.channels[2]).toBe(0)
    expect(c.alpha).toBe(1)
  })

  it('parses #rrggbbaa with alpha', () => {
    const c = fromHex('#ff000080')
    expect(c.channels[0]).toBe(1)
    expect(c.alpha).toBeCloseTo(128 / 255)
  })

  it('expands shorthand #rgb', () => {
    const c = fromHex('#f80')
    expect(c.channels[0]).toBe(1)
    expect(c.channels[1]).toBeCloseTo(0x88 / 255)
    expect(c.channels[2]).toBe(0)
  })

  it('accepts strings without leading #', () => {
    expect(fromHex('ff0000').channels[0]).toBe(1)
  })

  it('throws on invalid length', () => {
    expect(() => fromHex('#abcde')).toThrow()
  })
})
