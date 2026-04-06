import type { Image } from './types'
import { create } from './create'

export const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h, s, l]
}

const hue2rgb = (p: number, q: number, t: number): number => {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

export const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ]
}

export const rgbToGray = (r: number, g: number, b: number): number =>
  Math.round(0.299 * r + 0.587 * g + 0.114 * b)

export const grayscale = (img: Image): Image => {
  const out = create(img.width, img.height)
  for (let i = 0; i < img.data.length; i += 4) {
    const g = rgbToGray(img.data[i], img.data[i + 1], img.data[i + 2])
    out.data[i] = g
    out.data[i + 1] = g
    out.data[i + 2] = g
    out.data[i + 3] = img.data[i + 3]
  }
  return out
}
