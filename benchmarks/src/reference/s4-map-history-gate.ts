/**
 * S4 direct-dispatch evidence.
 *
 * Call-site history is per process: once a `map` call site has seen mixed
 * sizes, mixed call forms, or fresh callbacks, the engine can leave it on a
 * slower plateau for every later call. Each history therefore runs in its own
 * fresh process, and every history is judged against the large-only history
 * measured the same way.
 *
 * The construction lane measures `map(f)` on its own, so operator construction
 * is visible without being attributed to execution.
 *
 * Every history is scored in hand-written-loop units measured in its own
 * process. A cross-process denominator was tried first and rejected: it moves
 * every row together when the machine drifts, which reports a regression that
 * is not there. The large-only ratio is still printed for comparison.
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as A from '../../../packages/fp/src/array'
import { pipe } from '../../../packages/fp/src/fusion'
import { PERF_PROFILE_ENV } from './perf-profile-contract'
import { describeHost, resolveProfile } from './perf-profile-gate'

export const LARGE = 100_000
/** How far a history may sit behind a hand-written loop with the same callbacks. */
export const MAX_HISTORY_PENALTY = 0.1

export type HistoryId =
  | 'large-only'
  | 'ascending'
  | 'descending'
  | 'mixed-forms'
  | 'fresh-callbacks'
  | 'stable-callback'
  | 'one-op-pipe'

export const HISTORY_IDS: readonly HistoryId[] = Object.freeze([
  'large-only',
  'ascending',
  'descending',
  'mixed-forms',
  'fresh-callbacks',
  'stable-callback',
  'one-op-pipe',
])

export type ConstructionId = 'stable-callback' | 'fresh-callback'
export const CONSTRUCTION_IDS: readonly ConstructionId[] = Object.freeze([
  'stable-callback',
  'fresh-callback',
])

const arrayOf = (size: number): number[] => Array.from({ length: size }, (_, i) => i % 997)
const double = (x: number) => x * 2

/** Drives the `map` call site into the history under test. */
const warmHistory = (id: HistoryId): void => {
  const sizes =
    id === 'ascending'
      ? [10, 100, 1_000, 10_000, LARGE]
      : id === 'descending'
        ? [LARGE, 10_000, 1_000, 100, 10]
        : [LARGE]
  const inputs = sizes.map(arrayOf)

  for (let round = 0; round < 200; round++) {
    for (const input of inputs) {
      switch (id) {
        case 'mixed-forms':
          if (round % 2 === 0) A.map(input, double)
          else A.map(double)(input)
          break
        case 'fresh-callbacks':
          A.map(input, (x: number) => x * 2)
          break
        case 'stable-callback':
          A.map(double)(input)
          break
        case 'one-op-pipe':
          pipe(input, A.map(double))
          break
        default:
          A.map(input, double)
      }
    }
  }
}

const medianOf = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((l, r) => l - r)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export interface HistorySample {
  readonly mapNs: number
  readonly controlNs: number
}

/**
 * Times the large-array direct call after the history is established, next to
 * a hand-written loop doing the same work with the same callback policy in the
 * same process. Histories cannot share a process, so the control is what makes
 * their numbers comparable: machine drift and callback churn divide out, and
 * what is left is dispatch.
 */
export const measureHistory = (id: HistoryId, rounds = 60): HistorySample => {
  const fresh = id === 'fresh-callbacks'
  warmHistory(id)
  const input = arrayOf(LARGE)

  const control = (f: (x: number) => number): number[] => {
    const out = new Array<number>(input.length)
    for (let i = 0; i < input.length; i++) out[i] = f(input[i])
    return out
  }
  for (let round = 0; round < 200; round++) control(fresh ? (x: number) => x * 2 : double)

  const mapSamples: number[] = []
  const controlSamples: number[] = []
  for (let round = 0; round < rounds; round++) {
    const mapCallback = fresh ? (x: number) => x * 2 : double
    const mapStarted = process.hrtime.bigint()
    A.map(input, mapCallback)
    mapSamples.push(Number(process.hrtime.bigint() - mapStarted))

    const controlCallback = fresh ? (x: number) => x * 2 : double
    const controlStarted = process.hrtime.bigint()
    control(controlCallback)
    controlSamples.push(Number(process.hrtime.bigint() - controlStarted))
  }
  return { mapNs: medianOf(mapSamples), controlNs: medianOf(controlSamples) }
}

/** Construction only: no array is ever traversed here. */
export const measureConstruction = (id: ConstructionId, rounds = 2_000): number => {
  const samples: number[] = []
  for (let round = 0; round < rounds; round++) {
    const callback = id === 'stable-callback' ? double : (x: number) => x * 2
    const started = process.hrtime.bigint()
    const operator = A.map(callback)
    samples.push(Number(process.hrtime.bigint() - started))
    if (typeof operator !== 'function') throw new Error('map did not construct an operator')
  }
  return medianOf(samples)
}

export interface HistoryRow {
  readonly id: HistoryId
  readonly mapNs: number
  readonly controlNs: number
  /** map cost expressed in hand-written-loop units. */
  readonly normalized: number
  readonly ratioToLargeOnly: number
}

export interface ConstructionRow {
  readonly id: ConstructionId
  readonly medianNs: number
}

export interface MapHistoryReport {
  readonly histories: readonly HistoryRow[]
  readonly construction: readonly ConstructionRow[]
}

export const evaluateMapHistory = (report: MapHistoryReport): string[] => {
  const failures: string[] = []
  for (const id of HISTORY_IDS) {
    const row = report.histories.find((candidate) => candidate.id === id)
    if (row === undefined) {
      failures.push(`missing history row for ${id}`)
      continue
    }
    if (row.normalized > 1 + MAX_HISTORY_PENALTY) {
      failures.push(
        `${id} costs ${row.normalized.toFixed(3)} hand-written loops, over the ${(1 + MAX_HISTORY_PENALTY).toFixed(2)} limit`,
      )
    }
  }
  for (const id of CONSTRUCTION_IDS) {
    if (!report.construction.some((row) => row.id === id)) {
      failures.push(`missing construction row for ${id}`)
    }
  }
  return failures
}

const SESSION_ENV = 'STOPCOCK_S4_HISTORY'
const self = fileURLToPath(import.meta.url)
const childArgv = (): string[] =>
  typeof process.versions.bun === 'string' ? [self] : ['--import=tsx', self]

export const SESSIONS_PER_HISTORY = 5

/** One process per session: call-site history cannot be undone inside one. */
const runInFreshProcesses = (id: HistoryId): HistorySample & { readonly normalized: number } => {
  const mapNs: number[] = []
  const controlNs: number[] = []
  const normalized: number[] = []
  for (let session = 0; session < SESSIONS_PER_HISTORY; session++) {
    const child = spawnSync(process.execPath, childArgv(), {
      encoding: 'utf8',
      env: { ...process.env, [SESSION_ENV]: id },
    })
    if (child.status !== 0) throw new Error(`history ${id} failed: ${child.stderr}`)
    const sample = JSON.parse(child.stdout) as HistorySample
    mapNs.push(sample.mapNs)
    controlNs.push(sample.controlNs)
    // Normalize inside the session that produced both numbers, then take the
    // median of ratios. Dividing two independently aggregated medians lets one
    // bad session move the result.
    normalized.push(sample.mapNs / sample.controlNs)
  }
  return {
    mapNs: medianOf(mapNs),
    controlNs: medianOf(controlNs),
    normalized: medianOf(normalized),
  }
}

const main = (): void => {
  const requested = process.env[SESSION_ENV]
  if (requested !== undefined) {
    console.log(JSON.stringify(measureHistory(requested as HistoryId)))
    return
  }

  const samples = new Map<HistoryId, HistorySample & { normalized: number }>()
  for (const id of HISTORY_IDS) samples.set(id, runInFreshProcesses(id))
  const normalizedOf = (id: HistoryId): number =>
    (samples.get(id) as { normalized: number }).normalized
  const largeOnly = normalizedOf('large-only')

  const report: MapHistoryReport = {
    histories: HISTORY_IDS.map((id) => {
      const sample = samples.get(id) as HistorySample
      return {
        id,
        mapNs: sample.mapNs,
        controlNs: sample.controlNs,
        normalized: normalizedOf(id),
        ratioToLargeOnly: normalizedOf(id) / largeOnly,
      }
    }),
    construction: CONSTRUCTION_IDS.map((id) => ({ id, medianNs: measureConstruction(id) })),
  }

  for (const row of report.histories) {
    console.log(
      `history\t${row.id}\t${row.mapNs} ns\tcontrol ${row.controlNs} ns\t${row.normalized.toFixed(3)} loops\t${row.ratioToLargeOnly.toFixed(3)}x`,
    )
  }
  for (const row of report.construction) {
    console.log(`construction\t${row.id}\t${row.medianNs} ns`)
  }

  const failures = evaluateMapHistory(report)
  // The canary lane reports but never blocks: its numbers are not release
  // evidence, and the limit is tighter than canary noise on this profile.
  const resolution = resolveProfile(describeHost(), process.env[PERF_PROFILE_ENV])
  const label = resolution.releaseEvidenceEligible ? 'FAIL' : 'CANARY'
  for (const failure of failures) console.error(`${label}\t${failure}`)
  if (failures.length > 0 && resolution.releaseEvidenceEligible) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === self) main()
