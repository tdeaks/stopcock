import { dual } from '@stopcock/fp'
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
  return convert(adjusted, c.space)
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

export const lighten: {
  (c: Color, amount: number): Color
  (amount: number): (c: Color) => Color
} = dual(2, (c: Color, amount: number) =>
  inOklch(c, (ch) => { ch[0] = clamp(ch[0] + amount, 0, 1) })
)

export const darken: {
  (c: Color, amount: number): Color
  (amount: number): (c: Color) => Color
} = dual(2, (c: Color, amount: number) =>
  inOklch(c, (ch) => { ch[0] = clamp(ch[0] - amount, 0, 1) })
)

export const saturate: {
  (c: Color, amount: number): Color
  (amount: number): (c: Color) => Color
} = dual(2, (c: Color, amount: number) =>
  inOklch(c, (ch) => { ch[1] = Math.max(0, ch[1] + amount * 0.4) })
)

export const desaturate: {
  (c: Color, amount: number): Color
  (amount: number): (c: Color) => Color
} = dual(2, (c: Color, amount: number) =>
  inOklch(c, (ch) => { ch[1] = Math.max(0, ch[1] - amount * 0.4) })
)

export const adjustHue: {
  (c: Color, degrees: number): Color
  (degrees: number): (c: Color) => Color
} = dual(2, (c: Color, degrees: number) =>
  inOklch(c, (ch) => { ch[2] = ((ch[2] + degrees) % 360 + 360) % 360 })
)

export const adjustAlpha: {
  (c: Color, alpha: number): Color
  (alpha: number): (c: Color) => Color
} = dual(2, (c: Color, alpha: number) => ({
  space: c.space,
  channels: c.channels,
  alpha: clamp(alpha, 0, 1),
}))
