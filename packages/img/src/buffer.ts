import type { Image } from './types'

export type ChannelBufferResult = {
  rgb: Float64Array
  alpha: Uint8ClampedArray
}

export const validateImage = (img: Image): void => {
  if (img.width <= 0 || img.height <= 0)
    throw new Error('Invalid image: width and height must be positive')
  if (img.data.length !== img.width * img.height * 4)
    throw new Error(
      `Invalid image: data length ${img.data.length} doesn't match ${img.width}x${img.height}x4`,
    )
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

export const rgbaBytesToChannelBuffer = (src: Uint8ClampedArray): ChannelBufferResult => {
  if (src.length % 4 !== 0) throw new Error('RGBA byte buffer length must be a multiple of 4')
  const pixels = src.length / 4
  const rgb = new Float64Array(pixels * 3)
  const alpha = new Uint8ClampedArray(pixels)
  for (let pixel = 0; pixel < pixels; pixel++) {
    const byte = pixel * 4
    const channel = pixel * 3
    rgb[channel] = src[byte] / 255
    rgb[channel + 1] = src[byte + 1] / 255
    rgb[channel + 2] = src[byte + 2] / 255
    alpha[pixel] = src[byte + 3]
  }
  return { rgb, alpha }
}

export const channelBufferToRgbaBytes = (
  rgb: Float64Array,
  alpha: Uint8ClampedArray,
  dst: Uint8ClampedArray = new Uint8ClampedArray(alpha.length * 4),
): Uint8ClampedArray => {
  if (rgb.length !== alpha.length * 3)
    throw new Error(
      `RGB channel buffer length ${rgb.length} doesn't match alpha length ${alpha.length}`,
    )
  if (dst.length !== alpha.length * 4)
    throw new Error(
      `destination RGBA length ${dst.length} doesn't match alpha length ${alpha.length}`,
    )
  for (let pixel = 0; pixel < alpha.length; pixel++) {
    const byte = pixel * 4
    const channel = pixel * 3
    dst[byte] = Math.round(clamp01(rgb[channel]) * 255)
    dst[byte + 1] = Math.round(clamp01(rgb[channel + 1]) * 255)
    dst[byte + 2] = Math.round(clamp01(rgb[channel + 2]) * 255)
    dst[byte + 3] = alpha[pixel]
  }
  return dst
}

export const imageToChannelBuffer = (img: Image): ChannelBufferResult => {
  validateImage(img)
  return rgbaBytesToChannelBuffer(img.data)
}

export const channelBufferToImage = (
  rgb: Float64Array,
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
): Image => ({
  data: channelBufferToRgbaBytes(rgb, alpha),
  width,
  height,
})
