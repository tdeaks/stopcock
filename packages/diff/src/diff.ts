import { dual, isDeepEqual } from '@stopcock/fp'
import type { Patch, DiffOptions } from './types'
import { patch, empty } from './patch'
import { treeDiff } from './tree-diff'

export const diff: {
  (a: unknown, b: unknown): Patch
  (b: unknown): (a: unknown) => Patch
} = dual(2, (a: unknown, b: unknown): Patch => diffWith(a, b, {}))

export const diffWith: {
  (a: unknown, b: unknown, options: DiffOptions): Patch
  (b: unknown, options: DiffOptions): (a: unknown) => Patch
} = dual(3, (a: unknown, b: unknown, options: DiffOptions): Patch => {
  if ((options.eq ?? isDeepEqual)(a, b)) return empty()
  const ops = treeDiff(a, b, [], options)
  return ops.length === 0 ? empty() : patch(ops)
})
