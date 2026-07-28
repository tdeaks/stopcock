/**
 * Prototype: data-last-only array ops (the fp-ts model -- pipe stays
 * data-first, operators lose their data-first form entirely).
 *
 * Experiment scaffolding, not a real module. Internal (module-manifest.ts
 * lists nothing under internal/, so nothing here reaches package.json's
 * exports map); the `__prototype__` prefix marks it as throwaway. Exists to
 * put numbers on a design question, not to replace array.ts or dual.ts.
 *
 * Each op is a plain factory returning a unary closure -- `map(f)` is the
 * final callable, there is no two-argument data-first form and no
 * `arguments.length` branch. The closure carries the same `_op`/`_fn`/`_a1`
 * fields dual.ts's data-last branch stamps today, and it goes through the
 * same `registerTrustedOperator` call array.ts uses. That second part is the
 * one that actually matters: per provenance.ts, `_op`/`_fn`/`_a1` are
 * forgeable and authorize nothing on their own, only the module-private
 * WeakMap does. Skipping `registerTrustedOperator` would make these ops look
 * tagged while never actually fusing. With it, `@stopcock/fp/fusion`'s pipe
 * fuses these exactly like the real dual ops -- same opcodes, same plan
 * shape.
 *
 * map/filter/reduce/take/flatMap/some copy their loop straight out of
 * array.ts's data-first branch. `runMap` (map's helper) is module-private
 * and never exported; filter/reduce/take/flatMap/some never had a named
 * helper at all, the logic sits inline in both of array.ts's dispatch
 * branches. Copying the loop text is the only way to reuse that logic
 * without editing array.ts -- and it is also the honest comparison: calling
 * array.ts's own dual-dispatched export from inside these closures would
 * drag its `arguments.length` branch back in and hide the exact size/perf
 * delta this experiment measures. sortBy and head really do import existing
 * internals: sortBy calls the shared mergeSortBy kernel, and head is
 * re-exported unchanged, since an arity-1 op never had a data-first form to
 * lose in the first place.
 */
import { registerTrustedOperator } from './provenance'
import { mergeSortBy } from '../sort-kernel'
import { head as arrayHead } from '../array'
import type { Option } from '../option'

// Same numbers array.ts and opcodes.ts already use for these ops. Reusing
// them (rather than minting new ones) is what lets the compact fusion
// engine's fact table (internal/compact/facts.generated.ts) recognize these
// as the identical, already-registered operations.
const OP_MAP = 1
const OP_FILTER = 2
const OP_TAKE = 3
const OP_FLAT_MAP = 7
const OP_REDUCE = 8
const OP_SOME = 11
const OP_SORT_BY = 20
const NON_FUSEABLE_OPCODE = 0

export const map = <A, B>(f: (a: A) => B): ((arr: readonly A[]) => B[]) => {
  const dl: any = (arr: readonly A[]) => {
    const len = arr.length
    const out = new Array(len)
    for (let i = 0; i < len; i++) out[i] = f(arr[i] as A)
    return out
  }
  dl._op = OP_MAP
  dl._fn = f
  return registerTrustedOperator(dl, OP_MAP, f)
}

export const filter = <A>(pred: (a: A) => boolean): ((arr: readonly A[]) => A[]) => {
  const dl: any = (arr: readonly A[]) => {
    const out: A[] = []
    for (let i = 0, len = arr.length; i < len; i++) {
      const v = arr[i] as A
      if (pred(v)) out.push(v)
    }
    return out
  }
  dl._op = OP_FILTER
  dl._fn = pred
  return registerTrustedOperator(dl, OP_FILTER, pred)
}

export const reduce = <A, B>(f: (acc: B, a: A) => B, init: B): ((arr: readonly A[]) => B) => {
  const dl: any = (arr: readonly A[]) => {
    let acc = init
    for (let i = 0, len = arr.length; i < len; i++) acc = f(acc, arr[i] as A)
    return acc
  }
  dl._op = OP_REDUCE
  dl._fn = f
  dl._a1 = init
  return registerTrustedOperator(dl, OP_REDUCE, f, init)
}

export const take = <A>(n: number): ((arr: readonly A[]) => A[]) => {
  const dl: any = (arr: readonly A[]) => {
    const len = arr.length
    if (n <= 0) return []
    return arr.slice(0, n > len ? len : n)
  }
  dl._op = OP_TAKE
  dl._fn = n
  // Same admission rule as array.ts's take: only a primitive number is
  // trusted into the streaming fusion contract, and the trusted fn is the
  // clamped/floored count, not the raw (possibly fractional) n.
  if (typeof n !== 'number') return registerTrustedOperator(dl, NON_FUSEABLE_OPCODE, n)
  const fusedCount = n > 0 ? (n === Number.POSITIVE_INFINITY ? n : n - (n % 1)) : 0
  return registerTrustedOperator(dl, OP_TAKE, fusedCount)
}

export const flatMap = <A, B>(f: (a: A) => readonly B[]): ((arr: readonly A[]) => B[]) => {
  const dl: any = (arr: readonly A[]) => {
    const out: B[] = []
    for (let i = 0, len = arr.length; i < len; i++) {
      const r = f(arr[i] as A)
      for (let j = 0, rlen = r.length; j < rlen; j++) out.push(r[j] as B)
    }
    return out
  }
  dl._op = OP_FLAT_MAP
  dl._fn = f
  return registerTrustedOperator(dl, OP_FLAT_MAP, f)
}

export const some = <A>(pred: (a: A) => boolean): ((arr: readonly A[]) => boolean) => {
  const dl: any = (arr: readonly A[]) => {
    for (let i = 0, len = arr.length; i < len; i++) {
      if (pred(arr[i] as A)) return true
    }
    return false
  }
  dl._op = OP_SOME
  dl._fn = pred
  return registerTrustedOperator(dl, OP_SOME, pred)
}

export const sortBy = <A>(cmp: (a: A, b: A) => number): ((arr: readonly A[]) => A[]) => {
  const dl: any = (arr: readonly A[]) => mergeSortBy(arr, cmp)
  dl._op = OP_SORT_BY
  dl._fn = cmp
  return registerTrustedOperator(dl, OP_SORT_BY, cmp)
}

/**
 * Arity 1: no data-first form ever existed to remove. Same bare tagged
 * unary array.ts already exports and has already registered as trusted --
 * re-exporting it is the reuse, not a reimplementation.
 */
export const head: <A>(arr: readonly A[]) => Option<A> = arrayHead
