import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as A from '../../../packages/fp/src/array'
import * as Collector from '../../../packages/fp/src/collector'
import * as Transducer from '../../../packages/fp/src/transducer'
import { currentPerfEngine, expectedEngineName, type PerfEngine } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  geomean,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
  runInterleavedPaired,
  type InterleavedPairedSampling,
} from './perf-runner'

const EXCLUSION_SIZES = Object.freeze([0, 1, 4, 8, 9, 16, 32, 33, 128] as const)
const WITHOUT_SOURCE_SIZES = Object.freeze([64, 1_024, 16_384] as const)
const SOURCE_KINDS = Object.freeze(['array', 'set', 'generator'] as const)

export const HOT_PATH_WORKER_MARKER = 'HOT_PATH_PERF_RESULT_JSON:'

export const HOT_PATH_CASE_IDS = Object.freeze([
  ...SOURCE_KINDS.flatMap((kind) => [
    `transduce/${kind}/map-filter-take`,
    `intoArray/${kind}/map-filter-take`,
    `intoArrayInto/${kind}/map-filter-take`,
    `collect/${kind}/array`,
    `collectTransduced/${kind}/map-filter-take`,
  ]),
  'transduce/array/stateful',
  'transduce/generator/stateful',
  'intoArray/generator/early-close',
  ...WITHOUT_SOURCE_SIZES.flatMap((sourceSize) =>
    EXCLUSION_SIZES.map((exclusionSize) => `without/n=${sourceSize}/m=${exclusionSize}`),
  ),
] as const)

export interface HotPathPerfPolicy {
  readonly minimumRounds: number
  readonly warmupRounds: number
  readonly minimumBatchInputItems: number
  readonly targetConsumedItemsPerMicroBatch: number
  readonly minimumGlobalGeomean: number
  readonly minimumCaseRatio: number
  readonly maximumRme: number
}

/**
 * Initial fail-closed floors retain room for characterization while forbidding
 * hidden material regressions. Tighten per-family floors after isolated Bun
 * and Node artifacts exist; never infer them from an interleaved run.
 */
export const HOT_PATH_PERF_POLICIES = Object.freeze({
  'bun-jsc': Object.freeze({
    minimumRounds: 80,
    warmupRounds: 20,
    minimumBatchInputItems: 65_536,
    targetConsumedItemsPerMicroBatch: 10_000,
    minimumGlobalGeomean: 1,
    minimumCaseRatio: 0.85,
    maximumRme: 6,
  }),
  'node-v8': Object.freeze({
    minimumRounds: 80,
    warmupRounds: 30,
    minimumBatchInputItems: 65_536,
    targetConsumedItemsPerMicroBatch: 10_000,
    minimumGlobalGeomean: 1,
    minimumCaseRatio: 0.85,
    maximumRme: 5,
  }),
} satisfies Readonly<Record<PerfEngine['id'], HotPathPerfPolicy>>)

export interface HotPathPerfCase {
  readonly id: string
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
  readonly currentSamplesNs: readonly number[]
  readonly frozenSamplesNs: readonly number[]
  readonly pairedRatios: readonly number[]
}

export interface HotPathPerfReport {
  readonly generatedAt: string
  readonly engine: PerfEngine
  readonly comparison: {
    readonly candidate: string
    readonly reference: string
    readonly ratio: string
  }
  readonly args: {
    readonly rounds: number
    readonly minimumBatchInputItems: number
    readonly warmupRounds: number
  }
  readonly summary: {
    readonly count: number
    readonly expectedCount: number
    readonly geomeanRatio: number
    readonly minRatio: number
    readonly allCorrect: boolean
    readonly complete: boolean
  }
  readonly cases: readonly HotPathPerfCase[]
  readonly skipped: readonly string[]
}

interface WorkerSuccess {
  readonly ok: true
  readonly workerCaseIndex: number
  readonly workerCaseId: string
  readonly workerConsumedInputItems: number
  readonly workerEngine: PerfEngine
  readonly result: HotPathPerfCase
}

interface WorkerFailure {
  readonly ok: false
  readonly reason: string
}

type WorkerOutcome = WorkerSuccess | WorkerFailure

interface ExpectedWorkerIdentity {
  readonly caseIndex: number
  readonly caseId: string
  readonly consumedInputItems: number
  readonly engine: PerfEngine
}

const approximatelyEqual = (left: number, right: number): boolean =>
  Number.isFinite(left) &&
  Number.isFinite(right) &&
  Math.abs(left - right) <= Math.max(1e-9, Math.abs(right) * 1e-9)

const median = (values: readonly number[]): number => {
  if (values.length === 0) return Number.NaN
  const sorted = values.slice().sort((left, right) => left - right)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
    : (sorted[middle] as number)
}

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length

const sameEngine = (left: PerfEngine, right: PerfEngine): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

export const parseHotPathWorkerOutput = (
  stdout: string,
  status: number | null,
  signal: string | null,
  expected: ExpectedWorkerIdentity,
): WorkerOutcome => {
  const markers = stdout
    .split('\n')
    .filter((line) => line.startsWith(HOT_PATH_WORKER_MARKER))
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
      (markers[0] as string).slice(HOT_PATH_WORKER_MARKER.length),
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
      outcome.workerCaseId !== expected.caseId ||
      outcome.workerConsumedInputItems !== expected.consumedInputItems
    ) {
      return {
        ok: false,
        reason: `worker case identity does not match ${expected.caseIndex}:${expected.caseId}`,
      }
    }
    if (!sameEngine(outcome.workerEngine, expected.engine)) {
      return { ok: false, reason: 'worker runtime identity does not match coordinator' }
    }
    const result = outcome.result
    if (
      result === null ||
      typeof result !== 'object' ||
      result.id !== expected.caseId ||
      result.consumedInputItems !== expected.consumedInputItems
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

export const evaluateHotPathPerfReport = (
  report: HotPathPerfReport,
): { readonly passed: boolean; readonly failures: readonly string[] } => {
  const failures: string[] = []
  const failUnless = (condition: boolean, message: string): void => {
    if (!condition) failures.push(message)
  }
  const supportedEngine = report.engine.id === 'bun-jsc' || report.engine.id === 'node-v8'
  const policy = supportedEngine
    ? HOT_PATH_PERF_POLICIES[report.engine.id]
    : HOT_PATH_PERF_POLICIES['bun-jsc']
  failUnless(
    supportedEngine && report.engine.name === expectedEngineName(report.engine.id),
    `unexpected benchmark engine ${report.engine.id}/${report.engine.name}`,
  )
  failUnless(
    report.comparison.candidate === '@stopcock/fp current hot paths' &&
      report.comparison.reference === 'frozen pre-optimization equivalents',
    'unexpected hot-path comparison',
  )
  failUnless(
    report.args.rounds >= policy.minimumRounds,
    `used ${report.args.rounds} rounds; minimum is ${policy.minimumRounds}`,
  )
  failUnless(
    report.args.minimumBatchInputItems >= policy.minimumBatchInputItems,
    'input batch target is too small',
  )
  failUnless(report.args.warmupRounds >= policy.warmupRounds, 'warmup rounds are below policy')
  failUnless(
    report.cases.length === HOT_PATH_CASE_IDS.length,
    `report contains ${report.cases.length} cases; expected ${HOT_PATH_CASE_IDS.length}`,
  )
  failUnless(report.skipped.length === 0, 'report contains skipped cases')
  failUnless(report.summary.complete, 'report is incomplete')
  failUnless(report.summary.allCorrect, 'report contains incorrect output')

  const rows = new Map(report.cases.map((item) => [item.id, item]))
  for (const id of HOT_PATH_CASE_IDS) {
    const item = rows.get(id)
    failUnless(item !== undefined, `missing case ${id}`)
    if (!item) continue
    failUnless(item.correctnessOk, `${id}: incorrect output`)
    failUnless(
      sameEngine(item.workerEngine, report.engine),
      `${id}: worker runtime identity does not match report`,
    )
    failUnless(
      item.rounds === report.args.rounds && item.rounds >= policy.minimumRounds,
      `${id}: inconsistent round count`,
    )
    failUnless(
      item.batchIterations * item.consumedInputItems >= policy.minimumBatchInputItems,
      `${id}: insufficient consumed input items`,
    )
    const expectedMicroBatch = consumedItemsMicroBatchIterations(
      item.consumedInputItems,
      item.batchIterations,
      policy.targetConsumedItemsPerMicroBatch,
    )
    failUnless(
      item.sampling?.id === INTERLEAVED_PAIRED_SAMPLER_ID,
      `${id}: unexpected sampler identity`,
    )
    failUnless(
      item.sampling?.order === INTERLEAVED_PAIRED_SAMPLER_ORDER,
      `${id}: unexpected sampler order`,
    )
    failUnless(
      item.sampling?.batchIterationsPerSide === item.batchIterations &&
        item.sampling?.microBatchIterations === expectedMicroBatch &&
        item.sampling?.microBatchesPerSide === Math.ceil(item.batchIterations / expectedMicroBatch),
      `${id}: inconsistent sampler batch shape`,
    )
    failUnless(
      item.sampling?.targetConsumedItemsPerMicroBatch === policy.targetConsumedItemsPerMicroBatch &&
        item.sampling?.nominalConsumedItemsPerMicroBatch ===
          expectedMicroBatch * item.consumedInputItems,
      `${id}: inconsistent sampler consumed-item shape`,
    )

    const current = Array.isArray(item.currentSamplesNs) ? item.currentSamplesNs : []
    const frozen = Array.isArray(item.frozenSamplesNs) ? item.frozenSamplesNs : []
    const ratios = Array.isArray(item.pairedRatios) ? item.pairedRatios : []
    failUnless(current.length === item.rounds, `${id}: current raw sample count mismatch`)
    failUnless(frozen.length === item.rounds, `${id}: frozen raw sample count mismatch`)
    failUnless(ratios.length === item.rounds, `${id}: paired-ratio count mismatch`)
    failUnless(
      current.every((sample) => Number.isFinite(sample) && sample > 0),
      `${id}: invalid current samples`,
    )
    failUnless(
      frozen.every((sample) => Number.isFinite(sample) && sample > 0),
      `${id}: invalid frozen samples`,
    )
    failUnless(
      ratios.every((ratio) => Number.isFinite(ratio) && ratio > 0),
      `${id}: invalid paired ratios`,
    )
    failUnless(
      current.length === frozen.length &&
        current.length === ratios.length &&
        ratios.every((ratio, index) =>
          approximatelyEqual(ratio, (frozen[index] as number) / (current[index] as number)),
        ),
      `${id}: paired ratios do not match frozenNs / currentNs`,
    )
    failUnless(
      approximatelyEqual(item.medianRatio, median(ratios)),
      `${id}: median does not match raw ratios`,
    )
    failUnless(
      approximatelyEqual(item.meanRatio, mean(ratios)),
      `${id}: mean does not match raw ratios`,
    )
    failUnless(
      Number.isFinite(item.ciLow) &&
        item.ciLow > 0 &&
        item.ciLow <= item.medianRatio &&
        Number.isFinite(item.ciHigh) &&
        item.ciHigh >= item.medianRatio,
      `${id}: invalid confidence interval`,
    )
    failUnless(
      Number.isFinite(item.signTestP) && item.signTestP >= 0 && item.signTestP <= 1,
      `${id}: invalid sign test`,
    )
    const rme = ((item.ciHigh - item.ciLow) / (2 * item.medianRatio)) * 100
    failUnless(
      approximatelyEqual(item.relativeMarginOfError, rme) &&
        (item.relativeMarginOfError <= policy.maximumRme ||
          // Allocation-balanced parity rows can have wide GC-driven
          // intervals. A wide interval is still release-safe when its entire
          // 95% confidence range remains above the throughput floor.
          item.ciLow >= policy.minimumCaseRatio),
      `${id}: invalid or excessive RME`,
    )
    failUnless(
      item.medianRatio >= policy.minimumCaseRatio,
      `${id}: ratio ${item.medianRatio.toFixed(3)} is below ${policy.minimumCaseRatio.toFixed(3)}`,
    )
  }

  const ratios = report.cases.map((item) => item.medianRatio)
  const globalGeomean = geomean(ratios)
  const minRatio = Math.min(...ratios, Number.POSITIVE_INFINITY)
  failUnless(
    approximatelyEqual(report.summary.geomeanRatio, globalGeomean),
    'summary geomean does not match rows',
  )
  failUnless(
    approximatelyEqual(report.summary.minRatio, minRatio),
    'summary minimum does not match rows',
  )
  failUnless(
    globalGeomean >= policy.minimumGlobalGeomean,
    `geomean ${globalGeomean.toFixed(3)} is below ${policy.minimumGlobalGeomean.toFixed(3)}`,
  )
  return { passed: failures.length === 0, failures: Object.freeze(failures) }
}

const frozenTransduce = <A, B, State, Output>(
  source: Iterable<A>,
  transducer: Transducer.Transducer<A, B>,
  reducer: Transducer.Reducer<B, State, Output>,
): Output => {
  const transformed = transducer(reducer)
  const iterator = source[Symbol.iterator]()
  let state = transformed.init()
  let sourceDone = false
  try {
    while (!transformed.isDone?.()) {
      const item = iterator.next()
      if (item.done) {
        sourceDone = true
        break
      }
      const result = transformed.step(state, item.value)
      state = Transducer.unreduced(result)
      if (Transducer.isReduced(result)) break
    }
  } finally {
    if (!sourceDone) iterator.return?.()
  }
  return transformed.complete(state)
}

const frozenCollect = <Input, State, Output>(
  source: Iterable<Input>,
  collector: Collector.Collector<Input, State, Output>,
): Output => {
  let state = collector.init()
  for (const input of source) {
    state = collector.add(state, input)
    if (collector.isDone?.(state)) break
  }
  return collector.finish(state)
}

const sameValueZero = (left: unknown, right: unknown): boolean =>
  left === right || (left !== left && right !== right)

const frozenWithout = <A>(source: readonly A[], exclusions: readonly A[]): A[] => {
  const length = source.length
  const exclusionLength = exclusions.length
  const output: A[] = []
  if (exclusionLength === 0) {
    for (let index = 0; index < length; index++) output.push(source[index] as A)
    return output
  }
  if (exclusionLength <= 8) {
    const value0 = exclusions[0]
    const value1 = exclusions[1]
    const value2 = exclusions[2]
    const value3 = exclusions[3]
    const value4 = exclusions[4]
    const value5 = exclusions[5]
    const value6 = exclusions[6]
    const value7 = exclusions[7]
    switch (exclusionLength) {
      case 1:
        for (let index = 0; index < length; index++) {
          const value = source[index] as A
          if (!sameValueZero(value, value0)) output.push(value)
        }
        return output
      case 2:
        for (let index = 0; index < length; index++) {
          const value = source[index] as A
          if (!(sameValueZero(value, value0) || sameValueZero(value, value1))) output.push(value)
        }
        return output
      case 3:
        for (let index = 0; index < length; index++) {
          const value = source[index] as A
          if (
            !(
              sameValueZero(value, value0) ||
              sameValueZero(value, value1) ||
              sameValueZero(value, value2)
            )
          ) {
            output.push(value)
          }
        }
        return output
      case 4:
        for (let index = 0; index < length; index++) {
          const value = source[index] as A
          if (
            !(
              sameValueZero(value, value0) ||
              sameValueZero(value, value1) ||
              sameValueZero(value, value2) ||
              sameValueZero(value, value3)
            )
          ) {
            output.push(value)
          }
        }
        return output
      case 5:
        for (let index = 0; index < length; index++) {
          const value = source[index] as A
          if (
            !(
              sameValueZero(value, value0) ||
              sameValueZero(value, value1) ||
              sameValueZero(value, value2) ||
              sameValueZero(value, value3) ||
              sameValueZero(value, value4)
            )
          ) {
            output.push(value)
          }
        }
        return output
      case 6:
        for (let index = 0; index < length; index++) {
          const value = source[index] as A
          if (
            !(
              sameValueZero(value, value0) ||
              sameValueZero(value, value1) ||
              sameValueZero(value, value2) ||
              sameValueZero(value, value3) ||
              sameValueZero(value, value4) ||
              sameValueZero(value, value5)
            )
          ) {
            output.push(value)
          }
        }
        return output
      case 7:
        for (let index = 0; index < length; index++) {
          const value = source[index] as A
          if (
            !(
              sameValueZero(value, value0) ||
              sameValueZero(value, value1) ||
              sameValueZero(value, value2) ||
              sameValueZero(value, value3) ||
              sameValueZero(value, value4) ||
              sameValueZero(value, value5) ||
              sameValueZero(value, value6)
            )
          ) {
            output.push(value)
          }
        }
        return output
      default:
        for (let index = 0; index < length; index++) {
          const value = source[index] as A
          if (
            !(
              sameValueZero(value, value0) ||
              sameValueZero(value, value1) ||
              sameValueZero(value, value2) ||
              sameValueZero(value, value3) ||
              sameValueZero(value, value4) ||
              sameValueZero(value, value5) ||
              sameValueZero(value, value6) ||
              sameValueZero(value, value7)
            )
          ) {
            output.push(value)
          }
        }
        return output
    }
  }
  let isExcluded: (value: A) => boolean
  if (exclusionLength <= 32) {
    isExcluded = (value) => {
      for (let index = 0; index < exclusionLength; index++) {
        if (sameValueZero(value, exclusions[index])) return true
      }
      return false
    }
  } else {
    const excluded = new Set(exclusions)
    isExcluded = (value) => excluded.has(value)
  }
  for (let index = 0; index < length; index++) {
    const value = source[index] as A
    if (!isExcluded(value)) output.push(value)
  }
  return output
}

const semanticEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
  for (let index = 0; index < left.length; index++) {
    if (!semanticEqual(left[index], right[index])) return false
  }
  return true
}

const observeValue = (value: unknown): number => {
  if (Array.isArray(value)) {
    let total = value.length
    for (let index = 0; index < value.length; index++) {
      total = (total * 33 + observeValue(value[index])) | 0
    }
    return total
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 0x7fc00000
    if (value === Number.POSITIVE_INFINITY) return 0x7f800000
    if (value === Number.NEGATIVE_INFINITY) return -0x7f800000
    return Object.is(value, -0) ? -2_147_483_648 : value
  }
  if (typeof value === 'boolean') return value ? 1 : 0
  return value === undefined ? 0 : 1
}

interface CaseSpec {
  readonly id: string
  readonly consumedInputItems: number
  readonly current: () => unknown
  readonly frozen: () => unknown
}

const sourceOf = (
  kind: (typeof SOURCE_KINDS)[number],
  values: readonly number[],
): Iterable<number> => {
  if (kind === 'array') return values
  if (kind === 'set') return new Set(values)
  return {
    *[Symbol.iterator]() {
      yield* values
    },
  }
}

const makeCases = (): readonly CaseSpec[] => {
  const values = Array.from({ length: 4_096 }, (_, index) => index)
  const transform = Transducer.compose(
    Transducer.map((value: number) => value * 2 + 1),
    Transducer.filter((value: number) => value % 3 !== 0),
    Transducer.take<number>(128),
  )
  const cases: CaseSpec[] = []
  const consumed = 192
  for (const kind of SOURCE_KINDS) {
    const source = sourceOf(kind, values)
    cases.push(
      {
        id: `transduce/${kind}/map-filter-take`,
        consumedInputItems: consumed,
        current: () => Transducer.transduce(source, transform, Transducer.arrayReducer()),
        frozen: () => frozenTransduce(source, transform, Transducer.arrayReducer()),
      },
      {
        id: `intoArray/${kind}/map-filter-take`,
        consumedInputItems: consumed,
        current: () => Transducer.intoArray(source, transform),
        frozen: () => frozenTransduce(source, transform, Transducer.arrayReducer()),
      },
      {
        id: `intoArrayInto/${kind}/map-filter-take`,
        consumedInputItems: consumed,
        current: () => Transducer.intoArrayInto(source, transform, [-1]),
        frozen: () => frozenTransduce(source, transform, Transducer.arrayReducerInto([-1])),
      },
      {
        id: `collect/${kind}/array`,
        consumedInputItems: values.length,
        current: () => Collector.collect(source, Collector.array()),
        frozen: () => frozenCollect(source, Collector.array()),
      },
      {
        id: `collectTransduced/${kind}/map-filter-take`,
        consumedInputItems: consumed,
        current: () => Collector.collectTransduced(source, transform, Collector.array()),
        frozen: () => frozenTransduce(source, transform, Collector.toReducer(Collector.array())),
      },
    )
  }

  const stateful = Transducer.compose(
    Transducer.dropWhile((value: number) => value < 100),
    Transducer.distinct<number>(),
    Transducer.take<number>(128),
  )
  for (const kind of ['array', 'generator'] as const) {
    const source = sourceOf(kind, values)
    cases.push({
      id: `transduce/${kind}/stateful`,
      consumedInputItems: 228,
      current: () => Transducer.intoArray(source, stateful),
      frozen: () => frozenTransduce(source, stateful, Transducer.arrayReducer()),
    })
  }
  cases.push({
    id: 'intoArray/generator/early-close',
    consumedInputItems: consumed,
    current: () => {
      let closed = 0
      const source = (function* () {
        try {
          yield* values
        } finally {
          closed++
        }
      })()
      return [Transducer.intoArray(source, transform), closed]
    },
    frozen: () => {
      let closed = 0
      const source = (function* () {
        try {
          yield* values
        } finally {
          closed++
        }
      })()
      return [frozenTransduce(source, transform, Transducer.arrayReducer()), closed]
    },
  })

  for (const sourceSize of WITHOUT_SOURCE_SIZES) {
    const source = Array.from({ length: sourceSize }, (_, index) =>
      index % 257 === 0 ? Number.NaN : index % 263 === 0 ? -0 : index % 521,
    )
    for (const exclusionSize of EXCLUSION_SIZES) {
      const exclusions = Array.from({ length: exclusionSize }, (_, index) =>
        index % 17 === 0 ? Number.NaN : index,
      )
      cases.push({
        id: `without/n=${sourceSize}/m=${exclusionSize}`,
        consumedInputItems: sourceSize,
        current: () => A.without(source, exclusions),
        frozen: () => frozenWithout(source, exclusions),
      })
    }
  }
  return cases
}

export const validateHotPathImplementations = (): readonly string[] => {
  const failures: string[] = []
  const cases = makeCases()
  if (cases.length !== HOT_PATH_CASE_IDS.length) {
    failures.push(`constructed ${cases.length} cases; expected ${HOT_PATH_CASE_IDS.length}`)
  }
  for (const spec of cases) {
    try {
      if (!semanticEqual(spec.current(), spec.frozen()))
        failures.push(`${spec.id}: output mismatch`)
    } catch (error) {
      failures.push(`${spec.id}: ${(error as Error).message}`)
    }
  }
  return Object.freeze(failures)
}

const parsePositiveInteger = (argv: readonly string[], flag: string, fallback: number): number => {
  const index = argv.indexOf(flag)
  if (index === -1) return fallback
  const value = Number(argv[index + 1])
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${flag} must be positive`)
  return value
}

const parseWorkerCaseIndex = (argv: readonly string[]): number | undefined => {
  const index = argv.indexOf('--case-index')
  if (index === -1) return undefined
  const value = Number(argv[index + 1])
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('--case-index must be a non-negative integer')
  }
  return value
}

const relativeMarginOfError = (low: number, high: number, center: number): number =>
  ((high - low) / (2 * center)) * 100

let measurementSink = 0

const measureCase = (
  spec: CaseSpec,
  rounds: number,
  minimumBatchInputItems: number,
  engine: PerfEngine,
): HotPathPerfCase => {
  const policy = HOT_PATH_PERF_POLICIES[engine.id]
  const currentOutput = spec.current()
  const frozenOutput = spec.frozen()
  const batchIterations = Math.max(
    1,
    Math.ceil(minimumBatchInputItems / spec.consumedInputItems),
  )
  const microBatchIterations = consumedItemsMicroBatchIterations(
    spec.consumedInputItems,
    batchIterations,
    policy.targetConsumedItemsPerMicroBatch,
  )
  const measured = runInterleavedPaired(spec.current, spec.frozen, {
    rounds,
    warmupRounds: policy.warmupRounds,
    batchIterations,
    microBatchIterations,
    observe: (currentLast, frozenLast) => {
      measurementSink = (observeValue(currentLast) + observeValue(frozenLast)) | 0
    },
  })
  return {
    id: spec.id,
    consumedInputItems: spec.consumedInputItems,
    correctnessOk: semanticEqual(currentOutput, frozenOutput),
    workerEngine: engine,
    rounds: measured.pairedRatios.length,
    batchIterations,
    sampling: {
      ...measured.sampling,
      targetConsumedItemsPerMicroBatch: policy.targetConsumedItemsPerMicroBatch,
      nominalConsumedItemsPerMicroBatch: microBatchIterations * spec.consumedInputItems,
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
    frozenSamplesNs: measured.bSamples,
    pairedRatios: measured.pairedRatios,
  }
}

const workerArguments = (
  engine: PerfEngine,
  caseIndex: number,
  rounds: number,
  minimumBatchInputItems: number,
): readonly string[] => {
  const benchmarkArguments = [
    fileURLToPath(import.meta.url),
    '--case-index',
    String(caseIndex),
    '--rounds',
    String(rounds),
    '--batch-items',
    String(minimumBatchInputItems),
  ]
  return engine.id === 'bun-jsc'
    ? ['run', ...benchmarkArguments]
    : ['--import=tsx', ...benchmarkArguments]
}

const runWorker = (
  spec: CaseSpec,
  caseIndex: number,
  rounds: number,
  minimumBatchInputItems: number,
  engine: PerfEngine,
): WorkerOutcome => {
  const worker = spawnSync(
    process.execPath,
    workerArguments(engine, caseIndex, rounds, minimumBatchInputItems),
    {
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
    },
  )
  const parsed = parseHotPathWorkerOutput(
    worker.stdout ?? '',
    worker.status,
    worker.signal,
    {
      caseIndex,
      caseId: spec.id,
      consumedInputItems: spec.consumedInputItems,
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

const main = async (): Promise<void> => {
  const engine = currentPerfEngine()
  const policy = HOT_PATH_PERF_POLICIES[engine.id]
  const rounds = parsePositiveInteger(process.argv, '--rounds', policy.minimumRounds)
  const minimumBatchInputItems = parsePositiveInteger(
    process.argv,
    '--batch-items',
    policy.minimumBatchInputItems,
  )
  const specs = makeCases()
  const workerCaseIndex = parseWorkerCaseIndex(process.argv)
  if (workerCaseIndex !== undefined) {
    const spec = specs[workerCaseIndex]
    let outcome: WorkerOutcome
    if (!spec) {
      outcome = { ok: false, reason: `unknown hot-path case index ${workerCaseIndex}` }
      process.exitCode = 1
    } else {
      try {
        const result = measureCase(spec, rounds, minimumBatchInputItems, engine)
        outcome = {
          ok: true,
          workerCaseIndex,
          workerCaseId: spec.id,
          workerConsumedInputItems: spec.consumedInputItems,
          workerEngine: engine,
          result,
        }
      } catch (error) {
        outcome = { ok: false, reason: (error as Error).message }
        process.exitCode = 1
      }
    }
    console.log(`${HOT_PATH_WORKER_MARKER}${JSON.stringify(outcome)}`)
    return
  }

  const reports: HotPathPerfCase[] = []
  const skipped: string[] = []

  for (let caseIndex = 0; caseIndex < specs.length; caseIndex++) {
    const spec = specs[caseIndex]
    const outcome = runWorker(
      spec,
      caseIndex,
      rounds,
      minimumBatchInputItems,
      engine,
    )
    if (outcome.ok) reports.push(outcome.result)
    else skipped.push(`${spec.id}: ${outcome.reason}`)
  }

  const ratios = reports.map((item) => item.medianRatio)
  const summary = {
    count: reports.length,
    expectedCount: HOT_PATH_CASE_IDS.length,
    geomeanRatio: geomean(ratios),
    minRatio: Math.min(...ratios, Number.POSITIVE_INFINITY),
    allCorrect: reports.every((item) => item.correctnessOk),
    complete: reports.length === HOT_PATH_CASE_IDS.length && skipped.length === 0,
  }
  const report: HotPathPerfReport = {
    generatedAt: new Date().toISOString(),
    engine,
    comparison: {
      candidate: '@stopcock/fp current hot paths',
      reference: 'frozen pre-optimization equivalents',
      ratio: 'frozenNs / currentNs; greater is faster',
    },
    args: { rounds, minimumBatchInputItems, warmupRounds: policy.warmupRounds },
    summary,
    cases: reports,
    skipped,
  }
  const directory = resolve(
    process.env.PERF_ARTIFACT_DIR ?? join(tmpdir(), 'stopcock-fp-performance'),
  )
  await mkdir(directory, { recursive: true })
  const reportPath = join(directory, `transducer-collector-without-${engine.id}.json`)
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  const evaluation = evaluateHotPathPerfReport(report)

  console.log(`\nTransducer, collector, and without gate (${engine.name})\n`)
  console.log(['case', 'batch', 'median', 'RME', 'correct'].join('\t'))
  for (const item of reports) {
    console.log(
      [
        item.id,
        item.batchIterations,
        item.medianRatio.toFixed(3),
        `${item.relativeMarginOfError.toFixed(2)}%`,
        item.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(
    `\ngeomean: ${summary.geomeanRatio.toFixed(3)} min: ${summary.minRatio.toFixed(3)} sink: ${measurementSink}`,
  )
  for (const failure of evaluation.failures) console.error(`FAIL\t${failure}`)
  console.log(`report: ${reportPath}`)
  if (!evaluation.passed) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
