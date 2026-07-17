import type { BiquadCoeffs, BiquadState, FilterKind, FilterSpec, Real } from './types'
import { assertFinite, assertPositiveFinite, assertSameLength, fail } from './validate'
import { dual } from './dual'

function assertKind(kind: string): asserts kind is FilterKind {
  if (
    kind !== 'lowpass'
    && kind !== 'highpass'
    && kind !== 'bandpass'
    && kind !== 'notch'
    && kind !== 'peak'
    && kind !== 'lowshelf'
    && kind !== 'highshelf'
    && kind !== 'allpass'
  ) {
    fail('kind must be a supported FilterKind')
  }
}

export function design(spec: FilterSpec): BiquadCoeffs {
  assertKind(spec.kind)
  assertPositiveFinite(spec.sampleRate, 'sampleRate')
  assertFinite(spec.freq, 'freq')
  if (spec.freq <= 0 || spec.freq >= spec.sampleRate / 2) fail('freq must be in (0, sampleRate / 2)')
  assertPositiveFinite(spec.q, 'q')
  const gainDb = spec.gainDb ?? 0
  assertFinite(gainDb, 'gainDb')

  const w0 = (2 * Math.PI * spec.freq) / spec.sampleRate
  const cos = Math.cos(w0)
  const sin = Math.sin(w0)
  const alpha = sin / (2 * spec.q)
  const a = Math.pow(10, gainDb / 40)
  let b0 = 1
  let b1 = 0
  let b2 = 0
  let a0 = 1
  let a1 = 0
  let a2 = 0

  switch (spec.kind) {
    case 'lowpass':
      b0 = (1 - cos) / 2
      b1 = 1 - cos
      b2 = (1 - cos) / 2
      a0 = 1 + alpha
      a1 = -2 * cos
      a2 = 1 - alpha
      break
    case 'highpass':
      b0 = (1 + cos) / 2
      b1 = -(1 + cos)
      b2 = (1 + cos) / 2
      a0 = 1 + alpha
      a1 = -2 * cos
      a2 = 1 - alpha
      break
    case 'bandpass':
      b0 = alpha
      b1 = 0
      b2 = -alpha
      a0 = 1 + alpha
      a1 = -2 * cos
      a2 = 1 - alpha
      break
    case 'notch':
      b0 = 1
      b1 = -2 * cos
      b2 = 1
      a0 = 1 + alpha
      a1 = -2 * cos
      a2 = 1 - alpha
      break
    case 'allpass':
      b0 = 1 - alpha
      b1 = -2 * cos
      b2 = 1 + alpha
      a0 = 1 + alpha
      a1 = -2 * cos
      a2 = 1 - alpha
      break
    case 'peak':
      b0 = 1 + alpha * a
      b1 = -2 * cos
      b2 = 1 - alpha * a
      a0 = 1 + alpha / a
      a1 = -2 * cos
      a2 = 1 - alpha / a
      break
    case 'lowshelf': {
      const sqrtA = Math.sqrt(a)
      const twoSqrtAAlpha = 2 * sqrtA * alpha
      b0 = a * ((a + 1) - (a - 1) * cos + twoSqrtAAlpha)
      b1 = 2 * a * ((a - 1) - (a + 1) * cos)
      b2 = a * ((a + 1) - (a - 1) * cos - twoSqrtAAlpha)
      a0 = (a + 1) + (a - 1) * cos + twoSqrtAAlpha
      a1 = -2 * ((a - 1) + (a + 1) * cos)
      a2 = (a + 1) + (a - 1) * cos - twoSqrtAAlpha
      break
    }
    case 'highshelf': {
      const sqrtA = Math.sqrt(a)
      const twoSqrtAAlpha = 2 * sqrtA * alpha
      b0 = a * ((a + 1) + (a - 1) * cos + twoSqrtAAlpha)
      b1 = -2 * a * ((a - 1) + (a + 1) * cos)
      b2 = a * ((a + 1) + (a - 1) * cos - twoSqrtAAlpha)
      a0 = (a + 1) - (a - 1) * cos + twoSqrtAAlpha
      a1 = 2 * ((a - 1) - (a + 1) * cos)
      a2 = (a + 1) - (a - 1) * cos - twoSqrtAAlpha
      break
    }
  }

  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]
}

export function state(): BiquadState {
  return new Float64Array(4)
}

export function reset(state: BiquadState): void {
  if (state.length !== 4) fail('state.length must equal 4')
  state.fill(0)
}

export const process: {
  (buf: Real, coeffs: BiquadCoeffs, state: BiquadState, out: Real): Real
  (coeffs: BiquadCoeffs, state: BiquadState, out: Real): (buf: Real) => Real
} = dual(4, (buf: Real, coeffs: BiquadCoeffs, state: BiquadState, out: Real): Real => {
  assertSameLength(buf.length, out.length, 'buf', 'out')
  if (coeffs.length !== 5) fail('coeffs.length must equal 5')
  if (state.length !== 4) fail('state.length must equal 4')
  let x1 = state[0]
  let x2 = state[1]
  let y1 = state[2]
  let y2 = state[3]
  const [b0, b1, b2, a1, a2] = coeffs

  for (let i = 0; i < buf.length; i++) {
    const x0 = buf[i]
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    out[i] = y0
    x2 = x1
    x1 = x0
    y2 = y1
    y1 = y0
  }

  state[0] = x1
  state[1] = x2
  state[2] = y1
  state[3] = y2
  return out
})

export function freqResponse(
  coeffs: BiquadCoeffs,
  freqs: Real,
  sampleRate: number,
  magOut: Real,
  phaseOut: Real,
): void {
  if (coeffs.length !== 5) fail('coeffs.length must equal 5')
  assertPositiveFinite(sampleRate, 'sampleRate')
  if (freqs.length !== magOut.length || freqs.length !== phaseOut.length) {
    fail('freqs.length must equal magOut.length and phaseOut.length')
  }

  const [b0, b1, b2, a1, a2] = coeffs
  for (let i = 0; i < freqs.length; i++) {
    const omega = (2 * Math.PI * freqs[i]) / sampleRate
    const c1 = Math.cos(omega)
    const s1 = Math.sin(omega)
    const c2 = Math.cos(2 * omega)
    const s2 = Math.sin(2 * omega)
    const nr = b0 + b1 * c1 + b2 * c2
    const ni = -b1 * s1 - b2 * s2
    const dr = 1 + a1 * c1 + a2 * c2
    const di = -a1 * s1 - a2 * s2
    const denom = dr * dr + di * di
    const hr = (nr * dr + ni * di) / denom
    const hi = (ni * dr - nr * di) / denom
    magOut[i] = Math.hypot(hr, hi)
    phaseOut[i] = Math.atan2(hi, hr)
  }
}
