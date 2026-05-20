import { describe, it, expect } from 'vitest'
import { rgb, oklch, fromHex } from '../create'
import { mix, mixIn, hueInterpolate } from '../mix'
import { toOKLab, toOKLCh } from '../convert'

describe('hueInterpolate (shorter arc)', () => {
  it('takes the short way from 350 to 10 (crosses 0)', () => {
    expect(hueInterpolate(350, 10, 0.5)).toBeCloseTo(0, 6)
  })

  it('takes the short way from 10 to 350 (crosses 0 backward)', () => {
    expect(hueInterpolate(10, 350, 0.5)).toBeCloseTo(0, 6)
  })

  it('takes the direct way for nearby hues', () => {
    expect(hueInterpolate(100, 140, 0.5)).toBeCloseTo(120, 6)
  })

  it('t=0 returns first hue, t=1 returns second', () => {
    expect(hueInterpolate(30, 200, 0)).toBeCloseTo(30, 6)
    expect(hueInterpolate(30, 200, 1)).toBeCloseTo(200, 6)
  })
})

describe('mix', () => {
  it('at t=0 returns first color (in OKLab)', () => {
    const a = rgb(1, 0, 0)
    const out = mix(a, rgb(0, 0, 1), 0)
    expect(out.space).toBe('oklab')
    const aOk = toOKLab(a)
    expect(out.channels[0]).toBeCloseTo(aOk.channels[0], 6)
  })

  it('at t=1 returns second color', () => {
    const b = rgb(0, 0, 1)
    const out = mix(rgb(1, 0, 0), b, 1)
    const bOk = toOKLab(b)
    expect(out.channels[0]).toBeCloseTo(bOk.channels[0], 6)
  })

  it('default t is 0.5', () => {
    const half = mix(rgb(0, 0, 0), rgb(1, 1, 1))
    expect(half.channels[0]).toBeGreaterThan(0)
    expect(half.channels[0]).toBeLessThan(1)
  })

  it('curried form works', () => {
    const target = rgb(0, 0, 1)
    const blendIntoBlue = mix(target, 0.5)
    expect(blendIntoBlue(rgb(1, 0, 0)).space).toBe('oklab')
  })

  it('mixes alpha linearly', () => {
    const out = mix(rgb(1, 0, 0, 1), rgb(0, 0, 1, 0), 0.25)
    expect(out.alpha).toBeCloseTo(0.75)
  })
})

describe('mixIn', () => {
  it('honors the requested interpolation space', () => {
    const out = mixIn(fromHex('#ff0000'), fromHex('#0000ff'), 'oklch', 0.5)
    expect(out.space).toBe('oklch')
  })

  it('interpolates hue along shorter arc in polar spaces', () => {
    const out = mixIn(oklch(0.7, 0.15, 350), oklch(0.7, 0.15, 10), 'oklch', 0.5)
    expect(out.channels[2]).toBeCloseTo(0, 1)
  })
})
