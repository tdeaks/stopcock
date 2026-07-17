import type { Complex, Spectrum, Window } from './types'

export const fail = (message: string): never => {
  throw new RangeError(message)
}

export const isPowerOfTwo = (n: number): boolean =>
  Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0

export const nextPowerOfTwo = (n: number): number => {
  if (!Number.isFinite(n) || n < 1) fail('size must be a positive finite number')
  let p = 1
  while (p < n) p *= 2
  return p
}

export const assertFinite = (value: number, name: string): void => {
  if (!Number.isFinite(value)) fail(`${name} must be finite`)
}

export const assertPositiveFinite = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value <= 0) fail(`${name} must be finite and > 0`)
}

export const assertPositiveInteger = (value: number, name: string): void => {
  if (!Number.isInteger(value) || value < 1) fail(`${name} must be a positive integer`)
}

export const assertPowerOfTwoSize = (n: number, name: string): void => {
  if (!Number.isInteger(n) || n < 2 || !isPowerOfTwo(n)) {
    fail(`${name} must be an integer power of two >= 2`)
  }
}

export const assertSameLength = (
  aLength: number,
  bLength: number,
  aName: string,
  bName: string,
): void => {
  if (aLength !== bLength) fail(`${aName}.length must equal ${bName}.length`)
}

export const assertWindow = (window: Window, name = 'window'): void => {
  if (
    window !== 'hann'
    && window !== 'hamming'
    && window !== 'blackman'
    && window !== 'blackman-harris'
    && window !== 'rect'
    && window !== 'triangular'
  ) {
    fail(`${name} must be a supported window`)
  }
}

export const fftSizeFromComplex = (buf: Complex, name: string): number => {
  if (buf.length % 2 !== 0) fail(`${name}.length must be even`)
  const n = buf.length / 2
  assertPowerOfTwoSize(n, `${name} complex size`)
  return n
}

export const assertSpectrum = (spectrum: Spectrum): void => {
  assertPowerOfTwoSize(spectrum.fftSize, 'spectrum.fftSize')
  assertPositiveFinite(spectrum.sampleRate, 'spectrum.sampleRate')
  if (spectrum.magnitudes.length !== spectrum.fftSize / 2 + 1) {
    fail('spectrum.magnitudes.length must equal spectrum.fftSize / 2 + 1')
  }
}
