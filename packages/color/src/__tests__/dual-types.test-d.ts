import { expectTypeOf, test } from 'vite-plus/test'
import {
  adjustAlpha,
  analogous,
  convertBuffer,
  contrastRatio,
  convert,
  deltaEOK,
  fromHex,
  hueInterpolate,
  inGamut,
  lighten,
  minDistinguishableDistance,
  mix,
  mixIn,
  simulate,
  simulateBuffer,
  toGamut,
  toGamutBuffer,
  type ChannelBuffer,
  type Color,
} from '../index'

const color = fromHex('#2563eb')
const other = fromHex('#f97316')

test('color transforms expose data-first and data-last overloads', () => {
  expectTypeOf(convert(color, 'oklch')).toEqualTypeOf<Color>()
  expectTypeOf(convert('oklch')).toEqualTypeOf<(color: Color) => Color>()
  expectTypeOf(lighten(color, 0.1)).toEqualTypeOf<Color>()
  expectTypeOf(lighten(0.1)).toEqualTypeOf<(c: Color) => Color>()
  expectTypeOf(adjustAlpha(color, 0.5)).toEqualTypeOf<Color>()
  expectTypeOf(adjustAlpha(0.5)).toEqualTypeOf<(c: Color) => Color>()
  expectTypeOf(mix(color, other, 0.25)).toEqualTypeOf<Color>()
  expectTypeOf(mix(other, 0.25)).toEqualTypeOf<(a: Color) => Color>()
  expectTypeOf(mixIn(color, other, 'oklch', 0.25)).toEqualTypeOf<Color>()
  expectTypeOf(mixIn(other, 'oklch', 0.25)).toEqualTypeOf<(a: Color) => Color>()
  expectTypeOf(hueInterpolate(350, 10, 0.5)).toEqualTypeOf<number>()
  expectTypeOf(hueInterpolate(10, 0.5)).toEqualTypeOf<(h1: number) => number>()
})

test('batch operations expose both lanes and preserve optional output buffers', () => {
  const src = new Float64Array(6)
  const out = new Float64Array(6)

  expectTypeOf(convertBuffer(src, 'srgb', 'oklab')).toEqualTypeOf<ChannelBuffer>()
  expectTypeOf(convertBuffer(src, 'srgb', 'oklab', out)).toEqualTypeOf<ChannelBuffer>()
  expectTypeOf(convertBuffer('srgb', 'oklab')).toEqualTypeOf<
    (src: ChannelBuffer) => ChannelBuffer
  >()
  expectTypeOf(convertBuffer('srgb', 'oklab', out)).toEqualTypeOf<
    (src: ChannelBuffer) => ChannelBuffer
  >()

  expectTypeOf(simulateBuffer(src, 'srgb', 'deuteranopia')).toEqualTypeOf<ChannelBuffer>()
  expectTypeOf(
    simulateBuffer(src, 'srgb', 'deuteranopia', undefined, out),
  ).toEqualTypeOf<ChannelBuffer>()
  expectTypeOf(simulateBuffer('srgb', 'deuteranopia', 0.5)).toEqualTypeOf<
    (src: ChannelBuffer) => ChannelBuffer
  >()
  expectTypeOf(simulateBuffer('srgb', 'deuteranopia', undefined, out)).toEqualTypeOf<
    (src: ChannelBuffer) => ChannelBuffer
  >()

  expectTypeOf(toGamutBuffer(src, 'p3', 'srgb')).toEqualTypeOf<ChannelBuffer>()
  expectTypeOf(toGamutBuffer(src, 'p3', 'srgb', out)).toEqualTypeOf<ChannelBuffer>()
  expectTypeOf(toGamutBuffer('p3', 'srgb')).toEqualTypeOf<(src: ChannelBuffer) => ChannelBuffer>()
  expectTypeOf(toGamutBuffer('p3', 'srgb', out)).toEqualTypeOf<
    (src: ChannelBuffer) => ChannelBuffer
  >()
})

test('comparison, gamut, palette, and CVD helpers expose both lanes', () => {
  expectTypeOf(contrastRatio(color, other)).toEqualTypeOf<number>()
  expectTypeOf(contrastRatio(other)).toEqualTypeOf<(a: Color) => number>()
  expectTypeOf(deltaEOK(color, other)).toEqualTypeOf<number>()
  expectTypeOf(deltaEOK(other)).toEqualTypeOf<(a: Color) => number>()
  expectTypeOf(inGamut(color, 'srgb')).toEqualTypeOf<boolean>()
  expectTypeOf(inGamut('srgb')).toEqualTypeOf<(c: Color) => boolean>()
  expectTypeOf(toGamut(color, 'srgb')).toEqualTypeOf<Color>()
  expectTypeOf(toGamut('srgb')).toEqualTypeOf<(c: Color) => Color>()
  expectTypeOf(analogous(color, 5, 30)).toEqualTypeOf<Color[]>()
  expectTypeOf(analogous(5, 30)).toEqualTypeOf<(c: Color) => Color[]>()
  expectTypeOf(simulate(color, 'deuteranopia', 0.75)).toEqualTypeOf<Color>()
  expectTypeOf(simulate('deuteranopia', 0.75)).toEqualTypeOf<(c: Color) => Color>()
  expectTypeOf(minDistinguishableDistance([color, other], 'deuteranopia')).toEqualTypeOf<number>()
  expectTypeOf(minDistinguishableDistance('deuteranopia')).toEqualTypeOf<
    (palette: Color[]) => number
  >()
})
