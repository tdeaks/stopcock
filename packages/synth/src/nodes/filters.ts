import {
  DEFAULT_Q,
  DEFAULT_STATE_VARIABLE_FILTER_DRIVE,
  DEFAULT_STATE_VARIABLE_FILTER_MIX,
  DEFAULT_STATE_VARIABLE_FILTER_RESONANCE,
} from '../defaults'
import type { FilterKind, StateVariableFilterMode, Transform } from '../types'
import { common } from './shared'

const biquad =
  (filter: FilterKind, freq: number, q = DEFAULT_Q, gainDb = 0): Transform =>
  (node) => ({ kind: 'biquad', input: node, filter, freq, q, gainDb, ...common(node.out) })

type StateVariableFilterOpts = {
  resonance?: number
  drive?: number
  mix?: number
}

export const filter = {
  lowpass: (freq: number, q = DEFAULT_Q) => biquad('lowpass', freq, q),
  highpass: (freq: number, q = DEFAULT_Q) => biquad('highpass', freq, q),
  bandpass: (freq: number, q = DEFAULT_Q) => biquad('bandpass', freq, q),
  notch: (freq: number, q = DEFAULT_Q) => biquad('notch', freq, q),
  peak: (freq: number, q = DEFAULT_Q, gainDb = 0) => biquad('peak', freq, q, gainDb),
  lowshelf: (freq: number, gainDb = 0) => biquad('lowshelf', freq, DEFAULT_Q, gainDb),
  highshelf: (freq: number, gainDb = 0) => biquad('highshelf', freq, DEFAULT_Q, gainDb),
  allpass: (freq: number, q = DEFAULT_Q) => biquad('allpass', freq, q),
  stateVariable:
    (mode: StateVariableFilterMode, freq: number, opts: StateVariableFilterOpts = {}): Transform =>
    (node) => ({
      kind: 'stateVariableFilter',
      input: node,
      mode,
      freq,
      resonance: opts.resonance ?? DEFAULT_STATE_VARIABLE_FILTER_RESONANCE,
      drive: opts.drive ?? DEFAULT_STATE_VARIABLE_FILTER_DRIVE,
      mix: opts.mix ?? DEFAULT_STATE_VARIABLE_FILTER_MIX,
      ...common(node.out),
    }),
  comb:
    (delayMs: number, feedback: number, damp = 0): Transform =>
    (node) => ({ kind: 'comb', input: node, delayMs, feedback, damp, ...common(node.out) }),
} as const
