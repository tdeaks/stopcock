import { getDot, getConvolve1d, getColorMatrix3x3 } from './accel'

export const sumOfSquares = (a: Float64Array, n: number): number => {
  const wasmDot = getDot()
  if (wasmDot && n > 16) return wasmDot(a, a, n)
  let sum = 0
  const m = n & ~3
  let i = 0
  for (; i < m; i += 4)
    sum += a[i] * a[i] + a[i + 1] * a[i + 1] + a[i + 2] * a[i + 2] + a[i + 3] * a[i + 3]
  for (; i < n; i++) sum += a[i] * a[i]
  return sum
}

export const convolve1dFloat = (
  out: Float64Array, src: Float64Array, kernel: Float64Array,
  srcLen: number, kernelLen: number,
): void => {
  const wasmConv = getConvolve1d()
  if (wasmConv && srcLen > 64) {
    wasmConv(src, kernel, out, srcLen, kernelLen)
    return
  }
  const outLen = srcLen + kernelLen - 1
  out.fill(0, 0, outLen)
  for (let i = 0; i < srcLen; i++) {
    const si = src[i]
    for (let j = 0; j < kernelLen; j++) {
      out[i + j] += si * kernel[j]
    }
  }
}

export const complexMulAccum = (
  out: Float64Array, a: Float64Array, b: Float64Array, n: number,
): void => {
  for (let i = 0; i < n; i++) {
    const ar = a[2 * i], ai = a[2 * i + 1]
    const br = b[2 * i], bi = b[2 * i + 1]
    out[2 * i] = ar * br - ai * bi
    out[2 * i + 1] = ar * bi + ai * br
  }
}

const clamp = (v: number): number => v < 0 ? 0 : v > 255 ? 255 : v + 0.5 | 0

export const applyColorMatrix3x3 = (
  out: Uint8ClampedArray, src: Uint8ClampedArray,
  matrix: Float64Array, numPixels: number,
): void => {
  const wasmCM = getColorMatrix3x3()
  if (wasmCM && numPixels > 64) {
    wasmCM(src, out, matrix, numPixels)
    return
  }
  const m00 = matrix[0], m01 = matrix[1], m02 = matrix[2]
  const m10 = matrix[3], m11 = matrix[4], m12 = matrix[5]
  const m20 = matrix[6], m21 = matrix[7], m22 = matrix[8]
  for (let i = 0; i < numPixels; i++) {
    const p = i * 4
    const r = src[p], g = src[p + 1], b = src[p + 2]
    out[p]     = clamp(m00 * r + m01 * g + m02 * b)
    out[p + 1] = clamp(m10 * r + m11 * g + m12 * b)
    out[p + 2] = clamp(m20 * r + m21 * g + m22 * b)
    out[p + 3] = src[p + 3]
  }
}

export const convolve2dSeparable = (
  out: Uint8ClampedArray, src: Uint8ClampedArray,
  width: number, height: number, channels: number,
  hKernel: Float64Array, vKernel: Float64Array,
): void => {
  const hLen = hKernel.length
  const vLen = vKernel.length
  const hHalf = (hLen - 1) / 2 | 0
  const vHalf = (vLen - 1) / 2 | 0
  const stride = width * channels

  const tmp = new Float64Array(width * height * channels)

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        let sum = 0
        for (let k = 0; k < hLen; k++) {
          const sx = Math.min(Math.max(x + k - hHalf, 0), width - 1)
          sum += src[y * stride + sx * channels + c] * hKernel[k]
        }
        tmp[y * stride + x * channels + c] = sum
      }
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        let sum = 0
        for (let k = 0; k < vLen; k++) {
          const sy = Math.min(Math.max(y + k - vHalf, 0), height - 1)
          sum += tmp[sy * stride + x * channels + c] * vKernel[k]
        }
        out[y * stride + x * channels + c] = clamp(sum)
      }
    }
  }
}
