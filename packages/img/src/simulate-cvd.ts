import type { CVDType } from '@stopcock/color'
import { simulateBuffer } from '@stopcock/color'
import type { Image } from './types'
import { channelBufferToImage, imageToChannelBuffer } from './buffer'

const simulateCVDImpl = (img: Image, type: CVDType, severity: number = 1): Image => {
  const { rgb, alpha } = imageToChannelBuffer(img)
  const out = simulateBuffer(rgb, 'srgb', type, severity)
  return channelBufferToImage(out, alpha, img.width, img.height)
}

export function simulateCVD(img: Image, type: CVDType, severity?: number): Image
export function simulateCVD(type: CVDType, severity?: number): (img: Image) => Image
export function simulateCVD(
  imgOrType: Image | CVDType,
  typeOrSeverity?: CVDType | number,
  maybeSeverity?: number,
): Image | ((img: Image) => Image) {
  if (typeof imgOrType === 'string') {
    const type = imgOrType
    const severity = typeof typeOrSeverity === 'number' ? typeOrSeverity : undefined
    return (img: Image) => simulateCVDImpl(img, type, severity)
  }
  return simulateCVDImpl(imgOrType, typeOrSeverity as CVDType, maybeSeverity)
}
