import { DEFAULT_GAIN, DEFAULT_PAN } from '../defaults'
import type { Node, Transform } from '../types'
import { common } from './shared'

export function input(channel = 0): Node {
  return { kind: 'input', channel, ...common(1) }
}

export function gain(amount: number = DEFAULT_GAIN): Transform {
  return (node) => ({ kind: 'gain', input: node, amount, ...common(node.out) })
}

export function pan(position: number = DEFAULT_PAN): Transform {
  return (node) => ({ kind: 'pan', input: node, position, ...common(2) })
}

export function mix(inputs: ReadonlyArray<Node>): Node {
  const out = inputs.some((node) => node.out === 2) ? 2 : 1
  return { kind: 'mix', inputs, ...common(out) }
}

export function stereo(left: Node, right: Node): Node {
  return { kind: 'stereo', left, right, ...common(2) }
}
