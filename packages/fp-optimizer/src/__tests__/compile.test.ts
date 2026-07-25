import { describe, it, expect } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as S from '@stopcock/fp/string'
import { buildPlan } from '../plan-bridge'
import { interpret } from '@stopcock/fp/abi'
import { compile, compilePure, getOptimizerStats, resetOptimizerStats } from '../compile'
import { explain, explainPure } from '../explain'

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
    name: 'map -> flatMap -> filter -> filterMap -> reduce',
    input: [1, 2, 3, 4],
    build: (t) => [
      A.map(t((x: number) => x + 1)),
      A.flatMap(t((x: number) => [x, x * 2])),
      A.filter(t((x: number) => (x & 1) === 0)),
      A.filterMap(t((x: number) => (x === 4 ? undefined : x + 10))),
      A.reduce(t((total: number, x: number) => total - x), 0),
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
  { name: 'min', input: nums, build: () => [A.min] },
  { name: 'max', input: nums, build: () => [A.max] },
  { name: 'reverse', input: nums, build: () => [A.reverse] },
  { name: 'sort', input: nums, build: () => [A.sort] },
  { name: 'sortAsc', input: nums, build: () => [A.sortAsc] },
  { name: 'sortDesc', input: nums, build: () => [A.sortDesc] },
  { name: 'sortBy', input: nums, build: (t) => [A.sortBy(t((a: number, b: number) => a - b))] },
  { name: 'uniq', input: [1, 1, 2, 2, 3, 1], build: () => [A.uniq] },
  { name: 'head', input: nums, build: () => [A.head] },
  { name: 'last', input: nums, build: () => [A.last] },
  { name: 'length', input: nums, build: () => [A.length] },
  { name: 'isEmpty', input: [], build: () => [A.isEmpty] },
  { name: 'isEmpty (non-empty)', input: nums, build: () => [A.isEmpty] },
  { name: 'tail', input: nums, build: () => [A.tail] },
  { name: 'init', input: nums, build: () => [A.init] },
  { name: 'map -> sum', input: nums, build: (t) => [A.map(t((x: number) => x * 3)), A.sum] },
  {
    name: 'filter -> reverse',
    input: nums,
    build: (t) => [A.filter(t((x: number) => x % 2 === 0)), A.reverse],
  },
  {
    name: 'map -> sort -> take',
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
  { name: 'scalar: trim -> toUpperCase', input: '  hello  ', build: () => [S.trim, S.toUpperCase] },
  {
    name: 'scalar: toLowerCase -> trimStart -> trimEnd',
    input: '  HeLLo World  ',
    build: () => [S.toLowerCase, S.trimStart, S.trimEnd],
  },
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
    build: (t) => [A.reject(t((x: number) => x > 5)), A.count(t((x: number) => true))],
  },
  {
    name: 'filterMap -> sum',
    input: nums,
    build: (t) => [A.filterMap(t((x: number) => (x % 2 === 0 ? x : undefined))), A.sum],
  },
  { name: 'opaque whole-array step', input: [1, 2, 3], build: () => [(arr: readonly number[]) => arr.map((x) => x * 2)] },
  {
    name: 'map -> opaque -> filter',
    input: nums,
    build: (t) => [
      A.map(t((x: number) => x + 1)),
      (arr: readonly number[]) => arr.slice().reverse(),
      A.filter(t((x: number) => x > 3)),
    ],
  },
]

describe('compile: differential against reference interpreter', () => {
  it(`covers at least 40 pipelines`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(40)
  })

  for (const testCase of cases) {
    it(`matches interpret() for: ${testCase.name}`, () => {
      const interpTracked: Array<{ calls: unknown[][] }> = []
      const trackInterp = <F extends (...args: any[]) => any>(fn: F): F => {
        const w = tracked(fn)
        interpTracked.push(w)
        return w
      }
      const compileTracked: Array<{ calls: unknown[][] }> = []
      const trackCompile = <F extends (...args: any[]) => any>(fn: F): F => {
        const w = tracked(fn)
        compileTracked.push(w)
        return w
      }

      const stepsForInterp = testCase.build(trackInterp)
      const stepsForCompile = testCase.build(trackCompile)

      const cloneInput = (value: unknown): unknown => (Array.isArray(value) ? value.slice() : value)

      const plan = buildPlan(stepsForInterp)
      const interpResult = interpret(plan, cloneInput(testCase.input))

      const runner = compile(...stepsForCompile)
      const compileResult = runner(cloneInput(testCase.input))

      expect(compileResult).toEqual(interpResult)
      expect(compileTracked.length).toBe(interpTracked.length)
      for (let i = 0; i < interpTracked.length; i++) {
        expect(compileTracked[i].calls.length).toBe(interpTracked[i].calls.length)
        expect(compileTracked[i].calls).toEqual(interpTracked[i].calls)
      }
    })
  }
})

describe('compile: bound single-filter runner', () => {
  it('snapshots length, visits sparse slots, and passes only the value', () => {
    const input = new Array<number | undefined>(3)
    input[1] = 2
    const calls: unknown[][] = []
    const runner = compile(
      A.filter((...args: [number | undefined]) => {
        calls.push(args)
        if (calls.length === 1) input.push(99)
        return true
      }),
    )

    expect(runner(input)).toEqual([undefined, 2, undefined])
    expect(calls).toEqual([[undefined], [2], [undefined]])
  })

  it('keeps alternating compiled predicates independently bound', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const evens = compile(A.filter((value: number) => value % 2 === 0))
    const overThree = compile(A.filter((value: number) => value > 3))

    for (let iteration = 0; iteration < 20; iteration++) {
      expect(evens(input)).toEqual([2, 4, 6])
      expect(overThree(input)).toEqual([4, 5, 6])
    }
  })
})

describe('compilePure', () => {
  it('sort -> take produces the same set/order as exact for ascending sort', () => {
    const exact = compile(A.sort, A.take(3))(nums)
    const pure = compilePure(A.sort, A.take(3))(nums)
    expect(pure).toEqual(exact)
  })

  it('sortBy -> take stable top-k ties break by source index', () => {
    const input = [{ k: 1, i: 'a' }, { k: 1, i: 'b' }, { k: 0, i: 'c' }, { k: 1, i: 'd' }]
    const byK = A.sortBy((a: { k: number }, b: { k: number }) => a.k - b.k)
    const pure = compilePure(byK, A.take(3))(input) as Array<{ k: number; i: string }>
    // stable: k=0 (c) first, then the k=1 group in original order (a, b, d)
    expect(pure.map((e) => e.i)).toEqual(['c', 'a', 'b'])
  })

  it('sortDesc -> take applies descending comparator in the top-k rewrite', () => {
    const exact = compile(A.sortDesc, A.take(3))(nums)
    const pure = compilePure(A.sortDesc, A.take(3))(nums)
    expect(pure).toEqual(exact)
  })

  it('map elision before length reduces callback count and keeps the result', () => {
    const calls: number[] = []
    const exactLen = compile(A.map((x: number) => (calls.push(x), x * 2)), A.length)(nums)
    calls.length = 0
    const pureLen = compilePure(A.map((x: number) => (calls.push(x), x * 2)), A.length)(nums)
    expect(pureLen).toBe(exactLen)
    expect(calls.length).toBe(0)
  })

  it('explanation lists the applied rewrite for sort -> take', () => {
    const explanation = explainPure(A.sort, A.take(3))
    expect(explanation.rewrites.some((rewrite) => rewrite.kind === 'top-k')).toBe(true)
    expect(explanation.semanticMode).toBe('pure')
  })

  it('explanation lists the applied rewrite for map -> length', () => {
    const explanation = explainPure(A.map((x: number) => x), A.length)
    expect(explanation.rewrites.some((rewrite) => rewrite.kind === 'elide-unused-map')).toBe(true)
  })

  it('reports exact semantics with no rewrites when none apply', () => {
    const explanation = explain(A.map((x: number) => x * 2), A.sum)
    expect(explanation.rewrites.length).toBe(0)
    expect(explanation.semanticMode).toBe('exact')
  })
})

describe('explain', () => {
  it('reports domains and materialization boundaries for map -> sort -> take', () => {
    const explanation = explain(A.map((x: number) => x), A.sort, A.take(3))
    expect(explanation.domains).toEqual(['array', 'array', 'array'])
    expect(explanation.materializationBoundaries.length).toBe(1)
    expect(explanation.executor).toBe('portable')
  })

  it('snapshot: map -> filter -> reduce', () => {
    const explanation = explain(
      A.map((x: number) => x + 1),
      A.filter((x: number) => x > 0),
      A.reduce((acc: number, x: number) => acc + x, 0),
    )
    expect(explanation.segments.length).toBe(1)
    expect(explanation.materializationBoundaries).toEqual([])
  })

  it('snapshot: sort -> take -> reverse', () => {
    const explanation = explain(A.sort, A.take(3), A.reverse)
    expect(explanation.materializationBoundaries.length).toBe(2)
  })
})

describe('shape cache reuse', () => {
  it('two compiles with the same shape but different callbacks both produce correct, independent results', () => {
    const a = compile(A.map((x: number) => x + 1), A.filter((x: number) => x > 3))
    const b = compile(A.map((x: number) => x * 10), A.filter((x: number) => x > 30))
    expect(a(nums)).toEqual([6, 4, 9, 10, 8, 5, 7])
    expect(b(nums)).toEqual([50, 80, 90, 70, 40, 60])
  })

  it('respects the 256-entry LRU bound: 300 distinct shapes still each compute correctly', () => {
    resetOptimizerStats()
    const runners: Array<(x: readonly number[]) => unknown> = []
    for (let i = 0; i < 300; i++) {
      // Distinct shapes: alternate segment length by varying step count.
      const steps: unknown[] = [A.map((x: number) => x + i)]
      for (let j = 0; j < (i % 5); j++) steps.push(A.filter((x: number) => x > j))
      runners.push(compile(...steps) as (x: readonly number[]) => unknown)
    }
    const stats = getOptimizerStats()
    expect(stats.shapeCacheSize).toBeLessThanOrEqual(256)
    expect(stats.shapeCacheMisses).toBeGreaterThan(0)

    for (let i = 0; i < 300; i++) {
      const steps: unknown[] = [A.map((x: number) => x + i)]
      for (let j = 0; j < (i % 5); j++) steps.push(A.filter((x: number) => x > j))
      const expected = compile(...steps)(nums)
      expect(runners[i](nums)).toEqual(expected)
    }
  })
})

describe('reentrancy', () => {
  it('a compiled runner invoked from within another running compiled runner returns correct results for both', () => {
    const inner = compile(A.map((x: number) => x * 2), A.filter((x: number) => x > 5))
    let innerResultDuringOuter: unknown
    const outer = compile(
      A.map((x: number) => {
        if (x === nums[2]) innerResultDuringOuter = inner([1, 2, 3, 4])
        return x + 1
      }),
      A.sum,
    )
    const outerResult = outer(nums)
    expect(innerResultDuringOuter).toEqual([6, 8])
    expect(outerResult).toBe(compile(A.map((x: number) => x + 1), A.sum)(nums))
    expect(inner(nums)).toEqual(inner([...nums]))
  })
})

describe('optimizer stats', () => {
  it('resetOptimizerStats zeroes the counters without altering execution', () => {
    resetOptimizerStats()
    const before = getOptimizerStats()
    expect(before.plansBuilt).toBe(0)
    const runner = compile(A.map((x: number) => x * 2))
    expect(runner(nums)).toEqual(nums.map((x) => x * 2))
    const after = getOptimizerStats()
    expect(after.plansBuilt).toBeGreaterThan(0)
  })
})
