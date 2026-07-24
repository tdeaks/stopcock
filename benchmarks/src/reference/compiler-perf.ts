// fp-compiler performance runner. Every supported portable-corpus case is
// measured in a fresh process against the frozen reference emitter. The
// coordinator writes a complete raw-sample artifact; policy is applied by
// compiler-perf-gate.ts so generation and evaluation stay independently
// auditable.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SUPPORTED_OP_NAMES } from '../../../packages/fp-compiler/src/ops'
import { transformStopcockPipelines } from '../../../packages/fp-compiler/src/transform'
import * as A from '../../../packages/fp/src/array'
import { none } from '../../../packages/fp/src/option'
import { pipe } from '../../../packages/fp/src/pipe'
import type { CallbackSpec } from './binding-specs'
import {
  COMPILER_PERF_POLICIES,
  EXPECTED_COMPILER_IMPLEMENTATION_FILES,
  EXPECTED_COMPILER_SUBJECT_ID,
  minimumCompilerBatchIterations,
} from './compiler-perf-contract'
import {
  compileEmittedPipeline,
  FROZEN_EMITTER_ID,
  type EmitterBinding,
  type PipelineDesc,
} from './emitter'
import { generateInputArray, type SerializedStep } from './generate'
import { currentPerfEngine, type PerfEngine } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  geomean,
  runInterleavedPaired,
  type InterleavedPairedSampling,
} from './perf-runner'

const localDirectory = dirname(fileURLToPath(import.meta.url))
const WORKER_MARKER = 'COMPILER_PERF_RESULT_JSON:'

export interface CompilerPerfCorpusCase {
  readonly name: string
  readonly strata: Readonly<Record<string, unknown>>
  readonly inputSeed: number
  readonly size: number
  readonly steps: readonly SerializedStep[]
}

export interface CompilerPerfGap {
  readonly name: string
  readonly steps: readonly string[]
  readonly unsupportedOps: readonly string[]
  readonly reason: string
}

export interface CompilerPerfCase {
  readonly name: string
  readonly stepKinds: readonly string[]
  readonly strata: Readonly<Record<string, unknown>>
  readonly inputSize: number
  readonly consumedInputItems: number
  readonly correctnessOk: boolean
  readonly transformedSiteCount: number
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
  readonly compilerSamplesNs: readonly number[]
  readonly referenceSamplesNs: readonly number[]
  readonly pairedRatios: readonly number[]
}

export interface CompilerPerfArgs {
  readonly rounds: number
  readonly warmupRounds: number
  readonly minimumBatchInputItems: number
  readonly targetConsumedItemsPerMicroBatch: number
  readonly quick: boolean
  readonly casesFilter?: string
  readonly corpusPath: string
  readonly out?: string
  readonly caseIndex?: number
}

export interface CompilerPerfReport {
  readonly version: 1
  readonly generatedAt: string
  readonly engine: PerfEngine
  readonly corpus: {
    readonly id: string
    readonly version: number
    readonly sha256: string
    readonly totalCaseCount: number
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
  readonly coverage: {
    readonly corpusCaseCount: number
    readonly supportedCaseCount: number
    readonly gapCount: number
    readonly supportedCaseNamesSha256: string
    readonly projectionSha256: string
    readonly gaps: readonly CompilerPerfGap[]
  }
  readonly args: Omit<CompilerPerfArgs, 'caseIndex'>
  readonly summary: {
    readonly count: number
    readonly expectedSupportedCount: number
    readonly corpusCaseCount: number
    readonly gapCount: number
    readonly geomeanRatio: number
    readonly minRatio: number
    readonly maxRelativeMarginOfError: number
    readonly allCorrect: boolean
    readonly complete: boolean
  }
  readonly cases: readonly CompilerPerfCase[]
  readonly skipped: readonly string[]
}

interface LoadedCorpus {
  readonly raw: Uint8Array
  readonly id: string
  readonly version: number
  readonly cases: readonly CompilerPerfCorpusCase[]
}

interface CoverageProjection {
  readonly supportedCases: readonly CompilerPerfCorpusCase[]
  readonly gaps: readonly CompilerPerfGap[]
  readonly supportedCaseNamesSha256: string
  readonly projectionSha256: string
}

interface WorkerSuccess {
  readonly ok: true
  readonly result: CompilerPerfCase
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

const specSource = (spec: CallbackSpec): string => {
  switch (spec.kind) {
    case 'identity':
      return '(x) => x'
    case 'linear':
      return `(x) => x * ${spec.a} + ${spec.b}`
    case 'allocLinear':
      return `(x) => { const tmp = [x, x + ${spec.a}]; return tmp[0] + tmp[1]; }`
    case 'mod':
      return `(x) => x % ${spec.m} === ${spec.r}`
    case 'allocMod':
      return `(x) => { const tmp = { v: x }; return tmp.v % ${spec.m} === ${spec.r}; }`
    case 'constTrue':
      return '() => true'
    case 'constFalse':
      return '() => false'
    case 'filterMapMod':
      return `(x) => (x % ${spec.m} === ${spec.r} ? x * ${spec.a} + ${spec.b} : undefined)`
    case 'flatMapRange':
      return `(x) => { const out = new Array(${spec.factor}); for (let i = 0; i < ${spec.factor}; i++) out[i] = x * ${spec.a} + ${spec.b} + i; return out; }`
    case 'reduceAdd':
      return '(acc, x) => acc + x'
    case 'reduceSub':
      return '(acc, x) => acc - x'
    case 'allocReduceAdd':
      return '(acc, x) => ({ v: acc + x }).v'
    case 'noop':
      return '() => {}'
    case 'sortCmpAsc':
      return '(a, b) => a - b'
    case 'sortCmpDesc':
      return '(a, b) => b - a'
  }
}

const BARE_BOUNDARY_KINDS = new Set(['sort', 'sortAsc', 'sortDesc', 'reverse', 'uniq', 'sum'])

const stepSource = (step: SerializedStep): string | undefined => {
  if (step.kind === 'toArray') return undefined
  if (BARE_BOUNDARY_KINDS.has(step.kind)) return `A.${step.kind}`
  if (step.kind === 'take' || step.kind === 'drop') return `A.${step.kind}(${step.n})`
  if (step.kind === 'reduce' || step.kind === 'scan') {
    return `A.${step.kind}(${specSource(step.spec!)}, ${step.a1})`
  }
  if (step.kind === 'without') return `A.without(${JSON.stringify(step.values ?? [])})`
  return `A.${step.kind}(${specSource(step.spec!)})`
}

const synthesizeSource = (steps: readonly SerializedStep[]): string => {
  const renderedSteps = steps.map(stepSource).filter((step): step is string => step !== undefined)
  const body =
    renderedSteps.length === 0
      ? 'return input;'
      : `return pipe(input, ${renderedSteps.join(', ')});`
  return `import { pipe } from '@stopcock/fp'\nimport * as A from '@stopcock/fp/array'\nfunction __run(input) {\n${body}\n}\nexport { __run };`
}

export const compileTransformedCompilerPerfSource = (
  source: string,
): {
  readonly run: (input: readonly number[]) => unknown
  readonly transformedSiteCount: number
} => {
  const transformed = transformStopcockPipelines(source, 'compiler-perf-case.ts', {
    diagnostics: 'verbose',
  })
  const transformedSiteCount = transformed.diagnostics.filter((site) => site.transformed).length
  if (transformedSiteCount !== 1) {
    const reasons = transformed.diagnostics
      .filter((site) => !site.transformed)
      .map((site) => site.reason ?? 'unknown reason')
      .join(', ')
    throw new Error(
      `expected exactly one compiler-transformed site, found ${transformedSiteCount}${reasons ? ` (${reasons})` : ''}`,
    )
  }
  const noneAlias = transformed.code.match(
    /import\s*\{\s*none\s+as\s+([A-Za-z_$][\w$]*)\s*\}/u,
  )?.[1]
  const stripped = transformed.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function(
    'pipe',
    'A',
    ...(noneAlias ? [noneAlias] : []),
    `${stripped}\nreturn __run;`,
  )
  return {
    run: factory(pipe, A, ...(noneAlias ? [none] : [])) as (input: readonly number[]) => unknown,
    transformedSiteCount,
  }
}

const pipelineDesc = (steps: readonly SerializedStep[]): PipelineDesc => ({
  steps: steps
    .filter((step) => step.kind !== 'toArray')
    .map((step) => ({ kind: step.kind as PipelineDesc['steps'][number]['kind'] })),
})

const buildCallbackFromSpec = (spec: CallbackSpec): unknown => {
  switch (spec.kind) {
    case 'identity':
      return (value: number) => value
    case 'linear':
      return (value: number) => value * spec.a + spec.b
    case 'allocLinear':
      return (value: number) => {
        const temporary = [value, value + spec.a]
        return temporary[0] + temporary[1]
      }
    case 'mod':
      return (value: number) => value % spec.m === spec.r
    case 'allocMod':
      return (value: number) => {
        const temporary = { value }
        return temporary.value % spec.m === spec.r
      }
    case 'constTrue':
      return () => true
    case 'constFalse':
      return () => false
    case 'filterMapMod':
      return (value: number) => (value % spec.m === spec.r ? value * spec.a + spec.b : undefined)
    case 'flatMapRange': {
      const { factor, a, b } = spec
      return (value: number) => {
        const output: number[] = new Array(factor)
        for (let index = 0; index < factor; index++) output[index] = value * a + b + index
        return output
      }
    }
    case 'reduceAdd':
      return (accumulator: number, value: number) => accumulator + value
    case 'reduceSub':
      return (accumulator: number, value: number) => accumulator - value
    case 'allocReduceAdd':
      return (accumulator: number, value: number) => ({ value: accumulator + value }).value
    case 'noop':
      return () => {}
    case 'sortCmpAsc':
      return (left: number, right: number) => left - right
    case 'sortCmpDesc':
      return (left: number, right: number) => right - left
  }
}

const bindingsFor = (steps: readonly SerializedStep[]): readonly EmitterBinding[] =>
  steps
    .filter((step) => step.kind !== 'toArray')
    .map((step) => {
      if (step.kind === 'take' || step.kind === 'drop') return { fn: step.n }
      if (step.kind === 'reduce' || step.kind === 'scan') {
        return { fn: buildCallbackFromSpec(step.spec!), a1: step.a1 }
      }
      if (step.kind === 'without') return { fn: step.values ?? [] }
      if (step.spec) return { fn: buildCallbackFromSpec(step.spec) }
      return {}
    })

export const compilerPerfSemanticEqual = (left: unknown, right: unknown): boolean => {
  if (typeof left === 'number' && typeof right === 'number') {
    if (Number.isNaN(left) && Number.isNaN(right)) return true
    return Object.is(left, right)
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index++) {
      if (!compilerPerfSemanticEqual(left[index], right[index])) return false
    }
    return true
  }
  if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Record<PropertyKey, unknown>
    const rightRecord = right as Record<PropertyKey, unknown>
    const leftKeys = Reflect.ownKeys(leftRecord)
    if (leftKeys.length !== Reflect.ownKeys(rightRecord).length) return false
    for (const key of leftKeys) {
      if (
        !Object.prototype.hasOwnProperty.call(rightRecord, key) ||
        !compilerPerfSemanticEqual(leftRecord[key], rightRecord[key])
      ) {
        return false
      }
    }
    return true
  }
  return Object.is(left, right)
}

const classifyCoverage = (cases: readonly CompilerPerfCorpusCase[]): CoverageProjection => {
  const supportedCases: CompilerPerfCorpusCase[] = []
  const gaps: CompilerPerfGap[] = []
  for (const item of cases) {
    const stepKinds = item.steps.map((step) => step.kind)
    const unsupportedOps = [
      ...new Set(stepKinds.filter((kind) => kind !== 'toArray' && !SUPPORTED_OP_NAMES.has(kind))),
    ].sort()
    const syntheticOnly = item.steps.every((step) => step.kind === 'toArray')
    if (unsupportedOps.length === 0 && !syntheticOnly) {
      supportedCases.push(item)
      continue
    }
    gaps.push({
      name: item.name,
      steps: stepKinds,
      unsupportedOps,
      reason: syntheticOnly
        ? 'synthetic-only toArray pipeline has no compiler work'
        : `unsupported compiler ops: ${unsupportedOps.join(', ')}`,
    })
  }
  const supportedProjection = supportedCases.map((item) => ({
    name: item.name,
    steps: item.steps.map((step) => step.kind),
  }))
  return {
    supportedCases,
    gaps,
    supportedCaseNamesSha256: jsonSha256(supportedCases.map((item) => item.name)),
    projectionSha256: jsonSha256({ supportedCases: supportedProjection, gaps }),
  }
}

const loadCorpus = async (corpusPath: string): Promise<LoadedCorpus> => {
  const raw = await readFile(corpusPath)
  const parsed = JSON.parse(raw.toString('utf8')) as {
    readonly id: string
    readonly version: number
    readonly cases: readonly CompilerPerfCorpusCase[]
  }
  if (!Array.isArray(parsed.cases)) throw new Error('compiler perf corpus has no cases array')
  return { raw, id: parsed.id, version: parsed.version, cases: parsed.cases }
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

let compilerMeasurementSink: unknown
let referenceMeasurementSink: unknown

const consumedSourceItems = (
  run: (input: readonly number[]) => unknown,
  input: readonly number[],
  strata: Readonly<Record<string, unknown>>,
): number => {
  if (strata.sinkKind !== 'short-circuit' || strata.boundary !== 'none') return input.length
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

const measureCase = (item: CompilerPerfCorpusCase, args: CompilerPerfArgs): CompilerPerfCase => {
  const input = generateInputArray(item.inputSeed, item.size) as readonly number[]
  const compiled = compileTransformedCompilerPerfSource(synthesizeSource(item.steps))
  const emitted = compileEmittedPipeline(pipelineDesc(item.steps))
  const bindings = bindingsFor(item.steps)
  const compilerRun = (): unknown => compiled.run(input)
  const referenceRun = (): unknown => emitted(input, bindings)
  const correctnessOk = compilerPerfSemanticEqual(compilerRun(), referenceRun())
  const consumedInputItems = consumedSourceItems(
    (observed) => emitted(observed, bindings),
    input,
    item.strata,
  )
  const batchIterations = minimumCompilerBatchIterations(consumedInputItems, args)
  const microBatchIterations = consumedItemsMicroBatchIterations(
    consumedInputItems,
    batchIterations,
    args.targetConsumedItemsPerMicroBatch,
  )
  const measured = runInterleavedPaired(compilerRun, referenceRun, {
    rounds: args.rounds,
    warmupRounds: args.warmupRounds,
    batchIterations,
    microBatchIterations,
    observe: (compilerLast, referenceLast) => {
      compilerMeasurementSink = compilerLast
      referenceMeasurementSink = referenceLast
    },
  })
  return {
    name: item.name,
    stepKinds: item.steps.map((step) => step.kind),
    strata: item.strata,
    inputSize: item.size,
    consumedInputItems,
    correctnessOk,
    transformedSiteCount: compiled.transformedSiteCount,
    workerEngine: currentPerfEngine(),
    rounds: measured.pairedRatios.length,
    batchIterations,
    sampling: {
      ...measured.sampling,
      targetConsumedItemsPerMicroBatch: args.targetConsumedItemsPerMicroBatch,
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
    compilerSamplesNs: measured.aSamples,
    referenceSamplesNs: measured.bSamples,
    pairedRatios: measured.pairedRatios,
  }
}

export const parseCompilerPerfArgs = (
  argv: readonly string[],
  engine = currentPerfEngine(),
): CompilerPerfArgs => {
  const policy = COMPILER_PERF_POLICIES[engine.id]
  let rounds: number = policy.minimumRounds
  let warmupRounds: number = policy.minimumWarmupRounds
  let minimumBatchInputItems: number = policy.minimumBatchInputItems
  let targetConsumedItemsPerMicroBatch: number = policy.targetConsumedItemsPerMicroBatch
  let quick = false
  let casesFilter: string | undefined
  let corpusPath = join(localDirectory, 'perf-corpus.json')
  let out: string | undefined
  let caseIndex: number | undefined

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--rounds') rounds = Number(argv[++index])
    else if (argument === '--warmup') warmupRounds = Number(argv[++index])
    else if (argument === '--batch-inputs') minimumBatchInputItems = Number(argv[++index])
    else if (argument === '--micro-batch-inputs') {
      targetConsumedItemsPerMicroBatch = Number(argv[++index])
    } else if (argument === '--quick') quick = true
    else if (argument === '--cases') casesFilter = argv[++index]
    else if (argument === '--corpus') corpusPath = argv[++index]
    else if (argument === '--out') out = argv[++index]
    else if (argument === '--case-index') caseIndex = Number(argv[++index])
    else throw new Error(`unknown compiler perf argument: ${argument}`)
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
  return {
    rounds,
    warmupRounds,
    minimumBatchInputItems,
    targetConsumedItemsPerMicroBatch,
    quick,
    casesFilter,
    corpusPath,
    out,
    caseIndex,
  }
}

const selectedSupportedCases = (
  supportedCases: readonly CompilerPerfCorpusCase[],
  args: CompilerPerfArgs,
): readonly CompilerPerfCorpusCase[] => {
  let selected = supportedCases
  if (args.casesFilter) {
    selected = selected.filter((item) => item.name.includes(args.casesFilter as string))
  }
  if (args.quick) selected = selected.filter((item) => item.size <= 10_000)
  return selected
}

const workerArgs = (
  selfPath: string,
  engine: PerfEngine,
  args: CompilerPerfArgs,
  caseIndex: number,
): readonly string[] => {
  const benchmarkArgs = [
    selfPath,
    '--case-index',
    String(caseIndex),
    '--rounds',
    String(args.rounds),
    '--warmup',
    String(args.warmupRounds),
    '--batch-inputs',
    String(args.minimumBatchInputItems),
    '--micro-batch-inputs',
    String(args.targetConsumedItemsPerMicroBatch),
    '--corpus',
    args.corpusPath,
    ...(args.casesFilter ? ['--cases', args.casesFilter] : []),
    ...(args.quick ? ['--quick'] : []),
  ]
  return engine.id === 'bun-jsc' ? ['run', ...benchmarkArgs] : ['--import=tsx', ...benchmarkArgs]
}

const runWorker = (
  item: CompilerPerfCorpusCase,
  caseIndex: number,
  args: CompilerPerfArgs,
  engine: PerfEngine,
): WorkerOutcome => {
  const processResult = spawnSync(
    process.execPath,
    workerArgs(fileURLToPath(import.meta.url), engine, args, caseIndex),
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
    if (outcome.result.name !== item.name) {
      return {
        ok: false,
        reason: `worker returned case ${outcome.result.name} instead of ${item.name}`,
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

const defaultOutputPath = (engine: PerfEngine): string =>
  join(
    resolve(process.env.PERF_ARTIFACT_DIR ?? join(localDirectory, '..', '..', 'reports')),
    `compiler-performance-${engine.id}.json`,
  )

export const runCompilerPerf = async (
  args: CompilerPerfArgs,
): Promise<{ readonly report: CompilerPerfReport; readonly outputPath: string }> => {
  if (args.caseIndex !== undefined) {
    throw new Error('runCompilerPerf coordinator cannot be called in worker mode')
  }
  const engine = currentPerfEngine()
  const corpus = await loadCorpus(args.corpusPath)
  const coverage = classifyCoverage(corpus.cases)
  const selectedCases = selectedSupportedCases(coverage.supportedCases, args)
  const results: CompilerPerfCase[] = []
  const skipped: string[] = []

  for (let index = 0; index < selectedCases.length; index++) {
    const item = selectedCases[index]
    const outcome = runWorker(item, index, args, engine)
    if (outcome.ok) results.push(outcome.result)
    else skipped.push(`${item.name}: ${outcome.reason}`)
  }

  const ratios = results.map((result) => result.medianRatio)
  const supportedOps = [...SUPPORTED_OP_NAMES].sort()
  const emitterPath = fileURLToPath(new URL('./emitter.ts', import.meta.url))
  const reportArgs: Omit<CompilerPerfArgs, 'caseIndex'> = {
    rounds: args.rounds,
    warmupRounds: args.warmupRounds,
    minimumBatchInputItems: args.minimumBatchInputItems,
    targetConsumedItemsPerMicroBatch: args.targetConsumedItemsPerMicroBatch,
    quick: args.quick,
    casesFilter: args.casesFilter,
    corpusPath: args.corpusPath,
    out: args.out,
  }
  const summary = {
    count: results.length,
    expectedSupportedCount: coverage.supportedCases.length,
    corpusCaseCount: corpus.cases.length,
    gapCount: coverage.gaps.length,
    geomeanRatio: geomean(ratios),
    minRatio: Math.min(...ratios, Infinity),
    maxRelativeMarginOfError: Math.max(
      ...results.map((result) => result.relativeMarginOfError),
      Number.NEGATIVE_INFINITY,
    ),
    allCorrect: results.every((result) => result.correctnessOk),
    complete:
      selectedCases.length === coverage.supportedCases.length &&
      results.length === coverage.supportedCases.length &&
      skipped.length === 0,
  }
  const report: CompilerPerfReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    engine,
    corpus: {
      id: corpus.id,
      version: corpus.version,
      sha256: sha256(corpus.raw),
      totalCaseCount: corpus.cases.length,
    },
    reference: {
      id: FROZEN_EMITTER_ID,
      sha256: sha256(await readFile(emitterPath)),
    },
    compiler: {
      id: EXPECTED_COMPILER_SUBJECT_ID,
      implementationFiles: EXPECTED_COMPILER_IMPLEMENTATION_FILES,
      implementationSha256: await compilerImplementationSha256(),
      supportedOps,
      supportedOpsSha256: jsonSha256(supportedOps),
    },
    coverage: {
      corpusCaseCount: corpus.cases.length,
      supportedCaseCount: coverage.supportedCases.length,
      gapCount: coverage.gaps.length,
      supportedCaseNamesSha256: coverage.supportedCaseNamesSha256,
      projectionSha256: coverage.projectionSha256,
      gaps: coverage.gaps,
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
    `\nfp-compiler raw performance report (${engine.name}; referenceNs / compilerNs; >1 == compiler faster)\n`,
  )
  console.log(
    ['case', 'input', 'consumed', 'batch', 'n', 'median', 'CI95', 'RME', 'correct'].join('\t'),
  )
  for (const result of results) {
    console.log(
      [
        result.name.length > 52 ? `${result.name.slice(0, 49)}...` : result.name,
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
    `\ncases: ${summary.count}/${summary.expectedSupportedCount}; corpus gaps: ${summary.gapCount}; geomean: ${summary.geomeanRatio.toFixed(3)}; min: ${summary.minRatio.toFixed(3)}; allCorrect: ${summary.allCorrect}`,
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

const runWorkerMain = async (args: CompilerPerfArgs): Promise<void> => {
  const corpus = await loadCorpus(args.corpusPath)
  const coverage = classifyCoverage(corpus.cases)
  const selectedCases = selectedSupportedCases(coverage.supportedCases, args)
  const item = selectedCases[args.caseIndex as number]
  if (!item) {
    console.log(
      `${WORKER_MARKER}${JSON.stringify({ ok: false, reason: 'case index out of range' } satisfies WorkerFailure)}`,
    )
    process.exitCode = 1
    return
  }
  try {
    const result = measureCase(item, args)
    console.log(`${WORKER_MARKER}${JSON.stringify({ ok: true, result } satisfies WorkerSuccess)}`)
  } catch (error) {
    console.log(
      `${WORKER_MARKER}${JSON.stringify({ ok: false, reason: (error as Error).message } satisfies WorkerFailure)}`,
    )
    process.exitCode = 1
  }
}

const main = async (): Promise<void> => {
  const args = parseCompilerPerfArgs(process.argv.slice(2))
  if (args.caseIndex !== undefined) {
    await runWorkerMain(args)
    return
  }
  const { report } = await runCompilerPerf(args)
  if (!report.summary.complete || !report.summary.allCorrect) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
