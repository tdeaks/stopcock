import type { Color } from './types'
import { convert, toLinearRGB, toLab, toOKLab } from './convert'

// Relative luminance per WCAG 2.1 §1.4.3
export const luminance = (c: Color): number => {
  const lin = toLinearRGB(c)
  return 0.2126 * lin.channels[0] + 0.7152 * lin.channels[1] + 0.0722 * lin.channels[2]
}

const contrastImpl = (a: Color, b: Color): number => {
  const La = luminance(a),
    Lb = luminance(b)
  const lighter = Math.max(La, Lb),
    darker = Math.min(La, Lb)
  return (lighter + 0.05) / (darker + 0.05)
}

export const contrastRatio: (b: Color) => (a: Color) => number =
  (b) => (a) =>
    contrastImpl(a, b)

const threshold =
  (limit: number) =>
  (b: Color) =>
  (a: Color): boolean =>
    contrastImpl(a, b) >= limit

export const meetsAA: (b: Color) => (a: Color) => boolean = threshold(4.5)

export const meetsAAA: (b: Color) => (a: Color) => boolean = threshold(7)

export const meetsAALarge: (b: Color) => (a: Color) => boolean = threshold(3)

// ──────────────────────────────────────────────────────────────────────
// CIEDE2000 deltaE — Sharma et al. 2005 reference implementation
// Input colors are converted to Lab (D50) first.
// ──────────────────────────────────────────────────────────────────────

const deg2rad = (d: number) => (d * Math.PI) / 180
const rad2deg = (r: number) => (r * 180) / Math.PI

const deltaEImpl = (c1: Color, c2: Color): number => {
  const [L1, a1, b1] = toLab(c1).channels
  const [L2, a2, b2] = toLab(c2).channels

  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cbar = (C1 + C2) / 2

  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2

  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)

  const h1p = C1p === 0 ? 0 : (rad2deg(Math.atan2(b1, a1p)) + 360) % 360
  const h2p = C2p === 0 ? 0 : (rad2deg(Math.atan2(b2, a2p)) + 360) % 360

  const dLp = L2 - L1
  const dCp = C2p - C1p

  let dhp = 0
  if (C1p * C2p !== 0) {
    const diff = h2p - h1p
    if (Math.abs(diff) <= 180) dhp = diff
    else if (diff > 180) dhp = diff - 360
    else dhp = diff + 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deg2rad(dhp) / 2)

  const Lbarp = (L1 + L2) / 2
  const Cbarp = (C1p + C2p) / 2

  let hbarp = h1p + h2p
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbarp = h1p + h2p + (h1p + h2p < 360 ? 360 : -360)
    hbarp /= 2
  }

  const T =
    1 -
    0.17 * Math.cos(deg2rad(hbarp - 30)) +
    0.24 * Math.cos(deg2rad(2 * hbarp)) +
    0.32 * Math.cos(deg2rad(3 * hbarp + 6)) -
    0.2 * Math.cos(deg2rad(4 * hbarp - 63))

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2)
  const Sc = 1 + 0.045 * Cbarp
  const Sh = 1 + 0.015 * Cbarp * T
  const Rt = -Math.sin(deg2rad(2 * dTheta)) * Rc

  return Math.sqrt(
    (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh),
  )
}

export const deltaE: (b: Color) => (a: Color) => number =
  (b) => (a) =>
    deltaEImpl(a, b)

// Euclidean distance in OKLab — used by gamut mapping
export const deltaEOK = (a: Color, b: Color): number => {
  const [L1, a1, b1] = toOKLab(a).channels
  const [L2, a2, b2] = toOKLab(b).channels
  return Math.hypot(L1 - L2, a1 - a2, b1 - b2)
}
