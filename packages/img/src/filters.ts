import type { Image } from './types'
import { create } from './create'
import { rgbToGray, rgbToHsl, hslToRgb } from './color'
import { dual } from './dual'
import { applyColorMatrix3x3 } from '@stopcock/la/primitives'

function validateImage(img: Image): void {
  if (img.width <= 0 || img.height <= 0) throw new Error('Invalid image: width and height must be positive')
  if (img.data.length !== img.width * img.height * 4) throw new Error(`Invalid image: data length ${img.data.length} doesn't match ${img.width}x${img.height}x4`)
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

export const brightness: {
  (img: Image, amount: number): Image
  (amount: number): (img: Image) => Image
} = dual(2, (img: Image, amount: number): Image => {
  validateImage(img)
  const out = create(img.width, img.height)
  for (let i = 0; i < img.data.length; i += 4) {
    out.data[i] = clamp(img.data[i] + amount)
    out.data[i + 1] = clamp(img.data[i + 1] + amount)
    out.data[i + 2] = clamp(img.data[i + 2] + amount)
    out.data[i + 3] = img.data[i + 3]
  }
  return out
})

export const contrast: {
  (img: Image, amount: number): Image
  (amount: number): (img: Image) => Image
} = dual(2, (img: Image, amount: number): Image => {
  validateImage(img)
  const f = (259 * (amount + 255)) / (255 * (259 - amount))
  const out = create(img.width, img.height)
  for (let i = 0; i < img.data.length; i += 4) {
    out.data[i] = clamp(f * (img.data[i] - 128) + 128)
    out.data[i + 1] = clamp(f * (img.data[i + 1] - 128) + 128)
    out.data[i + 2] = clamp(f * (img.data[i + 2] - 128) + 128)
    out.data[i + 3] = img.data[i + 3]
  }
  return out
})

export const invert = (img: Image): Image => {
  validateImage(img)
  const out = create(img.width, img.height)
  for (let i = 0; i < img.data.length; i += 4) {
    out.data[i] = 255 - img.data[i]
    out.data[i + 1] = 255 - img.data[i + 1]
    out.data[i + 2] = 255 - img.data[i + 2]
    out.data[i + 3] = img.data[i + 3]
  }
  return out
}

export const threshold: {
  (img: Image, value: number): Image
  (value: number): (img: Image) => Image
} = dual(2, (img: Image, value: number): Image => {
  validateImage(img)
  const out = create(img.width, img.height)
  for (let i = 0; i < img.data.length; i += 4) {
    const g = rgbToGray(img.data[i], img.data[i + 1], img.data[i + 2])
    const v = g >= value ? 255 : 0
    out.data[i] = v
    out.data[i + 1] = v
    out.data[i + 2] = v
    out.data[i + 3] = img.data[i + 3]
  }
  return out
})

const SEPIA_MATRIX = new Float64Array([
  0.393, 0.769, 0.189,
  0.349, 0.686, 0.168,
  0.272, 0.534, 0.131,
])

export const sepia = (img: Image): Image => {
  validateImage(img)
  const out = create(img.width, img.height)
  applyColorMatrix3x3(out.data, img.data, SEPIA_MATRIX, img.width * img.height)
  return out
}

export const saturate: {
  (img: Image, amount: number): Image
  (amount: number): (img: Image) => Image
} = dual(2, (img: Image, amount: number): Image => {
  validateImage(img)
  const out = create(img.width, img.height)
  for (let i = 0; i < img.data.length; i += 4) {
    const [h, s, l] = rgbToHsl(img.data[i], img.data[i + 1], img.data[i + 2])
    const [r, g, b] = hslToRgb(h, Math.min(1, Math.max(0, s * amount)), l)
    out.data[i] = r
    out.data[i + 1] = g
    out.data[i + 2] = b
    out.data[i + 3] = img.data[i + 3]
  }
  return out
})
