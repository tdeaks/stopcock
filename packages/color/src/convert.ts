import { dual } from '@stopcock/fp'
import type { Color, ColorSpace } from './types'
import {
  LIN_SRGB_TO_XYZ_D65, XYZ_D65_TO_LIN_SRGB,
  XYZ_D65_TO_XYZ_D50, XYZ_D50_TO_XYZ_D65,
  LIN_P3_TO_XYZ_D65, XYZ_D65_TO_LIN_P3,
  XYZ_D65_TO_LMS, LMS_TO_XYZ_D65,
  LMS_PRIME_TO_OKLAB, OKLAB_TO_LMS_PRIME,
  mul3,
} from './matrices'
import { srgbToLinear, linearToSrgb, p3ToLinear, linearToP3 } from './transfer'

// ──────────────────────────────────────────────────────────────────────
// Primitive edge functions (a single hop in the conversion graph).
// Each takes a Color and returns a new Color in the adjacent space.
// Alpha passes through unchanged.
// ──────────────────────────────────────────────────────────────────────

const reskin = (c: Color, space: ColorSpace, ch: Float64Array): Color =>
  ({ space, channels: ch, alpha: c.alpha })

const srgbToLinSrgb = (c: Color): Color => {
  const [r, g, b] = c.channels
  return reskin(c, 'linear-srgb', new Float64Array([srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]))
}

const linSrgbToSrgb = (c: Color): Color => {
  const [r, g, b] = c.channels
  return reskin(c, 'srgb', new Float64Array([linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)]))
}

const linSrgbToXyz65 = (c: Color): Color => {
  const out = new Float64Array(3)
  mul3(LIN_SRGB_TO_XYZ_D65, c.channels[0], c.channels[1], c.channels[2], out)
  return reskin(c, 'xyz-d65', out)
}

const xyz65ToLinSrgb = (c: Color): Color => {
  const out = new Float64Array(3)
  mul3(XYZ_D65_TO_LIN_SRGB, c.channels[0], c.channels[1], c.channels[2], out)
  return reskin(c, 'linear-srgb', out)
}

const xyz65ToXyz50 = (c: Color): Color => {
  const out = new Float64Array(3)
  mul3(XYZ_D65_TO_XYZ_D50, c.channels[0], c.channels[1], c.channels[2], out)
  return reskin(c, 'xyz-d50', out)
}

const xyz50ToXyz65 = (c: Color): Color => {
  const out = new Float64Array(3)
  mul3(XYZ_D50_TO_XYZ_D65, c.channels[0], c.channels[1], c.channels[2], out)
  return reskin(c, 'xyz-d65', out)
}

const p3ToLinP3 = (c: Color): Color => {
  const [r, g, b] = c.channels
  return reskin(c, 'linear-srgb' as any, new Float64Array([p3ToLinear(r), p3ToLinear(g), p3ToLinear(b)]))
  // NB: tag is internal; we never expose 'linear-p3' as a space. Re-tag immediately via linP3ToXyz65.
}

const linP3ToXyz65 = (channels: Float64Array, alpha: number): Color => {
  const out = new Float64Array(3)
  mul3(LIN_P3_TO_XYZ_D65, channels[0], channels[1], channels[2], out)
  return { space: 'xyz-d65', channels: out, alpha }
}

const xyz65ToP3 = (c: Color): Color => {
  const lin = new Float64Array(3)
  mul3(XYZ_D65_TO_LIN_P3, c.channels[0], c.channels[1], c.channels[2], lin)
  return reskin(c, 'p3', new Float64Array([linearToP3(lin[0]), linearToP3(lin[1]), linearToP3(lin[2])]))
}

// CIE Lab uses D50. ε and κ from CIE.
const LAB_E = 216 / 24389
const LAB_K = 24389 / 27
const D50_WHITE = [0.9642956764295677, 1, 0.8251046025104602] // CSS Color 4 D50

const xyz50ToLab = (c: Color): Color => {
  const x = c.channels[0] / D50_WHITE[0]
  const y = c.channels[1] / D50_WHITE[1]
  const z = c.channels[2] / D50_WHITE[2]
  const f = (t: number) => t > LAB_E ? Math.cbrt(t) : (LAB_K * t + 16) / 116
  const fx = f(x), fy = f(y), fz = f(z)
  return reskin(c, 'lab', new Float64Array([
    116 * fy - 16,
    500 * (fx - fy),
    200 * (fy - fz),
  ]))
}

const labToXyz50 = (c: Color): Color => {
  const [L, a, b] = c.channels
  const fy = (L + 16) / 116
  const fx = a / 500 + fy
  const fz = fy - b / 200
  const finv = (f: number) => {
    const f3 = f * f * f
    return f3 > LAB_E ? f3 : (116 * f - 16) / LAB_K
  }
  return reskin(c, 'xyz-d50', new Float64Array([
    finv(fx) * D50_WHITE[0],
    finv(fy) * D50_WHITE[1],
    finv(fz) * D50_WHITE[2],
  ]))
}

// Rectangular <-> Polar (shared by Lab<->LCh and OKLab<->OKLCh)
const toPolar = (L: number, a: number, b: number): [number, number, number] => {
  const C = Math.hypot(a, b)
  let h = (Math.atan2(b, a) * 180) / Math.PI
  if (h < 0) h += 360
  // Achromatic colors have undefined hue; CSS uses NaN, we use 0 to keep Float64Array stable.
  if (C < 1e-7) h = 0
  return [L, C, h]
}

const fromPolar = (L: number, C: number, h: number): [number, number, number] => {
  const rad = (h * Math.PI) / 180
  return [L, C * Math.cos(rad), C * Math.sin(rad)]
}

const labToLch = (c: Color): Color => {
  const [L, C, h] = toPolar(c.channels[0], c.channels[1], c.channels[2])
  return reskin(c, 'lch', new Float64Array([L, C, h]))
}

const lchToLab = (c: Color): Color => {
  const [L, a, b] = fromPolar(c.channels[0], c.channels[1], c.channels[2])
  return reskin(c, 'lab', new Float64Array([L, a, b]))
}

const xyz65ToOklab = (c: Color): Color => {
  const lms = new Float64Array(3)
  mul3(XYZ_D65_TO_LMS, c.channels[0], c.channels[1], c.channels[2], lms)
  const lp = Math.cbrt(lms[0]), mp = Math.cbrt(lms[1]), sp = Math.cbrt(lms[2])
  const out = new Float64Array(3)
  mul3(LMS_PRIME_TO_OKLAB, lp, mp, sp, out)
  return reskin(c, 'oklab', out)
}

const oklabToXyz65 = (c: Color): Color => {
  const lp = new Float64Array(3)
  mul3(OKLAB_TO_LMS_PRIME, c.channels[0], c.channels[1], c.channels[2], lp)
  const lms = new Float64Array([lp[0] ** 3, lp[1] ** 3, lp[2] ** 3])
  const out = new Float64Array(3)
  mul3(LMS_TO_XYZ_D65, lms[0], lms[1], lms[2], out)
  return reskin(c, 'xyz-d65', out)
}

const oklabToOklch = (c: Color): Color => {
  const [L, C, h] = toPolar(c.channels[0], c.channels[1], c.channels[2])
  return reskin(c, 'oklch', new Float64Array([L, C, h]))
}

const oklchToOklab = (c: Color): Color => {
  const [L, a, b] = fromPolar(c.channels[0], c.channels[1], c.channels[2])
  return reskin(c, 'oklab', new Float64Array([L, a, b]))
}

// sRGB <-> HSL (direct, no XYZ)
const srgbToHsl = (c: Color): Color => {
  const [r, g, b] = c.channels
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  return reskin(c, 'hsl', new Float64Array([h, s, l]))
}

const hslToSrgb = (c: Color): Color => {
  const [h, s, l] = c.channels
  if (s === 0) return reskin(c, 'srgb', new Float64Array([l, l, l]))
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hk = h / 360
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return reskin(c, 'srgb', new Float64Array([hue2rgb(hk + 1 / 3), hue2rgb(hk), hue2rgb(hk - 1 / 3)]))
}

// sRGB <-> HWB (direct, via HSL relationship in CSS Color 4 §6)
const srgbToHwb = (c: Color): Color => {
  const [r, g, b] = c.channels
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const w = min
  const bl = 1 - max
  let h = 0
  if (max !== min) {
    const d = max - min
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  return reskin(c, 'hwb', new Float64Array([h, w, bl]))
}

const hwbToSrgb = (c: Color): Color => {
  const [h, w, bl] = c.channels
  if (w + bl >= 1) {
    const g = w / (w + bl)
    return reskin(c, 'srgb', new Float64Array([g, g, g]))
  }
  // Convert through HSL: hsl(h, 100%, 50%) then mix with white/black
  const hslPure = hslToSrgb({ space: 'hsl', channels: new Float64Array([h, 1, 0.5]), alpha: c.alpha })
  const span = 1 - w - bl
  return reskin(c, 'srgb', new Float64Array([
    hslPure.channels[0] * span + w,
    hslPure.channels[1] * span + w,
    hslPure.channels[2] * span + w,
  ]))
}

// ──────────────────────────────────────────────────────────────────────
// Edge map. Each key is "from→to"; value is the single-hop function.
// ──────────────────────────────────────────────────────────────────────

type Edge = (c: Color) => Color
const EDGES: Record<string, Edge> = {
  'srgb→linear-srgb': srgbToLinSrgb,
  'linear-srgb→srgb': linSrgbToSrgb,
  'linear-srgb→xyz-d65': linSrgbToXyz65,
  'xyz-d65→linear-srgb': xyz65ToLinSrgb,
  'xyz-d65→xyz-d50': xyz65ToXyz50,
  'xyz-d50→xyz-d65': xyz50ToXyz65,
  'xyz-d50→lab': xyz50ToLab,
  'lab→xyz-d50': labToXyz50,
  'lab→lch': labToLch,
  'lch→lab': lchToLab,
  'xyz-d65→oklab': xyz65ToOklab,
  'oklab→xyz-d65': oklabToXyz65,
  'oklab→oklch': oklabToOklch,
  'oklch→oklab': oklchToOklab,
  'srgb→hsl': srgbToHsl,
  'hsl→srgb': hslToSrgb,
  'srgb→hwb': srgbToHwb,
  'hwb→srgb': hwbToSrgb,
  // P3: go via xyz-d65 with a combined hop
  'p3→xyz-d65': (c) => {
    const lin = new Float64Array([p3ToLinear(c.channels[0]), p3ToLinear(c.channels[1]), p3ToLinear(c.channels[2])])
    return linP3ToXyz65(lin, c.alpha)
  },
  'xyz-d65→p3': xyz65ToP3,
}

// ──────────────────────────────────────────────────────────────────────
// Routing: find the shortest path from `from` to `to` using BFS,
// then apply each edge in sequence.
//
// TODO(learning): implement `convertImpl(color, target)`.
//   - If color.space === target, return color unchanged.
//   - Otherwise BFS over EDGES (keys parsed as "from→to") to find a path,
//     then fold over the edges applying each in turn.
//   - If no path exists, throw a descriptive error.
//
// Why this decision matters:
//   - A *static lookup table* of conversion paths (built once) is fastest at
//     runtime but locks the graph at module load.
//   - A *BFS at call time* is more flexible (easy to add new spaces) but
//     pays a small graph-walk cost on every conversion.
//   - A *memoized BFS* (cache path arrays by "from→to" key) is the sweet spot:
//     pay BFS once per unique pair, then O(1) lookup forever after.
//
// Recommendation: memoized BFS (5-10 lines).
// ──────────────────────────────────────────────────────────────────────

const PATH_CACHE = new Map<string, Edge[]>()

const findPath = (from: ColorSpace, to: ColorSpace): Edge[] => {
  const key = `${from}→${to}`
  const cached = PATH_CACHE.get(key)
  if (cached) return cached
  // BFS over the edge graph
  const queue: Array<{ at: ColorSpace; path: Edge[] }> = [{ at: from, path: [] }]
  const seen = new Set<ColorSpace>([from])
  while (queue.length > 0) {
    const { at, path } = queue.shift()!
    for (const edgeKey of Object.keys(EDGES)) {
      const [eFrom, eTo] = edgeKey.split('→') as [ColorSpace, ColorSpace]
      if (eFrom !== at || seen.has(eTo)) continue
      const nextPath = [...path, EDGES[edgeKey]]
      if (eTo === to) {
        PATH_CACHE.set(key, nextPath)
        return nextPath
      }
      seen.add(eTo)
      queue.push({ at: eTo, path: nextPath })
    }
  }
  throw new Error(`No conversion path from ${from} to ${to}`)
}

const convertImpl = (color: Color, target: ColorSpace): Color => {
  if (color.space === target) return color
  const path = findPath(color.space, target)
  let cur = color
  for (const edge of path) cur = edge(cur)
  return cur
}

export const convert: {
  (color: Color, target: ColorSpace): Color
  (target: ColorSpace): (color: Color) => Color
} = dual(2, convertImpl)

// Convenience aliases (arity 1, directly pipeable)
export const toSRGB = (c: Color): Color => convertImpl(c, 'srgb')
export const toLinearRGB = (c: Color): Color => convertImpl(c, 'linear-srgb')
export const toHSL = (c: Color): Color => convertImpl(c, 'hsl')
export const toHWB = (c: Color): Color => convertImpl(c, 'hwb')
export const toLab = (c: Color): Color => convertImpl(c, 'lab')
export const toLCh = (c: Color): Color => convertImpl(c, 'lch')
export const toOKLab = (c: Color): Color => convertImpl(c, 'oklab')
export const toOKLCh = (c: Color): Color => convertImpl(c, 'oklch')
export const toP3 = (c: Color): Color => convertImpl(c, 'p3')
export const toXYZ = (c: Color): Color => convertImpl(c, 'xyz-d65')
export const toXYZ50 = (c: Color): Color => convertImpl(c, 'xyz-d50')
