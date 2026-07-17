import { describe, expect, it } from 'vitest'
import { analysis, biquad, convolve, fft, fir, onepole, resample, window } from '../index'

const f32 = (values: number[]) => new Float32Array(values)

const expectCloseArray = (actual: ArrayLike<number>, expected: ArrayLike<number>, digits = 6) => {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < actual.length; i++) expect(actual[i]).toBeCloseTo(expected[i], digits)
}

describe('window functions', () => {
  it('applies caller-owned windows in place', () => {
    const buf = f32([1, 2, 3, 4])
    const w = window.hann(4)
    const out = new Float32Array(4)
    expect(window.apply(buf, w, out)).toBe(out)
    expect(out[0]).toBeCloseTo(0)
    expect(out[1]).toBeCloseTo(1.5)
    expect(out[2]).toBeCloseTo(2.25)
    expect(out[3]).toBeCloseTo(0)
  })
})

describe('fft', () => {
  it('matches a hand-computed 4-point complex transform', () => {
    const buf = new Float64Array([
      1, 0,
      0, 0,
      -1, 0,
      0, 0,
    ])
    fft.fft(buf)
    expectCloseArray(buf, new Float64Array([
      0, 0,
      2, 0,
      0, 0,
      2, 0,
    ]), 12)
  })

  it('matches a hand-computed 8-point DC transform and validates plan sizes', () => {
    const buf = new Float64Array([
      1, 0,
      1, 0,
      1, 0,
      1, 0,
      1, 0,
      1, 0,
      1, 0,
      1, 0,
    ])
    fft.fftInto(buf, fft.plan(8))
    expect(buf[0]).toBeCloseTo(8, 12)
    for (let i = 1; i < 8; i++) {
      expect(buf[2 * i]).toBeCloseTo(0, 12)
      expect(buf[2 * i + 1]).toBeCloseTo(0, 12)
    }
    expect(() => fft.plan(6)).toThrow(RangeError)
  })

  it('round-trips rfft and irfft through the one-sided layout', () => {
    const input = f32([0, 1, 0, -1, 0, 1, 0, -1])
    const spectrum = fft.rfft(input)
    expect(spectrum.length).toBe(2 * (input.length / 2 + 1))
    const roundTrip = fft.irfft(spectrum, input.length)
    expectCloseArray(roundTrip, input, 6)
  })

  it('bin-wise helpers accept rfft one-sided buffers', () => {
    const spectrum = fft.rfft(f32([1, 0, -1, 0]))
    const magnitudes = new Float32Array(spectrum.length / 2)
    const phases = new Float32Array(spectrum.length / 2)
    const powers = new Float32Array(spectrum.length / 2)
    fft.magnitude(spectrum, magnitudes)
    fft.phase(spectrum, phases)
    fft.power(spectrum, powers)
    expect(magnitudes.length).toBe(3)
    expect(magnitudes[1]).toBeCloseTo(2)
    expect(phases[1]).toBeCloseTo(0)
    expect(powers[1]).toBeCloseTo(4)
  })
})

describe('filters', () => {
  it('designs RBJ low-pass coefficients from the cookbook fixture', () => {
    const coeffs = biquad.design({ kind: 'lowpass', freq: 1, q: 0.7071, sampleRate: 10 })
    expectCloseArray(coeffs, [
      0.0674550839587033,
      0.134910167917407,
      0.0674550839587033,
      -1.14297728430809,
      0.412797620142905,
    ], 12)
  })

  it('validates biquad design failure modes', () => {
    const valid = { kind: 'lowpass' as const, freq: 1000, q: 0.7071, sampleRate: 48000 }
    expect(() => biquad.design({ ...valid, sampleRate: 0 })).toThrow(RangeError)
    expect(() => biquad.design({ ...valid, freq: 0 })).toThrow(RangeError)
    expect(() => biquad.design({ ...valid, freq: 24000 })).toThrow(RangeError)
    expect(() => biquad.design({ ...valid, q: 0 })).toThrow(RangeError)
    expect(() => biquad.design({ ...valid, gainDb: Number.NaN })).toThrow(RangeError)
    expect(() => biquad.design({ ...valid, kind: 'missing' as never })).toThrow(RangeError)
  })

  it('matches a simple FIR-style impulse response to freqResponse', () => {
    const coeffs = [0.5, 0, 0, 0, 0] as const
    const impulse = f32([1, 0, 0, 0])
    const out = new Float32Array(impulse.length)
    biquad.process(impulse, coeffs, biquad.state(), out)
    expectCloseArray(out, f32([0.5, 0, 0, 0]), 6)

    const freqs = f32([0, 1000, 8000])
    const mag = new Float32Array(freqs.length)
    const phase = new Float32Array(freqs.length)
    biquad.freqResponse(coeffs, freqs, 48000, mag, phase)
    expectCloseArray(mag, f32([0.5, 0.5, 0.5]), 6)
  })

  it('processes biquad blocks with state carried through the curried form', () => {
    const coeffs = biquad.design({ kind: 'lowpass', freq: 4800, q: 0.7071, sampleRate: 48000 })
    const all = f32([1, 0, 0, 0, 0, 0])
    const allOut = new Float32Array(all.length)
    biquad.process(all, coeffs, biquad.state(), allOut)

    const state = biquad.state()
    const first = new Float32Array(3)
    const second = new Float32Array(3)
    const process = biquad.process(coeffs, state, first)
    process(all.subarray(0, 3))
    biquad.process(coeffs, state, second)(all.subarray(3))

    expectCloseArray(first, allOut.subarray(0, 3), 6)
    expectCloseArray(second, allOut.subarray(3), 6)
  })

  it('validates biquad response buffers and reset state length', () => {
    const coeffs = biquad.design({ kind: 'lowpass', freq: 1000, q: 0.7071, sampleRate: 48000 })
    const freqs = f32([0, 1000, 4000])
    const mag = new Float32Array(freqs.length)
    const phase = new Float32Array(freqs.length)
    biquad.freqResponse(coeffs, freqs, 48000, mag, phase)
    expect(mag[0]).toBeGreaterThan(0.99)

    const state = biquad.state()
    state.fill(1)
    biquad.reset(state)
    expect(Array.from(state)).toEqual([0, 0, 0, 0])
  })

  it('keeps one-pole state explicit', () => {
    const coeffs = onepole.lp(1000, 48000)
    const state = onepole.state()
    const out = new Float32Array(4)
    onepole.process(f32([1, 1, 1, 1]), coeffs, state, out)
    expect(out[0]).toBeGreaterThan(0)
    expect(state[0]).toBeCloseTo(out[3], 6)
  })

  it('implements one-pole high-pass as the low-pass complement', () => {
    const coeffs = onepole.hp(1000, 48000)
    const state = onepole.state()
    const out = new Float32Array(256)
    onepole.process(new Float32Array(256).fill(1), coeffs, state, out)
    expect(Math.abs(out[out.length - 1])).toBeLessThan(1e-6)
  })

  it('drains FIR history to match full convolution', () => {
    const signal = f32([1, 2, 3])
    const taps = f32([0.25, 0.5, 0.25])
    const state = fir.state(taps.length)
    const head = new Float32Array(signal.length)
    fir.process(signal, taps, state, head)
    const tail = new Float32Array(taps.length - 1)
    fir.process(new Float32Array(tail.length), taps, state, tail)

    const direct = convolve.direct(signal, taps)
    expectCloseArray(head, direct.subarray(0, signal.length), 6)
    expectCloseArray(tail, direct.subarray(signal.length), 6)
  })

  it('designs FIR low-pass and high-pass kernels with caller-owned history', () => {
    const lowpass = fir.design({ kind: 'lowpass', freq: 1000, sampleRate: 48000, taps: 7 })
    expect(lowpass.length).toBe(7)
    expect(Array.from(lowpass).reduce((acc, value) => acc + value, 0)).toBeCloseTo(1, 6)

    const highpass = fir.design({ kind: 'highpass', freq: 1000, sampleRate: 48000, taps: 7 })
    expect(highpass.length).toBe(7)
    expect(fir.state(highpass.length).length).toBe(6)
  })
})

describe('convolution', () => {
  const streamConvolution = (signal: Float32Array, kernel: Float32Array, blockSize: number): Float32Array => {
    const plan = convolve.plan(kernel, blockSize)
    const state = convolve.state(plan)
    const chunks: number[] = []
    let offset = 0
    while (offset + blockSize <= signal.length) {
      const block = signal.subarray(offset, offset + blockSize)
      const out = new Float32Array(blockSize)
      convolve.overlapAdd(block, plan, state, out)
      chunks.push(...out)
      offset += blockSize
    }
    if (offset < signal.length) {
      const block = new Float32Array(blockSize)
      block.set(signal.subarray(offset))
      const out = new Float32Array(blockSize)
      convolve.overlapAdd(block, plan, state, out)
      chunks.push(...out)
    }
    const tail = new Float32Array(plan.tailLength)
    convolve.flush(plan, state, tail)
    chunks.push(...tail)
    return new Float32Array(chunks).subarray(0, signal.length + kernel.length - 1)
  }

  it('matches direct convolution for exact block multiples', () => {
    const signal = f32([1, 2, 3, 4, 5, 6])
    const kernel = f32([0.5, -0.25, 0.125])
    expectCloseArray(streamConvolution(signal, kernel, 3), convolve.direct(signal, kernel), 5)

    const out = new Float32Array(signal.length + kernel.length - 1)
    expect(convolve.directInto(signal, kernel, out)).toBe(out)
    expectCloseArray(out, convolve.direct(signal, kernel), 6)
  })

  it('matches direct convolution for partial final blocks', () => {
    const signal = f32([1, -1, 2, -2, 3])
    const kernel = f32([1, 0.5, 0.25, 0.125])
    expectCloseArray(streamConvolution(signal, kernel, 4), convolve.direct(signal, kernel), 5)
  })

  it('keeps long-kernel overlap tails across state shifts', () => {
    const signal = f32([1, 0, -1, 0, 0.5, 0, -0.5, 0])
    const kernel = f32([1, 0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625, 0.0078125])
    expectCloseArray(streamConvolution(signal, kernel, 2), convolve.direct(signal, kernel), 5)
  })
})

describe('resampling', () => {
  it('resamples linearly into caller-owned output', () => {
    const input = f32([0, 10, 20])
    const out = new Float32Array(resample.outputLength(input.length, 2))
    expect(resample.linear(input, 2, out)).toBe(out)
    expectCloseArray(out, f32([0, 5, 10, 15, 20, 20]), 6)
  })

  it('runs windowed-sinc resampling without allocating output', () => {
    const input = f32([1, 1, 1, 1])
    const out = new Float32Array(resample.outputLength(input.length, 2))
    expect(resample.sinc(input, 2, { width: 4, window: 'hann', out })).toBe(out)
    for (const value of out) expect(value).toBeCloseTo(1, 6)
  })

  it('sizes linear and polyphase output by ratio', () => {
    expect(resample.outputLength(5, 0.5)).toBe(2)
    expect(resample.outputLength(5, 2)).toBe(10)
    expect(new Float32Array(resample.outputLength(5, 0.5)).length).toBe(2)

    const input = f32([1, 2, 3, 4, 5])
    const out = new Float32Array(resample.outputLength(input.length, 2))
    resample.polyphase(input, 2, 1, f32([1, 0, 0, 1]), out)
    expect(out.length).toBe(10)
  })

  it('treats only true identity taps as identity', () => {
    const input = f32([1, -2, 3, -4])
    const out = new Float32Array(input.length)
    resample.polyphase(input, 1, 1, f32([1]), out)
    expectCloseArray(out, input, 6)

    const filtered = new Float32Array(input.length)
    resample.polyphase(input, 1, 1, f32([0.5, 0.5]), filtered)
    expect(filtered[1]).not.toBe(input[1])
  })

  it('preserves DC only with per-phase normalized taps', () => {
    const input = new Float32Array(12)
    input.fill(3)
    const normalized = new Float32Array(24)
    for (let i = 0; i < normalized.length; i++) normalized[i] = 0.25
    const out = new Float32Array(Math.floor(input.length * 2 / 1))
    resample.polyphase(input, 2, 1, normalized, out)
    for (let i = normalized.length; i < out.length; i++) expect(out[i]).toBeCloseTo(3, 6)

    const counterexample = new Float32Array(Math.floor(input.length * 2))
    resample.polyphase(input, 2, 1, f32([2, 0]), counterexample)
    expect(counterexample[2]).toBeCloseTo(6)
    expect(counterexample[3]).toBeCloseTo(0)
  })

  it('checks a hand-computed polyphase fixture', () => {
    const input = f32([1, 2, 3])
    const taps = f32([1, 2, 3, 4, 5, 6, 7])
    const out = new Float32Array(Math.floor(input.length * 3 / 2))
    resample.polyphase(input, 3, 2, taps, out)
    expectCloseArray(out, f32([1, 3, 9, 18]), 6)
  })

  it('locks in one-shot chunking semantics', () => {
    const taps = f32([1])
    const first = new Float32Array(Math.floor(1 * 1 / 2))
    const second = new Float32Array(Math.floor(1 * 1 / 2))
    resample.polyphase(f32([1]), 1, 2, taps, first)
    resample.polyphase(f32([2]), 1, 2, taps, second)
    expect(first.length).toBe(0)
    expect(second.length).toBe(0)

    const together = new Float32Array(Math.floor(2 * 1 / 2))
    resample.polyphase(f32([1, 2]), 1, 2, taps, together)
    expect(together.length).toBe(1)
  })
})

describe('analysis', () => {
  it('uses explicit peak and zero-crossing conventions', () => {
    expect(analysis.rms(f32([3, 4]))).toBeCloseTo(Math.sqrt(12.5))
    expect(analysis.peak(f32([-2, 1, 0.5]))).toBe(2)
    expect(analysis.zeroCrossings(f32([1, 0, -1]))).toBe(0)
    expect(analysis.zeroCrossings(f32([1, -1]))).toBe(1)
  })

  it('validates analysis inputs', () => {
    expect(() => analysis.rms(new Float32Array())).toThrow(RangeError)
    expect(() => analysis.spectralCentroid({ magnitudes: new Float32Array(2), fftSize: 8, sampleRate: 48000 })).toThrow(RangeError)
    expect(() => analysis.spectralRolloff({ magnitudes: new Float32Array(5), fftSize: 8, sampleRate: 48000 }, 1)).toThrow(RangeError)
  })

  it('returns falsy spectral values for zero energy', () => {
    const spectrum = { magnitudes: new Float32Array(5), fftSize: 8, sampleRate: 48000 }
    expect(analysis.spectralCentroid(spectrum)).toBe(0)
    expect(analysis.spectralRolloff(spectrum, 0.85)).toBe(0)
    expect(analysis.spectralFlatness(spectrum)).toBe(0)
  })

  it('computes spectral descriptors from one-sided magnitudes', () => {
    const spectrum = analysis.spectrum(f32([0, 0, 2, 0, 0]), 8, 8000)
    expect(analysis.spectralCentroid(spectrum)).toBe(2000)
    expect(analysis.spectralRolloff(spectrum, 0.85)).toBe(2000)
    expect(analysis.spectralFlatness(spectrum)).toBe(0)
  })
})
