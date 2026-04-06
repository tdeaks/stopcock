import type { Image } from './types'
import { create } from './create'
import { dual } from './dual'
import { convolve2dSeparable } from '@stopcock/la/primitives'

function validateImage(img: Image): void {
  if (img.width <= 0 || img.height <= 0) throw new Error('Invalid image: width and height must be positive')
  if (img.data.length !== img.width * img.height * 4) throw new Error(`Invalid image: data length ${img.data.length} doesn't match ${img.width}x${img.height}x4`)
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

export const convolve: {
  (img: Image, kernel: number[][], divisor?: number): Image
  (kernel: number[][], divisor?: number): (img: Image) => Image
} = dual(2, (img: Image, kernel: number[][], divisor?: number): Image => {
  validateImage(img)
  if (kernel.length === 0 || kernel[0].length === 0) throw new Error('Invalid kernel: must be non-empty')
  const kw0 = kernel[0].length
  for (const row of kernel) {
    if (row.length !== kw0) throw new Error('Invalid kernel: must be rectangular')
  }
  const kh = kernel.length, kw = kernel[0].length
  const hh = Math.floor(kh / 2), hw = Math.floor(kw / 2)
  const div = divisor ?? (kernel.flat().reduce((a, b) => a + b, 0) || 1)
  const out = create(img.width, img.height)

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      let r = 0, g = 0, b = 0
      for (let ky = 0; ky < kh; ky++) {
        for (let kx = 0; kx < kw; kx++) {
          const sy = Math.min(img.height - 1, Math.max(0, y + ky - hh))
          const sx = Math.min(img.width - 1, Math.max(0, x + kx - hw))
          const i = (sy * img.width + sx) * 4
          const w = kernel[ky][kx]
          r += img.data[i] * w
          g += img.data[i + 1] * w
          b += img.data[i + 2] * w
        }
      }
      const oi = (y * img.width + x) * 4
      out.data[oi] = clamp(r / div)
      out.data[oi + 1] = clamp(g / div)
      out.data[oi + 2] = clamp(b / div)
      out.data[oi + 3] = img.data[oi + 3]
    }
  }
  return out
})

export const blur: {
  (img: Image, radius: number): Image
  (radius: number): (img: Image) => Image
} = dual(2, (img: Image, radius: number): Image => {
  validateImage(img)
  if (radius <= 0) throw new Error('Invalid radius: must be positive')
  const size = radius * 2 + 1
  const kernel = Array.from({ length: size }, () => Array(size).fill(1))
  return convolve(img, kernel, size * size)
})

const gaussianKernel = (radius: number, sigma?: number): number[][] => {
  const s = sigma ?? radius / 3
  const size = radius * 2 + 1
  const k: number[][] = []
  let sum = 0
  for (let y = 0; y < size; y++) {
    k[y] = []
    for (let x = 0; x < size; x++) {
      const dx = x - radius, dy = y - radius
      const v = Math.exp(-(dx * dx + dy * dy) / (2 * s * s))
      k[y][x] = v
      sum += v
    }
  }
  return k.map(row => row.map(v => v / sum))
}

const gaussian1dKernel = (radius: number, sigma?: number): Float64Array => {
  const s = sigma ?? radius / 3
  const size = radius * 2 + 1
  const k = new Float64Array(size)
  let sum = 0
  for (let i = 0; i < size; i++) {
    const d = i - radius
    k[i] = Math.exp(-(d * d) / (2 * s * s))
    sum += k[i]
  }
  for (let i = 0; i < size; i++) k[i] /= sum
  return k
}

export const gaussianBlur: {
  (img: Image, radius: number, sigma?: number): Image
  (radius: number, sigma?: number): (img: Image) => Image
} = dual(2, (img: Image, radius: number, sigma?: number): Image => {
  validateImage(img)
  if (radius <= 0) throw new Error('Invalid radius: must be positive')
  const k1d = gaussian1dKernel(radius, sigma)
  const out = create(img.width, img.height)
  convolve2dSeparable(out.data, img.data, img.width, img.height, 4, k1d, k1d)
  return out
})

const sharpenImpl = (img: Image, amount: number): Image => {
  validateImage(img)
  return convolve(img, [
    [0, -amount, 0],
    [-amount, 1 + 4 * amount, -amount],
    [0, -amount, 0],
  ], 1)
}

export const sharpen: {
  (img: Image, amount?: number): Image
  (amount: number): (img: Image) => Image
} = function sharpen() {
  if (arguments.length >= 2) return sharpenImpl(arguments[0], arguments[1])
  const a0 = arguments[0]
  // If a0 looks like an Image (has .data), it's data-first with default amount
  if (a0 && a0.data) return sharpenImpl(a0, 1)
  // Otherwise it's data-last: sharpen(amount) => (img) => Image
  return (data: any) => sharpenImpl(data, a0)
} as any

export const edgeDetect = (img: Image): Image => {
  validateImage(img)
  const gx = convolve(img, [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], 1)
  const gy = convolve(img, [[-1, -2, -1], [0, 0, 0], [1, 2, 1]], 1)
  const out = create(img.width, img.height)
  for (let i = 0; i < out.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      out.data[i + c] = clamp(Math.sqrt(gx.data[i + c] ** 2 + gy.data[i + c] ** 2))
    }
    out.data[i + 3] = img.data[i + 3]
  }
  return out
}
