import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipe } from '../../../packages/fp/src/index'
import * as Iter from '../../../packages/fp/src/iter'
import { getData } from '../setup'
import { currentPerfEngine, expectedEngineName, type PerfEngine } from './perf-engine'
import {
  bootstrapMedianCI,
  consumedItemsMicroBatchIterations,
  geomean,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
  runInterleavedPaired,
  type InterleavedPairedSampling,
} from './perf-runner'

const STOPCOCK_BENCHMARK = 'stopcock Iter.from map/filter/take/toArray'
const REFERENCE_BENCHMARK = 'native loop map/filter/take with early exit'
const TAKE_COUNT = 100

/**
 * This is the same early-terminating map/filter/take/toArray workload as
 * stream-ops.bench.ts, measured against its hand-written native loop inside
 * one runtime process. Batched ABBA samples avoid sub-microsecond timer noise.
 * Bun/JavaScriptCore and Node/V8 have separate characterized floors because
 * their optimizer decisions for the lazy plan and hand-written loop differ.
 */
const ITER_SIZES = Object.freeze([1_000, 10_000, 100_000] as const)

export interface IterPerfPolicy {
  readonly sizes: typeof ITER_SIZES
  readonly minimumRounds: number
  readonly minimumBatchIterations: number
  readonly warmupRounds: number
  readonly minimumGlobalGeomean: number
  readonly minimumCaseRatio: number
  readonly maximumRme: number
}

export const ITER_PERF_POLICIES = Object.freeze({
  'bun-jsc': Object.freeze({
    sizes: ITER_SIZES,
    minimumRounds: 60,
    minimumBatchIterations: 20_000,
    warmupRounds: 5,
    minimumGlobalGeomean: 0.84,
    minimumCaseRatio: 0.82,
    maximumRme: 6,
  }),
  'node-v8': Object.freeze({
    sizes: ITER_SIZES,
    minimumRounds: 60,
    minimumBatchIterations: 20_000,
    warmupRounds: 20,
    minimumGlobalGeomean: 0.6,
    minimumCaseRatio: 0.55,
    maximumRme: 5,
  }),
} satisfies Readonly<Record<PerfEngine['id'], IterPerfPolicy>>)

export interface IterPerfCase {
  readonly size: number
  readonly consumedInputItems: number
  readonly correctnessOk: boolean
  readonly outputLength: number
  readonly rounds: number
  readonly batchIterations: number
  readonly sampling: InterleavedPairedSampling & {
    readonly targetConsumedItemsPerMicroBatch: number
    readonly nominalConsumedItemsPerMicroBatch: number
  }
  readonly medianRatio: number
  readonly meanRatio: number
  readonly ciLow: number
  readonly ciHigh: number
  readonly signTestP: number
  readonly relativeMarginOfError: number
  readonly stopcockSamplesNs: readonly number[]
  readonly nativeSamplesNs: readonly number[]
  readonly pairedRatios: readonly number[]
}

export interface IterPerfReport {
  readonly generatedAt: string
  readonly engine: PerfEngine
  readonly comparison: {
    readonly candidate: string
    readonly reference: string
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
  readonly cases: readonly IterPerfCase[]
  readonly skipped: readonly string[]
}

export interface IterPerfEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
}

const approximatelyEqual = (left: number, right: number): boolean =>
  Number.isFinite(left) &&
  Number.isFinite(right) &&
  Math.abs(left - right) <= Math.max(1e-9, Math.abs(right) * 1e-9)

const median = (values: readonly number[]): number => {
  if (values.length === 0) return Number.NaN
  const sorted = values.slice().sort((left, right) => left - right)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
    : (sorted[middle] as number)
}

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length

const recordFailure = (failures: string[], condition: boolean, message: string): void => {
  if (!condition) failures.push(message)
}

export const evaluateIterPerfReport = (report: IterPerfReport): IterPerfEvaluation => {
  const failures: string[] = []
  const supportedEngine = report.engine.id === 'bun-jsc' || report.engine.id === 'node-v8'
  const policy = supportedEngine
    ? ITER_PERF_POLICIES[report.engine.id]
    : ITER_PERF_POLICIES['bun-jsc']
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
    report.comparison.candidate === STOPCOCK_BENCHMARK &&
      report.comparison.reference === REFERENCE_BENCHMARK,
    'report does not describe the expected Iter/native-loop comparison',
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
    report.cases.length === policy.sizes.length,
    `report contains ${report.cases.length} cases; expected ${policy.sizes.length}`,
  )
  recordFailure(
    failures,
    report.summary.count === report.cases.length &&
      report.summary.expectedCount === policy.sizes.length,
    'Iter summary counts do not match the case rows',
  )
  recordFailure(failures, report.summary.complete === true, 'Iter report is incomplete')
  recordFailure(failures, report.summary.allCorrect === true, 'Iter summary is incorrect')
  recordFailure(
    failures,
    Array.isArray(report.skipped) && report.skipped.length === 0,
    'Iter report has a malformed or non-empty skipped-case list',
  )

  const seenSizes = new Set<number>()
  for (const item of report.cases) {
    recordFailure(
      failures,
      policy.sizes.includes(item.size as (typeof policy.sizes)[number]),
      `unexpected Iter benchmark size ${item.size}`,
    )
    recordFailure(failures, !seenSizes.has(item.size), `duplicate Iter benchmark size ${item.size}`)
    seenSizes.add(item.size)
    recordFailure(
      failures,
      item.correctnessOk === true && item.outputLength === TAKE_COUNT,
      `n=${item.size}: incorrect output`,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.rounds) &&
        item.rounds >= policy.minimumRounds &&
        item.rounds === report.args.rounds,
      `n=${item.size}: used ${item.rounds} rounds; report requested ${report.args.rounds}`,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.batchIterations) &&
        item.batchIterations >= policy.minimumBatchIterations,
      `n=${item.size}: used batch size ${item.batchIterations}`,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.consumedInputItems) &&
        item.consumedInputItems >= TAKE_COUNT &&
        item.consumedInputItems <= item.size,
      `n=${item.size}: invalid consumed-input count ${item.consumedInputItems}`,
    )
    const targetConsumedItemsPerMicroBatch = 10_000
    const expectedMicroBatchIterations = consumedItemsMicroBatchIterations(
      item.consumedInputItems,
      item.batchIterations,
      targetConsumedItemsPerMicroBatch,
    )
    const sampling = item.sampling
    recordFailure(
      failures,
      sampling?.id === INTERLEAVED_PAIRED_SAMPLER_ID,
      `n=${item.size}: unexpected sampler identity ${String(sampling?.id)}`,
    )
    recordFailure(
      failures,
      sampling?.order === INTERLEAVED_PAIRED_SAMPLER_ORDER,
      `n=${item.size}: unexpected sampler order ${String(sampling?.order)}`,
    )
    recordFailure(
      failures,
      sampling?.batchIterationsPerSide === item.batchIterations,
      `n=${item.size}: sampler batch does not match case batch`,
    )
    recordFailure(
      failures,
      sampling?.targetConsumedItemsPerMicroBatch === targetConsumedItemsPerMicroBatch,
      `n=${item.size}: unexpected sampler target`,
    )
    recordFailure(
      failures,
      sampling?.microBatchIterations === expectedMicroBatchIterations,
      `n=${item.size}: unexpected sampler micro-batch`,
    )
    recordFailure(
      failures,
      sampling?.microBatchesPerSide ===
        Math.ceil(item.batchIterations / expectedMicroBatchIterations),
      `n=${item.size}: inconsistent sampler micro-batch count`,
    )
    recordFailure(
      failures,
      sampling?.nominalConsumedItemsPerMicroBatch ===
        expectedMicroBatchIterations * item.consumedInputItems,
      `n=${item.size}: inconsistent nominal consumed items`,
    )
    const stopcockSamples = Array.isArray(item.stopcockSamplesNs) ? item.stopcockSamplesNs : []
    const nativeSamples = Array.isArray(item.nativeSamplesNs) ? item.nativeSamplesNs : []
    const pairedRatios = Array.isArray(item.pairedRatios) ? item.pairedRatios : []
    recordFailure(
      failures,
      stopcockSamples.length === item.rounds,
      `n=${item.size}: stopcock raw sample count does not match rounds`,
    )
    recordFailure(
      failures,
      nativeSamples.length === item.rounds,
      `n=${item.size}: native raw sample count does not match rounds`,
    )
    recordFailure(
      failures,
      pairedRatios.length === item.rounds,
      `n=${item.size}: paired-ratio count does not match rounds`,
    )
    recordFailure(
      failures,
      stopcockSamples.every((sample) => Number.isFinite(sample) && sample > 0),
      `n=${item.size}: stopcock samples must be finite and positive`,
    )
    recordFailure(
      failures,
      nativeSamples.every((sample) => Number.isFinite(sample) && sample > 0),
      `n=${item.size}: native samples must be finite and positive`,
    )
    recordFailure(
      failures,
      pairedRatios.every((ratio) => Number.isFinite(ratio) && ratio > 0),
      `n=${item.size}: paired ratios must be finite and positive`,
    )
    recordFailure(
      failures,
      stopcockSamples.length === nativeSamples.length &&
        stopcockSamples.length === pairedRatios.length &&
        pairedRatios.every((ratio, index) =>
          approximatelyEqual(
            ratio,
            (nativeSamples[index] as number) / (stopcockSamples[index] as number),
          ),
        ),
      `n=${item.size}: paired ratios do not match nativeNs / stopcockNs`,
    )
    const rawMedian = median(pairedRatios)
    const rawMean = mean(pairedRatios)
    const rawCi = bootstrapMedianCI(pairedRatios)
    recordFailure(
      failures,
      Number.isFinite(item.medianRatio) &&
        item.medianRatio > 0 &&
        approximatelyEqual(item.medianRatio, rawMedian),
      `n=${item.size}: invalid median ratio ${item.medianRatio}`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.meanRatio) &&
        item.meanRatio > 0 &&
        approximatelyEqual(item.meanRatio, rawMean),
      `n=${item.size}: invalid mean ratio ${item.meanRatio}`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.ciLow) &&
        item.ciLow > 0 &&
        Number.isFinite(item.ciHigh) &&
        item.ciHigh >= item.ciLow &&
        item.ciLow <= item.medianRatio &&
        item.ciHigh >= item.medianRatio &&
        approximatelyEqual(item.ciLow, rawCi.low) &&
        approximatelyEqual(item.ciHigh, rawCi.high),
      `n=${item.size}: invalid confidence interval [${item.ciLow}, ${item.ciHigh}]`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.signTestP) && item.signTestP >= 0 && item.signTestP <= 1,
      `n=${item.size}: invalid sign-test p-value ${item.signTestP}`,
    )
    const computedRme = ((rawCi.high - rawCi.low) / (2 * rawMedian)) * 100
    recordFailure(
      failures,
      Number.isFinite(item.relativeMarginOfError) &&
        item.relativeMarginOfError >= 0 &&
        approximatelyEqual(item.relativeMarginOfError, computedRme),
      `n=${item.size}: reported relative margin of error does not match its confidence interval`,
    )
    recordFailure(
      failures,
      item.relativeMarginOfError <= policy.maximumRme ||
        rawCi.low >= policy.minimumCaseRatio,
      `n=${item.size}: relative margin of error ${item.relativeMarginOfError.toFixed(2)}% exceeds ${policy.maximumRme.toFixed(2)}%`,
    )
  }
  for (const size of policy.sizes) {
    recordFailure(failures, seenSizes.has(size), `missing Iter benchmark size ${size}`)
  }

  const validRatios = report.cases
    .map((item) => item.medianRatio)
    .filter((ratio) => Number.isFinite(ratio) && ratio > 0)
  const globalGeomean = geomean(validRatios)
  const minimumRatio = validRatios.length === 0 ? Number.NaN : Math.min(...validRatios)
  recordFailure(
    failures,
    approximatelyEqual(report.summary.geomeanRatio, globalGeomean),
    'reported Iter geomean does not match the case rows',
  )
  recordFailure(
    failures,
    approximatelyEqual(report.summary.minRatio, minimumRatio),
    'reported Iter minimum does not match the case rows',
  )
  recordFailure(
    failures,
    globalGeomean >= policy.minimumGlobalGeomean,
    `Iter geomean ${globalGeomean.toFixed(3)} is below ${policy.minimumGlobalGeomean.toFixed(3)}`,
  )
  for (const item of report.cases) {
    recordFailure(
      failures,
      item.medianRatio >= policy.minimumCaseRatio,
      `n=${item.size}: ratio ${item.medianRatio.toFixed(3)} is below ${policy.minimumCaseRatio.toFixed(3)}`,
    )
  }

  return { passed: failures.length === 0, failures: Object.freeze(failures) }
}

const double = (value: number): number => value * 2
const keepMappedValue = (value: number): boolean => value > 1

const runStopcock = (data: readonly number[]): number[] =>
  pipe(
    Iter.from(data),
    Iter.map(double),
    Iter.filter(keepMappedValue),
    Iter.take(TAKE_COUNT),
    Iter.toArray,
  )

const runNativeLoop = (data: readonly number[]): number[] => {
  const out: number[] = []
  for (let index = 0; index < data.length && out.length < TAKE_COUNT; index++) {
    const mapped = double(data[index] as number)
    if (keepMappedValue(mapped)) out.push(mapped)
  }
  return out
}

const arraysEqual = (left: readonly number[], right: readonly number[]): boolean =>
  left.length === right.length && left.every((value, index) => Object.is(value, right[index]))

let measurementSink = 0

const consumedInputItems = (data: readonly number[]): number => {
  let emitted = 0
  let index = 0
  while (index < data.length && emitted < TAKE_COUNT) {
    if (keepMappedValue(double(data[index] as number))) emitted++
    index++
  }
  return index
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
  const policy = ITER_PERF_POLICIES[engine.id]
  const rounds = parsePositiveInteger(process.argv.slice(2), '--rounds', policy.minimumRounds)
  const batchIterations = parsePositiveInteger(
    process.argv.slice(2),
    '--batch',
    policy.minimumBatchIterations,
  )
  const directory = artifactDirectory()
  const reportPath = join(directory, `iter-runtime-${engine.id}.json`)
  const gatePath = join(directory, `iter-runtime-${engine.id}-gate.json`)
  const cases: IterPerfCase[] = []
  const skipped: string[] = []

  await mkdir(directory, { recursive: true })
  for (const size of policy.sizes) {
    try {
      const data = getData<number>('numbers', size)
      const stopcockRun = (): number[] => runStopcock(data)
      const nativeRun = (): number[] => runNativeLoop(data)
      const stopcockOutput = stopcockRun()
      const nativeOutput = nativeRun()
      const correctnessOk = arraysEqual(stopcockOutput, nativeOutput)
      const consumed = consumedInputItems(data)
      const targetConsumedItemsPerMicroBatch = 10_000
      const microBatchIterations = consumedItemsMicroBatchIterations(
        consumed,
        batchIterations,
        targetConsumedItemsPerMicroBatch,
      )
      const measured = runInterleavedPaired(stopcockRun, nativeRun, {
        rounds,
        warmupRounds: policy.warmupRounds,
        batchIterations,
        microBatchIterations,
        observe: (stopcockLast, nativeLast) => {
          const stopcock = stopcockLast as readonly number[]
          const native = nativeLast as readonly number[]
          measurementSink =
            stopcock.length +
            (stopcock[0] ?? 0) +
            (stopcock.at(-1) ?? 0) +
            native.length +
            (native[0] ?? 0) +
            (native.at(-1) ?? 0)
        },
      })
      cases.push({
        size,
        consumedInputItems: consumed,
        correctnessOk,
        outputLength: stopcockOutput.length,
        rounds: measured.pairedRatios.length,
        batchIterations,
        sampling: {
          ...measured.sampling,
          targetConsumedItemsPerMicroBatch,
          nominalConsumedItemsPerMicroBatch: microBatchIterations * consumed,
        },
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
        stopcockSamplesNs: measured.aSamples,
        nativeSamplesNs: measured.bSamples,
        pairedRatios: measured.pairedRatios,
      })
    } catch (error) {
      skipped.push(`n=${size}: ${(error as Error).message}`)
    }
  }

  const ratios = cases.map((item) => item.medianRatio)
  const summary = {
    count: cases.length,
    expectedCount: policy.sizes.length,
    geomeanRatio: geomean(ratios),
    minRatio: Math.min(...ratios, Number.POSITIVE_INFINITY),
    allCorrect: cases.every((item) => item.correctnessOk),
    complete: cases.length === policy.sizes.length && skipped.length === 0,
  }
  const report: IterPerfReport = {
    generatedAt: new Date().toISOString(),
    engine,
    comparison: {
      candidate: STOPCOCK_BENCHMARK,
      reference: REFERENCE_BENCHMARK,
      ratio: 'nativeLoopNs / stopcockIterNs; greater is faster',
    },
    args: { rounds, batchIterations },
    summary,
    cases,
    skipped,
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const evaluation = evaluateIterPerfReport(report)
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

  console.log(`\nIter runtime release gate (${engine.name})\n`)
  console.log(['size', 'n', 'median', 'CI95', 'RME', 'correct'].join('\t'))
  for (const item of cases) {
    console.log(
      [
        item.size,
        item.rounds,
        item.medianRatio.toFixed(3),
        `[${item.ciLow.toFixed(3)},${item.ciHigh.toFixed(3)}]`,
        `${item.relativeMarginOfError.toFixed(2)}%`,
        item.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(
    `\ngeomean: ${summary.geomeanRatio.toFixed(3)}  min: ${summary.minRatio.toFixed(3)}  sink: ${measurementSink.toFixed(3)}`,
  )
  for (const failure of evaluation.failures) console.error(`FAIL\t${failure}`)
  console.log(`raw report: ${reportPath}`)
  console.log(`gate report: ${gatePath}`)
  if (!evaluation.passed) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
