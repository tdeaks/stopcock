import { describe, expect, it } from 'vite-plus/test'
import {
  adjustAlpha,
  adjustHue,
  analogous,
  convertBuffer,
  contrastRatio,
  convert,
  darken,
  deltaE,
  deltaEOK,
  desaturate,
  fromHex,
  hueInterpolate,
  inGamut,
  lighten,
  meetsAA,
  meetsAAA,
  meetsAALarge,
  minDistinguishableDistance,
  mix,
  mixIn,
  saturate,
  simulate,
  simulateBuffer,
  toGamut,
  toGamutBuffer,
} from '../index'

describe('dual call parity', () => {
  const a = fromHex('#2563eb')
  const b = fromHex('#f97316')

  it('keeps conversion and adjustment results identical', () => {
    expect(convert(a, 'oklch')).toEqual(convert('oklch')(a))
    expect(lighten(a, 0.1)).toEqual(lighten(0.1)(a))
    expect(darken(a, 0.1)).toEqual(darken(0.1)(a))
    expect(saturate(a, 0.2)).toEqual(saturate(0.2)(a))
    expect(desaturate(a, 0.2)).toEqual(desaturate(0.2)(a))
    expect(adjustHue(a, 30)).toEqual(adjustHue(30)(a))
    expect(adjustAlpha(a, 0.5)).toEqual(adjustAlpha(0.5)(a))
  })

  it('keeps optional mixing arguments identical', () => {
    expect(mix(a, b)).toEqual(mix(b)(a))
    expect(mix(a, b, 0.25)).toEqual(mix(b, 0.25)(a))
    expect(mixIn(a, b, 'oklch')).toEqual(mixIn(b, 'oklch')(a))
    expect(mixIn(a, b, 'oklch', 0.25)).toEqual(mixIn(b, 'oklch', 0.25)(a))
  })

  it('keeps hue and batch operations identical', () => {
    expect(hueInterpolate(350, 10, 0.5)).toBe(hueInterpolate(10, 0.5)(350))

    const src = new Float64Array([0.1, 0.2, 0.3, 0.8, 0.6, 0.4])
    expect(convertBuffer(src, 'srgb', 'oklab')).toEqual(convertBuffer('srgb', 'oklab')(src))
    expect(simulateBuffer(src, 'srgb', 'deuteranopia', 0.75)).toEqual(
      simulateBuffer('srgb', 'deuteranopia', 0.75)(src),
    )

    const wide = new Float64Array([1.1, 0.2, 0.3, -0.1, 0.6, 1.2])
    expect(toGamutBuffer(wide, 'p3', 'srgb')).toEqual(toGamutBuffer('p3', 'srgb')(wide))
  })

  it('preserves caller-provided batch output buffers in both lanes', () => {
    const src = new Float64Array([0.1, 0.2, 0.3])

    const convertedDirect = new Float64Array(src.length)
    const convertedDataLast = new Float64Array(src.length)
    expect(convertBuffer(src, 'srgb', 'oklab', convertedDirect)).toBe(convertedDirect)
    expect(convertBuffer('srgb', 'oklab', convertedDataLast)(src)).toBe(convertedDataLast)
    expect(convertedDirect).toEqual(convertedDataLast)

    const simulatedDirect = new Float64Array(src.length)
    const simulatedDataLast = new Float64Array(src.length)
    expect(simulateBuffer(src, 'srgb', 'deuteranopia', undefined, simulatedDirect)).toBe(
      simulatedDirect,
    )
    expect(simulateBuffer('srgb', 'deuteranopia', undefined, simulatedDataLast)(src)).toBe(
      simulatedDataLast,
    )
    expect(simulatedDirect).toEqual(simulatedDataLast)

    const gamutDirect = new Float64Array(src.length)
    const gamutDataLast = new Float64Array(src.length)
    expect(toGamutBuffer(src, 'p3', 'srgb', gamutDirect)).toBe(gamutDirect)
    expect(toGamutBuffer('p3', 'srgb', gamutDataLast)(src)).toBe(gamutDataLast)
    expect(gamutDirect).toEqual(gamutDataLast)
  })

  it('keeps comparison and gamut results identical', () => {
    expect(contrastRatio(a, b)).toBe(contrastRatio(b)(a))
    expect(meetsAA(a, b)).toBe(meetsAA(b)(a))
    expect(meetsAAA(a, b)).toBe(meetsAAA(b)(a))
    expect(meetsAALarge(a, b)).toBe(meetsAALarge(b)(a))
    expect(deltaE(a, b)).toBe(deltaE(b)(a))
    expect(deltaEOK(a, b)).toBe(deltaEOK(b)(a))
    expect(inGamut(a, 'srgb')).toBe(inGamut('srgb')(a))
    expect(toGamut(a, 'srgb')).toEqual(toGamut('srgb')(a))
  })

  it('keeps palette, CVD, and accessibility results identical', () => {
    expect(analogous(a, 5, 30)).toEqual(analogous(5, 30)(a))
    expect(simulate(a, 'deuteranopia', 0.75)).toEqual(simulate('deuteranopia', 0.75)(a))
    const palette = [a, b]
    expect(minDistinguishableDistance(palette, 'deuteranopia', 0.75)).toBe(
      minDistinguishableDistance('deuteranopia', 0.75)(palette),
    )
  })
})
