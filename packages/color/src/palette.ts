import type { Color } from './types'
import { toOKLCh, convert } from './convert'

const isColor = (x: any): x is Color =>
  x && typeof x === 'object' && 'space' in x && 'channels' in x

// Generate a palette by rotating the OKLCh hue, then projecting back into the source space.
const rotateHue = (source: Color, ok: Color, deg: number): Color => {
  const h = (((ok.channels[2] + deg) % 360) + 360) % 360
  const rotated: Color = {
    space: 'oklch',
    channels: new Float64Array([ok.channels[0], ok.channels[1], h]),
    alpha: ok.alpha,
  }
  return convert(rotated, source.space)
}

export const complementary = (c: Color): Color => {
  const ok = toOKLCh(c)
  return rotateHue(c, ok, 180)
}

export const triadic = (c: Color): [Color, Color, Color] => {
  const ok = toOKLCh(c)
  return [c, rotateHue(c, ok, 120), rotateHue(c, ok, 240)]
}

export const tetradic = (c: Color): [Color, Color, Color, Color] => {
  const ok = toOKLCh(c)
  return [c, rotateHue(c, ok, 90), rotateHue(c, ok, 180), rotateHue(c, ok, 270)]
}

export const splitComplementary = (c: Color): [Color, Color, Color] => {
  const ok = toOKLCh(c)
  return [c, rotateHue(c, ok, 150), rotateHue(c, ok, 210)]
}

const analogousImpl = (c: Color, count: number, angle: number): Color[] => {
  const ok = toOKLCh(c)
  const half = Math.floor(count / 2)
  const result: Color[] = []
  for (let i = -half; i < count - half; i++) {
    result.push(i === 0 ? c : rotateHue(c, ok, i * angle))
  }
  return result
}

// analogous is dual: data-first (color, count?, angle?) or curried (count?, angle?).
// The curried form is what makes `pipe(color, analogous(5))` work.
export const analogous: {
  (c: Color, count?: number, angle?: number): Color[]
  (count?: number, angle?: number): (c: Color) => Color[]
} = function analogous(a?: any, b?: any, c?: any): any {
  if (isColor(a)) return analogousImpl(a, b ?? 5, c ?? 30)
  const count = a ?? 5
  const angle = b ?? 30
  return (color: Color) => analogousImpl(color, count, angle)
} as any
