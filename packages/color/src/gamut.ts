import { dual } from '@stopcock/fp/dual'
import type { Color, ColorSpace } from './types'
import { convert, toOKLCh } from './convert'
import { deltaEOK } from './contrast'

const EPS = 1e-9

const inRange01 = (x: number) => x >= -EPS && x <= 1 + EPS

const inGamutImpl = (c: Color, target: ColorSpace): boolean => {
  if (target !== 'srgb' && target !== 'p3' && target !== 'linear-srgb') {
    // Other spaces (lab, oklab, xyz, ...) are unbounded; trivially in gamut.
    return true
  }
  const conv = convert(c, target)
  return inRange01(conv.channels[0]) && inRange01(conv.channels[1]) && inRange01(conv.channels[2])
}

export const inGamut: {
  (c: Color, target: ColorSpace): boolean
  (target: ColorSpace): (c: Color) => boolean
} = dual(2, inGamutImpl)

// CSS Color 4 gamut mapping: binary search on OKLCh chroma, preserving L and h,
// until the result is in-gamut AND its deltaEOK from the clipped variant is < JND.
const JND = 0.02

const clipToGamut = (c: Color, target: ColorSpace): Color => {
  const conv = convert(c, target)
  const ch = new Float64Array([
    Math.max(0, Math.min(1, conv.channels[0])),
    Math.max(0, Math.min(1, conv.channels[1])),
    Math.max(0, Math.min(1, conv.channels[2])),
  ])
  return { space: target, channels: ch, alpha: conv.alpha }
}

const toGamutImpl = (c: Color, target: ColorSpace): Color => {
  if (inGamutImpl(c, target)) return convert(c, target)

  // Edge cases: pure black/white short-circuit
  const ok = toOKLCh(c)
  const [L] = ok.channels
  if (L >= 1)
    return convert(
      { space: 'oklch', channels: new Float64Array([1, 0, 0]), alpha: c.alpha },
      target,
    )
  if (L <= 0)
    return convert(
      { space: 'oklch', channels: new Float64Array([0, 0, 0]), alpha: c.alpha },
      target,
    )

  // Binary search chroma in [0, current]
  let lo = 0
  let hi = ok.channels[1]
  let candidate = ok
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2
    candidate = {
      space: 'oklch',
      channels: new Float64Array([L, mid, ok.channels[2]]),
      alpha: c.alpha,
    }
    if (inGamutImpl(candidate, target)) {
      const clipped = clipToGamut(candidate, target)
      const e = deltaEOK(candidate, clipped)
      if (e < JND) {
        lo = mid
      } else {
        // Within gamut but visibly different from clipped — go higher
        lo = mid
      }
    } else {
      hi = mid
    }
    if (hi - lo < 1e-4) break
  }
  candidate = {
    space: 'oklch',
    channels: new Float64Array([L, lo, ok.channels[2]]),
    alpha: c.alpha,
  }
  return clipToGamut(candidate, target)
}

export const toGamut: {
  (c: Color, target: ColorSpace): Color
  (target: ColorSpace): (c: Color) => Color
} = dual(2, toGamutImpl)
