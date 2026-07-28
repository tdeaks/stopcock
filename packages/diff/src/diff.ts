import { deep } from '@stopcock/fp/eq'
import type { Patch, DiffOptions } from './types'
import { patch, empty } from './patch'
import { treeDiff } from './tree-diff'

export const diff =
  (b: unknown) =>
  (a: unknown): Patch =>
    diffWith(b, {})(a)

export const diffWith =
  (b: unknown, options: DiffOptions) =>
  (a: unknown): Patch => {
    if ((options.eq ?? deep.equals)(a, b)) return empty()
    const ops = treeDiff(a, b, [], options)
    return ops.length === 0 ? empty() : patch(ops)
  }
