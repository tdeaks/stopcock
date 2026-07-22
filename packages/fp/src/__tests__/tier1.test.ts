import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test'
import { pipe } from '../pipe'
import * as A from '../array'
import { buildPlan } from '../plan'
import { interpret } from '../interpret'
import { compile, explainRunner, explainSteps, explainPipeline, __resetJitModuleCache, __shapeEntryForSteps } from '../compile'
import { __clearEntries } from '../shape-entry'
import { generateShapeRunner, __setProbeOverride } from '../jit-chunk'

function tracked<F extends (...args: any[]) => any>(fn: F): F & { calls: unknown[][] } {
  const calls: unknown[][] = []
  const wrapped = ((...args: unknown[]) => {
    calls.push(args)
    return fn(...(args as Parameters<F>))
  }) as F & { calls: unknown[][] }
  wrapped.calls = calls
  return wrapped
}

// The dynamic import of jit-chunk.ts can take several event-loop turns to
// settle (it's a real module load, not a plain Promise.resolve); a handful
// of zero-delay timeouts reliably drains it and any .then chain hung off it
// before assertions run.
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  __clearEntries()
  __resetJitModuleCache()
  __setProbeOverride(undefined)
})

afterEach(() => {
  __setProbeOverride(undefined)
})

describe('tier 1: bare pipe adaptive promotion', () => {
  it('promotes a shape to tier 1 after 8 executions, once the chunk settles', async () => {
    const inc = (x: number) => x + 1
    const positive = (x: number) => x > 0
    const mapStep = A.map(inc)
    const filterStep = A.filter(positive)

    for (let i = 0; i < 8; i++) pipe([1, -2, 3], mapStep, filterStep)
    await settle()

    const entry = __shapeEntryForSteps([mapStep, filterStep])
    expect(entry.tier).toBe(1)
    expect(entry.chunkState).toBe('loaded')
    expect(entry.generatedAt).not.toBeNull()

    // still correct once generated
    expect(pipe([1, -2, 3], mapStep, filterStep)).toEqual([2, 4])
  })

  it('accounts consumed elements from what the loop actually read, not input length', async () => {
    // dropWhile/take is never a portable-templates match (those only ever
    // start with map/filter/filterMap/reject), so this exercises the
    // switch interpreter directly, not a template's conservative estimate.
    const neverDrop = (_x: number) => false
    const dropStep = A.dropWhile(neverDrop)
    const takeStep = A.take(1)
    const huge = Array.from({ length: 1_000_000 }, (_, i) => i)

    for (let i = 0; i < 8; i++) pipe(huge, dropStep, takeStep)
    // Drain this test's own promotion request before it ends: otherwise the
    // dangling promise settles during a later test and repopulates the
    // process-wide resolved-module cache out from under it.
    await settle()

    const entry = __shapeEntryForSteps([dropStep, takeStep])
    expect(entry.execCount).toBe(8)
    expect(entry.consumedElements).toBeLessThan(100)
  })

  it('accounts consumed elements exactly for a take-limited portable template, not the full source length', async () => {
    // map -> take IS a portable-templates match (see portable-templates.ts's
    // emitArrayTemplate withLimit variant), unlike the dropWhile/take case
    // above. Its generated loop reports the exact read count on early exit
    // instead of crediting the whole source.
    const inc = (x: number) => x + 1
    const mapStep = A.map(inc)
    const takeStep = A.take(1)
    const huge = Array.from({ length: 1_000_000 }, (_, i) => i)

    const explanation = explainPipeline(mapStep, takeStep)
    expect(explanation.segmentExecutors).toEqual(['template'])

    for (let i = 0; i < 8; i++) pipe(huge, mapStep, takeStep)
    await settle()

    const entry = __shapeEntryForSteps([mapStep, takeStep])
    expect(entry.execCount).toBe(8)
    expect(entry.consumedElements).toBeLessThan(100)
  })

  it('never promotes and records a csp disable reason when dynamic code is unavailable', async () => {
    __setProbeOverride(false)
    const double = (x: number) => x * 2
    // A distinct op shape (map -> reject, not map -> filter) from the other
    // cases in this file: pipe()'s own opcode-keyed front cache is a
    // separate, unbounded-lifetime cache from the shape registry (see
    // pipe.ts) and never gets cleared by __clearEntries -- reusing a shape
    // another test already drove through pipe() would silently dispatch
    // through that other test's (by-then-mutated) entry object instead of
    // the fresh one this test's shape resolves to.
    const step = A.map(double)
    const step2 = A.reject((x: number) => x <= 0)

    for (let i = 0; i < 8; i++) pipe([1, -2, 3], step, step2)
    await settle()

    const explanation = explainSteps(step, step2)
    expect(explanation.tier).toBe(0)
    expect(explanation.disabledReasons).toContain('csp')

    // stays correct, and never retries the probe for this entry
    expect(pipe([1, -2, 3], step, step2)).toEqual([2, 6])
  })
})

describe('tier 1: compile()/compilePure() eager generation', () => {
  it('requests generation at construction and swaps to tier 1 once the chunk resolves', async () => {
    const runner = compile(A.map((x: number) => x + 1), A.filter((x: number) => x > 0))
    await settle()

    // compile()'s runner has a fixed callback vector, so W4's eager
    // instantiation (no sighting threshold for explicit runners) follows
    // tier 1 immediately — see tier2.test.ts for dedicated tier-2 coverage.
    expect(explainRunner(runner).tier).toBe(2)
    expect(explainRunner(runner).generatedAt).not.toBeNull()
    expect(runner([1, -2, 3])).toEqual([2, 4])
  })
})

describe('tier 1: explainRunner shape', () => {
  it('reports tier, counters, chunk state and disable reasons for a live runner', async () => {
    const runner = compile(A.map((x: number) => x * 2), A.filter((x: number) => x > 2))
    await settle()
    const explanation = explainRunner(runner)
    expect(explanation).toMatchObject({
      // see the note above: compile()'s fixed vector reaches tier 2 directly.
      tier: 2,
      chunkState: 'loaded',
      disabledReasons: [],
    })
    expect(typeof explanation.execCount).toBe('number')
    expect(typeof explanation.consumedElements).toBe('number')
    expect(explanation.generatedAt).toEqual(expect.any(Number))
  })

  it('throws for a value that never went through compile/compilePure/flow/compileJit', () => {
    const notARunner = ((x: number) => x) as unknown as (input: unknown) => unknown
    expect(() => explainRunner(notARunner)).toThrow()
  })
})

describe('tier 1: generated-code semantic equality against the reference interpreter', () => {
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
      name: 'flatMap',
      input: [1, 2, 3],
      build: (t) => [A.flatMap(t((x: number) => [x, x * 10]))],
    },
    {
      name: 'flatMap -> take (stops mid-expansion)',
      input: [1, 2, 3, 4, 5],
      build: (t) => [A.flatMap(t((x: number) => [x, x, x])), A.take(2)],
    },
    { name: 'take', input: nums, build: () => [A.take(4)] },
    {
      name: 'dropWhile',
      input: nums,
      build: (t) => [A.dropWhile(t((x: number) => x > 1))],
    },
    {
      name: 'dropWhile -> take',
      input: nums,
      build: (t) => [A.dropWhile(t((x: number) => x !== 8)), A.take(2)],
    },
    {
      name: 'map -> reduce',
      input: nums,
      build: (t) => [A.map(t((x: number) => x * 2)), A.reduce(t((acc: number, x: number) => acc + x), 0)],
    },
    { name: 'find', input: nums, build: (t) => [A.find(t((x: number) => x > 6))] },
    { name: 'find (absent)', input: nums, build: (t) => [A.find(t((x: number) => x > 100))] },
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

  it('covers every op named in the plan (map/filter/flatMap/take/dropWhile/reduce/find/sort-boundary/uniq)', () => {
    const names = cases.map((c) => c.name).join(' ')
    for (const op of ['map', 'filter', 'flatMap', 'take', 'dropWhile', 'reduce', 'find', 'sort', 'uniq']) {
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
      const generated = generateShapeRunner(genPlan.shape)
      const genResult = generated(cloneInput(testCase.input), genPlan.bindings)

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
})
