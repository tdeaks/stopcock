/**
 * S7 performance lanes.
 *
 * The old pipe-dispatch gate measured one thing: root `pipe` against a frozen
 * snapshot of itself. That single number stops meaning anything once the tiers
 * exist, because "fused" is about to be four different runners with four
 * different jobs. This splits it:
 *
 * - sequential: the dependency-free core from S6, measured directly. Root does
 *   not route through it until S8, so this is the only place it is visible, and
 *   it is the denominator the other lanes are expressed in.
 * - compact: declared and inactive. Nothing implements it before S9, and an
 *   absent lane is easier to forget than an inactive one.
 * - optimized fusion: the explicit fusion entry, carrying the frozen
 *   pre-hot-identity baseline that used to belong to root, and the floors that
 *   came with it. Not one number is moved here; the same policy is applied to
 *   the entry that now owns the behaviour.
 * - compiler: `compile()` execution, in sequential units. Its floors stay in
 *   compiler-perf-gate.ts; duplicating them here would create a second place to
 *   argue with.
 *
 * Every ratio is measured against a denominator sampled in the same process and
 * paired ABBA, and the reported number is the median of per-pair ratios. A
 * cross-process denominator drifts with the machine and reports regressions
 * that are not there. One pipe call is under this clock's resolution, so every
 * sample is a batch and the per-operation cost is derived from it.
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as A from '../../../packages/fp/src/array'
import { compile, type Runner } from '../../../packages/fp-optimizer/src/compile'
import { pipe as optimizedPipe } from '../../../packages/fp-optimizer/src/index'
import { sequentialPipe } from '../../../packages/fp/src/internal/sequential'
import { currentPerfEngine } from './perf-engine'
import { PERF_PROFILE_ENV } from './perf-profile-contract'
import { describeHost, resolveProfile } from './perf-profile-gate'
import { geomean, runPaired } from './perf-runner'
import { baselinePipe } from './pipe-dispatch-baseline'
import { PIPE_DISPATCH_POLICIES, type PipeDispatchCaseId } from './pipe-dispatch-gate'

export const FROZEN_PORTABLE_BASELINE_ID = 'pre-hot-identity-front-cache-v1'

export type PerfLaneId = 'sequential' | 'compact' | 'optimized-fusion' | 'compiler'
export type PerfLaneStatus = 'active' | 'inactive'

export interface PerfLane {
  readonly id: PerfLaneId
  readonly status: PerfLaneStatus
  /** What is timed. */
  readonly subject: string
  /** What it is divided by, measured in the same process. */
  readonly denominator: string
  /** Which gate owns this lane's pass/fail floors. */
  readonly floorOwner: string
  /** Why an inactive lane has no rows, and which stage activates it. */
  readonly inactiveReason?: string
  readonly description: string
}

export const S7_PERF_LANES: readonly PerfLane[] = Object.freeze([
  Object.freeze({
    id: 'sequential',
    status: 'active',
    subject: 'sequentialPipe from packages/fp/src/internal/sequential.ts',
    denominator: 'hand-written left-to-right application of the same steps',
    floorOwner: 'none yet; see S7_LANE_FLOOR_DEFERRALS',
    description:
      'The S6 sequential core, measured directly because root does not use it before S8.',
  }),
  Object.freeze({
    id: 'compact',
    status: 'inactive',
    subject: '@stopcock/fp/fusion (compact runner)',
    denominator: 'sequential lane',
    floorOwner: 'S1C COMPACT_SIZE_FIRST_FLOOR, once rows exist',
    inactiveReason:
      'No compact fusion runner exists before S9; ./fusion is the optimized implementation today.',
    description: 'Size-first fusion runner rows.',
  }),
  Object.freeze({
    id: 'optimized-fusion',
    status: 'active',
    subject: 'pipe from @stopcock/fp/fusion/optimized',
    denominator: `frozen portable baseline ${FROZEN_PORTABLE_BASELINE_ID}`,
    floorOwner: 'PIPE_DISPATCH_POLICIES, inherited unchanged from the root dispatch gate',
    description:
      'Explicit optimized fusion against the frozen baseline root used to be measured against.',
  }),
  Object.freeze({
    id: 'compiler',
    status: 'active',
    subject: 'compile() runner execution',
    denominator: 'sequential lane',
    floorOwner: 'compiler-perf-gate.ts and compiler-operation-perf-gate.ts',
    description: 'Ahead-of-time compiled pipelines, expressed in sequential units.',
  }),
])

/**
 * Floors that deliberately do not exist yet, and who owns them. Recorded so an
 * absent floor stays visible instead of reading as a lane that passes.
 */
export const S7_LANE_FLOOR_DEFERRALS = Object.freeze([
  Object.freeze({
    lane: 'sequential' as const,
    owner: 'S8',
    reason:
      'Sequential becomes the root path at the cutover. Freezing a floor against a module nothing calls would pin noise.',
  }),
  Object.freeze({
    lane: 'compact' as const,
    owner: 'S9',
    reason: 'No implementation to measure. S1C already pre-approved the size-first floor.',
  }),
  Object.freeze({
    lane: 'compiler' as const,
    owner: 'S7 compiler-perf-gate.ts',
    reason: 'Compiler floors are stratified there; a second copy here would drift.',
  }),
])

/**
 * Cases that cannot be measured, with what stops them.
 *
 * The frozen baseline rebuilds a cached plan's bindings by reading `fn`/`a1`/
 * `a2` off the operator function. e0becf5 moved bindings into a module-private
 * trusted table, so that read now yields nothing and the fused kernel calls
 * undefined. It only shows on the fresh-operator path, where the plan is a
 * front-cache hit but the operator identities are new.
 *
 * The same failure reproduces in the pre-existing pipe-dispatch gate on this
 * branch, which reports both fresh cases as skipped. Repairing the baseline
 * would mean adding trusted-table lookups to the denominator and making it
 * slower, which would flatter every ratio measured against it, so the lane
 * carries the blocker instead. A blocked case that starts working is a
 * failure: the declaration has to be removed rather than left to rot.
 */
export const S7_LANE_BLOCKERS = Object.freeze([
  Object.freeze({
    lane: 'optimized-fusion' as const,
    case: 'fresh-2-step' as const,
    owner: 'pipe-dispatch-baseline.ts, broken by e0becf5 before S6',
    symptom: 'f0 is not a function',
  }),
  Object.freeze({
    lane: 'optimized-fusion' as const,
    case: 'fresh-3-step' as const,
    owner: 'pipe-dispatch-baseline.ts, broken by e0becf5 before S6',
    symptom: 'f0 is not a function',
  }),
])

export const LANE_CASE_IDS: readonly PipeDispatchCaseId[] = Object.freeze([
  'stable-2-step',
  'stable-6-step',
  'fresh-2-step',
  'fresh-3-step',
])

export interface LaneRow {
  readonly lane: PerfLaneId
  readonly case: PipeDispatchCaseId
  /** Why this case produced no numbers, or null when it did. */
  readonly blockedReason: string | null
  readonly correctnessOk: boolean
  readonly rounds: number
  readonly batchIterations: number
  /** denominatorNs / subjectNs, median of per-pair ratios. Greater is faster. */
  readonly medianRatio: number
  readonly ciLow: number
  readonly ciHigh: number
  readonly relativeMarginOfError: number
  readonly subjectNsPerOperation: number
  readonly denominatorNsPerOperation: number
}

export interface LaneReport {
  readonly generatedAt: string
  readonly engineId: 'bun-jsc' | 'node-v8'
  readonly lanes: readonly PerfLane[]
  readonly rows: readonly LaneRow[]
}

const median = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((left, right) => left - right)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const relativeMarginOfError = (low: number, high: number, centre: number): number =>
  ((high - low) / (2 * centre)) * 100

export const evaluateLaneReport = (report: LaneReport): string[] => {
  const failures: string[] = []
  const policy = PIPE_DISPATCH_POLICIES[report.engineId]
  const declaredById = new Map(S7_PERF_LANES.map((lane) => [lane.id, lane]))

  for (const lane of S7_PERF_LANES) {
    const reported = report.lanes.filter((candidate) => candidate.id === lane.id)
    if (reported.length !== 1) {
      failures.push(`lane ${lane.id} appears ${reported.length} times; expected once`)
      continue
    }
    if (reported[0].status !== lane.status) {
      failures.push(`lane ${lane.id} reports status ${reported[0].status}`)
    }
  }
  for (const lane of report.lanes) {
    if (!declaredById.has(lane.id)) failures.push(`undeclared lane ${lane.id}`)
  }

  for (const lane of S7_PERF_LANES) {
    const rows = report.rows.filter((row) => row.lane === lane.id)
    if (lane.status === 'inactive') {
      if (rows.length > 0) {
        failures.push(`inactive lane ${lane.id} reported ${rows.length} rows`)
      }
      const reason = report.lanes.find((candidate) => candidate.id === lane.id)?.inactiveReason
      if (reason === undefined || !/\bS\d+\b/u.test(reason)) {
        failures.push(`inactive lane ${lane.id} does not name the stage that activates it`)
      }
      continue
    }

    for (const id of LANE_CASE_IDS) {
      const row = rows.find((candidate) => candidate.case === id)
      if (row === undefined) {
        failures.push(`lane ${lane.id} is missing case ${id}`)
        continue
      }
      const blocker = S7_LANE_BLOCKERS.find(
        (candidate) => candidate.lane === lane.id && candidate.case === id,
      )
      if (row.blockedReason !== null) {
        if (blocker === undefined) {
          failures.push(`${lane.id}/${id} is blocked without a declaration: ${row.blockedReason}`)
        } else if (!row.blockedReason.includes(blocker.symptom)) {
          failures.push(
            `${lane.id}/${id} is blocked by "${row.blockedReason}", not the declared "${blocker.symptom}"`,
          )
        }
        continue
      }
      if (blocker !== undefined) {
        failures.push(
          `${lane.id}/${id} is declared blocked by ${blocker.owner} but now measures; remove the declaration`,
        )
      }
      if (!row.correctnessOk) {
        failures.push(`${lane.id}/${id}: lane output differs from the sequential reference`)
      }
      if (!Number.isFinite(row.medianRatio) || row.medianRatio <= 0) {
        failures.push(`${lane.id}/${id}: invalid ratio ${row.medianRatio}`)
        continue
      }
      if (row.rounds < policy.minimumRounds) {
        failures.push(
          `${lane.id}/${id}: used ${row.rounds} rounds, minimum is ${policy.minimumRounds}`,
        )
      }
      if (row.batchIterations < policy.minimumBatchIterations) {
        failures.push(
          `${lane.id}/${id}: used batch size ${row.batchIterations}, minimum is ${policy.minimumBatchIterations}`,
        )
      }
      // Only the optimized lane inherits the frozen baseline's floors, and its
      // precision requirement travels with them. The other two lanes report
      // their spread rather than being judged on a limit borrowed from a lane
      // with a different subject; S7_LANE_FLOOR_DEFERRALS says why.
      if (lane.id !== 'optimized-fusion') continue
      if (row.relativeMarginOfError > policy.maximumRme) {
        failures.push(
          `${lane.id}/${id}: relative margin of error ${row.relativeMarginOfError.toFixed(2)}% exceeds ${policy.maximumRme.toFixed(2)}%`,
        )
      }
      if (row.medianRatio < policy.minimumRatios[id]) {
        failures.push(
          `optimized-fusion/${id}: ratio ${row.medianRatio.toFixed(3)} is below ${policy.minimumRatios[id].toFixed(3)}`,
        )
      }
    }

    if (lane.id === 'optimized-fusion') {
      // Over the cases that produced numbers. Blocked cases are declared above,
      // not folded in at 1.0.
      const ratios = rows
        .filter((row) => row.blockedReason === null)
        .map((row) => row.medianRatio)
        .filter((ratio) => Number.isFinite(ratio) && ratio > 0)
      const overall = geomean(ratios)
      if (ratios.length > 0 && overall < policy.minimumGeomean) {
        failures.push(
          `optimized-fusion geomean ${overall.toFixed(3)} is below ${policy.minimumGeomean.toFixed(3)}`,
        )
      }
    }
  }

  return failures
}

const INPUT = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8])
const mapStep = A.map((value: number) => value + 1)
const filterStep = A.filter((value: number) => value % 2 === 0)
const longSteps = [
  A.map((value: number) => value + 1),
  A.filter((value: number) => value % 2 === 0),
  A.map((value: number) => value * 2),
  A.filter((value: number) => value > 2),
  A.map((value: number) => value - 1),
  A.reduce((accumulator: number, value: number) => accumulator + value, 0),
] as const

type Step = (value: never) => unknown

/** Fresh operators per call, so the case measures construction too. */
const freshSteps = (id: PipeDispatchCaseId): readonly Step[] => {
  const two = [
    A.map((value: number) => value + 1),
    A.filter((value: number) => value % 2 === 0),
  ] as unknown as readonly Step[]
  return id === 'fresh-3-step' ? [...two, A.take(3) as unknown as Step] : two
}

const stableSteps = (id: PipeDispatchCaseId): readonly Step[] =>
  id === 'stable-6-step'
    ? (longSteps as unknown as readonly Step[])
    : ([mapStep, filterStep] as unknown as readonly Step[])

const stepsFor = (id: PipeDispatchCaseId): readonly Step[] =>
  id.startsWith('fresh') ? freshSteps(id) : stableSteps(id)

const isFresh = (id: PipeDispatchCaseId): boolean => id.startsWith('fresh')

/**
 * Variadic on purpose: it has to be called exactly like the thing it is the
 * denominator for, or the ratio measures the rest-argument allocation rather
 * than the dispatch.
 */
const handWritten = (value: unknown, ...steps: readonly Step[]): unknown => {
  let current = value
  for (let index = 0; index < steps.length; index++) {
    current = (steps[index] as (input: unknown) => unknown)(current)
  }
  return current
}

/** Cached compiled runners, so a stable case is not recompiled per call. */
const compiledRunners = new Map<PipeDispatchCaseId, (input: unknown) => unknown>()
const compiledRunner = (id: PipeDispatchCaseId): ((input: unknown) => unknown) => {
  const existing = compiledRunners.get(id)
  if (existing !== undefined) return existing
  const built = compile(...(stableSteps(id) as unknown as readonly Runner[])) as (
    input: unknown,
  ) => unknown
  compiledRunners.set(id, built)
  return built
}

const laneSubject = (lane: PerfLaneId, id: PipeDispatchCaseId): (() => unknown) => {
  switch (lane) {
    case 'sequential':
      return () => sequentialPipe(INPUT, ...stepsFor(id))
    case 'optimized-fusion':
      return () => (optimizedPipe as (...args: unknown[]) => unknown)(INPUT, ...stepsFor(id))
    case 'compiler':
      return isFresh(id)
        ? () =>
            (
              compile(...(stepsFor(id) as unknown as readonly Runner[])) as (
                input: unknown,
              ) => unknown
            )(INPUT)
        : () => compiledRunner(id)(INPUT)
    default:
      throw new Error(`lane ${lane} has no subject`)
  }
}

const laneDenominator = (lane: PerfLaneId, id: PipeDispatchCaseId): (() => unknown) => {
  switch (lane) {
    case 'sequential':
      return () => handWritten(INPUT, ...stepsFor(id))
    case 'optimized-fusion':
      return () => (baselinePipe as (...args: unknown[]) => unknown)(INPUT, ...stepsFor(id))
    case 'compiler':
      return () => sequentialPipe(INPUT, ...stepsFor(id))
    default:
      throw new Error(`lane ${lane} has no denominator`)
  }
}

const semanticEqual = (left: unknown, right: unknown): boolean => {
  if (typeof left === 'number' && typeof right === 'number') {
    return (Number.isNaN(left) && Number.isNaN(right)) || Object.is(left, right)
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => semanticEqual(value, right[index]))
    )
  }
  return Object.is(left, right)
}

let sink: unknown

const batched = (run: () => unknown, iterations: number): (() => void) => {
  return () => {
    let last: unknown
    for (let index = 0; index < iterations; index++) last = run()
    sink = last
  }
}

export const measureLanes = (
  rounds: number,
  batchIterations: number,
  warmupRounds: number,
): LaneRow[] => {
  const rows: LaneRow[] = []
  for (const lane of S7_PERF_LANES) {
    if (lane.status !== 'active') continue
    for (const id of LANE_CASE_IDS) {
      const subject = laneSubject(lane.id, id)
      const denominator = laneDenominator(lane.id, id)
      let correctnessOk = false
      let measured
      try {
        correctnessOk = semanticEqual(subject(), sequentialPipe(INPUT, ...stepsFor(id)))
        measured = runPaired(
          batched(subject, batchIterations),
          batched(denominator, batchIterations),
          { rounds, warmupRounds },
        )
      } catch (error) {
        rows.push({
          lane: lane.id,
          case: id,
          blockedReason: (error as Error).message,
          correctnessOk,
          rounds: 0,
          batchIterations,
          medianRatio: Number.NaN,
          ciLow: Number.NaN,
          ciHigh: Number.NaN,
          relativeMarginOfError: Number.NaN,
          subjectNsPerOperation: Number.NaN,
          denominatorNsPerOperation: Number.NaN,
        })
        continue
      }
      rows.push({
        lane: lane.id,
        case: id,
        blockedReason: null,
        correctnessOk,
        rounds: measured.pairedRatios.length,
        batchIterations,
        medianRatio: measured.medianRatio,
        ciLow: measured.ciLow,
        ciHigh: measured.ciHigh,
        relativeMarginOfError: relativeMarginOfError(
          measured.ciLow,
          measured.ciHigh,
          measured.medianRatio,
        ),
        subjectNsPerOperation: median(measured.aSamples) / batchIterations,
        denominatorNsPerOperation: median(measured.bSamples) / batchIterations,
      })
    }
  }
  return rows
}

const main = (): void => {
  const engine = currentPerfEngine()
  const policy = PIPE_DISPATCH_POLICIES[engine.id]
  const rows = measureLanes(
    policy.minimumRounds,
    policy.minimumBatchIterations,
    policy.warmupRounds,
  )
  const report: LaneReport = {
    generatedAt: new Date().toISOString(),
    engineId: engine.id,
    lanes: S7_PERF_LANES,
    rows,
  }

  console.log(`\nS7 performance lanes (${engine.name})\n`)
  for (const lane of S7_PERF_LANES) {
    if (lane.status === 'inactive') {
      console.log(`${lane.id}\tINACTIVE\t${String(lane.inactiveReason)}`)
      continue
    }
    console.log(`${lane.id}\tdenominator ${lane.denominator}`)
    for (const row of rows.filter((candidate) => candidate.lane === lane.id)) {
      if (row.blockedReason !== null) {
        console.log(`  ${row.case}\tBLOCKED\t${row.blockedReason}`)
        continue
      }
      console.log(
        [
          `  ${row.case}`,
          `${row.medianRatio.toFixed(3)}x`,
          `[${row.ciLow.toFixed(3)},${row.ciHigh.toFixed(3)}]`,
          `${row.relativeMarginOfError.toFixed(2)}% RME${
            row.relativeMarginOfError > policy.maximumRme ? '!' : ''
          }`,
          `${row.subjectNsPerOperation.toFixed(1)} ns/op`,
          `denominator ${row.denominatorNsPerOperation.toFixed(1)} ns/op`,
          row.correctnessOk ? 'ok' : 'MISMATCH',
        ].join('\t'),
      )
    }
  }
  for (const deferral of S7_LANE_FLOOR_DEFERRALS) {
    console.log(`deferred floor\t${deferral.lane}\towner ${deferral.owner}\t${deferral.reason}`)
  }

  const failures = evaluateLaneReport(report)
  const resolution = resolveProfile(describeHost(), process.env[PERF_PROFILE_ENV])
  const label = resolution.releaseEvidenceEligible ? 'FAIL' : 'CANARY'
  for (const failure of failures) console.error(`${label}\t${failure}`)
  void sink
  if (failures.length > 0 && resolution.releaseEvidenceEligible) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) main()
