import type { Transform } from '../types'
import { common } from './shared'

type EnvelopeFn = ((opts: {
  attack: number
  decay: number
  sustain: number
  release: number
}) => Transform) & {
  ar(opts: { attack: number; release: number }): Transform
  exponential(opts: { tau: number }): Transform
}

const envelopeBase =
  (opts: { attack: number; decay: number; sustain: number; release: number }): Transform =>
  (node) => ({
    kind: 'adsr',
    input: node,
    attack: opts.attack,
    decay: opts.decay,
    sustain: opts.sustain,
    release: opts.release,
    ...common(node.out),
  })

export const envelope = Object.assign(envelopeBase, {
  ar:
    (opts: { attack: number; release: number }): Transform =>
    (node) => ({
      kind: 'ar',
      input: node,
      attack: opts.attack,
      release: opts.release,
      ...common(node.out),
    }),
  exponential:
    (opts: { tau: number }): Transform =>
    (node) => ({ kind: 'exponential', input: node, tau: opts.tau, ...common(node.out) }),
}) as EnvelopeFn
