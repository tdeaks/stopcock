// Unrolled fixed-size operations. No loops, no bounds checks.
// V8 keeps everything in registers for these.

export const dot2 = (a: Float64Array, b: Float64Array): number =>
  a[0] * b[0] + a[1] * b[1]

export const dot3 = (a: Float64Array, b: Float64Array): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export const dot4 = (a: Float64Array, b: Float64Array): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]

export const mul2x2 = (a: Float64Array, b: Float64Array, out: Float64Array): void => {
  const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3]
  const b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3]
  out[0] = a0 * b0 + a1 * b2
  out[1] = a0 * b1 + a1 * b3
  out[2] = a2 * b0 + a3 * b2
  out[3] = a2 * b1 + a3 * b3
}

export const mul3x3 = (a: Float64Array, b: Float64Array, out: Float64Array): void => {
  const a00 = a[0], a01 = a[1], a02 = a[2]
  const a10 = a[3], a11 = a[4], a12 = a[5]
  const a20 = a[6], a21 = a[7], a22 = a[8]
  const b00 = b[0], b01 = b[1], b02 = b[2]
  const b10 = b[3], b11 = b[4], b12 = b[5]
  const b20 = b[6], b21 = b[7], b22 = b[8]
  out[0] = a00 * b00 + a01 * b10 + a02 * b20
  out[1] = a00 * b01 + a01 * b11 + a02 * b21
  out[2] = a00 * b02 + a01 * b12 + a02 * b22
  out[3] = a10 * b00 + a11 * b10 + a12 * b20
  out[4] = a10 * b01 + a11 * b11 + a12 * b21
  out[5] = a10 * b02 + a11 * b12 + a12 * b22
  out[6] = a20 * b00 + a21 * b10 + a22 * b20
  out[7] = a20 * b01 + a21 * b11 + a22 * b21
  out[8] = a20 * b02 + a21 * b12 + a22 * b22
}

export const mul4x4 = (a: Float64Array, b: Float64Array, out: Float64Array): void => {
  for (let i = 0; i < 4; i++) {
    const ai0 = a[i * 4], ai1 = a[i * 4 + 1], ai2 = a[i * 4 + 2], ai3 = a[i * 4 + 3]
    out[i * 4]     = ai0 * b[0] + ai1 * b[4] + ai2 * b[8]  + ai3 * b[12]
    out[i * 4 + 1] = ai0 * b[1] + ai1 * b[5] + ai2 * b[9]  + ai3 * b[13]
    out[i * 4 + 2] = ai0 * b[2] + ai1 * b[6] + ai2 * b[10] + ai3 * b[14]
    out[i * 4 + 3] = ai0 * b[3] + ai1 * b[7] + ai2 * b[11] + ai3 * b[15]
  }
}

export const det4x4 = (d: Float64Array): number => {
  const m00 = d[0],  m01 = d[1],  m02 = d[2],  m03 = d[3]
  const m10 = d[4],  m11 = d[5],  m12 = d[6],  m13 = d[7]
  const m20 = d[8],  m21 = d[9],  m22 = d[10], m23 = d[11]
  const m30 = d[12], m31 = d[13], m32 = d[14], m33 = d[15]

  const s0 = m00 * m11 - m10 * m01
  const s1 = m00 * m12 - m10 * m02
  const s2 = m00 * m13 - m10 * m03
  const s3 = m01 * m12 - m11 * m02
  const s4 = m01 * m13 - m11 * m03
  const s5 = m02 * m13 - m12 * m03

  const c5 = m22 * m33 - m32 * m23
  const c4 = m21 * m33 - m31 * m23
  const c3 = m21 * m32 - m31 * m22
  const c2 = m20 * m33 - m30 * m23
  const c1 = m20 * m32 - m30 * m22
  const c0 = m20 * m31 - m30 * m21

  return s0 * c5 - s1 * c4 + s2 * c3 + s3 * c2 - s4 * c1 + s5 * c0
}
