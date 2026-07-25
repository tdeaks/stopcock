import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Iter from '../../../packages/fp/src/iter'
import { none, some } from '../../../packages/fp/src/option'
import { currentPerfEngine, type PerfEngine } from './perf-engine'
import {
  geomean,
  consumedItemsMicroBatchIterations,
  runInterleavedPaired,
  type InterleavedPairedSampling,
} from './perf-runner'

/**
 * Shipped typed-array kernels against the loop a developer writes over the same
 * view, both measured in the same process.
 *
 * The reference is a native indexed loop over a Float64Array, which is what
 * P1B's target is stated against. Before admission these same rows ran the
 * generic iterable executor and measured a 0.075 geomean against that
 * reference, so the numbers here are the whole of the gain.
 */

const INPUT_SIZE = 4_096

export const ITER_VIEW_SHAPE_IDS = Object.freeze(['map', 'filter', 'map-filter'] as const)

export const ITER_VIEW_TERMINAL_IDS = Object.freeze([
  'toArray',
  'toArrayInto',
  'reduce',
  'count',
  'forEach',
  'last',
] as const)

export type IterViewShapeId = (typeof ITER_VIEW_SHAPE_IDS)[number]
export type IterViewTerminalId = (typeof ITER_VIEW_TERMINAL_IDS)[number]

export const ITER_VIEW_CASE_IDS: readonly string[] = Object.freeze(
  ITER_VIEW_SHAPE_IDS.flatMap((shape) =>
    ITER_VIEW_TERMINAL_IDS.map((terminal) => `${shape}/${terminal}`),
  ),
)

/**
 * What the byte spend buys, measured on Bun 1.3.14 at n=4096 as the median of
 * paired in-process sessions against the same hand-written loop over the same
 * view. `before` is the generic iterable executor this branch replaces.
 */
export const ITER_VIEW_MEASURED_GAIN = Object.freeze([
  Object.freeze({ row: 'map/toArray', before: 0.184, after: 0.942 }),
  Object.freeze({ row: 'map/reduce', before: 0.096, after: 0.998 }),
  Object.freeze({ row: 'map/last', before: 0.071, after: 1.273 }),
  Object.freeze({ row: 'filter/count', before: 0.072, after: 3.719 }),
  Object.freeze({ row: 'map-filter/reduce', before: 0.035, after: 0.888 }),
  Object.freeze({ row: 'map-filter/last', before: 0.026, after: 0.976 }),
])

/**
 * Typed arrays get their own kernel functions rather than joining the Array
 * ones. One shared function that reads elements from both specialises for
 * neither: with the source kinds sharing kernels, the Array rows measured a
 * 0.528 geomean against an otherwise identical module that had only ever seen
 * Arrays, and the effect inverted when the two module instances swapped roles.
 * Split into two families, the same comparison measures 1.00.
 */
export const ITER_VIEW_SHARED_KERNEL_COST = Object.freeze({
  sharedGeomean: 0.528,
  sharedMinimum: 0.149,
  splitGeomean: 1.002,
  splitMinimum: 0.554,
})

export interface IterViewFloorException {
  readonly id: string
  readonly owner: string
  readonly reason: string
}

/**
 * `forEach` ships below the floor for the same reason it does on the Array
 * matrix: the hand reference inlines the effect, and the public terminal forces
 * one indirect call per element. The alternative is the generic path at 0.03 on
 * these rows, so shipping below the floor is the faster choice for callers and
 * the floor stays where it is.
 */
export const ITER_VIEW_FLOOR_EXCEPTIONS: readonly IterViewFloorException[] = Object.freeze([
  Object.freeze({
    id: 'forEach',
    owner: 'S11',
    reason: 'per-element indirect call through the public terminal API',
  }),
])

export const iterViewFloorExceptionFor = (id: string): IterViewFloorException | undefined => {
  const terminal = id.slice(id.indexOf('/') + 1)
  return ITER_VIEW_FLOOR_EXCEPTIONS.find((row) => row.id === terminal)
}

export interface IterViewPerfPolicy {
  readonly minimumRounds: number
  readonly minimumBatchIterations: number
  readonly warmupRounds: number
  readonly minimumGeomean: number
  readonly minimumCaseRatio: number
  readonly maximumRme: number
}

export const ITER_VIEW_PERF_POLICIES = Object.freeze({
  'bun-jsc': Object.freeze({
    minimumRounds: 25,
    minimumBatchIterations: 40,
    warmupRounds: 5,
    minimumGeomean: 0.85,
    minimumCaseRatio: 0.75,
    maximumRme: 12,
  }),
  'node-v8': Object.freeze({
    minimumRounds: 25,
    minimumBatchIterations: 40,
    warmupRounds: 15,
    minimumGeomean: 0.7,
    minimumCaseRatio: 0.6,
    maximumRme: 12,
  }),
} satisfies Readonly<Record<PerfEngine['id'], IterViewPerfPolicy>>)

export interface IterViewPerfCase {
  readonly id: string
  readonly shape: IterViewShapeId
  readonly terminal: IterViewTerminalId
  readonly inputSize: number
  readonly correctnessOk: boolean
  readonly rounds: number
  readonly batchIterations: number
  readonly sampling: InterleavedPairedSampling
  readonly medianRatio: number
  readonly ciLow: number
  readonly ciHigh: number
  readonly relativeMarginOfError: number
  readonly pairedRatios: readonly number[]
}

export interface IterViewPerfReport {
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
    readonly allCorrect: boolean
    readonly complete: boolean
  }
  readonly cases: readonly IterViewPerfCase[]
  readonly skipped: readonly string[]
}

export interface IterViewPerfEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
  readonly acceptedBelowFloor: readonly string[]
}

const recordFailure = (failures: string[], condition: boolean, message: string): void => {
  if (!condition) failures.push(message)
}

export const evaluateIterViewPerfReport = (report: IterViewPerfReport): IterViewPerfEvaluation => {
  const failures: string[] = []
  const supported = report.engine.id === 'bun-jsc' || report.engine.id === 'node-v8'
  const policy = supported
    ? ITER_VIEW_PERF_POLICIES[report.engine.id]
    : ITER_VIEW_PERF_POLICIES['bun-jsc']
  recordFailure(failures, supported, `unsupported engine ${report.engine.id}`)

  const seen = new Set(report.cases.map((item) => item.id))
  for (const id of ITER_VIEW_CASE_IDS) {
    recordFailure(failures, seen.has(id), `missing shipped view kernel row ${id}`)
  }
  recordFailure(failures, report.skipped.length === 0, `skipped rows: ${report.skipped.join(', ')}`)
  recordFailure(failures, report.summary.complete, 'view kernel report is incomplete')
  recordFailure(failures, report.summary.allCorrect, 'a view kernel produced incorrect output')

  for (const item of report.cases) {
    recordFailure(failures, item.correctnessOk, `${item.id}: incorrect output`)
    recordFailure(
      failures,
      item.rounds >= policy.minimumRounds,
      `${item.id}: ${item.rounds} rounds is below ${policy.minimumRounds}`,
    )
    recordFailure(
      failures,
      item.relativeMarginOfError <= policy.maximumRme || item.ciLow >= policy.minimumCaseRatio,
      `${item.id}: RME ${item.relativeMarginOfError.toFixed(2)}% exceeds ${policy.maximumRme}%`,
    )
  }

  const ratios = report.cases.map((item) => item.medianRatio).filter((ratio) => ratio > 0)
  const computedGeomean = geomean(ratios)
  recordFailure(
    failures,
    computedGeomean >= policy.minimumGeomean,
    `view kernel geomean ${computedGeomean.toFixed(3)} is below ${policy.minimumGeomean.toFixed(2)}`,
  )

  const accepted: string[] = []
  for (const item of report.cases) {
    if (item.medianRatio >= policy.minimumCaseRatio) continue
    const exception = iterViewFloorExceptionFor(item.id)
    if (exception === undefined) {
      recordFailure(
        failures,
        false,
        `${item.id}: ratio ${item.medianRatio.toFixed(3)} is below ${policy.minimumCaseRatio.toFixed(2)}`,
      )
      continue
    }
    accepted.push(
      `${item.id}: ratio ${item.medianRatio.toFixed(3)} below ${policy.minimumCaseRatio.toFixed(2)}, accepted until ${exception.owner} (${exception.reason})`,
    )
  }

  return {
    passed: failures.length === 0,
    failures: Object.freeze(failures),
    acceptedBelowFloor: Object.freeze(accepted),
  }
}

// --- workloads ---

const data = new Float64Array(INPUT_SIZE)
for (let index = 0; index < INPUT_SIZE; index++) data[index] = index

const double = (value: number, index: number): number => value * 2
const keepAll = (value: number, index: number): boolean => value >= 0

const planFor = (shape: IterViewShapeId): Iterable<number> => {
  switch (shape) {
    case 'map':
      return Iter.map(data, double)
    case 'filter':
      return Iter.filter(data, keepAll)
    case 'map-filter':
      return Iter.filter(Iter.map(data, double), keepAll)
  }
}

const kernelRun = (shape: IterViewShapeId, terminal: IterViewTerminalId): (() => unknown) => {
  const plan = planFor(shape)
  switch (terminal) {
    case 'toArray':
      return () => Iter.toArray(plan)
    case 'toArrayInto':
      return () => Iter.toArrayInto(plan, [-7] as number[])
    case 'reduce':
      return () => Iter.reduce(plan, (state: number, value) => state + value, 0)
    case 'count':
      return () => Iter.count(plan)
    case 'forEach':
      return () => {
        let total = 0
        Iter.forEach(plan, (value) => {
          total += value
        })
        return total
      }
    case 'last':
      return () => Iter.last(plan)
  }
}

/** The stage a shape applies to the raw element before the terminal sees it. */
const staged = (shape: IterViewShapeId, value: number, index: number): number =>
  shape === 'filter' ? value : double(value, index)

const handRun = (shape: IterViewShapeId, terminal: IterViewTerminalId): (() => unknown) => {
  const keep = shape === 'map' ? undefined : keepAll
  switch (terminal) {
    case 'toArray':
    case 'toArrayInto':
      return () => {
        const out: number[] = terminal === 'toArray' ? [] : [-7]
        for (let index = 0; index < data.length; index++) {
          const value = staged(shape, data[index] as number, index)
          if (keep === undefined || keep(value, index)) out.push(value)
        }
        return out
      }
    case 'reduce':
      return () => {
        let state = 0
        for (let index = 0; index < data.length; index++) {
          const value = staged(shape, data[index] as number, index)
          if (keep === undefined || keep(value, index)) state += value
        }
        return state
      }
    case 'count':
      return () => {
        let total = 0
        for (let index = 0; index < data.length; index++) {
          const value = staged(shape, data[index] as number, index)
          if (keep === undefined || keep(value, index)) total++
        }
        return total
      }
    case 'forEach':
      return () => {
        let total = 0
        for (let index = 0; index < data.length; index++) {
          const value = staged(shape, data[index] as number, index)
          if (keep === undefined || keep(value, index)) total += value
        }
        return total
      }
    case 'last':
      return () => {
        let last: number | undefined
        for (let index = 0; index < data.length; index++) {
          const value = staged(shape, data[index] as number, index)
          if (keep === undefined || keep(value, index)) last = value
        }
        return last === undefined ? none : some(last)
      }
  }
}

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
    const a = left as { _tag: number; value?: unknown }
    const b = right as { _tag: number; value?: unknown }
    return a._tag === b._tag && (a._tag === 0 || Object.is(a.value, b.value))
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
    ITER_VIEW_PERF_POLICIES[engine.id as 'bun-jsc' | 'node-v8'] ??
    ITER_VIEW_PERF_POLICIES['bun-jsc']
  const cases: IterViewPerfCase[] = []
  const skipped: string[] = []

  for (const shape of ITER_VIEW_SHAPE_IDS) {
    for (const terminal of ITER_VIEW_TERMINAL_IDS) {
      const id = `${shape}/${terminal}`
      try {
        const kernel = kernelRun(shape, terminal)
        const hand = handRun(shape, terminal)
        const correctnessOk = sameOutput(kernel(), hand())
        const measured = runInterleavedPaired(kernel, hand, {
          rounds: policy.minimumRounds,
          warmupRounds: policy.warmupRounds,
          batchIterations: policy.minimumBatchIterations,
          microBatchIterations: consumedItemsMicroBatchIterations(
            INPUT_SIZE,
            policy.minimumBatchIterations,
            10_000,
          ),
          observe: (kernelLast, handLast) => {
            measurementSink +=
              (Array.isArray(kernelLast) ? kernelLast.length : 1) +
              (Array.isArray(handLast) ? handLast.length : 1)
          },
        })
        cases.push({
          id,
          shape,
          terminal,
          inputSize: INPUT_SIZE,
          correctnessOk,
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
          pairedRatios: measured.pairedRatios,
        })
      } catch (error) {
        skipped.push(`${id}: ${(error as Error).message}`)
      }
    }
  }

  const ratios = cases.map((item) => item.medianRatio)
  const report: IterViewPerfReport = {
    generatedAt: new Date().toISOString(),
    engine,
    comparison: {
      candidate: '@stopcock/fp generated Iter typed-array kernels',
      reference: 'hand-written indexed loops over the same view',
      ratio: 'handNs / kernelNs; greater is faster',
    },
    summary: {
      count: cases.length,
      expectedCount: ITER_VIEW_CASE_IDS.length,
      geomeanRatio: geomean(ratios),
      minRatio: Math.min(...ratios, Number.POSITIVE_INFINITY),
      allCorrect: cases.every((item) => item.correctnessOk),
      complete: cases.length === ITER_VIEW_CASE_IDS.length && skipped.length === 0,
    },
    cases,
    skipped,
  }

  const directory = artifactDirectory()
  await mkdir(directory, { recursive: true })
  const reportPath = join(directory, `iter-typed-array-kernels-${engine.id}.json`)
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const evaluation = evaluateIterViewPerfReport(report)
  console.log(`\nIter typed-array kernel gate (${engine.name}), n=${INPUT_SIZE}\n`)
  console.log(['case', 'median', 'CI95', 'RME', 'correct'].join('\t'))
  for (const item of cases) {
    console.log(
      [
        item.id,
        item.medianRatio.toFixed(3),
        `[${item.ciLow.toFixed(3)},${item.ciHigh.toFixed(3)}]`,
        `${item.relativeMarginOfError.toFixed(1)}%`,
        item.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(
    `\ngeomean: ${report.summary.geomeanRatio.toFixed(3)}  min: ${report.summary.minRatio.toFixed(3)}  sink: ${measurementSink}`,
  )
  for (const accepted of evaluation.acceptedBelowFloor) console.log(`BELOW FLOOR\t${accepted}`)
  for (const failure of evaluation.failures) console.error(`FAIL\t${failure}`)
  console.log(`raw report: ${reportPath}`)
  if (!evaluation.passed) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
