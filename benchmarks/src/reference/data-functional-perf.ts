import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Indexed from '../../../packages/fp/src/indexed'
import * as Reader from '../../../packages/fp/src/reader'
import * as Semigroup from '../../../packages/fp/src/semigroup'
import * as State from '../../../packages/fp/src/state-fn'
import * as These from '../../../packages/fp/src/these'
import * as Validation from '../../../packages/fp/src/validation'
import {
  indexedCopyIntoBefore,
  indexedIncludesBefore,
  indexedSliceBefore,
  readerTapBefore,
  stateTapBefore,
  theseZipWithBefore,
  validationAllBefore,
} from './data-functional-before'
import {
  DATA_FUNCTIONAL_PERF_POLICIES,
  EXPECTED_DATA_FUNCTIONAL_BASELINE,
  EXPECTED_DATA_FUNCTIONAL_SUBJECT_FILES,
  EXPECTED_DATA_FUNCTIONAL_SUBJECT_ID,
  minimumDataFunctionalBatchIterations,
} from './data-functional-perf-contract'
import { currentPerfEngine, type PerfEngine } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  geomean,
  runInterleavedPaired,
  type InterleavedPairedSampling,
} from './perf-runner'

const localDirectory = dirname(fileURLToPath(import.meta.url))
const WORKER_MARKER = 'DATA_FUNCTIONAL_PERF_RESULT_JSON:'

interface ExecutableCase {
  readonly name: string
  readonly workUnits: number
  readonly current: () => unknown
  readonly baseline: () => unknown
  readonly correctnessOracle?: () => boolean
  readonly currentObservation?: () => unknown
  readonly baselineObservation?: () => unknown
}

export interface DataFunctionalPerfCase {
  readonly name: string
  readonly workUnits: number
  readonly correctnessOk: boolean
  readonly workerEngine: PerfEngine
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

export interface DataFunctionalPerfArgs {
  readonly rounds: number
  readonly warmupRounds: number
  readonly minimumBatchWorkUnits: number
  readonly targetWorkUnitsPerMicroBatch: number
  readonly quick: boolean
  readonly casesFilter?: string
  readonly out?: string
  readonly caseIndex?: number
}

export interface DataFunctionalPerfReport {
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
  readonly args: Omit<DataFunctionalPerfArgs, 'caseIndex'>
  readonly summary: {
    readonly count: number
    readonly expectedCount: number
    readonly geomeanRatio: number
    readonly minRatio: number
    readonly maxRelativeMarginOfError: number
    readonly allCorrect: boolean
    readonly complete: boolean
  }
  readonly cases: readonly DataFunctionalPerfCase[]
  readonly skipped: readonly string[]
}

interface WorkerSuccess {
  readonly ok: true
  readonly result: DataFunctionalPerfCase
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

const semanticEqual = (left: unknown, right: unknown): boolean => {
  if (typeof left === 'number' && typeof right === 'number') {
    return Number.isNaN(left) && Number.isNaN(right) ? true : Object.is(left, right)
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) {
      if (!semanticEqual(left[index], right[index])) return false
    }
    return true
  }
  if (
    left !== null &&
    right !== null &&
    typeof left === 'object' &&
    typeof right === 'object'
  ) {
    const leftRecord = left as Record<PropertyKey, unknown>
    const rightRecord = right as Record<PropertyKey, unknown>
    const leftKeys = Reflect.ownKeys(leftRecord)
    const rightKeys = Reflect.ownKeys(rightRecord)
    if (!semanticEqual(leftKeys, rightKeys)) return false
    for (const key of leftKeys) {
      if (!semanticEqual(leftRecord[key], rightRecord[key])) return false
    }
    return true
  }
  return Object.is(left, right)
}

const buildCases = (): readonly ExecutableCase[] => {
  const valid = Array.from({ length: 128 }, (_, index) => Validation.valid(index))
  const mixed = Array.from({ length: 128 }, (_, index) =>
    index % 4 === 0 ? Validation.invalid(`e${index}`) : Validation.valid(index),
  )
  const custom = valid.slice()
  Object.defineProperty(custom, Symbol.iterator, {
    configurable: true,
    value: function* () {
      for (let index = custom.length - 1; index >= 0; index -= 1) {
        yield custom[index] as Validation.Validation<number, never>
      }
    },
  })

  const errors = Semigroup.string
  const combine = (left: number, right: number): number => left + right
  const rightThat = These.right(2)
  const bothThat = These.both('that', 2)
  const currentRightZip = These.zipWith(errors)(rightThat, combine)
  const baselineRightZip = theseZipWithBefore(errors)(rightThat, combine)
  const currentBothZip = These.zipWith(errors)(bothThat, combine)
  const baselineBothZip = theseZipWithBefore(errors)(bothThat, combine)

  const readerSelf: Reader.Reader<{ readonly offset: number }, number> = (environment) =>
    environment.offset + 1
  let currentReaderEffectChecksum = 0
  let baselineReaderEffectChecksum = 0
  const currentReaderEffect = (
    value: number,
  ): Reader.Reader<{ readonly offset: number }, number> =>
    (environment) => {
      currentReaderEffectChecksum =
        ((currentReaderEffectChecksum * 33) ^ (value + environment.offset)) | 0
      return value + environment.offset
    }
  const baselineReaderEffect = (
    value: number,
  ): Reader.Reader<{ readonly offset: number }, number> =>
    (environment) => {
      baselineReaderEffectChecksum =
        ((baselineReaderEffectChecksum * 33) ^ (value + environment.offset)) | 0
      return value + environment.offset
    }
  const currentReader = Reader.tap(currentReaderEffect)(readerSelf)
  const baselineReader = readerTapBefore(baselineReaderEffect)(readerSelf)
  const environment = { offset: 7 }

  const stateSelf: State.State<number, number> = (state) => [state + 1, state + 2]
  const stateEffect = (value: number): State.State<number, number> =>
    (state) =>
      [value + state, state + 3]
  const currentState = State.tap(stateEffect)(stateSelf)
  const baselineState = stateTapBefore(stateEffect)(stateSelf)

  const indexedValues = Array.from({ length: 1_024 }, (_, index) => index)
  const currentTarget = new Array<number>(1_024).fill(0)
  const baselineTarget = new Array<number>(1_024).fill(0)

  return [
    {
      name: 'validation/all-success-128',
      workUnits: 128,
      current: () => Validation.all(valid),
      baseline: () => validationAllBefore(valid),
    },
    {
      name: 'validation/all-mixed-128',
      workUnits: 128,
      current: () => Validation.all(mixed),
      baseline: () => validationAllBefore(mixed),
    },
    {
      name: 'validation/all-custom-iterator-128',
      workUnits: 128,
      current: () => Validation.all(custom),
      baseline: () => validationAllBefore(custom),
    },
    {
      name: 'these/zip-right-right',
      workUnits: 1,
      current: () => currentRightZip(These.right(1)),
      baseline: () => baselineRightZip(These.right(1)),
    },
    {
      name: 'these/zip-both-both',
      workUnits: 1,
      current: () => currentBothZip(These.both('self', 1)),
      baseline: () => baselineBothZip(These.both('self', 1)),
    },
    {
      name: 'reader/tap',
      workUnits: 1,
      current: () => currentReader(environment),
      baseline: () => baselineReader(environment),
      correctnessOracle: () =>
        currentReaderEffectChecksum !== 0 &&
        currentReaderEffectChecksum === baselineReaderEffectChecksum,
      currentObservation: () => currentReaderEffectChecksum,
      baselineObservation: () => baselineReaderEffectChecksum,
    },
    {
      name: 'state/tap',
      workUnits: 1,
      current: () => currentState(1),
      baseline: () => baselineState(1),
    },
    {
      name: 'indexed/includes-hit-late-1024',
      workUnits: 1_024,
      current: () => Indexed.includes(indexedValues, 1_023),
      baseline: () => indexedIncludesBefore(indexedValues, 1_023),
    },
    {
      name: 'indexed/includes-miss-1024',
      workUnits: 1_024,
      current: () => Indexed.includes(indexedValues, -1),
      baseline: () => indexedIncludesBefore(indexedValues, -1),
    },
    {
      name: 'indexed/slice-middle-1024',
      workUnits: 512,
      current: () => Indexed.slice(indexedValues, 256, 768),
      baseline: () => indexedSliceBefore(indexedValues, 256, 768),
    },
    {
      name: 'indexed/copy-1024',
      workUnits: 1_023,
      current: () => Indexed.copyInto(indexedValues, currentTarget, 1, 0, 1_023),
      baseline: () =>
        indexedCopyIntoBefore(indexedValues, baselineTarget, 1, 0, 1_023),
    },
  ]
}

let currentMeasurementSink: unknown
let baselineMeasurementSink: unknown

export const evaluateDataFunctionalCorrectness = (
  current: () => unknown,
  baseline: () => unknown,
  oracle?: () => boolean,
): boolean =>
  semanticEqual(current(), baseline()) && (oracle?.() ?? true)

const executableCorrectness = (executable: ExecutableCase): boolean =>
  evaluateDataFunctionalCorrectness(
    executable.current,
    executable.baseline,
    executable.correctnessOracle,
  )

export const checkDataFunctionalCaseCorrectness = (name: string): boolean => {
  const executable = buildCases().find((item) => item.name === name)
  if (executable === undefined) {
    throw new Error(`unknown data-functional performance case: ${name}`)
  }
  return executableCorrectness(executable)
}

const measureCase = (
  executable: ExecutableCase,
  args: DataFunctionalPerfArgs,
): DataFunctionalPerfCase => {
  const correctnessOk = executableCorrectness(executable)
  const batchIterations = minimumDataFunctionalBatchIterations(
    executable.workUnits,
    args,
  )
  const microBatchIterations = consumedItemsMicroBatchIterations(
    executable.workUnits,
    batchIterations,
    args.targetWorkUnitsPerMicroBatch,
  )
  const measured = runInterleavedPaired(executable.current, executable.baseline, {
    rounds: args.rounds,
    warmupRounds: args.warmupRounds,
    batchIterations,
    microBatchIterations,
    observe: (currentLast, baselineLast) => {
      currentMeasurementSink =
        executable.currentObservation === undefined
          ? currentLast
          : [currentLast, executable.currentObservation()]
      baselineMeasurementSink =
        executable.baselineObservation === undefined
          ? baselineLast
          : [baselineLast, executable.baselineObservation()]
    },
  })
  return {
    name: executable.name,
    workUnits: executable.workUnits,
    correctnessOk,
    workerEngine: currentPerfEngine(),
    rounds: measured.pairedRatios.length,
    batchIterations,
    sampling: {
      ...measured.sampling,
      targetWorkUnitsPerMicroBatch: args.targetWorkUnitsPerMicroBatch,
      nominalWorkUnitsPerMicroBatch: microBatchIterations * executable.workUnits,
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

export const parseDataFunctionalPerfArgs = (
  argv: readonly string[],
  engine = currentPerfEngine(),
): DataFunctionalPerfArgs => {
  const policy = DATA_FUNCTIONAL_PERF_POLICIES[engine.id]
  let rounds: number = policy.minimumRounds
  let warmupRounds: number = policy.minimumWarmupRounds
  let minimumBatchWorkUnits: number = policy.minimumBatchWorkUnits
  let targetWorkUnitsPerMicroBatch: number = policy.targetWorkUnitsPerMicroBatch
  let quick = false
  let casesFilter: string | undefined
  let out: string | undefined
  let caseIndex: number | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--rounds') rounds = Number(argv[++index])
    else if (argument === '--warmup') warmupRounds = Number(argv[++index])
    else if (argument === '--batch-work') minimumBatchWorkUnits = Number(argv[++index])
    else if (argument === '--micro-batch-work') {
      targetWorkUnitsPerMicroBatch = Number(argv[++index])
    } else if (argument === '--quick') quick = true
    else if (argument === '--cases') casesFilter = argv[++index]
    else if (argument === '--out') out = argv[++index]
    else if (argument === '--case-index') caseIndex = Number(argv[++index])
    else throw new Error(`unknown data-functional perf argument: ${argument}`)
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
  if (caseIndex !== undefined && (!Number.isSafeInteger(caseIndex) || caseIndex < 0)) {
    throw new Error('--case-index must be a non-negative integer')
  }
  return {
    rounds,
    warmupRounds,
    minimumBatchWorkUnits,
    targetWorkUnitsPerMicroBatch,
    quick,
    casesFilter,
    out,
    caseIndex,
  }
}

const selectCases = (
  cases: readonly ExecutableCase[],
  args: DataFunctionalPerfArgs,
): readonly ExecutableCase[] =>
  args.casesFilter
    ? cases.filter((item) => item.name.includes(args.casesFilter as string))
    : cases

const workerArguments = (
  engine: PerfEngine,
  args: DataFunctionalPerfArgs,
  caseIndex: number,
): readonly string[] => {
  const benchmarkArgs = [
    fileURLToPath(import.meta.url),
    '--case-index',
    String(caseIndex),
    '--rounds',
    String(args.rounds),
    '--warmup',
    String(args.warmupRounds),
    '--batch-work',
    String(args.minimumBatchWorkUnits),
    '--micro-batch-work',
    String(args.targetWorkUnitsPerMicroBatch),
    ...(args.quick ? ['--quick'] : []),
    ...(args.casesFilter ? ['--cases', args.casesFilter] : []),
  ]
  return engine.id === 'bun-jsc'
    ? ['run', ...benchmarkArgs]
    : ['--import=tsx', ...benchmarkArgs]
}

const runWorker = (
  executable: ExecutableCase,
  caseIndex: number,
  args: DataFunctionalPerfArgs,
  engine: PerfEngine,
): WorkerOutcome => {
  const worker = spawnSync(process.execPath, workerArguments(engine, args, caseIndex), {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  })
  const marker = (worker.stdout ?? '')
    .split('\n')
    .find((line) => line.startsWith(WORKER_MARKER))
  if (!marker) {
    return {
      ok: false,
      reason: `worker produced no result (status ${String(worker.status)}, signal ${String(worker.signal)}, stderr: ${(worker.stderr ?? '').slice(0, 500)})`,
    }
  }
  try {
    const outcome = JSON.parse(marker.slice(WORKER_MARKER.length)) as WorkerOutcome
    if (!outcome.ok) return outcome
    if (worker.status !== 0 || worker.signal !== null) {
      return {
        ok: false,
        reason: `worker exited with status ${String(worker.status)} and signal ${String(worker.signal)}`,
      }
    }
    if (outcome.result.name !== executable.name) {
      return {
        ok: false,
        reason: `worker returned ${outcome.result.name} instead of ${executable.name}`,
      }
    }
    if (!sameEngine(outcome.result.workerEngine, engine)) {
      return { ok: false, reason: 'worker runtime identity does not match coordinator' }
    }
    return outcome
  } catch (error) {
    return {
      ok: false,
      reason: `worker result was invalid JSON: ${(error as Error).message}`,
    }
  }
}

const sourceSha256 = async (): Promise<string> => {
  const root = resolve(localDirectory, '..', '..', '..')
  const hash = createHash('sha256')
  for (const relativePath of EXPECTED_DATA_FUNCTIONAL_SUBJECT_FILES) {
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
      process.env.PERF_ARTIFACT_DIR ?? join(localDirectory, '..', '..', 'reports'),
    ),
    `data-functional-${engine.id}.json`,
  )

export const runDataFunctionalPerf = async (
  args: DataFunctionalPerfArgs,
): Promise<{ readonly report: DataFunctionalPerfReport; readonly outputPath: string }> => {
  if (args.caseIndex !== undefined) {
    throw new Error('data-functional coordinator cannot run in worker mode')
  }
  const engine = currentPerfEngine()
  const allCases = buildCases()
  const selected = selectCases(allCases, args)
  const results: DataFunctionalPerfCase[] = []
  const skipped: string[] = []
  for (let index = 0; index < selected.length; index += 1) {
    const outcome = runWorker(selected[index], index, args, engine)
    if (outcome.ok) results.push(outcome.result)
    else skipped.push(`${selected[index].name}: ${outcome.reason}`)
  }
  const projection = allCases.map(({ name, workUnits }) => ({ name, workUnits }))
  const ratios = results.map((item) => item.medianRatio)
  const summary = {
    count: results.length,
    expectedCount: allCases.length,
    geomeanRatio: geomean(ratios),
    minRatio: Math.min(...ratios, Infinity),
    maxRelativeMarginOfError: Math.max(
      ...results.map((item) => item.relativeMarginOfError),
      Number.NEGATIVE_INFINITY,
    ),
    allCorrect: results.every((item) => item.correctnessOk),
    complete:
      selected.length === allCases.length &&
      results.length === allCases.length &&
      skipped.length === 0,
  }
  const report: DataFunctionalPerfReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    engine,
    subject: {
      id: EXPECTED_DATA_FUNCTIONAL_SUBJECT_ID,
      files: EXPECTED_DATA_FUNCTIONAL_SUBJECT_FILES,
      sha256: await sourceSha256(),
    },
    baseline: {
      id: EXPECTED_DATA_FUNCTIONAL_BASELINE.id,
      sha256: sha256(
        await readFile(new URL('./data-functional-before.ts', import.meta.url)),
      ),
    },
    coverage: {
      caseCount: allCases.length,
      caseNamesSha256: jsonSha256(allCases.map((item) => item.name)),
      projectionSha256: jsonSha256(projection),
    },
    args: {
      rounds: args.rounds,
      warmupRounds: args.warmupRounds,
      minimumBatchWorkUnits: args.minimumBatchWorkUnits,
      targetWorkUnitsPerMicroBatch: args.targetWorkUnitsPerMicroBatch,
      quick: args.quick,
      casesFilter: args.casesFilter,
      out: args.out,
    },
    summary,
    cases: results,
    skipped,
  }
  const outputPath = args.out ?? defaultOutputPath(engine)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`\nData/functional raw report (${engine.name}; baselineNs / currentNs)\n`)
  console.log(['case', 'work', 'batch', 'n', 'median', 'CI95', 'RME', 'correct'].join('\t'))
  for (const item of results) {
    console.log(
      [
        item.name,
        item.workUnits,
        item.batchIterations,
        item.rounds,
        item.medianRatio.toFixed(3),
        `[${item.ciLow.toFixed(3)},${item.ciHigh.toFixed(3)}]`,
        `${item.relativeMarginOfError.toFixed(2)}%`,
        item.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(
    `\ncases: ${summary.count}/${summary.expectedCount}; geomean: ${summary.geomeanRatio.toFixed(3)}; min: ${summary.minRatio.toFixed(3)}; allCorrect: ${summary.allCorrect}`,
  )
  console.log(`raw report: ${outputPath}`)
  void currentMeasurementSink
  void baselineMeasurementSink
  return { report, outputPath }
}

const runWorkerMain = (args: DataFunctionalPerfArgs): void => {
  const cases = selectCases(buildCases(), args)
  const executable = cases[args.caseIndex as number]
  if (!executable) {
    console.log(
      `${WORKER_MARKER}${JSON.stringify({ ok: false, reason: 'case index out of range' } satisfies WorkerFailure)}`,
    )
    process.exitCode = 1
    return
  }
  try {
    const result = measureCase(executable, args)
    console.log(
      `${WORKER_MARKER}${JSON.stringify({ ok: true, result } satisfies WorkerSuccess)}`,
    )
  } catch (error) {
    console.log(
      `${WORKER_MARKER}${JSON.stringify({ ok: false, reason: (error as Error).message } satisfies WorkerFailure)}`,
    )
    process.exitCode = 1
  }
}

const main = async (): Promise<void> => {
  const args = parseDataFunctionalPerfArgs(process.argv.slice(2))
  if (args.caseIndex !== undefined) {
    runWorkerMain(args)
    return
  }
  const { report } = await runDataFunctionalPerf(args)
  if (!report.summary.complete || !report.summary.allCorrect) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
