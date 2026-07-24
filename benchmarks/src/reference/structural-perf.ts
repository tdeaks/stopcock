import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as NEA from '../../../packages/fp/src/non-empty-array'
import * as Obj from '../../../packages/fp/src/object'
import * as Optic from '../../../packages/fp/src/optic'
import * as Ord from '../../../packages/fp/src/ord'
import {
  neaChunksOfBefore,
  neaFromIterableBefore,
  neaMaxBefore,
  neaMinBefore,
  neaUnsafeFromReadonlyArrayBefore,
  neaZipBefore,
  objectEntriesBefore,
  objectGetPathOrUndefinedBefore,
  objectOmitByBefore,
  objectValuesBefore,
  opticCollectLensBefore,
  opticComposeCollectBefore,
  opticSetLensBefore,
  opticViewLensBefore,
  ordSortBefore,
} from './structural-before'
import {
  EXPECTED_STRUCTURAL_BASELINE,
  EXPECTED_STRUCTURAL_SUBJECT_FILES,
  EXPECTED_STRUCTURAL_SUBJECT_ID,
  minimumStructuralBatchIterations,
  STRUCTURAL_PERF_POLICIES,
} from './structural-perf-contract'
import { currentPerfEngine, type PerfEngine } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  geomean,
  runInterleavedPaired,
  type InterleavedPairedSampling,
} from './perf-runner'

const localDirectory = dirname(fileURLToPath(import.meta.url))
const WORKER_MARKER = 'STRUCTURAL_PERF_RESULT_JSON:'

interface ExecutableCase {
  readonly name: string
  readonly workUnits: number
  readonly current: () => unknown
  readonly baseline: () => unknown
}

export interface StructuralPerfCase {
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

export interface StructuralPerfArgs {
  readonly rounds: number
  readonly warmupRounds: number
  readonly minimumBatchWorkUnits: number
  readonly targetWorkUnitsPerMicroBatch: number
  readonly quick: boolean
  readonly casesFilter?: string
  readonly out?: string
  readonly caseIndex?: number
}

export interface StructuralPerfReport {
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
  readonly args: Omit<StructuralPerfArgs, 'caseIndex'>
  readonly summary: {
    readonly count: number
    readonly expectedCount: number
    readonly geomeanRatio: number
    readonly minRatio: number
    readonly maxRelativeMarginOfError: number
    readonly allCorrect: boolean
    readonly complete: boolean
  }
  readonly cases: readonly StructuralPerfCase[]
  readonly skipped: readonly string[]
}

interface WorkerSuccess {
  readonly ok: true
  readonly result: StructuralPerfCase
}

interface WorkerFailure {
  readonly ok: false
  readonly reason: string
}

type WorkerOutcome = WorkerSuccess | WorkerFailure

const sha256 = (contents: string | Uint8Array): string =>
  createHash('sha256').update(contents).digest('hex')

const jsonSha256 = (value: unknown): string => sha256(JSON.stringify(value))

const relativeMarginOfError = (
  low: number,
  high: number,
  median: number,
): number => ((high - low) / (2 * median)) * 100

const sameEngine = (left: PerfEngine, right: PerfEngine): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

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
      if (!semanticEqual(leftRecord[key], rightRecord[key])) return false
    }
    return true
  }
  return Object.is(left, right)
}

const buildCases = (): readonly ExecutableCase[] => {
  const object = Object.create(null) as Record<string, number>
  for (let index = 0; index < 128; index += 1) {
    object[`key${index}`] = index
  }
  const keepOdd = (value: number): boolean => (value & 1) === 1
  const nested = { a: { b: { c: { value: 42 } } } }
  const path = ['a', 'b', 'c', 'value'] as const

  const valueLens = Optic.lens(
    (source: { readonly value: number }) => source.value,
    (source, value: number) => ({ ...source, value }),
  )
  const lensSource = { value: 21, stable: true }
  const outerTraversal = Optic.each<readonly number[]>()
  const innerTraversal = Optic.each<number>()
  const composedTraversal = Optic.compose(outerTraversal, innerTraversal)
  const traversalSource = Array.from({ length: 128 }, (_, outer) =>
    Array.from({ length: 8 }, (_, inner) => outer * 8 + inner),
  )

  const sortable = Array.from({ length: 128 }, (_, index) => ({
    rank: index & 7,
    id: index,
  }))
  const byRank = Ord.contramap(
    (value: (typeof sortable)[number]) => value.rank,
  )(Ord.number)

  const values = Array.from({ length: 128 }, (_, index) => 127 - index)
  const nonEmptyValues =
    values as unknown as NEA.NonEmptyArray<number>
  const zipValues = Array.from({ length: 128 }, (_, index) =>
    String(index),
  ) as unknown as NEA.NonEmptyArray<string>
  const currentZip = NEA.zip(zipValues)
  const currentMin = NEA.min(Ord.number)
  const currentMax = NEA.max(Ord.number)
  const currentChunks = NEA.chunksOf(16)

  return [
    {
      name: 'object/values-128',
      workUnits: 128,
      current: () => Obj.values(object),
      baseline: () => objectValuesBefore(object),
    },
    {
      name: 'object/entries-128',
      workUnits: 128,
      current: () => Obj.entries(object),
      baseline: () => objectEntriesBefore(object),
    },
    {
      name: 'object/omitBy-128',
      workUnits: 128,
      current: () => Obj.omitBy(object, keepOdd),
      baseline: () => objectOmitByBefore(object, keepOdd),
    },
    {
      name: 'object/getPath-hit-depth-4',
      workUnits: 4,
      current: () => Obj.getPathOrUndefined(nested, path),
      baseline: () => objectGetPathOrUndefinedBefore(nested, path),
    },
    {
      name: 'optic/view-lens-data-first',
      workUnits: 1,
      current: () => Optic.view(valueLens, lensSource),
      baseline: () => opticViewLensBefore(valueLens, lensSource),
    },
    {
      name: 'optic/collect-lens-data-first',
      workUnits: 1,
      current: () => Optic.collect(valueLens, lensSource),
      baseline: () => opticCollectLensBefore(valueLens, lensSource),
    },
    {
      name: 'optic/set-lens-data-first',
      workUnits: 1,
      current: () => Optic.set(valueLens, lensSource, 42),
      baseline: () => opticSetLensBefore(valueLens, lensSource, 42),
    },
    {
      name: 'optic/compose-collect-128x8',
      workUnits: 1_024,
      current: () => Optic.collect(composedTraversal, traversalSource),
      baseline: () =>
        opticComposeCollectBefore(
          outerTraversal,
          innerTraversal,
          traversalSource,
        ),
    },
    {
      name: 'ord/sort-ties-128',
      workUnits: 128,
      current: () => Ord.sort(byRank, sortable),
      baseline: () => ordSortBefore(byRank, sortable),
    },
    {
      name: 'nea/fromIterable-128',
      workUnits: 128,
      current: () => NEA.fromIterable(values),
      baseline: () => neaFromIterableBefore(values),
    },
    {
      name: 'nea/unsafeFromReadonlyArray-128',
      workUnits: 128,
      current: () => NEA.unsafeFromReadonlyArray(values),
      baseline: () => neaUnsafeFromReadonlyArrayBefore(values),
    },
    {
      name: 'nea/zip-128',
      workUnits: 128,
      current: () => currentZip(nonEmptyValues),
      baseline: () => neaZipBefore(nonEmptyValues, zipValues),
    },
    {
      name: 'nea/min-128',
      workUnits: 128,
      current: () => currentMin(nonEmptyValues),
      baseline: () => neaMinBefore(Ord.number, nonEmptyValues),
    },
    {
      name: 'nea/max-128',
      workUnits: 128,
      current: () => currentMax(nonEmptyValues),
      baseline: () => neaMaxBefore(Ord.number, nonEmptyValues),
    },
    {
      name: 'nea/chunksOf-128',
      workUnits: 128,
      current: () => currentChunks(nonEmptyValues),
      baseline: () => neaChunksOfBefore(16, nonEmptyValues),
    },
  ]
}

let currentMeasurementSink: unknown
let baselineMeasurementSink: unknown

const measureCase = (
  executable: ExecutableCase,
  args: StructuralPerfArgs,
): StructuralPerfCase => {
  const correctnessOk = semanticEqual(
    executable.current(),
    executable.baseline(),
  )
  const batchIterations = minimumStructuralBatchIterations(
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

export const parseStructuralPerfArgs = (
  argv: readonly string[],
  engine = currentPerfEngine(),
): StructuralPerfArgs => {
  const policy = STRUCTURAL_PERF_POLICIES[engine.id]
  let rounds: number = policy.minimumRounds
  let warmupRounds: number = policy.minimumWarmupRounds
  let minimumBatchWorkUnits: number = policy.minimumBatchWorkUnits
  let targetWorkUnitsPerMicroBatch: number =
    policy.targetWorkUnitsPerMicroBatch
  let quick = false
  let casesFilter: string | undefined
  let out: string | undefined
  let caseIndex: number | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--rounds') rounds = Number(argv[++index])
    else if (argument === '--warmup') warmupRounds = Number(argv[++index])
    else if (argument === '--batch-work') {
      minimumBatchWorkUnits = Number(argv[++index])
    } else if (argument === '--micro-batch-work') {
      targetWorkUnitsPerMicroBatch = Number(argv[++index])
    } else if (argument === '--quick') quick = true
    else if (argument === '--cases') casesFilter = argv[++index]
    else if (argument === '--out') out = argv[++index]
    else if (argument === '--case-index') caseIndex = Number(argv[++index])
    else throw new Error(`unknown structural perf argument: ${argument}`)
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
  args: StructuralPerfArgs,
): readonly ExecutableCase[] =>
  args.casesFilter
    ? cases.filter((item) => item.name.includes(args.casesFilter as string))
    : cases

const workerArguments = (
  engine: PerfEngine,
  args: StructuralPerfArgs,
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
  args: StructuralPerfArgs,
  engine: PerfEngine,
): WorkerOutcome => {
  const worker = spawnSync(
    process.execPath,
    workerArguments(engine, args, caseIndex),
    {
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
    },
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
    if (outcome.result.name !== executable.name) {
      return {
        ok: false,
        reason: `worker returned ${outcome.result.name} instead of ${executable.name}`,
      }
    }
    if (!sameEngine(outcome.result.workerEngine, engine)) {
      return {
        ok: false,
        reason: 'worker runtime identity does not match coordinator',
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
  for (const relativePath of EXPECTED_STRUCTURAL_SUBJECT_FILES) {
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
    `structural-${engine.id}.json`,
  )

export const runStructuralPerf = async (
  args: StructuralPerfArgs,
): Promise<{
  readonly report: StructuralPerfReport
  readonly outputPath: string
}> => {
  if (args.caseIndex !== undefined) {
    throw new Error('structural coordinator cannot run in worker mode')
  }
  const engine = currentPerfEngine()
  const allCases = buildCases()
  const selected = selectCases(allCases, args)
  const results: StructuralPerfCase[] = []
  const skipped: string[] = []
  for (let index = 0; index < selected.length; index += 1) {
    const outcome = runWorker(selected[index]!, index, args, engine)
    if (outcome.ok) results.push(outcome.result)
    else skipped.push(`${selected[index]!.name}: ${outcome.reason}`)
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
  const report: StructuralPerfReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    engine,
    subject: {
      id: EXPECTED_STRUCTURAL_SUBJECT_ID,
      files: EXPECTED_STRUCTURAL_SUBJECT_FILES,
      sha256: await sourceSha256(),
    },
    baseline: {
      id: EXPECTED_STRUCTURAL_BASELINE.id,
      sha256: sha256(
        await readFile(new URL('./structural-before.ts', import.meta.url)),
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
  console.log(
    `\nStructural raw report (${engine.name}; baselineNs / currentNs)\n`,
  )
  console.log(
    ['case', 'work', 'batch', 'n', 'median', 'CI95', 'RME', 'correct'].join(
      '\t',
    ),
  )
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
  console.log(`raw report: ${outputPath}`)
  void currentMeasurementSink
  void baselineMeasurementSink
  return { report, outputPath }
}

const runWorkerMain = (args: StructuralPerfArgs): void => {
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
  const args = parseStructuralPerfArgs(process.argv.slice(2))
  if (args.caseIndex !== undefined) {
    runWorkerMain(args)
    return
  }
  const { report } = await runStructuralPerf(args)
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
