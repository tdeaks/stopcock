import { deep } from '@stopcock/fp/eq'
import type { Patch, DiffOptions } from './types'
import { patch, empty } from './patch'
import { treeDiff } from './tree-diff'

export const diff: {
  (a: unknown, b: unknown): Patch
  (b: unknown): (a: unknown) => Patch
} = function diff(b: unknown, __df?: unknown): any {
  if (arguments.length >= 2) return diffWith(b, __df, {})
  return (a: unknown): Patch => diffWith(b, {})(a)
} as any

export const diffWith: {
  (a: unknown, b: unknown, options: DiffOptions): Patch
  (b: unknown, options: DiffOptions): (a: unknown) => Patch
} = function diffWith(b: unknown, options: DiffOptions, __df?: DiffOptions): any {
  if (arguments.length >= 3) {
    const a = b
    const target = options as unknown
    const selectedOptions = __df as DiffOptions
    if ((selectedOptions.eq ?? deep.equals)(a, target)) return empty()
    const ops = treeDiff(a, target, [], selectedOptions)
    return ops.length === 0 ? empty() : patch(ops)
  }
  return (a: unknown): Patch => {
    if ((options.eq ?? deep.equals)(a, b)) return empty()
    const ops = treeDiff(a, b, [], options)
    return ops.length === 0 ? empty() : patch(ops)
  }
} as any
