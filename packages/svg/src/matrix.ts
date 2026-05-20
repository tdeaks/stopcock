import type { Mat, Pt } from './types'

export const identity: Mat = [1, 0, 0, 1, 0, 0]

export const mul = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
]

export const isIdentity = (m?: Mat): boolean =>
  !m || (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0)

export const applyToPoint = (m: Mat, pt: Pt): Pt => [
  m[0] * pt[0] + m[2] * pt[1] + m[4],
  m[1] * pt[0] + m[3] * pt[1] + m[5],
]

export const inverse = (m: Mat): Mat | null => {
  const det = m[0] * m[3] - m[1] * m[2]
  if (Math.abs(det) < 1e-12) return null
  const a = m[3] / det
  const b = -m[1] / det
  const c = -m[2] / det
  const d = m[0] / det
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])]
}

export const matrix = (a: number, b: number, c: number, d: number, e: number, f: number): Mat =>
  [a, b, c, d, e, f]
