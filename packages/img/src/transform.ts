import type { Image } from './types'
import { create } from './create'
import { dual } from './dual'

function validateImage(img: Image): void {
  if (img.width <= 0 || img.height <= 0) throw new Error('Invalid image: width and height must be positive')
  if (img.data.length !== img.width * img.height * 4) throw new Error(`Invalid image: data length ${img.data.length} doesn't match ${img.width}x${img.height}x4`)
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

const sample = (img: Image, x: number, y: number, c: number): number => {
  const cx = Math.max(0, Math.min(img.width - 1, x))
  const cy = Math.max(0, Math.min(img.height - 1, y))
  return img.data[(cy * img.width + cx) * 4 + c]
}

export const resize: {
  (img: Image, width: number, height: number): Image
  (width: number, height: number): (img: Image) => Image
} = dual(3, (img: Image, width: number, height: number): Image => {
  validateImage(img)
  if (width <= 0 || height <= 0) throw new Error('Invalid dimensions: width and height must be positive')
  const out = create(width, height)
  const xRatio = img.width / width
  const yRatio = img.height / height

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = x * xRatio
      const srcY = y * yRatio
      const x0 = Math.floor(srcX), y0 = Math.floor(srcY)
      const x1 = x0 + 1, y1 = y0 + 1
      const fx = srcX - x0, fy = srcY - y0
      const oi = (y * width + x) * 4

      for (let c = 0; c < 4; c++) {
        const top = sample(img, x0, y0, c) * (1 - fx) + sample(img, x1, y0, c) * fx
        const bot = sample(img, x0, y1, c) * (1 - fx) + sample(img, x1, y1, c) * fx
        out.data[oi + c] = clamp(top * (1 - fy) + bot * fy)
      }
    }
  }
  return out
})

export const crop: {
  (img: Image, x: number, y: number, w: number, h: number): Image
  (x: number, y: number, w: number, h: number): (img: Image) => Image
} = dual(5, (img: Image, x: number, y: number, w: number, h: number): Image => {
  validateImage(img)
  x = Math.max(0, Math.min(x, img.width))
  y = Math.max(0, Math.min(y, img.height))
  w = Math.max(0, Math.min(w, img.width - x))
  h = Math.max(0, Math.min(h, img.height - y))
  if (w === 0 || h === 0) return create(0, 0)
  const out = create(w, h)
  for (let row = 0; row < h; row++) {
    const srcOff = ((y + row) * img.width + x) * 4
    const dstOff = row * w * 4
    out.data.set(img.data.subarray(srcOff, srcOff + w * 4), dstOff)
  }
  return out
})

export const flipH = (img: Image): Image => {
  validateImage(img)
  const out = create(img.width, img.height)
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const si = (y * img.width + x) * 4
      const di = (y * img.width + (img.width - 1 - x)) * 4
      out.data[di] = img.data[si]
      out.data[di + 1] = img.data[si + 1]
      out.data[di + 2] = img.data[si + 2]
      out.data[di + 3] = img.data[si + 3]
    }
  }
  return out
}

export const flipV = (img: Image): Image => {
  validateImage(img)
  const out = create(img.width, img.height)
  for (let y = 0; y < img.height; y++) {
    const srcOff = y * img.width * 4
    const dstOff = (img.height - 1 - y) * img.width * 4
    out.data.set(img.data.subarray(srcOff, srcOff + img.width * 4), dstOff)
  }
  return out
}

export const rotate90 = (img: Image): Image => {
  validateImage(img)
  const out = create(img.height, img.width)
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const si = (y * img.width + x) * 4
      const di = (x * img.height + (img.height - 1 - y)) * 4
      out.data[di] = img.data[si]
      out.data[di + 1] = img.data[si + 1]
      out.data[di + 2] = img.data[si + 2]
      out.data[di + 3] = img.data[si + 3]
    }
  }
  return out
}
