import type { Image } from './types'

export const create = (width: number, height: number): Image => ({
  data: new Uint8ClampedArray(width * height * 4),
  width,
  height,
})

export const clone = (img: Image): Image => ({
  data: new Uint8ClampedArray(img.data),
  width: img.width,
  height: img.height,
})

export const fromRGBA = (data: Uint8ClampedArray, width: number, height: number): Image => ({
  data: new Uint8ClampedArray(data),
  width,
  height,
})
