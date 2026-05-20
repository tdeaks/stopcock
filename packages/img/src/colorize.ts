import type { Color } from '@stopcock/color'
import { convert, convertBuffer } from '@stopcock/color'
import type { Image } from './types'
import { dual } from './dual'
import { channelBufferToImage, imageToChannelBuffer } from './buffer'

export const colorize: {
  (img: Image, target: Color): Image
  (target: Color): (img: Image) => Image
} = dual(2, (img: Image, target: Color): Image => {
  const { rgb, alpha } = imageToChannelBuffer(img)
  const oklch = convertBuffer(rgb, 'srgb', 'oklch')
  const targetOklch = convert(target, 'oklch')
  const chroma = targetOklch.channels[1]
  const hue = targetOklch.channels[2]

  for (let i = 0; i < oklch.length; i += 3) {
    oklch[i + 1] = chroma
    oklch[i + 2] = hue
  }

  const out = convertBuffer(oklch, 'oklch', 'srgb')
  return channelBufferToImage(out, alpha, img.width, img.height)
})
