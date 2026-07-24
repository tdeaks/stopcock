import type { Result } from '@stopcock/fp/result'
import { expectTypeOf, test } from 'vite-plus/test'
import { apply, applyUnsafe, patch, type PatchError } from '../index'

type Model = {
  readonly count: number
  readonly label: string
}

const model: Model = { count: 1, label: 'before' }
const replacement = patch([
  {
    op: 'replace',
    path: ['count'],
    oldValue: 1,
    newValue: 2,
  },
])

test('apply preserves the target type in data-first and data-last forms', () => {
  expectTypeOf(apply(model, replacement)).toEqualTypeOf<Result<Model, PatchError>>()
  expectTypeOf(apply(replacement)(model)).toEqualTypeOf<Result<Model, PatchError>>()
  expectTypeOf(apply(replacement)(42)).toEqualTypeOf<Result<number, PatchError>>()
})

test('applyUnsafe preserves the target type in data-first and data-last forms', () => {
  expectTypeOf(applyUnsafe(model, replacement)).toEqualTypeOf<Model>()
  expectTypeOf(applyUnsafe(replacement)(model)).toEqualTypeOf<Model>()
  expectTypeOf(applyUnsafe(replacement)(42)).toEqualTypeOf<number>()
})
