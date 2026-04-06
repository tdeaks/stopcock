import type { Operation, Patch } from './types'

export const patch = (ops: readonly Operation[]): Patch => ({ _tag: 'Patch', ops })
export const empty = (): Patch => ({ _tag: 'Patch', ops: [] })
export const ops = (p: Patch): readonly Operation[] => p.ops
export const size = (p: Patch): number => p.ops.length
export const isEmpty = (p: Patch): boolean => p.ops.length === 0
