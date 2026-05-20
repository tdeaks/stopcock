// IEC 61966-2-1 sRGB transfer functions
// Negative values are handled by sign-preservation so that
// extended/out-of-gamut values round-trip correctly.

export const srgbToLinear = (c: number): number => {
  const a = Math.abs(c)
  const s = Math.sign(c)
  return a <= 0.04045 ? c / 12.92 : s * Math.pow((a + 0.055) / 1.055, 2.4)
}

export const linearToSrgb = (c: number): number => {
  const a = Math.abs(c)
  const s = Math.sign(c)
  return a <= 0.0031308 ? c * 12.92 : s * (1.055 * Math.pow(a, 1 / 2.4) - 0.055)
}

// Display P3 uses the same transfer function as sRGB (only the primaries differ)
export const p3ToLinear = srgbToLinear
export const linearToP3 = linearToSrgb
