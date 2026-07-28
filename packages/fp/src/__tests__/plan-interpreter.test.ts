import { describe, it, expect } from 'vite-plus/test'
// These exercise fused execution, which since S8 lives behind the explicit
// entry rather than at the root. Root pipe is sequential and is covered by
// root-sequential.test.ts.
import { pipe } from '../fusion'
import * as A from '../array'
import * as S from '../string'
import { buildPlan } from '../plan'
import { interpret } from '../internal/compact-runtime'

// Wraps a user callback to count invocations and record the order/args it
// was called with, without changing its behavior. Used to assert that the
// reference interpreter invokes callbacks the same number of times, in the
// same order, as the existing pipe() engine.
function tracked<F extends (...args: any[]) => any>(fn: F): F & { calls: unknown[][] } {
  const calls: unknown[][] = []
  const wrapped = ((...args: unknown[]) => {
    calls.push(args)
    return fn(...(args as Parameters<F>))
  }) as F & { calls: unknown[][] }
  wrapped.calls = calls
  return wrapped
}

interface Case {
  readonly name: string
  readonly input: unknown
  readonly build: (track: <F extends (...args: any[]) => any>(fn: F) => F) => unknown[]
  /**
   * Hand-computed expected per-callback invocation counts for pipelines
   * where a preceding filter/map/flatMap runs on trailing items that never
   * produce a kept element before a later take's limit is reached. The
   * portable engine (buildPlan/lowerShape) matches these exactly: both
   * interpret() and pipe() route through the same Plan IR, so their counts
   * always agree. Kept as an explicit assertion (rather than inferred from
   * pipe()) because it is the more informative, hand-verified number.
   */
  readonly expectedCallbackCounts?: readonly number[]
}

const nums = [5, 3, 8, 1, 9, 2, 7, 4, 6, 0]

const cases: Case[] = [
  { name: 'map', input: nums, build: (t) => [A.map(t((x: number) => x * 2))] },
  { name: 'filter', input: nums, build: (t) => [A.filter(t((x: number) => x % 2 === 0))] },
  { name: 'reject', input: nums, build: (t) => [A.reject(t((x: number) => x % 2 === 0))] },
  {
    name: 'map -> filter',
    input: nums,
    build: (t) => [A.map(t((x: number) => x + 1)), A.filter(t((x: number) => x > 5))],
  },
  {
    name: 'filter -> map',
    input: nums,
    build: (t) => [A.filter(t((x: number) => x > 3)), A.map(t((x: number) => x * 10))],
  },
  { name: 'take', input: nums, build: (t) => [A.take(4)] },
  { name: 'drop', input: nums, build: (t) => [A.drop(3)] },
  {
    name: 'filter -> take',
    input: nums,
    build: (t) => [A.filter(t((x: number) => x % 2 === 0)), A.take(2)],
    // filter is called for every item up to and including the one that
    // fills take's quota (indices 0..7: 5,3,8,1,9,2,7,4) — see the
    // expectedCallbackCounts doc comment on Case.
    expectedCallbackCounts: [8],
  },
  {
    name: 'map -> take -> filter',
    input: nums,
    build: (t) => [A.map(t((x: number) => x + 1)), A.take(6), A.filter(t((x: number) => x > 3))],
    // map runs on 7 items before take's 6-item quota is filled (the 7th
    // triggers the halt before filter is reached); filter only ever gets
    // called on the 6 items that passed take. See the doc comment above.
    expectedCallbackCounts: [7, 6],
  },
  { name: 'takeWhile', input: nums, build: (t) => [A.takeWhile(t((x: number) => x < 8))] },
  { name: 'dropWhile', input: nums, build: (t) => [A.dropWhile(t((x: number) => x > 1))] },
  {
    name: 'flatMap',
    input: [1, 2, 3],
    build: (t) => [A.flatMap(t((x: number) => [x, x * 10]))],
  },
  {
    name: 'flatMap -> filter',
    input: [1, 2, 3, 4],
    build: (t) => [
      A.flatMap(t((x: number) => [x, x + 100])),
      A.filter(t((x: number) => x < 100 || x > 102)),
    ],
  },
  {
    name: 'flatMap -> take',
    input: [1, 2, 3, 4, 5],
    build: (t) => [A.flatMap(t((x: number) => [x, x])), A.take(4)],
    // flatMap runs on source items 1, 2, and 3: the third call's first
    // inner item is the one that hits take's 4-item quota. See the doc
    // comment above.
    expectedCallbackCounts: [3],
  },
  {
    name: 'filterMap',
    input: nums,
    build: (t) => [A.filterMap(t((x: number) => (x % 2 === 0 ? x * 100 : undefined)))],
  },
  {
    name: 'mapWhile',
    input: nums,
    build: (t) => [A.mapWhile(t((x: number) => (x < 8 ? x : undefined)))],
  },
  { name: 'takeUntil', input: nums, build: (t) => [A.takeUntil(t((x: number) => x === 9))] },
  {
    name: 'reduce (sum)',
    input: nums,
    build: (t) => [A.reduce(t((acc: number, x: number) => acc + x), 0)],
  },
  {
    name: 'map -> reduce',
    input: nums,
    build: (t) => [A.map(t((x: number) => x * 2)), A.reduce(t((acc: number, x: number) => acc + x), 0)],
  },
  { name: 'every', input: nums, build: (t) => [A.every(t((x: number) => x >= 0))] },
  { name: 'every (fails midway)', input: nums, build: (t) => [A.every(t((x: number) => x !== 1))] },
  { name: 'some', input: nums, build: (t) => [A.some(t((x: number) => x === 9))] },
  { name: 'find', input: nums, build: (t) => [A.find(t((x: number) => x > 6))] },
  { name: 'findIndex', input: nums, build: (t) => [A.findIndex(t((x: number) => x > 6))] },
  {
    name: 'findMap',
    input: nums,
    build: (t) => [A.findMap(t((x: number) => (x > 6 ? String(x) : undefined)))],
  },
  { name: 'none', input: nums, build: (t) => [A.none(t((x: number) => x > 100))] },
  { name: 'count', input: nums, build: (t) => [A.count(t((x: number) => x % 2 === 0))] },
  {
    name: 'filter -> every (early stop)',
    input: nums,
    build: (t) => [A.filter(t((x: number) => x > 0 || true)), A.every(t((x: number) => x !== 8))],
  },
  { name: 'sum', input: nums, build: () => [A.sum] },
  { name: 'min', input: nums, build: () => [A.min] },
  { name: 'max', input: nums, build: () => [A.max] },
  { name: 'reverse', input: nums, build: () => [A.reverse] },
  { name: 'sort', input: nums, build: () => [A.sort] },
  { name: 'sortAsc', input: nums, build: () => [A.sortAsc] },
  { name: 'sortDesc', input: nums, build: () => [A.sortDesc] },
  {
    name: 'sortBy',
    input: nums,
    build: (t) => [A.sortBy(t((a: number, b: number) => a - b))],
  },
  { name: 'uniq', input: [1, 1, 2, 2, 3, 1], build: () => [A.uniq] },
  { name: 'head', input: nums, build: () => [A.head] },
  { name: 'last', input: nums, build: () => [A.last] },
  { name: 'length', input: nums, build: () => [A.length] },
  { name: 'isEmpty', input: [], build: () => [A.isEmpty] },
  { name: 'tail', input: nums, build: () => [A.tail] },
  { name: 'init', input: nums, build: () => [A.init] },
  {
    name: 'map -> sum',
    input: nums,
    build: (t) => [A.map(t((x: number) => x * 3)), A.sum],
  },
  {
    name: 'filter -> reverse',
    input: nums,
    build: (t) => [A.filter(t((x: number) => x % 2 === 0)), A.reverse],
  },
  {
    name: 'map -> sort -> take (materializer boundary then array step)',
    input: nums,
    build: (t) => [A.map(t((x: number) => x)), A.sort, A.take(3)],
  },
  {
    name: 'take -> map -> filter -> reduce',
    input: nums,
    build: (t) => [
      A.take(7),
      A.map(t((x: number) => x + 1)),
      A.filter(t((x: number) => x % 2 === 0)),
      A.reduce(t((acc: number, x: number) => acc + x), 0),
    ],
  },
  {
    name: 'scalar: trim -> toUpperCase',
    input: '  hello  ',
    build: () => [S.trim, S.toUpperCase],
  },
  {
    name: 'scalar: toLowerCase -> trimStart -> trimEnd',
    input: '  HeLLo World  ',
    build: () => [S.toLowerCase, S.trimStart, S.trimEnd],
  },
]

describe('plan/interpret differential tests', () => {
  for (const testCase of cases) {
    it(`matches pipe() for: ${testCase.name}`, () => {
      const trackedInterp: Array<{ calls: unknown[][] }> = []
      const trackInterp = <F extends (...args: any[]) => any>(fn: F): F => {
        const w = tracked(fn)
        trackedInterp.push(w)
        return w
      }
      const trackedPipe: Array<{ calls: unknown[][] }> = []
      const trackPipe = <F extends (...args: any[]) => any>(fn: F): F => {
        const w = tracked(fn)
        trackedPipe.push(w)
        return w
      }

      const stepsForInterp = testCase.build(trackInterp)
      const stepsForPipe = testCase.build(trackPipe)

      // Independent copies: some accessor ops in the real engine mutate their
      // input array in place, and the two runs must never see each other's
      // side effects.
      const cloneInput = (value: unknown): unknown => (Array.isArray(value) ? value.slice() : value)

      const plan = buildPlan(stepsForInterp)
      const interpResult = interpret(plan, cloneInput(testCase.input))

      const pipeResult = (pipe as (a: unknown, ...fns: unknown[]) => unknown)(
        cloneInput(testCase.input),
        ...stepsForPipe,
      )

      expect(interpResult).toEqual(pipeResult)

      if (testCase.expectedCallbackCounts) {
        expect(trackedInterp.map((w) => w.calls.length)).toEqual(testCase.expectedCallbackCounts)
        expect(trackedPipe.map((w) => w.calls.length)).toEqual(testCase.expectedCallbackCounts)
      }
      expect(trackedInterp.length).toBe(trackedPipe.length)
      for (let i = 0; i < trackedInterp.length; i++) {
        expect(trackedInterp[i].calls.length).toBe(trackedPipe[i].calls.length)
        expect(trackedInterp[i].calls).toEqual(trackedPipe[i].calls)
      }
    })
  }

  it('runs an opaque (untagged) step as a single whole-array call, matching pipe()', () => {
    const double = (arr: readonly number[]) => arr.map((x) => x * 2)
    const plan = buildPlan([double])
    expect(interpret(plan, [1, 2, 3])).toEqual(pipe([1, 2, 3], double))
  })

  it('runs A.chunk (untagged in the current engine) identically through both paths', () => {
    const plan = buildPlan([A.chunk(2)])
    expect(interpret(plan, [1, 2, 3, 4, 5])).toEqual(pipe([1, 2, 3, 4, 5], A.chunk(2)))
  })

  it('propagates the first thrown error and stops calling further callbacks', () => {
    const calls: number[] = []
    const boom = (x: number) => {
      calls.push(x)
      if (x === 3) throw new Error('boom')
      return x
    }
    const plan = buildPlan([A.map(boom)])
    expect(() => interpret(plan, [1, 2, 3, 4, 5])).toThrow('boom')
    expect(calls).toEqual([1, 2, 3])
  })

  it('reads sparse holes as undefined and still invokes the callback for them', () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [1, , 3]
    const seen: unknown[] = []
    const plan = buildPlan([A.map((x: unknown) => (seen.push(x), x))])
    const result = interpret(plan, sparse) as unknown[]
    expect(seen).toEqual([1, undefined, 3])
    expect(result).toEqual([1, undefined, 3])
  })
})
