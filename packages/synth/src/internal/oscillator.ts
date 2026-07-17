import type { FmOperator, Node, WavetableBank, Waveform } from '../types'
import { clamp, safeFinite } from './util'

export const TAU = Math.PI * 2

export function wrapPhase(phase: number): number {
  phase %= 1
  return phase < 0 ? phase + 1 : phase
}

export function polyBlep(t: number, dt: number): number {
  if (dt <= 0) return 0
  if (t < dt) {
    const x = t / dt
    return x + x - x * x - 1
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt
    return x * x + x + x + 1
  }
  return 0
}

export function samplePolyblep(wave: Waveform, phase: number, dt: number, triangleState?: { value: number }): number {
  const t = wrapPhase(phase)
  if (wave === 'sine') return Math.sin(TAU * t)
  if (wave === 'saw') return 2 * t - 1 - polyBlep(t, dt)
  const square = (t < 0.5 ? 1 : -1) + polyBlep(t, dt) - polyBlep(wrapPhase(t + 0.5), dt)
  if (wave === 'square') return square
  if (!triangleState) return 2 * Math.abs(2 * (t - Math.floor(t + 0.5))) - 1
  triangleState.value = clamp((triangleState.value + square * dt * 4) * 0.999, -1.2, 1.2)
  return triangleState.value
}

export function samplePolyblepAt(wave: Waveform, phase: number, dt: number, triangle: Float64Array, index: number): number {
  const t = wrapPhase(phase)
  if (wave === 'sine') return Math.sin(TAU * t)
  if (wave === 'saw') return 2 * t - 1 - polyBlep(t, dt)
  const square = (t < 0.5 ? 1 : -1) + polyBlep(t, dt) - polyBlep(wrapPhase(t + 0.5), dt)
  if (wave === 'square') return square
  triangle[index] = clamp((triangle[index] + square * dt * 4) * 0.999, -1.2, 1.2)
  return triangle[index]
}

export function sampleWavetable(bank: WavetableBank, phase: number, freq: number, sampleRate: number, position: number): number {
  const size = bank.size
  const level = tableLevelFor(bank, Math.max(1, Math.abs(freq)), sampleRate)
  const table = bank.levels[level] ?? bank.levels[0]
  if (!table || size <= 0) return 0
  const frames = Math.max(1, bank.frameCount)
  const framePosition = clamp(position, 0, 1) * (frames - 1)
  const frame0 = Math.floor(framePosition)
  const frame1 = Math.min(frames - 1, frame0 + 1)
  const frameFrac = framePosition - frame0
  const a = sampleTableFrame(table, size, frame0, phase)
  const b = frame1 === frame0 ? a : sampleTableFrame(table, size, frame1, phase)
  return a * (1 - frameFrac) + b * frameFrac
}

export function renderFmSample(
  node: Extract<Node, { kind: 'fm' }>,
  sampleRate: number,
  sample: number,
  phase: Float64Array,
  previous: Float64Array,
  current: Float64Array,
  triangle: Float64Array,
  paramAt: (param: string, base: number, sample: number) => number,
): number {
  const baseFreq = Math.max(0, paramAt('freq', node.freq, sample))
  const baseDetune = paramAt('detune', node.detune, sample)
  const globalIndex = paramAt('index', node.index, sample)
  let sum = 0
  let norm = 0

  for (let op = 0; op < 6; op++) {
    const spec = node.operators[op]
    const oneBased = op + 1
    const ratio = Math.max(0, paramAt(`op${oneBased}.ratio`, spec.ratio, sample))
    const level = paramAt(`op${oneBased}.level`, spec.level, sample)
    const feedback = paramAt(`op${oneBased}.feedback`, spec.feedback, sample)
    const output = paramAt(`op${oneBased}.output`, spec.output, sample)
    const freq = baseFreq * ratio * 2 ** ((baseDetune + spec.detune) / 1200)
    const dt = clamp(freq / sampleRate, 0, 0.5)
    let phaseMod = previous[op] * feedback
    for (let src = 0; src < 6; src++) {
      const amount = paramAt(`m${src + 1}_${oneBased}`, node.matrix[src]?.[op] ?? 0, sample)
      phaseMod += previous[src] * amount * globalIndex
    }

    current[op] = sampleOperator(spec, wrapPhase(phase[op] + phaseMod / TAU), dt, freq, sampleRate, triangle, op) * level
    phase[op] = wrapPhase(phase[op] + dt)
    sum += current[op] * output
    norm += Math.abs(output)
  }

  for (let op = 0; op < 6; op++) previous[op] = current[op]
  return safeFinite(norm > 1 ? sum / norm : sum)
}

function sampleOperator(
  spec: FmOperator,
  phase: number,
  dt: number,
  freq: number,
  sampleRate: number,
  triangle: Float64Array,
  op: number,
): number {
  if (spec.kind === 'wavetable') return sampleWavetable(spec.bank, phase, freq, sampleRate, spec.position)
  return samplePolyblepAt(spec.kind === 'polyblep' ? spec.wave : 'sine', phase, dt, triangle, op)
}

function tableLevelFor(bank: WavetableBank, freq: number, sampleRate: number): number {
  const allowed = Math.max(1, sampleRate / (2 * freq))
  let level = 0
  while (
    level + 1 < bank.levelMaxHarmonics.length
    && bank.levelMaxHarmonics[level] > allowed
  ) level++
  return level
}

function sampleTableFrame(table: Float32Array, size: number, frame: number, phase: number): number {
  const position = wrapPhase(phase) * size
  const lo = Math.floor(position) % size
  const hi = (lo + 1) % size
  const frac = position - Math.floor(position)
  const offset = frame * size
  return table[offset + lo] * (1 - frac) + table[offset + hi] * frac
}
