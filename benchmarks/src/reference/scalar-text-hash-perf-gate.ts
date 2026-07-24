import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Eq from '../../../packages/fp/src/eq'
import * as Hash from '../../../packages/fp/src/hash'
import * as NumberOps from '../../../packages/fp/src/number'
import * as StringOps from '../../../packages/fp/src/string'
import {
  camelCaseBefore,
  codePointLengthBefore,
  deepEqBefore,
  gcdBefore,
  hashUnknownBefore,
  numberBefore,
  roundToCurriedBefore,
  structHashBefore,
  titleCaseBefore,
} from './scalar-text-hash-before'
import {
  EXPECTED_SCALAR_TEXT_HASH_BASELINE,
  EXPECTED_SCALAR_TEXT_HASH_CASES,
  EXPECTED_SCALAR_TEXT_HASH_COVERAGE,
  EXPECTED_SCALAR_TEXT_HASH_SUBJECT_FILES,
  EXPECTED_SCALAR_TEXT_HASH_SUBJECT_ID,
  EXPECTED_SCALAR_TEXT_HASH_SUBJECT_SHA256,
  minimumScalarTextHashBatchIterations,
  SCALAR_TEXT_HASH_PERF_POLICIES,
} from './scalar-text-hash-perf-contract'
import {
  currentPerfEngine,
  expectedEngineName,
  type PerfEngine,
} from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  geomean,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
  runInterleavedPaired,
  type InterleavedPairedSampling,
} from './perf-runner'

const localDirectory = dirname(fileURLToPath(import.meta.url))

interface ExecutableCase {
  readonly name: string
  readonly workUnits: number
  readonly current: () => unknown
  readonly baseline: () => unknown
}

export interface ScalarTextHashPerfCase {
  readonly name: string
  readonly workUnits: number
  readonly correctnessOk: boolean
  readonly rounds: number
  readonly batchIterations: number
  readonly sampling: InterleavedPairedSampling & {
    readonly targetWorkUnitsPerMicroBatch: number
    readonly nominalWorkUnitsPerMicroBatch: number
  }
  readonly medianRatio: number
  readonly meanRatio: number
  readonly ciLow: number
  readonly ciHigh: number
  readonly signTestP: number
  readonly relativeMarginOfError: number
  readonly currentSamplesNs: readonly number[]
  readonly baselineSamplesNs: readonly number[]
  readonly pairedRatios: readonly number[]
}

export interface ScalarTextHashPerfArgs {
  readonly rounds: number
  readonly warmupRounds: number
  readonly minimumBatchWorkUnits: number
  readonly targetWorkUnitsPerMicroBatch: number
  readonly quick: boolean
  readonly casesFilter?: string
  readonly out?: string
}

export interface ScalarTextHashPerfReport {
  readonly version: 1
  readonly generatedAt: string
  readonly engine: PerfEngine
  readonly subject: {
    readonly id: string
    readonly files: readonly string[]
    readonly sha256: string
  }
  readonly baseline: {
    readonly id: string
    readonly sha256: string
  }
  readonly coverage: {
    readonly caseCount: number
    readonly caseNamesSha256: string
    readonly projectionSha256: string
  }
  readonly args: ScalarTextHashPerfArgs
  readonly summary: {
    readonly count: number
    readonly expectedCount: number
    readonly geomeanRatio: number
    readonly minRatio: number
    readonly maxRelativeMarginOfError: number
    readonly allCorrect: boolean
    readonly complete: boolean
  }
  readonly cases: readonly ScalarTextHashPerfCase[]
}

export interface ScalarTextHashPerfEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
  readonly geomeanRatio: number
  readonly minimumRatio: number
}

const sha256 = (contents: string | Uint8Array): string =>
  createHash('sha256').update(contents).digest('hex')

const jsonSha256 = (value: unknown): string => sha256(JSON.stringify(value))

const fixedLength = (seed: string, length: number): string =>
  seed.repeat(Math.ceil(length / seed.length)).slice(0, length)

const buildCases = (): readonly ExecutableCase[] => {
  const camelInput = fixedLength(
    'HTTPServer_value-already Mixed42Words ',
    256,
  )
  const titleInput = fixedLength('ÉCOLE déjà VU 東京 Café42Value ', 256)
  const codePointInput = fixedLength('😀a𝌆e\u0301-東京-', 4_096)
  const currentRound = NumberOps.roundTo(4, 'round')
  const baselineRound = roundToCurriedBefore(4, 'round')

  const equalLeft: Record<string, unknown> = {}
  const equalRight: Record<string, unknown> = {}
  for (let index = 0; index < 32; index += 1) {
    equalLeft[`key${index}`] = { value: index, items: [index, index + 1] }
    equalRight[`key${index}`] = { value: index, items: [index, index + 1] }
  }

  const currentFields: Record<string, Hash.Hash<number>> = {}
  const baselineFields: Record<string, Hash.Hash<number>> = {}
  const structValue: Record<string, number> = {}
  for (let index = 0; index < 16; index += 1) {
    currentFields[`field${index}`] = Hash.number
    baselineFields[`field${index}`] = numberBefore
    structValue[`field${index}`] = index
  }
  const currentStruct =
    Hash.struct<Record<string, number>>(currentFields)
  const baselineStruct =
    structHashBefore<Record<string, number>>(baselineFields)

  const hashArray = Array.from({ length: 128 }, (_, index) =>
    index % 7 === 0 ? `value${index}` : index,
  )
  const hashRecord: Record<string, unknown> = {}
  for (let index = 0; index < 64; index += 1) {
    hashRecord[`key${index}`] =
      index % 4 === 0 ? [index, `value${index}`] : index
  }

  return [
    {
      name: 'string/camel-case-mixed-256',
      workUnits: 256,
      current: () => StringOps.camelCase(camelInput),
      baseline: () => camelCaseBefore(camelInput),
    },
    {
      name: 'string/title-case-unicode-256',
      workUnits: 256,
      current: () => StringOps.titleCase(titleInput),
      baseline: () => titleCaseBefore(titleInput),
    },
    {
      name: 'string/code-point-length-4096',
      workUnits: 4_096,
      current: () => StringOps.codePointLength(codePointInput),
      baseline: () => codePointLengthBefore(codePointInput),
    },
    {
      name: 'number/gcd-large',
      workUnits: 1,
      current: () => NumberOps.gcd(1_836_311_903, 1_134_903_170),
      baseline: () => gcdBefore(1_836_311_903, 1_134_903_170),
    },
    {
      name: 'number/round-to-curried',
      workUnits: 1,
      current: () => currentRound(12_345.678_987),
      baseline: () => baselineRound(12_345.678_987),
    },
    {
      name: 'eq/deep-equal-primitive',
      workUnits: 1,
      current: () => Eq.deep.equals(123, 123),
      baseline: () => deepEqBefore.equals(123, 123),
    },
    {
      name: 'eq/deep-equal-record-32',
      workUnits: 32,
      current: () => Eq.deep.equals(equalLeft, equalRight),
      baseline: () => deepEqBefore.equals(equalLeft, equalRight),
    },
    {
      name: 'hash/number-prefix',
      workUnits: 1,
      current: () => Hash.number.hash(12_345.678_987),
      baseline: () => numberBefore.hash(12_345.678_987),
    },
    {
      name: 'hash/struct-16',
      workUnits: 16,
      current: () => currentStruct.hash(structValue),
      baseline: () => baselineStruct.hash(structValue),
    },
    {
      name: 'hash/unknown-array-128',
      workUnits: 128,
      current: () => Hash.hashUnknown(hashArray),
      baseline: () => hashUnknownBefore(hashArray),
    },
    {
      name: 'hash/unknown-record-64',
      workUnits: 64,
      current: () => Hash.hashUnknown(hashRecord),
      baseline: () => hashUnknownBefore(hashRecord),
    },
  ]
}

const sameOutput = (left: unknown, right: unknown): boolean =>
  typeof left === 'number' && typeof right === 'number'
    ? Object.is(left, right) ||
      (Number.isNaN(left) && Number.isNaN(right))
    : Object.is(left, right)

let currentSink: unknown
let baselineSink: unknown

const relativeMarginOfError = (
  low: number,
  high: number,
  medianRatio: number,
): number => ((high - low) / (2 * medianRatio)) * 100

const measureCase = (
  executable: ExecutableCase,
  args: ScalarTextHashPerfArgs,
): ScalarTextHashPerfCase => {
  const correctnessOk = sameOutput(
    executable.current(),
    executable.baseline(),
  )
  const batchIterations = minimumScalarTextHashBatchIterations(
    executable.workUnits,
    args.minimumBatchWorkUnits,
  )
  const microBatchIterations = consumedItemsMicroBatchIterations(
    executable.workUnits,
    batchIterations,
    args.targetWorkUnitsPerMicroBatch,
  )
  const measured = runInterleavedPaired(
    executable.current,
    executable.baseline,
    {
      rounds: args.rounds,
      warmupRounds: args.warmupRounds,
      batchIterations,
      microBatchIterations,
      observe: (currentLast, baselineLast) => {
        currentSink = currentLast
        baselineSink = baselineLast
      },
    },
  )
  return {
    name: executable.name,
    workUnits: executable.workUnits,
    correctnessOk,
    rounds: measured.pairedRatios.length,
    batchIterations,
    sampling: {
      ...measured.sampling,
      targetWorkUnitsPerMicroBatch: args.targetWorkUnitsPerMicroBatch,
      nominalWorkUnitsPerMicroBatch:
        microBatchIterations * executable.workUnits,
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
    currentSamplesNs: measured.aSamples,
    baselineSamplesNs: measured.bSamples,
    pairedRatios: measured.pairedRatios,
  }
}

export const parseScalarTextHashPerfArgs = (
  argv: readonly string[],
  engine = currentPerfEngine(),
): ScalarTextHashPerfArgs => {
  const policy = SCALAR_TEXT_HASH_PERF_POLICIES[engine.id]
  let rounds: number = policy.minimumRounds
  let warmupRounds: number = policy.minimumWarmupRounds
  let minimumBatchWorkUnits: number = policy.minimumBatchWorkUnits
  let targetWorkUnitsPerMicroBatch: number =
    policy.targetWorkUnitsPerMicroBatch
  let quick = false
  let casesFilter: string | undefined
  let out: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--rounds') rounds = Number(argv[++index])
    else if (argument === '--warmup') warmupRounds = Number(argv[++index])
    else if (argument === '--batch-work') {
      minimumBatchWorkUnits = Number(argv[++index])
    } else if (argument === '--micro-batch-work') {
      targetWorkUnitsPerMicroBatch = Number(argv[++index])
    } else if (argument === '--cases') casesFilter = argv[++index]
    else if (argument === '--out') out = argv[++index]
    else if (argument === '--quick') quick = true
    else throw new Error(`unknown scalar/text/hash perf argument: ${argument}`)
  }
  if (quick) rounds = Math.min(rounds, 8)
  for (const [flag, value] of [
    ['--rounds', rounds],
    ['--warmup', warmupRounds],
    ['--batch-work', minimumBatchWorkUnits],
    ['--micro-batch-work', targetWorkUnitsPerMicroBatch],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${flag} must be a positive integer`)
    }
  }
  return {
    rounds,
    warmupRounds,
    minimumBatchWorkUnits,
    targetWorkUnitsPerMicroBatch,
    quick,
    casesFilter,
    out,
  }
}

const sourceSha256 = async (): Promise<string> => {
  const root = resolve(localDirectory, '..', '..', '..')
  const hash = createHash('sha256')
  for (const relativePath of EXPECTED_SCALAR_TEXT_HASH_SUBJECT_FILES) {
    hash.update(relativePath)
    hash.update('\0')
    hash.update(await readFile(join(root, relativePath)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

const defaultOutputPath = (engine: PerfEngine): string =>
  join(
    resolve(
      process.env.PERF_ARTIFACT_DIR ??
        join(localDirectory, '..', '..', 'reports'),
    ),
    `scalar-text-hash-${engine.id}.json`,
  )

export const runScalarTextHashPerf = async (
  args: ScalarTextHashPerfArgs,
): Promise<ScalarTextHashPerfReport> => {
  const engine = currentPerfEngine()
  const allCases = buildCases()
  const selected =
    args.casesFilter === undefined
      ? allCases
      : allCases.filter((item) => item.name.includes(args.casesFilter as string))
  const cases = selected.map((item) => measureCase(item, args))
  const projection = allCases.map(({ name, workUnits }) => ({
    name,
    workUnits,
  }))
  const ratios = cases.map((item) => item.medianRatio)
  const summary = {
    count: cases.length,
    expectedCount: allCases.length,
    geomeanRatio: geomean(ratios),
    minRatio: Math.min(...ratios, Infinity),
    maxRelativeMarginOfError: Math.max(
      ...cases.map((item) => item.relativeMarginOfError),
      Number.NEGATIVE_INFINITY,
    ),
    allCorrect: cases.every((item) => item.correctnessOk),
    complete:
      selected.length === allCases.length && cases.length === allCases.length,
  }
  const report: ScalarTextHashPerfReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    engine,
    subject: {
      id: EXPECTED_SCALAR_TEXT_HASH_SUBJECT_ID,
      files: EXPECTED_SCALAR_TEXT_HASH_SUBJECT_FILES,
      sha256: await sourceSha256(),
    },
    baseline: {
      id: EXPECTED_SCALAR_TEXT_HASH_BASELINE.id,
      sha256: sha256(
        await readFile(
          new URL('./scalar-text-hash-before.ts', import.meta.url),
        ),
      ),
    },
    coverage: {
      caseCount: allCases.length,
      caseNamesSha256: jsonSha256(allCases.map((item) => item.name)),
      projectionSha256: jsonSha256(projection),
    },
    args,
    summary,
    cases,
  }
  const outputPath = args.out ?? defaultOutputPath(engine)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  void currentSink
  void baselineSink
  return report
}

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
    low: medians[Math.floor(0.025 * samples)],
    high: medians[Math.min(samples - 1, Math.ceil(0.975 * samples) - 1)],
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

const validEngine = (engine: PerfEngine): boolean =>
  (engine.id === 'bun-jsc' || engine.id === 'node-v8') &&
  engine.name === expectedEngineName(engine.id) &&
  engine.runtime === (engine.id === 'bun-jsc' ? 'bun' : 'node') &&
  typeof engine.runtimeVersion === 'string' &&
  engine.runtimeVersion.length > 0 &&
  typeof engine.platform === 'string' &&
  engine.platform.length > 0 &&
  typeof engine.architecture === 'string' &&
  engine.architecture.length > 0 &&
  (engine.id === 'bun-jsc'
    ? typeof engine.nodeCompatibility === 'string' &&
      engine.nodeCompatibility.length > 0
    : typeof engine.v8 === 'string' && engine.v8.length > 0)

const evaluateUnsafe = (
  report: ScalarTextHashPerfReport,
): ScalarTextHashPerfEvaluation => {
  const failures: string[] = []
  const cases: readonly ScalarTextHashPerfCase[] = Array.isArray(report.cases)
    ? report.cases
    : []
  const supported =
    report.engine?.id === 'bun-jsc' || report.engine?.id === 'node-v8'
  const policy = supported
    ? SCALAR_TEXT_HASH_PERF_POLICIES[report.engine.id]
    : SCALAR_TEXT_HASH_PERF_POLICIES['bun-jsc']
  const expectedNames = EXPECTED_SCALAR_TEXT_HASH_CASES.map(
    (item) => item.name,
  )
  const names = cases.map((item) => item.name)
  const projection = cases.map((item) => ({
    name: item.name,
    workUnits: item.workUnits,
  }))

  recordFailure(failures, report.version === 1, 'unexpected report version')
  recordFailure(
    failures,
    supported && validEngine(report.engine),
    'unexpected runtime identity',
  )
  recordFailure(
    failures,
    report.subject?.id === EXPECTED_SCALAR_TEXT_HASH_SUBJECT_ID &&
      JSON.stringify(report.subject.files) ===
        JSON.stringify(EXPECTED_SCALAR_TEXT_HASH_SUBJECT_FILES) &&
      report.subject.sha256 === EXPECTED_SCALAR_TEXT_HASH_SUBJECT_SHA256,
    'subject provenance is invalid',
  )
  recordFailure(
    failures,
    report.baseline?.id === EXPECTED_SCALAR_TEXT_HASH_BASELINE.id &&
      report.baseline.sha256 === EXPECTED_SCALAR_TEXT_HASH_BASELINE.sha256,
    'frozen baseline provenance is invalid',
  )
  recordFailure(
    failures,
    names.length === expectedNames.length &&
      names.every((name, index) => name === expectedNames[index]),
    'case order or population is invalid',
  )
  recordFailure(
    failures,
    report.coverage?.caseCount ===
      EXPECTED_SCALAR_TEXT_HASH_COVERAGE.caseCount &&
      report.coverage.caseNamesSha256 === jsonSha256(names) &&
      report.coverage.caseNamesSha256 ===
        EXPECTED_SCALAR_TEXT_HASH_COVERAGE.caseNamesSha256 &&
      report.coverage.projectionSha256 === jsonSha256(projection) &&
      report.coverage.projectionSha256 ===
        EXPECTED_SCALAR_TEXT_HASH_COVERAGE.projectionSha256,
    'coverage hashes are invalid',
  )
  recordFailure(
    failures,
    report.args?.quick === false && report.args.casesFilter === undefined,
    'release gate cannot use quick mode or filters',
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args?.rounds) &&
      report.args.rounds >= policy.minimumRounds &&
      Number.isSafeInteger(report.args?.warmupRounds) &&
      report.args.warmupRounds >= policy.minimumWarmupRounds &&
      Number.isSafeInteger(report.args?.minimumBatchWorkUnits) &&
      report.args.minimumBatchWorkUnits >= policy.minimumBatchWorkUnits &&
      report.args.targetWorkUnitsPerMicroBatch ===
        policy.targetWorkUnitsPerMicroBatch,
    'release sampling arguments are below policy',
  )
  recordFailure(
    failures,
    report.summary?.count === cases.length &&
      report.summary.expectedCount === expectedNames.length &&
      report.summary.complete === true &&
      report.summary.allCorrect === true &&
      cases.length === expectedNames.length,
    'summary is incomplete or incorrect',
  )

  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index]
    const expected = EXPECTED_SCALAR_TEXT_HASH_CASES[index]
    recordFailure(
      failures,
      item.workUnits === expected?.workUnits && item.correctnessOk === true,
      `${item.name}: work units or correctness are invalid`,
    )
    const minimumBatch = minimumScalarTextHashBatchIterations(
      item.workUnits,
      policy.minimumBatchWorkUnits,
    )
    const expectedMicroBatch = consumedItemsMicroBatchIterations(
      item.workUnits,
      item.batchIterations,
      policy.targetWorkUnitsPerMicroBatch,
    )
    recordFailure(
      failures,
      item.rounds === report.args.rounds &&
        item.rounds >= policy.minimumRounds &&
        item.batchIterations >= minimumBatch &&
        item.sampling?.id === INTERLEAVED_PAIRED_SAMPLER_ID &&
        item.sampling.order === INTERLEAVED_PAIRED_SAMPLER_ORDER &&
        item.sampling.batchIterationsPerSide === item.batchIterations &&
        item.sampling.microBatchIterations === expectedMicroBatch &&
        item.sampling.microBatchesPerSide ===
          Math.ceil(item.batchIterations / expectedMicroBatch) &&
        item.sampling.targetWorkUnitsPerMicroBatch ===
          policy.targetWorkUnitsPerMicroBatch &&
        item.sampling.nominalWorkUnitsPerMicroBatch ===
          expectedMicroBatch * item.workUnits,
      `${item.name}: sampler metadata is invalid`,
    )
    const currentSamples = Array.isArray(item.currentSamplesNs)
      ? item.currentSamplesNs
      : []
    const baselineSamples = Array.isArray(item.baselineSamplesNs)
      ? item.baselineSamplesNs
      : []
    const ratios = Array.isArray(item.pairedRatios)
      ? item.pairedRatios
      : []
    recordFailure(
      failures,
      currentSamples.length === item.rounds &&
        baselineSamples.length === item.rounds &&
        ratios.length === item.rounds &&
        currentSamples.every((sample) => Number.isFinite(sample) && sample > 0) &&
        baselineSamples.every((sample) => Number.isFinite(sample) && sample > 0) &&
        ratios.every(
          (ratio, sample) =>
            Number.isFinite(ratio) &&
            ratio > 0 &&
            approximatelyEqual(
              ratio,
              baselineSamples[sample] / currentSamples[sample],
            ),
        ),
      `${item.name}: raw samples or paired ratios are invalid`,
    )
    const ci = bootstrapMedianCI(ratios)
    const computedRme =
      ((item.ciHigh - item.ciLow) / (2 * item.medianRatio)) * 100
    recordFailure(
      failures,
      approximatelyEqual(item.medianRatio, median(ratios)) &&
        approximatelyEqual(item.meanRatio, mean(ratios)) &&
        approximatelyEqual(item.ciLow, ci.low) &&
        approximatelyEqual(item.ciHigh, ci.high) &&
        approximatelyEqual(item.signTestP, signTestP(ratios)) &&
        approximatelyEqual(item.relativeMarginOfError, computedRme),
      `${item.name}: derived statistics do not match raw samples`,
    )
    recordFailure(
      failures,
      item.relativeMarginOfError <= policy.maximumRme,
      `${item.name}: relative margin of error exceeds policy`,
    )
  }

  const ratios = cases.map((item) => item.medianRatio)
  const actualGeomean = geomean(ratios)
  const actualMinimum = Math.min(...ratios, Infinity)
  const maximumRme = Math.max(
    ...cases.map((item) => item.relativeMarginOfError),
    Number.NEGATIVE_INFINITY,
  )
  recordFailure(
    failures,
    approximatelyEqual(report.summary?.geomeanRatio, actualGeomean) &&
      approximatelyEqual(report.summary?.minRatio, actualMinimum) &&
      approximatelyEqual(
        report.summary?.maxRelativeMarginOfError,
        maximumRme,
      ),
    'summary statistics do not match measured rows',
  )
  recordFailure(
    failures,
    actualGeomean >= policy.minimumGeomean,
    `global geomean ${actualGeomean} is below ${policy.minimumGeomean}`,
  )
  recordFailure(
    failures,
    actualMinimum >= policy.minimumCaseRatio,
    `worst case ${actualMinimum} is below ${policy.minimumCaseRatio}`,
  )
  return {
    passed: failures.length === 0,
    failures,
    geomeanRatio: actualGeomean,
    minimumRatio: actualMinimum,
  }
}

export const evaluateScalarTextHashPerfReport = (
  report: ScalarTextHashPerfReport,
): ScalarTextHashPerfEvaluation => {
  try {
    return evaluateUnsafe(report)
  } catch (error) {
    return {
      passed: false,
      failures: [
        `malformed scalar/text/hash report: ${(error as Error).message}`,
      ],
      geomeanRatio: Number.NaN,
      minimumRatio: Number.NaN,
    }
  }
}

const main = async (): Promise<void> => {
  const args = parseScalarTextHashPerfArgs(process.argv.slice(2))
  const report = await runScalarTextHashPerf(args)
  const evaluation = evaluateScalarTextHashPerfReport(report)
  console.log(
    `scalar/text/hash geomean ${evaluation.geomeanRatio.toFixed(3)}; minimum ${evaluation.minimumRatio.toFixed(3)}`,
  )
  if (!evaluation.passed) {
    throw new Error(
      `scalar/text/hash performance gate failed:\n${evaluation.failures.join('\n')}`,
    )
  }
}

const invokedPath =
  process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
