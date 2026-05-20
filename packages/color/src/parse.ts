import type { Color } from './types'
import { rgb, rgb255, hsl, hwb, lab, lch, oklab, oklch, p3, xyz, fromHex } from './create'

// Parse a single channel token, handling % and 'none' (treat as 0).
// `pctScale` is the value that 100% maps to (e.g. 1 for fractions, 255 for legacy rgb).
const parseChannel = (tok: string, pctScale = 1): number => {
  if (tok === 'none') return 0
  if (tok.endsWith('%')) return (parseFloat(tok) / 100) * pctScale
  return parseFloat(tok)
}

const parseAlpha = (tok: string | undefined): number => {
  if (tok === undefined || tok === 'none') return 1
  if (tok.endsWith('%')) return parseFloat(tok) / 100
  return parseFloat(tok)
}

// Split args by spaces or commas, and split alpha off after `/`
const splitArgs = (inside: string): { args: string[]; alpha?: string } => {
  const parts = inside.split('/')
  const main = parts[0].trim().split(/[\s,]+/).filter(Boolean)
  const alpha = parts[1]?.trim()
  return { args: main, alpha }
}

const lower = (s: string) => s.trim().toLowerCase()

export const fromCSS = (input: string): Color => {
  const css = lower(input)

  if (css.startsWith('#')) return fromHex(css)

  // Named colors not supported in scope; throw to make the gap explicit.
  const fn = css.match(/^([a-z][a-z0-9-]*)\(([^)]*)\)$/)
  if (!fn) throw new Error(`Cannot parse color: ${input}`)
  const name = fn[1]
  const { args, alpha } = splitArgs(fn[2])
  const a = parseAlpha(alpha)

  switch (name) {
    case 'rgb':
    case 'rgba': {
      // legacy rgb() uses 0-255 ints; modern uses % or numbers.
      // Detect by presence of % — if any channel is %, scale=1; otherwise treat as 0-255.
      const hasPct = args.some((t) => t.endsWith('%'))
      if (hasPct) {
        return rgb(parseChannel(args[0]), parseChannel(args[1]), parseChannel(args[2]), a)
      }
      return rgb255(parseChannel(args[0]), parseChannel(args[1]), parseChannel(args[2]), a)
    }
    case 'hsl':
    case 'hsla': {
      const h = parseChannel(args[0])
      const s = args[1].endsWith('%') ? parseFloat(args[1]) / 100 : parseFloat(args[1])
      const l = args[2].endsWith('%') ? parseFloat(args[2]) / 100 : parseFloat(args[2])
      return hsl(h, s, l, a)
    }
    case 'hwb': {
      const h = parseChannel(args[0])
      const w = args[1].endsWith('%') ? parseFloat(args[1]) / 100 : parseFloat(args[1])
      const b = args[2].endsWith('%') ? parseFloat(args[2]) / 100 : parseFloat(args[2])
      return hwb(h, w, b, a)
    }
    case 'lab': {
      // L is 0-100 (or %); a,b are -125..125 typical (or % of 125)
      const L = args[0].endsWith('%') ? parseFloat(args[0]) : parseFloat(args[0])
      const A = args[1].endsWith('%') ? (parseFloat(args[1]) / 100) * 125 : parseFloat(args[1])
      const B = args[2].endsWith('%') ? (parseFloat(args[2]) / 100) * 125 : parseFloat(args[2])
      return lab(L, A, B, a)
    }
    case 'lch': {
      const L = parseFloat(args[0])
      const C = args[1].endsWith('%') ? (parseFloat(args[1]) / 100) * 150 : parseFloat(args[1])
      const h = parseFloat(args[2])
      return lch(L, C, h, a)
    }
    case 'oklab': {
      const L = args[0].endsWith('%') ? parseFloat(args[0]) / 100 : parseFloat(args[0])
      const A = args[1].endsWith('%') ? (parseFloat(args[1]) / 100) * 0.4 : parseFloat(args[1])
      const B = args[2].endsWith('%') ? (parseFloat(args[2]) / 100) * 0.4 : parseFloat(args[2])
      return oklab(L, A, B, a)
    }
    case 'oklch': {
      const L = args[0] === 'none' ? 0 : args[0].endsWith('%') ? parseFloat(args[0]) / 100 : parseFloat(args[0])
      const C = args[1] === 'none' ? 0 : args[1].endsWith('%') ? (parseFloat(args[1]) / 100) * 0.4 : parseFloat(args[1])
      const h = args[2] === 'none' ? 0 : parseFloat(args[2])
      return oklch(L, C, h, a)
    }
    case 'color': {
      // color(<colorspace> r g b [/ a])
      const space = args[0]
      const r = parseChannel(args[1])
      const g = parseChannel(args[2])
      const b = parseChannel(args[3])
      switch (space) {
        case 'srgb': return rgb(r, g, b, a)
        case 'srgb-linear': return { space: 'linear-srgb', channels: new Float64Array([r, g, b]), alpha: a }
        case 'display-p3': return p3(r, g, b, a)
        case 'xyz':
        case 'xyz-d65': return xyz(r, g, b, a)
        case 'xyz-d50': return { space: 'xyz-d50', channels: new Float64Array([r, g, b]), alpha: a }
        default: throw new Error(`Unsupported color() space: ${space}`)
      }
    }
    default:
      throw new Error(`Unsupported color function: ${name}`)
  }
}
