/**
 * Type-level contract for the dual emission
 * (2026-08-24-dual-performance-first.md, Phase 1): the generated modules'
 * two-branch annotations must resolve both call shapes with full generic
 * inference, keep contextual (unannotated) lambdas working inside pipe, and
 * reject shape-confused calls. The runtime never sees these; a regression
 * here is an inference collapse, the exact failure mode that killed the old
 * generic dual() types.
 */
import { expectTypeOf, test } from 'vite-plus/test'
import { pipe } from '../pipe'
import * as A from '../array'
import * as M from '../math'
import * as G from '../guard'

declare const numbers: number[]
declare const mixed: (string | number)[]

test('data-first calls infer generics from the data argument', () => {
  expectTypeOf(A.map(numbers, (x) => x + 1)).toEqualTypeOf<number[]>()
  expectTypeOf(A.map(numbers, (x) => String(x))).toEqualTypeOf<string[]>()
  expectTypeOf(A.filter(numbers, (x) => x > 1)).toEqualTypeOf<number[]>()
  expectTypeOf(A.take(numbers, 3)).toEqualTypeOf<number[]>()
  expectTypeOf(A.reduce(numbers, (acc: number, x) => acc + x, 0)).toEqualTypeOf<number>()
  expectTypeOf(M.add(2, 3)).toEqualTypeOf<number>()
})

test('data-first callback parameters are contextually typed, not any', () => {
  A.map(numbers, (x) => {
    expectTypeOf(x).toEqualTypeOf<number>()
    return x
  })
  A.filter(mixed, (x) => {
    expectTypeOf(x).toEqualTypeOf<string | number>()
    return true
  })
})

test('data-first filter narrows through type guards', () => {
  expectTypeOf(A.filter(mixed, G.isString)).toEqualTypeOf<string[]>()
})

test('curried calls keep working unchanged, including inside pipe with unannotated lambdas', () => {
  expectTypeOf(A.map((x: number) => x + 1)(numbers)).toEqualTypeOf<number[]>()
  expectTypeOf(M.add(2)(3)).toEqualTypeOf<number>()
  const result = pipe(
    numbers,
    A.map((x) => x + 1),
    A.filter((x) => x > 1),
    A.take(3),
  )
  expectTypeOf(result).toEqualTypeOf<number[]>()
  const narrowed = pipe(mixed, A.filter(G.isString))
  expectTypeOf(narrowed).toEqualTypeOf<string[]>()
})

test('shape-confused calls are rejected', () => {
  // @ts-expect-error data alone is not a config argument
  A.map(numbers)
  // @ts-expect-error config-first with trailing data is not a call shape
  A.map((x: number) => x + 1, numbers)
  // @ts-expect-error curried step applied to the wrong element type
  A.map((x: number) => x + 1)(['a'])
})
