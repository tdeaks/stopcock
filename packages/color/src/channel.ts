import type { Color } from './types'
import { toSRGB, toOKLCh } from './convert'

export const red = (c: Color): number => toSRGB(c).channels[0]
export const green = (c: Color): number => toSRGB(c).channels[1]
export const blue = (c: Color): number => toSRGB(c).channels[2]

export const lightness = (c: Color): number => toOKLCh(c).channels[0]
export const chroma = (c: Color): number => toOKLCh(c).channels[1]
export const hue = (c: Color): number => toOKLCh(c).channels[2]

export const alpha = (c: Color): number => c.alpha
