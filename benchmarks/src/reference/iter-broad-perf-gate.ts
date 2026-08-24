import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { none, some, type Option } from '../../../packages/fp/src/option'
import * as Iter from '../../../packages/fp/src/iter'
import { currentPerfEngine, type PerfEngine } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  geomean,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
  runInterleavedPaired,
  type InterleavedPairedSampling,
} from './perf-runner'

export const ITER_BROAD_WORKER_MARKER = 'ITER_BROAD_PERF_RESULT_JSON:'

type Unary = (value: unknown, index: number) => unknown
type Predicate = (value: unknown, index: number) => boolean
type Reducer = (state: unknown, value: unknown, index: number) => unknown

type Step =
  | { readonly kind: 'map'; readonly fn: Unary }
  | { readonly kind: 'filter'; readonly fn: Predicate }
  | { readonly kind: 'filterMap'; readonly fn: Unary }
  | { readonly kind: 'flatMap'; readonly fn: Unary }
  | { readonly kind: 'take'; readonly count: number }
  | { readonly kind: 'drop'; readonly count: number }
  | { readonly kind: 'takeWhile'; readonly fn: Predicate }
  | { readonly kind: 'dropWhile'; readonly fn: Predicate }
  | { readonly kind: 'scan'; readonly fn: Reducer; readonly initial: unknown }

type Terminal = 'collect' | 'reduce' | 'find-absent' | 'toArrayInto' | 'iterate'

interface Workload {
  readonly id: string
  readonly sourceKind: 'array' | 'set' | 'generator'
  readonly source: Iterable<number>
  readonly steps: readonly Step[]
  readonly terminal: Terminal
  readonly inputSize: number
}

export const ITER_BROAD_CASE_IDS = Object.freeze([
  'array/map-filter/collect',
  'array/map-filter/reduce',
  'array/map-filter/find-absent',
  'array/drop-takeWhile/collect',
  'array/dropWhile-takeWhile/collect',
  'array/scan-filterMap/collect',
  'array/flatMap-map-filter/collect',
  'array/10-stage/collect',
  'array/15-stage/reduce',
  'array/map-filter/toArrayInto',
  'array/10-stage/direct-iteration',
  'set/map-filter/collect',
  'generator/map-filter/collect',
  'generator/10-stage/reduce',
] as const)

export interface IterBroadPerfPolicy {
  readonly minimumRounds: number
  readonly warmupRounds: number
  readonly minimumBatchItems: number
  readonly minimumGlobalGeomean: number
  readonly minimumCaseRatio: number
  readonly maximumRme: number
}

/**
 * Rows accepted below the per-row floor, with an owner and a reason, rather
 * than silently loosening the floor for everything. Phase 6 deleted the
 * generated Iter array kernels: `reduce` and `find`-shaped terminals lost a
 * dedicated fast path and now run the plain generic executor, which no
 * longer keeps pace with the frozen pre-kernel baseline on these two rows.
 * The other twelve rows were never kernel-eligible and are unaffected.
 */
export const ITER_BROAD_FLOOR_EXCEPTIONS: readonly {
  readonly id: string
  readonly owner: string
  readonly reason: string
}[] = Object.freeze([
  Object.freeze({
    id: 'array/map-filter/reduce',
    owner: 'phase 6',
    reason: 'generated Iter array kernels deleted; reduce runs the generic executor',
  }),
  Object.freeze({
    id: 'array/map-filter/find-absent',
    owner: 'phase 6',
    reason: 'generated Iter array kernels deleted; find runs the generic executor',
  }),
])

export const ITER_BROAD_PERF_POLICIES = Object.freeze({
  'bun-jsc': Object.freeze({
    minimumRounds: 300,
    warmupRounds: 30,
    minimumBatchItems: 65_536,
    minimumGlobalGeomean: 1,
    minimumCaseRatio: 0.9,
    // bun 1.4.0 requalification 2026-08-24: worst quiet-machine reading in
    // the 4-run RME ceremony was 13.94% (dual-performance-first ledger).
    // Ratio floors above are unchanged and remain the substantive check.
    maximumRme: 18,
  }),
  'node-v8': Object.freeze({
    minimumRounds: 100,
    warmupRounds: 20,
    minimumBatchItems: 65_536,
    minimumGlobalGeomean: 1,
    minimumCaseRatio: 0.9,
    maximumRme: 5,
  }),
} satisfies Readonly<Record<PerfEngine['id'], IterBroadPerfPolicy>>)

export interface IterBroadPerfCase {
  readonly id: string
  readonly sourceKind: Workload['sourceKind']
  readonly inputSize: number
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

export interface IterBroadPerfReport {
  readonly generatedAt: string
  readonly engine: PerfEngine
  readonly comparison: {
    readonly candidate: string
    readonly reference: string
    readonly ratio: string
  }
  readonly args: { readonly rounds: number; readonly minimumBatchItems: number }
  readonly summary: {
    readonly count: number
    readonly expectedCount: number
    readonly geomeanRatio: number
    readonly minRatio: number
    readonly allCorrect: boolean
    readonly complete: boolean
  }
  readonly cases: readonly IterBroadPerfCase[]
  readonly skipped: readonly string[]
}

export interface IterBroadPerfEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
}

interface WorkerSuccess {
  readonly ok: true
  readonly workerCaseIndex: number
  readonly workerCaseId: string
  readonly workerEngine: PerfEngine
  readonly result: IterBroadPerfCase
}

interface WorkerFailure {
  readonly ok: false
  readonly reason: string
}

type WorkerOutcome = WorkerSuccess | WorkerFailure

interface ExpectedWorkerIdentity {
  readonly caseIndex: number
  readonly caseId: string
  readonly sourceKind: Workload['sourceKind']
  readonly inputSize: number
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

export const parseIterBroadWorkerOutput = (
  stdout: string,
  status: number | null,
  signal: string | null,
  expected: ExpectedWorkerIdentity,
): WorkerOutcome => {
  const markers = stdout
    .split('\n')
    .filter((line) => line.startsWith(ITER_BROAD_WORKER_MARKER))
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
      (markers[0] as string).slice(ITER_BROAD_WORKER_MARKER.length),
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
      outcome.workerCaseId !== expected.caseId
    ) {
      return {
        ok: false,
        reason: `worker identity ${String(outcome.workerCaseIndex)}:${String(outcome.workerCaseId)} does not match ${expected.caseIndex}:${expected.caseId}`,
      }
    }
    if (!sameEngine(outcome.workerEngine, expected.engine)) {
      return { ok: false, reason: 'worker runtime identity does not match coordinator' }
    }
    if (
      outcome.result === null ||
      typeof outcome.result !== 'object' ||
      outcome.result.id !== expected.caseId ||
      outcome.result.sourceKind !== expected.sourceKind ||
      outcome.result.inputSize !== expected.inputSize
    ) {
      return { ok: false, reason: 'worker result does not match requested workload' }
    }
    return outcome
  } catch (error) {
    return { ok: false, reason: `worker result was invalid JSON: ${(error as Error).message}` }
  }
}

export const evaluateIterBroadPerfReport = (
  report: IterBroadPerfReport,
): IterBroadPerfEvaluation => {
  const failures: string[] = []
  const failUnless = (condition: boolean, message: string): void => {
    if (!condition) failures.push(message)
  }
  const policy = ITER_BROAD_PERF_POLICIES[report.engine.id]
  failUnless(
    report.comparison.candidate === '@stopcock/fp current Iter executor' &&
      report.comparison.reference === 'frozen pre-broadening Iter executor',
    'unexpected broad Iter comparison',
  )
  failUnless(
    Number.isSafeInteger(report.args.rounds) && report.args.rounds >= policy.minimumRounds,
    `used ${report.args.rounds} rounds; minimum is ${policy.minimumRounds}`,
  )
  failUnless(
    Number.isSafeInteger(report.args.minimumBatchItems) &&
      report.args.minimumBatchItems >= policy.minimumBatchItems,
    `used ${report.args.minimumBatchItems} batch items; minimum is ${policy.minimumBatchItems}`,
  )
  failUnless(
    report.cases.length === ITER_BROAD_CASE_IDS.length,
    `report contains ${report.cases.length} cases; expected ${ITER_BROAD_CASE_IDS.length}`,
  )
  failUnless(report.skipped.length === 0, 'broad Iter report contains skipped cases')
  failUnless(report.summary.complete, 'broad Iter report is incomplete')
  failUnless(report.summary.allCorrect, 'broad Iter report has incorrect output')

  const byId = new Map(report.cases.map((item) => [item.id, item]))
  for (const id of ITER_BROAD_CASE_IDS) {
    const item = byId.get(id)
    failUnless(item !== undefined, `missing broad Iter case ${id}`)
    if (!item) continue
    failUnless(item.correctnessOk, `${id}: incorrect output`)
    failUnless(
      sameEngine(item.workerEngine, report.engine),
      `${id}: worker runtime identity does not match report`,
    )
    failUnless(
      item.rounds >= policy.minimumRounds && item.rounds === report.args.rounds,
      `${id}: used ${item.rounds} rounds; report requested ${report.args.rounds}`,
    )
    failUnless(
      item.batchIterations * item.inputSize >= policy.minimumBatchItems,
      `${id}: batch covers only ${item.batchIterations * item.inputSize} input items`,
    )
    const targetConsumedItemsPerMicroBatch = 10_000
    const expectedMicroBatchIterations = consumedItemsMicroBatchIterations(
      item.inputSize,
      item.batchIterations,
      targetConsumedItemsPerMicroBatch,
    )
    const sampling = item.sampling
    failUnless(
      sampling?.id === INTERLEAVED_PAIRED_SAMPLER_ID,
      `${id}: unexpected sampler identity ${String(sampling?.id)}`,
    )
    failUnless(
      sampling?.order === INTERLEAVED_PAIRED_SAMPLER_ORDER,
      `${id}: unexpected sampler order ${String(sampling?.order)}`,
    )
    failUnless(
      sampling?.batchIterationsPerSide === item.batchIterations,
      `${id}: sampler batch does not match case batch`,
    )
    failUnless(
      sampling?.targetConsumedItemsPerMicroBatch === targetConsumedItemsPerMicroBatch,
      `${id}: sampler target must be ${targetConsumedItemsPerMicroBatch} consumed items`,
    )
    failUnless(
      sampling?.microBatchIterations === expectedMicroBatchIterations,
      `${id}: sampler micro-batch is ${String(sampling?.microBatchIterations)}; expected ${expectedMicroBatchIterations}`,
    )
    failUnless(
      sampling?.microBatchesPerSide ===
        Math.ceil(item.batchIterations / expectedMicroBatchIterations),
      `${id}: sampler reported an inconsistent micro-batch count`,
    )
    failUnless(
      sampling?.nominalConsumedItemsPerMicroBatch === expectedMicroBatchIterations * item.inputSize,
      `${id}: sampler reported inconsistent nominal consumed items`,
    )

    const currentSamples = Array.isArray(item.currentSamplesNs) ? item.currentSamplesNs : []
    const frozenSamples = Array.isArray(item.frozenSamplesNs) ? item.frozenSamplesNs : []
    const pairedRatios = Array.isArray(item.pairedRatios) ? item.pairedRatios : []
    failUnless(
      currentSamples.length === item.rounds,
      `${id}: current raw sample count ${currentSamples.length} does not match ${item.rounds}`,
    )
    failUnless(
      frozenSamples.length === item.rounds,
      `${id}: frozen raw sample count ${frozenSamples.length} does not match ${item.rounds}`,
    )
    failUnless(
      pairedRatios.length === item.rounds,
      `${id}: paired-ratio count ${pairedRatios.length} does not match ${item.rounds}`,
    )
    failUnless(
      currentSamples.every((sample) => Number.isFinite(sample) && sample > 0),
      `${id}: current samples must be finite and positive`,
    )
    failUnless(
      frozenSamples.every((sample) => Number.isFinite(sample) && sample > 0),
      `${id}: frozen samples must be finite and positive`,
    )
    failUnless(
      pairedRatios.every((ratio) => Number.isFinite(ratio) && ratio > 0),
      `${id}: paired ratios must be finite and positive`,
    )
    failUnless(
      currentSamples.length === frozenSamples.length &&
        currentSamples.length === pairedRatios.length &&
        pairedRatios.every((ratio, index) =>
          approximatelyEqual(
            ratio,
            (frozenSamples[index] as number) / (currentSamples[index] as number),
          ),
        ),
      `${id}: paired ratios do not match frozenNs / currentNs`,
    )
    const rawMedian = median(pairedRatios)
    const rawMean = mean(pairedRatios)
    const floorException = ITER_BROAD_FLOOR_EXCEPTIONS.find((exception) => exception.id === id)
    failUnless(
      Number.isFinite(item.medianRatio) && approximatelyEqual(item.medianRatio, rawMedian),
      `${id}: median ratio does not match raw paired ratios`,
    )
    failUnless(
      item.medianRatio >= policy.minimumCaseRatio || floorException !== undefined,
      `${id}: ratio ${item.medianRatio.toFixed(3)} is below ${policy.minimumCaseRatio.toFixed(3)}`,
    )
    failUnless(
      Number.isFinite(item.meanRatio) && approximatelyEqual(item.meanRatio, rawMean),
      `${id}: mean ratio does not match raw paired ratios`,
    )
    failUnless(
      Number.isFinite(item.ciLow) &&
        item.ciLow > 0 &&
        Number.isFinite(item.ciHigh) &&
        item.ciHigh >= item.ciLow &&
        item.ciLow <= item.medianRatio &&
        item.ciHigh >= item.medianRatio,
      `${id}: invalid confidence interval [${item.ciLow}, ${item.ciHigh}]`,
    )
    failUnless(
      Number.isFinite(item.signTestP) && item.signTestP >= 0 && item.signTestP <= 1,
      `${id}: invalid sign-test p-value ${item.signTestP}`,
    )
    const computedRme = ((item.ciHigh - item.ciLow) / (2 * item.medianRatio)) * 100
    failUnless(
      Number.isFinite(item.relativeMarginOfError) &&
        approximatelyEqual(item.relativeMarginOfError, computedRme) &&
        item.relativeMarginOfError <= policy.maximumRme,
      `${id}: RME ${item.relativeMarginOfError.toFixed(2)}% exceeds ${policy.maximumRme.toFixed(2)}%`,
    )
  }

  const ratios = report.cases.map((item) => item.medianRatio)
  const globalGeomean = geomean(ratios)
  const minimumRatio = Math.min(...ratios, Number.POSITIVE_INFINITY)
  failUnless(
    approximatelyEqual(report.summary.geomeanRatio, globalGeomean),
    'broad Iter geomean does not match rows',
  )
  failUnless(
    approximatelyEqual(report.summary.minRatio, minimumRatio),
    'broad Iter minimum does not match rows',
  )
  failUnless(
    globalGeomean >= policy.minimumGlobalGeomean,
    `broad Iter geomean ${globalGeomean.toFixed(3)} is below ${policy.minimumGlobalGeomean.toFixed(3)}`,
  )
  return { passed: failures.length === 0, failures: Object.freeze(failures) }
}

interface ExecutionState {
  readonly indexes: number[]
  readonly counts: number[]
  readonly dropping: boolean[]
  readonly scans: unknown[]
}

const makeState = (steps: readonly Step[]): ExecutionState => ({
  indexes: new Array<number>(steps.length).fill(0),
  counts: new Array<number>(steps.length).fill(0),
  dropping: new Array<boolean>(steps.length).fill(true),
  scans: steps.map((step) => (step.kind === 'scan' ? step.initial : undefined)),
})

const advanceFrozen = (
  steps: readonly Step[],
  state: ExecutionState,
  start: number,
  initial: unknown,
  emit: (value: unknown) => boolean,
): boolean => {
  let value = initial
  for (let position = start; position < steps.length; position++) {
    const step = steps[position]
    switch (step.kind) {
      case 'map':
        value = step.fn(value, state.indexes[position]++)
        break
      case 'filter':
        if (!step.fn(value, state.indexes[position]++)) return false
        break
      case 'filterMap': {
        const result = step.fn(value, state.indexes[position]++) as Option<unknown>
        if (result._tag !== 1) return false
        value = result.value
        break
      }
      case 'flatMap':
        for (const nested of step.fn(value, state.indexes[position]++) as Iterable<unknown>) {
          if (advanceFrozen(steps, state, position + 1, nested, emit)) return true
        }
        return false
      case 'take':
        if (state.counts[position] >= step.count) return true
        state.counts[position]++
        if (advanceFrozen(steps, state, position + 1, value, emit)) return true
        return state.counts[position] >= step.count
      case 'drop':
        if (state.counts[position]++ < step.count) return false
        break
      case 'takeWhile':
        if (!step.fn(value, state.indexes[position]++)) return true
        break
      case 'dropWhile':
        if (state.dropping[position]) {
          if (step.fn(value, state.indexes[position]++)) return false
          state.dropping[position] = false
        }
        break
      case 'scan':
        value = step.fn(state.scans[position], value, state.indexes[position]++)
        state.scans[position] = value
        break
    }
  }
  return emit(value)
}

const executeFrozen = (
  source: Iterable<unknown>,
  steps: readonly Step[],
  emit: (value: unknown) => boolean,
): void => {
  if (
    Array.isArray(source) &&
    steps.length === 2 &&
    steps[0].kind === 'map' &&
    steps[1].kind === 'filter'
  ) {
    const mapFn = steps[0].fn
    const filterFn = steps[1].fn
    for (let index = 0; index < source.length; index++) {
      const value = mapFn(source[index], index)
      if (filterFn(value, index) && emit(value)) return
    }
    return
  }

  const state = makeState(steps)
  for (const value of source) {
    if (advanceFrozen(steps, state, 0, value, emit)) return
  }
}

const nestedIterator = (source: Iterable<unknown>, steps: readonly Step[]): Iterable<unknown> => {
  let values = source
  for (const step of steps) {
    switch (step.kind) {
      case 'map':
        values = (function* (upstream, fn) {
          let index = 0
          for (const value of upstream) yield fn(value, index++)
        })(values, step.fn)
        break
      case 'filter':
        values = (function* (upstream, fn) {
          let index = 0
          for (const value of upstream) if (fn(value, index++)) yield value
        })(values, step.fn)
        break
      case 'filterMap':
        values = (function* (upstream, fn) {
          let index = 0
          for (const value of upstream) {
            const result = fn(value, index++) as Option<unknown>
            if (result._tag === 1) yield result.value
          }
        })(values, step.fn)
        break
      case 'flatMap':
        values = (function* (upstream, fn) {
          let index = 0
          for (const value of upstream) yield* fn(value, index++) as Iterable<unknown>
        })(values, step.fn)
        break
      case 'drop':
        values = (function* (upstream, count) {
          let index = 0
          for (const value of upstream) if (index++ >= count) yield value
        })(values, step.count)
        break
      case 'take':
        values = (function* (upstream, count) {
          let index = 0
          for (const value of upstream) {
            if (index++ >= count) return
            yield value
          }
        })(values, step.count)
        break
      case 'takeWhile':
        values = (function* (upstream, fn) {
          let index = 0
          for (const value of upstream) {
            if (!fn(value, index++)) return
            yield value
          }
        })(values, step.fn)
        break
      case 'dropWhile':
        values = (function* (upstream, fn) {
          let dropping = true
          let index = 0
          for (const value of upstream) {
            if (dropping && fn(value, index++)) continue
            dropping = false
            yield value
          }
        })(values, step.fn)
        break
      case 'scan':
        values = (function* (upstream, fn, initial) {
          let state = initial
          let index = 0
          for (const value of upstream) {
            state = fn(state, value, index++)
            yield state
          }
        })(values, step.fn, step.initial)
        break
    }
  }
  return values
}

const buildCurrent = (source: Iterable<number>, steps: readonly Step[]): Iterable<unknown> => {
  let values: Iterable<unknown> = Iter.from(source)
  for (const step of steps) {
    switch (step.kind) {
      case 'map':
        values = Iter.map(step.fn)(values)
        break
      case 'filter':
        values = Iter.filter(step.fn)(values)
        break
      case 'filterMap':
        values = Iter.filterMap(
          step.fn as (value: unknown, index: number) => Option<unknown>,
        )(values)
        break
      case 'flatMap':
        values = Iter.flatMap(
          step.fn as (value: unknown, index: number) => Iterable<unknown>,
        )(values)
        break
      case 'take':
        values = Iter.take(step.count)(values)
        break
      case 'drop':
        values = Iter.drop(step.count)(values)
        break
      case 'takeWhile':
        values = Iter.takeWhile(step.fn)(values)
        break
      case 'dropWhile':
        values = Iter.dropWhile(step.fn)(values)
        break
      case 'scan':
        values = Iter.scan(step.fn, step.initial)(values)
        break
    }
  }
  return values
}

const checksum = (values: readonly unknown[]): number => {
  let total = values.length
  for (let index = 0; index < values.length; index += 97) total += Number(values[index])
  return total
}

const runFrozen = (workload: Workload): number => {
  if (workload.terminal === 'iterate') {
    let total = 0
    for (const value of nestedIterator(workload.source, workload.steps)) total += Number(value)
    return total
  }
  const output: unknown[] = workload.terminal === 'toArrayInto' ? [-7] : []
  let total = 0
  let found = false
  executeFrozen(workload.source, workload.steps, (value) => {
    switch (workload.terminal) {
      case 'collect':
      case 'toArrayInto':
        output.push(value)
        return false
      case 'reduce':
        total += Number(value)
        return false
      case 'find-absent':
        if (Number(value) === -1) {
          found = true
          return true
        }
        return false
      case 'iterate':
        return false
    }
  })
  return workload.terminal === 'reduce'
    ? total
    : workload.terminal === 'find-absent'
      ? Number(found)
      : checksum(output)
}

const runCurrent = (plan: Iterable<unknown>, terminal: Terminal): number => {
  switch (terminal) {
    case 'collect':
      return checksum(Iter.toArray(plan))
    case 'toArrayInto':
      return checksum(Iter.toArrayInto([-7] as unknown[])(plan))
    case 'reduce':
      return Iter.reduce((total: number, value: unknown) => total + Number(value), 0)(plan)
    case 'find-absent':
      return Iter.find((value: unknown) => Number(value) === -1)(plan)._tag
    case 'iterate': {
      let total = 0
      for (const value of plan) total += Number(value)
      return total
    }
  }
}

const makeLongSteps = (count: number): readonly Step[] => {
  const steps: Step[] = []
  for (let stage = 0; stage < count; stage++) {
    if (stage % 3 === 1) {
      steps.push({
        kind: 'filter',
        fn: (value, index) => (Number(value) + index + stage) % 7 !== 0,
      })
    } else {
      steps.push({
        kind: 'map',
        fn: (value, index) => Number(value) + ((index + stage) & 3),
      })
    }
  }
  return steps
}

const makeWorkloads = (size = 4_096): readonly Workload[] => {
  const data = Array.from({ length: size }, (_, index) => index + 1)
  const generatorSource: Iterable<number> = {
    *[Symbol.iterator]() {
      yield* data
    },
  }
  const mapFilter: readonly Step[] = [
    { kind: 'map', fn: (value, index) => Number(value) * 2 + (index & 1) },
    { kind: 'filter', fn: (value, index) => (Number(value) + index) % 3 !== 0 },
  ]
  const workloads: Workload[] = [
    {
      id: ITER_BROAD_CASE_IDS[0],
      sourceKind: 'array',
      source: data,
      steps: mapFilter,
      terminal: 'collect',
      inputSize: size,
    },
    {
      id: ITER_BROAD_CASE_IDS[1],
      sourceKind: 'array',
      source: data,
      steps: mapFilter,
      terminal: 'reduce',
      inputSize: size,
    },
    {
      id: ITER_BROAD_CASE_IDS[2],
      sourceKind: 'array',
      source: data,
      steps: mapFilter,
      terminal: 'find-absent',
      inputSize: size,
    },
    {
      id: ITER_BROAD_CASE_IDS[3],
      sourceKind: 'array',
      source: data,
      steps: [
        { kind: 'drop', count: 512 },
        { kind: 'takeWhile', fn: (value) => Number(value) < size - 128 },
      ],
      terminal: 'collect',
      inputSize: size,
    },
    {
      id: ITER_BROAD_CASE_IDS[4],
      sourceKind: 'array',
      source: data,
      steps: [
        { kind: 'dropWhile', fn: (value) => Number(value) < 512 },
        { kind: 'takeWhile', fn: (value) => Number(value) < size - 128 },
      ],
      terminal: 'collect',
      inputSize: size,
    },
    {
      id: ITER_BROAD_CASE_IDS[5],
      sourceKind: 'array',
      source: data,
      steps: [
        { kind: 'scan', fn: (state, value) => Number(state) + Number(value), initial: 0 },
        {
          kind: 'filterMap',
          fn: (value, index) => (index % 3 === 0 ? some(Number(value)) : none),
        },
      ],
      terminal: 'collect',
      inputSize: size,
    },
    {
      id: ITER_BROAD_CASE_IDS[6],
      sourceKind: 'array',
      source: data,
      steps: [
        { kind: 'flatMap', fn: (value) => [value, Number(value) + 1] },
        { kind: 'map', fn: (value, index) => Number(value) + (index & 1) },
        { kind: 'filter', fn: (value, index) => (Number(value) + index) % 3 !== 0 },
      ],
      terminal: 'collect',
      inputSize: size,
    },
    {
      id: ITER_BROAD_CASE_IDS[7],
      sourceKind: 'array',
      source: data,
      steps: makeLongSteps(10),
      terminal: 'collect',
      inputSize: size,
    },
    {
      id: ITER_BROAD_CASE_IDS[8],
      sourceKind: 'array',
      source: data,
      steps: makeLongSteps(15),
      terminal: 'reduce',
      inputSize: size,
    },
    {
      id: ITER_BROAD_CASE_IDS[9],
      sourceKind: 'array',
      source: data,
      steps: mapFilter,
      terminal: 'toArrayInto',
      inputSize: size,
    },
    {
      id: ITER_BROAD_CASE_IDS[10],
      sourceKind: 'array',
      source: data,
      steps: makeLongSteps(10),
      terminal: 'iterate',
      inputSize: size,
    },
    {
      id: ITER_BROAD_CASE_IDS[11],
      sourceKind: 'set',
      source: new Set(data),
      steps: mapFilter,
      terminal: 'collect',
      inputSize: size,
    },
    {
      id: ITER_BROAD_CASE_IDS[12],
      sourceKind: 'generator',
      source: generatorSource,
      steps: mapFilter,
      terminal: 'collect',
      inputSize: size,
    },
    {
      id: ITER_BROAD_CASE_IDS[13],
      sourceKind: 'generator',
      source: generatorSource,
      steps: makeLongSteps(10),
      terminal: 'reduce',
      inputSize: size,
    },
  ]
  return workloads
}

let measurementSink = 0

const parsePositiveInteger = (argv: readonly string[], flag: string, fallback: number): number => {
  const index = argv.indexOf(flag)
  if (index === -1) return fallback
  const value = Number(argv[index + 1])
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${flag} must be positive`)
  return value
}

const relativeMarginOfError = (low: number, high: number, median: number): number =>
  ((high - low) / (2 * median)) * 100

const measureWorkload = (
  workload: Workload,
  rounds: number,
  minimumBatchItems: number,
  engine: PerfEngine,
): IterBroadPerfCase => {
  const policy = ITER_BROAD_PERF_POLICIES[engine.id]
  const plan = buildCurrent(workload.source, workload.steps)
  const current = (): number => runCurrent(plan, workload.terminal)
  const frozen = (): number => runFrozen(workload)
  const currentOutput = current()
  const frozenOutput = frozen()
  const batchIterations = Math.max(1, Math.ceil(minimumBatchItems / workload.inputSize))
  const targetConsumedItemsPerMicroBatch = 10_000
  const microBatchIterations = consumedItemsMicroBatchIterations(
    workload.inputSize,
    batchIterations,
    targetConsumedItemsPerMicroBatch,
  )
  const measured = runInterleavedPaired(current, frozen, {
    rounds,
    warmupRounds: policy.warmupRounds,
    batchIterations,
    microBatchIterations,
    observe: (currentLast, frozenLast) => {
      measurementSink = Number(currentLast) + Number(frozenLast)
    },
  })
  return {
    id: workload.id,
    sourceKind: workload.sourceKind,
    inputSize: workload.inputSize,
    correctnessOk: Object.is(currentOutput, frozenOutput),
    workerEngine: engine,
    rounds: measured.pairedRatios.length,
    batchIterations,
    sampling: {
      ...measured.sampling,
      targetConsumedItemsPerMicroBatch,
      nominalConsumedItemsPerMicroBatch: microBatchIterations * workload.inputSize,
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

const parseWorkerCaseIndex = (argv: readonly string[]): number | undefined => {
  const index = argv.indexOf('--case-index')
  if (index === -1) return undefined
  const value = Number(argv[index + 1])
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('--case-index must be a non-negative integer')
  }
  return value
}

const workerArguments = (
  engine: PerfEngine,
  caseIndex: number,
  rounds: number,
  minimumBatchItems: number,
): readonly string[] => {
  const benchmarkArguments = [
    fileURLToPath(import.meta.url),
    '--case-index',
    String(caseIndex),
    '--rounds',
    String(rounds),
    '--batch-items',
    String(minimumBatchItems),
  ]
  return engine.id === 'bun-jsc'
    ? ['run', ...benchmarkArguments]
    : ['--import=tsx', ...benchmarkArguments]
}

const runWorker = (
  workload: Workload,
  caseIndex: number,
  rounds: number,
  minimumBatchItems: number,
  engine: PerfEngine,
): WorkerOutcome => {
  const worker = spawnSync(
    process.execPath,
    workerArguments(engine, caseIndex, rounds, minimumBatchItems),
    {
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
    },
  )
  const parsed = parseIterBroadWorkerOutput(
    worker.stdout ?? '',
    worker.status,
    worker.signal,
    {
      caseIndex,
      caseId: workload.id,
      sourceKind: workload.sourceKind,
      inputSize: workload.inputSize,
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
  const policy = ITER_BROAD_PERF_POLICIES[engine.id]
  const rounds = parsePositiveInteger(process.argv, '--rounds', policy.minimumRounds)
  const minimumBatchItems = parsePositiveInteger(
    process.argv,
    '--batch-items',
    policy.minimumBatchItems,
  )
  const workloads = makeWorkloads()
  const workerCaseIndex = parseWorkerCaseIndex(process.argv)
  if (workerCaseIndex !== undefined) {
    const workload = workloads[workerCaseIndex]
    let outcome: WorkerOutcome
    if (!workload) {
      outcome = { ok: false, reason: `unknown workload index ${workerCaseIndex}` }
      process.exitCode = 1
    } else {
      try {
        const result = measureWorkload(workload, rounds, minimumBatchItems, engine)
        outcome = {
          ok: true,
          workerCaseIndex,
          workerCaseId: workload.id,
          workerEngine: engine,
          result,
        }
      } catch (error) {
        outcome = { ok: false, reason: (error as Error).message }
        process.exitCode = 1
      }
    }
    console.log(`${ITER_BROAD_WORKER_MARKER}${JSON.stringify(outcome)}`)
    return
  }

  const cases: IterBroadPerfCase[] = []
  const skipped: string[] = []

  for (let caseIndex = 0; caseIndex < workloads.length; caseIndex++) {
    const workload = workloads[caseIndex]
    const outcome = runWorker(workload, caseIndex, rounds, minimumBatchItems, engine)
    if (outcome.ok) cases.push(outcome.result)
    else skipped.push(`${workload.id}: ${outcome.reason}`)
  }

  const ratios = cases.map((item) => item.medianRatio)
  const summary = {
    count: cases.length,
    expectedCount: ITER_BROAD_CASE_IDS.length,
    geomeanRatio: geomean(ratios),
    minRatio: Math.min(...ratios, Number.POSITIVE_INFINITY),
    allCorrect: cases.every((item) => item.correctnessOk),
    complete: cases.length === ITER_BROAD_CASE_IDS.length && skipped.length === 0,
  }
  const report: IterBroadPerfReport = {
    generatedAt: new Date().toISOString(),
    engine,
    comparison: {
      candidate: '@stopcock/fp current Iter executor',
      reference: 'frozen pre-broadening Iter executor',
      ratio: 'frozenNs / currentNs; greater is faster',
    },
    args: { rounds, minimumBatchItems },
    summary,
    cases,
    skipped,
  }
  const directory = resolve(
    process.env.PERF_ARTIFACT_DIR ?? join(tmpdir(), 'stopcock-fp-performance'),
  )
  await mkdir(directory, { recursive: true })
  const reportPath = join(directory, `iter-broad-${engine.id}.json`)
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const evaluation = evaluateIterBroadPerfReport(report)
  console.log(`\nBroad Iter performance gate (${engine.name})\n`)
  console.log(['case', 'batch', 'median', 'CI95', 'RME', 'correct'].join('\t'))
  for (const item of cases) {
    console.log(
      [
        item.id,
        item.batchIterations,
        item.medianRatio.toFixed(3),
        `[${item.ciLow.toFixed(3)},${item.ciHigh.toFixed(3)}]`,
        `${item.relativeMarginOfError.toFixed(2)}%`,
        item.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(
    `\ngeomean: ${summary.geomeanRatio.toFixed(3)}  min: ${summary.minRatio.toFixed(3)}  sink: ${measurementSink}`,
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
