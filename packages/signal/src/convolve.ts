import type { ConvolvePlan, Real } from './types'
import { plan as fftPlan, rfftInto, irfftInto } from './fft'
import { assertPositiveInteger, fail, nextPowerOfTwo } from './validate'

export function plan(kernel: Real, blockSize: number): ConvolvePlan {
  assertPositiveInteger(blockSize, 'blockSize')
  if (kernel.length < 1) fail('kernel.length must be >= 1')
  const kernelLength = kernel.length
  const tailLength = kernelLength - 1
  const fftSize = nextPowerOfTwo(blockSize + kernelLength - 1)
  const fft = fftPlan(fftSize)
  const input = new Float32Array(fftSize)
  const kernelSpectrum = new Float64Array(2 * (fftSize / 2 + 1))
  const spectrum = new Float64Array(2 * (fftSize / 2 + 1))
  const time = new Float32Array(fftSize)

  input.set(kernel)
  rfftInto(input, fft, kernelSpectrum)
  input.fill(0)

  return { blockSize, kernelLength, tailLength, fftSize, fft, kernelSpectrum, input, spectrum, time }
}

export function state(plan: ConvolvePlan): Real {
  return new Float32Array(plan.tailLength)
}

export function direct(signal: Real, kernel: Real): Real {
  if (kernel.length < 1) fail('kernel.length must be >= 1')
  const out = new Float32Array(signal.length + kernel.length - 1)
  return directInto(signal, kernel, out)
}

export function directInto(signal: Real, kernel: Real, out: Real): Real {
  if (kernel.length < 1) fail('kernel.length must be >= 1')
  if (out.length !== signal.length + kernel.length - 1) {
    fail('out.length must equal signal.length + kernel.length - 1')
  }
  out.fill(0)
  for (let i = 0; i < signal.length; i++) {
    const x = signal[i]
    for (let k = 0; k < kernel.length; k++) out[i + k] += x * kernel[k]
  }
  return out
}

export function overlapAdd(signal: Real, plan: ConvolvePlan, state: Real, out: Real): Real {
  if (signal.length !== plan.blockSize) fail('signal.length must equal plan.blockSize')
  if (out.length !== plan.blockSize) fail('out.length must equal plan.blockSize')
  if (state.length !== plan.tailLength) fail('state.length must equal plan.tailLength')

  plan.input.fill(0)
  plan.input.set(signal, 0)
  rfftInto(plan.input, plan.fft, plan.spectrum)
  for (let i = 0; i < plan.spectrum.length; i += 2) {
    const ar = plan.spectrum[i]
    const ai = plan.spectrum[i + 1]
    const br = plan.kernelSpectrum[i]
    const bi = plan.kernelSpectrum[i + 1]
    plan.spectrum[i] = ar * br - ai * bi
    plan.spectrum[i + 1] = ar * bi + ai * br
  }
  irfftInto(plan.spectrum, plan.fft, plan.time)

  for (let i = 0; i < plan.blockSize; i++) {
    out[i] = plan.time[i] + (i < plan.tailLength ? state[i] : 0)
  }

  for (let i = 0; i < plan.tailLength; i++) {
    const carried = i + plan.blockSize < plan.tailLength ? state[i + plan.blockSize] : 0
    state[i] = carried + plan.time[plan.blockSize + i]
  }

  return out
}

export function flush(plan: ConvolvePlan, state: Real, out: Real): Real {
  if (out.length !== plan.tailLength) fail('out.length must equal plan.tailLength')
  if (state.length !== plan.tailLength) fail('state.length must equal plan.tailLength')
  out.set(state)
  state.fill(0)
  return out
}
