// Operation-complete fp-compiler performance runner. This additive lane keeps
// the historical 44-case stratified report untouched and measures one pinned
// row for every currently supported compiler operation in two fresh processes
// with reversed sampler roles.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SUPPORTED_OP_NAMES } from '../../../packages/fp-compiler/src/ops'
import {
  COMPILER_PERF_POLICIES,
  EXPECTED_COMPILER_IMPLEMENTATION_FILES,
  EXPECTED_COMPILER_SUBJECT_ID,
  minimumCompilerBatchIterations,
} from './compiler-perf-contract'
import {
  COMPILER_OPERATION_CASES,
  COMPILER_OPERATION_CORPUS_ID,
  COMPILER_OPERATION_CORPUS_VERSION,
  compilerOperationCorpusProjection,
  type CompilerOperationCategory,
  type CompilerOperationCorpusCase,
  type CompilerSupportedOpName,
} from './compiler-operation-corpus'
import {
  COMPILER_OPERATION_EMITTER_ID,
  compileCompilerOperationReference,
} from './compiler-operation-emitter'
import {
  EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS,
  EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT,
  isCompilerOperationOptimizerCanary,
} from './compiler-operation-perf-contract'
import { compileTransformedCompilerPerfSource, compilerPerfSemanticEqual } from './compiler-perf'
import { generateInputArray } from './generate'
import { currentPerfEngine, type PerfEngine } from './perf-engine'
import {
  combineSymmetricPairedSamples,
  consumedItemsMicroBatchIterations,
  geomean,
  runInterleavedPaired,
  type InterleavedPairedSampling,
  type SymmetricPairedSampling,
} from './perf-runner'

const localDirectory = dirname(fileURLToPath(import.meta.url))
const WORKER_MARKER = 'COMPILER_OPERATION_PERF_RESULT_JSON:'

export interface CompilerOperationPerfCase {
  readonly name: string
  readonly targetOp: CompilerSupportedOpName
  readonly optimizerCanary: boolean
  readonly opcode: number
  readonly category: CompilerOperationCategory
  readonly sourceSteps: readonly string[]
  readonly inputSize: number
  readonly consumedInputItems: number
  readonly correctnessOk: boolean
  readonly transformedSiteCount: number
  readonly workerEngine: PerfEngine
  readonly rounds: number
  readonly batchIterations: number
  readonly sampling: SymmetricPairedSampling & {
    readonly targetConsumedItemsPerMicroBatch: number
    readonly nominalConsumedItemsPerMicroBatch: number
  }
  readonly orientationSamples: {
    readonly candidateAtA: CompilerOperationOrientationMeasurement
    readonly candidateAtB: CompilerOperationOrientationMeasurement
  }
  readonly medianRatio: number
  readonly meanRatio: number
  readonly ciLow: number
  readonly ciHigh: number
  readonly signTestP: number
  readonly relativeMarginOfError: number
  readonly compilerSamplesNs: readonly number[]
  readonly referenceSamplesNs: readonly number[]
  readonly pairedRatios: readonly number[]
}

export type CompilerOperationPerfOrientation = 'candidate-at-a' | 'candidate-at-b'

export interface CompilerOperationOrientationMeasurement {
  readonly orientation: CompilerOperationPerfOrientation
  readonly aRole: 'candidate' | 'reference'
  readonly bRole: 'candidate' | 'reference'
  readonly caseName: string
  readonly targetOp: CompilerSupportedOpName
  readonly inputSize: number
  readonly consumedInputItems: number
  readonly correctnessOk: boolean
  readonly transformedSiteCount: number
  readonly workerEngine: PerfEngine
  readonly rounds: number
  readonly batchIterations: number
  readonly sampling: InterleavedPairedSampling
  readonly candidateSamplesNs: readonly number[]
  readonly referenceSamplesNs: readonly number[]
}

export interface CompilerOperationPerfArgs {
  readonly rounds: number
  readonly warmupRounds: number
  readonly minimumBatchInputItems: number
  readonly targetConsumedItemsPerMicroBatch: number
  readonly quick: boolean
  readonly casesFilter?: string
  readonly out?: string
  readonly caseIndex?: number
  readonly orientation?: CompilerOperationPerfOrientation
}

export interface CompilerOperationPerfReport {
  readonly version: 3
  readonly generatedAt: string
  readonly engine: PerfEngine
  readonly optimizerCanaryOps: readonly CompilerSupportedOpName[]
  readonly corpus: {
    readonly id: string
    readonly version: number
    readonly sha256: string
    readonly totalCaseCount: number
    readonly caseNamesSha256: string
    readonly targetOpsSha256: string
    readonly opcodesSha256: string
    readonly categoryCounts: Readonly<Record<CompilerOperationCategory, number>>
  }
  readonly reference: {
    readonly id: string
    readonly sha256: string
  }
  readonly compiler: {
    readonly id: string
    readonly implementationFiles: readonly string[]
    readonly implementationSha256: string
    readonly supportedOps: readonly string[]
    readonly supportedOpsSha256: string
  }
  readonly args: Omit<CompilerOperationPerfArgs, 'caseIndex' | 'orientation'>
  readonly summary: {
    readonly count: number
    readonly expectedCount: number
    readonly performanceCount: number
    readonly optimizerCanaryCount: number
    readonly geomeanRatio: number
    readonly minRatio: number
    readonly maxRelativeMarginOfError: number
    readonly allCorrect: boolean
    readonly complete: boolean
  }
  readonly cases: readonly CompilerOperationPerfCase[]
  readonly skipped: readonly string[]
}

interface WorkerSuccess {
  readonly ok: true
  readonly result: CompilerOperationOrientationMeasurement
}

interface WorkerFailure {
  readonly ok: false
  readonly reason: string
}

type WorkerOutcome = WorkerSuccess | WorkerFailure

const sha256 = (contents: string | Uint8Array): string =>
  createHash('sha256').update(contents).digest('hex')

const jsonSha256 = (value: unknown): string => sha256(JSON.stringify(value))

const relativeMarginOfError = (low: number, high: number, median: number): number =>
  ((high - low) / (2 * median)) * 100

const sameEngine = (left: PerfEngine, right: PerfEngine): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const synthesizeOperationSource = (item: CompilerOperationCorpusCase): string => {
  const pipeline = `pipe(input, ${item.sourceSteps.join(', ')})`
  const body =
    item.targetOp === 'forEach'
      ? `let __observation = 0;\nconst value = ${pipeline};\nreturn { value, observation: __observation };`
      : `return ${pipeline};`
  return [
    "import { pipe } from '@stopcock/fp'",
    "import * as A from '@stopcock/fp/array'",
    'function __run(input) {',
    body,
    '}',
    'export { __run };',
  ].join('\n')
}

export const expectedOperationConsumedItems = (
  item: CompilerOperationCorpusCase,
  input: readonly number[],
): number => {
  const firstMatch = (predicate: (value: number) => boolean): number => {
    for (let index = 0; index < input.length; index++) {
      if (predicate(input[index])) return index + 1
    }
    return input.length
  }
  const last = input[input.length - 1]
  switch (item.targetOp) {
    case 'head':
    case 'last':
    case 'length':
    case 'isEmpty':
      return 1
    case 'find':
    case 'findIndex':
    case 'findMap':
    case 'every':
    case 'some':
    case 'none':
      return Math.max(
        1,
        firstMatch((value) => value === last),
      )
    case 'mapWhile':
      return Math.max(
        1,
        firstMatch((value) => Math.abs(value) >= 450),
      )
    case 'takeUntil':
      return Math.max(
        1,
        firstMatch((value) => value > 450),
      )
    case 'takeWhile':
      return Math.max(
        1,
        firstMatch((value) => !(value < 450)),
      )
    case 'take':
      return Math.max(1, Math.min(input.length, 512))
    default:
      return Math.max(1, input.length)
  }
}

let compilerMeasurementSink: unknown
let referenceMeasurementSink: unknown

export const validateCompilerOperationCase = (
  item: CompilerOperationCorpusCase,
  inputOverride?: readonly number[],
): {
  readonly correctnessOk: boolean
  readonly transformedSiteCount: number
  readonly compilerValue: unknown
  readonly referenceValue: unknown
} => {
  const input =
    inputOverride === undefined
      ? generateInputArray(item.inputSeed, item.size)
      : inputOverride.slice()
  const compiled = compileTransformedCompilerPerfSource(synthesizeOperationSource(item))
  const reference = compileCompilerOperationReference(item.targetOp)
  const compilerValue = compiled.run(input)
  const referenceValue = reference(input)
  return {
    correctnessOk: compilerPerfSemanticEqual(compilerValue, referenceValue),
    transformedSiteCount: compiled.transformedSiteCount,
    compilerValue,
    referenceValue,
  }
}

const measureCaseOrientation = (
  item: CompilerOperationCorpusCase,
  args: CompilerOperationPerfArgs,
  orientation: CompilerOperationPerfOrientation,
): CompilerOperationOrientationMeasurement => {
  const input = generateInputArray(item.inputSeed, item.size) as readonly number[]
  const compiled = compileTransformedCompilerPerfSource(synthesizeOperationSource(item))
  const compiler = compiled.run
  const reference = compileCompilerOperationReference(item.targetOp)
  // Keep the timed wrappers structurally identical. A property dispatch on
  // only the compiler side gives JavaScriptCore two reciprocal optimizer
  // plateaus even for exact `return input.length` implementations.
  const compilerRun = (): unknown => compiler(input)
  const referenceRun = (): unknown => reference(input)
  const correctnessOk = compilerPerfSemanticEqual(compilerRun(), referenceRun())
  const consumedInputItems = expectedOperationConsumedItems(item, input)
  const batchIterations = minimumCompilerBatchIterations(consumedInputItems, args)
  const microBatchIterations = consumedItemsMicroBatchIterations(
    consumedInputItems,
    batchIterations,
    args.targetConsumedItemsPerMicroBatch,
  )
  const candidateAtA = orientation === 'candidate-at-a'
  const measured = runInterleavedPaired(
    candidateAtA ? compilerRun : referenceRun,
    candidateAtA ? referenceRun : compilerRun,
    {
      rounds: args.rounds,
      warmupRounds: args.warmupRounds,
      batchIterations,
      microBatchIterations,
      observe: (aLast, bLast) => {
        compilerMeasurementSink = candidateAtA ? aLast : bLast
        referenceMeasurementSink = candidateAtA ? bLast : aLast
      },
    },
  )
  return {
    orientation,
    aRole: candidateAtA ? 'candidate' : 'reference',
    bRole: candidateAtA ? 'reference' : 'candidate',
    caseName: item.name,
    targetOp: item.targetOp,
    inputSize: item.size,
    consumedInputItems,
    correctnessOk,
    transformedSiteCount: compiled.transformedSiteCount,
    workerEngine: currentPerfEngine(),
    rounds: measured.pairedRatios.length,
    batchIterations,
    sampling: measured.sampling,
    candidateSamplesNs: candidateAtA ? measured.aSamples : measured.bSamples,
    referenceSamplesNs: candidateAtA ? measured.bSamples : measured.aSamples,
  }
}

const combineCaseOrientations = (
  item: CompilerOperationCorpusCase,
  args: CompilerOperationPerfArgs,
  candidateAtA: CompilerOperationOrientationMeasurement,
  candidateAtB: CompilerOperationOrientationMeasurement,
): CompilerOperationPerfCase => {
  const mismatch =
    candidateAtA.orientation !== 'candidate-at-a' ||
    candidateAtB.orientation !== 'candidate-at-b' ||
    candidateAtA.caseName !== item.name ||
    candidateAtB.caseName !== item.name ||
    candidateAtA.targetOp !== item.targetOp ||
    candidateAtB.targetOp !== item.targetOp ||
    candidateAtA.inputSize !== candidateAtB.inputSize ||
    candidateAtA.consumedInputItems !== candidateAtB.consumedInputItems ||
    candidateAtA.batchIterations !== candidateAtB.batchIterations ||
    candidateAtA.rounds !== candidateAtB.rounds ||
    !sameEngine(candidateAtA.workerEngine, candidateAtB.workerEngine)
  if (mismatch) {
    throw new Error('fresh-process orientation metadata does not match')
  }
  const measured = combineSymmetricPairedSamples(
    {
      candidateAtA: {
        candidateSamples: candidateAtA.candidateSamplesNs,
        referenceSamples: candidateAtA.referenceSamplesNs,
      },
      candidateAtB: {
        candidateSamples: candidateAtB.candidateSamplesNs,
        referenceSamples: candidateAtB.referenceSamplesNs,
      },
    },
    {
      batchIterations: candidateAtA.batchIterations,
      microBatchIterations: candidateAtA.sampling.microBatchIterations,
    },
  )
  return {
    name: item.name,
    targetOp: item.targetOp,
    optimizerCanary: isCompilerOperationOptimizerCanary(item.targetOp),
    opcode: item.opcode,
    category: item.category,
    sourceSteps: item.sourceSteps,
    inputSize: item.size,
    consumedInputItems: candidateAtA.consumedInputItems,
    correctnessOk: candidateAtA.correctnessOk && candidateAtB.correctnessOk,
    transformedSiteCount: candidateAtA.transformedSiteCount,
    workerEngine: candidateAtA.workerEngine,
    rounds: measured.pairedRatios.length,
    batchIterations: candidateAtA.batchIterations,
    sampling: {
      ...measured.sampling,
      targetConsumedItemsPerMicroBatch: args.targetConsumedItemsPerMicroBatch,
      nominalConsumedItemsPerMicroBatch:
        candidateAtA.sampling.microBatchIterations * candidateAtA.consumedInputItems,
    },
    orientationSamples: { candidateAtA, candidateAtB },
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
    compilerSamplesNs: measured.aSamples,
    referenceSamplesNs: measured.bSamples,
    pairedRatios: measured.pairedRatios,
  }
}

export const parseCompilerOperationPerfArgs = (
  argv: readonly string[],
  engine = currentPerfEngine(),
): CompilerOperationPerfArgs => {
  const policy = COMPILER_PERF_POLICIES[engine.id]
  let rounds: number = policy.minimumRounds
  let warmupRounds: number = policy.minimumWarmupRounds
  let minimumBatchInputItems: number = policy.minimumBatchInputItems
  let targetConsumedItemsPerMicroBatch: number = policy.targetConsumedItemsPerMicroBatch
  let quick = false
  let casesFilter: string | undefined
  let out: string | undefined
  let caseIndex: number | undefined
  let orientation: CompilerOperationPerfOrientation | undefined

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--rounds') rounds = Number(argv[++index])
    else if (argument === '--warmup') warmupRounds = Number(argv[++index])
    else if (argument === '--batch-inputs') minimumBatchInputItems = Number(argv[++index])
    else if (argument === '--micro-batch-inputs') {
      targetConsumedItemsPerMicroBatch = Number(argv[++index])
    } else if (argument === '--quick') quick = true
    else if (argument === '--cases') casesFilter = argv[++index]
    else if (argument === '--out') out = argv[++index]
    else if (argument === '--case-index') caseIndex = Number(argv[++index])
    else if (argument === '--orientation') {
      const value = argv[++index]
      if (value !== 'candidate-at-a' && value !== 'candidate-at-b') {
        throw new Error('--orientation must be candidate-at-a or candidate-at-b')
      }
      orientation = value
    } else throw new Error(`unknown compiler operation perf argument: ${argument}`)
  }
  if (quick) rounds = Math.min(rounds, 8)
  for (const [flag, value] of [
    ['--rounds', rounds],
    ['--warmup', warmupRounds],
    ['--batch-inputs', minimumBatchInputItems],
    ['--micro-batch-inputs', targetConsumedItemsPerMicroBatch],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${flag} must be a positive integer`)
    }
  }
  if (caseIndex !== undefined && (!Number.isSafeInteger(caseIndex) || caseIndex < 0)) {
    throw new Error('--case-index must be a non-negative integer')
  }
  if ((caseIndex === undefined) !== (orientation === undefined)) {
    throw new Error('--case-index and --orientation must be provided together')
  }
  return {
    rounds,
    warmupRounds,
    minimumBatchInputItems,
    targetConsumedItemsPerMicroBatch,
    quick,
    casesFilter,
    out,
    caseIndex,
    orientation,
  }
}

const selectedCases = (args: CompilerOperationPerfArgs): readonly CompilerOperationCorpusCase[] => {
  if (!args.casesFilter) return COMPILER_OPERATION_CASES
  return COMPILER_OPERATION_CASES.filter((item) => item.name.includes(args.casesFilter as string))
}

const workerArgs = (
  selfPath: string,
  engine: PerfEngine,
  args: CompilerOperationPerfArgs,
  caseIndex: number,
  orientation: CompilerOperationPerfOrientation,
): readonly string[] => {
  const benchmarkArgs = [
    selfPath,
    '--case-index',
    String(caseIndex),
    '--orientation',
    orientation,
    '--rounds',
    String(args.rounds),
    '--warmup',
    String(args.warmupRounds),
    '--batch-inputs',
    String(args.minimumBatchInputItems),
    '--micro-batch-inputs',
    String(args.targetConsumedItemsPerMicroBatch),
    ...(args.casesFilter ? ['--cases', args.casesFilter] : []),
    ...(args.quick ? ['--quick'] : []),
  ]
  return engine.id === 'bun-jsc' ? ['run', ...benchmarkArgs] : ['--import=tsx', ...benchmarkArgs]
}

const runWorker = (
  item: CompilerOperationCorpusCase,
  caseIndex: number,
  args: CompilerOperationPerfArgs,
  engine: PerfEngine,
  orientation: CompilerOperationPerfOrientation,
): WorkerOutcome => {
  const processResult = spawnSync(
    process.execPath,
    workerArgs(fileURLToPath(import.meta.url), engine, args, caseIndex, orientation),
    { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 },
  )
  const markerLine = (processResult.stdout ?? '')
    .split('\n')
    .find((line) => line.startsWith(WORKER_MARKER))
  if (!markerLine) {
    return {
      ok: false,
      reason: `worker produced no result (status ${String(processResult.status)}, signal ${String(processResult.signal)}, stderr: ${(processResult.stderr ?? '').slice(0, 500)})`,
    }
  }
  try {
    const outcome = JSON.parse(markerLine.slice(WORKER_MARKER.length)) as WorkerOutcome
    if (!outcome.ok) return outcome
    if (processResult.status !== 0 || processResult.signal !== null) {
      return {
        ok: false,
        reason: `worker exited with status ${String(processResult.status)} and signal ${String(processResult.signal)}`,
      }
    }
    if (outcome.result.caseName !== item.name) {
      return {
        ok: false,
        reason: `worker returned case ${outcome.result.caseName} instead of ${item.name}`,
      }
    }
    if (outcome.result.orientation !== orientation) {
      return {
        ok: false,
        reason: `worker returned orientation ${outcome.result.orientation} instead of ${orientation}`,
      }
    }
    if (!sameEngine(outcome.result.workerEngine, engine)) {
      return {
        ok: false,
        reason: `worker runtime identity does not match coordinator (${outcome.result.workerEngine.id}/${outcome.result.workerEngine.runtimeVersion})`,
      }
    }
    return outcome
  } catch (error) {
    return { ok: false, reason: `worker result was invalid JSON: ${(error as Error).message}` }
  }
}

const compilerImplementationSha256 = async (): Promise<string> => {
  const root = resolve(localDirectory, '..', '..', '..')
  const hash = createHash('sha256')
  for (const relativePath of EXPECTED_COMPILER_IMPLEMENTATION_FILES) {
    hash.update(relativePath)
    hash.update('\0')
    hash.update(await readFile(join(root, relativePath)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

const categoryCounts = (): Readonly<Record<CompilerOperationCategory, number>> => {
  const counts: Record<CompilerOperationCategory, number> = {
    element: 0,
    stateful: 0,
    terminal: 0,
    materializer: 0,
  }
  for (const item of COMPILER_OPERATION_CASES) counts[item.category]++
  return counts
}

const defaultOutputPath = (engine: PerfEngine): string =>
  join(
    resolve(process.env.PERF_ARTIFACT_DIR ?? join(localDirectory, '..', '..', 'reports')),
    `compiler-operation-performance-${engine.id}.json`,
  )

export const runCompilerOperationPerf = async (
  args: CompilerOperationPerfArgs,
): Promise<{ readonly report: CompilerOperationPerfReport; readonly outputPath: string }> => {
  if (args.caseIndex !== undefined || args.orientation !== undefined) {
    throw new Error('runCompilerOperationPerf coordinator cannot be called in worker mode')
  }
  const engine = currentPerfEngine()
  const selected = selectedCases(args)
  const results: CompilerOperationPerfCase[] = []
  const skipped: string[] = []
  for (let index = 0; index < selected.length; index++) {
    const item = selected[index]
    const candidateAtA = runWorker(item, index, args, engine, 'candidate-at-a')
    if (!candidateAtA.ok) {
      skipped.push(`${item.name}/candidate-at-a: ${candidateAtA.reason}`)
      continue
    }
    const candidateAtB = runWorker(item, index, args, engine, 'candidate-at-b')
    if (!candidateAtB.ok) {
      skipped.push(`${item.name}/candidate-at-b: ${candidateAtB.reason}`)
      continue
    }
    try {
      results.push(combineCaseOrientations(item, args, candidateAtA.result, candidateAtB.result))
    } catch (error) {
      skipped.push(`${item.name}: ${(error as Error).message}`)
    }
  }

  const projection = compilerOperationCorpusProjection()
  const performanceResults = results.filter((result) => !result.optimizerCanary)
  const optimizerCanaryResults = results.filter((result) => result.optimizerCanary)
  const ratios = performanceResults.map((result) => result.medianRatio)
  const supportedOps = [...SUPPORTED_OP_NAMES].sort()
  const referencePath = fileURLToPath(new URL('./compiler-operation-emitter.ts', import.meta.url))
  const reportArgs: Omit<CompilerOperationPerfArgs, 'caseIndex' | 'orientation'> = {
    rounds: args.rounds,
    warmupRounds: args.warmupRounds,
    minimumBatchInputItems: args.minimumBatchInputItems,
    targetConsumedItemsPerMicroBatch: args.targetConsumedItemsPerMicroBatch,
    quick: args.quick,
    casesFilter: args.casesFilter,
    out: args.out,
  }
  const summary = {
    count: results.length,
    expectedCount: COMPILER_OPERATION_CASES.length,
    performanceCount: performanceResults.length,
    optimizerCanaryCount: optimizerCanaryResults.length,
    geomeanRatio: geomean(ratios),
    minRatio: Math.min(...ratios, Infinity),
    maxRelativeMarginOfError: Math.max(
      ...performanceResults.map((result) => result.relativeMarginOfError),
      Number.NEGATIVE_INFINITY,
    ),
    allCorrect: results.every((result) => result.correctnessOk),
    complete:
      selected.length === COMPILER_OPERATION_CASES.length &&
      results.length === COMPILER_OPERATION_CASES.length &&
      performanceResults.length === EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT &&
      optimizerCanaryResults.length === EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS.length &&
      skipped.length === 0,
  }
  const report: CompilerOperationPerfReport = {
    version: 3,
    generatedAt: new Date().toISOString(),
    engine,
    optimizerCanaryOps: EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS,
    corpus: {
      id: COMPILER_OPERATION_CORPUS_ID,
      version: COMPILER_OPERATION_CORPUS_VERSION,
      sha256: jsonSha256(projection),
      totalCaseCount: COMPILER_OPERATION_CASES.length,
      caseNamesSha256: jsonSha256(projection.map((item) => item.name)),
      targetOpsSha256: jsonSha256(projection.map((item) => item.targetOp)),
      opcodesSha256: jsonSha256(projection.map((item) => [item.targetOp, item.opcode])),
      categoryCounts: categoryCounts(),
    },
    reference: {
      id: COMPILER_OPERATION_EMITTER_ID,
      sha256: sha256(await readFile(referencePath)),
    },
    compiler: {
      id: EXPECTED_COMPILER_SUBJECT_ID,
      implementationFiles: EXPECTED_COMPILER_IMPLEMENTATION_FILES,
      implementationSha256: await compilerImplementationSha256(),
      supportedOps,
      supportedOpsSha256: jsonSha256(supportedOps),
    },
    args: reportArgs,
    summary,
    cases: results,
    skipped,
  }
  const outputPath = args.out ?? defaultOutputPath(engine)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)

  console.log(
    `\nfp-compiler operation-complete raw performance report (${engine.name}; referenceNs / compilerNs; >1 == compiler faster)\n`,
  )
  console.log(
    [
      'operation',
      'class',
      'policy',
      'input',
      'consumed',
      'batch',
      'n',
      'median',
      'CI95',
      'RME',
      'correct',
    ].join('\t'),
  )
  for (const result of results) {
    console.log(
      [
        result.targetOp,
        result.category,
        result.optimizerCanary ? 'optimizer-canary' : 'performance',
        result.inputSize,
        result.consumedInputItems,
        result.batchIterations,
        result.rounds,
        result.medianRatio.toFixed(3),
        `[${result.ciLow.toFixed(3)},${result.ciHigh.toFixed(3)}]`,
        `${result.relativeMarginOfError.toFixed(2)}%`,
        result.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(
    `\noperations: ${summary.count}/${summary.expectedCount}; performance measurements: ${summary.performanceCount}; optimizer canaries: ${summary.optimizerCanaryCount}; geomean: ${summary.geomeanRatio.toFixed(3)}; min: ${summary.minRatio.toFixed(3)}; allCorrect: ${summary.allCorrect}`,
  )
  console.log(`raw report: ${outputPath}`)
  if (skipped.length > 0) {
    console.log(`\nskipped (${skipped.length}):`)
    for (const item of skipped) console.log(`  - ${item}`)
  }
  void compilerMeasurementSink
  void referenceMeasurementSink
  return { report, outputPath }
}

const runWorkerMain = async (args: CompilerOperationPerfArgs): Promise<void> => {
  const selected = selectedCases(args)
  const item = selected[args.caseIndex as number]
  if (!item) {
    console.log(
      `${WORKER_MARKER}${JSON.stringify({ ok: false, reason: 'case index out of range' } satisfies WorkerFailure)}`,
    )
    process.exitCode = 1
    return
  }
  try {
    const result = measureCaseOrientation(
      item,
      args,
      args.orientation as CompilerOperationPerfOrientation,
    )
    console.log(`${WORKER_MARKER}${JSON.stringify({ ok: true, result } satisfies WorkerSuccess)}`)
  } catch (error) {
    console.log(
      `${WORKER_MARKER}${JSON.stringify({ ok: false, reason: (error as Error).message } satisfies WorkerFailure)}`,
    )
    process.exitCode = 1
  }
}

const main = async (): Promise<void> => {
  const args = parseCompilerOperationPerfArgs(process.argv.slice(2))
  if (args.caseIndex !== undefined) {
    await runWorkerMain(args)
    return
  }
  const { report } = await runCompilerOperationPerf(args)
  if (!report.summary.complete || !report.summary.allCorrect) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
