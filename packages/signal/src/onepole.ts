import type { OnePoleCoeffs, OnePoleState, Real } from './types'
import { assertPositiveFinite, assertSameLength, fail } from './validate'
import { dual } from './dual'

const coeff = (cutoff: number, sampleRate: number): OnePoleCoeffs => {
  assertPositiveFinite(sampleRate, 'sampleRate')
  if (!Number.isFinite(cutoff) || cutoff <= 0 || cutoff >= sampleRate / 2) {
    fail('cutoff must be finite and in (0, sampleRate / 2)')
  }
  const b = Math.exp((-2 * Math.PI * cutoff) / sampleRate)
  return [1 - b, b]
}

export function lp(cutoff: number, sampleRate: number): OnePoleCoeffs {
  return coeff(cutoff, sampleRate)
}

export function hp(cutoff: number, sampleRate: number): OnePoleCoeffs {
  const [a, b] = coeff(cutoff, sampleRate)
  // Negative alpha marks the high-pass complement while preserving the one-slot state contract.
  return [-a, b]
}

export function state(): OnePoleState {
  return new Float64Array(1)
}

export const process: {
  (buf: Real, coeffs: OnePoleCoeffs, state: OnePoleState, out: Real): Real
  (coeffs: OnePoleCoeffs, state: OnePoleState, out: Real): (buf: Real) => Real
} = dual(4, (buf: Real, coeffs: OnePoleCoeffs, state: OnePoleState, out: Real): Real => {
  assertSameLength(buf.length, out.length, 'buf', 'out')
  if (coeffs.length !== 2) fail('coeffs.length must equal 2')
  if (state.length !== 1) fail('state.length must equal 1')
  const [a, b] = coeffs
  let y = state[0]
  if (a >= 0) {
    for (let i = 0; i < buf.length; i++) {
      y = a * buf[i] + b * y
      out[i] = y
    }
  } else {
    const alpha = -a
    for (let i = 0; i < buf.length; i++) {
      y = alpha * buf[i] + b * y
      out[i] = buf[i] - y
    }
  }
  state[0] = y
  return out
})
