import { describe, expect, it } from 'vitest'
import { biquad } from '@stopcock/signal'
import {
  DEFAULT_PARAMS,
  MODEL_BIN_COUNT,
  MODEL_SAMPLE_RATE,
  PARAM_DEFS,
  TARGET_PRESETS,
  applyPaletteLens,
  biquadMagnitudeResponse,
  derivePalette,
  differentiableForward,
  forwardModel,
  lossFn,
  modelSpectrum,
  normalizeSpectrum,
  runOptimization,
  spectralBinFrequencies,
} from '../spectral-optimizer'

describe('spectral optimizer forward model', () => {
  it('matches signal.biquad.freqResponse for the modeled filter terms', () => {
    const freqs = spectralBinFrequencies({ binCount: 48 })
    const phase = new Float32Array(freqs.length)

    for (const spec of [
      { kind: 'highpass' as const, freq: 72, q: 0.7, gainDb: 0 },
      { kind: 'lowpass' as const, freq: 4200, q: 2.3, gainDb: 0 },
      { kind: 'peak' as const, freq: 1800, q: 1.4, gainDb: 2.2 },
    ]) {
      const expected = new Float32Array(freqs.length)
      const coeffs = biquad.design({ ...spec, sampleRate: MODEL_SAMPLE_RATE })
      biquad.freqResponse(coeffs, freqs, MODEL_SAMPLE_RATE, expected, phase)
      const actual = biquadMagnitudeResponse(spec.kind, spec.freq, spec.q, spec.gainDb, freqs)

      for (let i = 0; i < freqs.length; i++) {
        expect(actual[i]).toBeCloseTo(expected[i], 5)
      }
    }
  })

  it('matches autodiff gradients to central differences', () => {
    const params = [0.37, 0.41, 0.58, 0.63, 0.44, 0.27, 0.31, 0.53, 0.61]
    const target = TARGET_PRESETS.glassPluck.target
    const { gradient } = differentiableForward(params, target)
    const h = 1e-4

    for (const index of [0, 1, 2, 3, 4, 5, 7, 8]) {
      const lo = [...params]
      const hi = [...params]
      lo[index] -= h
      hi[index] += h
      const numerical = (differentiableForward(hi, target).value - differentiableForward(lo, target).value) / (2 * h)
      expect(gradient[index]).toBeCloseTo(numerical, Math.abs(numerical) > 1 ? 2 : 3)
    }
  })

  it('runs Adam against the honest forward model for the shipped presets', () => {
    for (const preset of [TARGET_PRESETS.warmBass, TARGET_PRESETS.glassPluck, TARGET_PRESETS.noisyComet]) {
      const run = runOptimization(preset.target, preset.params, { steps: 80, lrInit: 0.035, lrMin: 0.004 })
      expect(run.finalLoss).toBeLessThan(run.initialLoss)
      expect(run.frames).toHaveLength(81)
      expect(run.frames.at(-1)?.modelMag).toHaveLength(MODEL_BIN_COUNT)
      for (const value of run.finalParams) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })

  it('normalizes silent and oversized spectra safely', () => {
    expect(normalizeSpectrum(new Float32Array(16))).toEqual(Array.from({ length: 16 }, () => 0))
    expect(Math.max(...normalizeSpectrum([0, 2, 4, 1]))).toBe(1)
  })

  it('keeps displayed and high-resolution spectra bounded', () => {
    const display = modelSpectrum(DEFAULT_PARAMS)
    const model = forwardModel(DEFAULT_PARAMS)
    expect(display).toHaveLength(16)
    expect(model).toHaveLength(MODEL_BIN_COUNT)
    expect(Math.min(...display)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...display)).toBeLessThanOrEqual(1)
    expect(Math.min(...model)).toBeGreaterThanOrEqual(0)
    expect(lossFn(model, TARGET_PRESETS.glassPluck.target)).toBeGreaterThan(0)
  })

  it('derives a readable palette and CVD preview', () => {
    const model = modelSpectrum(DEFAULT_PARAMS)
    const palette = derivePalette(DEFAULT_PARAMS, model, lossFn(model, TARGET_PRESETS.glassPluck.target, { binCount: 16 }))
    const preview = applyPaletteLens(palette, 'deuteranopia')

    expect(palette.contrast).toBeGreaterThan(7)
    expect(preview.accent).toMatch(/^#[0-9a-f]{6}$/i)
    expect(preview.hot).toMatch(/^#[0-9a-f]{6}$/i)
    expect(PARAM_DEFS).toHaveLength(9)
  })
})
