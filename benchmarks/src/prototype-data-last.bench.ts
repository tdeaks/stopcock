/**
 * Data-last-only array ops (the fp-ts model) vs today's dual ops.
 *
 * Companion perf half of packages/fp/src/internal/__prototype__data-last.ts.
 * Three questions, in order:
 *
 * 1. Through the real fusion pipe (`@stopcock/fp/fusion`), do prototype ops
 *    fuse exactly like dual ops? Proven once at import time via
 *    `buildCompactPlan` (the same function `@stopcock/fp/fusion`'s pipe
 *    calls internally) rather than by output equality alone -- equal output
 *    is necessary but not sufficient, a deliberately untagged closure chain
 *    (no `registerTrustedOperator`) produces the identical result through
 *    the same pipe while never actually fusing, which is exactly the
 *    contrast bench row 3 below measures.
 * 2. What does a single direct call cost: dual's data-first fast path vs a
 *    fresh data-last closure per call vs a hoisted one vs Ramda.
 * 3. Does the same shape of loss show up at the bare scalar-op level that
 *    math-ops.bench.ts already documents for dual vs Ramda (1.04-1.23x)?
 *
 * Source-only, deliberately: `@stopcock/fp/array` and `@stopcock/fp/fusion`
 * resolve through this package's default vitest config (`vp test bench`),
 * which aliases them to packages/fp/src/*.ts, the same module graph the two
 * relative internal/ imports below load. That is what makes the fusion
 * proof below meaningful -- `A.map`/`A.filter`/`A.reduce` and
 * `buildCompactPlan` end up sharing one instance of
 * internal/provenance.ts's WeakMap. Run this file under
 * `vp test bench:dist` (which aliases @stopcock/fp/* to packages/fp/dist
 * instead) and the fusion assertions below fail -- not a bug, dist's
 * array.js bundles its own separate copy of provenance.ts, so nothing
 * built from source (including the never-shipped prototype module) can
 * appear trusted to it. Exactly the "two copies of this module" case
 * provenance.ts's own docstring warns about.
 */
import { bench, describe } from 'vite-plus/test'
import { pipe } from '@stopcock/fp/fusion'
import * as A from '@stopcock/fp/array'
import * as M from '@stopcock/fp/math'
import * as Ra from 'ramda'
import * as P from '../../packages/fp/src/internal/__prototype__data-last'
import { buildCompactPlan } from '../../packages/fp/src/internal/compact/plan'
import { getData } from './setup'

const SIZES = [100, 10_000, 100_000] as const

// ---------------------------------------------------------------------------
// 1. map -> filter -> reduce through the real fusion pipe
// ---------------------------------------------------------------------------

const double = (x: number): number => x * 2
const isOver = (x: number): boolean => x > 0.5
const sum = (acc: number, x: number): number => acc + x

// Deliberately untagged: same semantics, no `_op`/`registerTrustedOperator`.
// Run through the identical compact fusion engine, these fall back to three
// opaque per-step calls instead of one fused loop -- the baseline "tagging
// buys you nothing by accident" case.
const untaggedMap =
  (f: (x: number) => number) =>
  (xs: readonly number[]): number[] =>
    xs.map(f)
const untaggedFilter =
  (pred: (x: number) => boolean) =>
  (xs: readonly number[]): number[] =>
    xs.filter(pred)
const untaggedReduce =
  (f: (acc: number, x: number) => number, init: number) =>
  (xs: readonly number[]): number =>
    xs.reduce(f, init)

// Hoisted once. compactPipe's plan cache (`planFor` in internal/compact-
// runtime.ts) is keyed on exact step-reference identity; calling
// `A.filter(isOver)` fresh inside a bench iteration allocates a new closure
// every time and would measure "build a fused plan from scratch" rather than
// steady-state fused execution. Real call sites hoist their operators too.
const dualMap = A.map(double)
const dualFilter = A.filter(isOver)
const dualReduce = A.reduce(sum, 0)

const protoMap = P.map(double)
const protoFilter = P.filter(isOver)
const protoReduce = P.reduce(sum, 0)

const untaggedMapOp = untaggedMap(double)
const untaggedFilterOp = untaggedFilter(isOver)
const untaggedReduceOp = untaggedReduce(sum, 0)

const startupData = getData<number>('numbers', 100)
const expectedChainResult = startupData.map(double).filter(isOver).reduce(sum, 0)

const dualChainResult = pipe(startupData, dualMap, dualFilter, dualReduce)
const protoChainResult = pipe(startupData, protoMap, protoFilter, protoReduce)
const untaggedChainResult = pipe(startupData, untaggedMapOp, untaggedFilterOp, untaggedReduceOp)

for (const [label, actual] of [
  ['dual', dualChainResult],
  ['prototype', protoChainResult],
  ['untagged', untaggedChainResult],
] as const) {
  if (Math.abs(actual - expectedChainResult) > 1e-9) {
    throw new Error(
      `prototype-data-last.bench: ${label} chain mismatch: ${actual} vs ${expectedChainResult}`,
    )
  }
}

const dualPlan = buildCompactPlan([dualMap, dualFilter, dualReduce])
const protoPlan = buildCompactPlan([protoMap, protoFilter, protoReduce])
const untaggedPlan = buildCompactPlan([untaggedMapOp, untaggedFilterOp, untaggedReduceOp])

const isOneFusedStreamOfThree = (plan: ReturnType<typeof buildCompactPlan>): boolean =>
  plan.shape.segments.length === 1 &&
  plan.shape.segments[0]?.kind === 'stream' &&
  plan.shape.segments[0]?.length === 3

const isThreeOpaqueSteps = (plan: ReturnType<typeof buildCompactPlan>): boolean =>
  plan.shape.segments.length === 3 && plan.shape.segments.every((seg) => seg.kind === 'opaque')

if (!isOneFusedStreamOfThree(dualPlan)) {
  throw new Error(
    `prototype-data-last.bench: dual chain did not fuse: ${JSON.stringify(dualPlan.shape)}`,
  )
}
if (!isOneFusedStreamOfThree(protoPlan)) {
  throw new Error(
    `prototype-data-last.bench: prototype chain did not fuse: ${JSON.stringify(protoPlan.shape)}`,
  )
}
if (JSON.stringify(dualPlan.shape.codes) !== JSON.stringify(protoPlan.shape.codes)) {
  throw new Error(
    `prototype-data-last.bench: prototype opcodes diverge from dual: ${JSON.stringify({
      dual: dualPlan.shape.codes,
      proto: protoPlan.shape.codes,
    })}`,
  )
}
if (!isThreeOpaqueSteps(untaggedPlan)) {
  throw new Error(
    `prototype-data-last.bench: untagged chain unexpectedly fused: ${JSON.stringify(untaggedPlan.shape)}`,
  )
}

describe.each(SIZES)('map->filter->reduce through @stopcock/fp/fusion — n=%i', (n) => {
  const data = getData<number>('numbers', n)

  bench('dual ops (tagged, fused)', () => pipe(data, dualMap, dualFilter, dualReduce))
  bench('prototype ops (tagged, fused)', () => pipe(data, protoMap, protoFilter, protoReduce))
  bench('untagged closures (opaque, unfused)', () =>
    pipe(data, untaggedMapOp, untaggedFilterOp, untaggedReduceOp))
})

// ---------------------------------------------------------------------------
// 2. single direct call: map
// ---------------------------------------------------------------------------

// Hoisted -- the realistic hot-loop form of a data-last-only op.
const protoMapHoisted = P.map(double)

describe.each(SIZES)('single direct call: map — n=%i', (n) => {
  const data = getData<number>('numbers', n)

  bench('dual data-first A.map(xs, f)', () => A.map(data, double))
  bench('prototype map(f)(xs) — fresh closure per call', () => P.map(double)(data))
  bench('prototype hoisted mapF = map(f); mapF(xs)', () => protoMapHoisted(data))
  bench('ramda R.map(f, xs)', () => Ra.map(double, data))
})

// ---------------------------------------------------------------------------
// 3. bare micro op: add (mirrors math-ops.bench.ts's dual-vs-ramda rows)
// ---------------------------------------------------------------------------

const protoAdd =
  (n: number) =>
  (x: number): number =>
    x + n
const protoAddHoisted = protoAdd(3)

describe('bare micro op: add', () => {
  bench('dual data-first M.add(3, 5)', () => M.add(3, 5))
  bench('prototype data-last protoAdd(3)(5) — fresh closure', () => protoAdd(3)(5))
  bench('prototype data-last hoisted protoAddHoisted(5)', () => protoAddHoisted(5))
  bench('ramda Ra.add(3, 5)', () => Ra.add(3, 5))
})
