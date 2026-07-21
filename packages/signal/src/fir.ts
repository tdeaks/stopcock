import type { FirKind, FirSpec, Real } from './types'
import {
  assertFinite,
  assertPositiveFinite,
  assertPositiveInteger,
  assertSameLength,
  assertWindow,
  fail,
} from './validate'
import { create as createWindow } from './window'
import { dual } from './dual'

const sinc = (x: number): number => {
  if (Math.abs(x) < 1e-12) return 1
  const pix = Math.PI * x
  return Math.sin(pix) / pix
}

function assertKind(kind: string): asserts kind is FirKind {
  if (kind !== 'lowpass' && kind !== 'highpass' && kind !== 'bandpass' && kind !== 'notch') {
    fail('kind must be a supported FirKind')
  }
}

const lowpassKernel = (tapCount: number, freq: number, sampleRate: number): Float64Array => {
  const out = new Float64Array(tapCount)
  const fc = freq / sampleRate
  const mid = (tapCount - 1) / 2
  for (let i = 0; i < tapCount; i++) {
    const m = i - mid
    out[i] = 2 * fc * sinc(2 * fc * m)
  }
  return out
}

const normalizeSum = (values: Float64Array, target: number): void => {
  let sum = 0
  for (const value of values) sum += value
  if (Math.abs(sum) < 1e-15) return
  const scale = target / sum
  for (let i = 0; i < values.length; i++) values[i] *= scale
}

export function design(spec: FirSpec): Real {
  assertKind(spec.kind)
  assertPositiveInteger(spec.taps, 'taps')
  if (spec.taps < 3) fail('taps must be >= 3')
  assertPositiveFinite(spec.sampleRate, 'sampleRate')
  assertFinite(spec.freq, 'freq')
  if (spec.freq <= 0 || spec.freq >= spec.sampleRate / 2)
    fail('freq must be in (0, sampleRate / 2)')
  const windowKind = spec.window ?? 'hann'
  assertWindow(windowKind)

  let coeffs: Float64Array
  const center = (spec.taps - 1) / 2
  if (spec.kind === 'lowpass') {
    coeffs = lowpassKernel(spec.taps, spec.freq, spec.sampleRate)
    normalizeSum(coeffs, 1)
  } else if (spec.kind === 'highpass') {
    coeffs = lowpassKernel(spec.taps, spec.freq, spec.sampleRate)
    normalizeSum(coeffs, 1)
    for (let i = 0; i < coeffs.length; i++) coeffs[i] = -coeffs[i]
    coeffs[Math.round(center)] += 1
  } else {
    assertPositiveFinite(spec.bandwidth ?? Number.NaN, 'bandwidth')
    const bandwidth = spec.bandwidth as number
    const lo = spec.freq - bandwidth / 2
    const hi = spec.freq + bandwidth / 2
    if (lo <= 0 || hi >= spec.sampleRate / 2) {
      fail('bandwidth must keep band edges in (0, sampleRate / 2)')
    }
    const hiKernel = lowpassKernel(spec.taps, hi, spec.sampleRate)
    const loKernel = lowpassKernel(spec.taps, lo, spec.sampleRate)
    coeffs = new Float64Array(spec.taps)
    for (let i = 0; i < coeffs.length; i++) coeffs[i] = hiKernel[i] - loKernel[i]
    if (spec.kind === 'notch') {
      for (let i = 0; i < coeffs.length; i++) coeffs[i] = -coeffs[i]
      coeffs[Math.round(center)] += 1
    }
  }

  const w = createWindow(windowKind, spec.taps)
  const out = new Float32Array(spec.taps)
  for (let i = 0; i < out.length; i++) out[i] = coeffs[i] * w[i]
  if (spec.kind === 'lowpass') {
    let sum = 0
    for (const value of out) sum += value
    if (Math.abs(sum) > 1e-15) {
      for (let i = 0; i < out.length; i++) out[i] /= sum
    }
  }
  return out
}

export function state(tapCount: number): Real {
  assertPositiveInteger(tapCount, 'tapCount')
  return new Float32Array(tapCount - 1)
}

export const process: {
  (buf: Real, taps: Real, state: Real, out: Real): Real
  (taps: Real, state: Real, out: Real): (buf: Real) => Real
} = dual(4, (buf: Real, taps: Real, state: Real, out: Real): Real => {
  assertSameLength(buf.length, out.length, 'buf', 'out')
  if (taps.length < 1) fail('taps.length must be >= 1')
  if (state.length !== taps.length - 1) fail('state.length must equal taps.length - 1')

  for (let i = 0; i < buf.length; i++) {
    let y = 0
    for (let k = 0; k < taps.length; k++) {
      const blockIndex = i - k
      const x = blockIndex >= 0 ? buf[blockIndex] : state[k - i - 1]
      y += taps[k] * x
    }
    out[i] = y
  }

  const historyLength = state.length
  for (let i = historyLength - 1; i >= 0; i--) {
    if (i < buf.length) state[i] = buf[buf.length - 1 - i]
    else state[i] = state[i - buf.length]
  }

  return out
})
