import type { Result } from '@stopcock/fp/result'
import { prop, traversal } from '@stopcock/fp/optic'
import { expectTypeOf, test } from 'vite-plus/test'
import {
  apply,
  applyUnsafe,
  compose,
  diff,
  diffWith,
  fromLens,
  fromTraversal,
  patch,
  rebase,
  type ConflictError,
  type Patch,
  type PatchError,
} from '../index'

type Model = {
  readonly count: number
  readonly label: string
}

const model: Model = { count: 1, label: 'before' }
const updatedModel: Model = { count: 2, label: 'after' }
const replacement = patch([
  {
    op: 'replace',
    path: ['count'],
    oldValue: 1,
    newValue: 2,
  },
])

test('apply preserves the target type across generic instantiations', () => {
  expectTypeOf(apply(replacement)(model)).toEqualTypeOf<Result<Model, PatchError>>()
  expectTypeOf(apply(replacement)(42)).toEqualTypeOf<Result<number, PatchError>>()
  expectTypeOf(apply(model, replacement)).toEqualTypeOf<Result<Model, PatchError>>()
  expectTypeOf(apply(42, replacement)).toEqualTypeOf<Result<number, PatchError>>()
})

test('applyUnsafe preserves the target type across generic instantiations', () => {
  expectTypeOf(applyUnsafe(replacement)(model)).toEqualTypeOf<Model>()
  expectTypeOf(applyUnsafe(replacement)(42)).toEqualTypeOf<number>()
  expectTypeOf(applyUnsafe(model, replacement)).toEqualTypeOf<Model>()
  expectTypeOf(applyUnsafe(42, replacement)).toEqualTypeOf<number>()
})

test('diff operations expose data-first and data-last types', () => {
  expectTypeOf(diff(model, updatedModel)).toEqualTypeOf<Patch>()
  expectTypeOf(diff(updatedModel)(model)).toEqualTypeOf<Patch>()
  expectTypeOf(diffWith(model, updatedModel, {})).toEqualTypeOf<Patch>()
  expectTypeOf(diffWith(updatedModel, {})(model)).toEqualTypeOf<Patch>()
})

test('patch combinators expose data-first and data-last types', () => {
  expectTypeOf(compose(replacement, replacement)).toEqualTypeOf<Patch>()
  expectTypeOf(compose(replacement)(replacement)).toEqualTypeOf<Patch>()
  expectTypeOf(rebase(replacement, replacement)).toEqualTypeOf<Result<Patch, ConflictError>>()
  expectTypeOf(rebase(replacement)(replacement)).toEqualTypeOf<Result<Patch, ConflictError>>()
})

test('optic bridges expose data-first and data-last types', () => {
  const count = prop<Model, 'count'>('count')
  const each = traversal<Model[], Model>(
    (source) => [...source],
    (source, transform) => source.map(transform),
  )
  const relabel = (value: Model): Model => ({ ...value, label: 'updated' })

  expectTypeOf(fromLens(model, count, updatedModel)).toEqualTypeOf<Patch | null>()
  expectTypeOf(fromLens(count, updatedModel)(model)).toEqualTypeOf<Patch | null>()
  expectTypeOf(fromTraversal([model], each, relabel)).toEqualTypeOf<Patch>()
  expectTypeOf(fromTraversal(each, relabel)([model])).toEqualTypeOf<Patch>()
})
