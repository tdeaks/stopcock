import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compose, curry } from '../../../packages/fp/src/function'
import * as MapOps from '../../../packages/fp/src/map'
import * as Option from '../../../packages/fp/src/option'
import * as RecordOps from '../../../packages/fp/src/record'
import * as Result from '../../../packages/fp/src/result'
import * as SetOps from '../../../packages/fp/src/set'
import {
  composeBefore,
  curryBefore,
  mapGetBefore,
  optionMapBefore,
  recordOmitBefore,
  resultLiftThrowableBefore,
  resultMapBefore,
  setIntersectionBefore,
  setIsDisjointBefore,
} from './core-utilities-before'
import {
  CORE_UTILITIES_PERF_POLICIES,
  EXPECTED_CORE_UTILITIES_BASELINE,
  EXPECTED_CORE_UTILITIES_SUBJECT_FILES,
  EXPECTED_CORE_UTILITIES_SUBJECT_ID,
  minimumCoreUtilitiesBatchIterations,
} from './core-utilities-perf-contract'
import { currentPerfEngine, type PerfEngine } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  geomean,
  runInterleavedPaired,
  type InterleavedPairedSampling,
} from './perf-runner'

const localDirectory = dirname(fileURLToPath(import.meta.url))
const WORKER_MARKER = 'CORE_UTILITIES_PERF_RESULT_JSON:'

interface ExecutableCase {
  readonly name: string
  readonly workUnits: number
  readonly current: () => unknown
  readonly baseline: () => unknown
}

export interface CoreUtilitiesPerfCase {
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

export interface CoreUtilitiesPerfArgs {
  readonly rounds: number
  readonly warmupRounds: number
  readonly minimumBatchWorkUnits: number
  readonly targetWorkUnitsPerMicroBatch: number
  readonly quick: boolean
  readonly casesFilter?: string
  readonly out?: string
  readonly caseIndex?: number
}

export interface CoreUtilitiesPerfReport {
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
  readonly args: Omit<CoreUtilitiesPerfArgs, 'caseIndex'>
  readonly summary: {
    readonly count: number
    readonly expectedCount: number
    readonly geomeanRatio: number
    readonly minRatio: number
    readonly maxRelativeMarginOfError: number
    readonly allCorrect: boolean
    readonly complete: boolean
  }
  readonly cases: readonly CoreUtilitiesPerfCase[]
  readonly skipped: readonly string[]
}

interface WorkerSuccess {
  readonly ok: true
  readonly result: CoreUtilitiesPerfCase
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
    if (Number.isNaN(left) && Number.isNaN(right)) return true
    return Object.is(left, right)
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index++) {
      if (!semanticEqual(left[index], right[index])) return false
    }
    return true
  }
  if (left instanceof Set && right instanceof Set) {
    if (left.size !== right.size) return false
    const leftValues = [...left]
    const rightValues = [...right]
    return semanticEqual(leftValues, rightValues)
  }
  if (left instanceof Map && right instanceof Map) {
    if (left.size !== right.size) return false
    return semanticEqual([...left], [...right])
  }
  if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object') {
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
  const increment = (value: number): number => value + 1
  const double = (value: number): number => value * 2
  const negate = (value: number): number => -value
  const decrement = (value: number): number => value - 1
  const square = (value: number): number => value * value

  const currentCompose1 = compose(increment)
  const baselineCompose1 = composeBefore(increment)
  const currentCompose2 = compose(increment, double)
  const baselineCompose2 = composeBefore(increment, double)
  const currentCompose4 = compose(increment, double, negate, decrement)
  const baselineCompose4 = composeBefore(increment, double, negate, decrement)
  const currentCompose5 = compose(increment, double, negate, decrement, square)
  const baselineCompose5 = composeBefore(increment, double, negate, decrement, square)

  const add2 = (a: number, b: number): number => a + b
  const add4 = (a: number, b: number, c: number, d: number): number => a + b + c + d
  const add5 = (a: number, b: number, c: number, d: number, e: number): number => a + b + c + d + e
  const currentCurry2 = curry(add2)
  const baselineCurry2 = curryBefore(add2 as (...args: readonly unknown[]) => number) as (
    a: number,
  ) => (b: number) => number
  const currentCurry4 = curry(add4)
  const baselineCurry4 = curryBefore(add4 as (...args: readonly unknown[]) => number) as (
    a: number,
  ) => (b: number) => (c: number) => (d: number) => number
  const currentCurry5 = curry(add5)
  const baselineCurry5 = curryBefore(add5 as (...args: readonly unknown[]) => number) as (
    a: number,
  ) => (b: number) => (c: number) => (d: number) => (e: number) => number

  const presentOption = Option.some(21)
  const missingOption = Option.none
  const okResult = Result.ok(21)
  const errResult = Result.err('failure')
  const liftedCurrent = Result.liftThrowable(add2)
  const liftedBaseline = resultLiftThrowableBefore(add2)

  const presentMap = new Map<string, number | undefined>([
    ['present', 21],
    ['undefined', undefined],
  ])
  const leftSet = new Set(Array.from({ length: 128 }, (_, index) => index))
  const rightSet = new Set(Array.from({ length: 128 }, (_, index) => index + 64))
  const disjointSet = new Set(Array.from({ length: 128 }, (_, index) => index + 256))
  const record = RecordOps.fromEntries(
    Array.from({ length: 128 }, (_, index) => [`key${index}`, index] as const),
  )
  const omitted = Array.from({ length: 32 }, (_, index) => `key${index * 2}`)

  return [
    {
      name: 'compose/arity-1',
      workUnits: 1,
      current: () => currentCompose1(7),
      baseline: () => baselineCompose1(7),
    },
    {
      name: 'compose/arity-2',
      workUnits: 1,
      current: () => currentCompose2(7),
      baseline: () => baselineCompose2(7),
    },
    {
      name: 'compose/arity-4',
      workUnits: 1,
      current: () => currentCompose4(7),
      baseline: () => baselineCompose4(7),
    },
    {
      name: 'compose/fallback-5',
      workUnits: 1,
      current: () => currentCompose5(7),
      baseline: () => baselineCompose5(7),
    },
    {
      name: 'curry/arity-2',
      workUnits: 1,
      current: () => currentCurry2(1)(2),
      baseline: () => baselineCurry2(1)(2),
    },
    {
      name: 'curry/arity-4',
      workUnits: 1,
      current: () => currentCurry4(1)(2)(3)(4),
      baseline: () => baselineCurry4(1)(2)(3)(4),
    },
    {
      name: 'curry/fallback-5',
      workUnits: 1,
      current: () => currentCurry5(1)(2)(3)(4)(5),
      baseline: () => baselineCurry5(1)(2)(3)(4)(5),
    },
    {
      name: 'option/map-some',
      workUnits: 1,
      current: () => Option.map(presentOption, increment),
      baseline: () => optionMapBefore(presentOption, increment),
    },
    {
      name: 'option/map-none',
      workUnits: 1,
      current: () => Option.map(missingOption, increment),
      baseline: () => optionMapBefore(missingOption, increment),
    },
    {
      name: 'result/map-ok',
      workUnits: 1,
      current: () => Result.map(okResult, increment),
      baseline: () => resultMapBefore(okResult, increment),
    },
    {
      name: 'result/map-err',
      workUnits: 1,
      current: () => Result.map(errResult, increment),
      baseline: () => resultMapBefore(errResult, increment),
    },
    {
      name: 'result/liftThrowable-ok',
      workUnits: 1,
      current: () => liftedCurrent(1, 2),
      baseline: () => liftedBaseline(1, 2),
    },
    {
      name: 'map/get-present',
      workUnits: 1,
      current: () => MapOps.get(presentMap, 'present'),
      baseline: () => mapGetBefore(presentMap, 'present'),
    },
    {
      name: 'map/get-present-undefined',
      workUnits: 1,
      current: () => MapOps.get(presentMap, 'undefined'),
      baseline: () => mapGetBefore(presentMap, 'undefined'),
    },
    {
      name: 'map/get-missing',
      workUnits: 1,
      current: () => MapOps.get(presentMap, 'missing'),
      baseline: () => mapGetBefore(presentMap, 'missing'),
    },
    {
      name: 'set/intersection-128',
      workUnits: 128,
      current: () => SetOps.intersection(leftSet, rightSet),
      baseline: () => setIntersectionBefore(leftSet, rightSet),
    },
    {
      name: 'set/isDisjoint-128',
      workUnits: 128,
      current: () => SetOps.isDisjoint(leftSet, disjointSet),
      baseline: () => setIsDisjointBefore(leftSet, disjointSet),
    },
    {
      name: 'record/omit-128',
      workUnits: 128,
      current: () => RecordOps.omit(record, omitted),
      baseline: () => recordOmitBefore(record, omitted),
    },
  ]
}

let currentMeasurementSink: unknown
let baselineMeasurementSink: unknown

const measureCase = (
  executable: ExecutableCase,
  args: CoreUtilitiesPerfArgs,
): CoreUtilitiesPerfCase => {
  const correctnessOk = semanticEqual(executable.current(), executable.baseline())
  const batchIterations = minimumCoreUtilitiesBatchIterations(executable.workUnits, args)
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
      currentMeasurementSink = currentLast
      baselineMeasurementSink = baselineLast
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

export const parseCoreUtilitiesPerfArgs = (
  argv: readonly string[],
  engine = currentPerfEngine(),
): CoreUtilitiesPerfArgs => {
  const policy = CORE_UTILITIES_PERF_POLICIES[engine.id]
  let rounds: number = policy.minimumRounds
  let warmupRounds: number = policy.minimumWarmupRounds
  let minimumBatchWorkUnits: number = policy.minimumBatchWorkUnits
  let targetWorkUnitsPerMicroBatch: number = policy.targetWorkUnitsPerMicroBatch
  let quick = false
  let casesFilter: string | undefined
  let out: string | undefined
  let caseIndex: number | undefined
  for (let index = 0; index < argv.length; index++) {
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
    else throw new Error(`unknown core-utilities perf argument: ${argument}`)
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
  args: CoreUtilitiesPerfArgs,
): readonly ExecutableCase[] =>
  args.casesFilter ? cases.filter((item) => item.name.includes(args.casesFilter as string)) : cases

const workerArguments = (
  engine: PerfEngine,
  args: CoreUtilitiesPerfArgs,
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
  return engine.id === 'bun-jsc' ? ['run', ...benchmarkArgs] : ['--import=tsx', ...benchmarkArgs]
}

const runWorker = (
  executable: ExecutableCase,
  caseIndex: number,
  args: CoreUtilitiesPerfArgs,
  engine: PerfEngine,
): WorkerOutcome => {
  const worker = spawnSync(process.execPath, workerArguments(engine, args, caseIndex), {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  })
  const marker = (worker.stdout ?? '').split('\n').find((line) => line.startsWith(WORKER_MARKER))
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
    return { ok: false, reason: `worker result was invalid JSON: ${(error as Error).message}` }
  }
}

const sourceSha256 = async (): Promise<string> => {
  const root = resolve(localDirectory, '..', '..', '..')
  const hash = createHash('sha256')
  for (const relativePath of EXPECTED_CORE_UTILITIES_SUBJECT_FILES) {
    hash.update(relativePath)
    hash.update('\0')
    hash.update(await readFile(join(root, relativePath)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

const defaultOutputPath = (engine: PerfEngine): string =>
  join(
    resolve(process.env.PERF_ARTIFACT_DIR ?? join(localDirectory, '..', '..', 'reports')),
    `core-utilities-${engine.id}.json`,
  )

export const runCoreUtilitiesPerf = async (
  args: CoreUtilitiesPerfArgs,
): Promise<{ readonly report: CoreUtilitiesPerfReport; readonly outputPath: string }> => {
  if (args.caseIndex !== undefined) {
    throw new Error('core-utilities coordinator cannot run in worker mode')
  }
  const engine = currentPerfEngine()
  const allCases = buildCases()
  const selected = selectCases(allCases, args)
  const results: CoreUtilitiesPerfCase[] = []
  const skipped: string[] = []
  for (let index = 0; index < selected.length; index++) {
    const outcome = runWorker(selected[index], index, args, engine)
    if (outcome.ok) results.push(outcome.result)
    else skipped.push(`${selected[index].name}: ${outcome.reason}`)
  }
  const actualProjection = allCases.map(({ name, workUnits }) => ({
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
  const report: CoreUtilitiesPerfReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    engine,
    subject: {
      id: EXPECTED_CORE_UTILITIES_SUBJECT_ID,
      files: EXPECTED_CORE_UTILITIES_SUBJECT_FILES,
      sha256: await sourceSha256(),
    },
    baseline: {
      id: EXPECTED_CORE_UTILITIES_BASELINE.id,
      sha256: sha256(await readFile(new URL('./core-utilities-before.ts', import.meta.url))),
    },
    coverage: {
      caseCount: allCases.length,
      caseNamesSha256: jsonSha256(allCases.map((item) => item.name)),
      projectionSha256: jsonSha256(actualProjection),
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
  console.log(`\nCore utilities raw report (${engine.name}; baselineNs / currentNs)\n`)
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

const runWorkerMain = (args: CoreUtilitiesPerfArgs): void => {
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
    console.log(`${WORKER_MARKER}${JSON.stringify({ ok: true, result } satisfies WorkerSuccess)}`)
  } catch (error) {
    console.log(
      `${WORKER_MARKER}${JSON.stringify({ ok: false, reason: (error as Error).message } satisfies WorkerFailure)}`,
    )
    process.exitCode = 1
  }
}

const main = async (): Promise<void> => {
  const args = parseCoreUtilitiesPerfArgs(process.argv.slice(2))
  if (args.caseIndex !== undefined) {
    runWorkerMain(args)
    return
  }
  const { report } = await runCoreUtilitiesPerf(args)
  if (!report.summary.complete || !report.summary.allCorrect) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
