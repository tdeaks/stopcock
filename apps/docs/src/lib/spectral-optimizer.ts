import {
  abs,
  add,
  cos,
  differentiable,
  div,
  exp,
  log,
  mul,
  neg,
  pow,
  relu,
  sin,
  sqrt,
  square,
  sub,
  type Var,
} from '@stopcock/autodiff'
import {
  backward,
  gradOf,
  record,
  variable,
  withTape,
} from '@stopcock/autodiff/tape'
import {
  contrastRatio,
  fromHex,
  oklch,
  simulate,
  toHex,
  type CVDType,
} from '@stopcock/color'
import type { FilterKind } from '@stopcock/signal'

export const SPECTRAL_BIN_COUNT = 16
export const MODEL_BIN_COUNT = 64
export const MODEL_SAMPLE_RATE = 24_000
export const MODEL_MIN_HZ = 38
export const MODEL_MAX_HZ = 11_200

const EPS = 1e-6
const TWO_PI = Math.PI * 2
const PARAM_COUNT = 9
const FIXED_PARTIALS: ReadonlyArray<readonly [number, number]> = [
  [1, 0.72],
  [3, 0.72 / 9],
  [5, 0.72 / 25],
  [7, 0.72 / 49],
]

export type ParamKey =
  | 'pitch'
  | 'spread'
  | 'harmonics'
  | 'cutoff'
  | 'resonance'
  | 'noise'
  | 'drive'
  | 'decay'
  | 'width'

export type TargetPresetKey = 'warmBass' | 'glassPluck' | 'noisyComet' | 'custom'

export type LensKey = CVDType | 'none'

export type PatchSpec = {
  baseHz: number
  detune: number
  cutoff: number
  q: number
  harmonicGain: number
  noiseGain: number
  drive: number
  decay: number
  delay: number
  width: number
  pan: number
  tempo: number
}

export type OptimizationFrame = {
  params: number[]
  model: number[]
  modelMag: Float32Array
  loss: number
  gradNorm: number
}

export type OptimizationRun = {
  frames: OptimizationFrame[]
  finalParams: number[]
  initialLoss: number
  finalLoss: number
  durationMs: number
}

export type SpectralPalette = {
  bg: string
  fg: string
  accent: string
  hot: string
  cool: string
  muted: string
  contrast: number
}

export type ForwardModelOptions = {
  binCount?: number
  sampleRate?: number
  minHz?: number
  maxHz?: number
  freqs?: ArrayLike<number>
}

export type LossOptions = {
  binCount?: number
  sampleRate?: number
}

export type DifferentiableForwardResult = {
  value: number
  gradient: ArrayLike<number>
  modelMag: Float32Array
}

export const PARAM_DEFS: Array<{ key: ParamKey; label: string; min: number; max: number }> = [
  { key: 'pitch', label: 'Pitch', min: 0, max: 1 },
  { key: 'spread', label: 'Spread', min: 0, max: 1 },
  { key: 'harmonics', label: 'Harmonics', min: 0, max: 1 },
  { key: 'cutoff', label: 'Cutoff', min: 0, max: 1 },
  { key: 'resonance', label: 'Resonance', min: 0, max: 1 },
  { key: 'noise', label: 'Noise', min: 0, max: 1 },
  { key: 'drive', label: 'Drive', min: 0, max: 1 },
  { key: 'decay', label: 'Decay', min: 0, max: 1 },
  { key: 'width', label: 'Width', min: 0, max: 1 },
]

export const DEFAULT_PARAMS = Object.freeze([
  0.31,
  0.34,
  0.52,
  0.58,
  0.36,
  0.12,
  0.22,
  0.48,
  0.5,
])

export const TARGET_PRESETS: Record<TargetPresetKey, { label: string; target: number[]; params: number[] }> = {
  warmBass: {
    label: 'Warm Bass',
    target: normalizeSpectrum([1, 0.88, 0.62, 0.42, 0.25, 0.16, 0.1, 0.07, 0.04, 0.03, 0.02, 0.018, 0.012, 0.01, 0.008, 0.006]),
    params: [0.22, 0.28, 0.42, 0.42, 0.55, 0.08, 0.24, 0.68, 0.32],
  },
  glassPluck: {
    label: 'Glass Pluck',
    target: normalizeSpectrum([0.12, 0.24, 0.46, 0.72, 0.92, 0.68, 0.52, 0.36, 0.3, 0.24, 0.16, 0.12, 0.08, 0.05, 0.035, 0.02]),
    params: [0.42, 0.24, 0.74, 0.7, 0.34, 0.04, 0.08, 0.32, 0.7],
  },
  noisyComet: {
    label: 'Noisy Comet',
    target: normalizeSpectrum([0.06, 0.08, 0.1, 0.14, 0.22, 0.32, 0.46, 0.62, 0.78, 0.96, 0.82, 0.68, 0.55, 0.42, 0.3, 0.24]),
    params: [0.62, 0.62, 0.35, 0.86, 0.28, 0.58, 0.46, 0.22, 0.82],
  },
  custom: {
    label: 'Custom',
    target: normalizeSpectrum([0.2, 0.35, 0.52, 0.78, 0.6, 0.38, 0.28, 0.44, 0.72, 0.94, 0.62, 0.34, 0.22, 0.16, 0.11, 0.08]),
    params: [...DEFAULT_PARAMS],
  },
}

type BiquadCoeffs = readonly [number, number, number, number, number]
type VarCoeffs = readonly [Var<number>, Var<number>, Var<number>, Var<number>, Var<number>]
type LossTarget = {
  mag: Float32Array
  centroid: number
  flatness: number
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function sanitizeParams(params: ArrayLike<number>): number[] {
  return Array.from({ length: PARAM_DEFS.length }, (_, i) => clamp01(Number(params[i] ?? DEFAULT_PARAMS[i])))
}

export function normalizeSpectrum(values: ArrayLike<number>, binCount = SPECTRAL_BIN_COUNT): number[] {
  const input = Array.from({ length: binCount }, (_, i) => Math.max(0, Number(values[i] ?? 0)))
  const max = Math.max(...input)
  if (!Number.isFinite(max) || max <= EPS) return Array.from({ length: binCount }, () => 0)
  return input.map((value) => clamp01(value / max))
}

export function spectralBinFrequencies(opts: ForwardModelOptions = {}): Float32Array {
  const binCount = opts.binCount ?? MODEL_BIN_COUNT
  const sampleRate = opts.sampleRate ?? MODEL_SAMPLE_RATE
  const minHz = Math.max(1, opts.minHz ?? MODEL_MIN_HZ)
  const maxHz = Math.min(sampleRate / 2 - 1, opts.maxHz ?? MODEL_MAX_HZ)
  const out = new Float32Array(binCount)
  const lo = Math.log(minHz)
  const hi = Math.log(maxHz)
  for (let i = 0; i < binCount; i++) {
    const t = binCount === 1 ? 0 : i / (binCount - 1)
    out[i] = Math.exp(lo + (hi - lo) * t)
  }
  return out
}

export function paramsToPatch(params: ArrayLike<number>): PatchSpec {
  const p = sanitizeParams(params)
  return {
    baseHz: 58 * 2 ** (p[0] * 2.2),
    detune: -18 + p[8] * 42,
    cutoff: 360 + p[3] * 7600,
    q: 0.7 + p[4] * 6.2,
    harmonicGain: 0.08 + p[2] * 0.68,
    noiseGain: p[5] * 0.22,
    drive: p[6] * 0.58,
    decay: 0.11 + p[7] * 0.62,
    delay: 0.12 + p[8] * 0.48,
    width: p[8],
    pan: -0.32 + p[8] * 0.64,
    tempo: 94 + Math.round(p[0] * 62),
  }
}

export function biquadCoeffs(kind: FilterKind, freq: number, q: number, gainDb = 0, sampleRate = MODEL_SAMPLE_RATE): BiquadCoeffs {
  const safeFreq = Math.max(EPS, Math.min(sampleRate / 2 - EPS, freq))
  const safeQ = Math.max(EPS, q)
  const w0 = (TWO_PI * safeFreq) / sampleRate
  const c = Math.cos(w0)
  const s = Math.sin(w0)
  const alpha = s / (2 * safeQ)
  const a = Math.pow(10, gainDb / 40)
  let b0 = 1
  let b1 = 0
  let b2 = 0
  let a0 = 1
  let a1 = 0
  let a2 = 0

  switch (kind) {
    case 'lowpass':
      b0 = (1 - c) / 2
      b1 = 1 - c
      b2 = (1 - c) / 2
      a0 = 1 + alpha
      a1 = -2 * c
      a2 = 1 - alpha
      break
    case 'highpass':
      b0 = (1 + c) / 2
      b1 = -(1 + c)
      b2 = (1 + c) / 2
      a0 = 1 + alpha
      a1 = -2 * c
      a2 = 1 - alpha
      break
    case 'peak':
      b0 = 1 + alpha * a
      b1 = -2 * c
      b2 = 1 - alpha * a
      a0 = 1 + alpha / a
      a1 = -2 * c
      a2 = 1 - alpha / a
      break
    default:
      throw new Error(`Unsupported optimizer filter kind: ${kind}`)
  }

  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]
}

function biquadMagnitudeFromCoeffs(coeffs: BiquadCoeffs, freq: number, sampleRate = MODEL_SAMPLE_RATE): number {
  const [b0, b1, b2, a1, a2] = coeffs
  const omega = (TWO_PI * freq) / sampleRate
  const c1 = Math.cos(omega)
  const s1 = Math.sin(omega)
  const c2 = Math.cos(2 * omega)
  const s2 = Math.sin(2 * omega)
  const nr = b0 + b1 * c1 + b2 * c2
  const ni = -b1 * s1 - b2 * s2
  const dr = 1 + a1 * c1 + a2 * c2
  const di = -a1 * s1 - a2 * s2
  return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di))
}

export function biquadMagnitudeResponse(
  kind: FilterKind,
  freq: number,
  q: number,
  gainDb: number,
  freqs: ArrayLike<number>,
  sampleRate = MODEL_SAMPLE_RATE,
): Float32Array {
  const coeffs = biquadCoeffs(kind, freq, q, gainDb, sampleRate)
  const out = new Float32Array(freqs.length)
  for (let i = 0; i < freqs.length; i++) out[i] = biquadMagnitudeFromCoeffs(coeffs, Number(freqs[i]), sampleRate)
  return out
}

function normalizeMean(values: Float32Array): Float32Array {
  let sum = 0
  for (const value of values) sum += Math.max(0, value)
  const scale = values.length / Math.max(EPS, sum)
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = Math.max(0, values[i]) * scale
  return out
}

export function resampleSpectrum(values: ArrayLike<number>, binCount: number): Float32Array {
  const out = new Float32Array(binCount)
  if (values.length === 0) return out
  if (values.length === 1) {
    out.fill(Number(values[0]) || 0)
    return out
  }

  for (let i = 0; i < binCount; i++) {
    const x = (i / Math.max(1, binCount - 1)) * (values.length - 1)
    const lo = Math.floor(x)
    const hi = Math.min(values.length - 1, lo + 1)
    const t = x - lo
    out[i] = (Number(values[lo] ?? 0) * (1 - t)) + (Number(values[hi] ?? 0) * t)
  }
  return out
}

function statsFor(mag: ArrayLike<number>, freqs: ArrayLike<number> = spectralBinFrequencies({ binCount: mag.length })): { centroid: number; flatness: number } {
  let energy = 0
  let weighted = 0
  let logSum = 0
  let arith = 0
  for (let i = 0; i < mag.length; i++) {
    const value = Math.max(EPS, Number(mag[i] ?? 0))
    energy += value
    weighted += value * Number(freqs[i] ?? i + 1)
    logSum += Math.log(value)
    arith += value
  }
  const nyquist = MODEL_SAMPLE_RATE / 2
  return {
    centroid: energy <= EPS ? 0 : (weighted / energy) / nyquist,
    flatness: Math.exp(logSum / mag.length) / Math.max(EPS, arith / mag.length),
  }
}

function prepareTarget(target: ArrayLike<number>, binCount = MODEL_BIN_COUNT): LossTarget {
  const mag = normalizeMean(resampleSpectrum(target, binCount))
  const freqs = spectralBinFrequencies({ binCount })
  const { centroid, flatness } = statsFor(mag, freqs)
  return { mag, centroid, flatness }
}

function biquadDerivativeCoeffs(kind: FilterKind, freq: number, q: number, gainDb: number, sampleRate: number) {
  const freqStep = Math.max(0.02, Math.abs(freq) * 1e-4)
  const qStep = Math.max(1e-4, Math.abs(q) * 1e-4)
  return {
    freqStep,
    qStep,
    freqLo: biquadCoeffs(kind, freq - freqStep, q, gainDb, sampleRate),
    freqHi: biquadCoeffs(kind, freq + freqStep, q, gainDb, sampleRate),
    qLo: biquadCoeffs(kind, freq, q - qStep, gainDb, sampleRate),
    qHi: biquadCoeffs(kind, freq, q + qStep, gainDb, sampleRate),
  }
}

function spectralLossValueAndGradient(params: ArrayLike<number>, target: LossTarget): DifferentiableForwardResult {
  const p = new Float64Array(PARAM_COUNT)
  for (let i = 0; i < PARAM_COUNT; i++) p[i] = clamp01(Number(params[i] ?? DEFAULT_PARAMS[i]))

  const baseHz = 58 * 2 ** (p[0] * 2.2)
  const dBase0 = baseHz * Math.LN2 * 2.2
  const cutoff = 360 + p[3] * 7600
  const q = 0.7 + p[4] * 6.2
  const harmonicGain = 0.08 + p[2] * 0.68
  const noiseGain = p[5] * 0.22
  const drive = p[6] * 0.58
  const decay = 0.11 + p[7] * 0.62
  const width = p[8]
  const hpFreq = 42 + baseHz * 0.22
  const peakFreq = Math.max(240, cutoff * 0.42)
  const peakFreqActive = cutoff * 0.42 > 240
  const peakQ = 0.9 + q * 0.18
  const hp = biquadCoeffs('highpass', hpFreq, 0.7)
  const lp = biquadCoeffs('lowpass', cutoff, q)
  const peak = biquadCoeffs('peak', peakFreq, peakQ, 2.2)
  const hpDeriv = biquadDerivativeCoeffs('highpass', hpFreq, 0.7, 0, MODEL_SAMPLE_RATE)
  const lpDeriv = biquadDerivativeCoeffs('lowpass', cutoff, q, 0, MODEL_SAMPLE_RATE)
  const peakDeriv = biquadDerivativeCoeffs('peak', peakFreq, peakQ, 2.2, MODEL_SAMPLE_RATE)
  const harmonicTilt = 0.72 + p[1] * 1.85
  const raw = new Float64Array(MODEL_BIN_COUNT)
  const rawJac = new Float64Array(MODEL_BIN_COUNT * PARAM_COUNT)
  const rawSumGrad = new Float64Array(PARAM_COUNT)
  const model = new Float64Array(MODEL_BIN_COUNT)
  const modelJac = new Float64Array(MODEL_BIN_COUNT * PARAM_COUNT)
  const modelMag = new Float32Array(MODEL_BIN_COUNT)
  const freqs = diffFreqs
  const nyquist = MODEL_SAMPLE_RATE / 2
  let rawSum = 0

  for (let i = 0; i < MODEL_BIN_COUNT; i++) {
    const freq = freqs[i]
    const bandwidth = 34 + p[8] * 92 + p[1] * 42 + freq * (0.028 + p[8] * 0.026)
    const invBandwidthSq = 1 / (bandwidth * bandwidth)
    const dBandwidth1 = 42
    const dBandwidth8 = 92 + freq * 0.026
    let partials = 0
    let s0 = 0
    let s1 = 0
    let s2 = 0
    let s5 = 0
    let s6 = 0
    let s8 = 0

    const addPartial = (ratio: number, amp: number, amp1 = 0, amp2 = 0) => {
      const delta = freq - baseHz * ratio
      const absDelta = Math.abs(delta)
      if (absDelta >= bandwidth) return
      const proximity = 1 - absDelta / bandwidth
      const sign = delta > 0 ? 1 : delta < 0 ? -1 : 0
      const dAbs0 = sign * -ratio * dBase0
      const dProx0 = -(dAbs0 * bandwidth) * invBandwidthSq
      const dProx1 = absDelta * dBandwidth1 * invBandwidthSq
      const dProx8 = absDelta * dBandwidth8 * invBandwidthSq
      partials += amp * proximity
      s0 += amp * dProx0
      s1 += amp1 * proximity + amp * dProx1
      s2 += amp2 * proximity
      s8 += amp * dProx8
    }

    for (const [ratio, amp] of FIXED_PARTIALS) addPartial(ratio, amp)
    addPartial(2.01, harmonicGain, 0, 0.68)
    for (let n = 1; n <= 10; n++) {
      const tiltScale = n ** -harmonicTilt
      const amp = harmonicGain * 0.48 * tiltScale
      const amp1 = n === 1 ? 0 : amp * -Math.log(n) * 1.85
      const amp2 = 0.68 * 0.48 * tiltScale
      addPartial(0.5 * n, amp, amp1, amp2)
    }

    const pink = Math.sqrt(baseHz / Math.max(MODEL_MIN_HZ, freq))
    const noiseShape = 0.42 + (freq / nyquist) * 0.72
    const noiseFloor = noiseGain * pink * noiseShape
    s0 += noiseGain * noiseShape * (0.5 * pink / baseHz) * dBase0
    s5 += 0.22 * pink * noiseShape

    const driveShape = 0.13 * (freq / nyquist) ** 1.35
    const driveEdge = drive * driveShape
    s6 += 0.58 * driveShape

    const hpMag = biquadMagnitudeFromCoeffs(hp, freq)
    const lpMag = biquadMagnitudeFromCoeffs(lp, freq)
    const peakMag = biquadMagnitudeFromCoeffs(peak, freq)
    const filterMag = hpMag * lpMag * peakMag
    const hpFreqGrad = (biquadMagnitudeFromCoeffs(hpDeriv.freqHi, freq) - biquadMagnitudeFromCoeffs(hpDeriv.freqLo, freq)) / (2 * hpDeriv.freqStep)
    const lpFreqGrad = (biquadMagnitudeFromCoeffs(lpDeriv.freqHi, freq) - biquadMagnitudeFromCoeffs(lpDeriv.freqLo, freq)) / (2 * lpDeriv.freqStep)
    const lpQGrad = (biquadMagnitudeFromCoeffs(lpDeriv.qHi, freq) - biquadMagnitudeFromCoeffs(lpDeriv.qLo, freq)) / (2 * lpDeriv.qStep)
    const peakFreqGrad = (biquadMagnitudeFromCoeffs(peakDeriv.freqHi, freq) - biquadMagnitudeFromCoeffs(peakDeriv.freqLo, freq)) / (2 * peakDeriv.freqStep)
    const peakQGrad = (biquadMagnitudeFromCoeffs(peakDeriv.qHi, freq) - biquadMagnitudeFromCoeffs(peakDeriv.qLo, freq)) / (2 * peakDeriv.qStep)
    const f0 = hpFreqGrad * 0.22 * dBase0 * lpMag * peakMag
    const f3 = hpMag * (lpFreqGrad * 7600 * peakMag + lpMag * peakFreqGrad * (peakFreqActive ? 3192 : 0))
    const f4 = hpMag * (lpQGrad * 6.2 * peakMag + lpMag * peakQGrad * 1.116)

    const sustain = 0.16 + width * 0.16
    const envExp = Math.exp(-decay * 5.4 * freq / nyquist)
    const env = sustain + (1 - sustain) * envExp
    const env7 = (1 - sustain) * envExp * (-5.4 * freq / nyquist) * 0.62
    const env8 = 0.16 * (1 - envExp)
    const source = partials + noiseFloor + driveEdge
    const value = source * filterMag * env
    raw[i] = value
    rawSum += value

    const offset = i * PARAM_COUNT
    rawJac[offset] += s0 * filterMag * env + source * f0 * env
    rawJac[offset + 1] += s1 * filterMag * env
    rawJac[offset + 2] += s2 * filterMag * env
    rawJac[offset + 3] += source * f3 * env
    rawJac[offset + 4] += source * f4 * env
    rawJac[offset + 5] += s5 * filterMag * env
    rawJac[offset + 6] += s6 * filterMag * env
    rawJac[offset + 7] += source * filterMag * env7
    rawJac[offset + 8] += s8 * filterMag * env + source * filterMag * env8
    for (let j = 0; j < PARAM_COUNT; j++) rawSumGrad[j] += rawJac[offset + j]
  }

  const safeSum = Math.max(EPS, rawSum)
  const scale = MODEL_BIN_COUNT / safeSum
  const scaleDenom = MODEL_BIN_COUNT / (safeSum * safeSum)
  for (let i = 0; i < MODEL_BIN_COUNT; i++) {
    const offset = i * PARAM_COUNT
    const value = raw[i] * scale
    model[i] = value
    modelMag[i] = value
    for (let j = 0; j < PARAM_COUNT; j++) {
      modelJac[offset + j] = rawJac[offset + j] * scale - raw[i] * rawSumGrad[j] * scaleDenom
    }
  }

  const modelAdjoint = new Float64Array(MODEL_BIN_COUNT)
  let magLoss = 0
  for (const stride of [1, 2, 4]) {
    const groups = Math.ceil(MODEL_BIN_COUNT / stride)
    for (let group = 0; group < groups; group++) {
      let modelGroup = 0
      let targetGroup = 0
      let count = 0
      for (let j = 0; j < stride; j++) {
        const index = group * stride + j
        if (index >= MODEL_BIN_COUNT) break
        modelGroup += model[index]
        targetGroup += target.mag[index]
        count++
      }
      const modelAvg = modelGroup / count
      const targetAvg = targetGroup / count
      const delta = Math.log(EPS + modelAvg) - Math.log(EPS + targetAvg)
      magLoss += Math.abs(delta) / groups
      const adjoint = Math.sign(delta) / ((EPS + modelAvg) * count * groups * 3)
      for (let j = 0; j < stride; j++) {
        const index = group * stride + j
        if (index >= MODEL_BIN_COUNT) break
        modelAdjoint[index] += adjoint
      }
    }
  }
  magLoss /= 3

  let energy = 0
  let weighted = 0
  let logSum = 0
  let arith = 0
  for (let i = 0; i < MODEL_BIN_COUNT; i++) {
    const value = Math.max(EPS, model[i])
    energy += value
    weighted += value * freqs[i]
    logSum += Math.log(value)
    arith += value
  }

  const centroid = energy <= EPS ? 0 : (weighted / energy) / nyquist
  const flatness = Math.exp(logSum / MODEL_BIN_COUNT) / Math.max(EPS, arith / MODEL_BIN_COUNT)
  const centroidDelta = centroid - target.centroid
  const flatnessDelta = flatness - target.flatness
  const centroidLoss = centroidDelta * centroidDelta
  const flatnessLoss = flatnessDelta * flatnessDelta
  const centroidScale = 0.2 * centroidDelta / nyquist
  const flatnessScale = 0.1 * flatnessDelta * flatness

  for (let i = 0; i < MODEL_BIN_COUNT; i++) {
    const value = Math.max(EPS, model[i])
    modelAdjoint[i] += centroidScale * ((freqs[i] * energy - weighted) / (energy * energy))
    modelAdjoint[i] += value <= EPS ? 0 : flatnessScale * ((1 / (MODEL_BIN_COUNT * value)) - (1 / arith))
  }

  const gradient = new Float64Array(PARAM_COUNT)
  for (let i = 0; i < MODEL_BIN_COUNT; i++) {
    const offset = i * PARAM_COUNT
    const adjoint = modelAdjoint[i]
    for (let j = 0; j < PARAM_COUNT; j++) gradient[j] += adjoint * modelJac[offset + j]
  }

  return {
    value: magLoss + centroidLoss * 0.1 + flatnessLoss * 0.05,
    gradient,
    modelMag,
  }
}

export function createSpectralObjective(target: ArrayLike<number>) {
  const preparedTarget = prepareTarget(target, MODEL_BIN_COUNT)
  return {
    valueAndGradient(params: ArrayLike<number>): DifferentiableForwardResult {
      const input = new Float64Array(PARAM_COUNT)
      for (let i = 0; i < PARAM_COUNT; i++) input[i] = clamp01(Number(params[i] ?? DEFAULT_PARAMS[i]))
      return withTape((tape) => {
        const paramVar = variable(input)
        const result = spectralLossValueAndGradient(paramVar.value, preparedTarget)
        const output = record(result.value, [paramVar], (grad) => {
          const out = new Float64Array(PARAM_COUNT)
          for (let i = 0; i < PARAM_COUNT; i++) out[i] = result.gradient[i] * grad
          return [out]
        })
        backward(output, tape)
        return {
          value: output.value,
          gradient: gradOf(paramVar, tape),
          modelMag: result.modelMag,
        }
      })
    },
  }
}

export function forwardModel(params: ArrayLike<number>, opts: ForwardModelOptions = {}): Float32Array {
  const p = sanitizeParams(params)
  const spec = paramsToPatch(p)
  const freqs = opts.freqs ?? spectralBinFrequencies(opts)
  const sampleRate = opts.sampleRate ?? MODEL_SAMPLE_RATE
  const nyquist = sampleRate / 2
  const hp = biquadCoeffs('highpass', 42 + spec.baseHz * 0.22, 0.7, 0, sampleRate)
  const lp = biquadCoeffs('lowpass', spec.cutoff, spec.q, 0, sampleRate)
  const peak = biquadCoeffs('peak', Math.max(240, spec.cutoff * 0.42), 0.9 + spec.q * 0.18, 2.2, sampleRate)
  const harmonicTilt = 0.72 + p[1] * 1.85
  const kernelBase = 34 + p[8] * 92 + p[1] * 42
  const raw = new Float32Array(freqs.length)

  for (let i = 0; i < freqs.length; i++) {
    const freq = freqs[i]
    const filterMag = biquadMagnitudeFromCoeffs(hp, freq, sampleRate)
      * biquadMagnitudeFromCoeffs(lp, freq, sampleRate)
      * biquadMagnitudeFromCoeffs(peak, freq, sampleRate)
    const bandwidth = kernelBase + freq * (0.028 + p[8] * 0.026)
    let partials = 0

    for (const [ratio, baseAmp] of FIXED_PARTIALS) {
      const partialFreq = spec.baseHz * ratio
      const proximity = Math.max(0, 1 - Math.abs(freq - partialFreq) / bandwidth)
      partials += baseAmp * proximity
    }
    partials += spec.harmonicGain * Math.max(0, 1 - Math.abs(freq - spec.baseHz * 2.01) / bandwidth)
    for (let n = 1; n <= 10; n++) {
      const partialFreq = spec.baseHz * 0.5 * n
      const proximity = Math.max(0, 1 - Math.abs(freq - partialFreq) / bandwidth)
      partials += (spec.harmonicGain * 0.48 / n ** harmonicTilt) * proximity
    }

    const pink = Math.sqrt(Math.max(MODEL_MIN_HZ, spec.baseHz) / Math.max(MODEL_MIN_HZ, freq))
    const noiseFloor = spec.noiseGain * pink * (0.42 + (freq / nyquist) * 0.72)
    const driveEdge = spec.drive * 0.13 * (freq / nyquist) ** 1.35
    const sustain = 0.16 + spec.width * 0.16
    const envWeight = sustain + (1 - sustain) * Math.exp(-spec.decay * 5.4 * freq / nyquist)
    raw[i] = (partials + noiseFloor + driveEdge) * filterMag * envWeight
  }

  return normalizeMean(raw)
}

export function modelSpectrum(params: ArrayLike<number>, binCount = SPECTRAL_BIN_COUNT): number[] {
  return normalizeSpectrum(forwardModel(params, { binCount }), binCount)
}

export function spectralMse(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let total = 0
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const delta = Number(a[i] ?? 0) - Number(b[i] ?? 0)
    total += delta * delta
  }
  return total / Math.max(1, length)
}

export function lossFn(modelMag: ArrayLike<number>, targetMag: ArrayLike<number>, opts: LossOptions = {}): number {
  const binCount = opts.binCount ?? modelMag.length
  const model = normalizeMean(resampleSpectrum(modelMag, binCount))
  const target = prepareTarget(targetMag, binCount)
  const freqs = spectralBinFrequencies({ binCount, sampleRate: opts.sampleRate })
  let magLoss = 0

  for (const stride of [1, 2, 4]) {
    const groups = Math.ceil(binCount / stride)
    for (let group = 0; group < groups; group++) {
      let modelGroup = 0
      let targetGroup = 0
      let count = 0
      for (let j = 0; j < stride; j++) {
        const index = group * stride + j
        if (index >= binCount) break
        modelGroup += model[index]
        targetGroup += target.mag[index]
        count++
      }
      magLoss += Math.abs(Math.log(EPS + modelGroup / count) - Math.log(EPS + targetGroup / count)) / groups
    }
  }

  const modelStats = statsFor(model, freqs)
  const centroidLoss = (modelStats.centroid - target.centroid) ** 2
  const flatnessLoss = (modelStats.flatness - target.flatness) ** 2
  return magLoss / 3 + centroidLoss * 0.1 + flatnessLoss * 0.05
}

function adMax(a: number, b: Var<number>): Var<number> {
  return add(a, relu(sub(b, a)))
}

function adBiquadCoeffs(kind: 'highpass' | 'lowpass' | 'peak', freq: Var<number>, q: Var<number>, gainDb = 0, sampleRate = MODEL_SAMPLE_RATE): VarCoeffs {
  const w0 = div(mul(TWO_PI, freq), sampleRate)
  const c = cos(w0)
  const s = sin(w0)
  const alpha = div(s, mul(2, q))
  const a = pow(10, gainDb / 40)
  let b0: Var<number> | number = 1
  let b1: Var<number> | number = 0
  let b2: Var<number> | number = 0
  let a0: Var<number> | number = 1
  let a1: Var<number> | number = 0
  let a2: Var<number> | number = 0

  if (kind === 'lowpass') {
    b0 = div(sub(1, c), 2)
    b1 = sub(1, c)
    b2 = div(sub(1, c), 2)
    a0 = add(1, alpha)
    a1 = mul(-2, c)
    a2 = sub(1, alpha)
  } else if (kind === 'highpass') {
    b0 = div(add(1, c), 2)
    b1 = neg(add(1, c))
    b2 = div(add(1, c), 2)
    a0 = add(1, alpha)
    a1 = mul(-2, c)
    a2 = sub(1, alpha)
  } else {
    b0 = add(1, mul(alpha, a))
    b1 = mul(-2, c)
    b2 = sub(1, mul(alpha, a))
    a0 = add(1, div(alpha, a))
    a1 = mul(-2, c)
    a2 = sub(1, div(alpha, a))
  }

  return [
    div(b0, a0),
    div(b1, a0),
    div(b2, a0),
    div(a1, a0),
    div(a2, a0),
  ]
}

function adBiquadMagnitude(coeffs: VarCoeffs, freq: number, sampleRate = MODEL_SAMPLE_RATE): Var<number> {
  const [b0, b1, b2, a1, a2] = coeffs
  const omega = (TWO_PI * freq) / sampleRate
  const c1 = Math.cos(omega)
  const s1 = Math.sin(omega)
  const c2 = Math.cos(2 * omega)
  const s2 = Math.sin(2 * omega)
  const nr = add(add(b0, mul(b1, c1)), mul(b2, c2))
  const ni = sub(mul(b2, -s2), mul(b1, s1))
  const dr = add(add(1, mul(a1, c1)), mul(a2, c2))
  const di = sub(mul(a2, -s2), mul(a1, s1))
  return sqrt(div(add(square(nr), square(ni)), add(EPS, add(square(dr), square(di)))))
}

let diffTarget = prepareTarget(TARGET_PRESETS.glassPluck.target)
const diffFreqs = spectralBinFrequencies({ binCount: MODEL_BIN_COUNT })

const differentiableLoss = differentiable((
  pitch: Var<number>,
  spread: Var<number>,
  harmonics: Var<number>,
  cutoffParam: Var<number>,
  resonance: Var<number>,
  noiseParam: Var<number>,
  driveParam: Var<number>,
  decayParam: Var<number>,
  widthParam: Var<number>,
) => {
  const baseHz = mul(58, pow(2, mul(pitch, 2.2)))
  const cutoff = add(360, mul(cutoffParam, 7600))
  const q = add(0.7, mul(resonance, 6.2))
  const harmonicGain = add(0.08, mul(harmonics, 0.68))
  const noiseGain = mul(noiseParam, 0.22)
  const drive = mul(driveParam, 0.58)
  const decay = add(0.11, mul(decayParam, 0.62))
  const hp = adBiquadCoeffs('highpass', add(42, mul(baseHz, 0.22)), 0.7 as unknown as Var<number>)
  const lp = adBiquadCoeffs('lowpass', cutoff, q)
  const peak = adBiquadCoeffs('peak', adMax(240, mul(cutoff, 0.42)), add(0.9, mul(q, 0.18)), 2.2)
  const tilt = add(0.72, mul(spread, 1.85))
  const kernelBase = add(34, add(mul(widthParam, 92), mul(spread, 42)))
  const nyquist = MODEL_SAMPLE_RATE / 2
  const raw: Var<number>[] = []
  let rawSum = mul(0, pitch)

  for (let i = 0; i < MODEL_BIN_COUNT; i++) {
    const freq = diffFreqs[i]
    const filterMag = mul(
      mul(adBiquadMagnitude(hp, freq), adBiquadMagnitude(lp, freq)),
      adBiquadMagnitude(peak, freq),
    )
    const bandwidth = add(kernelBase, mul(freq * 0.028, add(1, mul(widthParam, 0.93))))
    let partials = mul(0, pitch)

    for (const [ratio, amp] of [
      [1, 0.72],
      [3, 0.72 / 9],
      [5, 0.72 / 25],
      [7, 0.72 / 49],
    ] as const) {
      const proximity = relu(sub(1, div(abs(sub(freq, mul(baseHz, ratio))), bandwidth)))
      partials = add(partials, mul(amp, proximity))
    }

    const sinePartial = relu(sub(1, div(abs(sub(freq, mul(baseHz, 2.01))), bandwidth)))
    partials = add(partials, mul(harmonicGain, sinePartial))

    for (let n = 1; n <= 10; n++) {
      const proximity = relu(sub(1, div(abs(sub(freq, mul(baseHz, 0.5 * n))), bandwidth)))
      const amp = div(mul(harmonicGain, 0.48), pow(n, tilt))
      partials = add(partials, mul(amp, proximity))
    }

    const pink = sqrt(div(baseHz, Math.max(MODEL_MIN_HZ, freq)))
    const noiseFloor = mul(noiseGain, mul(pink, 0.42 + (freq / nyquist) * 0.72))
    const driveEdge = mul(drive, 0.13 * (freq / nyquist) ** 1.35)
    const sustain = add(0.16, mul(widthParam, 0.16))
    const env = add(sustain, mul(sub(1, sustain), exp(neg(mul(decay, 5.4 * freq / nyquist)))))
    const value = mul(mul(add(add(partials, noiseFloor), driveEdge), filterMag), env)
    raw.push(value)
    rawSum = add(rawSum, value)
  }

  const norm = div(rawSum, MODEL_BIN_COUNT)
  const model = raw.map((value) => div(value, add(EPS, norm)))
  let magLoss = mul(0, pitch)

  for (const stride of [1, 2, 4]) {
    const groups = Math.ceil(MODEL_BIN_COUNT / stride)
    for (let group = 0; group < groups; group++) {
      let modelGroup = mul(0, pitch)
      let targetGroup = 0
      let count = 0
      for (let j = 0; j < stride; j++) {
        const index = group * stride + j
        if (index >= MODEL_BIN_COUNT) break
        modelGroup = add(modelGroup, model[index])
        targetGroup += diffTarget.mag[index]
        count++
      }
      const modelLog = log(add(EPS, div(modelGroup, count)))
      const targetLog = Math.log(EPS + targetGroup / count)
      magLoss = add(magLoss, div(abs(sub(modelLog, targetLog)), groups))
    }
  }

  let energy = mul(0, pitch)
  let weighted = mul(0, pitch)
  let logSum = mul(0, pitch)
  let arith = mul(0, pitch)
  for (let i = 0; i < MODEL_BIN_COUNT; i++) {
    const value = add(EPS, model[i])
    energy = add(energy, value)
    weighted = add(weighted, mul(value, diffFreqs[i]))
    logSum = add(logSum, log(value))
    arith = add(arith, value)
  }

  const centroid = div(div(weighted, energy), nyquist)
  const flatness = div(exp(div(logSum, MODEL_BIN_COUNT)), div(arith, MODEL_BIN_COUNT))
  const centroidLoss = square(sub(centroid, diffTarget.centroid))
  const flatnessLoss = square(sub(flatness, diffTarget.flatness))
  return add(div(magLoss, 3), add(mul(0.1, centroidLoss), mul(0.05, flatnessLoss)))
})

function setDiffTarget(target: ArrayLike<number>) {
  diffTarget = prepareTarget(target, MODEL_BIN_COUNT)
}

export function referenceDifferentiableForward(params: ArrayLike<number>, target: ArrayLike<number>): DifferentiableForwardResult {
  const p = sanitizeParams(params)
  setDiffTarget(target)
  const { value, gradient } = differentiableLoss.valueAndGradient(...p)
  const modelMag = forwardModel(p, { binCount: MODEL_BIN_COUNT })
  return { value, gradient: gradient as readonly number[], modelMag }
}

export function differentiableForward(params: ArrayLike<number>, target: ArrayLike<number>): DifferentiableForwardResult {
  return createSpectralObjective(target).valueAndGradient(params)
}

export function runOptimization(
  target: ArrayLike<number>,
  startParams: ArrayLike<number> = DEFAULT_PARAMS,
  opts: { steps?: number; rate?: number; lrInit?: number; lrMin?: number } = {},
): OptimizationRun {
  const started = performance.now()
  const steps = opts.steps ?? 200
  const lrInit = opts.lrInit ?? opts.rate ?? 0.05
  const lrMin = opts.lrMin ?? 0.005
  const params = sanitizeParams(startParams)
  const m = new Float64Array(params.length)
  const v = new Float64Array(params.length)
  const frames: OptimizationFrame[] = []
  const normalizedTarget = normalizeSpectrum(target, SPECTRAL_BIN_COUNT)
  const objective = createSpectralObjective(target)

  for (let step = 0; step <= steps; step++) {
    const { value, gradient, modelMag } = objective.valueAndGradient(params)
    const model = normalizeSpectrum(resampleSpectrum(modelMag, SPECTRAL_BIN_COUNT), SPECTRAL_BIN_COUNT)
    const gradNorm = Math.hypot(...gradient)
    frames.push({ params: [...params], model, modelMag, loss: value, gradNorm })
    if (step === steps) break

    const progress = step / Math.max(1, steps - 1)
    const lr = lrMin + (lrInit - lrMin) * 0.5 * (1 + Math.cos(Math.PI * progress))
    const beta1 = 0.9
    const beta2 = 0.999
    for (let i = 0; i < params.length; i++) {
      const grad = Math.max(-8, Math.min(8, Number(gradient[i] ?? 0)))
      m[i] = beta1 * m[i] + (1 - beta1) * grad
      v[i] = beta2 * v[i] + (1 - beta2) * grad * grad
      const mHat = m[i] / (1 - beta1 ** (step + 1))
      const vHat = v[i] / (1 - beta2 ** (step + 1))
      params[i] = clamp01(params[i] - (lr * mHat) / (Math.sqrt(vHat) + 1e-8))
    }
  }

  return {
    frames,
    finalParams: [...params],
    initialLoss: frames[0]?.loss ?? lossFn(forwardModel(DEFAULT_PARAMS), normalizedTarget),
    finalLoss: frames[frames.length - 1]?.loss ?? 0,
    durationMs: performance.now() - started,
  }
}

export function derivePalette(params: ArrayLike<number>, spectrum: ArrayLike<number>, loss: number): SpectralPalette {
  let energy = 0
  let weighted = 0
  for (let i = 0; i < spectrum.length; i++) {
    const value = Number(spectrum[i] ?? 0)
    energy += value
    weighted += value * i
  }
  const centroid = energy <= EPS ? 0.5 : weighted / energy / Math.max(1, spectrum.length - 1)
  const p = sanitizeParams(params)
  const hue = (122 + centroid * 190 + p[0] * 64) % 360
  const heat = Math.max(0, Math.min(1, 1 - loss * 0.65))
  const accent = oklch(0.72 + heat * 0.08, 0.14 + p[2] * 0.08, hue)
  const hot = oklch(0.68 + p[5] * 0.12, 0.17, (hue + 64) % 360)
  const cool = oklch(0.66 + p[8] * 0.1, 0.15, (hue + 224) % 360)
  const muted = oklch(0.42, 0.06, (hue + 22) % 360)
  const bg = '#0d100e'
  const fg = '#edf4ed'
  return {
    bg,
    fg,
    accent: toHex(accent),
    hot: toHex(hot),
    cool: toHex(cool),
    muted: toHex(muted),
    contrast: contrastRatio(fromHex(fg), fromHex(bg)),
  }
}

export function applyPaletteLens(palette: SpectralPalette, lens: LensKey): SpectralPalette {
  if (lens === 'none') return palette
  const map = (hex: string) => toHex(simulate(fromHex(hex), lens, 1))
  return {
    ...palette,
    accent: map(palette.accent),
    hot: map(palette.hot),
    cool: map(palette.cool),
    muted: map(palette.muted),
  }
}
