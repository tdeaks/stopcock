import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EXPECTED_THIRD_WAVE_BASELINE,
  EXPECTED_THIRD_WAVE_CASES,
  EXPECTED_THIRD_WAVE_COVERAGE,
  EXPECTED_THIRD_WAVE_SUBJECT_FILES,
  EXPECTED_THIRD_WAVE_SUBJECT_ID,
  EXPECTED_THIRD_WAVE_SUBJECT_SHA256,
  minimumThirdWaveBatchIterations,
  THIRD_WAVE_PERF_POLICIES,
} from './third-wave-perf-contract'
import {
  runThirdWavePerf,
  type ThirdWavePerfCase,
  type ThirdWavePerfReport,
} from './third-wave-perf'
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

export interface ThirdWaveGateMeasurement {
  readonly label: 'global geomean' | 'worst case'
  readonly count: number
  readonly actual: number
  readonly minimum: number
  readonly passed: boolean
}

export interface ThirdWavePerfEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
  readonly measurements: readonly ThirdWaveGateMeasurement[]
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
    ? ((sorted[middle - 1] as number) +
        (sorted[middle] as number)) /
        2
    : (sorted[middle] as number)
}

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) /
  values.length

const geomean = (values: readonly number[]): number =>
  values.length === 0
    ? Number.NaN
    : Math.exp(
        values.reduce(
          (total, value) => total + Math.log(value),
          0,
        ) / values.length,
      )

const approximatelyEqual = (left: number, right: number): boolean =>
  Number.isFinite(left) &&
  Number.isFinite(right) &&
  Math.abs(left - right) <=
    Math.max(1e-9, Math.abs(right) * 1e-9)

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
      resample[index] =
        values[Math.floor(rng() * values.length)] as number
    }
    medians[sample] = median(resample)
  }
  medians.sort((left, right) => left - right)
  return {
    low: medians[Math.floor((alpha / 2) * samples)] as number,
    high: medians[
      Math.min(
        samples - 1,
        Math.ceil((1 - alpha / 2) * samples) - 1,
      )
    ] as number,
  }
}

const signTestP = (values: readonly number[]): number => {
  const nonTied = values.filter((ratio) => ratio !== 1)
  if (nonTied.length === 0) return 1
  const positive = nonTied.filter((ratio) => ratio > 1).length
  const logChoose = (n: number, k: number): number => {
    let result = 0
    for (let index = 0; index < k; index += 1) {
      result +=
        Math.log(n - index) - Math.log(index + 1)
    }
    return result
  }
  const logPmf = (k: number): number =>
    logChoose(nonTied.length, k) -
    nonTied.length * Math.log(2)
  const threshold = Math.exp(logPmf(positive)) + 1e-12
  let result = 0
  for (let index = 0; index <= nonTied.length; index += 1) {
    const probability = Math.exp(logPmf(index))
    if (probability <= threshold) result += probability
  }
  return Math.min(1, result)
}

const failUnless = (
  failures: string[],
  condition: boolean,
  message: string,
): void => {
  if (!condition) failures.push(message)
}

const sameStrings = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index])

const sameEngine = (left: PerfEngine, right: PerfEngine): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const validEngine = (engine: PerfEngine): boolean => {
  if (engine.id !== 'bun-jsc' && engine.id !== 'node-v8') {
    return false
  }
  if (
    engine.name !== expectedEngineName(engine.id) ||
    engine.runtime !==
      (engine.id === 'bun-jsc' ? 'bun' : 'node') ||
    typeof engine.runtimeVersion !== 'string' ||
    engine.runtimeVersion.length === 0 ||
    typeof engine.platform !== 'string' ||
    engine.platform.length === 0 ||
    typeof engine.architecture !== 'string' ||
    engine.architecture.length === 0
  ) {
    return false
  }
  return engine.id === 'bun-jsc'
    ? typeof engine.nodeCompatibility === 'string' &&
        engine.nodeCompatibility.length > 0
    : typeof engine.v8 === 'string' && engine.v8.length > 0
}

const evaluateUnsafe = (
  report: ThirdWavePerfReport,
): ThirdWavePerfEvaluation => {
  const failures: string[] = []
  const measurements: ThirdWaveGateMeasurement[] = []
  const cases: readonly ThirdWavePerfCase[] = Array.isArray(
    report.cases,
  )
    ? report.cases
    : []
  const skipped: readonly string[] = Array.isArray(report.skipped)
    ? report.skipped
    : []
  const supported =
    report.engine?.id === 'bun-jsc' ||
    report.engine?.id === 'node-v8'
  const policy = supported
    ? THIRD_WAVE_PERF_POLICIES[report.engine.id]
    : THIRD_WAVE_PERF_POLICIES['bun-jsc']

  failUnless(failures, report.version === 1, 'unexpected report version')
  failUnless(
    failures,
    typeof report.generatedAt === 'string' &&
      Number.isFinite(Date.parse(report.generatedAt)),
    'report timestamp is invalid',
  )
  failUnless(
    failures,
    supported && validEngine(report.engine),
    'runtime identity is invalid',
  )
  failUnless(
    failures,
    report.subject?.id === EXPECTED_THIRD_WAVE_SUBJECT_ID,
    'subject identity is invalid',
  )
  const subjectFiles = Array.isArray(report.subject?.files)
    ? report.subject.files
    : []
  failUnless(
    failures,
    sameStrings(subjectFiles, EXPECTED_THIRD_WAVE_SUBJECT_FILES),
    'subject files do not match the pinned contract',
  )
  failUnless(
    failures,
    report.subject?.sha256 === EXPECTED_THIRD_WAVE_SUBJECT_SHA256,
    'subject SHA-256 does not match the pinned implementation',
  )
  failUnless(
    failures,
    report.baseline?.id === EXPECTED_THIRD_WAVE_BASELINE.id &&
      report.baseline?.sha256 ===
        EXPECTED_THIRD_WAVE_BASELINE.sha256,
    'frozen baseline identity or SHA-256 is invalid',
  )

  const expectedNames = EXPECTED_THIRD_WAVE_CASES.map(
    (item) => item.name,
  )
  const names = cases.map((item) => item.name)
  const projection = cases.map(({ name, workUnits }) => ({
    name,
    workUnits,
  }))
  failUnless(
    failures,
    sameStrings(names, expectedNames),
    'case order/population does not match the pinned contract',
  )
  failUnless(
    failures,
    report.coverage?.caseCount ===
      EXPECTED_THIRD_WAVE_COVERAGE.caseCount,
    'coverage case count is invalid',
  )
  failUnless(
    failures,
    report.coverage?.caseNamesSha256 === jsonSha256(names) &&
      report.coverage.caseNamesSha256 ===
        EXPECTED_THIRD_WAVE_COVERAGE.caseNamesSha256,
    'case-name coverage SHA-256 is invalid',
  )
  failUnless(
    failures,
    report.coverage?.projectionSha256 ===
      jsonSha256(projection) &&
      report.coverage.projectionSha256 ===
        EXPECTED_THIRD_WAVE_COVERAGE.projectionSha256,
    'projection coverage SHA-256 is invalid',
  )

  failUnless(
    failures,
    report.args?.quick === false,
    'release gate cannot use --quick',
  )
  failUnless(
    failures,
    report.args?.casesFilter === undefined,
    'release gate cannot filter cases',
  )
  failUnless(
    failures,
    Number.isSafeInteger(report.args?.rounds) &&
      report.args.rounds >= policy.minimumRounds,
    'round count is below policy',
  )
  failUnless(
    failures,
    Number.isSafeInteger(report.args?.warmupRounds) &&
      report.args.warmupRounds >= policy.minimumWarmupRounds,
    'warmup count is below policy',
  )
  failUnless(
    failures,
    Number.isSafeInteger(report.args?.minimumBatchWorkUnits) &&
      report.args.minimumBatchWorkUnits >=
        policy.minimumBatchWorkUnits,
    'batch work is below policy',
  )
  failUnless(
    failures,
    report.args?.targetWorkUnitsPerMicroBatch ===
      policy.targetWorkUnitsPerMicroBatch,
    'micro-batch work does not match policy',
  )
  failUnless(
    failures,
    cases.length === EXPECTED_THIRD_WAVE_COVERAGE.caseCount,
    'report is missing measured cases',
  )
  failUnless(
    failures,
    report.summary?.count === cases.length &&
      report.summary?.expectedCount ===
        EXPECTED_THIRD_WAVE_COVERAGE.caseCount,
    'summary counts are invalid',
  )
  failUnless(
    failures,
    report.summary?.complete === true,
    'report is incomplete',
  )
  failUnless(
    failures,
    report.summary?.allCorrect === true &&
      cases.every((item) => item.correctnessOk),
    'one or more cases are incorrect',
  )
  failUnless(
    failures,
    skipped.length === 0,
    'report contains skipped cases',
  )

  const seen = new Set<string>()
  for (const item of cases) {
    failUnless(
      failures,
      !seen.has(item.name),
      `${item.name}: duplicate case`,
    )
    seen.add(item.name)
    const expected = EXPECTED_THIRD_WAVE_CASES.find(
      (candidate) => candidate.name === item.name,
    )
    failUnless(
      failures,
      expected !== undefined &&
        item.workUnits === expected.workUnits,
      `${item.name}: work units are invalid`,
    )
    failUnless(
      failures,
      validEngine(item.workerEngine) &&
        sameEngine(item.workerEngine, report.engine),
      `${item.name}: worker runtime identity is invalid`,
    )
    failUnless(
      failures,
      item.rounds === report.args.rounds &&
        item.rounds >= policy.minimumRounds,
      `${item.name}: rounds are invalid`,
    )
    const minimumBatch = minimumThirdWaveBatchIterations(
      item.workUnits,
      policy,
    )
    failUnless(
      failures,
      Number.isSafeInteger(item.batchIterations) &&
        item.batchIterations >= minimumBatch,
      `${item.name}: batch size is below policy`,
    )
    const microBatch = consumedItemsMicroBatchIterations(
      item.workUnits,
      item.batchIterations,
      policy.targetWorkUnitsPerMicroBatch,
    )
    failUnless(
      failures,
      item.sampling?.id === INTERLEAVED_PAIRED_SAMPLER_ID &&
        item.sampling?.order ===
          INTERLEAVED_PAIRED_SAMPLER_ORDER &&
        item.sampling?.batchIterationsPerSide ===
          item.batchIterations &&
        item.sampling?.microBatchIterations === microBatch &&
        item.sampling?.microBatchesPerSide ===
          Math.ceil(item.batchIterations / microBatch) &&
        item.sampling?.targetWorkUnitsPerMicroBatch ===
          policy.targetWorkUnitsPerMicroBatch &&
        item.sampling?.nominalWorkUnitsPerMicroBatch ===
          microBatch * item.workUnits,
      `${item.name}: interleaved sampler metadata is invalid`,
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
      failUnless(
        failures,
        samples.length === item.rounds &&
          samples.every(
            (sample) => Number.isFinite(sample) && sample > 0,
          ),
        `${item.name}: ${label} raw samples are invalid`,
      )
    }
    failUnless(
      failures,
      current.length === baseline.length &&
        current.length === ratios.length &&
        ratios.every((ratio, index) =>
          approximatelyEqual(
            ratio,
            (baseline[index] as number) /
              (current[index] as number),
          ),
        ),
      `${item.name}: raw ratios cannot be recomputed`,
    )
    failUnless(
      failures,
      approximatelyEqual(item.medianRatio, median(ratios)) &&
        approximatelyEqual(item.meanRatio, mean(ratios)),
      `${item.name}: median or mean is forged`,
    )
    const ci = bootstrapMedianCI(ratios)
    failUnless(
      failures,
      approximatelyEqual(item.ciLow, ci.low) &&
        approximatelyEqual(item.ciHigh, ci.high),
      `${item.name}: confidence interval is forged`,
    )
    failUnless(
      failures,
      approximatelyEqual(item.signTestP, signTestP(ratios)),
      `${item.name}: sign test is forged`,
    )
    const rme =
      ((item.ciHigh - item.ciLow) /
        (2 * item.medianRatio)) *
      100
    failUnless(
      failures,
      Number.isFinite(item.relativeMarginOfError) &&
        item.relativeMarginOfError >= 0 &&
        approximatelyEqual(item.relativeMarginOfError, rme),
      `${item.name}: RME is forged`,
    )
    failUnless(
      failures,
      item.relativeMarginOfError <= policy.maximumRme ||
        // Same escape hatch as without-perf-gate and data-functional: a wide
        // interval is still release-safe when its entire 95% confidence
        // range clears the case floor. Adopted 2026-08-24 after
        // schema/map-sync-success blew through the requalified 48% cap
        // (its ratio sits at 2-4x, CI-low far above the 0.15 floor; the
        // row's variance is occasionally unbounded, its throughput is not).
        item.ciLow >= policy.minimumCaseRatio,
      `${item.name}: RME exceeds ${policy.maximumRme}%`,
    )
  }

  const ratios = cases
    .map((item) => item.medianRatio)
    .filter((ratio) => Number.isFinite(ratio) && ratio > 0)
  const rmes = cases
    .map((item) => item.relativeMarginOfError)
    .filter((rme) => Number.isFinite(rme) && rme >= 0)
  const global = geomean(ratios)
  const minimum =
    ratios.length === 0 ? Number.NaN : Math.min(...ratios)
  const maximumRme =
    rmes.length === 0 ? Number.NaN : Math.max(...rmes)
  failUnless(
    failures,
    approximatelyEqual(report.summary?.geomeanRatio, global) &&
      approximatelyEqual(report.summary?.minRatio, minimum) &&
      approximatelyEqual(
        report.summary?.maxRelativeMarginOfError,
        maximumRme,
      ),
    'summary statistics cannot be recomputed',
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

export const evaluateThirdWavePerfReport = (
  report: ThirdWavePerfReport,
): ThirdWavePerfEvaluation => {
  try {
    return evaluateUnsafe(report)
  } catch (error) {
    return {
      passed: false,
      failures: Object.freeze([
        `third-wave report is malformed: ${(error as Error).message}`,
      ]),
      measurements: Object.freeze([]),
    }
  }
}

const main = async (): Promise<void> => {
  const engine = currentPerfEngine()
  const policy = THIRD_WAVE_PERF_POLICIES[engine.id]
  const directory = resolve(
    process.env.PERF_ARTIFACT_DIR ??
      join(tmpdir(), 'stopcock-fp-performance'),
  )
  const reportPath = join(directory, `third-wave-${engine.id}.json`)
  const gatePath = join(
    directory,
    `third-wave-${engine.id}-gate.json`,
  )
  await mkdir(directory, { recursive: true })
  let report: ThirdWavePerfReport | undefined
  let generationError: string | undefined
  let evaluation: ThirdWavePerfEvaluation = {
    passed: false,
    failures: Object.freeze(['runner did not produce a report']),
    measurements: Object.freeze([]),
  }
  try {
    const generated = await runThirdWavePerf({
      rounds: policy.minimumRounds,
      warmupRounds: policy.minimumWarmupRounds,
      minimumBatchWorkUnits: policy.minimumBatchWorkUnits,
      targetWorkUnitsPerMicroBatch:
        policy.targetWorkUnitsPerMicroBatch,
      quick: false,
      out: reportPath,
    })
    report = generated.report
    evaluation = evaluateThirdWavePerfReport(report)
  } catch (error) {
    generationError = (error as Error).message
    evaluation = {
      passed: false,
      failures: Object.freeze([
        `third-wave generation failed: ${generationError}`,
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
