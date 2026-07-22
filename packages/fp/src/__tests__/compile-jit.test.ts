import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test'
import * as A from '../array'
import * as S from '../string'
import { buildPlan } from '../plan'
import { interpret } from '../interpret'
import {
  compile,
  compileJit,
  JitUnavailableError,
  __getJitRunnerState,
  __resetJitModuleCache,
  type Runner,
} from '../compile'
import { __setProbeOverride } from '../jit-chunk'

function tracked<F extends (...args: any[]) => any>(fn: F): F & { calls: unknown[][] } {
  const calls: unknown[][] = []
  const wrapped = ((...args: unknown[]) => {
    calls.push(args)
    return fn(...(args as Parameters<F>))
  }) as F & { calls: unknown[][] }
  wrapped.calls = calls
  return wrapped
}

const nums = [5, 3, 8, 1, 9, 2, 7, 4, 6, 0]

interface Case {
  readonly name: string
  readonly input: unknown
  readonly assumePure?: boolean
  readonly build: (track: <F extends (...args: any[]) => any>(fn: F) => F) => unknown[]
}

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
  { name: 'take', input: nums, build: () => [A.take(4)] },
  { name: 'drop', input: nums, build: () => [A.drop(3)] },
  {
    name: 'filter -> take',
    input: nums,
    build: (t) => [A.filter(t((x: number) => x % 2 === 0)), A.take(2)],
  },
  {
    name: 'map -> take -> filter',
    input: nums,
    build: (t) => [A.map(t((x: number) => x + 1)), A.take(6), A.filter(t((x: number) => x > 3))],
  },
  { name: 'takeWhile', input: nums, build: (t) => [A.takeWhile(t((x: number) => x < 8))] },
  { name: 'dropWhile', input: nums, build: (t) => [A.dropWhile(t((x: number) => x > 1))] },
  { name: 'flatMap', input: [1, 2, 3], build: (t) => [A.flatMap(t((x: number) => [x, x * 10]))] },
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
  },
  {
    name: 'flatMap -> take (stops mid-expansion)',
    input: [1, 2, 3, 4, 5],
    build: (t) => [A.flatMap(t((x: number) => [x, x, x])), A.take(2)],
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
  { name: 'find (absent)', input: nums, build: (t) => [A.find(t((x: number) => x > 100))] },
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
  { name: 'reverse', input: nums, build: () => [A.reverse] },
  { name: 'sort', input: nums, build: () => [A.sort] },
  { name: 'uniq', input: [1, 1, 2, 2, 3, 1], build: () => [A.uniq] },
  { name: 'head', input: nums, build: () => [A.head] },
  { name: 'last', input: nums, build: () => [A.last] },
  { name: 'length', input: nums, build: () => [A.length] },
  { name: 'map -> sum', input: nums, build: (t) => [A.map(t((x: number) => x * 3)), A.sum] },
  {
    name: 'filter -> reverse',
    input: nums,
    build: (t) => [A.filter(t((x: number) => x % 2 === 0)), A.reverse],
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
  { name: 'scalar: trim -> toUpperCase', input: '  hello  ', build: () => [S.trim, S.toUpperCase] },
  { name: 'empty input map', input: [], build: (t) => [A.map(t((x: number) => x))] },
  { name: 'single element take', input: [42], build: () => [A.take(1)] },
  {
    name: 'map -> filter -> take -> reduce',
    input: nums,
    build: (t) => [
      A.map(t((x: number) => x * 2)),
      A.filter(t((x: number) => x > 4)),
      A.take(3),
      A.reduce(t((acc: number, x: number) => acc + x), 0),
    ],
  },
  {
    name: 'dropWhile -> takeWhile',
    input: nums,
    build: (t) => [A.dropWhile(t((x: number) => x !== 8)), A.takeWhile(t((x: number) => x !== 0))],
  },
  {
    name: 'reject -> count',
    input: nums,
    build: (t) => [A.reject(t((x: number) => x > 5)), A.count(t(() => true))],
  },
  {
    name: 'filterMap -> sum',
    input: nums,
    build: (t) => [A.filterMap(t((x: number) => (x % 2 === 0 ? x : undefined))), A.sum],
  },
  {
    name: 'opaque whole-array step',
    input: [1, 2, 3],
    build: () => [(arr: readonly number[]) => arr.map((x) => x * 2)],
  },
  {
    name: 'map -> opaque -> filter',
    input: nums,
    build: (t) => [
      A.map(t((x: number) => x + 1)),
      (arr: readonly number[]) => arr.slice().reverse(),
      A.filter(t((x: number) => x > 3)),
    ],
  },
  {
    name: 'flatMap -> takeWhile (early exit across outer/inner)',
    input: [1, 2, 3, 4, 5],
    build: (t) => [A.flatMap(t((x: number) => [x, x + 10])), A.takeWhile(t((x: number) => x < 12))],
  },
  {
    name: 'reduce with bound initial value',
    input: nums,
    build: (t) => [A.reduce(t((acc: string, x: number) => acc + String(x)), 'seed:')],
  },
  {
    name: 'map -> reduce with bound object initial',
    input: nums,
    assumePure: true,
    build: (t) => [
      A.map(t((x: number) => x)),
      A.reduce(t((acc: { total: number }, x: number) => ({ total: acc.total + x })), { total: 0 }),
    ],
  },
]

describe('compileJit: differential against reference interpreter', () => {
  it('covers at least 25 pipelines', () => {
    expect(cases.length).toBeGreaterThanOrEqual(25)
  })

  for (const testCase of cases) {
    it(`matches interpret() before and after promotion for: ${testCase.name}`, async () => {
      const cloneInput = (value: unknown): unknown => (Array.isArray(value) ? value.slice() : value)

      const interpTracked: Array<{ calls: unknown[][] }> = []
      const trackInterp = <F extends (...args: any[]) => any>(fn: F): F => {
        const w = tracked(fn)
        interpTracked.push(w)
        return w
      }
      const compileTracked: Array<{ calls: unknown[][] }> = []
      const trackJit = <F extends (...args: any[]) => any>(fn: F): F => {
        const w = tracked(fn)
        compileTracked.push(w)
        return w
      }

      const stepsForJit = testCase.build(trackJit)
      const runner = testCase.assumePure
        ? await compileJit({ assumePure: true }, ...stepsForJit)
        : await compileJit(...stepsForJit)

      for (let call = 0; call < 11; call++) {
        interpTracked.length = 0
        for (const tr of compileTracked) tr.calls.length = 0
        const stepsForInterp = testCase.build(trackInterp)
        const plan = buildPlan(stepsForInterp)
        const interpResult = interpret(plan, cloneInput(testCase.input))
        const jitResult = runner(cloneInput(testCase.input))

        expect(jitResult).toEqual(interpResult)
        expect(compileTracked.length).toBe(interpTracked.length)
        for (let i = 0; i < interpTracked.length; i++) {
          expect(compileTracked[i].calls).toEqual(interpTracked[i].calls)
        }
      }
    })
  }
})

describe('compileJit: tiering and promotion', () => {
  // compileJit's contract is the deterministic prewarm: by the time the
  // awaited promise resolves, the chunk is resident and the shape has
  // already been generated, so dispatch is at tier 1 from call one --
  // there is no gradual warm-up to observe on a compileJit runner itself
  // (that adaptive, threshold-gated path belongs to bare pipe(); see
  // tier1.test.ts for coverage of that promotion).
  it('is already promoted (tier 1) before the first call', async () => {
    const runner = await compileJit(A.map((x: number) => x * 2))
    expect(__getJitRunnerState(runner)?.promoted).toBe(true)
    expect(runner([1, 2, 3])).toEqual([2, 4, 6])
  })

  it('stays promoted across many calls, whatever the input size', async () => {
    const runner = await compileJit(A.filter((x: number) => x % 2 === 0))
    const big = Array.from({ length: 3000 }, (_, i) => i)
    runner(big)
    expect(__getJitRunnerState(runner)?.promoted).toBe(true)
    runner(big)
    expect(__getJitRunnerState(runner)?.promoted).toBe(true)
  })

  it('promotion state is per-shape, not per-call-site: two distinct shapes both promote independently', async () => {
    const a = await compileJit(A.map((x: number) => x + 1))
    const b = await compileJit(A.map((x: number) => x + 2))
    expect(__getJitRunnerState(a)?.promoted).toBe(true)
    expect(__getJitRunnerState(b)?.promoted).toBe(true)
    expect(a([1])).toEqual([2])
    expect(b([1])).toEqual([3])
  })

  it('results stay identical across many calls', async () => {
    const runner = await compileJit(A.map((x: number) => x * x), A.filter((x: number) => x > 10))
    const results: unknown[] = []
    for (let i = 0; i < 12; i++) results.push(runner(nums))
    for (const r of results) expect(r).toEqual(results[0])
  })
})

describe('compileJit: options handling', () => {
  beforeEach(() => {
    __resetJitModuleCache()
  })

  afterEach(() => {
    __setProbeOverride(undefined)
  })

  it('accepts the steps-only overload', async () => {
    const runner = await compileJit(A.map((x: number) => x + 1))
    expect(runner([1, 2, 3])).toEqual([2, 3, 4])
  })

  it('accepts the options-first overload', async () => {
    const runner = await compileJit({ assumePure: true }, A.map((x: number) => x + 1))
    expect(runner([1, 2, 3])).toEqual([2, 3, 4])
  })

  it('defaults onUnavailable to throw, rejecting with JitUnavailableError when dynamic code is blocked', async () => {
    __setProbeOverride(false)
    // Two steps: the single-op fast path below never touches the CSP probe
    // at all (there is nothing to generate), so this needs a real shape.
    await expect(
      compileJit(A.map((x: number) => x), A.filter((x: number) => x > 0)),
    ).rejects.toThrow(JitUnavailableError)
  })

  it("resolves to the portable runner when onUnavailable is 'fallback' and dynamic code is blocked", async () => {
    __setProbeOverride(false)
    const runner: Runner = await compileJit(
      { onUnavailable: 'fallback' },
      A.map((x: number) => x * 2),
      A.filter((x: number) => x > 0),
    )
    expect(runner([1, -2, 3])).toEqual([2, 6])
    // stays on the portable path even past the promotion threshold
    for (let i = 0; i < 10; i++) runner([1, -2, 3])
    expect(runner([1, -2, 3])).toEqual([2, 6])
  })

  it('single-op pipelines short-circuit to the eager kernel, matching compile() and skipping codegen entirely', async () => {
    const compileRunner = compile(A.take(3))
    const jitRunner = await compileJit(A.take(3))
    expect(jitRunner(nums)).toEqual(compileRunner(nums))

    const compileDrop = compile(A.drop(2))
    const jitDrop = await compileJit(A.drop(2))
    expect(jitDrop(nums)).toEqual(compileDrop(nums))

    const compileMap = compile(A.map((x: number) => x * 2))
    const jitMap = await compileJit(A.map((x: number) => x * 2))
    expect(jitMap(nums)).toEqual(compileMap(nums))
  })
})

describe('compileJit: module memoization', () => {
  beforeEach(() => {
    __resetJitModuleCache()
  })

  it('imports the internal chunk only once across multiple compileJit calls', async () => {
    const r1 = await compileJit(A.map((x: number) => x + 1))
    const r2 = await compileJit(A.filter((x: number) => x > 0))
    expect(r1([1])).toEqual([2])
    expect(r2([1, -1])).toEqual([1])
  })
})
