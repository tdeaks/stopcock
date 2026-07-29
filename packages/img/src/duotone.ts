import type { Color } from '@stopcock/color'
import { convert, convertBuffer } from '@stopcock/color'
import type { Image } from './types'
import { dual } from './dual'
import { channelBufferToImage, imageToChannelBuffer } from './buffer'

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

export const duotone: {
  (img: Image, dark: Color, light: Color): Image
  (dark: Color, light: Color): (img: Image) => Image
} = dual(3, (img: Image, dark: Color, light: Color): Image => {
  const { rgb, alpha } = imageToChannelBuffer(img)
  const lab = convertBuffer(rgb, 'srgb', 'oklab')
  const toOklab = convert('oklab')
  const darkLab = toOklab(dark).channels
  const lightLab = toOklab(light).channels

  for (let i = 0; i < lab.length; i += 3) {
    const t = clamp01(lab[i])
    lab[i] = darkLab[0] + (lightLab[0] - darkLab[0]) * t
    lab[i + 1] = darkLab[1] + (lightLab[1] - darkLab[1]) * t
    lab[i + 2] = darkLab[2] + (lightLab[2] - darkLab[2]) * t
  }

  const out = convertBuffer(lab, 'oklab', 'srgb')
  return channelBufferToImage(out, alpha, img.width, img.height)
})
