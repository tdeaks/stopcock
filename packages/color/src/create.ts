import type { Color, ColorSpace } from './types'

// Default alpha when not provided. Pulled out as a constant so it's
// consistent across all constructors.
const DEFAULT_ALPHA = 1

const make = (space: ColorSpace, a: number, b: number, c: number, alpha: number): Color => ({
  space,
  channels: new Float64Array([a, b, c]),
  alpha,
})

export const rgb = (r: number, g: number, b: number, alpha: number = DEFAULT_ALPHA): Color =>
  make('srgb', r, g, b, alpha)

export const linearRgb = (r: number, g: number, b: number, alpha: number = DEFAULT_ALPHA): Color =>
  make('linear-srgb', r, g, b, alpha)

export const hsl = (h: number, s: number, l: number, alpha: number = DEFAULT_ALPHA): Color =>
  make('hsl', h, s, l, alpha)

export const hwb = (h: number, w: number, b: number, alpha: number = DEFAULT_ALPHA): Color =>
  make('hwb', h, w, b, alpha)

export const lab = (l: number, a: number, b: number, alpha: number = DEFAULT_ALPHA): Color =>
  make('lab', l, a, b, alpha)

export const lch = (l: number, c: number, h: number, alpha: number = DEFAULT_ALPHA): Color =>
  make('lch', l, c, h, alpha)

export const oklab = (l: number, a: number, b: number, alpha: number = DEFAULT_ALPHA): Color =>
  make('oklab', l, a, b, alpha)

export const oklch = (l: number, c: number, h: number, alpha: number = DEFAULT_ALPHA): Color =>
  make('oklch', l, c, h, alpha)

export const p3 = (r: number, g: number, b: number, alpha: number = DEFAULT_ALPHA): Color =>
  make('p3', r, g, b, alpha)

export const xyz = (x: number, y: number, z: number, alpha: number = DEFAULT_ALPHA): Color =>
  make('xyz-d65', x, y, z, alpha)

export const xyzD50 = (x: number, y: number, z: number, alpha: number = DEFAULT_ALPHA): Color =>
  make('xyz-d50', x, y, z, alpha)

// Convenience for the common 0-255 input case
export const rgb255 = (r: number, g: number, b: number, alpha: number = DEFAULT_ALPHA): Color =>
  make('srgb', r / 255, g / 255, b / 255, alpha)

// Parse '#rgb', '#rgba', '#rrggbb', or '#rrggbbaa'
export const fromHex = (hex: string): Color => {
  let h = hex.startsWith('#') ? hex.slice(1) : hex
  if (h.length === 3 || h.length === 4) {
    h = h.split('').map((c) => c + c).join('')
  }
  if (h.length !== 6 && h.length !== 8) {
    throw new Error(`Invalid hex color: ${hex}`)
  }
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
  return make('srgb', r, g, b, a)
}
