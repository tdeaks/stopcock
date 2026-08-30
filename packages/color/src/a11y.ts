import type { Color } from './types'
import { contrastRatio } from './contrast'
import { simulate } from './cvd'
import type { CVDType } from './cvd'

export type ContrastCell = {
  ratio: number
  aa: boolean
  aaLarge: boolean
  aaa: boolean
}

/**
 * Compute the full N x N contrast-ratio matrix for a palette.
 * cells[i][j] holds the contrast ratio between palette[i] and palette[j].
 * The matrix is symmetric and the diagonal is always 1 (a color against itself).
 */
export const paletteContrastMatrix = (palette: Color[]): ContrastCell[][] => {
  const n = palette.length
  const out: ContrastCell[][] = []
  for (let i = 0; i < n; i++) {
    const row: ContrastCell[] = []
    for (let j = 0; j < n; j++) {
      const r = contrastRatio(palette[j])(palette[i])
      row.push({ ratio: r, aa: r >= 4.5, aaLarge: r >= 3, aaa: r >= 7 })
    }
    out.push(row)
  }
  return out
}

/**
 * For each CVD type, compute the minimum pairwise CIEDE2000-like distance.
 * A high minimum means every pair is still distinguishable under that CVD.
 * Useful for picking categorical color palettes that are colorblind-safe.
 *
 * Uses Euclidean distance in linear-sRGB for cheapness — when you need a
 * proper perceptual delta, run deltaE on each simulated pair yourself.
 */
const minDistinguishableDistanceImpl = (palette: Color[], type: CVDType, severity = 1): number => {
  if (palette.length < 2) return Infinity
  const simulated = palette.map((c) => simulate(c, type, severity))
  let min = Infinity
  for (let i = 0; i < simulated.length; i++) {
    for (let j = i + 1; j < simulated.length; j++) {
      const a = simulated[i],
        b = simulated[j]
      // Channels are in the source space — for a quick proxy, use channel-wise distance.
      // (We don't re-import deltaE here to avoid a heavy dependency for a cheap signal.)
      const d = Math.hypot(
        a.channels[0] - b.channels[0],
        a.channels[1] - b.channels[1],
        a.channels[2] - b.channels[2],
      )
      if (d < min) min = d
    }
  }
  return min
}

export const minDistinguishableDistance: {
  (palette: Color[], type: CVDType, severity?: number): number
  (type: CVDType, severity?: number): (palette: Color[]) => number
} = function minDistinguishableDistance(
  paletteOrType: Color[] | CVDType,
  typeOrSeverity?: CVDType | number,
  maybeSeverity?: number,
): number | ((palette: Color[]) => number) {
  if (Array.isArray(paletteOrType)) {
    return minDistinguishableDistanceImpl(paletteOrType, typeOrSeverity as CVDType, maybeSeverity)
  }
  const type = paletteOrType
  const severity = typeof typeOrSeverity === 'number' ? typeOrSeverity : 1
  return (palette: Color[]): number => minDistinguishableDistanceImpl(palette, type, severity)
} as any
