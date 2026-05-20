export type ColorSpace =
  | 'srgb'
  | 'linear-srgb'
  | 'hsl'
  | 'hwb'
  | 'lab'
  | 'lch'
  | 'oklab'
  | 'oklch'
  | 'p3'
  | 'xyz-d50'
  | 'xyz-d65'

export type Color = {
  readonly space: ColorSpace
  readonly channels: Float64Array
  readonly alpha: number
}
