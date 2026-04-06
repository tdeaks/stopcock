import { bench, describe } from 'vitest'
import { FFT, Window, Filter, Analysis, Generate } from '@stopcock/signal'

// -- Pre-generate signals at different sizes (power of 2 for FFT) --

const sig256 = Generate.sine(440, 44100, 256 / 44100)
const sig1024 = Generate.sine(440, 44100, 1024 / 44100)
const sig4096 = Generate.sine(440, 44100, 4096 / 44100)
const sig16384 = Generate.sine(440, 44100, 16384 / 44100)

// Ensure exact power-of-2 lengths for FFT
const pad = (s: Float64Array, n: number) => {
  const out = new Float64Array(n)
  out.set(s.subarray(0, Math.min(s.length, n)))
  return out
}
const s256 = pad(sig256, 256)
const s1024 = pad(sig1024, 1024)
const s4096 = pad(sig4096, 4096)
const s16384 = pad(sig16384, 16384)

// -- Signal generation --

describe('Generate.sine', () => {
  bench('256 samples', () => Generate.sine(440, 44100, 256 / 44100))
  bench('1,024 samples', () => Generate.sine(440, 44100, 1024 / 44100))
  bench('4,096 samples', () => Generate.sine(440, 44100, 4096 / 44100))
  bench('16,384 samples', () => Generate.sine(440, 44100, 16384 / 44100))
})

describe('Generate.chirp', () => {
  bench('1,024 samples', () => Generate.chirp(200, 4000, 44100, 1024 / 44100))
  bench('16,384 samples', () => Generate.chirp(200, 4000, 44100, 16384 / 44100))
})

describe('Generate.noise', () => {
  bench('1,024 samples', () => Generate.noise(1024))
  bench('16,384 samples', () => Generate.noise(16384))
})

// -- FFT --

describe('FFT.fft', () => {
  bench('256', () => FFT.fft(s256))
  bench('1,024', () => FFT.fft(s1024))
  bench('4,096', () => FFT.fft(s4096))
  bench('16,384', () => FFT.fft(s16384))
})

const spec256 = FFT.fft(s256)
const spec1024 = FFT.fft(s1024)
const spec4096 = FFT.fft(s4096)

describe('FFT.ifft', () => {
  bench('256', () => FFT.ifft(spec256))
  bench('1,024', () => FFT.ifft(spec1024))
  bench('4,096', () => FFT.ifft(spec4096))
})

describe('FFT.magnitude', () => {
  bench('256', () => FFT.magnitude(spec256))
  bench('1,024', () => FFT.magnitude(spec1024))
  bench('4,096', () => FFT.magnitude(spec4096))
})

describe('FFT.powerSpectrum', () => {
  bench('256', () => FFT.powerSpectrum(s256))
  bench('1,024', () => FFT.powerSpectrum(s1024))
  bench('4,096', () => FFT.powerSpectrum(s4096))
})

// -- Windowing --

describe('Window.hann', () => {
  bench('256', () => Window.hann(256))
  bench('1,024', () => Window.hann(1024))
  bench('4,096', () => Window.hann(4096))
})

describe('Window.apply', () => {
  const w1024 = Window.hann(1024)
  const w4096 = Window.hann(4096)
  bench('1,024', () => Window.apply(s1024, w1024))
  bench('4,096', () => Window.apply(s4096, w4096))
})

// -- Filtering (includes FFT round-trip) --

describe('Filter.lowpass', () => {
  bench('256 @ 1kHz', () => Filter.lowpass(s256, 1000, 44100))
  bench('1,024 @ 1kHz', () => Filter.lowpass(s1024, 1000, 44100))
  bench('4,096 @ 1kHz', () => Filter.lowpass(s4096, 1000, 44100))
})

describe('Filter.bandpass', () => {
  bench('1,024 200-2kHz', () => Filter.bandpass(s1024, 200, 2000, 44100))
  bench('4,096 200-2kHz', () => Filter.bandpass(s4096, 200, 2000, 44100))
})

describe('Filter.convolve', () => {
  const kernel32 = new Float64Array(32).fill(1 / 32) // moving average
  const kernel128 = new Float64Array(128).fill(1 / 128)
  bench('1,024 * kernel32', () => Filter.convolve(s1024, kernel32))
  bench('4,096 * kernel32', () => Filter.convolve(s4096, kernel32))
  bench('4,096 * kernel128', () => Filter.convolve(s4096, kernel128))
})

// -- Analysis --

describe('Analysis.autocorrelation', () => {
  bench('256', () => Analysis.autocorrelation(s256))
  bench('1,024', () => Analysis.autocorrelation(s1024))
})

describe('Analysis.crossCorrelation', () => {
  bench('256 x 256', () => Analysis.crossCorrelation(s256, s256))
  bench('1,024 x 256', () => Analysis.crossCorrelation(s1024, s256))
})

describe('Analysis.energy + rms', () => {
  bench('energy 1,024', () => Analysis.energy(s1024))
  bench('energy 16,384', () => Analysis.energy(s16384))
  bench('rms 1,024', () => Analysis.rms(s1024))
  bench('rms 16,384', () => Analysis.rms(s16384))
})

describe('Analysis.zeroCrossings', () => {
  bench('1,024', () => Analysis.zeroCrossings(s1024))
  bench('16,384', () => Analysis.zeroCrossings(s16384))
})

describe('Analysis.peakDetect', () => {
  bench('1,024', () => Analysis.peakDetect(s1024))
  bench('16,384', () => Analysis.peakDetect(s16384))
})

