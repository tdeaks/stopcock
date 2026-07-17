import type { AnyParam, Node, Transform } from '../types'

export function modulate(param: AnyParam, source: Node, depth: number, opts: { rate?: 'audio' | 'control' } = {}): Transform {
  return (node) => ({ ...node, mods: [...node.mods, { param, source, depth, rate: opts.rate ?? 'audio' }] } as Node)
}
