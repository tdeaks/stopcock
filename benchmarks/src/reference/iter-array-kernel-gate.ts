import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Iter from '../../../packages/fp/src/iter'
import { none, some, type Option } from '../../../packages/fp/src/option'
import { currentPerfEngine, type PerfEngine } from './perf-engine'
import {
  bootstrapMedianCI,
  consumedItemsMicroBatchIterations,
  geomean,
  runInterleavedPaired,
  type InterleavedPairedSampling,
} from './perf-runner'

/**
 * Shipped Array kernels against equivalent hand-written loops, both measured in
 * the same process so a busy machine moves both sides together.
 *
 * Every workload is loop-dominated: the value a terminal is looking for sits at
 * the end of the source, so an early-exit terminal scans the whole array on
 * both sides. A workload whose answer is at index 0 measures plan dispatch
 * rather than execution, and no loop implementation can move it; those are
 * reported separately under `dispatchDominated` and are not gated.
 */

const INPUT_SIZE = 4_096
const TAKE_LIMIT = 4_096

export const ITER_KERNEL_SHAPE_IDS = Object.freeze([
  'map',
  'filter',
  'map-filter',
  'map-filter-take',
  'filterMap-take',
] as const)

export const ITER_KERNEL_TERMINAL_IDS = Object.freeze([
  'toArray',
  'toArrayInto',
  'reduce',
  'find',
  'some',
  'every',
  'count',
  'forEach',
  'first',
  'last',
  'nth',
] as const)

export type IterKernelShapeId = (typeof ITER_KERNEL_SHAPE_IDS)[number]
export type IterKernelTerminalId = (typeof ITER_KERNEL_TERMINAL_IDS)[number]

export const ITER_KERNEL_CASE_IDS: readonly string[] = Object.freeze(
  ITER_KERNEL_SHAPE_IDS.flatMap((shape) =>
    ITER_KERNEL_TERMINAL_IDS.map((terminal) => `${shape}/${terminal}`),
  ),
)

export interface IterKernelPerfPolicy {
  readonly minimumRounds: number
  readonly minimumBatchIterations: number
  readonly warmupRounds: number
  readonly minimumGeomean: number
  readonly minimumCaseRatio: number
  /** Recorded, not enforced. P1A's release target for a shipped kernel. */
  readonly releaseTargetRatio: number
  readonly maximumRme: number
}

export const ITER_KERNEL_PERF_POLICIES = Object.freeze({
  'bun-jsc': Object.freeze({
    minimumRounds: 25,
    minimumBatchIterations: 40,
    warmupRounds: 5,
    minimumGeomean: 0.85,
    minimumCaseRatio: 0.8,
    releaseTargetRatio: 0.9,
    maximumRme: 12,
  }),
  'node-v8': Object.freeze({
    minimumRounds: 25,
    minimumBatchIterations: 40,
    warmupRounds: 15,
    minimumGeomean: 0.7,
    minimumCaseRatio: 0.6,
    releaseTargetRatio: 0.9,
    maximumRme: 12,
  }),
} satisfies Readonly<Record<PerfEngine['id'], IterKernelPerfPolicy>>)

export interface IterKernelPerfCase {
  readonly id: string
  readonly shape: IterKernelShapeId
  readonly terminal: IterKernelTerminalId
  readonly inputSize: number
  readonly correctnessOk: boolean
  readonly gated: boolean
  readonly rounds: number
  readonly batchIterations: number
  readonly sampling: InterleavedPairedSampling
  readonly medianRatio: number
  readonly ciLow: number
  readonly ciHigh: number
  readonly relativeMarginOfError: number
  readonly kernelSamplesNs: readonly number[]
  readonly handSamplesNs: readonly number[]
  readonly pairedRatios: readonly number[]
}

export interface IterKernelPerfReport {
  readonly generatedAt: string
  readonly engine: PerfEngine
  readonly comparison: {
    readonly candidate: string
    readonly reference: string
    readonly ratio: string
  }
  readonly summary: {
    readonly count: number
    readonly expectedCount: number
    readonly geomeanRatio: number
    readonly minRatio: number
    readonly belowReleaseTarget: readonly string[]
    readonly allCorrect: boolean
    readonly complete: boolean
  }
  readonly cases: readonly IterKernelPerfCase[]
  readonly dispatchDominated: readonly IterKernelPerfCase[]
  readonly skipped: readonly string[]
}

export interface IterKernelPerfEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
}

const recordFailure = (failures: string[], condition: boolean, message: string): void => {
  if (!condition) failures.push(message)
}

export const evaluateIterKernelPerfReport = (
  report: IterKernelPerfReport,
): IterKernelPerfEvaluation => {
  const failures: string[] = []
  const supported = report.engine.id === 'bun-jsc' || report.engine.id === 'node-v8'
  const policy = supported
    ? ITER_KERNEL_PERF_POLICIES[report.engine.id]
    : ITER_KERNEL_PERF_POLICIES['bun-jsc']
  recordFailure(failures, supported, `unsupported engine ${report.engine.id}`)

  const gated = report.cases.filter((item) => item.gated)
  const seen = new Set(report.cases.map((item) => item.id))
  for (const id of ITER_KERNEL_CASE_IDS) {
    recordFailure(failures, seen.has(id), `missing shipped kernel row ${id}`)
  }
  recordFailure(
    failures,
    report.summary.expectedCount === ITER_KERNEL_CASE_IDS.length,
    `expected ${ITER_KERNEL_CASE_IDS.length} shipped kernel rows`,
  )
  recordFailure(failures, report.skipped.length === 0, `skipped rows: ${report.skipped.join(', ')}`)
  recordFailure(failures, report.summary.complete, 'kernel report is incomplete')
  recordFailure(failures, report.summary.allCorrect, 'a kernel produced incorrect output')

  for (const item of report.cases) {
    recordFailure(failures, item.correctnessOk, `${item.id}: incorrect output`)
    recordFailure(
      failures,
      item.rounds >= policy.minimumRounds,
      `${item.id}: ${item.rounds} rounds is below ${policy.minimumRounds}`,
    )
    recordFailure(
      failures,
      item.batchIterations >= policy.minimumBatchIterations,
      `${item.id}: batch covers only ${item.batchIterations} iterations`,
    )
    recordFailure(
      failures,
      item.pairedRatios.length === item.rounds &&
        item.kernelSamplesNs.length === item.rounds &&
        item.handSamplesNs.length === item.rounds,
      `${item.id}: raw sample counts do not match rounds`,
    )
    recordFailure(
      failures,
      item.relativeMarginOfError <= policy.maximumRme || item.ciLow >= policy.minimumCaseRatio,
      `${item.id}: RME ${item.relativeMarginOfError.toFixed(2)}% exceeds ${policy.maximumRme}%`,
    )
  }

  const ratios = gated.map((item) => item.medianRatio).filter((ratio) => ratio > 0)
  const computedGeomean = geomean(ratios)
  recordFailure(
    failures,
    computedGeomean >= policy.minimumGeomean,
    `kernel geomean ${computedGeomean.toFixed(3)} is below ${policy.minimumGeomean.toFixed(2)}`,
  )
  for (const item of gated) {
    recordFailure(
      failures,
      item.medianRatio >= policy.minimumCaseRatio,
      `${item.id}: ratio ${item.medianRatio.toFixed(3)} is below ${policy.minimumCaseRatio.toFixed(2)}`,
    )
  }

  return { passed: failures.length === 0, failures: Object.freeze(failures) }
}

// --- workloads ---

const data: readonly number[] = Array.from({ length: INPUT_SIZE }, (_, index) => index)
const LAST = INPUT_SIZE - 1

// Both sides call exactly these, with exactly these arguments. A reference that
// calls a no-argument predicate gets it folded away and stops being a reference.
const double = (value: number, index: number): number => value * 2
const keepAll = (value: number, index: number): boolean => value >= 0
const halveEven = (value: number): Option<number> => (value % 2 === 0 ? some(value / 2) : none)
const atEnd = (value: number, index: number): boolean => index === LAST
const notAtEnd = (value: number, index: number): boolean => index !== LAST

interface Row {
  readonly kernel: () => unknown
  readonly hand: () => unknown
  readonly gated: boolean
}

const plans = {
  map: Iter.map(data, double),
  filter: Iter.filter(data, keepAll),
  'map-filter': Iter.filter(Iter.map(data, double), keepAll),
  'map-filter-take': Iter.take(Iter.filter(Iter.map(data, double), keepAll), TAKE_LIMIT),
  'filterMap-take': Iter.take(Iter.filterMap(data, halveEven), TAKE_LIMIT),
} as const satisfies Record<IterKernelShapeId, Iterable<number>>

/**
 * The hand-written references. Each is the loop a developer writes for that
 * shape and terminal: no plan, no callback indirection, no shared state.
 */
const HAND: Readonly<Record<string, () => unknown>> = {
  'map/toArray': () => {
    const out: number[] = []
    for (let index = 0; index < data.length; index++) out.push(double(data[index] as number, index))
    return out
  },
  'map/toArrayInto': () => {
    const out: number[] = [-7]
    for (let index = 0; index < data.length; index++) out.push(double(data[index] as number, index))
    return out
  },
  'map/reduce': () => {
    let state = 0
    for (let index = 0; index < data.length; index++) state += double(data[index] as number, index)
    return state
  },
  'map/find': () => {
    for (let index = 0; index < data.length; index++) {
      const value = double(data[index] as number, index)
      if (atEnd(value, index)) return some(value)
    }
    return none
  },
  'map/some': () => {
    for (let index = 0; index < data.length; index++) {
      if (atEnd(double(data[index] as number, index), index)) return true
    }
    return false
  },
  'map/every': () => {
    for (let index = 0; index < data.length; index++) {
      if (!notAtEnd(double(data[index] as number, index), index)) return false
    }
    return true
  },
  'map/count': () => {
    let total = 0
    for (let index = 0; index < data.length; index++) {
      if (double(data[index] as number, index) !== Number.NaN) total++
    }
    return total
  },
  'map/forEach': () => {
    let total = 0
    for (let index = 0; index < data.length; index++) total += double(data[index] as number, index)
    return total
  },
  'map/first': () => {
    for (let index = 0; index < data.length; index++)
      return some(double(data[index] as number, index))
    return none
  },
  'map/last': () => {
    let last: number | undefined
    for (let index = 0; index < data.length; index++) last = double(data[index] as number, index)
    return last === undefined ? none : some(last)
  },
  'map/nth': () => {
    for (let index = 0; index < data.length; index++) {
      const value = double(data[index] as number, index)
      if (index === LAST) return some(value)
    }
    return none
  },

  'filter/toArray': () => {
    const out: number[] = []
    for (let index = 0; index < data.length; index++) {
      const value = data[index] as number
      if (keepAll(value, index)) out.push(value)
    }
    return out
  },
  'filter/toArrayInto': () => {
    const out: number[] = [-7]
    for (let index = 0; index < data.length; index++) {
      const value = data[index] as number
      if (keepAll(value, index)) out.push(value)
    }
    return out
  },
  'filter/reduce': () => {
    let state = 0
    for (let index = 0; index < data.length; index++) {
      const value = data[index] as number
      if (keepAll(value, index)) state += value
    }
    return state
  },
  'filter/find': () => {
    let at = 0
    for (let index = 0; index < data.length; index++) {
      const value = data[index] as number
      if (keepAll(value, index) && atEnd(value, at++)) return some(value)
    }
    return none
  },
  'filter/some': () => {
    let at = 0
    for (let index = 0; index < data.length; index++) {
      const value = data[index] as number
      if (keepAll(value, index) && atEnd(value, at++)) return true
    }
    return false
  },
  'filter/every': () => {
    let at = 0
    for (let index = 0; index < data.length; index++) {
      const value = data[index] as number
      if (keepAll(value, index) && !notAtEnd(value, at++)) return false
    }
    return true
  },
  'filter/count': () => {
    let total = 0
    for (let index = 0; index < data.length; index++) {
      if (keepAll(data[index] as number, index)) total++
    }
    return total
  },
  'filter/forEach': () => {
    let total = 0
    for (let index = 0; index < data.length; index++) {
      const value = data[index] as number
      if (keepAll(value, index)) total += value
    }
    return total
  },
  'filter/first': () => {
    for (let index = 0; index < data.length; index++) {
      const value = data[index] as number
      if (keepAll(value, index)) return some(value)
    }
    return none
  },
  'filter/last': () => {
    let last: number | undefined
    for (let index = 0; index < data.length; index++) {
      const value = data[index] as number
      if (keepAll(value, index)) last = value
    }
    return last === undefined ? none : some(last)
  },
  'filter/nth': () => {
    let at = 0
    for (let index = 0; index < data.length; index++) {
      const value = data[index] as number
      if (keepAll(value, index) && at++ === LAST) return some(value)
    }
    return none
  },

  'map-filter/toArray': () => {
    const out: number[] = []
    for (let index = 0; index < data.length; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) out.push(value)
    }
    return out
  },
  'map-filter/toArrayInto': () => {
    const out: number[] = [-7]
    for (let index = 0; index < data.length; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) out.push(value)
    }
    return out
  },
  'map-filter/reduce': () => {
    let state = 0
    for (let index = 0; index < data.length; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) state += value
    }
    return state
  },
  'map-filter/find': () => {
    let at = 0
    for (let index = 0; index < data.length; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index) && atEnd(value, at++)) return some(value)
    }
    return none
  },
  'map-filter/some': () => {
    let at = 0
    for (let index = 0; index < data.length; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index) && atEnd(value, at++)) return true
    }
    return false
  },
  'map-filter/every': () => {
    let at = 0
    for (let index = 0; index < data.length; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index) && !notAtEnd(value, at++)) return false
    }
    return true
  },
  'map-filter/count': () => {
    let total = 0
    for (let index = 0; index < data.length; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) total++
    }
    return total
  },
  'map-filter/forEach': () => {
    let total = 0
    for (let index = 0; index < data.length; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) total += value
    }
    return total
  },
  'map-filter/first': () => {
    for (let index = 0; index < data.length; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) return some(value)
    }
    return none
  },
  'map-filter/last': () => {
    let last: number | undefined
    for (let index = 0; index < data.length; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) last = value
    }
    return last === undefined ? none : some(last)
  },
  'map-filter/nth': () => {
    let at = 0
    for (let index = 0; index < data.length; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index) && at++ === LAST) return some(value)
    }
    return none
  },

  'map-filter-take/toArray': () => {
    const out: number[] = []
    for (let index = 0; index < data.length && out.length < TAKE_LIMIT; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) out.push(value)
    }
    return out
  },
  'map-filter-take/toArrayInto': () => {
    const out: number[] = [-7]
    for (let index = 0; index < data.length && out.length - 1 < TAKE_LIMIT; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) out.push(value)
    }
    return out
  },
  'map-filter-take/reduce': () => {
    let state = 0
    let taken = 0
    for (let index = 0; index < data.length && taken < TAKE_LIMIT; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) {
        taken++
        state += value
      }
    }
    return state
  },
  'map-filter-take/find': () => {
    let taken = 0
    let at = 0
    for (let index = 0; index < data.length && taken < TAKE_LIMIT; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) {
        taken++
        if (atEnd(value, at++)) return some(value)
      }
    }
    return none
  },
  'map-filter-take/some': () => {
    let taken = 0
    let at = 0
    for (let index = 0; index < data.length && taken < TAKE_LIMIT; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) {
        taken++
        if (atEnd(value, at++)) return true
      }
    }
    return false
  },
  'map-filter-take/every': () => {
    let taken = 0
    let at = 0
    for (let index = 0; index < data.length && taken < TAKE_LIMIT; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) {
        taken++
        if (!notAtEnd(value, at++)) return false
      }
    }
    return true
  },
  'map-filter-take/count': () => {
    let total = 0
    for (let index = 0; index < data.length && total < TAKE_LIMIT; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) total++
    }
    return total
  },
  'map-filter-take/forEach': () => {
    let total = 0
    let taken = 0
    for (let index = 0; index < data.length && taken < TAKE_LIMIT; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) {
        taken++
        total += value
      }
    }
    return total
  },
  'map-filter-take/first': () => {
    for (let index = 0; index < data.length && TAKE_LIMIT > 0; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) return some(value)
    }
    return none
  },
  'map-filter-take/last': () => {
    let last: number | undefined
    let taken = 0
    for (let index = 0; index < data.length && taken < TAKE_LIMIT; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) {
        taken++
        last = value
      }
    }
    return last === undefined ? none : some(last)
  },
  'map-filter-take/nth': () => {
    let taken = 0
    let at = 0
    for (let index = 0; index < data.length && taken < TAKE_LIMIT; index++) {
      const value = double(data[index] as number, index)
      if (keepAll(value, index)) {
        taken++
        if (at++ === LAST) return some(value)
      }
    }
    return none
  },

  'filterMap-take/toArray': () => {
    const out: number[] = []
    for (let index = 0; index < data.length && out.length < TAKE_LIMIT; index++) {
      const result = halveEven(data[index] as number)
      if (result._tag === 1) out.push(result.value)
    }
    return out
  },
  'filterMap-take/toArrayInto': () => {
    const out: number[] = [-7]
    for (let index = 0; index < data.length && out.length - 1 < TAKE_LIMIT; index++) {
      const result = halveEven(data[index] as number)
      if (result._tag === 1) out.push(result.value)
    }
    return out
  },
  'filterMap-take/reduce': () => {
    let state = 0
    let taken = 0
    for (let index = 0; index < data.length && taken < TAKE_LIMIT; index++) {
      const result = halveEven(data[index] as number)
      if (result._tag === 1) {
        taken++
        state += result.value
      }
    }
    return state
  },
  'filterMap-take/find': () => {
    let taken = 0
    let at = 0
    for (let index = 0; index < data.length && taken < TAKE_LIMIT; index++) {
      const result = halveEven(data[index] as number)
      if (result._tag === 1) {
        taken++
        if (atEnd(result.value, at++)) return some(result.value)
      }
    }
    return none
  },
  'filterMap-take/some': () => {
    let taken = 0
    let at = 0
    for (let index = 0; index < data.length && taken < TAKE_LIMIT; index++) {
      const result = halveEven(data[index] as number)
      if (result._tag === 1) {
        taken++
        if (atEnd(result.value, at++)) return true
      }
    }
    return false
  },
  'filterMap-take/every': () => {
    let taken = 0
    let at = 0
    for (let index = 0; index < data.length && taken < TAKE_LIMIT; index++) {
      const result = halveEven(data[index] as number)
      if (result._tag === 1) {
        taken++
        if (!notAtEnd(result.value, at++)) return false
      }
    }
    return true
  },
  'filterMap-take/count': () => {
    let total = 0
    for (let index = 0; index < data.length && total < TAKE_LIMIT; index++) {
      const result = halveEven(data[index] as number)
      if (result._tag === 1) total++
    }
    return total
  },
  'filterMap-take/forEach': () => {
    let total = 0
    let taken = 0
    for (let index = 0; index < data.length && taken < TAKE_LIMIT; index++) {
      const result = halveEven(data[index] as number)
      if (result._tag === 1) {
        taken++
        total += result.value
      }
    }
    return total
  },
  'filterMap-take/first': () => {
    for (let index = 0; index < data.length && TAKE_LIMIT > 0; index++) {
      const result = halveEven(data[index] as number)
      if (result._tag === 1) return some(result.value)
    }
    return none
  },
  'filterMap-take/last': () => {
    let last: number | undefined
    let taken = 0
    for (let index = 0; index < data.length && taken < TAKE_LIMIT; index++) {
      const result = halveEven(data[index] as number)
      if (result._tag === 1) {
        taken++
        last = result.value
      }
    }
    return last === undefined ? none : some(last)
  },
  'filterMap-take/nth': () => {
    let taken = 0
    let at = 0
    for (let index = 0; index < data.length && taken < TAKE_LIMIT; index++) {
      const result = halveEven(data[index] as number)
      if (result._tag === 1) {
        taken++
        if (at++ === LAST) return some(result.value)
      }
    }
    return none
  },
}

const kernelRun = (shape: IterKernelShapeId, terminal: IterKernelTerminalId): (() => unknown) => {
  const plan = plans[shape]
  switch (terminal) {
    case 'toArray':
      return () => Iter.toArray(plan)
    case 'toArrayInto':
      return () => Iter.toArrayInto(plan, [-7] as number[])
    case 'reduce':
      return () => Iter.reduce(plan, (state: number, value) => state + value, 0)
    case 'find':
      return () => Iter.find(plan, atEnd)
    case 'some':
      return () => Iter.some(plan, atEnd)
    case 'every':
      return () => Iter.every(plan, notAtEnd)
    case 'count':
      return () => Iter.count(plan)
    case 'forEach': {
      return () => {
        let total = 0
        Iter.forEach(plan, (value) => {
          total += value
        })
        return total
      }
    }
    case 'first':
      return () => Iter.first(plan)
    case 'last':
      return () => Iter.last(plan)
    case 'nth':
      return () => Iter.nth(plan, LAST)
  }
}

/**
 * `first` on a shape with no filtering answers from the very first element, so
 * the row measures plan dispatch rather than the loop. Those rows are reported
 * but not gated; no loop implementation can change them.
 */
const isDispatchDominated = (shape: IterKernelShapeId, terminal: IterKernelTerminalId): boolean =>
  terminal === 'first'

const sameOutput = (left: unknown, right: unknown): boolean => {
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
    )
  }
  if (
    typeof left === 'object' &&
    left !== null &&
    typeof right === 'object' &&
    right !== null &&
    '_tag' in left &&
    '_tag' in right
  ) {
    const a = left as Option<unknown>
    const b = right as Option<unknown>
    return (
      a._tag === b._tag && (a._tag === 0 || Object.is(a.value, (b as { value: unknown }).value))
    )
  }
  return Object.is(left, right)
}

let measurementSink = 0

const relativeMarginOfError = (low: number, high: number, median: number): number =>
  ((high - low) / (2 * median)) * 100

const artifactDirectory = (): string =>
  resolve(process.env.PERF_ARTIFACT_DIR ?? join(tmpdir(), 'stopcock-fp-performance'))

const main = async (): Promise<void> => {
  const engine = currentPerfEngine()
  const policy =
    ITER_KERNEL_PERF_POLICIES[engine.id as 'bun-jsc' | 'node-v8'] ??
    ITER_KERNEL_PERF_POLICIES['bun-jsc']
  const cases: IterKernelPerfCase[] = []
  const dispatchDominated: IterKernelPerfCase[] = []
  const skipped: string[] = []

  for (const shape of ITER_KERNEL_SHAPE_IDS) {
    for (const terminal of ITER_KERNEL_TERMINAL_IDS) {
      const id = `${shape}/${terminal}`
      try {
        const kernel = kernelRun(shape, terminal)
        const hand = HAND[id]
        if (!hand) throw new Error('no hand-written reference')
        const correctnessOk = sameOutput(kernel(), hand())
        const microBatchIterations = consumedItemsMicroBatchIterations(
          INPUT_SIZE,
          policy.minimumBatchIterations,
          10_000,
        )
        const measured = runInterleavedPaired(kernel, hand, {
          rounds: policy.minimumRounds,
          warmupRounds: policy.warmupRounds,
          batchIterations: policy.minimumBatchIterations,
          microBatchIterations,
          observe: (kernelLast, handLast) => {
            measurementSink +=
              (Array.isArray(kernelLast) ? kernelLast.length : 1) +
              (Array.isArray(handLast) ? handLast.length : 1)
          },
        })
        const row: IterKernelPerfCase = {
          id,
          shape,
          terminal,
          inputSize: INPUT_SIZE,
          correctnessOk,
          gated: !isDispatchDominated(shape, terminal),
          rounds: measured.pairedRatios.length,
          batchIterations: policy.minimumBatchIterations,
          sampling: measured.sampling,
          medianRatio: measured.medianRatio,
          ciLow: measured.ciLow,
          ciHigh: measured.ciHigh,
          relativeMarginOfError: relativeMarginOfError(
            measured.ciLow,
            measured.ciHigh,
            measured.medianRatio,
          ),
          kernelSamplesNs: measured.aSamples,
          handSamplesNs: measured.bSamples,
          pairedRatios: measured.pairedRatios,
        }
        cases.push(row)
        if (!row.gated) dispatchDominated.push(row)
      } catch (error) {
        skipped.push(`${id}: ${(error as Error).message}`)
      }
    }
  }

  const gatedRatios = cases.filter((item) => item.gated).map((item) => item.medianRatio)
  const report: IterKernelPerfReport = {
    generatedAt: new Date().toISOString(),
    engine,
    comparison: {
      candidate: '@stopcock/fp generated Iter Array kernels',
      reference: 'hand-written indexed loops',
      ratio: 'handNs / kernelNs; greater is faster',
    },
    summary: {
      count: cases.length,
      expectedCount: ITER_KERNEL_CASE_IDS.length,
      geomeanRatio: geomean(gatedRatios),
      minRatio: Math.min(...gatedRatios, Number.POSITIVE_INFINITY),
      belowReleaseTarget: cases
        .filter((item) => item.gated && item.medianRatio < policy.releaseTargetRatio)
        .map((item) => item.id),
      allCorrect: cases.every((item) => item.correctnessOk),
      complete: cases.length === ITER_KERNEL_CASE_IDS.length && skipped.length === 0,
    },
    cases,
    dispatchDominated,
    skipped,
  }

  const directory = artifactDirectory()
  await mkdir(directory, { recursive: true })
  const reportPath = join(directory, `iter-array-kernels-${engine.id}.json`)
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const evaluation = evaluateIterKernelPerfReport(report)
  console.log(`\nIter Array kernel gate (${engine.name}), n=${INPUT_SIZE}\n`)
  console.log(['case', 'median', 'CI95', 'RME', 'gated', 'correct'].join('\t'))
  for (const item of cases) {
    console.log(
      [
        item.id,
        item.medianRatio.toFixed(3),
        `[${item.ciLow.toFixed(3)},${item.ciHigh.toFixed(3)}]`,
        `${item.relativeMarginOfError.toFixed(1)}%`,
        item.gated ? 'yes' : 'no',
        item.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(
    `\ngated geomean: ${report.summary.geomeanRatio.toFixed(3)}  min: ${report.summary.minRatio.toFixed(3)}  sink: ${measurementSink}`,
  )
  for (const failure of evaluation.failures) console.error(`FAIL\t${failure}`)
  console.log(`raw report: ${reportPath}`)
  if (!evaluation.passed) process.exitCode = 1
}

export const iterKernelBootstrapMedianCI = bootstrapMedianCI

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
