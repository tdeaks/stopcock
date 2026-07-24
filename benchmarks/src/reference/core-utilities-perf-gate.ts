import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CORE_UTILITIES_PERF_POLICIES,
  EXPECTED_CORE_UTILITIES_BASELINE,
  EXPECTED_CORE_UTILITIES_CASES,
  EXPECTED_CORE_UTILITIES_COVERAGE,
  EXPECTED_CORE_UTILITIES_SUBJECT_FILES,
  EXPECTED_CORE_UTILITIES_SUBJECT_ID,
  EXPECTED_CORE_UTILITIES_SUBJECT_SHA256,
  minimumCoreUtilitiesBatchIterations,
} from './core-utilities-perf-contract'
import {
  runCoreUtilitiesPerf,
  type CoreUtilitiesPerfCase,
  type CoreUtilitiesPerfReport,
} from './core-utilities-perf'
import { currentPerfEngine, expectedEngineName, type PerfEngine } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
} from './perf-runner'

export interface CoreUtilitiesGateMeasurement {
  readonly label: 'global geomean' | 'worst case'
  readonly count: number
  readonly actual: number
  readonly minimum: number
  readonly passed: boolean
}

export interface CoreUtilitiesPerfEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
  readonly measurements: readonly CoreUtilitiesGateMeasurement[]
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

const jsonSha256 = (value: unknown): string => sha256(JSON.stringify(value))

const median = (values: readonly number[]): number => {
  if (values.length === 0) return Number.NaN
  const sorted = values.slice().sort((left, right) => left - right)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length

const geomean = (values: readonly number[]): number => {
  if (values.length === 0) return Number.NaN
  return Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length)
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
  const medians: number[] = new Array(samples)
  const resample: number[] = new Array(values.length)
  for (let sample = 0; sample < samples; sample++) {
    for (let index = 0; index < values.length; index++) {
      resample[index] = values[Math.floor(rng() * values.length)]
    }
    medians[sample] = median(resample)
  }
  medians.sort((left, right) => left - right)
  return {
    low: medians[Math.floor((alpha / 2) * samples)],
    high: medians[Math.min(samples - 1, Math.ceil((1 - alpha / 2) * samples) - 1)],
  }
}

const signTestP = (values: readonly number[]): number => {
  const nonTied = values.filter((ratio) => ratio !== 1)
  if (nonTied.length === 0) return 1
  const positives = nonTied.filter((ratio) => ratio > 1).length
  const logChoose = (n: number, k: number): number => {
    let total = 0
    for (let index = 0; index < k; index++) {
      total += Math.log(n - index) - Math.log(index + 1)
    }
    return total
  }
  const logPmf = (count: number): number =>
    logChoose(nonTied.length, count) - nonTied.length * Math.log(2)
  const observed = Math.exp(logPmf(positives))
  let probability = 0
  for (let count = 0; count <= nonTied.length; count++) {
    const pmf = Math.exp(logPmf(count))
    if (pmf <= observed + 1e-12) probability += pmf
  }
  return Math.min(1, probability)
}

const recordFailure = (failures: string[], condition: boolean, message: string): void => {
  if (!condition) failures.push(message)
}

const sameStringArray = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const sameEngine = (left: PerfEngine, right: PerfEngine): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const validEngine = (engine: PerfEngine): boolean => {
  if (engine.id !== 'bun-jsc' && engine.id !== 'node-v8') return false
  if (engine.name !== expectedEngineName(engine.id)) return false
  if (engine.runtime !== (engine.id === 'bun-jsc' ? 'bun' : 'node')) return false
  if (typeof engine.runtimeVersion !== 'string' || engine.runtimeVersion.length === 0) return false
  if (typeof engine.platform !== 'string' || typeof engine.architecture !== 'string') return false
  return engine.id === 'bun-jsc'
    ? typeof engine.nodeCompatibility === 'string'
    : typeof engine.v8 === 'string'
}

const evaluateUnsafe = (report: CoreUtilitiesPerfReport): CoreUtilitiesPerfEvaluation => {
  const failures: string[] = []
  const measurements: CoreUtilitiesGateMeasurement[] = []
  const cases: readonly CoreUtilitiesPerfCase[] = Array.isArray(report.cases) ? report.cases : []
  const skipped: readonly string[] = Array.isArray(report.skipped) ? report.skipped : []
  const supportedEngine = report.engine?.id === 'bun-jsc' || report.engine?.id === 'node-v8'
  const policy = supportedEngine
    ? CORE_UTILITIES_PERF_POLICIES[report.engine.id]
    : CORE_UTILITIES_PERF_POLICIES['bun-jsc']

  recordFailure(failures, report.version === 1, `unexpected report version ${report.version}`)
  recordFailure(
    failures,
    typeof report.generatedAt === 'string' && Number.isFinite(Date.parse(report.generatedAt)),
    'report has no valid generatedAt timestamp',
  )
  recordFailure(
    failures,
    supportedEngine && validEngine(report.engine),
    `unexpected core-utilities runtime identity ${String(report.engine?.id)}`,
  )
  recordFailure(
    failures,
    report.subject?.id === EXPECTED_CORE_UTILITIES_SUBJECT_ID,
    `unexpected core-utilities subject ${String(report.subject?.id)}`,
  )
  const subjectFiles: readonly string[] = Array.isArray(report.subject?.files)
    ? report.subject.files
    : []
  recordFailure(
    failures,
    sameStringArray(subjectFiles, EXPECTED_CORE_UTILITIES_SUBJECT_FILES),
    'subject provenance files do not match the pinned contract',
  )
  recordFailure(
    failures,
    report.subject?.sha256 === EXPECTED_CORE_UTILITIES_SUBJECT_SHA256,
    'subject provenance SHA-256 does not match the pinned implementation',
  )
  recordFailure(
    failures,
    report.baseline?.id === EXPECTED_CORE_UTILITIES_BASELINE.id,
    `unexpected frozen baseline identity ${String(report.baseline?.id)}`,
  )
  recordFailure(
    failures,
    report.baseline?.sha256 === EXPECTED_CORE_UTILITIES_BASELINE.sha256,
    'frozen core-utilities baseline SHA-256 does not match',
  )

  const expectedNames = EXPECTED_CORE_UTILITIES_CASES.map((item) => item.name)
  const names = cases.map((item) => item.name)
  const projection = cases.map((item) => ({ name: item.name, workUnits: item.workUnits }))
  recordFailure(
    failures,
    sameStringArray(names, expectedNames),
    'measured case order/population does not match the pinned contract',
  )
  recordFailure(
    failures,
    report.coverage?.caseCount === EXPECTED_CORE_UTILITIES_COVERAGE.caseCount,
    `coverage reports ${String(report.coverage?.caseCount)} cases; expected ${EXPECTED_CORE_UTILITIES_COVERAGE.caseCount}`,
  )
  recordFailure(
    failures,
    report.coverage?.caseNamesSha256 === jsonSha256(names),
    'coverage case-name SHA-256 does not match measured rows',
  )
  recordFailure(
    failures,
    report.coverage?.caseNamesSha256 === EXPECTED_CORE_UTILITIES_COVERAGE.caseNamesSha256,
    'coverage case-name SHA-256 does not match the pinned contract',
  )
  recordFailure(
    failures,
    report.coverage?.projectionSha256 === jsonSha256(projection),
    'coverage projection SHA-256 does not match measured rows',
  )
  recordFailure(
    failures,
    report.coverage?.projectionSha256 === EXPECTED_CORE_UTILITIES_COVERAGE.projectionSha256,
    'coverage projection SHA-256 does not match the pinned contract',
  )

  recordFailure(failures, report.args?.quick === false, 'release gate cannot use --quick')
  recordFailure(
    failures,
    report.args?.casesFilter === undefined,
    'release gate cannot filter core-utilities cases',
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args?.rounds) && report.args.rounds >= policy.minimumRounds,
    `report used ${String(report.args?.rounds)} rounds; minimum is ${policy.minimumRounds}`,
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args?.warmupRounds) &&
      report.args.warmupRounds >= policy.minimumWarmupRounds,
    `report used ${String(report.args?.warmupRounds)} warmup rounds; minimum is ${policy.minimumWarmupRounds}`,
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args?.minimumBatchWorkUnits) &&
      report.args.minimumBatchWorkUnits >= policy.minimumBatchWorkUnits,
    `batch-work target ${String(report.args?.minimumBatchWorkUnits)} is below ${policy.minimumBatchWorkUnits}`,
  )
  recordFailure(
    failures,
    report.args?.targetWorkUnitsPerMicroBatch === policy.targetWorkUnitsPerMicroBatch,
    `micro-batch target must be ${policy.targetWorkUnitsPerMicroBatch} work units`,
  )
  recordFailure(
    failures,
    cases.length === EXPECTED_CORE_UTILITIES_COVERAGE.caseCount,
    `report contains ${cases.length} cases; expected ${EXPECTED_CORE_UTILITIES_COVERAGE.caseCount}`,
  )
  recordFailure(
    failures,
    report.summary?.count === cases.length,
    'summary count does not match measured rows',
  )
  recordFailure(
    failures,
    report.summary?.expectedCount === EXPECTED_CORE_UTILITIES_COVERAGE.caseCount,
    'summary expected count does not match pinned coverage',
  )
  recordFailure(failures, report.summary?.complete === true, 'core-utilities report is incomplete')
  recordFailure(
    failures,
    report.summary?.allCorrect === true,
    'core-utilities summary is incorrect',
  )
  recordFailure(
    failures,
    cases.every((item) => item.correctnessOk === true),
    'one or more core-utilities cases produced incorrect output',
  )
  recordFailure(
    failures,
    skipped.length === 0,
    'core-utilities report has a malformed or non-empty skipped list',
  )

  const namesSeen = new Set<string>()
  for (const item of cases) {
    const casePolicy = policy.caseOverrides[item.name]
    const maximumRme = casePolicy?.maximumRme ?? policy.maximumRme
    const minimumCaseRatio =
      casePolicy?.minimumCaseRatio ?? policy.minimumCaseRatio
    recordFailure(failures, !namesSeen.has(item.name), `duplicate case: ${item.name}`)
    namesSeen.add(item.name)
    const expected = EXPECTED_CORE_UTILITIES_CASES.find((candidate) => candidate.name === item.name)
    recordFailure(
      failures,
      expected !== undefined && item.workUnits === expected.workUnits,
      `${item.name}: invalid work-unit count ${item.workUnits}`,
    )
    recordFailure(
      failures,
      validEngine(item.workerEngine) && sameEngine(item.workerEngine, report.engine),
      `${item.name}: worker runtime identity does not match coordinator`,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.rounds) &&
        item.rounds >= policy.minimumRounds &&
        item.rounds === report.args.rounds,
      `${item.name}: used ${item.rounds} rounds; report requested ${report.args.rounds}`,
    )
    const minimumBatch = minimumCoreUtilitiesBatchIterations(item.workUnits, policy)
    recordFailure(
      failures,
      Number.isSafeInteger(item.batchIterations) && item.batchIterations >= minimumBatch,
      `${item.name}: used batch size ${item.batchIterations}; minimum is ${minimumBatch}`,
    )
    const expectedMicroBatch = consumedItemsMicroBatchIterations(
      item.workUnits,
      item.batchIterations,
      policy.targetWorkUnitsPerMicroBatch,
    )
    recordFailure(
      failures,
      item.sampling?.id === INTERLEAVED_PAIRED_SAMPLER_ID,
      `${item.name}: unexpected sampler identity`,
    )
    recordFailure(
      failures,
      item.sampling?.order === INTERLEAVED_PAIRED_SAMPLER_ORDER,
      `${item.name}: unexpected sampler order`,
    )
    recordFailure(
      failures,
      item.sampling?.batchIterationsPerSide === item.batchIterations,
      `${item.name}: sampler batch does not match row batch`,
    )
    recordFailure(
      failures,
      item.sampling?.targetWorkUnitsPerMicroBatch === policy.targetWorkUnitsPerMicroBatch,
      `${item.name}: sampler work target is inconsistent`,
    )
    recordFailure(
      failures,
      item.sampling?.microBatchIterations === expectedMicroBatch,
      `${item.name}: sampler micro-batch iterations are inconsistent`,
    )
    recordFailure(
      failures,
      item.sampling?.microBatchesPerSide === Math.ceil(item.batchIterations / expectedMicroBatch),
      `${item.name}: sampler micro-batch count is inconsistent`,
    )
    recordFailure(
      failures,
      item.sampling?.nominalWorkUnitsPerMicroBatch === expectedMicroBatch * item.workUnits,
      `${item.name}: sampler nominal work is inconsistent`,
    )

    const currentSamples: readonly number[] = Array.isArray(item.currentSamplesNs)
      ? item.currentSamplesNs
      : []
    const baselineSamples: readonly number[] = Array.isArray(item.baselineSamplesNs)
      ? item.baselineSamplesNs
      : []
    const ratios: readonly number[] = Array.isArray(item.pairedRatios) ? item.pairedRatios : []
    for (const [label, samples] of [
      ['current', currentSamples],
      ['baseline', baselineSamples],
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
      currentSamples.length === baselineSamples.length &&
        currentSamples.length === ratios.length &&
        ratios.every((ratio, index) =>
          approximatelyEqual(ratio, baselineSamples[index] / currentSamples[index]),
        ),
      `${item.name}: raw paired ratios do not match baselineNs / currentNs`,
    )
    recordFailure(
      failures,
      approximatelyEqual(item.medianRatio, median(ratios)),
      `${item.name}: reported median does not match raw ratios`,
    )
    recordFailure(
      failures,
      approximatelyEqual(item.meanRatio, mean(ratios)),
      `${item.name}: reported mean does not match raw ratios`,
    )
    const rawCi = bootstrapMedianCI(ratios)
    recordFailure(
      failures,
      approximatelyEqual(item.ciLow, rawCi.low) && approximatelyEqual(item.ciHigh, rawCi.high),
      `${item.name}: confidence interval does not match raw ratios`,
    )
    recordFailure(
      failures,
      approximatelyEqual(item.signTestP, signTestP(ratios)),
      `${item.name}: sign-test p-value does not match raw ratios`,
    )
    const computedRme = ((item.ciHigh - item.ciLow) / (2 * item.medianRatio)) * 100
    recordFailure(
      failures,
      Number.isFinite(item.relativeMarginOfError) &&
        item.relativeMarginOfError >= 0 &&
        approximatelyEqual(item.relativeMarginOfError, computedRme),
      `${item.name}: relative margin of error is invalid`,
    )
    recordFailure(
      failures,
      item.relativeMarginOfError <= maximumRme,
      `${item.name}: relative margin of error exceeds ${maximumRme}%`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.medianRatio) &&
        item.medianRatio >= minimumCaseRatio,
      `${item.name}: median ratio ${item.medianRatio.toFixed(3)} is below ${minimumCaseRatio.toFixed(3)}`,
    )
  }

  const validRatios = cases
    .map((item) => item.medianRatio)
    .filter((ratio) => Number.isFinite(ratio) && ratio > 0)
  const validRmes = cases
    .map((item) => item.relativeMarginOfError)
    .filter((rme) => Number.isFinite(rme) && rme >= 0)
  const globalGeomean = geomean(validRatios)
  const minimumRatio = validRatios.length === 0 ? Number.NaN : Math.min(...validRatios)
  const minimumFloorHeadroom =
    cases.length === 0
      ? Number.NaN
      : Math.min(
          ...cases.map((item) => {
            const minimum =
              policy.caseOverrides[item.name]?.minimumCaseRatio ??
              policy.minimumCaseRatio
            return item.medianRatio / minimum
          }),
        )
  const maximumRme = validRmes.length === 0 ? Number.NaN : Math.max(...validRmes)
  recordFailure(
    failures,
    approximatelyEqual(report.summary?.geomeanRatio, globalGeomean),
    'summary geomean does not match measured rows',
  )
  recordFailure(
    failures,
    approximatelyEqual(report.summary?.minRatio, minimumRatio),
    'summary minimum does not match measured rows',
  )
  recordFailure(
    failures,
    approximatelyEqual(report.summary?.maxRelativeMarginOfError, maximumRme),
    'summary maximum RME does not match measured rows',
  )
  measurements.push({
    label: 'global geomean',
    count: cases.length,
    actual: globalGeomean,
    minimum: policy.minimumGeomean,
    passed: globalGeomean >= policy.minimumGeomean,
  })
  measurements.push({
    label: 'worst case / floor',
    count: cases.length,
    actual: minimumFloorHeadroom,
    minimum: 1,
    passed: minimumFloorHeadroom >= 1,
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

export const evaluateCoreUtilitiesPerfReport = (
  report: CoreUtilitiesPerfReport,
): CoreUtilitiesPerfEvaluation => {
  try {
    return evaluateUnsafe(report)
  } catch (error) {
    return {
      passed: false,
      failures: Object.freeze([`core-utilities report is malformed: ${(error as Error).message}`]),
      measurements: Object.freeze([]),
    }
  }
}

const artifactDirectory = (): string =>
  resolve(process.env.PERF_ARTIFACT_DIR ?? join(tmpdir(), 'stopcock-fp-performance'))

const main = async (): Promise<void> => {
  const engine = currentPerfEngine()
  const policy = CORE_UTILITIES_PERF_POLICIES[engine.id]
  const directory = artifactDirectory()
  const reportPath = join(directory, `core-utilities-${engine.id}.json`)
  const gatePath = join(directory, `core-utilities-${engine.id}-gate.json`)
  await mkdir(directory, { recursive: true })
  let report: CoreUtilitiesPerfReport | undefined
  let generationError: string | undefined
  let evaluation: CoreUtilitiesPerfEvaluation = {
    passed: false,
    failures: Object.freeze(['core-utilities runner did not produce a report']),
    measurements: Object.freeze([]),
  }
  try {
    const generated = await runCoreUtilitiesPerf({
      rounds: policy.minimumRounds,
      warmupRounds: policy.minimumWarmupRounds,
      minimumBatchWorkUnits: policy.minimumBatchWorkUnits,
      targetWorkUnitsPerMicroBatch: policy.targetWorkUnitsPerMicroBatch,
      quick: false,
      out: reportPath,
    })
    report = generated.report
    evaluation = evaluateCoreUtilitiesPerfReport(report)
  } catch (error) {
    generationError = (error as Error).message
    evaluation = {
      passed: false,
      failures: Object.freeze([`core-utilities generation failed: ${generationError}`]),
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
  console.log(`\nCore utilities release gate (${engine.name})\n`)
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
