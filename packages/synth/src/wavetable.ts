import { fft } from '@stopcock/signal'
import { DEFAULT_WAVETABLE_SIZE } from './defaults'
import type {
  AudioBufferLike,
  WavetableAudioOptions,
  WavetableBank,
  WavetableOptions,
  WavetablePartial,
  WavetableSource,
} from './types'
import { SynthCompileError } from './internal/graph'
import { clamp } from './internal/util'

export function createWavetable(source: WavetableSource, opts: WavetableOptions = {}): WavetableBank {
  const size = normalizeSize(opts.size ?? DEFAULT_WAVETABLE_SIZE)
  const normalize = opts.normalize ?? true
  const frames = source instanceof Float32Array
    ? [resampleCycle(source, size)]
    : isFrameArray(source)
      ? source.map((frame) => resampleCycle(frame, size))
      : [partialsToCycle(source.partials, size)]

  if (frames.length === 0) throw new SynthCompileError('wavetable requires at least one frame')
  if (normalize) {
    for (const frame of frames) normalizeFrame(frame)
  }

  return buildBank(frames, size)
}

function isFrameArray(source: WavetableSource): source is ReadonlyArray<Float32Array> {
  return Array.isArray(source)
}

export function wavetableFromAudio(audio: AudioBufferLike, opts: WavetableAudioOptions = {}): WavetableBank {
  const size = normalizeSize(opts.size ?? DEFAULT_WAVETABLE_SIZE)
  const channel = Math.max(0, Math.floor(opts.channel ?? 0))
  if (!Number.isFinite(audio.sampleRate) || audio.sampleRate <= 0) throw new SynthCompileError('audio sampleRate must be positive')
  if (!Number.isFinite(audio.length) || audio.length <= 0) throw new SynthCompileError('audio input must not be empty')
  const data = audio.getChannelData(channel)
  if (data.length === 0) throw new SynthCompileError('audio channel must not be empty')
  const sampleRate = audio.sampleRate
  const start = clamp(Math.floor((opts.startSec ?? 0) * sampleRate), 0, Math.max(0, data.length - 1))
  const frameCount = Math.max(1, Math.floor(opts.frameCount ?? 1))
  const sourceCycleLength = opts.fundamentalHz && opts.fundamentalHz > 0
    ? Math.max(1, Math.round(sampleRate / opts.fundamentalHz))
    : size
  const frames: Float32Array[] = []

  for (let frame = 0; frame < frameCount; frame++) {
    const sourceStart = start + frame * sourceCycleLength
    const cycle = new Float32Array(sourceCycleLength)
    for (let i = 0; i < sourceCycleLength; i++) {
      const index = sourceStart + i
      cycle[i] = index < data.length ? data[index] : 0
    }
    frames.push(resampleCycle(cycle, size))
  }

  return createWavetable(frames, opts)
}

function buildBank(frames: ReadonlyArray<Float32Array>, size: number): WavetableBank {
  const levelCount = Math.max(1, Math.floor(Math.log2(size)) - 1)
  const levels: Float32Array[] = []
  const levelMaxHarmonics: number[] = []

  for (let level = 0; level < levelCount; level++) {
    const maxHarmonic = Math.max(1, Math.floor((size / 2) / (2 ** level)))
    const table = new Float32Array(size * frames.length)
    for (let frame = 0; frame < frames.length; frame++) {
      table.set(limitHarmonics(frames[frame], maxHarmonic), frame * size)
    }
    levels.push(table)
    levelMaxHarmonics.push(maxHarmonic)
  }

  return {
    kind: 'wavetable-bank',
    size,
    frameCount: frames.length,
    levels,
    levelMaxHarmonics,
  }
}

function normalizeSize(size: number): number {
  if (!Number.isFinite(size) || size < 8) throw new SynthCompileError('wavetable size must be at least 8')
  const integer = Math.floor(size)
  if (integer !== size || (integer & (integer - 1)) !== 0) {
    throw new SynthCompileError('wavetable size must be a power of two')
  }
  if (integer > 65_536) throw new SynthCompileError('wavetable size must be 65536 samples or less')
  return integer
}

function resampleCycle(source: Float32Array, size: number): Float32Array {
  if (source.length === 0) throw new SynthCompileError('wavetable frame must not be empty')
  const out = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const position = (i / size) * source.length
    const lo = Math.floor(position) % source.length
    const hi = (lo + 1) % source.length
    const frac = position - Math.floor(position)
    out[i] = source[lo] * (1 - frac) + source[hi] * frac
  }
  return out
}

function partialsToCycle(partials: ReadonlyArray<WavetablePartial>, size: number): Float32Array {
  if (partials.length === 0) throw new SynthCompileError('partials wavetable requires at least one partial')
  const out = new Float32Array(size)
  for (let p = 0; p < partials.length; p++) {
    const partial = partials[p]
    const harmonic = typeof partial === 'number' ? p + 1 : partial.harmonic
    const amplitude = typeof partial === 'number' ? partial : partial.amplitude
    const phase = typeof partial === 'number' ? 0 : partial.phase ?? 0
    if (!Number.isFinite(harmonic) || harmonic <= 0 || !Number.isFinite(amplitude)) continue
    for (let i = 0; i < size; i++) {
      out[i] += amplitude * Math.sin(2 * Math.PI * harmonic * (i / size) + phase)
    }
  }
  return out
}

function normalizeFrame(frame: Float32Array): void {
  let peak = 0
  for (let i = 0; i < frame.length; i++) peak = Math.max(peak, Math.abs(frame[i]))
  if (peak <= 0) return
  for (let i = 0; i < frame.length; i++) frame[i] /= peak
}

function limitHarmonics(frame: Float32Array, maxHarmonic: number): Float32Array {
  const spectrum = fft.rfft(frame)
  for (let harmonic = maxHarmonic + 1; harmonic < spectrum.length / 2; harmonic++) {
    spectrum[2 * harmonic] = 0
    spectrum[2 * harmonic + 1] = 0
  }
  return fft.irfft(spectrum, frame.length)
}
