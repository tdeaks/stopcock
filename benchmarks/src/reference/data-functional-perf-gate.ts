import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DATA_FUNCTIONAL_PERF_POLICIES,
  EXPECTED_DATA_FUNCTIONAL_BASELINE,
  EXPECTED_DATA_FUNCTIONAL_CASES,
  EXPECTED_DATA_FUNCTIONAL_COVERAGE,
  EXPECTED_DATA_FUNCTIONAL_SUBJECT_FILES,
  EXPECTED_DATA_FUNCTIONAL_SUBJECT_ID,
  EXPECTED_DATA_FUNCTIONAL_SUBJECT_SHA256,
  minimumDataFunctionalBatchIterations,
} from './data-functional-perf-contract'
import {
  parseDataFunctionalPerfArgs,
  runDataFunctionalPerf,
  type DataFunctionalPerfCase,
  type DataFunctionalPerfReport,
} from './data-functional-perf'
import { expectedEngineName, type PerfEngine } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
} from './perf-runner'

export interface DataFunctionalGateMeasurement {
  readonly label: 'global geomean' | 'worst case'
  readonly count: number
  readonly actual: number
  readonly minimum: number
  readonly passed: boolean
}

export interface DataFunctionalPerfEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
  readonly measurements: readonly DataFunctionalGateMeasurement[]
}

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex')

const jsonSha256 = (value: unknown): string => sha256(JSON.stringify(value))

const median = (values: readonly number[]): number => {
  if (values.length === 0) return Number.NaN
  const sorted = values.slice().sort((left, right) => left - right)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length

const geomean = (values: readonly number[]): number => {
  if (values.length === 0) return Number.NaN
  return Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) / values.length,
  )
}

const approximatelyEqual = (left: number, right: number): boolean =>
  Number.isFinite(left) &&
  Number.isFinite(right) &&
  Math.abs(left - right) <= Math.max(1e-9, Math.abs(right) * 1e-9)

const bootstrapRng = (seed: number): (() => number) => {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 4_294_967_296
  }
}

const bootstrapMedianCI = (
  values: readonly number[],
  samples = 2_000,
  alpha = 0.05,
): { readonly low: number; readonly high: number } => {
  if (values.length === 0) return { low: Number.NaN, high: Number.NaN }
  const rng = bootstrapRng(0x9e3779b9 ^ values.length)
  const medians = new Array<number>(samples)
  const resample = new Array<number>(values.length)
  for (let sample = 0; sample < samples; sample += 1) {
    for (let index = 0; index < values.length; index += 1) {
      resample[index] = values[Math.floor(rng() * values.length)]
    }
    medians[sample] = median(resample)
  }
  medians.sort((left, right) => left - right)
  return {
    low: medians[Math.floor((alpha / 2) * samples)],
    high:
      medians[
        Math.min(samples - 1, Math.ceil((1 - alpha / 2) * samples) - 1)
      ],
  }
}

const signTestP = (values: readonly number[]): number => {
  const nonTied = values.filter((ratio) => ratio !== 1)
  if (nonTied.length === 0) return 1
  const positives = nonTied.filter((ratio) => ratio > 1).length
  const logChoose = (n: number, k: number): number => {
    let total = 0
    for (let index = 0; index < k; index += 1) {
      total += Math.log(n - index) - Math.log(index + 1)
    }
    return total
  }
  const logPmf = (count: number): number =>
    logChoose(nonTied.length, count) - nonTied.length * Math.log(2)
  const observed = Math.exp(logPmf(positives))
  let probability = 0
  for (let count = 0; count <= nonTied.length; count += 1) {
    const current = Math.exp(logPmf(count))
    if (current <= observed + 1e-12) probability += current
  }
  return Math.min(1, probability)
}

const recordFailure = (
  failures: string[],
  condition: boolean,
  message: string,
): void => {
  if (!condition) failures.push(message)
}

const sameStringArray = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index])

const sameEngine = (left: PerfEngine, right: PerfEngine): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const validEngine = (engine: PerfEngine): boolean => {
  if (engine.id !== 'bun-jsc' && engine.id !== 'node-v8') return false
  if (engine.name !== expectedEngineName(engine.id)) return false
  if (engine.runtime !== (engine.id === 'bun-jsc' ? 'bun' : 'node')) return false
  if (typeof engine.runtimeVersion !== 'string' || engine.runtimeVersion.length === 0) {
    return false
  }
  if (typeof engine.platform !== 'string' || typeof engine.architecture !== 'string') {
    return false
  }
  return engine.id === 'bun-jsc'
    ? typeof engine.nodeCompatibility === 'string'
    : typeof engine.v8 === 'string'
}

const evaluateUnsafe = (
  report: DataFunctionalPerfReport,
): DataFunctionalPerfEvaluation => {
  const failures: string[] = []
  const measurements: DataFunctionalGateMeasurement[] = []
  const cases: readonly DataFunctionalPerfCase[] = Array.isArray(report.cases)
    ? report.cases
    : []
  const skipped: readonly string[] = Array.isArray(report.skipped)
    ? report.skipped
    : []
  const supportedEngine =
    report.engine?.id === 'bun-jsc' || report.engine?.id === 'node-v8'
  const policy = supportedEngine
    ? DATA_FUNCTIONAL_PERF_POLICIES[report.engine.id]
    : DATA_FUNCTIONAL_PERF_POLICIES['bun-jsc']

  recordFailure(failures, report.version === 1, 'unexpected report version')
  recordFailure(
    failures,
    typeof report.generatedAt === 'string' &&
      Number.isFinite(Date.parse(report.generatedAt)),
    'report has no valid generatedAt timestamp',
  )
  recordFailure(
    failures,
    supportedEngine && validEngine(report.engine),
    `unexpected data-functional runtime identity ${String(report.engine?.id)}`,
  )
  recordFailure(
    failures,
    report.subject?.id === EXPECTED_DATA_FUNCTIONAL_SUBJECT_ID,
    `unexpected data-functional subject ${String(report.subject?.id)}`,
  )
  const subjectFiles = Array.isArray(report.subject?.files)
    ? report.subject.files
    : []
  recordFailure(
    failures,
    sameStringArray(subjectFiles, EXPECTED_DATA_FUNCTIONAL_SUBJECT_FILES),
    'subject provenance files do not match the pinned contract',
  )
  recordFailure(
    failures,
    report.subject?.sha256 === EXPECTED_DATA_FUNCTIONAL_SUBJECT_SHA256,
    'subject provenance SHA-256 does not match the pinned implementation',
  )
  recordFailure(
    failures,
    report.baseline?.id === EXPECTED_DATA_FUNCTIONAL_BASELINE.id,
    'unexpected frozen baseline identity',
  )
  recordFailure(
    failures,
    report.baseline?.sha256 === EXPECTED_DATA_FUNCTIONAL_BASELINE.sha256,
    'frozen data-functional baseline SHA-256 does not match',
  )

  const expectedNames = EXPECTED_DATA_FUNCTIONAL_CASES.map((item) => item.name)
  const names = cases.map((item) => item.name)
  const projection = cases.map((item) => ({
    name: item.name,
    workUnits: item.workUnits,
  }))
  recordFailure(
    failures,
    sameStringArray(names, expectedNames),
    'measured case order/population does not match the pinned contract',
  )
  recordFailure(
    failures,
    report.coverage?.caseCount === EXPECTED_DATA_FUNCTIONAL_COVERAGE.caseCount,
    `coverage reports ${String(report.coverage?.caseCount)} cases; expected ${EXPECTED_DATA_FUNCTIONAL_COVERAGE.caseCount}`,
  )
  recordFailure(
    failures,
    report.coverage?.caseNamesSha256 === jsonSha256(names) &&
      report.coverage.caseNamesSha256 ===
        EXPECTED_DATA_FUNCTIONAL_COVERAGE.caseNamesSha256,
    'coverage case-name SHA-256 does not match measured and pinned rows',
  )
  recordFailure(
    failures,
    report.coverage?.projectionSha256 === jsonSha256(projection) &&
      report.coverage.projectionSha256 ===
        EXPECTED_DATA_FUNCTIONAL_COVERAGE.projectionSha256,
    'coverage projection SHA-256 does not match measured and pinned rows',
  )

  recordFailure(failures, report.args?.quick === false, 'release gate cannot use --quick')
  recordFailure(
    failures,
    report.args?.casesFilter === undefined,
    'release gate cannot filter data-functional cases',
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args?.rounds) &&
      report.args.rounds >= policy.minimumRounds,
    `round count is below minimum ${policy.minimumRounds}`,
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args?.warmupRounds) &&
      report.args.warmupRounds >= policy.minimumWarmupRounds,
    `warmup count is below minimum ${policy.minimumWarmupRounds}`,
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args?.minimumBatchWorkUnits) &&
      report.args.minimumBatchWorkUnits >= policy.minimumBatchWorkUnits,
    `batch-work target is below minimum ${policy.minimumBatchWorkUnits}`,
  )
  recordFailure(
    failures,
    report.args?.targetWorkUnitsPerMicroBatch ===
      policy.targetWorkUnitsPerMicroBatch,
    `micro-batch target must be ${policy.targetWorkUnitsPerMicroBatch}`,
  )
  recordFailure(
    failures,
    cases.length === EXPECTED_DATA_FUNCTIONAL_COVERAGE.caseCount,
    `report contains ${cases.length} cases; expected ${EXPECTED_DATA_FUNCTIONAL_COVERAGE.caseCount}`,
  )
  recordFailure(
    failures,
    report.summary?.count === cases.length,
    'summary count does not match measured rows',
  )
  recordFailure(
    failures,
    report.summary?.expectedCount ===
      EXPECTED_DATA_FUNCTIONAL_COVERAGE.caseCount,
    'summary expected count does not match pinned coverage',
  )
  recordFailure(failures, report.summary?.complete === true, 'report is incomplete')
  recordFailure(failures, report.summary?.allCorrect === true, 'summary is incorrect')
  recordFailure(
    failures,
    cases.every((item) => item.correctnessOk === true),
    'one or more data-functional cases produced incorrect output',
  )
  recordFailure(failures, skipped.length === 0, 'report has skipped rows')

  const seen = new Set<string>()
  for (const item of cases) {
    recordFailure(failures, !seen.has(item.name), `duplicate case: ${item.name}`)
    seen.add(item.name)
    const expected = EXPECTED_DATA_FUNCTIONAL_CASES.find(
      (candidate) => candidate.name === item.name,
    )
    recordFailure(
      failures,
      expected !== undefined && item.workUnits === expected.workUnits,
      `${item.name}: invalid work-unit count`,
    )
    recordFailure(
      failures,
      validEngine(item.workerEngine) &&
        sameEngine(item.workerEngine, report.engine),
      `${item.name}: worker runtime identity does not match coordinator`,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.rounds) &&
        item.rounds === report.args.rounds &&
        item.rounds >= policy.minimumRounds,
      `${item.name}: invalid round count`,
    )
    const minimumBatch = minimumDataFunctionalBatchIterations(
      item.workUnits,
      policy,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.batchIterations) &&
        item.batchIterations >= minimumBatch,
      `${item.name}: used batch size below ${minimumBatch}`,
    )
    const expectedMicroBatch = consumedItemsMicroBatchIterations(
      item.workUnits,
      item.batchIterations,
      policy.targetWorkUnitsPerMicroBatch,
    )
    recordFailure(
      failures,
      item.sampling?.id === INTERLEAVED_PAIRED_SAMPLER_ID &&
        item.sampling?.order === INTERLEAVED_PAIRED_SAMPLER_ORDER,
      `${item.name}: unexpected sampler identity or order`,
    )
    recordFailure(
      failures,
      item.sampling?.batchIterationsPerSide === item.batchIterations &&
        item.sampling?.microBatchIterations === expectedMicroBatch &&
        item.sampling?.microBatchesPerSide ===
          Math.ceil(item.batchIterations / expectedMicroBatch) &&
        item.sampling?.targetWorkUnitsPerMicroBatch ===
          policy.targetWorkUnitsPerMicroBatch &&
        item.sampling?.nominalWorkUnitsPerMicroBatch ===
          expectedMicroBatch * item.workUnits,
      `${item.name}: sampler batching metadata is inconsistent`,
    )

    const currentSamples = Array.isArray(item.currentSamplesNs)
      ? item.currentSamplesNs
      : []
    const baselineSamples = Array.isArray(item.baselineSamplesNs)
      ? item.baselineSamplesNs
      : []
    const ratios = Array.isArray(item.pairedRatios) ? item.pairedRatios : []
    for (const [label, samples] of [
      ['current', currentSamples],
      ['baseline', baselineSamples],
      ['ratio', ratios],
    ] as const) {
      recordFailure(
        failures,
        samples.length === item.rounds &&
          samples.every((sample) => Number.isFinite(sample) && sample > 0),
        `${item.name}: ${label} raw samples are malformed`,
      )
    }
    recordFailure(
      failures,
      currentSamples.length === baselineSamples.length &&
        currentSamples.length === ratios.length &&
        ratios.every((ratio, index) =>
          approximatelyEqual(
            ratio,
            baselineSamples[index] / currentSamples[index],
          ),
        ),
      `${item.name}: raw paired ratios do not match baselineNs / currentNs`,
    )
    recordFailure(
      failures,
      approximatelyEqual(item.medianRatio, median(ratios)) &&
        approximatelyEqual(item.meanRatio, mean(ratios)),
      `${item.name}: median or mean does not match raw ratios`,
    )
    const ci = bootstrapMedianCI(ratios)
    recordFailure(
      failures,
      approximatelyEqual(item.ciLow, ci.low) &&
        approximatelyEqual(item.ciHigh, ci.high) &&
        approximatelyEqual(item.signTestP, signTestP(ratios)),
      `${item.name}: CI or sign test does not match raw ratios`,
    )
    const computedRme =
      ((item.ciHigh - item.ciLow) / (2 * item.medianRatio)) * 100
    recordFailure(
      failures,
      Number.isFinite(item.relativeMarginOfError) &&
        item.relativeMarginOfError >= 0 &&
        approximatelyEqual(item.relativeMarginOfError, computedRme),
      `${item.name}: relative margin of error is invalid`,
    )
    recordFailure(
      failures,
      item.relativeMarginOfError <= policy.maximumRme ||
        ci.low >= policy.minimumCaseRatio,
      `${item.name}: relative margin of error exceeds ${policy.maximumRme}% and confidence-interval lower bound ${ci.low} is below ${policy.minimumCaseRatio}`,
    )
  }

  const ratios = cases.map((item) => item.medianRatio)
  const actualGeomean = geomean(ratios)
  const actualMinimum = Math.min(...ratios, Infinity)
  const actualMaximumRme = Math.max(
    ...cases.map((item) => item.relativeMarginOfError),
    Number.NEGATIVE_INFINITY,
  )
  recordFailure(
    failures,
    approximatelyEqual(report.summary?.geomeanRatio, actualGeomean) &&
      approximatelyEqual(report.summary?.minRatio, actualMinimum) &&
      approximatelyEqual(
        report.summary?.maxRelativeMarginOfError,
        actualMaximumRme,
      ),
    'summary statistics do not match measured rows',
  )

  measurements.push({
    label: 'global geomean',
    count: ratios.length,
    actual: actualGeomean,
    minimum: policy.minimumGeomean,
    passed:
      ratios.length === EXPECTED_DATA_FUNCTIONAL_COVERAGE.caseCount &&
      actualGeomean >= policy.minimumGeomean,
  })
  measurements.push({
    label: 'worst case',
    count: ratios.length,
    actual: actualMinimum,
    minimum: policy.minimumCaseRatio,
    passed:
      ratios.length === EXPECTED_DATA_FUNCTIONAL_COVERAGE.caseCount &&
      actualMinimum >= policy.minimumCaseRatio,
  })
  for (const measurement of measurements) {
    recordFailure(
      failures,
      measurement.passed,
      `${measurement.label} ${measurement.actual} is below ${measurement.minimum}`,
    )
  }

  return { passed: failures.length === 0, failures, measurements }
}

export const evaluateDataFunctionalPerfReport = (
  report: DataFunctionalPerfReport,
): DataFunctionalPerfEvaluation => {
  try {
    return evaluateUnsafe(report)
  } catch (error) {
    return {
      passed: false,
      failures: [`malformed data-functional report: ${(error as Error).message}`],
      measurements: [],
    }
  }
}

const main = async (): Promise<void> => {
  const args = parseDataFunctionalPerfArgs(process.argv.slice(2))
  const { report } = await runDataFunctionalPerf(args)
  const evaluation = evaluateDataFunctionalPerfReport(report)
  for (const measurement of evaluation.measurements) {
    console.log(
      `${measurement.label}: ${measurement.actual.toFixed(3)} >= ${measurement.minimum.toFixed(3)} (${measurement.passed ? 'pass' : 'FAIL'})`,
    )
  }
  if (!evaluation.passed) {
    throw new Error(
      `data-functional performance gate failed:\n${evaluation.failures.join('\n')}`,
    )
  }
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
