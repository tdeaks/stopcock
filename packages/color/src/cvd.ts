import type { Color } from './types'
import { convert, toLinearRGB } from './convert'
import { luminance } from './contrast'

// ──────────────────────────────────────────────────────────────────────
// Color Vision Deficiency (CVD) simulation
//
// Algorithm: Machado, Oliveira, Fernandes (2009),
// "A Physiologically-based Model for Simulation of Color Vision Deficiency"
// IEEE Transactions on Visualization and Computer Graphics 15(6).
//
// We store the two boundary matrices for each anomaly type (severity 0.5
// and severity 1.0) and interpolate between identity (0), 0.5, and 1.0.
// Matrices operate on LINEAR sRGB (NOT gamma-encoded).
// ──────────────────────────────────────────────────────────────────────

export type CVDType = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia'

const IDENTITY = new Float64Array([
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
])

// Severity 1.0 (full dichromacy) — Machado et al. 2009, Table 1 row 100
const PROTAN_100 = new Float64Array([
   0.152286, 1.052583, -0.204868,
   0.114503, 0.786281,  0.099216,
  -0.003882, -0.048116, 1.051998,
])
const DEUTAN_100 = new Float64Array([
   0.367322, 0.860646, -0.227968,
   0.280085, 0.672501,  0.047413,
  -0.011820, 0.042940,  0.968881,
])
const TRITAN_100 = new Float64Array([
   1.255528, -0.076749, -0.178779,
  -0.078411,  0.930809,  0.147602,
   0.004733,  0.691367,  0.303900,
])

// Severity 0.5 — Machado et al. 2009, Table 1 row 50
const PROTAN_50 = new Float64Array([
   0.458064, 0.679578, -0.137642,
   0.092785, 0.846313,  0.060902,
  -0.007494, -0.016807, 1.024301,
])
const DEUTAN_50 = new Float64Array([
   0.547494, 0.607765, -0.155259,
   0.181692, 0.781742,  0.036566,
  -0.010410, 0.027275,  0.983136,
])
const TRITAN_50 = new Float64Array([
   1.193214, -0.109812, -0.083402,
  -0.058496,  0.979410,  0.079086,
  -0.002346,  0.403492,  0.598854,
])

// Linear interpolation between two 3x3 matrices into `out`.
const lerpMatrix = (a: Float64Array, b: Float64Array, t: number, out: Float64Array): Float64Array => {
  for (let i = 0; i < 9; i++) out[i] = a[i] + (b[i] - a[i]) * t
  return out
}

export const matrixFor = (type: Exclude<CVDType, 'achromatopsia'>, severity: number): Float64Array => {
  const m = new Float64Array(9)
  if (severity <= 0) return IDENTITY.slice() as Float64Array
  const half = type === 'protanopia' ? PROTAN_50 : type === 'deuteranopia' ? DEUTAN_50 : TRITAN_50
  const full = type === 'protanopia' ? PROTAN_100 : type === 'deuteranopia' ? DEUTAN_100 : TRITAN_100
  if (severity <= 0.5) return lerpMatrix(IDENTITY, half, severity / 0.5, m)
  return lerpMatrix(half, full, (severity - 0.5) / 0.5, m)
}

const apply3x3 = (m: Float64Array, r: number, g: number, b: number): [number, number, number] => [
  m[0] * r + m[1] * g + m[2] * b,
  m[3] * r + m[4] * g + m[5] * b,
  m[6] * r + m[7] * g + m[8] * b,
]

/**
 * Simulate how a color appears under a color vision deficiency.
 *
 * @param c        source color (any space)
 * @param type     deficiency type
 * @param severity 0 (normal) to 1 (full dichromacy). Default 1. Ignored for achromatopsia.
 * @returns        the simulated color in the source space
 */
export const simulate = (c: Color, type: CVDType, severity: number = 1): Color => {
  if (type === 'achromatopsia') {
    // Replace with grayscale of the same WCAG luminance.
    // We pick the gray in linear-srgb so it has the right luminance.
    const L = luminance(c)
    const linGray: Color = { space: 'linear-srgb', channels: new Float64Array([L, L, L]), alpha: c.alpha }
    return convert(linGray, c.space)
  }

  const m = matrixFor(type, Math.max(0, Math.min(1, severity)))
  const lin = toLinearRGB(c)
  const [r, g, b] = apply3x3(m, lin.channels[0], lin.channels[1], lin.channels[2])
  const simulated: Color = { space: 'linear-srgb', channels: new Float64Array([r, g, b]), alpha: c.alpha }
  return convert(simulated, c.space)
}
