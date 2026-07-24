import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPILER_PERF_POLICIES,
  EXPECTED_COMPILER_COVERAGE,
  EXPECTED_COMPILER_IMPLEMENTATION_FILES,
  EXPECTED_COMPILER_SUBJECT_ID,
  EXPECTED_COMPILER_SUPPORTED_CASE_NAMES,
  EXPECTED_COMPILER_SUPPORTED_OP_NAMES,
  EXPECTED_COMPILER_SUPPORTED_OPS_SHA256,
  minimumCompilerBatchIterations,
} from './compiler-perf-contract'
import {
  runCompilerPerf,
  type CompilerPerfCase,
  type CompilerPerfGap,
  type CompilerPerfReport,
} from './compiler-perf'
import { expectedEngineName, currentPerfEngine, type PerfEngine } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
} from './perf-runner'
import { EXPECTED_FROZEN_EMITTER, EXPECTED_PORTABLE_CORPUS } from './portable-perf-contract'

export interface CompilerGateMeasurement {
  readonly label: 'global geomean' | 'worst case'
  readonly count: number
  readonly actual: number
  readonly minimum: number
  readonly passed: boolean
}

export interface CompilerPerfEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
  readonly measurements: readonly CompilerGateMeasurement[]
}

const sha256 = (contents: string): string => createHash('sha256').update(contents).digest('hex')

const jsonSha256 = (value: unknown): string => sha256(JSON.stringify(value))

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
  const resampledMedians: number[] = new Array(samples)
  const resample: number[] = new Array(values.length)
  for (let sample = 0; sample < samples; sample++) {
    for (let index = 0; index < values.length; index++) {
      resample[index] = values[Math.floor(rng() * values.length)]
    }
    resampledMedians[sample] = median(resample)
  }
  resampledMedians.sort((left, right) => left - right)
  const lowIndex = Math.floor((alpha / 2) * samples)
  const highIndex = Math.min(samples - 1, Math.ceil((1 - alpha / 2) * samples) - 1)
  return { low: resampledMedians[lowIndex], high: resampledMedians[highIndex] }
}

const signTestP = (values: readonly number[]): number => {
  const nonTied = values.filter((ratio) => ratio !== 1)
  const n = nonTied.length
  if (n === 0) return 1
  const positives = nonTied.filter((ratio) => ratio > 1).length
  const logChoose = (nn: number, kk: number): number => {
    let total = 0
    for (let index = 0; index < kk; index++) {
      total += Math.log(nn - index) - Math.log(index + 1)
    }
    return total
  }
  const logPmf = (count: number): number => logChoose(n, count) - n * Math.log(2)
  const observedPmf = Math.exp(logPmf(positives))
  let probability = 0
  for (let count = 0; count <= n; count++) {
    const pmf = Math.exp(logPmf(count))
    if (pmf <= observedPmf + 1e-12) probability += pmf
  }
  return Math.min(1, probability)
}

const sameStringArray = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const sameEngine = (left: PerfEngine, right: PerfEngine): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const validEngineIdentity = (engine: PerfEngine): boolean => {
  if (engine.id !== 'bun-jsc' && engine.id !== 'node-v8') return false
  if (engine.name !== expectedEngineName(engine.id)) return false
  if (engine.runtime !== (engine.id === 'bun-jsc' ? 'bun' : 'node')) return false
  if (typeof engine.runtimeVersion !== 'string' || engine.runtimeVersion.length === 0) return false
  if (typeof engine.platform !== 'string' || engine.platform.length === 0) return false
  if (typeof engine.architecture !== 'string' || engine.architecture.length === 0) return false
  if (engine.id === 'bun-jsc') {
    return typeof engine.nodeCompatibility === 'string' && engine.nodeCompatibility.length > 0
  }
  return typeof engine.v8 === 'string' && engine.v8.length > 0
}

const recordFailure = (failures: string[], condition: boolean, message: string): void => {
  if (!condition) failures.push(message)
}

const recomputedCoverageProjection = (
  cases: readonly CompilerPerfCase[],
  gaps: readonly CompilerPerfGap[],
): string =>
  jsonSha256({
    supportedCases: cases.map((item) => ({ name: item.name, steps: item.stepKinds })),
    gaps,
  })

const evaluateCompilerPerfReportUnsafe = (report: CompilerPerfReport): CompilerPerfEvaluation => {
  const failures: string[] = []
  const measurements: CompilerGateMeasurement[] = []
  const cases: readonly CompilerPerfCase[] = Array.isArray(report.cases) ? report.cases : []
  const gaps: readonly CompilerPerfGap[] = Array.isArray(report.coverage?.gaps)
    ? report.coverage.gaps
    : []
  const skipped: readonly string[] = Array.isArray(report.skipped) ? report.skipped : []
  const supportedEngine = report.engine?.id === 'bun-jsc' || report.engine?.id === 'node-v8'
  const policy = supportedEngine
    ? COMPILER_PERF_POLICIES[report.engine.id]
    : COMPILER_PERF_POLICIES['bun-jsc']

  recordFailure(
    failures,
    report.version === 1,
    `unexpected compiler report version ${report.version}`,
  )
  recordFailure(
    failures,
    typeof report.generatedAt === 'string' && Number.isFinite(Date.parse(report.generatedAt)),
    'report has no valid generatedAt timestamp',
  )
  recordFailure(
    failures,
    supportedEngine && validEngineIdentity(report.engine),
    `unexpected benchmark engine identity ${String(report.engine?.id)}/${String(report.engine?.name)}`,
  )
  recordFailure(
    failures,
    report.corpus?.id === EXPECTED_PORTABLE_CORPUS.id,
    `unexpected compiler corpus identity ${String(report.corpus?.id)}`,
  )
  recordFailure(
    failures,
    report.corpus?.version === EXPECTED_PORTABLE_CORPUS.version,
    `unexpected compiler corpus version ${String(report.corpus?.version)}`,
  )
  recordFailure(
    failures,
    report.corpus?.sha256 === EXPECTED_PORTABLE_CORPUS.sha256,
    `compiler corpus SHA-256 does not match ${EXPECTED_PORTABLE_CORPUS.id}`,
  )
  recordFailure(
    failures,
    report.corpus?.totalCaseCount === EXPECTED_COMPILER_COVERAGE.corpusCaseCount,
    `compiler corpus contains ${String(report.corpus?.totalCaseCount)} cases; expected ${EXPECTED_COMPILER_COVERAGE.corpusCaseCount}`,
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
    report.compiler?.id === EXPECTED_COMPILER_SUBJECT_ID,
    `unexpected compiler subject identity ${String(report.compiler?.id)}`,
  )
  recordFailure(
    failures,
    Array.isArray(report.compiler?.implementationFiles) &&
      sameStringArray(report.compiler.implementationFiles, EXPECTED_COMPILER_IMPLEMENTATION_FILES),
    'compiler provenance file list does not match the pinned subject definition',
  )
  recordFailure(
    failures,
    typeof report.compiler?.implementationSha256 === 'string' &&
      /^[0-9a-f]{64}$/u.test(report.compiler.implementationSha256),
    'compiler implementation provenance has no valid SHA-256',
  )
  const supportedOps: readonly string[] = Array.isArray(report.compiler?.supportedOps)
    ? report.compiler.supportedOps
    : []
  recordFailure(
    failures,
    sameStringArray(supportedOps, EXPECTED_COMPILER_SUPPORTED_OP_NAMES),
    'compiler supported-op capability set does not match the pinned contract',
  )
  const recomputedSupportedOpsSha256 = jsonSha256(supportedOps)
  recordFailure(
    failures,
    report.compiler?.supportedOpsSha256 === recomputedSupportedOpsSha256,
    'compiler supported-op SHA-256 does not match its reported capability set',
  )
  recordFailure(
    failures,
    report.compiler?.supportedOpsSha256 === EXPECTED_COMPILER_SUPPORTED_OPS_SHA256,
    'compiler supported-op SHA-256 does not match the pinned contract',
  )

  recordFailure(
    failures,
    report.coverage?.corpusCaseCount === EXPECTED_COMPILER_COVERAGE.corpusCaseCount,
    `coverage corpus count ${String(report.coverage?.corpusCaseCount)} does not match ${EXPECTED_COMPILER_COVERAGE.corpusCaseCount}`,
  )
  recordFailure(
    failures,
    report.coverage?.supportedCaseCount === EXPECTED_COMPILER_COVERAGE.supportedCaseCount,
    `coverage claims ${String(report.coverage?.supportedCaseCount)} supported cases; expected ${EXPECTED_COMPILER_COVERAGE.supportedCaseCount}`,
  )
  recordFailure(
    failures,
    report.coverage?.gapCount === EXPECTED_COMPILER_COVERAGE.gapCount &&
      gaps.length === EXPECTED_COMPILER_COVERAGE.gapCount,
    `coverage contains ${gaps.length} compiler gaps; expected ${EXPECTED_COMPILER_COVERAGE.gapCount}`,
  )
  recordFailure(
    failures,
    report.coverage?.gapCount === gaps.length,
    'coverage gap count does not match its explicit gap ledger',
  )
  for (const gap of gaps) {
    recordFailure(
      failures,
      typeof gap.name === 'string' &&
        gap.name.length > 0 &&
        Array.isArray(gap.steps) &&
        gap.steps.length > 0 &&
        Array.isArray(gap.unsupportedOps) &&
        gap.unsupportedOps.length > 0 &&
        typeof gap.reason === 'string' &&
        gap.reason.length > 0,
      'compiler coverage contains a malformed or unexplained unsupported gap',
    )
  }
  const caseNames = cases.map((item) => item.name)
  const caseNamesSha256 = jsonSha256(caseNames)
  recordFailure(
    failures,
    sameStringArray(caseNames, EXPECTED_COMPILER_SUPPORTED_CASE_NAMES),
    'measured compiler case population does not match the pinned ordered case list',
  )
  recordFailure(
    failures,
    caseNamesSha256 === EXPECTED_COMPILER_COVERAGE.supportedCaseNamesSha256,
    'measured compiler case-name SHA-256 does not match the pinned population',
  )
  recordFailure(
    failures,
    report.coverage?.supportedCaseNamesSha256 === caseNamesSha256,
    'coverage case-name SHA-256 does not match the measured rows',
  )
  recordFailure(
    failures,
    report.coverage?.supportedCaseNamesSha256 ===
      EXPECTED_COMPILER_COVERAGE.supportedCaseNamesSha256,
    'coverage case-name SHA-256 does not match the pinned population',
  )
  const projectionSha256 = recomputedCoverageProjection(cases, gaps)
  recordFailure(
    failures,
    report.coverage?.projectionSha256 === projectionSha256,
    'coverage projection SHA-256 does not match measured case steps and gap ledger',
  )
  recordFailure(
    failures,
    report.coverage?.projectionSha256 === EXPECTED_COMPILER_COVERAGE.projectionSha256,
    'coverage projection SHA-256 does not match the pinned compiler/corpus projection',
  )

  recordFailure(
    failures,
    report.args?.quick === false,
    'compiler release gate must run the full corpus, not --quick',
  )
  recordFailure(
    failures,
    report.args?.casesFilter === undefined,
    'compiler release gate cannot filter the pinned case population',
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
    Number.isSafeInteger(report.args?.minimumBatchInputItems) &&
      report.args.minimumBatchInputItems >= policy.minimumBatchInputItems,
    `report used a ${String(report.args?.minimumBatchInputItems)}-input batch target; minimum is ${policy.minimumBatchInputItems}`,
  )
  recordFailure(
    failures,
    report.args?.targetConsumedItemsPerMicroBatch === policy.targetConsumedItemsPerMicroBatch,
    `report micro-batch target must be ${policy.targetConsumedItemsPerMicroBatch} consumed items`,
  )
  recordFailure(
    failures,
    cases.length === EXPECTED_COMPILER_COVERAGE.supportedCaseCount,
    `report contains ${cases.length} measured cases; expected ${EXPECTED_COMPILER_COVERAGE.supportedCaseCount}`,
  )
  recordFailure(
    failures,
    report.summary?.count === cases.length,
    `summary count ${String(report.summary?.count)} does not match ${cases.length} measured rows`,
  )
  recordFailure(
    failures,
    report.summary?.expectedSupportedCount === EXPECTED_COMPILER_COVERAGE.supportedCaseCount,
    `summary expected-supported count ${String(report.summary?.expectedSupportedCount)} does not match ${EXPECTED_COMPILER_COVERAGE.supportedCaseCount}`,
  )
  recordFailure(
    failures,
    report.summary?.corpusCaseCount === EXPECTED_COMPILER_COVERAGE.corpusCaseCount,
    'summary corpus count does not match the pinned corpus',
  )
  recordFailure(
    failures,
    report.summary?.gapCount === EXPECTED_COMPILER_COVERAGE.gapCount,
    'summary compiler-gap count does not match the pinned projection',
  )
  recordFailure(
    failures,
    report.summary?.complete === true,
    'compiler benchmark report is incomplete',
  )
  recordFailure(
    failures,
    report.summary?.allCorrect === true,
    'compiler benchmark summary is incorrect',
  )
  recordFailure(
    failures,
    cases.every((item) => item.correctnessOk === true),
    'one or more compiler benchmark cases produced incorrect output',
  )
  recordFailure(
    failures,
    skipped.length === 0,
    'compiler benchmark has a malformed or non-empty skipped-case list',
  )

  const seenNames = new Set<string>()
  for (const item of cases) {
    recordFailure(
      failures,
      typeof item.name === 'string' && item.name.length > 0,
      'compiler benchmark case has no non-empty name',
    )
    recordFailure(
      failures,
      !seenNames.has(item.name),
      `duplicate compiler benchmark case: ${item.name}`,
    )
    seenNames.add(item.name)
    recordFailure(
      failures,
      Array.isArray(item.stepKinds) &&
        item.stepKinds.length > 0 &&
        item.stepKinds.every((kind) => typeof kind === 'string' && kind.length > 0),
      `${item.name}: has no valid ordered compiler step list`,
    )
    recordFailure(
      failures,
      item.transformedSiteCount === 1,
      `${item.name}: expected one compiler-transformed site, found ${item.transformedSiteCount}`,
    )
    recordFailure(
      failures,
      validEngineIdentity(item.workerEngine) && sameEngine(item.workerEngine, report.engine),
      `${item.name}: worker runtime identity does not match the coordinator`,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.rounds) &&
        item.rounds >= policy.minimumRounds &&
        item.rounds === report.args.rounds,
      `${item.name}: used ${item.rounds} rounds; report requested ${report.args.rounds}`,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.inputSize) && item.inputSize > 0,
      `${item.name}: invalid input size ${item.inputSize}`,
    )
    recordFailure(
      failures,
      item.strata?.boundary === 'none' || item.strata?.boundary === 'present',
      `${item.name}: unrecognized boundary stratum ${String(item.strata?.boundary)}`,
    )
    const earlyExit = item.strata?.sinkKind === 'short-circuit' && item.strata?.boundary === 'none'
    recordFailure(
      failures,
      Number.isSafeInteger(item.consumedInputItems) &&
        item.consumedInputItems > 0 &&
        item.consumedInputItems <= item.inputSize &&
        (earlyExit || item.consumedInputItems === item.inputSize),
      `${item.name}: invalid consumed-input count ${item.consumedInputItems}`,
    )
    const minimumBatch = minimumCompilerBatchIterations(item.consumedInputItems, policy)
    recordFailure(
      failures,
      Number.isSafeInteger(item.batchIterations) && item.batchIterations >= minimumBatch,
      `${item.name}: used batch size ${item.batchIterations}; minimum is ${minimumBatch}`,
    )
    const expectedMicroBatch = consumedItemsMicroBatchIterations(
      item.consumedInputItems,
      item.batchIterations,
      policy.targetConsumedItemsPerMicroBatch,
    )
    recordFailure(
      failures,
      item.sampling?.id === INTERLEAVED_PAIRED_SAMPLER_ID,
      `${item.name}: unexpected sampler identity ${String(item.sampling?.id)}`,
    )
    recordFailure(
      failures,
      item.sampling?.order === INTERLEAVED_PAIRED_SAMPLER_ORDER,
      `${item.name}: unexpected sampler order ${String(item.sampling?.order)}`,
    )
    recordFailure(
      failures,
      item.sampling?.batchIterationsPerSide === item.batchIterations,
      `${item.name}: sampler batch does not match case batch`,
    )
    recordFailure(
      failures,
      item.sampling?.targetConsumedItemsPerMicroBatch === policy.targetConsumedItemsPerMicroBatch,
      `${item.name}: sampler target must be ${policy.targetConsumedItemsPerMicroBatch} consumed items`,
    )
    recordFailure(
      failures,
      item.sampling?.microBatchIterations === expectedMicroBatch,
      `${item.name}: sampler used ${String(item.sampling?.microBatchIterations)} micro-batch iterations; expected ${expectedMicroBatch}`,
    )
    recordFailure(
      failures,
      item.sampling?.microBatchesPerSide === Math.ceil(item.batchIterations / expectedMicroBatch),
      `${item.name}: sampler reported an inconsistent micro-batch count`,
    )
    recordFailure(
      failures,
      item.sampling?.nominalConsumedItemsPerMicroBatch ===
        expectedMicroBatch * item.consumedInputItems,
      `${item.name}: sampler reported inconsistent nominal consumed items`,
    )

    const compilerSamples: readonly number[] = Array.isArray(item.compilerSamplesNs)
      ? item.compilerSamplesNs
      : []
    const referenceSamples: readonly number[] = Array.isArray(item.referenceSamplesNs)
      ? item.referenceSamplesNs
      : []
    const pairedRatios: readonly number[] = Array.isArray(item.pairedRatios)
      ? item.pairedRatios
      : []
    recordFailure(
      failures,
      compilerSamples.length === item.rounds,
      `${item.name}: compiler raw sample count ${compilerSamples.length} does not match ${item.rounds} rounds`,
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
      compilerSamples.every((sample) => Number.isFinite(sample) && sample > 0),
      `${item.name}: compiler samples must be finite and positive`,
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
      compilerSamples.length === referenceSamples.length &&
      compilerSamples.length === pairedRatios.length
    recordFailure(
      failures,
      rawLengthsMatch &&
        pairedRatios.every((ratio, index) =>
          approximatelyEqual(ratio, referenceSamples[index] / compilerSamples[index]),
        ),
      `${item.name}: paired ratios do not match referenceNs / compilerNs`,
    )
    const rawMedian = median(pairedRatios)
    const rawMean = mean(pairedRatios)
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
    const rawCi = bootstrapMedianCI(pairedRatios)
    recordFailure(
      failures,
      Number.isFinite(item.ciLow) &&
        Number.isFinite(item.ciHigh) &&
        approximatelyEqual(item.ciLow, rawCi.low) &&
        approximatelyEqual(item.ciHigh, rawCi.high),
      `${item.name}: reported confidence interval does not match the raw paired ratios`,
    )
    const rawSignTestP = signTestP(pairedRatios)
    recordFailure(
      failures,
      Number.isFinite(item.signTestP) &&
        item.signTestP >= 0 &&
        item.signTestP <= 1 &&
        approximatelyEqual(item.signTestP, rawSignTestP),
      `${item.name}: reported sign-test p-value does not match the raw paired ratios`,
    )
    const computedRme = ((item.ciHigh - item.ciLow) / (2 * item.medianRatio)) * 100
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
      item.relativeMarginOfError <= policy.maximumRme || rawCi.low >= policy.minimumCaseRatio,
      `${item.name}: relative margin of error ${item.relativeMarginOfError}% exceeds ${policy.maximumRme}% and confidence-interval lower bound ${rawCi.low} is below ${policy.minimumCaseRatio}`,
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
  const maximumRme = validRmes.length === 0 ? Number.NaN : Math.max(...validRmes)
  recordFailure(
    failures,
    approximatelyEqual(report.summary?.geomeanRatio, globalGeomean),
    'reported compiler geomean does not match the measured rows',
  )
  recordFailure(
    failures,
    approximatelyEqual(report.summary?.minRatio, minimumRatio),
    'reported compiler minimum ratio does not match the measured rows',
  )
  recordFailure(
    failures,
    approximatelyEqual(report.summary?.maxRelativeMarginOfError, maximumRme),
    'reported compiler maximum RME does not match the measured rows',
  )

  measurements.push({
    label: 'global geomean',
    count: cases.length,
    actual: globalGeomean,
    minimum: policy.minimumGeomean,
    passed: globalGeomean >= policy.minimumGeomean,
  })
  measurements.push({
    label: 'worst case',
    count: cases.length,
    actual: minimumRatio,
    minimum: policy.minimumCaseRatio,
    passed: minimumRatio >= policy.minimumCaseRatio,
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

export const evaluateCompilerPerfReport = (report: CompilerPerfReport): CompilerPerfEvaluation => {
  try {
    return evaluateCompilerPerfReportUnsafe(report)
  } catch (error) {
    return {
      passed: false,
      failures: Object.freeze([
        `compiler benchmark report is malformed: ${(error as Error).message}`,
      ]),
      measurements: Object.freeze([]),
    }
  }
}

const artifactDirectory = (): string =>
  resolve(process.env.PERF_ARTIFACT_DIR ?? join(tmpdir(), 'stopcock-fp-performance'))

const main = async (): Promise<void> => {
  const engine = currentPerfEngine()
  const policy = COMPILER_PERF_POLICIES[engine.id]
  const directory = artifactDirectory()
  const reportPath = join(directory, `compiler-performance-${engine.id}.json`)
  const gatePath = join(directory, `compiler-performance-${engine.id}-gate.json`)
  await mkdir(directory, { recursive: true })

  let report: CompilerPerfReport | undefined
  let generationError: string | undefined
  let evaluation: CompilerPerfEvaluation = {
    passed: false,
    failures: Object.freeze(['compiler benchmark did not produce a report']),
    measurements: Object.freeze([]),
  }
  try {
    const generated = await runCompilerPerf({
      rounds: policy.minimumRounds,
      warmupRounds: policy.minimumWarmupRounds,
      minimumBatchInputItems: policy.minimumBatchInputItems,
      targetConsumedItemsPerMicroBatch: policy.targetConsumedItemsPerMicroBatch,
      quick: false,
      corpusPath: fileURLToPath(new URL('./perf-corpus.json', import.meta.url)),
      out: reportPath,
    })
    report = generated.report
    evaluation = evaluateCompilerPerfReport(report)
  } catch (error) {
    generationError = (error as Error).message
    evaluation = {
      passed: false,
      failures: Object.freeze([`compiler benchmark generation failed: ${generationError}`]),
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

  console.log(`\nfp-compiler release gate (${engine.name})\n`)
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
