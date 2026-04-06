import type { Image } from './types'
import { create } from './create'

export const histogram = (img: Image): { r: number[]; g: number[]; b: number[] } => {
  const r = new Array(256).fill(0)
  const g = new Array(256).fill(0)
  const b = new Array(256).fill(0)
  for (let i = 0; i < img.data.length; i += 4) {
    r[img.data[i]]++
    g[img.data[i + 1]]++
    b[img.data[i + 2]]++
  }
  return { r, g, b }
}

export const equalize = (img: Image): Image => {
  const hist = histogram(img)
  const total = img.width * img.height
  const out = create(img.width, img.height)

  const cdf = (h: number[]): number[] => {
    const c = new Array(256)
    c[0] = h[0]
    for (let i = 1; i < 256; i++) c[i] = c[i - 1] + h[i]
    const cMin = c.find(v => v > 0)!
    return c.map(v => Math.round(((v - cMin) / (total - cMin)) * 255))
  }

  const mapR = cdf(hist.r)
  const mapG = cdf(hist.g)
  const mapB = cdf(hist.b)

  for (let i = 0; i < img.data.length; i += 4) {
    out.data[i] = mapR[img.data[i]]
    out.data[i + 1] = mapG[img.data[i + 1]]
    out.data[i + 2] = mapB[img.data[i + 2]]
    out.data[i + 3] = img.data[i + 3]
  }
  return out
}
