import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Match from '../../../packages/fp/src/match'
import * as Monoid from '../../../packages/fp/src/monoid'
import * as Recursion from '../../../packages/fp/src/recursion'
import * as Schema from '../../../packages/fp/src/schema'
import * as Writer from '../../../packages/fp/src/writer'
import {
  matchDiscriminantBefore,
  matchTagBefore,
  recursionFlatMapBefore,
  recursionMapBefore,
  recursionMemoFixBefore,
  schemaMapBefore,
  writerSequenceBefore,
  writerZipBefore,
} from './third-wave-before'
import {
  EXPECTED_THIRD_WAVE_BASELINE,
  EXPECTED_THIRD_WAVE_SUBJECT_FILES,
  EXPECTED_THIRD_WAVE_SUBJECT_ID,
  minimumThirdWaveBatchIterations,
  THIRD_WAVE_PERF_POLICIES,
} from './third-wave-perf-contract'
import { currentPerfEngine, type PerfEngine } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  geomean,
  runInterleavedPaired,
  type InterleavedPairedSampling,
} from './perf-runner'

const localDirectory = dirname(fileURLToPath(import.meta.url))
const WORKER_MARKER = 'THIRD_WAVE_PERF_RESULT_JSON:'

interface ExecutableCase {
  readonly name: string
  readonly workUnits: number
  readonly current: () => unknown
  readonly baseline: () => unknown
}

export interface ThirdWavePerfCase {
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

export interface ThirdWavePerfArgs {
  readonly rounds: number
  readonly warmupRounds: number
  readonly minimumBatchWorkUnits: number
  readonly targetWorkUnitsPerMicroBatch: number
  readonly quick: boolean
  readonly casesFilter?: string
  readonly out?: string
  readonly caseIndex?: number
}

export interface ThirdWavePerfReport {
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
  readonly args: Omit<ThirdWavePerfArgs, 'caseIndex'>
  readonly summary: {
    readonly count: number
    readonly expectedCount: number
    readonly geomeanRatio: number
    readonly minRatio: number
    readonly maxRelativeMarginOfError: number
    readonly allCorrect: boolean
    readonly complete: boolean
  }
  readonly cases: readonly ThirdWavePerfCase[]
  readonly skipped: readonly string[]
}

interface WorkerSuccess {
  readonly ok: true
  readonly result: ThirdWavePerfCase
}

interface WorkerFailure {
  readonly ok: false
  readonly reason: string
}

type WorkerOutcome = WorkerSuccess | WorkerFailure

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex')

const jsonSha256 = (value: unknown): string =>
  sha256(JSON.stringify(value))

const sameEngine = (left: PerfEngine, right: PerfEngine): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const relativeMarginOfError = (
  low: number,
  high: number,
  median: number,
): number => ((high - low) / (2 * median)) * 100

const semanticEqual = (left: unknown, right: unknown): boolean => {
  if (typeof left === 'number' && typeof right === 'number') {
    return Number.isNaN(left) && Number.isNaN(right)
      ? true
      : Object.is(left, right)
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
      if (!semanticEqual(leftRecord[key], rightRecord[key])) {
        return false
      }
    }
    return true
  }
  return Object.is(left, right)
}

const suspended = (depth: number): Recursion.Trampoline<number> => {
  let result: Recursion.Trampoline<number> = Recursion.now(1)
  for (let index = 0; index < depth; index += 1) {
    const next = result
    result = Recursion.suspend(() => next)
  }
  return result
}

const buildCases = (): readonly ExecutableCase[] => {
  const source = suspended(128)
  const increment = (value: number): number => value + 1
  const currentMap = Recursion.map(increment)(source)
  const baselineMap = recursionMapBefore(increment)(source)
  const currentFlatMap = Recursion.flatMap((value: number) =>
    Recursion.now(value + 1),
  )(source)
  const baselineFlatMap = recursionFlatMapBefore(
    (value: number) => Recursion.now(value + 1),
  )(source)

  const currentMemo = Recursion.memoFix<number, number>(
    (_recur, value) => value + 1,
  )
  const baselineMemo = recursionMemoFixBefore<number, number>(
    (_recur, value) => value + 1,
  )
  const currentUndefined = Recursion.memoFix<number, undefined>(
    () => undefined,
  )
  const baselineUndefined = recursionMemoFixBefore<
    number,
    undefined
  >(() => undefined)
  currentMemo(21)
  baselineMemo(21)
  currentUndefined(21)
  baselineUndefined(21)

  type Shape =
    | { readonly kind: 'circle'; readonly value: number }
    | { readonly kind: 'square'; readonly value: number }
  const shape: Shape = { kind: 'circle', value: 21 }
  const handlers: Match.Handlers<Shape, 'kind', number> = {
    circle: (value) => value.value,
    square: (value) => -value.value,
  }
  const currentDiscriminant = Match.discriminant('kind', handlers)
  const baselineDiscriminant = matchDiscriminantBefore(
    'kind',
    handlers,
  )

  type Tagged =
    | { readonly _tag: 'Left'; readonly value: number }
    | { readonly _tag: 'Right'; readonly value: number }
  const tagged: Tagged = { _tag: 'Right', value: 21 }
  const taggedHandlers: Match.TaggedHandlers<Tagged, number> = {
    Left: (value) => -value.value,
    Right: (value) => value.value,
  }
  const currentTag = Match.tag(taggedHandlers)
  const baselineTag = matchTagBefore(taggedHandlers)

  const schema = Schema.fromPredicate(
    (value: unknown): value is number =>
      typeof value === 'number',
  )
  const currentSchema = Schema.map(schema, increment)
  const baselineSchema = schemaMapBefore(schema, increment)

  const currentZip = Writer.zip(Monoid.numberSum)([2, 3])
  const baselineZip = writerZipBefore(Monoid.numberSum)([2, 3])
  const writers = Array.from(
    { length: 128 },
    (_, index) => [index, index] as const,
  )
  const currentSequence = Writer.sequenceReadonlyArray(
    Monoid.numberSum,
  )
  const baselineSequence = writerSequenceBefore(Monoid.numberSum)

  return [
    {
      name: 'recursion/map-suspended-128',
      workUnits: 128,
      current: () => Recursion.run(currentMap),
      baseline: () => Recursion.run(baselineMap),
    },
    {
      name: 'recursion/flatMap-suspended-128',
      workUnits: 128,
      current: () => Recursion.run(currentFlatMap),
      baseline: () => Recursion.run(baselineFlatMap),
    },
    {
      name: 'recursion/memoFix-cached-defined',
      workUnits: 1,
      current: () => currentMemo(21),
      baseline: () => baselineMemo(21),
    },
    {
      name: 'recursion/memoFix-cached-undefined',
      workUnits: 1,
      current: () => currentUndefined(21),
      baseline: () => baselineUndefined(21),
    },
    {
      name: 'match/discriminant-data-first',
      workUnits: 1,
      current: () => Match.discriminant('kind', handlers)(shape),
      baseline: () =>
        matchDiscriminantBefore('kind', shape, handlers),
    },
    {
      name: 'match/discriminant-curried',
      workUnits: 1,
      current: () => currentDiscriminant(shape),
      baseline: () => baselineDiscriminant(shape),
    },
    {
      name: 'match/tag-data-first',
      workUnits: 1,
      current: () => Match.tag(taggedHandlers)(tagged),
      baseline: () => matchTagBefore(tagged, taggedHandlers),
    },
    {
      name: 'match/tag-curried',
      workUnits: 1,
      current: () => currentTag(tagged),
      baseline: () => baselineTag(tagged),
    },
    {
      name: 'schema/map-sync-success',
      workUnits: 1,
      current: () => Schema.validateSync(currentSchema)(21),
      baseline: () => Schema.validateSync(baselineSchema)(21),
    },
    {
      name: 'writer/zip',
      workUnits: 1,
      current: () => currentZip([1, 4]),
      baseline: () => baselineZip([1, 4]),
    },
    {
      name: 'writer/sequence-128',
      workUnits: 128,
      current: () => currentSequence(writers),
      baseline: () => baselineSequence(writers),
    },
  ]
}

let currentMeasurementSink: unknown
let baselineMeasurementSink: unknown

const measureCase = (
  executable: ExecutableCase,
  args: ThirdWavePerfArgs,
): ThirdWavePerfCase => {
  const correctnessOk = semanticEqual(
    executable.current(),
    executable.baseline(),
  )
  const batchIterations = minimumThirdWaveBatchIterations(
    executable.workUnits,
    args,
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
        currentMeasurementSink = currentLast
        baselineMeasurementSink = baselineLast
      },
    },
  )
  return {
    name: executable.name,
    workUnits: executable.workUnits,
    correctnessOk,
    workerEngine: currentPerfEngine(),
    rounds: measured.pairedRatios.length,
    batchIterations,
    sampling: {
      ...measured.sampling,
      targetWorkUnitsPerMicroBatch:
        args.targetWorkUnitsPerMicroBatch,
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

export const parseThirdWavePerfArgs = (
  argv: readonly string[],
  engine = currentPerfEngine(),
): ThirdWavePerfArgs => {
  const policy = THIRD_WAVE_PERF_POLICIES[engine.id]
  let rounds: number = policy.minimumRounds
  let warmupRounds: number = policy.minimumWarmupRounds
  let minimumBatchWorkUnits: number =
    policy.minimumBatchWorkUnits
  let targetWorkUnitsPerMicroBatch: number =
    policy.targetWorkUnitsPerMicroBatch
  let quick = false
  let casesFilter: string | undefined
  let out: string | undefined
  let caseIndex: number | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--rounds') rounds = Number(argv[++index])
    else if (argument === '--warmup') {
      warmupRounds = Number(argv[++index])
    } else if (argument === '--batch-work') {
      minimumBatchWorkUnits = Number(argv[++index])
    } else if (argument === '--micro-batch-work') {
      targetWorkUnitsPerMicroBatch = Number(argv[++index])
    } else if (argument === '--quick') quick = true
    else if (argument === '--cases') casesFilter = argv[++index]
    else if (argument === '--out') out = argv[++index]
    else if (argument === '--case-index') {
      caseIndex = Number(argv[++index])
    } else {
      throw new Error(`unknown third-wave perf argument: ${argument}`)
    }
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
  if (
    caseIndex !== undefined &&
    (!Number.isSafeInteger(caseIndex) || caseIndex < 0)
  ) {
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
  args: ThirdWavePerfArgs,
): readonly ExecutableCase[] =>
  args.casesFilter
    ? cases.filter((item) =>
        item.name.includes(args.casesFilter as string),
      )
    : cases

const workerArguments = (
  engine: PerfEngine,
  args: ThirdWavePerfArgs,
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
  args: ThirdWavePerfArgs,
  engine: PerfEngine,
): WorkerOutcome => {
  const worker = spawnSync(
    process.execPath,
    workerArguments(engine, args, caseIndex),
    { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 },
  )
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
    const outcome = JSON.parse(
      marker.slice(WORKER_MARKER.length),
    ) as WorkerOutcome
    if (!outcome.ok) return outcome
    if (worker.status !== 0 || worker.signal !== null) {
      return {
        ok: false,
        reason: `worker exited with status ${String(worker.status)} and signal ${String(worker.signal)}`,
      }
    }
    if (
      outcome.result.name !== executable.name ||
      !sameEngine(outcome.result.workerEngine, engine)
    ) {
      return {
        ok: false,
        reason: 'worker case or runtime identity mismatch',
      }
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
  for (const relativePath of EXPECTED_THIRD_WAVE_SUBJECT_FILES) {
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
    `third-wave-${engine.id}.json`,
  )

export const runThirdWavePerf = async (
  args: ThirdWavePerfArgs,
): Promise<{
  readonly report: ThirdWavePerfReport
  readonly outputPath: string
}> => {
  if (args.caseIndex !== undefined) {
    throw new Error('third-wave coordinator cannot run in worker mode')
  }
  const engine = currentPerfEngine()
  const allCases = buildCases()
  const selected = selectCases(allCases, args)
  const results: ThirdWavePerfCase[] = []
  const skipped: string[] = []
  for (let index = 0; index < selected.length; index += 1) {
    const executable = selected[index]!
    const outcome = runWorker(executable, index, args, engine)
    if (outcome.ok) results.push(outcome.result)
    else skipped.push(`${executable.name}: ${outcome.reason}`)
  }
  const projection = allCases.map(({ name, workUnits }) => ({
    name,
    workUnits,
  }))
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
  const report: ThirdWavePerfReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    engine,
    subject: {
      id: EXPECTED_THIRD_WAVE_SUBJECT_ID,
      files: EXPECTED_THIRD_WAVE_SUBJECT_FILES,
      sha256: await sourceSha256(),
    },
    baseline: {
      id: EXPECTED_THIRD_WAVE_BASELINE.id,
      sha256: sha256(
        await readFile(new URL('./third-wave-before.ts', import.meta.url)),
      ),
    },
    coverage: {
      caseCount: allCases.length,
      caseNamesSha256: jsonSha256(
        allCases.map((item) => item.name),
      ),
      projectionSha256: jsonSha256(projection),
    },
    args: {
      rounds: args.rounds,
      warmupRounds: args.warmupRounds,
      minimumBatchWorkUnits: args.minimumBatchWorkUnits,
      targetWorkUnitsPerMicroBatch:
        args.targetWorkUnitsPerMicroBatch,
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
  console.log(
    `\nThird-wave raw report (${engine.name}; baselineNs / currentNs)\n`,
  )
  for (const item of results) {
    console.log(
      [
        item.name,
        `median=${item.medianRatio.toFixed(3)}`,
        `CI=[${item.ciLow.toFixed(3)},${item.ciHigh.toFixed(3)}]`,
        `RME=${item.relativeMarginOfError.toFixed(2)}%`,
        item.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(`raw report: ${outputPath}`)
  void currentMeasurementSink
  void baselineMeasurementSink
  return { report, outputPath }
}

const runWorkerMain = (args: ThirdWavePerfArgs): void => {
  const cases = selectCases(buildCases(), args)
  const executable = cases[args.caseIndex as number]
  if (!executable) {
    console.log(
      `${WORKER_MARKER}${JSON.stringify({
        ok: false,
        reason: 'case index out of range',
      } satisfies WorkerFailure)}`,
    )
    process.exitCode = 1
    return
  }
  try {
    const result = measureCase(executable, args)
    console.log(
      `${WORKER_MARKER}${JSON.stringify({
        ok: true,
        result,
      } satisfies WorkerSuccess)}`,
    )
  } catch (error) {
    console.log(
      `${WORKER_MARKER}${JSON.stringify({
        ok: false,
        reason: (error as Error).message,
      } satisfies WorkerFailure)}`,
    )
    process.exitCode = 1
  }
}

const main = async (): Promise<void> => {
  const args = parseThirdWavePerfArgs(process.argv.slice(2))
  if (args.caseIndex !== undefined) {
    runWorkerMain(args)
    return
  }
  const { report } = await runThirdWavePerf(args)
  if (!report.summary.complete || !report.summary.allCorrect) {
    process.exitCode = 1
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
