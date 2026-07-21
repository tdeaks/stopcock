export type Real = Float32Array
export type Complex = Float64Array

export type BiquadCoeffs = readonly [b0: number, b1: number, b2: number, a1: number, a2: number]
export type BiquadState = Float64Array

export type OnePoleCoeffs = readonly [a: number, b: number]
export type OnePoleState = Float64Array

export type Window = 'hann' | 'hamming' | 'blackman' | 'blackman-harris' | 'rect' | 'triangular'

export type FilterKind =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'notch'
  | 'peak'
  | 'lowshelf'
  | 'highshelf'
  | 'allpass'

export type FilterSpec = {
  kind: FilterKind
  freq: number
  q: number
  gainDb?: number
  sampleRate: number
}

export type FirKind = 'lowpass' | 'highpass' | 'bandpass' | 'notch'

export type FirSpec = {
  kind: FirKind
  freq: number
  bandwidth?: number
  sampleRate: number
  taps: number
  window?: Window
}

export type FftPlan = {
  readonly n: number
  readonly twiddles: Complex
  readonly bitrev: Uint32Array
  readonly scratch: Complex
}

export type ConvolvePlan = {
  readonly blockSize: number
  readonly kernelLength: number
  readonly tailLength: number
  readonly fftSize: number
  readonly fft: FftPlan
  readonly kernelSpectrum: Complex
  readonly input: Real
  readonly spectrum: Complex
  readonly time: Real
}

export type Spectrum = {
  magnitudes: Real
  fftSize: number
  sampleRate: number
}
