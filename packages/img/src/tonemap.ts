import type { ColorSpace } from '@stopcock/color'
import { toGamutBuffer } from '@stopcock/color'
import type { Image } from './types'
import { dual } from './dual'
import { channelBufferToImage, imageToChannelBuffer } from './buffer'

export const tonemapToGamut: {
  (img: Image, srcSpace: ColorSpace, targetSpace: ColorSpace): Image
  (srcSpace: ColorSpace, targetSpace: ColorSpace): (img: Image) => Image
} = dual(3, (img: Image, srcSpace: ColorSpace, targetSpace: ColorSpace): Image => {
  const { rgb, alpha } = imageToChannelBuffer(img)
  const out = toGamutBuffer(rgb, srcSpace, targetSpace)
  return channelBufferToImage(out, alpha, img.width, img.height)
})
