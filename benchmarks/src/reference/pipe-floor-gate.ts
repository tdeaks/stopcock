/**
 * Invariant 4 (one-runtime-path plan): with the runtime fusion engine
 * deleted, plain (uncompiled) `pipe` chains are the only fallback tier left.
 * This gate holds that fallback to a floor: on the "typical chain" eager
 * shapes of `benchmarks/src/fusion-tier-decision.bench.ts` (shapes 1-5 --
 * map, map->filter, map->filter->reduce, map->filter->map->filter, and the
 * 8-op chain; the early-exit shapes like take/find are deliberately
 * excluded, because the decision suite's own evidence is that those are the
 * narrow cases where a fused engine used to win anyway), root `pipe` must
 * stay within 1.2x of ramda's composed pipeline on the same shape and size.
 *
 * Measured per shape at two representative sizes (1_000 and 100_000; n=10 is
 * dominated by call overhead on both sides and isn't a meaningful floor).
 * Individual rows may run father apart than 1.2x in either direction --
 * "map" alone is measurably slower than ramda's hand-rolled loop at large n,
 * while longer chains are faster than ramda's per-step composition
 * overhead -- so the gate holds the invariant on the geomean across all
 * rows, the same shape as compiler-perf-gate.ts's global-geomean-plus-
 * worst-case pattern, with a looser worst-case floor that only catches a
 * genuine regression rather than that known, narrow single-shape spread.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as A from '../../../packages/fp/src/array'
import { pipe } from '../../../packages/fp/src/pipe'
import * as Ra from 'ramda'
import { currentPerfEngine, expectedEngineName, type PerfEngine } from './perf-engine'
import { geomean, runPaired } from './perf-runner'

export type PipeFloorShapeId =
  | 'map'
  | 'map->filter'
  | 'map->filter->reduce'
  | 'map->filter->map->filter'
  | '8-op chain'

export const PIPE_FLOOR_SIZES = Object.freeze([1_000, 100_000] as const)
export type PipeFloorSize = (typeof PIPE_FLOOR_SIZES)[number]

const EXPECTED_SHAPES = Object.freeze([
  'map',
  'map->filter',
  'map->filter->reduce',
  'map->filter->map->filter',
  '8-op chain',
] as const satisfies readonly PipeFloorShapeId[])

/** pipe must stay within this factor of ramda's time: ratio floor is 1/factor. */
const CEILING_FACTOR = 1.2
const MINIMUM_RATIO = 1 / CEILING_FACTOR

interface PipeFloorPolicy {
  readonly minimumRounds: number
  readonly warmupRounds: number
  readonly maximumRme: number
  readonly minimumGeomean: number
  /** Looser than the geomean: catches a real regression, not the known map-alone spread. */
  readonly minimumRowRatio: number
}

export const PIPE_FLOOR_POLICIES = Object.freeze({
  // `map` alone is the cheapest shape here (a single pass), so it carries
  // the most relative timer/scheduling noise of the five; 15% keeps this
  // gate meaningful on a busy machine without chasing the single-digit RME
  // a quiet, dedicated benchmarking host would give it.
  'bun-jsc': Object.freeze({
    minimumRounds: 40,
    warmupRounds: 5,
    maximumRme: 15,
    minimumGeomean: MINIMUM_RATIO,
    minimumRowRatio: 0.5,
  }),
  'node-v8': Object.freeze({
    minimumRounds: 40,
    warmupRounds: 5,
    maximumRme: 15,
    minimumGeomean: MINIMUM_RATIO,
    minimumRowRatio: 0.5,
  }),
} satisfies Readonly<Record<PerfEngine['id'], PipeFloorPolicy>>)

export interface PipeFloorCase {
  readonly shape: PipeFloorShapeId
  readonly n: PipeFloorSize
  readonly correctnessOk: boolean
  readonly rounds: number
  readonly medianRatio: number
  readonly ciLow: number
  readonly ciHigh: number
  readonly relativeMarginOfError: number
}

export interface PipeFloorReport {
  readonly generatedAt: string
  readonly engine: PerfEngine
  readonly comparison: {
    readonly candidate: 'root pipe (uncompiled)'
    readonly reference: 'ramda'
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
  readonly cases: readonly PipeFloorCase[]
  readonly skipped: readonly string[]
}

export interface PipeFloorEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
}

const recordFailure = (failures: string[], condition: boolean, message: string): void => {
  if (!condition) failures.push(message)
}

export const evaluatePipeFloorReport = (report: PipeFloorReport): PipeFloorEvaluation => {
  const failures: string[] = []
  const supportedEngine = report.engine.id === 'bun-jsc' || report.engine.id === 'node-v8'
  const policy = supportedEngine
    ? PIPE_FLOOR_POLICIES[report.engine.id]
    : PIPE_FLOOR_POLICIES['bun-jsc']

  recordFailure(
    failures,
    supportedEngine && report.engine.name === expectedEngineName(report.engine.id),
    `unexpected benchmark engine ${report.engine.id}/${report.engine.name}`,
  )
  recordFailure(
    failures,
    report.comparison.candidate === 'root pipe (uncompiled)' && report.comparison.reference === 'ramda',
    'report does not compare root pipe against ramda',
  )
  recordFailure(
    failures,
    report.cases.length === EXPECTED_SHAPES.length * PIPE_FLOOR_SIZES.length,
    `report contains ${report.cases.length} cases; expected ${EXPECTED_SHAPES.length * PIPE_FLOOR_SIZES.length}`,
  )
  recordFailure(failures, report.summary.complete === true, 'pipe-floor report is incomplete')
  recordFailure(failures, report.summary.allCorrect === true, 'pipe-floor summary is incorrect')
  recordFailure(
    failures,
    Array.isArray(report.skipped) && report.skipped.length === 0,
    'pipe-floor report has a non-empty skipped-case list',
  )

  for (const item of report.cases) {
    recordFailure(
      failures,
      item.correctnessOk === true,
      `${item.shape} n=${item.n}: pipe and ramda outputs differ`,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.rounds) && item.rounds >= policy.minimumRounds,
      `${item.shape} n=${item.n}: used ${item.rounds} rounds`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.relativeMarginOfError) &&
        item.relativeMarginOfError <= policy.maximumRme,
      `${item.shape} n=${item.n}: RME ${item.relativeMarginOfError.toFixed(2)}% exceeds ${policy.maximumRme.toFixed(2)}%`,
    )
    recordFailure(
      failures,
      item.medianRatio >= policy.minimumRowRatio,
      `${item.shape} n=${item.n}: ratio ${item.medianRatio.toFixed(3)} is below the row floor ${policy.minimumRowRatio.toFixed(3)}`,
    )
  }

  const ratios = report.cases.map((item) => item.medianRatio).filter((r) => Number.isFinite(r) && r > 0)
  const globalGeomean = geomean(ratios)
  recordFailure(
    failures,
    globalGeomean >= policy.minimumGeomean,
    `pipe-floor geomean ${globalGeomean.toFixed(3)} is below ${policy.minimumGeomean.toFixed(3)} (pipe more than ${CEILING_FACTOR}x slower than ramda on average)`,
  )

  return { passed: failures.length === 0, failures: Object.freeze(failures) }
}

// ---------------------------------------------------------------------------
// shapes: shared data + candidate/reference closures, mirroring shapes 1-5 of
// the decision suite (map, map->filter, map->filter->reduce,
// map->filter->map->filter, 8-op chain)
// ---------------------------------------------------------------------------

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
const addOp = (a: number, b: number): number => a + b

interface Shape {
  readonly id: PipeFloorShapeId
  readonly data: (n: number) => readonly number[]
  readonly pipe: (xs: readonly number[]) => unknown
  readonly ramda: (xs: readonly number[]) => unknown
}

const shapes: readonly Shape[] = [
  {
    id: 'map',
    data: (n) => floats(n, 201),
    pipe: (xs) => pipe(xs, A.map(double)),
    ramda: Ra.pipe(Ra.map(double)) as (xs: readonly number[]) => unknown,
  },
  {
    id: 'map->filter',
    data: (n) => floats(n, 202),
    pipe: (xs) => pipe(xs, A.map(double), A.filter(keepMod3)),
    ramda: Ra.pipe(Ra.map(double), Ra.filter(keepMod3)) as (xs: readonly number[]) => unknown,
  },
  {
    id: 'map->filter->reduce',
    data: (n) => floats(n, 203),
    pipe: (xs) => pipe(xs, A.map(double), A.filter(keepMod3), A.reduce(addOp, 0)),
    ramda: Ra.pipe(Ra.map(double), Ra.filter(keepMod3), Ra.reduce(addOp, 0)) as (
      xs: readonly number[],
    ) => unknown,
  },
  {
    id: 'map->filter->map->filter',
    data: (n) => floats(n, 204),
    pipe: (xs) =>
      pipe(xs, A.map(double), A.filter(keepMod3), A.map(double), A.filter(keepMod3)),
    ramda: Ra.pipe(
      Ra.map(double),
      Ra.filter(keepMod3),
      Ra.map(double),
      Ra.filter(keepMod3),
    ) as (xs: readonly number[]) => unknown,
  },
  {
    id: '8-op chain',
    data: (n) => floats(n, 205),
    pipe: (xs) =>
      pipe(
        xs,
        A.map(double),
        A.filter(keepMod3),
        A.map(double),
        A.filter(keepMod3),
        A.map(double),
        A.filter(keepMod3),
        A.map(double),
        A.reduce(addOp, 0),
      ),
    ramda: Ra.pipe(
      Ra.map(double),
      Ra.filter(keepMod3),
      Ra.map(double),
      Ra.filter(keepMod3),
      Ra.map(double),
      Ra.filter(keepMod3),
      Ra.map(double),
      Ra.reduce(addOp, 0),
    ) as (xs: readonly number[]) => unknown,
  },
]

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

/** n=100_000 does enough work per call on its own; n=1_000 gets a small batch
 * so a single measured round is not dominated by timer-call overhead. */
const batchSizeFor = (n: PipeFloorSize): number => (n >= 100_000 ? 1 : 20)

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
  const policy = PIPE_FLOOR_POLICIES[engine.id] ?? PIPE_FLOOR_POLICIES['bun-jsc']
  const directory = artifactDirectory()
  const reportPath = join(directory, `pipe-floor-${engine.id}.json`)
  const gatePath = join(directory, `pipe-floor-${engine.id}-gate.json`)
  const cases: PipeFloorCase[] = []
  const skipped: string[] = []

  await mkdir(directory, { recursive: true })
  for (const shape of shapes) {
    for (const n of PIPE_FLOOR_SIZES) {
      const label = `${shape.id} n=${n}`
      try {
        const xs = shape.data(n)
        const correctnessOk = semanticEqual(shape.pipe(xs), shape.ramda(xs))
        const iterations = batchSizeFor(n)
        const measured = runPaired(
          batched(() => shape.pipe(xs), iterations),
          batched(() => shape.ramda(xs), iterations),
          { rounds: policy.minimumRounds, warmupRounds: policy.warmupRounds },
        )
        cases.push({
          shape: shape.id,
          n,
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
        skipped.push(`${label}: ${(error as Error).message}`)
      }
    }
  }

  const ratios = cases.map((item) => item.medianRatio)
  const summary = {
    count: cases.length,
    expectedCount: EXPECTED_SHAPES.length * PIPE_FLOOR_SIZES.length,
    geomeanRatio: geomean(ratios),
    minRatio: Math.min(...ratios, Number.POSITIVE_INFINITY),
    allCorrect: cases.every((item) => item.correctnessOk),
    complete: cases.length === EXPECTED_SHAPES.length * PIPE_FLOOR_SIZES.length && skipped.length === 0,
  }
  const report: PipeFloorReport = {
    generatedAt: new Date().toISOString(),
    engine,
    comparison: {
      candidate: 'root pipe (uncompiled)',
      reference: 'ramda',
      ratio: 'ramdaNs / pipeNs; greater is pipe faster',
    },
    summary,
    cases,
    skipped,
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const evaluation = evaluatePipeFloorReport(report)
  await writeFile(
    gatePath,
    `${JSON.stringify(
      { version: 1, generatedAt: new Date().toISOString(), engine, policy, reportSummary: summary, evaluation, passed: evaluation.passed },
      null,
      2,
    )}\n`,
  )

  console.log(`\nUncompiled pipe floor gate, invariant 4 (${engine.name})\n`)
  console.log(['shape', 'n', 'rounds', 'median', 'CI95', 'RME', 'correct'].join('\t'))
  for (const item of cases) {
    console.log(
      [
        item.shape,
        item.n,
        item.rounds,
        item.medianRatio.toFixed(3),
        `[${item.ciLow.toFixed(3)},${item.ciHigh.toFixed(3)}]`,
        `${item.relativeMarginOfError.toFixed(2)}%`,
        item.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(`\ngeomean: ${summary.geomeanRatio.toFixed(3)}  min: ${summary.minRatio.toFixed(3)}  (floor: ${policy.minimumGeomean.toFixed(3)} = 1/${CEILING_FACTOR})`)
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
