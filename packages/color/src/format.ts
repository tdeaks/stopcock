import type { Color } from './types'
import { toSRGB, toHSL, toOKLCh } from './convert'

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const byte = (x: number) => Math.round(clamp01(x) * 255)
const hex2 = (x: number) => byte(x).toString(16).padStart(2, '0')

export const toHex = (c: Color): string => {
  const s = toSRGB(c)
  const r = hex2(s.channels[0])
  const g = hex2(s.channels[1])
  const b = hex2(s.channels[2])
  if (c.alpha >= 1) return `#${r}${g}${b}`
  return `#${r}${g}${b}${hex2(c.alpha)}`
}

const num = (n: number, frac = 4): string => {
  if (!isFinite(n)) return '0'
  // Trim trailing zeros for readability
  const rounded = Number(n.toFixed(frac))
  return String(rounded)
}

export const toCSS = (c: Color): string => {
  const ok = toOKLCh(c)
  const [L, C, h] = ok.channels
  const alphaStr = c.alpha < 1 ? ` / ${num(c.alpha)}` : ''
  return `oklch(${num(L)} ${num(C)} ${num(h, 2)}${alphaStr})`
}

export const toRGBString = (c: Color): string => {
  const s = toSRGB(c)
  const r = byte(s.channels[0]),
    g = byte(s.channels[1]),
    b = byte(s.channels[2])
  if (c.alpha < 1) return `rgb(${r} ${g} ${b} / ${num(c.alpha)})`
  return `rgb(${r} ${g} ${b})`
}

export const toHSLString = (c: Color): string => {
  const s = toHSL(c)
  const [h, sat, l] = s.channels
  const alphaStr = c.alpha < 1 ? ` / ${num(c.alpha)}` : ''
  return `hsl(${num(h, 2)} ${num(sat * 100, 2)}% ${num(l * 100, 2)}%${alphaStr})`
}
