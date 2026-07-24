import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { currentPerfEngine, expectedEngineName, type PerfEngine } from './perf-engine'
import {
  bootstrapMedianCI,
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
  type InterleavedPairedSampling,
} from './perf-runner'
import {
  EXPECTED_FROZEN_EMITTER,
  EXPECTED_PORTABLE_CORPUS,
  EXPECTED_PORTABLE_SUBJECT,
  minimumPortableBatchIterations,
} from './portable-perf-contract'

export interface PortablePerfCase {
  readonly name: string
  readonly strata: Readonly<Record<string, unknown>>
  readonly inputSize: number
  readonly consumedInputItems: number
  readonly correctnessOk: boolean
  readonly workerEngine: PerfEngine
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
  readonly referenceSamplesNs: readonly number[]
  readonly pairedRatios: readonly number[]
}

export interface PortablePerfReport {
  readonly generatedAt: string
  readonly engine: PerfEngine
  readonly subject: {
    readonly id: string
    readonly files: readonly string[]
    readonly sha256: string
  }
  readonly corpus: {
    readonly id: string
    readonly version: number
    readonly sha256: string
  }
  readonly reference: {
    readonly id: string
    readonly sha256: string
  }
  readonly args: {
    readonly rounds: number
    readonly quick: boolean
    readonly out?: string
    readonly corpusPath: string
    readonly minimumBatchInputItems: number
    readonly warmupRounds: number
  }
  readonly summary: {
    readonly count: number
    readonly expectedCount: number
    readonly geomeanRatio: number
    readonly minRatio: number
    readonly maxRelativeMarginOfError: number
    readonly allCorrect: boolean
    readonly complete: boolean
  }
  readonly cases: readonly PortablePerfCase[]
  readonly skipped: readonly string[]
}

interface StratumPolicy {
  readonly dimension: 'opCountBucket' | 'sinkKind'
  readonly value: string
  readonly minimumCount: number
  readonly minimumGeomean: number
}

interface PortablePerfPolicy {
  readonly minimumRounds: number
  readonly minimumWarmupRounds: number
  readonly minimumBatchInputItems: number
  readonly maximumRme: number
  readonly minimumCases: number
  readonly minimumGlobalGeomean: number
  readonly minimumCaseRatio: number
  readonly strata: readonly StratumPolicy[]
}

/**
 * Ratios are reference nanoseconds / Stopcock nanoseconds, equivalent to
 * Stopcock throughput / reference throughput. The frozen reference emitter
 * runs beside Stopcock in the same process, so these are relative rather than
 * machine-speed thresholds.
 *
 * Floors retain conservative headroom below consecutive July 2026
 * full-corpus characterizations on macOS arm64. Bun/JavaScriptCore and
 * Node/V8 use separate policies because their optimizers make materially
 * different decisions for the static portable templates. Aggregate,
 * pipeline-depth, and terminal strata are all gated so exceptional single-op
 * results cannot conceal a regression in long, reducing, or short-circuiting
 * pipelines. Collecting and reducing pipelines on V8 are held to parity with
 * the frozen hand-shaped emitter; requiring a blanket uplift there would
 * measure an unattainable policy target rather than a regression. Each timed
 * sample processes at least 100k source elements based
 * on the count actually consumed. An immediate early exit is batched heavily,
 * while a never-matching full scan is not multiplied thousands of times. The
 * allocation-free AB/BA sampler limits each micro-batch to roughly 10k
 * consumed items. Node receives 100 aggregate warmup samples because fresh
 * V8 processes otherwise measured Maglev/TurboFan transitions; Bun keeps its
 * independently characterized 10-sample warmup. The 95% bootstrap-CI RME
 * ceilings are aligned with the other batched release gates: JavaScriptCore
 * gets 6% for its observed GC variability, while settled V8 samples get 5%.
 */
export const PORTABLE_PERF_POLICIES = Object.freeze({
  'bun-jsc': Object.freeze({
    minimumRounds: 60,
    minimumWarmupRounds: 10,
    minimumBatchInputItems: 100_000,
    maximumRme: 6,
    minimumCases: EXPECTED_PORTABLE_CORPUS.caseCount,
    minimumGlobalGeomean: 1.2,
    minimumCaseRatio: 0.8,
    strata: Object.freeze([
      {
        dimension: 'opCountBucket',
        value: '1',
        minimumCount: 6,
        minimumGeomean: 2.5,
      },
      {
        dimension: 'opCountBucket',
        value: '2-3',
        minimumCount: 20,
        minimumGeomean: 1.05,
      },
      {
        dimension: 'opCountBucket',
        value: '4+',
        minimumCount: 18,
        minimumGeomean: 0.85,
      },
      {
        dimension: 'sinkKind',
        value: 'none',
        minimumCount: 7,
        minimumGeomean: 2.2,
      },
      {
        dimension: 'sinkKind',
        value: 'collect',
        minimumCount: 12,
        minimumGeomean: 0.98,
      },
      {
        dimension: 'sinkKind',
        value: 'reduce-like',
        minimumCount: 13,
        minimumGeomean: 0.95,
      },
      {
        dimension: 'sinkKind',
        value: 'short-circuit',
        minimumCount: 12,
        minimumGeomean: 0.9,
      },
    ] satisfies readonly StratumPolicy[]),
  }),
  'node-v8': Object.freeze({
    minimumRounds: 60,
    minimumWarmupRounds: 100,
    minimumBatchInputItems: 100_000,
    maximumRme: 5,
    minimumCases: EXPECTED_PORTABLE_CORPUS.caseCount,
    minimumGlobalGeomean: 1.15,
    minimumCaseRatio: 0.85,
    strata: Object.freeze([
      {
        dimension: 'opCountBucket',
        value: '1',
        minimumCount: 6,
        minimumGeomean: 1.9,
      },
      {
        dimension: 'opCountBucket',
        value: '2-3',
        minimumCount: 20,
        minimumGeomean: 1.15,
      },
      {
        dimension: 'opCountBucket',
        value: '4+',
        minimumCount: 18,
        minimumGeomean: 0.95,
      },
      {
        dimension: 'sinkKind',
        value: 'none',
        minimumCount: 7,
        minimumGeomean: 1.65,
      },
      {
        dimension: 'sinkKind',
        value: 'collect',
        minimumCount: 12,
        minimumGeomean: 1,
      },
      {
        dimension: 'sinkKind',
        value: 'reduce-like',
        minimumCount: 13,
        minimumGeomean: 1,
      },
      {
        dimension: 'sinkKind',
        value: 'short-circuit',
        minimumCount: 12,
        minimumGeomean: 0.95,
      },
    ] satisfies readonly StratumPolicy[]),
  }),
} satisfies Readonly<Record<PerfEngine['id'], PortablePerfPolicy>>)

export interface GateMeasurement {
  readonly label: string
  readonly count: number
  readonly actual: number
  readonly minimum: number
  readonly passed: boolean
}

export interface PortablePerfEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
  readonly measurements: readonly GateMeasurement[]
}

const geomean = (values: readonly number[]): number => {
  if (values.length === 0) return Number.NaN
  return Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length)
}

const median = (values: readonly number[]): number => {
  if (values.length === 0) return Number.NaN
  const sorted = values.slice().sort((left, right) => left - right)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length

const approximatelyEqual = (left: number, right: number): boolean =>
  Number.isFinite(left) &&
  Number.isFinite(right) &&
  Math.abs(left - right) <= Math.max(1e-9, Math.abs(right) * 1e-9)

const recordFailure = (failures: string[], condition: boolean, message: string): void => {
  if (!condition) failures.push(message)
}

const sameEngine = (left: PerfEngine, right: PerfEngine): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const stratumValue = (item: PortablePerfCase, dimension: StratumPolicy['dimension']): unknown =>
  item.strata !== null && typeof item.strata === 'object' ? item.strata[dimension] : undefined

export function evaluatePortablePerfReport(report: PortablePerfReport): PortablePerfEvaluation {
  const failures: string[] = []
  const measurements: GateMeasurement[] = []
  const supportedEngine = report.engine.id === 'bun-jsc' || report.engine.id === 'node-v8'
  const policy = supportedEngine
    ? PORTABLE_PERF_POLICIES[report.engine.id]
    : PORTABLE_PERF_POLICIES['bun-jsc']

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
    report.subject?.id === EXPECTED_PORTABLE_SUBJECT.id,
    `unexpected portable subject identity ${String(report.subject?.id)}`,
  )
  recordFailure(
    failures,
    Array.isArray(report.subject?.files) &&
      sameStrings(report.subject.files, EXPECTED_PORTABLE_SUBJECT.files),
    'portable subject files do not match the pinned runtime inputs',
  )
  recordFailure(
    failures,
    report.subject?.sha256 === EXPECTED_PORTABLE_SUBJECT.sha256,
    `portable subject SHA-256 does not match ${EXPECTED_PORTABLE_SUBJECT.id}`,
  )
  recordFailure(
    failures,
    report.corpus?.id === EXPECTED_PORTABLE_CORPUS.id,
    `unexpected portable corpus identity ${String(report.corpus?.id)}`,
  )
  recordFailure(
    failures,
    report.corpus?.version === EXPECTED_PORTABLE_CORPUS.version,
    `unexpected portable corpus version ${String(report.corpus?.version)}`,
  )
  recordFailure(
    failures,
    report.corpus?.sha256 === EXPECTED_PORTABLE_CORPUS.sha256,
    `portable corpus SHA-256 does not match ${EXPECTED_PORTABLE_CORPUS.id}`,
  )
  recordFailure(
    failures,
    report.reference?.id === EXPECTED_FROZEN_EMITTER.id,
    `unexpected frozen-emitter identity ${String(report.reference?.id)}`,
  )
  recordFailure(
    failures,
    report.reference?.sha256 === EXPECTED_FROZEN_EMITTER.sha256,
    `frozen-emitter SHA-256 does not match ${EXPECTED_FROZEN_EMITTER.id}`,
  )
  recordFailure(
    failures,
    report.args.quick === false,
    'portable release gate must run the full corpus, not --quick',
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args.rounds) && report.args.rounds >= policy.minimumRounds,
    `report used ${report.args.rounds} rounds; minimum is ${policy.minimumRounds}`,
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args.warmupRounds) &&
      report.args.warmupRounds >= policy.minimumWarmupRounds,
    `report used ${report.args.warmupRounds} warmup rounds; minimum is ${policy.minimumWarmupRounds}`,
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args.minimumBatchInputItems) &&
      report.args.minimumBatchInputItems >= policy.minimumBatchInputItems,
    `report used a ${report.args.minimumBatchInputItems}-input batch target; minimum is ${policy.minimumBatchInputItems}`,
  )
  recordFailure(
    failures,
    report.cases.length === policy.minimumCases,
    `report contains ${report.cases.length} cases; expected ${policy.minimumCases}`,
  )
  recordFailure(
    failures,
    report.summary.count === report.cases.length,
    `summary count ${report.summary.count} does not match ${report.cases.length} case rows`,
  )
  recordFailure(
    failures,
    report.summary.expectedCount === EXPECTED_PORTABLE_CORPUS.caseCount,
    `summary expected count ${report.summary.expectedCount} does not match pinned corpus count ${EXPECTED_PORTABLE_CORPUS.caseCount}`,
  )
  recordFailure(
    failures,
    report.summary.complete === true,
    'portable benchmark report is incomplete',
  )
  recordFailure(
    failures,
    report.summary.allCorrect === true,
    'portable benchmark summary is incorrect',
  )
  recordFailure(
    failures,
    report.cases.every((item) => item.correctnessOk === true),
    'one or more portable benchmark cases produced incorrect output',
  )
  recordFailure(
    failures,
    Array.isArray(report.skipped) && report.skipped.length === 0,
    'portable benchmark has a malformed or non-empty skipped-case list',
  )

  const allowedStrata = new Map<StratumPolicy['dimension'], ReadonlySet<string>>([
    [
      'opCountBucket',
      new Set(
        policy.strata
          .filter((policy) => policy.dimension === 'opCountBucket')
          .map((policy) => policy.value),
      ),
    ],
    [
      'sinkKind',
      new Set(
        policy.strata
          .filter((policy) => policy.dimension === 'sinkKind')
          .map((policy) => policy.value),
      ),
    ],
  ])
  const names = new Set<string>()
  for (const item of report.cases) {
    recordFailure(
      failures,
      typeof item.name === 'string' && item.name.length > 0,
      'benchmark case has no non-empty name',
    )
    recordFailure(failures, !names.has(item.name), `duplicate benchmark case: ${item.name}`)
    names.add(item.name)
    recordFailure(
      failures,
      Number.isSafeInteger(item.rounds) &&
        item.rounds >= policy.minimumRounds &&
        item.rounds === report.args.rounds,
      `${item.name}: used ${item.rounds} rounds; report requested ${report.args.rounds}`,
    )
    recordFailure(
      failures,
      sameEngine(item.workerEngine, report.engine),
      `${item.name}: worker runtime identity does not match report`,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.inputSize) && item.inputSize > 0,
      `${item.name}: invalid input size ${item.inputSize}`,
    )
    recordFailure(
      failures,
      item.strata.boundary === 'none' || item.strata.boundary === 'present',
      `${item.name}: unrecognized boundary stratum ${String(item.strata.boundary)}`,
    )
    const isUnmaterializedEarlyExit =
      item.strata.sinkKind === 'short-circuit' && item.strata.boundary === 'none'
    recordFailure(
      failures,
      Number.isSafeInteger(item.consumedInputItems) &&
        item.consumedInputItems > 0 &&
        item.consumedInputItems <= item.inputSize &&
        (isUnmaterializedEarlyExit || item.consumedInputItems === item.inputSize),
      `${item.name}: invalid consumed-input count ${item.consumedInputItems}`,
    )
    const minimumBatchIterations = minimumPortableBatchIterations(item.consumedInputItems, policy)
    recordFailure(
      failures,
      Number.isSafeInteger(item.batchIterations) && item.batchIterations >= minimumBatchIterations,
      `${item.name}: used batch size ${item.batchIterations}; minimum is ${minimumBatchIterations}`,
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
      `${item.name}: unexpected sampler identity ${String(sampling?.id)}`,
    )
    recordFailure(
      failures,
      sampling?.order === INTERLEAVED_PAIRED_SAMPLER_ORDER,
      `${item.name}: unexpected sampler order ${String(sampling?.order)}`,
    )
    recordFailure(
      failures,
      sampling?.batchIterationsPerSide === item.batchIterations,
      `${item.name}: sampler batch does not match case batch`,
    )
    recordFailure(
      failures,
      sampling?.targetConsumedItemsPerMicroBatch === targetConsumedItemsPerMicroBatch,
      `${item.name}: sampler target must be ${targetConsumedItemsPerMicroBatch} consumed items`,
    )
    recordFailure(
      failures,
      sampling?.microBatchIterations === expectedMicroBatchIterations,
      `${item.name}: sampler used ${String(sampling?.microBatchIterations)} micro-batch iterations; expected ${expectedMicroBatchIterations}`,
    )
    recordFailure(
      failures,
      sampling?.microBatchesPerSide ===
        Math.ceil(item.batchIterations / expectedMicroBatchIterations),
      `${item.name}: sampler reported an inconsistent micro-batch count`,
    )
    recordFailure(
      failures,
      sampling?.nominalConsumedItemsPerMicroBatch ===
        expectedMicroBatchIterations * item.consumedInputItems,
      `${item.name}: sampler reported inconsistent nominal consumed items`,
    )
    const stopcockSamples = Array.isArray(item.stopcockSamplesNs) ? item.stopcockSamplesNs : []
    const referenceSamples = Array.isArray(item.referenceSamplesNs) ? item.referenceSamplesNs : []
    const pairedRatios = Array.isArray(item.pairedRatios) ? item.pairedRatios : []
    recordFailure(
      failures,
      stopcockSamples.length === item.rounds,
      `${item.name}: stopcock raw sample count ${stopcockSamples.length} does not match ${item.rounds} rounds`,
    )
    recordFailure(
      failures,
      referenceSamples.length === item.rounds,
      `${item.name}: reference raw sample count ${referenceSamples.length} does not match ${item.rounds} rounds`,
    )
    recordFailure(
      failures,
      pairedRatios.length === item.rounds,
      `${item.name}: paired-ratio count ${pairedRatios.length} does not match ${item.rounds} rounds`,
    )
    recordFailure(
      failures,
      stopcockSamples.every((sample) => Number.isFinite(sample) && sample > 0),
      `${item.name}: stopcock samples must be finite and positive`,
    )
    recordFailure(
      failures,
      referenceSamples.every((sample) => Number.isFinite(sample) && sample > 0),
      `${item.name}: reference samples must be finite and positive`,
    )
    recordFailure(
      failures,
      pairedRatios.every((ratio) => Number.isFinite(ratio) && ratio > 0),
      `${item.name}: paired ratios must be finite and positive`,
    )
    const rawLengthsMatch =
      stopcockSamples.length === referenceSamples.length &&
      stopcockSamples.length === pairedRatios.length
    recordFailure(
      failures,
      rawLengthsMatch &&
        pairedRatios.every((ratio, index) =>
          approximatelyEqual(ratio, referenceSamples[index] / stopcockSamples[index]),
        ),
      `${item.name}: paired ratios do not match referenceNs / stopcockNs`,
    )
    const rawMedian = median(pairedRatios)
    const rawMean = mean(pairedRatios)
    const rawCi = bootstrapMedianCI(pairedRatios)
    recordFailure(
      failures,
      Number.isFinite(item.medianRatio) &&
        item.medianRatio > 0 &&
        approximatelyEqual(item.medianRatio, rawMedian),
      `${item.name}: invalid median ratio ${item.medianRatio}`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.meanRatio) &&
        item.meanRatio > 0 &&
        approximatelyEqual(item.meanRatio, rawMean),
      `${item.name}: invalid mean ratio ${item.meanRatio}`,
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
      `${item.name}: invalid confidence interval [${item.ciLow}, ${item.ciHigh}]`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.signTestP) && item.signTestP >= 0 && item.signTestP <= 1,
      `${item.name}: invalid sign-test p-value ${item.signTestP}`,
    )
    const computedRme = ((rawCi.high - rawCi.low) / (2 * rawMedian)) * 100
    recordFailure(
      failures,
      Number.isFinite(item.relativeMarginOfError) && item.relativeMarginOfError >= 0,
      `${item.name}: invalid relative margin of error ${item.relativeMarginOfError}`,
    )
    recordFailure(
      failures,
      approximatelyEqual(item.relativeMarginOfError, computedRme),
      `${item.name}: reported relative margin of error does not match its confidence interval`,
    )
    recordFailure(
      failures,
      item.relativeMarginOfError <= policy.maximumRme ||
        // A wide interval is release-safe only when its entire 95% confidence
        // range still clears the engine's per-case throughput floor.
        rawCi.low >= policy.minimumCaseRatio,
      `${item.name}: relative margin of error ${item.relativeMarginOfError}% exceeds ${policy.maximumRme}%`,
    )
    for (const [dimension, allowedValues] of allowedStrata) {
      const value = stratumValue(item, dimension)
      recordFailure(
        failures,
        typeof value === 'string' && allowedValues.has(value),
        `${item.name}: unrecognized ${dimension} stratum ${String(value)}`,
      )
    }
  }

  const validRatios = report.cases
    .map((item) => item.medianRatio)
    .filter((ratio) => Number.isFinite(ratio) && ratio > 0)
  const validRmes = report.cases
    .map((item) => item.relativeMarginOfError)
    .filter((rme) => Number.isFinite(rme) && rme >= 0)
  const globalGeomean = geomean(validRatios)
  const minimumRatio = validRatios.length === 0 ? Number.NaN : Math.min(...validRatios)
  const maximumRme = validRmes.length === 0 ? Number.NaN : Math.max(...validRmes)

  recordFailure(
    failures,
    approximatelyEqual(report.summary.geomeanRatio, globalGeomean),
    'reported global geomean does not match the case rows',
  )
  recordFailure(
    failures,
    approximatelyEqual(report.summary.minRatio, minimumRatio),
    'reported minimum ratio does not match the case rows',
  )
  recordFailure(
    failures,
    approximatelyEqual(report.summary.maxRelativeMarginOfError, maximumRme),
    'reported maximum relative margin of error does not match the case rows',
  )

  measurements.push({
    label: 'global geomean',
    count: report.cases.length,
    actual: globalGeomean,
    minimum: policy.minimumGlobalGeomean,
    passed: globalGeomean >= policy.minimumGlobalGeomean,
  })
  measurements.push({
    label: 'worst case',
    count: report.cases.length,
    actual: minimumRatio,
    minimum: policy.minimumCaseRatio,
    passed: minimumRatio >= policy.minimumCaseRatio,
  })

  for (const stratumPolicy of policy.strata) {
    const rows = report.cases.filter(
      (item) => stratumValue(item, stratumPolicy.dimension) === stratumPolicy.value,
    )
    const actual = geomean(rows.map((item) => item.medianRatio))
    const enoughRows = rows.length >= stratumPolicy.minimumCount
    const fastEnough = actual >= stratumPolicy.minimumGeomean
    const label = `${stratumPolicy.dimension}=${stratumPolicy.value}`
    if (!enoughRows) {
      failures.push(`${label}: found ${rows.length} rows; minimum is ${stratumPolicy.minimumCount}`)
    }
    measurements.push({
      label,
      count: rows.length,
      actual,
      minimum: stratumPolicy.minimumGeomean,
      passed: enoughRows && fastEnough,
    })
  }

  for (const measurement of measurements) {
    if (!measurement.passed && Number.isFinite(measurement.actual)) {
      failures.push(
        `${measurement.label}: ${measurement.actual.toFixed(3)} is below ${measurement.minimum.toFixed(3)}`,
      )
    }
  }

  return {
    passed: failures.length === 0,
    failures: Object.freeze(failures),
    measurements: Object.freeze(measurements),
  }
}

const artifactDirectory = (): string =>
  resolve(process.env.PERF_ARTIFACT_DIR ?? join(tmpdir(), 'stopcock-fp-performance'))

const main = async (): Promise<void> => {
  const engine = currentPerfEngine()
  const policy = PORTABLE_PERF_POLICIES[engine.id]
  const directory = artifactDirectory()
  const reportPath = join(directory, `portable-runtime-${engine.id}.json`)
  const gatePath = join(directory, `portable-runtime-${engine.id}-gate.json`)
  const runnerPath = fileURLToPath(new URL('./run-perf.ts', import.meta.url))
  const benchmarkArgs = [
    runnerPath,
    '--rounds',
    String(policy.minimumRounds),
    '--batch-inputs',
    String(policy.minimumBatchInputItems),
    '--warmup',
    String(policy.minimumWarmupRounds),
    '--out',
    reportPath,
  ]
  const runnerArgs =
    engine.id === 'bun-jsc' ? ['run', ...benchmarkArgs] : ['--import=tsx', ...benchmarkArgs]

  await mkdir(directory, { recursive: true })
  const runner = spawnSync(process.execPath, runnerArgs, { stdio: 'inherit' })

  let report: PortablePerfReport | undefined
  let evaluation: PortablePerfEvaluation = {
    passed: false,
    failures: Object.freeze(['portable benchmark did not produce a readable JSON report']),
    measurements: Object.freeze([]),
  }

  try {
    report = JSON.parse(await readFile(reportPath, 'utf8')) as PortablePerfReport
    evaluation = evaluatePortablePerfReport(report)
    if (!sameEngine(report.engine, engine)) {
      evaluation = {
        passed: false,
        failures: Object.freeze([
          ...evaluation.failures,
          'portable coordinator runtime identity does not match gate runtime',
        ]),
        measurements: evaluation.measurements,
      }
    }
  } catch (error) {
    evaluation = {
      passed: false,
      failures: Object.freeze([
        `portable benchmark report could not be evaluated: ${(error as Error).message}`,
      ]),
      measurements: Object.freeze([]),
    }
  }

  const runnerPassed = runner.status === 0 && runner.signal === null
  const passed = runnerPassed && evaluation.passed
  const gateArtifact = {
    version: 2,
    generatedAt: new Date().toISOString(),
    engine,
    runner: {
      status: runner.status,
      signal: runner.signal,
      reportPath,
    },
    policy,
    reportSummary: report?.summary,
    evaluation,
    passed,
  }
  await writeFile(gatePath, `${JSON.stringify(gateArtifact, null, 2)}\n`)

  console.log(`\nPortable runtime release gate (${engine.name})\n`)
  console.log(['case', 'batch', 'RME'].join('\t'))
  for (const item of report?.cases ?? []) {
    console.log(
      [item.name, item.batchIterations, `${item.relativeMarginOfError.toFixed(2)}%`].join('\t'),
    )
  }
  console.log()
  for (const measurement of evaluation.measurements) {
    console.log(
      [
        measurement.passed ? 'PASS' : 'FAIL',
        measurement.label,
        `n=${measurement.count}`,
        `actual=${measurement.actual.toFixed(3)}`,
        `minimum=${measurement.minimum.toFixed(3)}`,
      ].join('\t'),
    )
  }
  if (!runnerPassed) {
    console.error(`benchmark runner failed with status ${String(runner.status)}`)
  }
  for (const failure of evaluation.failures) console.error(`FAIL\t${failure}`)
  console.log(`raw report: ${reportPath}`)
  console.log(`gate report: ${gatePath}`)

  if (!passed) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
