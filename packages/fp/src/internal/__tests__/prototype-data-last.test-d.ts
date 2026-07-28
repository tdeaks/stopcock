/**
 * Type-level half of the data-last-only prototype experiment
 * (internal/__prototype__data-last.ts). Reproduces the generic-collapse
 * problem the "simplify and compile everything" plan's Phase 2 ledger notes
 * for `dual.ts` ("its overloads collapse generic callbacks"), then shows the
 * same shape of callback inferring cleanly through the prototype's
 * single-form factories.
 *
 * The collapse is not about array.ts specifically -- array.ts sidesteps it
 * by hand-writing an explicit overload type on every exported const and
 * casting the runtime implementation `as any` (see `map`/`filter`/etc.
 * there). It is `dual()`'s own return type that cannot stay generic when the
 * body passed to it is generic: `Body extends AnyFunction` can only bind to
 * one concrete instantiation, so TypeScript infers `A`/`B` as `unknown`
 * once, at the `dual()` call site, and every caller of the result is stuck
 * with that. Confirmed by hand against `tsc --strict` before writing this:
 * `dual(2, function map<A, B>(arr: readonly A[], f: (a: A) => B): B[] {...},
 * { op: 'map' })` resolves to exactly the type asserted below.
 */
import { expectTypeOf, test } from 'vite-plus/test'
import { dual, type TaggedDualOperation } from '../../dual'
import type { Option } from '../../option'
import { filter, flatMap, head, map, reduce, some, sortBy, take } from '../__prototype__data-last'

test('dual collapses a generic callback body to unknown at every instantiation', () => {
  const mapOp = dual(
    2,
    function map<A, B>(arr: readonly A[], f: (a: A) => B): B[] {
      return arr.map(f)
    },
    { op: 'map' },
  )

  // `A` and `B` never reach the exported type -- both sides of the overload
  // are pinned to `unknown` the moment dual() returns.
  expectTypeOf(mapOp).toEqualTypeOf<
    TaggedDualOperation<readonly unknown[], readonly [f: (a: unknown) => unknown], unknown[]>
  >()

  // A real caller wants `string[] -> number[]`; the collapsed type cannot
  // express that, so the callback body cannot even read its own parameter.
  // @ts-expect-error `s` is `unknown`, not `string` -- the collapse, not a typo.
  const lengths = mapOp(['a', 'bb', 'ccc'], (s: string) => s.length)
  void lengths

  // Same story on the data-last branch, with an unrelated instantiation.
  // @ts-expect-error `(b: boolean) => number` cannot satisfy `(a: unknown) => unknown`.
  const dataLast = mapOp((b: boolean) => (b ? 1 : 0))
  void dataLast
})

test('the data-last-only prototype keeps A and B generic at every call site', () => {
  // One call signature, not an overload pair -- and it stays exactly this
  // generic in the .d.ts this module would emit.
  expectTypeOf(map).toEqualTypeOf<<A, B>(f: (a: A) => B) => (arr: readonly A[]) => B[]>()

  const lengths = map((s: string) => s.length)(['a', 'bb', 'ccc'])
  expectTypeOf(lengths).toEqualTypeOf<number[]>()

  const fixed = map((n: number) => n.toFixed(2))([1, 2, 3])
  expectTypeOf(fixed).toEqualTypeOf<string[]>()

  const flags = map((b: boolean) => (b ? 1 : 0))([true, false])
  expectTypeOf(flags).toEqualTypeOf<number[]>()
})

test('the remaining seven prototype ops are single generic forms too', () => {
  expectTypeOf(filter((n: number) => n > 0)([1, -1, 2])).toEqualTypeOf<number[]>()
  expectTypeOf(reduce((acc: number, n: number) => acc + n, 0)([1, 2, 3])).toEqualTypeOf<number>()
  expectTypeOf(take<number>(2)([1, 2, 3])).toEqualTypeOf<number[]>()
  expectTypeOf(flatMap((n: number) => [n, n])([1, 2])).toEqualTypeOf<number[]>()
  expectTypeOf(some((n: number) => n > 0)([1, 2])).toEqualTypeOf<boolean>()
  expectTypeOf(sortBy((a: number, b: number) => a - b)([2, 1])).toEqualTypeOf<number[]>()
  expectTypeOf(head([1, 2])).toEqualTypeOf<Option<number>>()
})
