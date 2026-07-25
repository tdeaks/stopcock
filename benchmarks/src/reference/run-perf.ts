// Portable-runtime corpus benchmark. Each seeded pipeline runs through the
// public compile() API and the frozen reference emitter with paired,
// allocation-free AB/BA micro-batch sampling. There are no runtime tiers or
// runtime code generation states in fp 2.0, but host-engine optimization
// tiers are deliberately warmed and sampled.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile, type Runner } from '../../../packages/fp-optimizer/src/compile'
import { compileEmittedPipeline, FROZEN_EMITTER_ID, type PipelineDesc } from './emitter'
import { generateInputArray, resolvePipeline, type SerializedStep } from './generate'
import { currentPerfEngine, type PerfEngine } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  geomean,
  runInterleavedPaired,
  type InterleavedPairedSampling,
} from './perf-runner'
import {
  EXPECTED_PORTABLE_SUBJECT,
  minimumPortableBatchIterations,
} from './portable-perf-contract'

const localDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(localDirectory, '..', '..', '..')

export const PORTABLE_PERF_WORKER_MARKER = 'PORTABLE_PERF_RESULT_JSON:'

interface PerfCaseFile {
  readonly name: string
  readonly strata: Record<string, unknown>
  readonly inputSeed: number
  readonly size: number
  readonly steps: readonly SerializedStep[]
}

interface Args {
  readonly casesFilter?: string
  readonly rounds: number
  readonly quick: boolean
  readonly out?: string
  readonly corpusPath: string
  readonly minimumBatchInputItems: number
  readonly warmupRounds: number
  readonly caseIndex?: number
}

const parseArgs = (argv: readonly string[]): Args => {
  let rounds = 40
  let quick = false
  let casesFilter: string | undefined
  let out: string | undefined
  let corpusPath = join(localDirectory, 'perf-corpus.json')
  let minimumBatchInputItems = 100_000
  let warmupRounds = 10
  let caseIndex: number | undefined

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--cases') casesFilter = argv[++index]
    else if (argument === '--rounds') rounds = Number(argv[++index])
    else if (argument === '--quick') quick = true
    else if (argument === '--out') out = argv[++index]
    else if (argument === '--corpus') corpusPath = argv[++index]
    else if (argument === '--batch-inputs') minimumBatchInputItems = Number(argv[++index])
    else if (argument === '--warmup') warmupRounds = Number(argv[++index])
    else if (argument === '--case-index') caseIndex = Number(argv[++index])
  }
  if (
    caseIndex !== undefined &&
    (!Number.isSafeInteger(caseIndex) || caseIndex < 0)
  ) {
    throw new Error('--case-index must be a non-negative integer')
  }
  for (const [flag, value] of [
    ['--rounds', rounds],
    ['--batch-inputs', minimumBatchInputItems],
    ['--warmup', warmupRounds],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${flag} must be a positive integer`)
    }
  }
  if (quick) rounds = Math.min(rounds, 8)
  return {
    casesFilter,
    rounds,
    quick,
    out,
    corpusPath,
    minimumBatchInputItems,
    warmupRounds,
    caseIndex,
  }
}

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
  if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Record<PropertyKey, unknown>
    const rightRecord = right as Record<PropertyKey, unknown>
    const leftKeys = Reflect.ownKeys(leftRecord)
    const rightKeys = Reflect.ownKeys(rightRecord)
    if (leftKeys.length !== rightKeys.length) return false
    for (const key of leftKeys) {
      if (
        !Object.prototype.hasOwnProperty.call(rightRecord, key) ||
        !semanticEqual(leftRecord[key], rightRecord[key])
      ) {
        return false
      }
    }
    return true
  }
  return Object.is(left, right)
}

export interface PortableWorkerCaseReport {
  readonly name: string
  readonly strata: Record<string, unknown>
  readonly inputSize: number
  readonly consumedInputItems: number
  readonly correctnessOk: boolean
  readonly workerEngine: PerfEngine
  readonly rounds: number
  readonly batchIterations: number
  readonly sampling: InterleavedPairedSampling & {
    readonly targetConsumedItemsPerMicroBatch: number
    readonly nominalConsumedItemsPerMicroBatch: number
  }
  readonly medianRatio: number
  readonly meanRatio: number
  readonly ciLow: number
  readonly ciHigh: number
  readonly signTestP: number
  readonly relativeMarginOfError: number
  /** Raw paired samples are retained so noisy or bimodal rows are auditable. */
  readonly stopcockSamplesNs: readonly number[]
  readonly referenceSamplesNs: readonly number[]
  readonly pairedRatios: readonly number[]
}

interface WorkerSuccess {
  readonly ok: true
  readonly workerCaseIndex: number
  readonly workerCaseName: string
  readonly workerCaseSha256: string
  readonly workerEngine: PerfEngine
  readonly result: PortableWorkerCaseReport
}

interface WorkerFailure {
  readonly ok: false
  readonly reason: string
}

type WorkerOutcome = WorkerSuccess | WorkerFailure

interface ExpectedWorkerIdentity {
  readonly caseIndex: number
  readonly caseName: string
  readonly caseSha256: string
  readonly inputSize: number
  readonly engine: PerfEngine
}

const format = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(3) : String(value)

const sha256 = (contents: string | Uint8Array): string =>
  createHash('sha256').update(contents).digest('hex')

const jsonSha256 = (value: unknown): string => sha256(JSON.stringify(value))

const sameEngine = (left: PerfEngine, right: PerfEngine): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

export const parsePortablePerfWorkerOutput = (
  stdout: string,
  status: number | null,
  signal: string | null,
  expected: ExpectedWorkerIdentity,
): WorkerOutcome => {
  const markers = stdout
    .split('\n')
    .filter((line) => line.startsWith(PORTABLE_PERF_WORKER_MARKER))
  if (markers.length !== 1) {
    return {
      ok: false,
      reason:
        markers.length === 0
          ? `worker produced no result (status ${String(status)}, signal ${String(signal)})`
          : `worker produced ${markers.length} result markers`,
    }
  }
  try {
    const parsed = JSON.parse(
      (markers[0] as string).slice(PORTABLE_PERF_WORKER_MARKER.length),
    ) as unknown
    if (parsed === null || typeof parsed !== 'object' || !('ok' in parsed)) {
      return { ok: false, reason: 'worker result has an invalid envelope' }
    }
    if ((parsed as { readonly ok?: unknown }).ok === false) {
      const reason = (parsed as { readonly reason?: unknown }).reason
      return {
        ok: false,
        reason: typeof reason === 'string' ? reason : 'worker returned an invalid failure',
      }
    }
    if ((parsed as { readonly ok?: unknown }).ok !== true) {
      return { ok: false, reason: 'worker result has an invalid success discriminator' }
    }
    const outcome = parsed as WorkerSuccess
    if (status !== 0 || signal !== null) {
      return {
        ok: false,
        reason: `worker exited with status ${String(status)} and signal ${String(signal)}`,
      }
    }
    if (
      outcome.workerCaseIndex !== expected.caseIndex ||
      outcome.workerCaseName !== expected.caseName ||
      outcome.workerCaseSha256 !== expected.caseSha256
    ) {
      return {
        ok: false,
        reason: `worker case identity does not match ${expected.caseIndex}:${expected.caseName}`,
      }
    }
    if (!sameEngine(outcome.workerEngine, expected.engine)) {
      return { ok: false, reason: 'worker runtime identity does not match coordinator' }
    }
    const result = outcome.result
    if (
      result === null ||
      typeof result !== 'object' ||
      result.name !== expected.caseName ||
      result.inputSize !== expected.inputSize
    ) {
      return { ok: false, reason: 'worker result does not match requested case' }
    }
    if (!sameEngine(result.workerEngine, expected.engine)) {
      return { ok: false, reason: 'worker result runtime identity does not match coordinator' }
    }
    return outcome
  } catch (error) {
    return { ok: false, reason: `worker result was invalid JSON: ${(error as Error).message}` }
  }
}

const relativeMarginOfError = (low: number, high: number, median: number): number =>
  ((high - low) / (2 * median)) * 100

let stopcockMeasurementSink: unknown
let referenceMeasurementSink: unknown

const consumedSourceItems = (
  run: (input: unknown) => unknown,
  input: readonly unknown[],
  strata: Readonly<Record<string, unknown>>,
): number => {
  if (strata.sinkKind !== 'short-circuit' || strata.boundary !== 'none') {
    return input.length
  }
  let consumed = 0
  const observed = new Proxy(input, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^(?:0|[1-9]\d*)$/u.test(key) && Number(key) < target.length) {
        consumed++
      }
      return Reflect.get(target, key, receiver)
    },
  })
  run(observed)
  return Math.max(1, consumed)
}

const measureCase = (
  item: PerfCaseFile,
  args: Args,
  engine: PerfEngine,
): PortableWorkerCaseReport => {
  const input = generateInputArray(item.inputSeed, item.size)
  const resolved = resolvePipeline({ input, steps: item.steps })
  const reference = compileEmittedPipeline(resolved.desc as PipelineDesc)
  const runner = compile(...(resolved.realSteps as readonly Runner[]))
  const referenceRun = (): unknown => reference(resolved.input, resolved.bindings)
  const stopcockRun = (): unknown => runner(resolved.input)
  const correctnessOk = semanticEqual(stopcockRun(), referenceRun())
  const consumedInputItems = consumedSourceItems(
    (observedInput) => reference(observedInput, resolved.bindings),
    resolved.input as readonly unknown[],
    item.strata,
  )
  const batchIterations = minimumPortableBatchIterations(consumedInputItems, args)
  const targetConsumedItemsPerMicroBatch = 10_000
  const microBatchIterations = consumedItemsMicroBatchIterations(
    consumedInputItems,
    batchIterations,
    targetConsumedItemsPerMicroBatch,
  )
  const measured = runInterleavedPaired(stopcockRun, referenceRun, {
    rounds: args.rounds,
    warmupRounds: args.warmupRounds,
    batchIterations,
    microBatchIterations,
    observe: (stopcockLast, referenceLast) => {
      stopcockMeasurementSink = stopcockLast
      referenceMeasurementSink = referenceLast
    },
  })
  return {
    name: item.name,
    strata: item.strata,
    inputSize: item.size,
    consumedInputItems,
    correctnessOk,
    workerEngine: engine,
    rounds: measured.pairedRatios.length,
    batchIterations,
    sampling: {
      ...measured.sampling,
      targetConsumedItemsPerMicroBatch,
      nominalConsumedItemsPerMicroBatch: microBatchIterations * consumedInputItems,
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
    stopcockSamplesNs: measured.aSamples,
    referenceSamplesNs: measured.bSamples,
    pairedRatios: measured.pairedRatios,
  }
}

const workerArguments = (
  engine: PerfEngine,
  caseIndex: number,
  args: Args,
): readonly string[] => {
  const benchmarkArguments = [
    fileURLToPath(import.meta.url),
    '--case-index',
    String(caseIndex),
    '--rounds',
    String(args.rounds),
    '--batch-inputs',
    String(args.minimumBatchInputItems),
    '--warmup',
    String(args.warmupRounds),
    '--corpus',
    args.corpusPath,
  ]
  return engine.id === 'bun-jsc'
    ? ['run', ...benchmarkArguments]
    : ['--import=tsx', ...benchmarkArguments]
}

const runWorker = (
  item: PerfCaseFile,
  caseIndex: number,
  args: Args,
  engine: PerfEngine,
): WorkerOutcome => {
  const worker = spawnSync(process.execPath, workerArguments(engine, caseIndex, args), {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  })
  const parsed = parsePortablePerfWorkerOutput(
    worker.stdout ?? '',
    worker.status,
    worker.signal,
    {
      caseIndex,
      caseName: item.name,
      caseSha256: jsonSha256(item),
      inputSize: item.size,
      engine,
    },
  )
  if (!parsed.ok && (worker.stderr ?? '').length > 0) {
    return {
      ok: false,
      reason: `${parsed.reason}; stderr: ${(worker.stderr ?? '').slice(0, 500)}`,
    }
  }
  return parsed
}

const subjectSha256 = async (): Promise<string> => {
  const hash = createHash('sha256')
  for (const relativePath of EXPECTED_PORTABLE_SUBJECT.files) {
    hash.update(relativePath)
    hash.update('\0')
    hash.update(await readFile(join(repositoryRoot, relativePath)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2))
  const engine = currentPerfEngine()
  const corpusRaw = await readFile(args.corpusPath)
  const corpus = JSON.parse(corpusRaw.toString('utf8')) as {
    readonly id: string
    readonly version: number
    readonly comment: string
    readonly cases: readonly PerfCaseFile[]
  }
  const emitterPath = fileURLToPath(new URL('./emitter.ts', import.meta.url))
  const emitterSha256 = sha256(await readFile(emitterPath))
  if (args.caseIndex !== undefined) {
    const item = corpus.cases[args.caseIndex]
    let outcome: WorkerOutcome
    if (!item) {
      outcome = {
        ok: false,
        reason: `unknown portable corpus case index ${args.caseIndex}`,
      }
      process.exitCode = 1
    } else {
      try {
        const result = measureCase(item, args, engine)
        outcome = {
          ok: true,
          workerCaseIndex: args.caseIndex,
          workerCaseName: item.name,
          workerCaseSha256: jsonSha256(item),
          workerEngine: engine,
          result,
        }
      } catch (error) {
        outcome = { ok: false, reason: (error as Error).message }
        process.exitCode = 1
      }
    }
    console.log(`${PORTABLE_PERF_WORKER_MARKER}${JSON.stringify(outcome)}`)
    return
  }

  let cases = corpus.cases.map((item, caseIndex) => ({ item, caseIndex }))
  if (args.casesFilter) {
    cases = cases.filter(({ item }) => item.name.includes(args.casesFilter as string))
  }
  if (args.quick) cases = cases.filter(({ item }) => item.size <= 10_000)

  const reports: PortableWorkerCaseReport[] = []
  const skipped: string[] = []

  for (const { item, caseIndex } of cases) {
    const outcome = runWorker(item, caseIndex, args, engine)
    if (outcome.ok) reports.push(outcome.result)
    else skipped.push(`${item.name}: ${outcome.reason}`)
  }

  const ratios = reports.map((report) => report.medianRatio)
  const summary = {
    count: reports.length,
    expectedCount: cases.length,
    geomeanRatio: geomean(ratios),
    minRatio: Math.min(...ratios, Infinity),
    maxRelativeMarginOfError: Math.max(
      ...reports.map((report) => report.relativeMarginOfError),
      Number.NEGATIVE_INFINITY,
    ),
    allCorrect: reports.every((report) => report.correctnessOk),
    complete: reports.length === cases.length && skipped.length === 0,
  }
  const outputPath =
    args.out ??
    join(
      localDirectory,
      '..',
      '..',
      'reports',
      `portable-perf-${new Date().toISOString().slice(0, 10)}.json`,
    )
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        engine,
        subject: {
          id: EXPECTED_PORTABLE_SUBJECT.id,
          files: EXPECTED_PORTABLE_SUBJECT.files,
          sha256: await subjectSha256(),
        },
        corpus: {
          id: corpus.id,
          version: corpus.version,
          sha256: sha256(corpusRaw),
        },
        reference: {
          id: FROZEN_EMITTER_ID,
          sha256: emitterSha256,
        },
        args,
        summary,
        cases: reports,
        skipped,
      },
      null,
      2,
    )}\n`,
  )

  console.log(
    '\nPortable compile perf report (ratio = referenceNs / stopcockNs; >1 == stopcock faster)\n',
  )
  console.log(
    ['case', 'input', 'consumed', 'batch', 'n', 'median', 'mean', 'CI95', 'RME', 'correct'].join(
      '\t',
    ),
  )
  for (const report of reports) {
    console.log(
      [
        report.name.length > 52 ? `${report.name.slice(0, 49)}...` : report.name,
        report.inputSize,
        report.consumedInputItems,
        report.batchIterations,
        report.rounds,
        format(report.medianRatio),
        format(report.meanRatio),
        `[${format(report.ciLow)},${format(report.ciHigh)}]`,
        `${format(report.relativeMarginOfError)}%`,
        report.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(
    `\ncases: ${summary.count}/${summary.expectedCount}  geomean: ${format(summary.geomeanRatio)}  min: ${format(summary.minRatio)}  allCorrect: ${summary.allCorrect}`,
  )
  console.log(`report: ${outputPath}`)
  if (skipped.length > 0) {
    console.log(`\nskipped (${skipped.length}):`)
    for (const item of skipped) console.log(`  - ${item}`)
  }
  void stopcockMeasurementSink
  void referenceMeasurementSink
  if (!summary.complete || !summary.allCorrect) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
