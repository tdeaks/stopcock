import type { Complex, FftPlan, Real } from './types'
import { assertPowerOfTwoSize, fail, fftSizeFromComplex } from './validate'

export function plan(n: number): FftPlan {
  assertPowerOfTwoSize(n, 'n')
  const twiddles = new Float64Array(2 * n)
  const bits = Math.log2(n)
  const bitrev = new Uint32Array(n)
  for (let k = 0; k < n; k++) {
    const angle = (-2 * Math.PI * k) / n
    twiddles[2 * k] = Math.cos(angle)
    twiddles[2 * k + 1] = Math.sin(angle)
    bitrev[k] = reverseBits(k, bits)
  }
  return { n, twiddles, bitrev, scratch: new Float64Array(2 * n) }
}

const reverseBits = (value: number, bits: number): number => {
  let out = 0
  for (let i = 0; i < bits; i++) {
    out = (out << 1) | (value & 1)
    value >>= 1
  }
  return out
}

const transform = (buf: Complex, fftPlan: FftPlan, inverse: boolean): Complex => {
  if (buf.length !== 2 * fftPlan.n) fail('buf.length must equal 2 * plan.n')
  const n = fftPlan.n
  for (let i = 0; i < n; i++) {
    const j = fftPlan.bitrev[i]
    if (j > i) {
      const ir = 2 * i
      const jr = 2 * j
      const re = buf[ir]
      const im = buf[ir + 1]
      buf[ir] = buf[jr]
      buf[ir + 1] = buf[jr + 1]
      buf[jr] = re
      buf[jr + 1] = im
    }
  }

  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2
    const step = n / size
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < half; j++) {
        const twiddleIndex = j * step
        const wr = fftPlan.twiddles[2 * twiddleIndex]
        const wi = inverse
          ? -fftPlan.twiddles[2 * twiddleIndex + 1]
          : fftPlan.twiddles[2 * twiddleIndex + 1]
        const even = 2 * (start + j)
        const odd = 2 * (start + j + half)
        const or = buf[odd]
        const oi = buf[odd + 1]
        const tr = wr * or - wi * oi
        const ti = wr * oi + wi * or
        const er = buf[even]
        const ei = buf[even + 1]
        buf[even] = er + tr
        buf[even + 1] = ei + ti
        buf[odd] = er - tr
        buf[odd + 1] = ei - ti
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < buf.length; i++) buf[i] /= n
  }

  return buf
}

export function fftInto(buf: Complex, fftPlan: FftPlan): Complex {
  return transform(buf, fftPlan, false)
}

export function ifftInto(buf: Complex, fftPlan: FftPlan): Complex {
  return transform(buf, fftPlan, true)
}

export function fft(buf: Complex): Complex {
  const n = fftSizeFromComplex(buf, 'buf')
  return fftInto(buf, plan(n))
}

export function ifft(buf: Complex): Complex {
  const n = fftSizeFromComplex(buf, 'buf')
  return ifftInto(buf, plan(n))
}

export function rfft(real: Real): Complex {
  assertPowerOfTwoSize(real.length, 'real.length')
  const out = new Float64Array(2 * (real.length / 2 + 1))
  return rfftInto(real, plan(real.length), out)
}

export function irfft(complex: Complex, n: number): Real {
  assertPowerOfTwoSize(n, 'n')
  const out = new Float32Array(n)
  return irfftInto(complex, plan(n), out)
}

export function rfftInto(real: Real, fftPlan: FftPlan, out: Complex): Complex {
  const n = fftPlan.n
  if (real.length !== n) fail('real.length must equal plan.n')
  if (out.length !== 2 * (n / 2 + 1)) fail('out.length must equal 2 * (plan.n / 2 + 1)')

  const buf = fftPlan.scratch
  for (let i = 0; i < n; i++) {
    buf[2 * i] = real[i]
    buf[2 * i + 1] = 0
  }
  fftInto(buf, fftPlan)
  for (let k = 0; k <= n / 2; k++) {
    out[2 * k] = buf[2 * k]
    out[2 * k + 1] = buf[2 * k + 1]
  }

  return out
}

export function irfftInto(complex: Complex, fftPlan: FftPlan, out: Real): Real {
  const n = fftPlan.n
  if (complex.length !== 2 * (n / 2 + 1)) fail('complex.length must equal 2 * (plan.n / 2 + 1)')
  if (out.length !== n) fail('out.length must equal plan.n')

  const buf = fftPlan.scratch
  buf[0] = complex[0]
  buf[1] = complex[1]
  for (let k = 1; k < n / 2; k++) {
    const re = complex[2 * k]
    const im = complex[2 * k + 1]
    buf[2 * k] = re
    buf[2 * k + 1] = im
    buf[2 * (n - k)] = re
    buf[2 * (n - k) + 1] = -im
  }
  buf[n] = complex[n]
  buf[n + 1] = complex[n + 1]
  ifftInto(buf, fftPlan)
  for (let t = 0; t < n; t++) {
    out[t] = buf[2 * t]
  }

  return out
}

export function magnitude(complex: Complex, out: Real): Real {
  if (complex.length % 2 !== 0) fail('complex.length must be even')
  if (out.length !== complex.length / 2) fail('out.length must equal complex.length / 2')
  for (let i = 0; i < out.length; i++) {
    const re = complex[2 * i]
    const im = complex[2 * i + 1]
    out[i] = Math.hypot(re, im)
  }
  return out
}

export function phase(complex: Complex, out: Real): Real {
  if (complex.length % 2 !== 0) fail('complex.length must be even')
  if (out.length !== complex.length / 2) fail('out.length must equal complex.length / 2')
  for (let i = 0; i < out.length; i++) out[i] = Math.atan2(complex[2 * i + 1], complex[2 * i])
  return out
}

export function power(complex: Complex, out: Real): Real {
  if (complex.length % 2 !== 0) fail('complex.length must be even')
  if (out.length !== complex.length / 2) fail('out.length must equal complex.length / 2')
  for (let i = 0; i < out.length; i++) {
    const re = complex[2 * i]
    const im = complex[2 * i + 1]
    out[i] = re * re + im * im
  }
  return out
}
