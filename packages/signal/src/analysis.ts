import type { Real, Spectrum } from './types'
import { assertPositiveFinite, assertSpectrum, fail } from './validate'

const assertNonEmpty = (buf: Real): void => {
  if (buf.length < 1) fail('buf.length must be >= 1')
}

export function rms(buf: Real): number {
  assertNonEmpty(buf)
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  return Math.sqrt(sum / buf.length)
}

export function peak(buf: Real): number {
  assertNonEmpty(buf)
  let max = 0
  for (let i = 0; i < buf.length; i++) {
    const value = Math.abs(buf[i])
    if (value > max) max = value
  }
  return max
}

export function zeroCrossings(buf: Real): number {
  assertNonEmpty(buf)
  let count = 0
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] * buf[i + 1] < 0) count++
  }
  return count
}

const totalMagnitude = (magnitudes: Real): number => {
  let total = 0
  for (let i = 0; i < magnitudes.length; i++) total += magnitudes[i]
  return total
}

export function spectralCentroid(spectrum: Spectrum): number {
  assertSpectrum(spectrum)
  const total = totalMagnitude(spectrum.magnitudes)
  if (total === 0) return 0
  const binHz = spectrum.sampleRate / spectrum.fftSize
  let weighted = 0
  for (let i = 0; i < spectrum.magnitudes.length; i++) weighted += i * binHz * spectrum.magnitudes[i]
  return weighted / total
}

export function spectralFlatness(spectrum: Spectrum): number {
  assertSpectrum(spectrum)
  const total = totalMagnitude(spectrum.magnitudes)
  if (total === 0) return 0

  let logSum = 0
  for (let i = 0; i < spectrum.magnitudes.length; i++) {
    const mag = spectrum.magnitudes[i]
    if (mag <= 0) return 0
    logSum += Math.log(mag)
  }
  const geometric = Math.exp(logSum / spectrum.magnitudes.length)
  const arithmetic = total / spectrum.magnitudes.length
  return geometric / arithmetic
}

export function spectralRolloff(spectrum: Spectrum, percentile: number): number {
  assertSpectrum(spectrum)
  assertPositiveFinite(percentile, 'percentile')
  if (percentile <= 0 || percentile >= 1) fail('percentile must be in (0, 1)')
  const total = totalMagnitude(spectrum.magnitudes)
  if (total === 0) return 0

  const threshold = total * percentile
  let acc = 0
  for (let i = 0; i < spectrum.magnitudes.length; i++) {
    acc += spectrum.magnitudes[i]
    if (acc >= threshold) return i * (spectrum.sampleRate / spectrum.fftSize)
  }
  return (spectrum.magnitudes.length - 1) * (spectrum.sampleRate / spectrum.fftSize)
}

export function spectrum(magnitudes: Real, fftSize: number, sampleRate: number): Spectrum {
  const result = { magnitudes, fftSize, sampleRate }
  assertSpectrum(result)
  return result
}
