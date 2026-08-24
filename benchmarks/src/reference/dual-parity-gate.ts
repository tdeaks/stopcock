/**
 * Invariant 3 (2026-08-24-dual-performance-first.md): the dual emission's
 * factories must stay at parity with the single-form emission they replaced,
 * on the row kinds that hold the current performance figures. The reference
 * side is the frozen single-form factory, byte-copied from the last
 * pre-dual emission (3e95eaf^ is the last commit that shipped it); the
 * curried closures inside the shipped dual ops are asserted byte-identical
 * to these in packages/fp's own dual-emission.test.ts, so what this gate
 * actually measures is the cost of the dispatch branch and anything an
 * engine does differently around it. Phase 0's decision suite
 * (benchmarks/src/dual-dispatch.bench.ts) measured that cost at zero;
 * this gate fails closed if a template change ever makes it real.
 *
 * Floor: geomean >= 0.97 across rows, no row below 0.90.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as A from '../../../packages/fp/src/array'
import * as M from '../../../packages/fp/src/math'
import { pipe } from '../../../packages/fp/src/pipe'
import { currentPerfEngine, expectedEngineName, type PerfEngine } from './perf-engine'
import { geomean, runPaired } from './perf-runner'

// ---------------------------------------------------------------------------
// Frozen single-form factories (the pre-dual emission, byte-copied)
// ---------------------------------------------------------------------------

const frozenMap: (f: (a: number) => number) => (arr: readonly number[]) => number[] =
  function map(f: any) {
    return function (arr: any) {
      const len = arr.length,
        out = new Array(len)
      for (let i = 0; i < len; i++) out[i] = f(arr[i])
      return out
    }
  } as any

const frozenFilter: (pred: (a: number) => boolean) => (arr: readonly number[]) => number[] =
  function filter(pred: any) {
    return function (arr: any) {
      const out: any[] = []
      for (let i = 0, len = arr.length; i < len; i++) {
        const v = arr[i]
        if (pred(v)) out.push(v)
      }
      return out
    }
  } as any

const frozenTake: (n: number) => (arr: readonly number[]) => number[] = function take(n: any) {
  return function (arr: any) {
    let len = arr.length
    if (n <= 0) {
      return []
    } else {
      return arr.slice(0, n > len ? len : n)
    }
  }
} as any

const frozenAdd: (b: number) => (a: number) => number = function add(b: any) {
  return function (a: any) {
    return a + b;
  }
} as any

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type DualParityRowId =
  | 'hoisted-pipe/map->filter/1000'
  | 'hoisted-pipe/map->filter/100000'
  | 'construction/map/1000'
  | 'construction/map/100000'
  | 'construction/take/10000'
  | 'hoisted-scalar/add'
  | 'construction/add'

interface DualParityPolicy {
  readonly minimumRounds: number
  readonly warmupRounds: number
  readonly maximumRme: number
  readonly minimumGeomean: number
  readonly minimumRowRatio: number
}

export const DUAL_PARITY_POLICIES = Object.freeze({
  'bun-jsc': Object.freeze({
    minimumRounds: 40,
    warmupRounds: 5,
    maximumRme: 15,
    minimumGeomean: 0.97,
    minimumRowRatio: 0.9,
  }),
  'node-v8': Object.freeze({
    minimumRounds: 40,
    warmupRounds: 5,
    maximumRme: 15,
    minimumGeomean: 0.97,
    minimumRowRatio: 0.9,
  }),
} satisfies Readonly<Record<PerfEngine['id'], DualParityPolicy>>)

function xorshift32(seed: number) {
  let state = seed
  return () => {
    state ^= state << 13
    state ^= state >> 17
    state ^= state << 5
    return (state >>> 0) / 0xffffffff
  }
}

function floats(n: number, seed: number): number[] {
  const rand = xorshift32(seed)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) out[i] = rand()
  return out
}

const double = (x: number): number => x * 2
const keepMod3 = (x: number): boolean => x % 3 !== 0

const data1k = floats(1_000, 301)
const data10k = floats(10_000, 302)
const data100k = floats(100_000, 303)

const shippedMapStep = A.map(double)
const shippedFilterStep = A.filter(keepMod3)
const frozenMapStep = frozenMap(double)
const frozenFilterStep = frozenFilter(keepMod3)
const shippedAddStep = M.add(3)
const frozenAddStep = frozenAdd(3)

interface Row {
  readonly id: DualParityRowId
  readonly iterations: number
  readonly shipped: () => unknown
  readonly frozen: () => unknown
}

const rows: readonly Row[] = [
  {
    id: 'hoisted-pipe/map->filter/1000',
    iterations: 20,
    shipped: () => pipe(data1k, shippedMapStep, shippedFilterStep),
    frozen: () => pipe(data1k, frozenMapStep, frozenFilterStep),
  },
  {
    id: 'hoisted-pipe/map->filter/100000',
    iterations: 1,
    shipped: () => pipe(data100k, shippedMapStep, shippedFilterStep),
    frozen: () => pipe(data100k, frozenMapStep, frozenFilterStep),
  },
  {
    id: 'construction/map/1000',
    iterations: 20,
    shipped: () => A.map(double)(data1k),
    frozen: () => frozenMap(double)(data1k),
  },
  {
    id: 'construction/map/100000',
    iterations: 1,
    shipped: () => A.map(double)(data100k),
    frozen: () => frozenMap(double)(data100k),
  },
  {
    id: 'construction/take/10000',
    iterations: 50,
    shipped: () => A.take(50)(data10k),
    frozen: () => frozenTake(50)(data10k),
  },
  {
    id: 'hoisted-scalar/add',
    iterations: 2_000,
    shipped: () => shippedAddStep(5),
    frozen: () => frozenAddStep(5),
  },
  {
    id: 'construction/add',
    iterations: 2_000,
    shipped: () => M.add(3)(5),
    frozen: () => frozenAdd(3)(5),
  },
]

// ---------------------------------------------------------------------------
// Report and evaluation
// ---------------------------------------------------------------------------

export interface DualParityCase {
  readonly id: DualParityRowId
  readonly correctnessOk: boolean
  readonly rounds: number
  readonly medianRatio: number
  readonly ciLow: number
  readonly ciHigh: number
  readonly relativeMarginOfError: number
}

export interface DualParityReport {
  readonly generatedAt: string
  readonly engine: PerfEngine
  readonly comparison: {
    readonly candidate: 'shipped dual factories'
    readonly reference: 'frozen single-form factories'
    readonly ratio: string
  }
  readonly summary: {
    readonly count: number
    readonly expectedCount: number
    readonly geomeanRatio: number
    readonly minRatio: number
    readonly allCorrect: boolean
    readonly complete: boolean
  }
  readonly cases: readonly DualParityCase[]
  readonly skipped: readonly string[]
}

export interface DualParityEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
}

const recordFailure = (failures: string[], condition: boolean, message: string): void => {
  if (!condition) failures.push(message)
}

export const evaluateDualParityReport = (report: DualParityReport): DualParityEvaluation => {
  const failures: string[] = []
  const supportedEngine = report.engine.id === 'bun-jsc' || report.engine.id === 'node-v8'
  const policy = supportedEngine
    ? DUAL_PARITY_POLICIES[report.engine.id]
    : DUAL_PARITY_POLICIES['bun-jsc']

  recordFailure(
    failures,
    supportedEngine && report.engine.name === expectedEngineName(report.engine.id),
    `unexpected benchmark engine ${report.engine.id}/${report.engine.name}`,
  )
  recordFailure(
    failures,
    report.cases.length === rows.length,
    `report contains ${report.cases.length} cases; expected ${rows.length}`,
  )
  recordFailure(failures, report.summary.complete === true, 'dual-parity report is incomplete')
  recordFailure(failures, report.summary.allCorrect === true, 'dual-parity summary is incorrect')
  recordFailure(
    failures,
    Array.isArray(report.skipped) && report.skipped.length === 0,
    'dual-parity report has a non-empty skipped-case list',
  )

  for (const item of report.cases) {
    recordFailure(failures, item.correctnessOk === true, `${item.id}: outputs differ`)
    recordFailure(
      failures,
      Number.isSafeInteger(item.rounds) && item.rounds >= policy.minimumRounds,
      `${item.id}: used ${item.rounds} rounds`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.relativeMarginOfError) &&
        item.relativeMarginOfError <= policy.maximumRme,
      `${item.id}: RME ${item.relativeMarginOfError.toFixed(2)}% exceeds ${policy.maximumRme.toFixed(2)}%`,
    )
    recordFailure(
      failures,
      item.medianRatio >= policy.minimumRowRatio,
      `${item.id}: ratio ${item.medianRatio.toFixed(3)} is below the row floor ${policy.minimumRowRatio.toFixed(3)}`,
    )
  }

  const ratios = report.cases
    .map((item) => item.medianRatio)
    .filter((r) => Number.isFinite(r) && r > 0)
  recordFailure(
    failures,
    geomean(ratios) >= policy.minimumGeomean,
    `dual-parity geomean ${geomean(ratios).toFixed(3)} is below ${policy.minimumGeomean.toFixed(3)}`,
  )

  return { passed: failures.length === 0, failures: Object.freeze(failures) }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const semanticEqual = (left: unknown, right: unknown): boolean => {
  if (typeof left === 'number' && typeof right === 'number') {
    return (Number.isNaN(left) && Number.isNaN(right)) || Math.abs(left - right) < 1e-9
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => semanticEqual(value, right[index]))
    )
  }
  return Object.is(left, right)
}

let measurementSink: unknown

const batched = (run: () => unknown, iterations: number): (() => void) => {
  return () => {
    let last: unknown
    for (let index = 0; index < iterations; index++) last = run()
    measurementSink = last
  }
}

const relativeMarginOfError = (low: number, high: number, median: number): number =>
  ((high - low) / (2 * median)) * 100

const artifactDirectory = (): string =>
  resolve(process.env.PERF_ARTIFACT_DIR ?? join(tmpdir(), 'stopcock-fp-performance'))

const main = async (): Promise<void> => {
  const engine = currentPerfEngine()
  const policy = DUAL_PARITY_POLICIES[engine.id] ?? DUAL_PARITY_POLICIES['bun-jsc']
  const directory = artifactDirectory()
  const reportPath = join(directory, `dual-parity-${engine.id}.json`)
  const gatePath = join(directory, `dual-parity-${engine.id}-gate.json`)
  const cases: DualParityCase[] = []
  const skipped: string[] = []

  await mkdir(directory, { recursive: true })
  for (const row of rows) {
    try {
      const correctnessOk = semanticEqual(row.shipped(), row.frozen())
      const measured = runPaired(
        batched(row.shipped, row.iterations),
        batched(row.frozen, row.iterations),
        { rounds: policy.minimumRounds, warmupRounds: policy.warmupRounds },
      )
      cases.push({
        id: row.id,
        correctnessOk,
        rounds: measured.pairedRatios.length,
        medianRatio: measured.medianRatio,
        ciLow: measured.ciLow,
        ciHigh: measured.ciHigh,
        relativeMarginOfError: relativeMarginOfError(
          measured.ciLow,
          measured.ciHigh,
          measured.medianRatio,
        ),
      })
    } catch (error) {
      skipped.push(`${row.id}: ${(error as Error).message}`)
    }
  }

  const ratios = cases.map((item) => item.medianRatio)
  const summary = {
    count: cases.length,
    expectedCount: rows.length,
    geomeanRatio: geomean(ratios),
    minRatio: Math.min(...ratios, Number.POSITIVE_INFINITY),
    allCorrect: cases.every((item) => item.correctnessOk),
    complete: cases.length === rows.length && skipped.length === 0,
  }
  const report: DualParityReport = {
    generatedAt: new Date().toISOString(),
    engine,
    comparison: {
      candidate: 'shipped dual factories',
      reference: 'frozen single-form factories',
      ratio: 'frozenNs / shippedNs; greater is shipped faster',
    },
    summary,
    cases,
    skipped,
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const evaluation = evaluateDualParityReport(report)
  await writeFile(
    gatePath,
    `${JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        engine,
        policy,
        reportSummary: summary,
        evaluation,
        passed: evaluation.passed,
      },
      null,
      2,
    )}\n`,
  )

  console.log(`\nDual parity gate, invariant 3 (${engine.name})\n`)
  console.log(['row', 'rounds', 'median', 'CI95', 'RME', 'correct'].join('\t'))
  for (const item of cases) {
    console.log(
      [
        item.id,
        item.rounds,
        item.medianRatio.toFixed(3),
        `[${item.ciLow.toFixed(3)},${item.ciHigh.toFixed(3)}]`,
        `${item.relativeMarginOfError.toFixed(2)}%`,
        item.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(
    `\ngeomean: ${summary.geomeanRatio.toFixed(3)}  min: ${summary.minRatio.toFixed(3)}  (floors: geomean ${policy.minimumGeomean.toFixed(2)}, row ${policy.minimumRowRatio.toFixed(2)})`,
  )
  for (const failure of evaluation.failures) console.error(`FAIL\t${failure}`)
  console.log(`raw report: ${reportPath}`)
  console.log(`gate report: ${gatePath}`)
  void measurementSink
  if (!evaluation.passed) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
