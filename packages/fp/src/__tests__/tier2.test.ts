import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test'
import { pipe } from '../pipe'
import * as A from '../array'
import { buildPlan } from '../plan'
import { interpret } from '../interpret'
import {
  compile,
  explainRunner,
  getOptimizerStats,
  resetOptimizerStats,
  __resetJitModuleCache,
  __shapeEntryForSteps,
} from '../compile'
import { __clearEntries } from '../shape-entry'
import { generateShapeRunner, generateVectorRunner, __setProbeOverride } from '../jit-chunk'
import { FLIP_SATURATION } from '../vector-cache'

function tracked<F extends (...args: any[]) => any>(fn: F): F & { calls: unknown[][] } {
  const calls: unknown[][] = []
  const wrapped = ((...args: unknown[]) => {
    calls.push(args)
    return fn(...(args as Parameters<F>))
  }) as F & { calls: unknown[][] }
  wrapped.calls = calls
  return wrapped
}

// See tier1.test.ts: the dynamic import of jit-chunk.ts can take several
// event-loop turns to settle.
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  __clearEntries()
  __resetJitModuleCache()
  __setProbeOverride(undefined)
  resetOptimizerStats()
})

afterEach(() => {
  __setProbeOverride(undefined)
})

describe('tier 2: compile() reaches it directly (no sighting threshold)', () => {
  it('an explicit runner is at tier 2 once the chunk settles', async () => {
    const runner = compile(A.map((x: number) => x * 2), A.filter((x: number) => x > 0))
    await settle()

    expect(explainRunner(runner).tier).toBe(2)
    expect(getOptimizerStats().vectorRunners).toBe(1)
    expect(runner([1, -2, 3])).toEqual([2, 6])
  })
})

describe('tier 2: bare pipe adaptive promotion, vector sighting threshold', () => {
  it('reaches tier 2 only after the vector recurs 3 times at tier 1', async () => {
    const inc = (x: number) => x + 1
    const positive = (x: number) => x > 0
    const mapStep = A.map(inc)
    const filterStep = A.filter(positive)

    // 8 calls to cross the tier-0 -> tier-1 promotion threshold.
    for (let i = 0; i < 8; i++) pipe([1, -2, 3], mapStep, filterStep)
    await settle()

    const entry = __shapeEntryForSteps([mapStep, filterStep])
    expect(entry.tier).toBe(1)
    expect(entry.vectorRunners.length).toBe(0)

    // Same exact callback vector recurs: sighting count climbs toward 3.
    pipe([1, -2, 3], mapStep, filterStep)
    expect(entry.vectorRunners.length).toBe(0)
    pipe([1, -2, 3], mapStep, filterStep)
    expect(entry.vectorRunners.length).toBe(0)
    pipe([1, -2, 3], mapStep, filterStep)
    expect(entry.vectorRunners.length).toBe(1)

    expect(getOptimizerStats().vectorRunners).toBeGreaterThanOrEqual(1)
    expect(pipe([1, -2, 3], mapStep, filterStep)).toEqual([2, 4])
  })

  it('never instantiates tier 2 for a vector seen fewer than 3 times', async () => {
    // A distinct op shape (map -> reject, not map -> filter) from the other
    // tests in this file: pipe()'s opcode-keyed front cache is a separate,
    // unbounded-lifetime cache from the shape registry (see pipe.ts) and
    // never gets cleared by __clearEntries -- reusing another test's shape
    // would dispatch through that test's already-warmed entry instead of a
    // fresh one.
    const dbl = (x: number) => x * 2
    const nonNeg = (x: number) => x < 0
    const mapStep = A.map(dbl)
    const rejectStep = A.reject(nonNeg)

    for (let i = 0; i < 8; i++) pipe([1, 2, 3], mapStep, rejectStep)
    await settle()

    const entry = __shapeEntryForSteps([mapStep, rejectStep])
    expect(entry.tier).toBe(1)

    pipe([1, 2, 3], mapStep, rejectStep)
    pipe([1, 2, 3], mapStep, rejectStep)
    expect(entry.vectorRunners.length).toBe(0)
  })
})

describe('tier 2: churn — alternating vectors over one shape never thrashes', () => {
  it('caps at exactly the sighted set (2) and stays correct across many alternations', async () => {
    // filter -> map (not map -> filter): a distinct op shape from the other
    // bare-pipe tests in this file, for the same front-cache-collision
    // reason noted above.
    const incA = (x: number) => x + 1
    const posA = (x: number) => x > -10
    const incB = (x: number) => x + 100
    const posB = (x: number) => x > -10

    const stepsA = [A.filter(posA), A.map(incA)] as const
    const stepsB = [A.filter(posB), A.map(incB)] as const

    // Warm the shared shape to tier 1 first (op sequence is identical for
    // both vectors: filter, map).
    for (let i = 0; i < 8; i++) pipe([1, -2, 3], ...stepsA)
    await settle()

    const entry = __shapeEntryForSteps(stepsA)
    expect(entry.tier).toBe(1)

    // Alternate the two vectors. Each needs 3 sightings before it earns a
    // tier-2 slot; interleaving means neither reaches 3 until round 3, then
    // both are instantiated and every further call is a cache hit.
    for (let round = 0; round < 20; round++) {
      pipe([1, -2, 3], ...stepsA)
      pipe([1, -2, 3], ...stepsB)
    }

    expect(entry.vectorRunners.length).toBe(2)
    const stableCount = entry.vectorRunners.length

    // Many more alternations must not grow the runner set or regress
    // output correctness (no thrash).
    for (let round = 0; round < 50; round++) {
      expect(pipe([1, -2, 3], ...stepsA)).toEqual([2, -1, 4])
      expect(pipe([1, -2, 3], ...stepsB)).toEqual([101, 98, 103])
      expect(entry.vectorRunners.length).toBe(stableCount)
    }
  })

  it('sustained alternation saturates the flip guard and dispatches tier 1, then recovers once alternation stops', async () => {
    const incA = (x: number) => x + 1
    const posA = (x: number) => x > -10
    const incB = (x: number) => x + 5
    const posB = (x: number) => x > -10

    // A third distinct op shape (map -> filter -> map is impossible to fuse
    // that way, so use reject -> map) to avoid front-cache collisions with
    // the other bare-pipe tests in this file.
    const stepsA = [A.reject(posA), A.map(incA)] as const
    const stepsB = [A.reject(posB), A.map(incB)] as const

    for (let i = 0; i < 8; i++) pipe([1, -2, 3], ...stepsA)
    await settle()

    const entry = __shapeEntryForSteps(stepsA)
    expect(entry.tier).toBe(1)

    let tier1Calls = 0
    const originalRun = entry.run
    entry.run = (data, bindings, meta) => {
      tier1Calls++
      return originalRun(data, bindings, meta)
    }

    // Warm both vectors to tier 2 (3 sightings each).
    for (let round = 0; round < 3; round++) {
      pipe([1, -2, 3], ...stepsA)
      pipe([1, -2, 3], ...stepsB)
    }
    expect(entry.vectorRunners.length).toBe(2)

    // Sustained alternation: every dispatch is a flip, so the saturating
    // counter climbs to FLIP_SATURATION and dispatch falls back to tier 1
    // -- proving alternation doesn't keep paying tier-2's call-site cost.
    for (let round = 0; round < FLIP_SATURATION + 5; round++) {
      pipe([1, -2, 3], ...stepsA)
      pipe([1, -2, 3], ...stepsB)
    }
    expect(entry.vectorFlipCount).toBeGreaterThanOrEqual(FLIP_SATURATION)
    const tier1CallsDuringChurn = tier1Calls
    expect(tier1CallsDuringChurn).toBeGreaterThan(0)

    // Recovery: alternation stops, one vector recurs exclusively. The
    // saturating counter decays on every same-slot hit (not a permanent
    // demotion). The very first call after switching away from alternation
    // still sees a saturated counter (a one-time transition cost, not a
    // bug) and may dispatch tier 1 once more; every call after that must
    // settle back onto tier 2 with no further tier-1 dispatches.
    pipe([1, -2, 3], ...stepsA)
    const tier1CallsAfterFirstSwitch = tier1Calls
    for (let round = 0; round < FLIP_SATURATION + 5; round++) {
      pipe([1, -2, 3], ...stepsA)
    }
    expect(entry.vectorFlipCount).toBe(0)
    expect(tier1Calls).toBe(tier1CallsAfterFirstSwitch)

    entry.run = originalRun
  })
})

describe('tier 2: vector cache eviction, downgrade to tier 1', () => {
  it('the oldest vector falls back to tier 1 once the 64-slot global cache overflows', async () => {
    const runners: Array<(input: unknown) => unknown> = []
    for (let i = 0; i < 65; i++) {
      const inc = (x: number) => x + i
      const positive = (x: number) => x > i - 1000
      const runner = compile(A.map(inc), A.filter(positive))
      runners.push(runner)
      if (i === 0) await settle()
    }

    expect(getOptimizerStats().vectorRunners).toBeLessThanOrEqual(64)
    expect(getOptimizerStats().cacheEvictions).toBeGreaterThanOrEqual(1)

    // The oldest vector was evicted: its runner falls back to tier 1, not 0.
    expect(explainRunner(runners[0]).tier).toBe(1)
    // The most recently built vector is still resident at tier 2.
    expect(explainRunner(runners[64]).tier).toBe(2)

    expect(runners[0]([1, 2, 3])).toEqual(runners[0]([1, 2, 3]))
    expect(runners[64]([1, 2, 3])).toEqual([1 + 64, 2 + 64, 3 + 64].filter((x) => x > 64 - 1000))
  })
})

describe('tier 2: generated-code semantic equality against the reference interpreter', () => {
  const nums = [5, 3, 8, 1, 9, 2, 7, 4, 6, 0]

  interface Case {
    readonly name: string
    readonly input: unknown
    readonly build: (track: <F extends (...args: any[]) => any>(fn: F) => F) => unknown[]
  }

  const cases: Case[] = [
    { name: 'map', input: nums, build: (t) => [A.map(t((x: number) => x * 2))] },
    { name: 'filter', input: nums, build: (t) => [A.filter(t((x: number) => x % 2 === 0))] },
    {
      name: 'flatMap -> take (stops mid-expansion)',
      input: [1, 2, 3, 4, 5],
      build: (t) => [A.flatMap(t((x: number) => [x, x, x])), A.take(2)],
    },
    {
      name: 'map -> reduce',
      input: nums,
      build: (t) => [A.map(t((x: number) => x * 2)), A.reduce(t((acc: number, x: number) => acc + x), 0)],
    },
    { name: 'find', input: nums, build: (t) => [A.find(t((x: number) => x > 6))] },
    {
      name: 'filter -> sort boundary -> take',
      input: nums,
      build: (t) => [A.filter(t((x: number) => x % 2 === 0)), A.sort, A.take(2)],
    },
    { name: 'uniq', input: [1, 1, 2, 2, 3, 1], build: () => [A.uniq] },
    {
      name: 'map -> uniq',
      input: [1, 2, 1, 3, 2],
      build: (t) => [A.map(t((x: number) => x % 2)), A.uniq],
    },
  ]

  it('covers map/filter/flatMap/reduce/find/sort-boundary/uniq', () => {
    const names = cases.map((c) => c.name).join(' ')
    for (const op of ['map', 'filter', 'flatMap', 'reduce', 'find', 'sort', 'uniq']) {
      expect(names).toContain(op)
    }
  })

  for (const testCase of cases) {
    it(`matches interpret() output and callback invocation order/count for: ${testCase.name}`, () => {
      const cloneInput = (value: unknown): unknown => (Array.isArray(value) ? value.slice() : value)

      const interpTracked: Array<{ calls: unknown[][] }> = []
      const trackInterp = <F extends (...args: any[]) => any>(fn: F): F => {
        const w = tracked(fn)
        interpTracked.push(w)
        return w
      }
      const genTracked: Array<{ calls: unknown[][] }> = []
      const trackGen = <F extends (...args: any[]) => any>(fn: F): F => {
        const w = tracked(fn)
        genTracked.push(w)
        return w
      }

      const stepsForGen = testCase.build(trackGen)
      const genPlan = buildPlan(stepsForGen)
      // Same output tier 1 (generateShapeRunner) would produce, but the
      // callback vector is closed over at instantiation rather than read
      // from a runtime `bindings` parameter.
      const vectorRunner = generateVectorRunner(genPlan.shape, genPlan.bindings)
      const genResult = vectorRunner(cloneInput(testCase.input))

      const stepsForInterp = testCase.build(trackInterp)
      const interpPlan = buildPlan(stepsForInterp)
      const interpResult = interpret(interpPlan, cloneInput(testCase.input))

      expect(genResult).toEqual(interpResult)
      expect(genTracked.length).toBe(interpTracked.length)
      for (let i = 0; i < interpTracked.length; i++) {
        expect(genTracked[i].calls).toEqual(interpTracked[i].calls)
      }
    })
  }

  it('generateVectorRunner agrees with generateShapeRunner (tier 1) on the same shape and vector', () => {
    const steps = [A.map((x: number) => x * 3), A.filter((x: number) => x > 5)]
    const plan = buildPlan(steps)
    const tier1 = generateShapeRunner(plan.shape)
    const tier2 = generateVectorRunner(plan.shape, plan.bindings)

    expect(tier2(nums.slice())).toEqual(tier1(nums.slice(), plan.bindings))
  })
})
