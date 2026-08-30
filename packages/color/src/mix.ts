import type { Color, ColorSpace } from './types'
import { convert, toOKLab } from './convert'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const isColor = (value: unknown): value is Color =>
  typeof value === 'object' && value !== null && 'space' in value && 'channels' in value

// ──────────────────────────────────────────────────────────────────────
// Hue interpolation strategy
//
// TODO(learning, 5-10 lines): implement hueInterpolate(h1, h2, t).
//
// Context:
//   h1, h2 are degrees in [0, 360). t is in [0, 1]. Return a hue in [0, 360).
//
// The choice: CSS Color 4 §12.4 defines four hue-interpolation methods:
//   - shorter: go the shortest way around the circle (29° → 264° via 359°→0°, ~125° trip)
//   - longer:  go the long way (~235° through green/yellow)
//   - increasing: always interpolate with h2 >= h1 (add 360 to h2 if needed)
//   - decreasing: always interpolate with h2 <= h1
//
// Recommendation: "shorter" is the CSS default and matches user intuition for color
// pickers and gradients. Implement that one.
//
// Hint:
//   1. Compute diff = h2 - h1
//   2. If diff > 180, subtract 360 from diff (we're going "backward" through 0°)
//   3. If diff < -180, add 360
//   4. Result = h1 + t * diff
//   5. Normalize back to [0, 360) with `((r % 360) + 360) % 360`
// ──────────────────────────────────────────────────────────────────────

const hueInterpolateImpl = (h1: number, h2: number, t: number): number => {
  let diff = h2 - h1
  if (diff > 180) diff -= 360
  else if (diff < -180) diff += 360
  const r = h1 + t * diff
  return ((r % 360) + 360) % 360
}

export function hueInterpolate(h1: number, h2: number, t: number): number
export function hueInterpolate(h2: number, t: number): (h1: number) => number
export function hueInterpolate(
  h1OrH2: number,
  h2OrT: number,
  maybeT?: number,
): number | ((h1: number) => number) {
  if (arguments.length >= 3) return hueInterpolateImpl(h1OrH2, h2OrT, maybeT as number)
  const h2 = h1OrH2
  const t = h2OrT
  return (h1: number): number => hueInterpolateImpl(h1, h2, t)
}

// Mix two colors in a given color space (default OKLab — perceptually uniform).
const mixInImpl = (a: Color, b: Color, space: ColorSpace, t: number): Color => {
  const aIn = convert(space)(a)
  const bIn = convert(space)(b)
  const out = new Float64Array(3)
  // Polar spaces (hsl/hwb/lch/oklch) have their hue at a known index.
  const polarHueIdx: Partial<Record<ColorSpace, number>> = { hsl: 0, hwb: 0, lch: 2, oklch: 2 }
  const hueIdx = polarHueIdx[space]
  for (let i = 0; i < 3; i++) {
    if (i === hueIdx) out[i] = hueInterpolate(aIn.channels[i], bIn.channels[i], t)
    else out[i] = lerp(aIn.channels[i], bIn.channels[i], t)
  }
  return { space, channels: out, alpha: lerp(a.alpha, b.alpha, t) }
}

export const mix: {
  (a: Color, b: Color, t?: number): Color
  (b: Color, t?: number): (a: Color) => Color
} = function mix(...args: any[]): any {
  if (args.length >= 2 && isColor(args[0]) && isColor(args[1])) {
    const [a, b, t = 0.5] = args
    return mixInImpl(a, b, 'oklab', t)
  }
  const [b, t = 0.5] = args
  return (a: Color) => mixInImpl(a, b, 'oklab', t)
}

export const mixIn: {
  (a: Color, b: Color, space: ColorSpace, t?: number): Color
  (b: Color, space: ColorSpace, t?: number): (a: Color) => Color
} = function mixIn(...args: any[]): any {
  if (args.length >= 3 && isColor(args[0]) && isColor(args[1])) {
    const [a, b, space, t = 0.5] = args
    return mixInImpl(a, b, space, t)
  }
  const [b, space, t = 0.5] = args
  return (a: Color) => mixInImpl(a, b, space, t)
}
