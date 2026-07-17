import { analysis, fft, window as signalWindow } from '@stopcock/signal'
import {
  effects,
  envelope,
  filter,
  gain,
  mix,
  noise,
  oscillator,
  pan,
  render as renderSynth,
  toWav,
  type Node,
  type Samples,
  type Trigger,
} from '@stopcock/synth'
import { paramsToPatch, spectralBinFrequencies, type PatchSpec } from './spectral-optimizer'

export type AnalysisResult = {
  bins: number[]
  rms: number
  peak: number
  centroid: number
  rolloff: number
  flatness: number
  fftMs: number
}

export type RenderedPatch = {
  rendered: Samples
  mono: Float32Array
  wav: Uint8Array
  analysis: AnalysisResult
  sampleRate: number
  duration: number
  timings: {
    renderMs: number
    analysisMs: number
    wavMs: number
    totalMs: number
  }
}

export type WorkletPatch = {
  root: Node
  controls: {
    base: Node
    baseGain: Node
    harmonic: Node
    harmonicGain: Node
    sub: Node
    subGain: Node
    noiseGain: Node
    highpass: Node
    lowpass: Node
    peak: Node
    distortion: Node
    chorus: Node
    output: Node
  }
}

export function toMono(rendered: Samples): Float32Array {
  if (!Array.isArray(rendered)) return rendered
  const [left, right] = rendered
  const out = new Float32Array(Math.min(left.length, right.length))
  for (let i = 0; i < out.length; i++) out[i] = (left[i] + right[i]) * 0.5
  return out
}

export function buildPatch(spec: PatchSpec): Node {
  const base = spec.baseHz
  let node = mix([
    gain(0.72)(oscillator('triangle', base)),
    gain(spec.harmonicGain)(oscillator('sine', base * 2.01, { detune: spec.detune })),
    gain(spec.harmonicGain * 0.48)(oscillator('saw', base * 0.5, { detune: -spec.detune * 0.6 })),
    gain(spec.noiseGain)(noise('pink', { seed: 0x5EED })),
  ])
  node = filter.highpass(42 + base * 0.22, 0.7)(node)
  node = filter.lowpass(spec.cutoff, spec.q)(node)
  node = filter.peak(Math.max(240, spec.cutoff * 0.42), 0.9 + spec.q * 0.18, 2.2)(node)
  node = envelope({ attack: 0.01, decay: spec.decay, sustain: 0.18, release: spec.decay * 0.82 })(node)
  node = effects.distortion(spec.drive, 'tanh')(node)
  node = effects.chorus(0.22 + spec.width * 0.5, 7 + spec.width * 16, 0.28)(node)
  node = effects.delay(60_000 / spec.tempo * spec.delay, 0.34, 0.28)(node)
  node = effects.compressor({ threshold: -17, ratio: 2.2, attack: 0.004, release: 0.16, knee: 12 })(node)
  return pan(spec.pan)(node)
}

export function buildWorkletPatch(params: ArrayLike<number>): WorkletPatch {
  const spec = paramsToPatch(params)
  const base = spec.baseHz
  const baseOsc = oscillator('triangle', base)
  const harmonicOsc = oscillator('sine', base * 2.01, { detune: spec.detune })
  const subOsc = oscillator('saw', base * 0.5, { detune: -spec.detune * 0.6 })
  const baseGain = gain(0.72)(baseOsc)
  const harmonicGain = gain(spec.harmonicGain)(harmonicOsc)
  const subGain = gain(spec.harmonicGain * 0.48)(subOsc)
  const noiseGainNode = gain(spec.noiseGain)(noise('pink', { seed: 0x5EED }))
  let node = mix([baseGain, harmonicGain, subGain, noiseGainNode])
  const highpass = filter.highpass(42 + base * 0.22, 0.7)(node)
  node = highpass
  const lowpass = filter.lowpass(spec.cutoff, spec.q)(node)
  const peakNode = filter.peak(Math.max(240, spec.cutoff * 0.42), 0.9 + spec.q * 0.18, 2.2)(lowpass)
  const distortion = effects.distortion(spec.drive * 0.68, 'tanh')(
    effects.chorus(0.14 + spec.width * 0.32, 4 + spec.width * 9, 0.16)(peakNode),
  )
  const chorus = (distortion.kind === 'distortion' ? distortion.input : peakNode)
  const output = gain(0.45)(
    pan(spec.pan)(
      distortion,
    ),
  )
  return {
    root: output,
    controls: {
      base: baseOsc,
      baseGain,
      harmonic: harmonicOsc,
      harmonicGain,
      sub: subOsc,
      subGain,
      noiseGain: noiseGainNode,
      highpass,
      lowpass,
      peak: peakNode,
      distortion,
      chorus,
      output,
    },
  }
}

export function triggersFor(spec: PatchSpec, duration: number): Trigger[] {
  const step = 60 / spec.tempo / 2
  const pattern = [0, 7, 12, null, 10, 14, 7, null, 0, 5, 12, 17, null, 14, 10, 7]
  const triggers: Trigger[] = []
  for (let cycle = 0; cycle < 2; cycle++) {
    for (let i = 0; i < pattern.length; i++) {
      const offset = pattern[i]
      if (offset === null) continue
      const atSec = (cycle * pattern.length + i) * step
      if (atSec > duration - 0.08) continue
      triggers.push({
        freq: spec.baseHz * 2 ** (offset / 12),
        atSec,
        gateMs: Math.max(70, step * 420),
        velocity: i % 8 === 0 ? 0.95 : 0.58 + (i % 3) * 0.1,
      })
    }
  }
  return triggers
}

export function triggerForVerification(spec: PatchSpec): Trigger[] {
  return [{
    freq: spec.baseHz,
    atSec: 0,
    gateMs: Math.max(520, spec.decay * 1600),
    velocity: 0.9,
  }]
}

export function analyzeSamples(input: Float32Array, sampleRate: number, binCount = 16): AnalysisResult {
  const fftSize = 2048
  const frame = new Float32Array(fftSize)
  const start = Math.min(Math.max(0, input.length - fftSize), Math.floor(sampleRate * 0.18))
  frame.set(input.subarray(start, Math.min(input.length, start + fftSize)))
  const win = signalWindow.hann(fftSize)
  signalWindow.apply(frame, win, frame)

  const plan = fft.plan(fftSize)
  const complex = new Float64Array(2 * (fftSize / 2 + 1))
  const magnitudes = new Float32Array(fftSize / 2 + 1)
  const fftStarted = performance.now()
  fft.rfftInto(frame, plan, complex)
  fft.magnitude(complex, magnitudes)
  const fftMs = performance.now() - fftStarted

  const grouped = Array.from({ length: binCount }, (_, i) => {
    const { start, end } = logBandRange(i, binCount, magnitudes.length, sampleRate)
    let binPeak = 0
    for (let j = start; j < end; j++) binPeak = Math.max(binPeak, magnitudes[j])
    return binPeak
  })
  const max = Math.max(...grouped, 1e-6)
  const spectrum = analysis.spectrum(magnitudes, fftSize, sampleRate)

  return {
    bins: grouped.map((value) => value / max),
    rms: analysis.rms(input),
    peak: analysis.peak(input),
    centroid: analysis.spectralCentroid(spectrum),
    rolloff: analysis.spectralRolloff(spectrum, 0.85),
    flatness: analysis.spectralFlatness(spectrum),
    fftMs,
  }
}

function logBandRange(index: number, binCount: number, magnitudeCount: number, sampleRate: number) {
  const freqs = spectralBinFrequencies({ binCount, sampleRate })
  const center = freqs[index] ?? 1
  const lo = index === 0 ? center / Math.sqrt((freqs[1] ?? center * 1.5) / center) : Math.sqrt((freqs[index - 1] ?? center) * center)
  const hi = index === binCount - 1 ? center * Math.sqrt(center / (freqs[index - 1] ?? center / 1.5)) : Math.sqrt(center * (freqs[index + 1] ?? center))
  const nyquist = sampleRate / 2
  const start = Math.max(1, Math.floor((lo / nyquist) * (magnitudeCount - 1)))
  const end = Math.max(start + 1, Math.min(magnitudeCount, Math.ceil((hi / nyquist) * (magnitudeCount - 1))))
  return { start, end }
}

export function renderPatchAudio(params: ArrayLike<number>, opts: { sampleRate?: number; duration?: number; mode?: 'verification' | 'sequence' } = {}): RenderedPatch {
  const started = performance.now()
  const spec = paramsToPatch(params)
  const sampleRate = opts.sampleRate ?? 24_000
  const duration = opts.duration ?? 2.05
  const renderStarted = performance.now()
  const rendered = renderSynth(buildPatch(spec), {
    sampleRate,
    duration,
    triggers: opts.mode === 'sequence' ? triggersFor(spec, duration) : triggerForVerification(spec),
  })
  const renderMs = performance.now() - renderStarted
  const mono = toMono(rendered)
  const analysisStarted = performance.now()
  const result = analyzeSamples(mono, sampleRate)
  const analysisMs = performance.now() - analysisStarted
  const wavStarted = performance.now()
  const wav = toWav(rendered, { sampleRate })
  const wavMs = performance.now() - wavStarted
  return {
    rendered,
    mono,
    wav,
    analysis: result,
    sampleRate,
    duration,
    timings: {
      renderMs,
      analysisMs,
      wavMs,
      totalMs: performance.now() - started,
    },
  }
}
