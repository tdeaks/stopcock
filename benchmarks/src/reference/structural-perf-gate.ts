import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EXPECTED_STRUCTURAL_BASELINE,
  EXPECTED_STRUCTURAL_CASES,
  EXPECTED_STRUCTURAL_COVERAGE,
  EXPECTED_STRUCTURAL_SUBJECT_FILES,
  EXPECTED_STRUCTURAL_SUBJECT_ID,
  EXPECTED_STRUCTURAL_SUBJECT_SHA256,
  minimumStructuralBatchIterations,
  STRUCTURAL_PERF_POLICIES,
} from './structural-perf-contract'
import {
  runStructuralPerf,
  type StructuralPerfCase,
  type StructuralPerfReport,
} from './structural-perf'
import {
  currentPerfEngine,
  expectedEngineName,
  type PerfEngine,
} from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
} from './perf-runner'

export interface StructuralGateMeasurement {
  readonly label: 'global geomean' | 'worst case'
  readonly count: number
  readonly actual: number
  readonly minimum: number
  readonly passed: boolean
}

export interface StructuralPerfEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
  readonly measurements: readonly StructuralGateMeasurement[]
}

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex')

const jsonSha256 = (value: unknown): string =>
  sha256(JSON.stringify(value))

const median = (values: readonly number[]): number => {
  if (values.length === 0) return Number.NaN
  const sorted = values.slice().sort((left, right) => left - right)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length

const geomean = (values: readonly number[]): number =>
  values.length === 0
    ? Number.NaN
    : Math.exp(
        values.reduce((total, value) => total + Math.log(value), 0) /
          values.length,
      )

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
  if (values.length === 0) {
    return { low: Number.NaN, high: Number.NaN }
  }
  const rng = bootstrapRng(0x9e3779b9 ^ values.length)
  const medians = new Array<number>(samples)
  const resample = new Array<number>(values.length)
  for (let sample = 0; sample < samples; sample += 1) {
    for (let index = 0; index < values.length; index += 1) {
      resample[index] = values[Math.floor(rng() * values.length)]!
    }
    medians[sample] = median(resample)
  }
  medians.sort((left, right) => left - right)
  return {
    low: medians[Math.floor((alpha / 2) * samples)]!,
    high:
      medians[
        Math.min(
          samples - 1,
          Math.ceil((1 - alpha / 2) * samples) - 1,
        )
      ]!,
  }
}

const signTestP = (values: readonly number[]): number => {
  const nonTied = values.filter((ratio) => ratio !== 1)
  const count = nonTied.length
  if (count === 0) return 1
  const positive = nonTied.filter((ratio) => ratio > 1).length
  const logChoose = (n: number, k: number): number => {
    let result = 0
    for (let index = 0; index < k; index += 1) {
      result += Math.log(n - index) - Math.log(index + 1)
    }
    return result
  }
  const logPmf = (k: number): number =>
    logChoose(count, k) - count * Math.log(2)
  const threshold = Math.exp(logPmf(positive)) + 1e-12
  let result = 0
  for (let index = 0; index <= count; index += 1) {
    const probability = Math.exp(logPmf(index))
    if (probability <= threshold) result += probability
  }
  return Math.min(1, result)
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
  if (engine.runtime !== (engine.id === 'bun-jsc' ? 'bun' : 'node')) {
    return false
  }
  if (
    typeof engine.runtimeVersion !== 'string' ||
    engine.runtimeVersion.length === 0 ||
    typeof engine.platform !== 'string' ||
    typeof engine.architecture !== 'string'
  ) {
    return false
  }
  return engine.id === 'bun-jsc'
    ? typeof engine.nodeCompatibility === 'string'
    : typeof engine.v8 === 'string'
}

const evaluateUnsafe = (
  report: StructuralPerfReport,
): StructuralPerfEvaluation => {
  const failures: string[] = []
  const measurements: StructuralGateMeasurement[] = []
  const cases: readonly StructuralPerfCase[] = Array.isArray(report.cases)
    ? report.cases
    : []
  const skipped: readonly string[] = Array.isArray(report.skipped)
    ? report.skipped
    : []
  const supported =
    report.engine?.id === 'bun-jsc' || report.engine?.id === 'node-v8'
  const policy = supported
    ? STRUCTURAL_PERF_POLICIES[report.engine.id]
    : STRUCTURAL_PERF_POLICIES['bun-jsc']

  recordFailure(
    failures,
    report.version === 1,
    `unexpected report version ${String(report.version)}`,
  )
  recordFailure(
    failures,
    typeof report.generatedAt === 'string' &&
      Number.isFinite(Date.parse(report.generatedAt)),
    'report has no valid generatedAt timestamp',
  )
  recordFailure(
    failures,
    supported && validEngine(report.engine),
    `unexpected structural runtime identity ${String(report.engine?.id)}`,
  )
  recordFailure(
    failures,
    report.subject?.id === EXPECTED_STRUCTURAL_SUBJECT_ID,
    `unexpected structural subject ${String(report.subject?.id)}`,
  )
  const subjectFiles = Array.isArray(report.subject?.files)
    ? report.subject.files
    : []
  recordFailure(
    failures,
    sameStringArray(subjectFiles, EXPECTED_STRUCTURAL_SUBJECT_FILES),
    'subject provenance files do not match the pinned contract',
  )
  recordFailure(
    failures,
    report.subject?.sha256 === EXPECTED_STRUCTURAL_SUBJECT_SHA256,
    'subject provenance SHA-256 does not match the pinned implementation',
  )
  recordFailure(
    failures,
    report.baseline?.id === EXPECTED_STRUCTURAL_BASELINE.id,
    `unexpected frozen baseline identity ${String(report.baseline?.id)}`,
  )
  recordFailure(
    failures,
    report.baseline?.sha256 === EXPECTED_STRUCTURAL_BASELINE.sha256,
    'frozen structural baseline SHA-256 does not match',
  )

  const expectedNames = EXPECTED_STRUCTURAL_CASES.map((item) => item.name)
  const names = cases.map((item) => item.name)
  const projection = cases.map(({ name, workUnits }) => ({
    name,
    workUnits,
  }))
  recordFailure(
    failures,
    sameStringArray(names, expectedNames),
    'measured case order/population does not match the pinned contract',
  )
  recordFailure(
    failures,
    report.coverage?.caseCount === EXPECTED_STRUCTURAL_COVERAGE.caseCount,
    `coverage reports ${String(report.coverage?.caseCount)} cases; expected ${EXPECTED_STRUCTURAL_COVERAGE.caseCount}`,
  )
  recordFailure(
    failures,
    report.coverage?.caseNamesSha256 === jsonSha256(names) &&
      report.coverage.caseNamesSha256 ===
        EXPECTED_STRUCTURAL_COVERAGE.caseNamesSha256,
    'coverage case-name SHA-256 does not match rows and pinned contract',
  )
  recordFailure(
    failures,
    report.coverage?.projectionSha256 === jsonSha256(projection) &&
      report.coverage.projectionSha256 ===
        EXPECTED_STRUCTURAL_COVERAGE.projectionSha256,
    'coverage projection SHA-256 does not match rows and pinned contract',
  )

  recordFailure(
    failures,
    report.args?.quick === false,
    'release gate cannot use --quick',
  )
  recordFailure(
    failures,
    report.args?.casesFilter === undefined,
    'release gate cannot filter structural cases',
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args?.rounds) &&
      report.args.rounds >= policy.minimumRounds,
    `report used ${String(report.args?.rounds)} rounds; minimum is ${policy.minimumRounds}`,
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args?.warmupRounds) &&
      report.args.warmupRounds >= policy.minimumWarmupRounds,
    `warmup rounds ${String(report.args?.warmupRounds)} are below ${policy.minimumWarmupRounds}`,
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args?.minimumBatchWorkUnits) &&
      report.args.minimumBatchWorkUnits >= policy.minimumBatchWorkUnits,
    `batch-work target ${String(report.args?.minimumBatchWorkUnits)} is below ${policy.minimumBatchWorkUnits}`,
  )
  recordFailure(
    failures,
    report.args?.targetWorkUnitsPerMicroBatch ===
      policy.targetWorkUnitsPerMicroBatch,
    `micro-batch target must be ${policy.targetWorkUnitsPerMicroBatch} work units`,
  )
  recordFailure(
    failures,
    cases.length === EXPECTED_STRUCTURAL_COVERAGE.caseCount,
    `report contains ${cases.length} cases; expected ${EXPECTED_STRUCTURAL_COVERAGE.caseCount}`,
  )
  recordFailure(
    failures,
    report.summary?.count === cases.length,
    'summary count does not match measured rows',
  )
  recordFailure(
    failures,
    report.summary?.expectedCount === EXPECTED_STRUCTURAL_COVERAGE.caseCount,
    'summary expected count does not match pinned coverage',
  )
  recordFailure(
    failures,
    report.summary?.complete === true,
    'structural report is incomplete',
  )
  recordFailure(
    failures,
    report.summary?.allCorrect === true &&
      cases.every((item) => item.correctnessOk === true),
    'one or more structural cases produced incorrect output',
  )
  recordFailure(
    failures,
    skipped.length === 0,
    'structural report has a malformed or non-empty skipped list',
  )

  const seen = new Set<string>()
  for (const item of cases) {
    recordFailure(
      failures,
      !seen.has(item.name),
      `duplicate case: ${item.name}`,
    )
    seen.add(item.name)
    const expected = EXPECTED_STRUCTURAL_CASES.find(
      (candidate) => candidate.name === item.name,
    )
    recordFailure(
      failures,
      expected !== undefined && item.workUnits === expected.workUnits,
      `${item.name}: invalid work-unit count ${item.workUnits}`,
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
        item.rounds >= policy.minimumRounds &&
        item.rounds === report.args.rounds,
      `${item.name}: invalid round count ${item.rounds}`,
    )
    const minimumBatch = minimumStructuralBatchIterations(
      item.workUnits,
      policy,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.batchIterations) &&
        item.batchIterations >= minimumBatch,
      `${item.name}: used batch size ${item.batchIterations}; minimum is ${minimumBatch}`,
    )
    const microBatch = consumedItemsMicroBatchIterations(
      item.workUnits,
      item.batchIterations,
      policy.targetWorkUnitsPerMicroBatch,
    )
    recordFailure(
      failures,
      item.sampling?.id === INTERLEAVED_PAIRED_SAMPLER_ID &&
        item.sampling?.order === INTERLEAVED_PAIRED_SAMPLER_ORDER,
      `${item.name}: unexpected interleaved sampler identity or order`,
    )
    recordFailure(
      failures,
      item.sampling?.batchIterationsPerSide === item.batchIterations &&
        item.sampling?.microBatchIterations === microBatch &&
        item.sampling?.microBatchesPerSide ===
          Math.ceil(item.batchIterations / microBatch) &&
        item.sampling?.targetWorkUnitsPerMicroBatch ===
          policy.targetWorkUnitsPerMicroBatch &&
        item.sampling?.nominalWorkUnitsPerMicroBatch ===
          microBatch * item.workUnits,
      `${item.name}: sampler batching metadata is inconsistent`,
    )

    const current = Array.isArray(item.currentSamplesNs)
      ? item.currentSamplesNs
      : []
    const baseline = Array.isArray(item.baselineSamplesNs)
      ? item.baselineSamplesNs
      : []
    const ratios = Array.isArray(item.pairedRatios)
      ? item.pairedRatios
      : []
    for (const [label, samples] of [
      ['current', current],
      ['baseline', baseline],
      ['ratio', ratios],
    ] as const) {
      recordFailure(
        failures,
        samples.length === item.rounds,
        `${item.name}: ${label} raw sample count does not match rounds`,
      )
      recordFailure(
        failures,
        samples.every((sample) => Number.isFinite(sample) && sample > 0),
        `${item.name}: ${label} samples must be finite and positive`,
      )
    }
    recordFailure(
      failures,
      current.length === baseline.length &&
        current.length === ratios.length &&
        ratios.every((ratio, index) =>
          approximatelyEqual(ratio, baseline[index]! / current[index]!),
        ),
      `${item.name}: raw paired ratios do not match baselineNs / currentNs`,
    )
    recordFailure(
      failures,
      approximatelyEqual(item.medianRatio, median(ratios)) &&
        approximatelyEqual(item.meanRatio, mean(ratios)),
      `${item.name}: reported median or mean does not match raw ratios`,
    )
    const rawCi = bootstrapMedianCI(ratios)
    recordFailure(
      failures,
      approximatelyEqual(item.ciLow, rawCi.low) &&
        approximatelyEqual(item.ciHigh, rawCi.high),
      `${item.name}: confidence interval does not match raw ratios`,
    )
    recordFailure(
      failures,
      approximatelyEqual(item.signTestP, signTestP(ratios)),
      `${item.name}: sign-test p-value does not match raw ratios`,
    )
    const rme =
      ((item.ciHigh - item.ciLow) / (2 * item.medianRatio)) * 100
    recordFailure(
      failures,
      Number.isFinite(item.relativeMarginOfError) &&
        item.relativeMarginOfError >= 0 &&
        approximatelyEqual(item.relativeMarginOfError, rme),
      `${item.name}: relative margin of error is invalid`,
    )
    recordFailure(
      failures,
      item.relativeMarginOfError <= policy.maximumRme,
      `${item.name}: relative margin of error exceeds ${policy.maximumRme}%`,
    )
  }

  const ratios = cases
    .map((item) => item.medianRatio)
    .filter((ratio) => Number.isFinite(ratio) && ratio > 0)
  const rmes = cases
    .map((item) => item.relativeMarginOfError)
    .filter((rme) => Number.isFinite(rme) && rme >= 0)
  const global = geomean(ratios)
  const minimum = ratios.length === 0 ? Number.NaN : Math.min(...ratios)
  const maximumRme = rmes.length === 0 ? Number.NaN : Math.max(...rmes)
  recordFailure(
    failures,
    approximatelyEqual(report.summary?.geomeanRatio, global),
    'summary geomean does not match measured rows',
  )
  recordFailure(
    failures,
    approximatelyEqual(report.summary?.minRatio, minimum),
    'summary minimum does not match measured rows',
  )
  recordFailure(
    failures,
    approximatelyEqual(
      report.summary?.maxRelativeMarginOfError,
      maximumRme,
    ),
    'summary maximum RME does not match measured rows',
  )
  measurements.push({
    label: 'global geomean',
    count: cases.length,
    actual: global,
    minimum: policy.minimumGeomean,
    passed: global >= policy.minimumGeomean,
  })
  measurements.push({
    label: 'worst case',
    count: cases.length,
    actual: minimum,
    minimum: policy.minimumCaseRatio,
    passed: minimum >= policy.minimumCaseRatio,
  })
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

export const evaluateStructuralPerfReport = (
  report: StructuralPerfReport,
): StructuralPerfEvaluation => {
  try {
    return evaluateUnsafe(report)
  } catch (error) {
    return {
      passed: false,
      failures: Object.freeze([
        `structural report is malformed: ${(error as Error).message}`,
      ]),
      measurements: Object.freeze([]),
    }
  }
}

const artifactDirectory = (): string =>
  resolve(
    process.env.PERF_ARTIFACT_DIR ??
      join(tmpdir(), 'stopcock-fp-performance'),
  )

const main = async (): Promise<void> => {
  const engine = currentPerfEngine()
  const policy = STRUCTURAL_PERF_POLICIES[engine.id]
  const directory = artifactDirectory()
  const reportPath = join(directory, `structural-${engine.id}.json`)
  const gatePath = join(directory, `structural-${engine.id}-gate.json`)
  await mkdir(directory, { recursive: true })
  let report: StructuralPerfReport | undefined
  let generationError: string | undefined
  let evaluation: StructuralPerfEvaluation = {
    passed: false,
    failures: Object.freeze(['structural runner did not produce a report']),
    measurements: Object.freeze([]),
  }
  try {
    const generated = await runStructuralPerf({
      rounds: policy.minimumRounds,
      warmupRounds: policy.minimumWarmupRounds,
      minimumBatchWorkUnits: policy.minimumBatchWorkUnits,
      targetWorkUnitsPerMicroBatch: policy.targetWorkUnitsPerMicroBatch,
      quick: false,
      out: reportPath,
    })
    report = generated.report
    evaluation = evaluateStructuralPerfReport(report)
  } catch (error) {
    generationError = (error as Error).message
    evaluation = {
      passed: false,
      failures: Object.freeze([
        `structural generation failed: ${generationError}`,
      ]),
      measurements: Object.freeze([]),
    }
  }
  const passed = generationError === undefined && evaluation.passed
  await writeFile(
    gatePath,
    `${JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        engine,
        reportPath,
        generationError,
        policy,
        reportSummary: report?.summary,
        evaluation,
        passed,
      },
      null,
      2,
    )}\n`,
  )
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
  for (const failure of evaluation.failures) {
    console.error(`FAIL\t${failure}`)
  }
  console.log(`raw report: ${reportPath}`)
  console.log(`gate report: ${gatePath}`)
  if (!passed) process.exitCode = 1
}

const invokedPath =
  process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
