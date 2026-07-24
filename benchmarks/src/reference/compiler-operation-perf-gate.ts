import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPILER_PERF_POLICIES,
  EXPECTED_COMPILER_IMPLEMENTATION_FILES,
  EXPECTED_COMPILER_SUBJECT_ID,
  EXPECTED_COMPILER_SUPPORTED_OP_NAMES,
  EXPECTED_COMPILER_SUPPORTED_OPS_SHA256,
  minimumCompilerBatchIterations,
} from './compiler-perf-contract'
import {
  COMPILER_OPERATION_CASES,
  compilerOperationCorpusProjection,
} from './compiler-operation-corpus'
import {
  EXPECTED_COMPILER_OPERATION_CASE_NAMES,
  EXPECTED_COMPILER_OPERATION_CORPUS,
  EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS,
  EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT,
  EXPECTED_COMPILER_OPERATION_REFERENCE,
  isCompilerOperationOptimizerCanary,
} from './compiler-operation-perf-contract'
import {
  expectedOperationConsumedItems,
  runCompilerOperationPerf,
  type CompilerOperationPerfCase,
  type CompilerOperationPerfReport,
} from './compiler-operation-perf'
import { generateInputArray } from './generate'
import { currentPerfEngine, expectedEngineName, type PerfEngine } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
  SYMMETRIC_PAIRED_COMBINATION,
  SYMMETRIC_PAIRED_ORIENTATION_ISOLATION,
  SYMMETRIC_PAIRED_SAMPLER_ID,
  SYMMETRIC_PAIRED_SAMPLER_ORDER,
} from './perf-runner'

export interface CompilerOperationGateMeasurement {
  readonly label: 'operation geomean' | 'operation worst case'
  readonly count: number
  readonly actual: number
  readonly minimum: number
  readonly passed: boolean
}

export interface CompilerOperationPerfEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
  readonly measurements: readonly CompilerOperationGateMeasurement[]
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
  return {
    low: resampledMedians[lowIndex],
    high: resampledMedians[highIndex],
  }
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
  if (typeof engine.runtimeVersion !== 'string' || engine.runtimeVersion.length === 0) {
    return false
  }
  if (typeof engine.platform !== 'string' || engine.platform.length === 0) return false
  if (typeof engine.architecture !== 'string' || engine.architecture.length === 0) {
    return false
  }
  return engine.id === 'bun-jsc'
    ? typeof engine.nodeCompatibility === 'string' && engine.nodeCompatibility.length > 0
    : typeof engine.v8 === 'string' && engine.v8.length > 0
}

const recordFailure = (failures: string[], condition: boolean, message: string): void => {
  if (!condition) failures.push(message)
}

const evaluateCase = (
  report: CompilerOperationPerfReport,
  item: CompilerOperationPerfCase,
  index: number,
  failures: string[],
): void => {
  const expected = COMPILER_OPERATION_CASES[index]
  const policy = COMPILER_PERF_POLICIES[report.engine.id]
  const label = item.name || `case[${index}]`
  recordFailure(
    failures,
    expected !== undefined &&
      item.name === expected.name &&
      item.targetOp === expected.targetOp &&
      item.opcode === expected.opcode &&
      item.category === expected.category &&
      sameStringArray(item.sourceSteps, expected.sourceSteps),
    `${label}: row does not match its pinned operation case`,
  )
  if (!expected) return
  const optimizerCanary = isCompilerOperationOptimizerCanary(expected.targetOp)
  recordFailure(
    failures,
    item.optimizerCanary === optimizerCanary,
    `${label}: optimizer-canary classification does not match the pinned contract`,
  )
  recordFailure(
    failures,
    item.inputSize === expected.size,
    `${label}: input size does not match the pinned case`,
  )
  const expectedConsumed = expectedOperationConsumedItems(
    expected,
    generateInputArray(expected.inputSeed, expected.size),
  )
  recordFailure(
    failures,
    item.consumedInputItems === expectedConsumed,
    `${label}: consumed input count does not match the pinned case`,
  )
  recordFailure(
    failures,
    item.correctnessOk === true,
    `${label}: compiler/reference semantics are incorrect`,
  )
  recordFailure(
    failures,
    item.transformedSiteCount === 1,
    `${label}: expected one compiler-transformed site`,
  )
  recordFailure(
    failures,
    sameEngine(item.workerEngine, report.engine),
    `${label}: worker runtime identity does not match the coordinator`,
  )
  recordFailure(
    failures,
    item.rounds === report.args.rounds && item.rounds >= policy.minimumRounds,
    `${label}: raw sample count does not match the configured rounds`,
  )
  const expectedBatch = minimumCompilerBatchIterations(item.consumedInputItems, report.args)
  recordFailure(
    failures,
    item.batchIterations === expectedBatch,
    `${label}: used batch size ${item.batchIterations}; expected ${expectedBatch}`,
  )
  const expectedMicroBatch = consumedItemsMicroBatchIterations(
    item.consumedInputItems,
    item.batchIterations,
    report.args.targetConsumedItemsPerMicroBatch,
  )
  recordFailure(
    failures,
    item.sampling?.id === SYMMETRIC_PAIRED_SAMPLER_ID,
    `${label}: unexpected sampler identity`,
  )
  recordFailure(
    failures,
    item.sampling?.order === SYMMETRIC_PAIRED_SAMPLER_ORDER &&
      item.sampling?.combination === SYMMETRIC_PAIRED_COMBINATION &&
      item.sampling?.baseSamplerId === INTERLEAVED_PAIRED_SAMPLER_ID &&
      item.sampling?.orientations === 2,
    `${label}: unexpected sampler order`,
  )
  recordFailure(
    failures,
    item.sampling?.orientationIsolation === SYMMETRIC_PAIRED_ORIENTATION_ISOLATION,
    `${label}: symmetric orientations were not measured in fresh processes`,
  )
  recordFailure(
    failures,
    item.sampling?.batchIterationsPerSide === item.batchIterations &&
      item.sampling?.microBatchIterations === expectedMicroBatch &&
      item.sampling?.microBatchesPerSide === Math.ceil(item.batchIterations / expectedMicroBatch),
    `${label}: symmetric micro-batch shape is invalid`,
  )
  recordFailure(
    failures,
    item.sampling?.targetConsumedItemsPerMicroBatch ===
      report.args.targetConsumedItemsPerMicroBatch &&
      item.sampling?.nominalConsumedItemsPerMicroBatch ===
        expectedMicroBatch * item.consumedInputItems,
    `${label}: consumed-item micro-batch metadata is invalid`,
  )

  const candidateAtA = item.orientationSamples?.candidateAtA
  const candidateAtB = item.orientationSamples?.candidateAtB
  recordFailure(
    failures,
    candidateAtA !== undefined && candidateAtB !== undefined,
    `${label}: both symmetric orientation reports are required`,
  )
  const orientations = [
    {
      value: candidateAtA,
      orientation: 'candidate-at-a',
      aRole: 'candidate',
      bRole: 'reference',
    },
    {
      value: candidateAtB,
      orientation: 'candidate-at-b',
      aRole: 'reference',
      bRole: 'candidate',
    },
  ] as const
  for (const expectedOrientation of orientations) {
    const orientation = expectedOrientation.value
    const orientationLabel = `${label}/${expectedOrientation.orientation}`
    recordFailure(
      failures,
      orientation?.orientation === expectedOrientation.orientation &&
        orientation?.aRole === expectedOrientation.aRole &&
        orientation?.bRole === expectedOrientation.bRole,
      `${orientationLabel}: orientation roles are invalid`,
    )
    recordFailure(
      failures,
      orientation?.caseName === item.name &&
        orientation?.targetOp === item.targetOp &&
        orientation?.inputSize === item.inputSize &&
        orientation?.consumedInputItems === item.consumedInputItems,
      `${orientationLabel}: worker case provenance does not match the row`,
    )
    recordFailure(
      failures,
      orientation?.correctnessOk === true && orientation?.correctnessOk === item.correctnessOk,
      `${orientationLabel}: compiler/reference semantics are incorrect`,
    )
    recordFailure(
      failures,
      orientation?.transformedSiteCount === 1 &&
        orientation?.transformedSiteCount === item.transformedSiteCount,
      `${orientationLabel}: expected one compiler-transformed site`,
    )
    recordFailure(
      failures,
      orientation !== undefined && sameEngine(orientation.workerEngine, report.engine),
      `${orientationLabel}: worker runtime identity does not match the coordinator`,
    )
    recordFailure(
      failures,
      orientation?.rounds === item.rounds &&
        orientation?.rounds === report.args.rounds &&
        orientation?.batchIterations === item.batchIterations &&
        orientation?.batchIterations === expectedBatch,
      `${orientationLabel}: worker rounds or batch size do not match the row`,
    )
    recordFailure(
      failures,
      orientation?.sampling?.id === INTERLEAVED_PAIRED_SAMPLER_ID &&
        orientation?.sampling?.order === INTERLEAVED_PAIRED_SAMPLER_ORDER,
      `${orientationLabel}: unexpected base sampler identity or order`,
    )
    recordFailure(
      failures,
      orientation?.sampling?.batchIterationsPerSide === orientation?.batchIterations &&
        orientation?.sampling?.microBatchIterations === expectedMicroBatch &&
        orientation?.sampling?.microBatchesPerSide ===
          Math.ceil(item.batchIterations / expectedMicroBatch),
      `${orientationLabel}: interleaved micro-batch shape is invalid`,
    )
  }

  const candidateAtACandidateSamples =
    candidateAtA !== undefined && Array.isArray(candidateAtA.candidateSamplesNs)
      ? candidateAtA.candidateSamplesNs
      : []
  const candidateAtAReferenceSamples =
    candidateAtA !== undefined && Array.isArray(candidateAtA.referenceSamplesNs)
      ? candidateAtA.referenceSamplesNs
      : []
  const candidateAtBCandidateSamples =
    candidateAtB !== undefined && Array.isArray(candidateAtB.candidateSamplesNs)
      ? candidateAtB.candidateSamplesNs
      : []
  const candidateAtBReferenceSamples =
    candidateAtB !== undefined && Array.isArray(candidateAtB.referenceSamplesNs)
      ? candidateAtB.referenceSamplesNs
      : []
  const compilerSamples = Array.isArray(item.compilerSamplesNs) ? item.compilerSamplesNs : []
  const referenceSamples = Array.isArray(item.referenceSamplesNs) ? item.referenceSamplesNs : []
  const reportedRatios = Array.isArray(item.pairedRatios) ? item.pairedRatios : []
  recordFailure(
    failures,
    candidateAtACandidateSamples.length === item.rounds &&
      candidateAtAReferenceSamples.length === item.rounds &&
      candidateAtBCandidateSamples.length === item.rounds &&
      candidateAtBReferenceSamples.length === item.rounds &&
      compilerSamples.length === item.rounds &&
      referenceSamples.length === item.rounds &&
      reportedRatios.length === item.rounds,
    `${label}: symmetric raw or derived sample count is incomplete`,
  )
  const rawSamples = [
    ...candidateAtACandidateSamples,
    ...candidateAtAReferenceSamples,
    ...candidateAtBCandidateSamples,
    ...candidateAtBReferenceSamples,
  ]
  const rawPositive = rawSamples.every((value) => Number.isFinite(value) && value > 0)
  recordFailure(
    failures,
    rawSamples.length === item.rounds * 4 && rawPositive,
    `${label}: all four orientation raw samples must be finite and positive`,
  )
  if (
    !rawPositive ||
    candidateAtACandidateSamples.length !== item.rounds ||
    candidateAtAReferenceSamples.length !== item.rounds ||
    candidateAtBCandidateSamples.length !== item.rounds ||
    candidateAtBReferenceSamples.length !== item.rounds
  ) {
    return
  }
  const recomputedCompilerSamples = candidateAtACandidateSamples.map(
    (candidateNs, sampleIndex) =>
      Math.sqrt(candidateNs) * Math.sqrt(candidateAtBCandidateSamples[sampleIndex]),
  )
  const recomputedReferenceSamples = candidateAtAReferenceSamples.map(
    (referenceNs, sampleIndex) =>
      Math.sqrt(referenceNs) * Math.sqrt(candidateAtBReferenceSamples[sampleIndex]),
  )
  const ratios = recomputedCompilerSamples.map(
    (compilerNs, sampleIndex) => recomputedReferenceSamples[sampleIndex] / compilerNs,
  )
  recordFailure(
    failures,
    compilerSamples.length === recomputedCompilerSamples.length &&
      compilerSamples.every((sample, sampleIndex) =>
        approximatelyEqual(sample, recomputedCompilerSamples[sampleIndex]),
      ) &&
      referenceSamples.length === recomputedReferenceSamples.length &&
      referenceSamples.every((sample, sampleIndex) =>
        approximatelyEqual(sample, recomputedReferenceSamples[sampleIndex]),
      ),
    `${label}: derived samples do not match symmetric orientation raw samples`,
  )
  recordFailure(
    failures,
    ratios.length === reportedRatios.length &&
      ratios.every((ratio, sampleIndex) => approximatelyEqual(ratio, reportedRatios[sampleIndex])),
    `${label}: paired ratios do not match symmetric orientation raw samples`,
  )
  const recomputedMedian = median(ratios)
  const recomputedMean = mean(ratios)
  const recomputedCI = bootstrapMedianCI(ratios)
  const recomputedSignP = signTestP(ratios)
  const recomputedRme = ((recomputedCI.high - recomputedCI.low) / (2 * recomputedMedian)) * 100
  recordFailure(
    failures,
    approximatelyEqual(item.medianRatio, recomputedMedian),
    `${label}: invalid median ratio`,
  )
  recordFailure(
    failures,
    approximatelyEqual(item.meanRatio, recomputedMean),
    `${label}: invalid mean ratio`,
  )
  recordFailure(
    failures,
    approximatelyEqual(item.ciLow, recomputedCI.low) &&
      approximatelyEqual(item.ciHigh, recomputedCI.high),
    `${label}: confidence interval does not match raw samples`,
  )
  recordFailure(
    failures,
    approximatelyEqual(item.signTestP, recomputedSignP),
    `${label}: sign-test p-value does not match raw samples`,
  )
  recordFailure(
    failures,
    approximatelyEqual(item.relativeMarginOfError, recomputedRme),
    `${label}: relative margin of error does not match raw samples`,
  )
  if (!optimizerCanary) {
    recordFailure(
      failures,
      item.medianRatio >= policy.minimumCaseRatio,
      `${label}: median ratio ${item.medianRatio.toFixed(3)} is below ${policy.minimumCaseRatio.toFixed(3)}`,
    )
    recordFailure(
      failures,
      item.relativeMarginOfError <= policy.maximumRme ||
        recomputedCI.low >= policy.minimumCaseRatio,
      `${label}: relative margin of error ${item.relativeMarginOfError.toFixed(2)}% exceeds ${policy.maximumRme}% and confidence-interval lower bound ${recomputedCI.low.toFixed(3)} is below ${policy.minimumCaseRatio.toFixed(3)}`,
    )
  }
}

const evaluateCompilerOperationPerfReportUnsafe = (
  report: CompilerOperationPerfReport,
): CompilerOperationPerfEvaluation => {
  const failures: string[] = []
  const measurements: CompilerOperationGateMeasurement[] = []
  const cases = Array.isArray(report.cases) ? report.cases : []
  const skipped = Array.isArray(report.skipped) ? report.skipped : []
  const supportedEngine = report.engine?.id === 'bun-jsc' || report.engine?.id === 'node-v8'
  const policy = supportedEngine
    ? COMPILER_PERF_POLICIES[report.engine.id]
    : COMPILER_PERF_POLICIES['bun-jsc']
  const projection = compilerOperationCorpusProjection()

  recordFailure(failures, report.version === 3, 'unexpected operation report version')
  recordFailure(
    failures,
    typeof report.generatedAt === 'string' && Number.isFinite(Date.parse(report.generatedAt)),
    'operation report has no valid generatedAt timestamp',
  )
  recordFailure(
    failures,
    supportedEngine && validEngineIdentity(report.engine),
    'unexpected operation benchmark engine identity',
  )
  const optimizerCanaryOps = Array.isArray(report.optimizerCanaryOps)
    ? report.optimizerCanaryOps
    : []
  recordFailure(
    failures,
    sameStringArray(optimizerCanaryOps, EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS),
    'operation optimizer-canary set does not match the pinned contract',
  )
  recordFailure(
    failures,
    report.corpus?.id === EXPECTED_COMPILER_OPERATION_CORPUS.id &&
      report.corpus?.version === EXPECTED_COMPILER_OPERATION_CORPUS.version,
    'unexpected compiler operation corpus identity',
  )
  recordFailure(
    failures,
    report.corpus?.totalCaseCount === EXPECTED_COMPILER_OPERATION_CORPUS.totalCaseCount,
    'compiler operation corpus case count drifted',
  )
  recordFailure(
    failures,
    report.corpus?.sha256 === jsonSha256(projection) &&
      report.corpus?.sha256 === EXPECTED_COMPILER_OPERATION_CORPUS.sha256,
    'compiler operation corpus SHA-256 does not match the pinned projection',
  )
  recordFailure(
    failures,
    report.corpus?.caseNamesSha256 === jsonSha256(projection.map((item) => item.name)) &&
      report.corpus?.caseNamesSha256 === EXPECTED_COMPILER_OPERATION_CORPUS.caseNamesSha256,
    'compiler operation case-name SHA-256 drifted',
  )
  recordFailure(
    failures,
    report.corpus?.targetOpsSha256 === jsonSha256(projection.map((item) => item.targetOp)) &&
      report.corpus?.targetOpsSha256 === EXPECTED_COMPILER_OPERATION_CORPUS.targetOpsSha256,
    'compiler operation target-op SHA-256 drifted',
  )
  recordFailure(
    failures,
    report.corpus?.opcodesSha256 ===
      jsonSha256(projection.map((item) => [item.targetOp, item.opcode])) &&
      report.corpus?.opcodesSha256 === EXPECTED_COMPILER_OPERATION_CORPUS.opcodesSha256,
    'compiler operation numeric-opcode SHA-256 drifted',
  )
  recordFailure(
    failures,
    JSON.stringify(report.corpus?.categoryCounts) ===
      JSON.stringify(EXPECTED_COMPILER_OPERATION_CORPUS.categoryCounts),
    'compiler operation category counts drifted',
  )
  recordFailure(
    failures,
    report.reference?.id === EXPECTED_COMPILER_OPERATION_REFERENCE.id &&
      report.reference?.sha256 === EXPECTED_COMPILER_OPERATION_REFERENCE.sha256,
    'compiler operation frozen-reference identity or SHA-256 drifted',
  )
  recordFailure(
    failures,
    report.compiler?.id === EXPECTED_COMPILER_SUBJECT_ID,
    'unexpected compiler subject identity',
  )
  recordFailure(
    failures,
    Array.isArray(report.compiler?.implementationFiles) &&
      sameStringArray(
        report.compiler.implementationFiles,
        EXPECTED_COMPILER_IMPLEMENTATION_FILES,
      ) &&
      /^[0-9a-f]{64}$/u.test(report.compiler?.implementationSha256 ?? ''),
    'compiler implementation provenance is invalid',
  )
  const supportedOps = Array.isArray(report.compiler?.supportedOps)
    ? report.compiler.supportedOps
    : []
  recordFailure(
    failures,
    sameStringArray(supportedOps, EXPECTED_COMPILER_SUPPORTED_OP_NAMES) &&
      report.compiler?.supportedOpsSha256 === jsonSha256(supportedOps) &&
      report.compiler?.supportedOpsSha256 === EXPECTED_COMPILER_SUPPORTED_OPS_SHA256,
    'compiler operation capability set does not match the pinned contract',
  )

  recordFailure(
    failures,
    report.args?.quick === false,
    'operation release gate must not use --quick',
  )
  recordFailure(
    failures,
    report.args?.casesFilter === undefined,
    'operation release gate cannot filter the capability population',
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args?.rounds) && report.args.rounds >= policy.minimumRounds,
    `operation report rounds are below ${policy.minimumRounds}`,
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args?.warmupRounds) &&
      report.args.warmupRounds >= policy.minimumWarmupRounds,
    `operation report warmup rounds are below ${policy.minimumWarmupRounds}`,
  )
  recordFailure(
    failures,
    report.args?.minimumBatchInputItems >= policy.minimumBatchInputItems,
    'operation report batch target is too small',
  )
  recordFailure(
    failures,
    report.args?.targetConsumedItemsPerMicroBatch >= policy.targetConsumedItemsPerMicroBatch,
    'operation report micro-batch target is too small',
  )

  const caseNames = cases.map((item) => item.name)
  const targetOps = cases.map((item) => item.targetOp)
  recordFailure(
    failures,
    sameStringArray(caseNames, EXPECTED_COMPILER_OPERATION_CASE_NAMES),
    'measured operation case population does not match the pinned order',
  )
  recordFailure(
    failures,
    sameStringArray(targetOps, EXPECTED_COMPILER_SUPPORTED_OP_NAMES),
    'measured operation rows do not cover every supported opcode exactly once',
  )
  recordFailure(
    failures,
    cases.length === EXPECTED_COMPILER_OPERATION_CORPUS.totalCaseCount,
    `operation report is incomplete; expected ${EXPECTED_COMPILER_OPERATION_CORPUS.totalCaseCount} rows`,
  )
  for (let index = 0; index < cases.length; index++) {
    evaluateCase(report, cases[index], index, failures)
  }
  recordFailure(failures, skipped.length === 0, `operation report skipped ${skipped.length} cases`)

  const performanceCases = cases.filter(
    (item) => !isCompilerOperationOptimizerCanary(item.targetOp),
  )
  const optimizerCanaryCases = cases.filter((item) =>
    isCompilerOperationOptimizerCanary(item.targetOp),
  )
  recordFailure(
    failures,
    performanceCases.length === EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT &&
      optimizerCanaryCases.length === EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS.length,
    `operation performance population is invalid; expected ${EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT} measurements and ${EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS.length} optimizer canaries`,
  )
  const ratios = performanceCases.map((item) => item.medianRatio)
  const globalGeomean = geomean(ratios)
  const minimumRatio = Math.min(...ratios, Infinity)
  const maximumRme = Math.max(
    ...performanceCases.map((item) => item.relativeMarginOfError),
    Number.NEGATIVE_INFINITY,
  )
  recordFailure(
    failures,
    report.summary?.count === cases.length &&
      report.summary?.expectedCount === EXPECTED_COMPILER_OPERATION_CORPUS.totalCaseCount &&
      report.summary?.performanceCount === performanceCases.length &&
      report.summary?.performanceCount === EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT &&
      report.summary?.optimizerCanaryCount === optimizerCanaryCases.length &&
      report.summary?.optimizerCanaryCount ===
        EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS.length,
    'operation summary count does not match measured rows',
  )
  recordFailure(failures, report.summary?.complete === true, 'operation summary is incomplete')
  recordFailure(
    failures,
    report.summary?.allCorrect === true && cases.every((item) => item.correctnessOk),
    'operation summary contains incorrect semantics',
  )
  recordFailure(
    failures,
    approximatelyEqual(report.summary?.geomeanRatio, globalGeomean) &&
      approximatelyEqual(report.summary?.minRatio, minimumRatio) &&
      approximatelyEqual(report.summary?.maxRelativeMarginOfError, maximumRme),
    'operation summary statistics do not match measured rows',
  )

  measurements.push({
    label: 'operation geomean',
    count: performanceCases.length,
    actual: globalGeomean,
    minimum: policy.minimumGeomean,
    passed: globalGeomean >= policy.minimumGeomean,
  })
  measurements.push({
    label: 'operation worst case',
    count: performanceCases.length,
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

export const evaluateCompilerOperationPerfReport = (
  report: CompilerOperationPerfReport,
): CompilerOperationPerfEvaluation => {
  try {
    return evaluateCompilerOperationPerfReportUnsafe(report)
  } catch (error) {
    return {
      passed: false,
      failures: Object.freeze([
        `compiler operation benchmark report is malformed: ${(error as Error).message}`,
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
  const reportPath = join(directory, `compiler-operation-performance-${engine.id}.json`)
  const gatePath = join(directory, `compiler-operation-performance-${engine.id}-gate.json`)
  await mkdir(directory, { recursive: true })

  let report: CompilerOperationPerfReport | undefined
  let generationError: string | undefined
  let evaluation: CompilerOperationPerfEvaluation = {
    passed: false,
    failures: Object.freeze(['compiler operation benchmark did not produce a report']),
    measurements: Object.freeze([]),
  }
  try {
    const generated = await runCompilerOperationPerf({
      rounds: policy.minimumRounds,
      warmupRounds: policy.minimumWarmupRounds,
      minimumBatchInputItems: policy.minimumBatchInputItems,
      targetConsumedItemsPerMicroBatch: policy.targetConsumedItemsPerMicroBatch,
      quick: false,
      out: reportPath,
    })
    report = generated.report
    evaluation = evaluateCompilerOperationPerfReport(report)
  } catch (error) {
    generationError = (error as Error).message
    evaluation = {
      passed: false,
      failures: Object.freeze([
        `compiler operation benchmark generation failed: ${generationError}`,
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
        validatedOperationCount: EXPECTED_COMPILER_OPERATION_CORPUS.totalCaseCount,
        performanceMeasurementCount: EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT,
        optimizerCanaryOps: EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS,
        reportSummary: report?.summary,
        evaluation,
        passed,
      },
      null,
      2,
    )}\n`,
  )
  console.log(`\nfp-compiler operation-complete release gate (${engine.name})\n`)
  console.log(
    `validated operations: ${EXPECTED_COMPILER_OPERATION_CORPUS.totalCaseCount}; performance measurements: ${EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT}; optimizer canaries: ${EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS.join(', ')}`,
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
