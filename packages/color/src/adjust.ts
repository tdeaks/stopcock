import type { Color } from './types'
import { toOKLCh, convert } from './convert'

// All adjustments route through OKLCh, then convert back to the original space.
// This keeps the API ergonomic: pipe(rgb(...), lighten(0.1), toHex) returns a hex string,
// rather than forcing the caller to manually convert back from oklch.

const inOklch = (c: Color, mut: (channels: Float64Array) => void): Color => {
  const ok = toOKLCh(c)
  const next = new Float64Array(ok.channels)
  mut(next)
  const adjusted: Color = { space: 'oklch', channels: next, alpha: ok.alpha }
  return convert(c.space)(adjusted)
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

export const lighten: (amount: number) => (c: Color) => Color = (amount) => (c) =>
  inOklch(c, (ch) => {
    ch[0] = clamp(ch[0] + amount, 0, 1)
  })

export const darken: (amount: number) => (c: Color) => Color = (amount) => (c) =>
  inOklch(c, (ch) => {
    ch[0] = clamp(ch[0] - amount, 0, 1)
  })

export const saturate: (amount: number) => (c: Color) => Color = (amount) => (c) =>
  inOklch(c, (ch) => {
    ch[1] = Math.max(0, ch[1] + amount * 0.4)
  })

export const desaturate: (amount: number) => (c: Color) => Color = (amount) => (c) =>
  inOklch(c, (ch) => {
    ch[1] = Math.max(0, ch[1] - amount * 0.4)
  })

export const adjustHue: (degrees: number) => (c: Color) => Color = (degrees) => (c) =>
  inOklch(c, (ch) => {
    ch[2] = (((ch[2] + degrees) % 360) + 360) % 360
  })

export const adjustAlpha: (alpha: number) => (c: Color) => Color = (alpha) => (c) => ({
  space: c.space,
  channels: c.channels,
  alpha: clamp(alpha, 0, 1),
})
