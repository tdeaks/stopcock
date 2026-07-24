import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as A from '../../../packages/fp/src/array'
import { pipe } from '../../../packages/fp/src/pipe'
import { baselinePipe } from './pipe-dispatch-baseline'
import { currentPerfEngine, expectedEngineName, type PerfEngine } from './perf-engine'
import { geomean, runPaired } from './perf-runner'

const BASELINE_ID = 'pre-hot-identity-front-cache-v1'
const INPUT = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8])

export type PipeDispatchCaseId = 'stable-2-step' | 'stable-6-step' | 'fresh-2-step' | 'fresh-3-step'

const EXPECTED_CASES = Object.freeze([
  'stable-2-step',
  'stable-6-step',
  'fresh-2-step',
  'fresh-3-step',
] as const satisfies readonly PipeDispatchCaseId[])

interface PipeDispatchPolicy {
  readonly minimumRounds: number
  readonly minimumBatchIterations: number
  readonly warmupRounds: number
  readonly maximumRme: number
  readonly minimumGeomean: number
  readonly minimumRatios: Readonly<Record<PipeDispatchCaseId, number>>
}

export const PIPE_DISPATCH_POLICIES = Object.freeze({
  'bun-jsc': Object.freeze({
    minimumRounds: 60,
    minimumBatchIterations: 2_000,
    warmupRounds: 10,
    maximumRme: 5,
    minimumGeomean: 0.98,
    minimumRatios: Object.freeze({
      'stable-2-step': 1,
      'stable-6-step': 0.98,
      'fresh-2-step': 1,
      'fresh-3-step': 1,
    }),
  }),
  'node-v8': Object.freeze({
    minimumRounds: 60,
    minimumBatchIterations: 8_000,
    warmupRounds: 20,
    maximumRme: 5,
    minimumGeomean: 0.96,
    minimumRatios: Object.freeze({
      'stable-2-step': 1.02,
      'stable-6-step': 0.98,
      'fresh-2-step': 0.94,
      'fresh-3-step': 0.94,
    }),
  }),
} satisfies Readonly<Record<PerfEngine['id'], PipeDispatchPolicy>>)

export interface PipeDispatchCase {
  readonly id: PipeDispatchCaseId
  readonly correctnessOk: boolean
  readonly rounds: number
  readonly batchIterations: number
  readonly medianRatio: number
  readonly meanRatio: number
  readonly ciLow: number
  readonly ciHigh: number
  readonly signTestP: number
  readonly relativeMarginOfError: number
}

export interface PipeDispatchReport {
  readonly generatedAt: string
  readonly engine: PerfEngine
  readonly comparison: {
    readonly candidate: 'current pipe'
    readonly reference: typeof BASELINE_ID
    readonly ratio: string
  }
  readonly args: {
    readonly rounds: number
    readonly batchIterations: number
  }
  readonly summary: {
    readonly count: number
    readonly expectedCount: number
    readonly geomeanRatio: number
    readonly minRatio: number
    readonly allCorrect: boolean
    readonly complete: boolean
  }
  readonly cases: readonly PipeDispatchCase[]
  readonly skipped: readonly string[]
}

export interface PipeDispatchEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
}

const approximatelyEqual = (left: number, right: number): boolean =>
  Number.isFinite(left) &&
  Number.isFinite(right) &&
  Math.abs(left - right) <= Math.max(1e-9, Math.abs(right) * 1e-9)

const recordFailure = (failures: string[], condition: boolean, message: string): void => {
  if (!condition) failures.push(message)
}

export const evaluatePipeDispatchReport = (report: PipeDispatchReport): PipeDispatchEvaluation => {
  const failures: string[] = []
  const supportedEngine = report.engine.id === 'bun-jsc' || report.engine.id === 'node-v8'
  const policy = supportedEngine
    ? PIPE_DISPATCH_POLICIES[report.engine.id]
    : PIPE_DISPATCH_POLICIES['bun-jsc']
  recordFailure(
    failures,
    typeof report.generatedAt === 'string' && Number.isFinite(Date.parse(report.generatedAt)),
    'report has no valid generatedAt timestamp',
  )
  recordFailure(
    failures,
    supportedEngine && report.engine.name === expectedEngineName(report.engine.id),
    `unexpected benchmark engine ${report.engine.id}/${report.engine.name}`,
  )
  recordFailure(
    failures,
    report.comparison.candidate === 'current pipe' && report.comparison.reference === BASELINE_ID,
    'report does not use the retained pipe-dispatch baseline',
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args.rounds) && report.args.rounds >= policy.minimumRounds,
    `report used ${report.args.rounds} rounds; minimum is ${policy.minimumRounds}`,
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args.batchIterations) &&
      report.args.batchIterations >= policy.minimumBatchIterations,
    `report used batch size ${report.args.batchIterations}; minimum is ${policy.minimumBatchIterations}`,
  )
  recordFailure(
    failures,
    report.cases.length === EXPECTED_CASES.length,
    `report contains ${report.cases.length} cases; expected ${EXPECTED_CASES.length}`,
  )
  recordFailure(
    failures,
    report.summary.count === report.cases.length &&
      report.summary.expectedCount === EXPECTED_CASES.length,
    'pipe-dispatch summary counts do not match the case rows',
  )
  recordFailure(failures, report.summary.complete === true, 'pipe-dispatch report is incomplete')
  recordFailure(failures, report.summary.allCorrect === true, 'pipe-dispatch summary is incorrect')
  recordFailure(
    failures,
    Array.isArray(report.skipped) && report.skipped.length === 0,
    'pipe-dispatch report has a malformed or non-empty skipped-case list',
  )

  const seen = new Set<PipeDispatchCaseId>()
  for (const item of report.cases) {
    recordFailure(
      failures,
      EXPECTED_CASES.includes(item.id),
      `unexpected pipe-dispatch case ${item.id}`,
    )
    recordFailure(failures, !seen.has(item.id), `duplicate pipe-dispatch case ${item.id}`)
    seen.add(item.id)
    recordFailure(
      failures,
      item.correctnessOk === true,
      `${item.id}: current pipe and baseline outputs differ`,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.rounds) && item.rounds >= policy.minimumRounds,
      `${item.id}: used ${item.rounds} rounds`,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.batchIterations) &&
        item.batchIterations >= policy.minimumBatchIterations,
      `${item.id}: used batch size ${item.batchIterations}`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.medianRatio) && item.medianRatio > 0,
      `${item.id}: invalid median ratio ${item.medianRatio}`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.meanRatio) && item.meanRatio > 0,
      `${item.id}: invalid mean ratio ${item.meanRatio}`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.ciLow) &&
        item.ciLow > 0 &&
        Number.isFinite(item.ciHigh) &&
        item.ciHigh >= item.ciLow,
      `${item.id}: invalid confidence interval [${item.ciLow}, ${item.ciHigh}]`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.signTestP) && item.signTestP >= 0 && item.signTestP <= 1,
      `${item.id}: invalid sign-test p-value ${item.signTestP}`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.relativeMarginOfError) &&
        item.relativeMarginOfError >= 0 &&
        item.relativeMarginOfError <= policy.maximumRme,
      `${item.id}: relative margin of error ${item.relativeMarginOfError.toFixed(2)}% exceeds ${policy.maximumRme.toFixed(2)}%`,
    )
    recordFailure(
      failures,
      item.medianRatio >= policy.minimumRatios[item.id],
      `${item.id}: ratio ${item.medianRatio.toFixed(3)} is below ${policy.minimumRatios[item.id].toFixed(3)}`,
    )
  }
  for (const id of EXPECTED_CASES) {
    recordFailure(failures, seen.has(id), `missing pipe-dispatch case ${id}`)
  }

  const validRatios = report.cases
    .map((item) => item.medianRatio)
    .filter((ratio) => Number.isFinite(ratio) && ratio > 0)
  const globalGeomean = geomean(validRatios)
  const minimumRatio = validRatios.length === 0 ? Number.NaN : Math.min(...validRatios)
  recordFailure(
    failures,
    approximatelyEqual(report.summary.geomeanRatio, globalGeomean),
    'reported pipe-dispatch geomean does not match the case rows',
  )
  recordFailure(
    failures,
    approximatelyEqual(report.summary.minRatio, minimumRatio),
    'reported pipe-dispatch minimum does not match the case rows',
  )
  recordFailure(
    failures,
    globalGeomean >= policy.minimumGeomean,
    `pipe-dispatch geomean ${globalGeomean.toFixed(3)} is below ${policy.minimumGeomean.toFixed(3)}`,
  )

  return {
    passed: failures.length === 0,
    failures: Object.freeze(failures),
  }
}

const mapStep = A.map((value: number) => value + 1)
const filterStep = A.filter((value: number) => value % 2 === 0)
const longSteps = [
  A.map((value: number) => value + 1),
  A.filter((value: number) => value % 2 === 0),
  A.map((value: number) => value * 2),
  A.filter((value: number) => value > 2),
  A.map((value: number) => value - 1),
  A.reduce((accumulator: number, value: number) => accumulator + value, 0),
] as const

interface Scenario {
  readonly id: PipeDispatchCaseId
  readonly candidate: () => unknown
  readonly reference: () => unknown
}

const scenarios = (): readonly Scenario[] => [
  {
    id: 'stable-2-step',
    candidate: () => pipe(INPUT, mapStep, filterStep),
    reference: () => baselinePipe(INPUT, mapStep, filterStep),
  },
  {
    id: 'stable-6-step',
    candidate: () => pipe(INPUT, ...longSteps),
    reference: () => baselinePipe(INPUT, ...longSteps),
  },
  {
    id: 'fresh-2-step',
    candidate: () =>
      pipe(
        INPUT,
        A.map((value: number) => value + 1),
        A.filter((value: number) => value % 2 === 0),
      ),
    reference: () =>
      baselinePipe(
        INPUT,
        A.map((value: number) => value + 1),
        A.filter((value: number) => value % 2 === 0),
      ),
  },
  {
    id: 'fresh-3-step',
    candidate: () =>
      pipe(
        INPUT,
        A.map((value: number) => value + 1),
        A.filter((value: number) => value % 2 === 0),
        A.take(3),
      ),
    reference: () =>
      baselinePipe(
        INPUT,
        A.map((value: number) => value + 1),
        A.filter((value: number) => value % 2 === 0),
        A.take(3),
      ),
  },
]

const semanticEqual = (left: unknown, right: unknown): boolean => {
  if (typeof left === 'number' && typeof right === 'number') {
    return (Number.isNaN(left) && Number.isNaN(right)) || Object.is(left, right)
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

const parsePositiveInteger = (argv: readonly string[], flag: string, fallback: number): number => {
  const index = argv.indexOf(flag)
  if (index === -1) return fallback
  const parsed = Number(argv[index + 1])
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`)
  }
  return parsed
}

const artifactDirectory = (): string =>
  resolve(process.env.PERF_ARTIFACT_DIR ?? join(tmpdir(), 'stopcock-fp-performance'))

const main = async (): Promise<void> => {
  const engine = currentPerfEngine()
  const policy = PIPE_DISPATCH_POLICIES[engine.id]
  const argv = process.argv.slice(2)
  const rounds = parsePositiveInteger(argv, '--rounds', policy.minimumRounds)
  const batchIterations = parsePositiveInteger(argv, '--batch', policy.minimumBatchIterations)
  const directory = artifactDirectory()
  const reportPath = join(directory, `pipe-dispatch-${engine.id}.json`)
  const gatePath = join(directory, `pipe-dispatch-${engine.id}-gate.json`)
  const cases: PipeDispatchCase[] = []
  const skipped: string[] = []

  await mkdir(directory, { recursive: true })
  for (const scenario of scenarios()) {
    try {
      const correctnessOk = semanticEqual(scenario.candidate(), scenario.reference())
      const measured = runPaired(
        batched(scenario.candidate, batchIterations),
        batched(scenario.reference, batchIterations),
        { rounds, warmupRounds: policy.warmupRounds },
      )
      cases.push({
        id: scenario.id,
        correctnessOk,
        rounds: measured.pairedRatios.length,
        batchIterations,
        medianRatio: measured.medianRatio,
        meanRatio: measured.meanRatio,
        ciLow: measured.ciLow,
        ciHigh: measured.ciHigh,
        signTestP: measured.signTestP,
        relativeMarginOfError: relativeMarginOfError(
          measured.ciLow,
          measured.ciHigh,
          measured.medianRatio,
        ),
      })
    } catch (error) {
      skipped.push(`${scenario.id}: ${(error as Error).message}`)
    }
  }

  const ratios = cases.map((item) => item.medianRatio)
  const summary = {
    count: cases.length,
    expectedCount: EXPECTED_CASES.length,
    geomeanRatio: geomean(ratios),
    minRatio: Math.min(...ratios, Number.POSITIVE_INFINITY),
    allCorrect: cases.every((item) => item.correctnessOk),
    complete: cases.length === EXPECTED_CASES.length && skipped.length === 0,
  }
  const report: PipeDispatchReport = {
    generatedAt: new Date().toISOString(),
    engine,
    comparison: {
      candidate: 'current pipe',
      reference: BASELINE_ID,
      ratio: 'retainedBaselineNs / currentPipeNs; greater is faster',
    },
    args: { rounds, batchIterations },
    summary,
    cases,
    skipped,
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const evaluation = evaluatePipeDispatchReport(report)
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

  console.log(`\nPipe dispatch release gate (${engine.name})\n`)
  console.log(['case', 'n', 'median', 'CI95', 'RME', 'correct'].join('\t'))
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
  console.log(`\ngeomean: ${summary.geomeanRatio.toFixed(3)}  min: ${summary.minRatio.toFixed(3)}`)
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
