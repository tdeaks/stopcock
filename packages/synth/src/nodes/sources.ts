import {
  DEFAULT_BUFFER_LOOP,
  DEFAULT_BUFFER_RATE,
  DEFAULT_DETUNE,
  DEFAULT_FM_OPERATOR_COUNT,
  DEFAULT_NOISE_SEED,
  DEFAULT_PHASE,
} from '../defaults'
import { SynthCompileError } from '../internal/graph'
import type {
  FmOperator,
  FmOperatorInput,
  FmPatch,
  Node,
  NoiseColor,
  WavetableBank,
  Waveform,
} from '../types'
import { common } from './shared'

function oscillatorBase(
  wave: Waveform,
  freq: number,
  opts: { detune?: number; phase?: number } = {},
): Node {
  return {
    kind: 'osc',
    wave,
    freq,
    detune: opts.detune ?? DEFAULT_DETUNE,
    phase: opts.phase ?? DEFAULT_PHASE,
    ...common(1),
  }
}

export const oscillator = Object.assign(oscillatorBase, {
  polyblep: oscillatorBase,
  wavetable: (
    bank: WavetableBank,
    freq: number,
    opts: { detune?: number; phase?: number; position?: number } = {},
  ): Node => ({
    kind: 'wavetable',
    bank,
    freq,
    detune: opts.detune ?? DEFAULT_DETUNE,
    phase: opts.phase ?? DEFAULT_PHASE,
    position: opts.position ?? 0,
    ...common(1),
  }),
})

type OperatorOpts = Partial<
  Pick<FmOperator, 'ratio' | 'detune' | 'level' | 'feedback' | 'output' | 'phase'>
>

export const operator = {
  sine: (opts: OperatorOpts = {}): FmOperatorInput => ({ kind: 'sine', ...opts }),
  polyblep: (wave: Waveform, opts: OperatorOpts = {}): FmOperatorInput => ({
    kind: 'polyblep',
    wave,
    ...opts,
  }),
  wavetable: (
    bank: WavetableBank,
    opts: OperatorOpts & { position?: number } = {},
  ): FmOperatorInput => ({
    kind: 'wavetable',
    bank,
    ...opts,
    position: opts.position ?? 0,
  }),
} as const

export function fm(patch: FmPatch): Node {
  const operators = normalizeOperators(patch.operators)
  return {
    kind: 'fm',
    freq: patch.freq,
    detune: patch.detune ?? DEFAULT_DETUNE,
    index: patch.index ?? 1,
    operators,
    matrix: normalizeMatrix(patch.matrix),
    ...common(1),
  }
}

export function noise(color: NoiseColor, opts: { seed?: number } = {}): Node {
  return { kind: 'noise', color, seed: opts.seed ?? DEFAULT_NOISE_SEED, ...common(1) }
}

export function constant(value: number): Node {
  return { kind: 'constant', value, ...common(1) }
}

export function buffer(samples: Float32Array, opts: { loop?: boolean; rate?: number } = {}): Node {
  return {
    kind: 'buffer',
    samples,
    loop: opts.loop ?? DEFAULT_BUFFER_LOOP,
    rate: opts.rate ?? DEFAULT_BUFFER_RATE,
    ...common(1),
  }
}

function normalizeOperators(input: ReadonlyArray<FmOperatorInput>): ReadonlyArray<FmOperator> {
  if (input.length > DEFAULT_FM_OPERATOR_COUNT) {
    throw new SynthCompileError(`fm() supports at most ${DEFAULT_FM_OPERATOR_COUNT} operators`)
  }
  const operators: FmOperator[] = []
  for (let i = 0; i < DEFAULT_FM_OPERATOR_COUNT; i++) {
    const source = input[i] ?? { kind: 'sine' as const }
    const normalizedSource =
      source.kind === 'wavetable' ? { ...source, position: source.position ?? 0 } : source
    operators.push({
      ...normalizedSource,
      ratio: source.ratio ?? 1,
      detune: source.detune ?? 0,
      level: source.level ?? (i === 0 ? 1 : 0),
      feedback: source.feedback ?? 0,
      output: source.output ?? (i === 0 ? 1 : 0),
      phase: source.phase ?? 0,
    } as FmOperator)
  }
  return operators
}

function normalizeMatrix(input: FmPatch['matrix']): ReadonlyArray<ReadonlyArray<number>> {
  if (input && input.length > DEFAULT_FM_OPERATOR_COUNT) {
    throw new SynthCompileError(`fm() matrix supports at most ${DEFAULT_FM_OPERATOR_COUNT} rows`)
  }
  const matrix: number[][] = []
  for (let row = 0; row < DEFAULT_FM_OPERATOR_COUNT; row++) {
    if (input?.[row] && input[row].length > DEFAULT_FM_OPERATOR_COUNT) {
      throw new SynthCompileError(
        `fm() matrix rows support at most ${DEFAULT_FM_OPERATOR_COUNT} columns`,
      )
    }
    matrix[row] = []
    for (let col = 0; col < DEFAULT_FM_OPERATOR_COUNT; col++) {
      const value = input?.[row]?.[col] ?? 0
      matrix[row][col] = Number.isFinite(value) ? value : 0
    }
  }
  return matrix
}
