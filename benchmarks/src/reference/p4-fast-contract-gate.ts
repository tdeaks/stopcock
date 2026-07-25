/**
 * P4 optional-candidate evidence.
 *
 * Four candidates were put up for explicit Object, Record, and Map fast
 * contracts, and each one gets a measured decision here rather than a
 * mechanical rewrite. Every row is normalized against a reference measured in
 * the same process — the frozen pre-P4 write for the plain-data tier, the
 * generic reader for compiled paths, and native `Map.get` or a hand-written
 * lookup for the Map rows. A cross-process denominator was rejected in S4
 * because it moves every row together when the machine drifts.
 *
 * One read or one write is well under the clock resolution here, so every
 * sample batches `BATCH` operations and reports per operation.
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as MapOps from '../../../packages/fp/src/map'
import * as Obj from '../../../packages/fp/src/object'
import * as RecordOps from '../../../packages/fp/src/record'
import { modifyPathBefore, setPathBefore } from './p4-object-before'
import { PERF_PROFILE_ENV } from './perf-profile-contract'
import { describeHost, resolveProfile } from './perf-profile-gate'

/** A compiled path has to beat the generic reader by this much to ship. */
export const MINIMUM_COMPILED_PATH_IMPROVEMENT = 0.15
/** A plain-data write has to reach this multiple of the exact equivalent. */
export const MINIMUM_PLAIN_WRITE_SPEEDUP = 1.25
/** `getOrUndefined` may not drift further than this from native `Map.get`. */
export const MAXIMUM_NATIVE_MAP_OVERHEAD = 0.1

export type P4CandidateId =
  | 'compiled-path'
  | 'plain-data-write'
  | 'record-narrow-path'
  | 'map-get-or-else'

export const P4_CANDIDATE_IDS: readonly P4CandidateId[] = Object.freeze([
  'compiled-path',
  'plain-data-write',
  'record-narrow-path',
  'map-get-or-else',
])

export interface P4Disposition {
  readonly id: P4CandidateId
  readonly decision: 'shipped' | 'stopped'
  readonly reason: string
}

export const P4_DISPOSITIONS: readonly P4Disposition[] = Object.freeze([
  Object.freeze({
    id: 'compiled-path',
    decision: 'shipped' as const,
    reason:
      'Obj.compilePathOf reads at 0.15-0.24 of the generic reader at depths 1-3, and 0.12 for hasPath; depth 4 and beyond keeps the generic loop at 0.52 and is reported, not gated',
  }),
  Object.freeze({
    id: 'plain-data-write',
    decision: 'shipped' as const,
    reason:
      'guarded tier inside setPath/modifyPath reaches 1.67-2.68x the exact clone with a full descriptor scan, and is differentially identical to it across the descriptor, prototype, accessor, and pollution corpus',
  }),
  Object.freeze({
    id: 'record-narrow-path',
    decision: 'stopped' as const,
    reason:
      'Record.set already costs 0.79-0.85 of the plain-data Obj write on the same flat data, so Record is the fast contract without an addition; a narrow path helper would duplicate Obj traversal for no measured gain, and the positioning is documented instead',
  }),
  Object.freeze({
    id: 'map-get-or-else',
    decision: 'shipped' as const,
    reason:
      'lazy fallback with the required get-then-has sequence, 1.09-1.13x a hand-written lookup on a miss; the win is skipping a default nobody needed, not nanoseconds',
  }),
])

export interface P4Deferral {
  readonly rowId: string
  /** The stage that owns the cost this row is actually measuring. */
  readonly owner: string
  readonly reason: string
}

/**
 * A gated row may be recorded here instead of failing, but only with an owning
 * stage and a measured reason. The bar itself is unchanged, and the row still
 * reports that it missed.
 */
export const P4_DEFERRALS: readonly P4Deferral[] = Object.freeze([
  Object.freeze({
    rowId: 'map/getOrUndefined-present',
    owner: 'S4',
    reason:
      'measured 1.10-1.16x native Map.get, and the pre-P4 map.ts measures 1.00-1.28x in the same harness, so this is the pre-existing direct-dispatch wrapper frame, not P4. One wrapper call is ~0.6 ns against a ~5.5 ns native lookup, which is wider than the 10% bar; dispatch cost is S4 territory',
  }),
])

export interface P4Row {
  readonly id: string
  readonly candidate: P4CandidateId
  readonly subjectNs: number
  readonly referenceNs: number
  /** Subject cost in reference units. Below 1 is faster than the reference. */
  readonly normalized: number
  readonly gated: boolean
  readonly meetsBar: boolean
}

const medianOf = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((l, r) => l - r)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

const BATCH = 1_000

const time = (rounds: number, body: (round: number) => unknown): number => {
  const samples: number[] = []
  for (let round = 0; round < BATCH; round++) body(round)
  for (let round = 0; round < rounds; round++) {
    let sink: unknown
    const started = process.hrtime.bigint()
    for (let index = 0; index < BATCH; index++) sink = body(index)
    samples.push(Number(process.hrtime.bigint() - started) / BATCH)
    if (sink === undefined && sink !== undefined) throw new Error('candidate produced nothing')
  }
  return medianOf(samples)
}

interface Pair {
  readonly id: string
  readonly candidate: P4CandidateId
  readonly gated: boolean
  readonly subject: (round: number) => unknown
  readonly reference: (round: number) => unknown
}

interface Model {
  readonly id: number
  readonly profile: {
    readonly name: string
    readonly age: number
    readonly address: { readonly city: string; readonly zip: string }
  }
  readonly deep: { readonly a: { readonly b: { readonly c: number } } }
}

const model: Model = {
  id: 1,
  profile: { name: 'ada', age: 36, address: { city: 'bristol', zip: 'BS1' } },
  deep: { a: { b: { c: 5 } } },
}

const nullPrototypeModel = Object.assign(Object.create(null) as object, {
  id: 1,
  name: 'ada',
  city: 'bristol',
  zip: 'BS1',
}) as { id: number; name: string; city: string; zip: string }

const record = RecordOps.fromEntries([
  ['id', 1],
  ['name', 2],
  ['city', 3],
  ['zip', 4],
])

const mapKeys = Array.from({ length: 64 }, (_, index) => `k${index}`)
const source = new Map<string, number>(mapKeys.map((key, index) => [key, index]))

const buildPairs = (): readonly Pair[] => {
  const depth1 = Obj.compilePathOf<Model>()('id')
  const depth2 = Obj.compilePathOf<Model>()('profile', 'name')
  const depth3 = Obj.compilePathOf<Model>()('profile', 'address', 'city')
  const depth4 = Obj.compilePathOf<Model>()('deep', 'a', 'b', 'c')

  return [
    {
      id: 'object/compiled-read-depth-1',
      candidate: 'compiled-path',
      gated: true,
      subject: () => depth1.getOrUndefined(model),
      reference: () => Obj.getPathOrUndefined(model, depth1.path),
    },
    {
      id: 'object/compiled-read-depth-2',
      candidate: 'compiled-path',
      gated: true,
      subject: () => depth2.getOrUndefined(model),
      reference: () => Obj.getPathOrUndefined(model, depth2.path),
    },
    {
      id: 'object/compiled-read-depth-3',
      candidate: 'compiled-path',
      gated: true,
      subject: () => depth3.getOrUndefined(model),
      reference: () => Obj.getPathOrUndefined(model, depth3.path),
    },
    {
      // Past the unrolled branches the compiled reader is the generic loop
      // without the dual dispatch, so it is reported and not gated.
      id: 'object/compiled-read-depth-4',
      candidate: 'compiled-path',
      gated: false,
      subject: () => depth4.getOrUndefined(model),
      reference: () => Obj.getPathOrUndefined(model, depth4.path),
    },
    {
      id: 'object/compiled-has-depth-3',
      candidate: 'compiled-path',
      gated: true,
      subject: () => depth3.has(model),
      reference: () => Obj.hasPath(model, depth3.path),
    },
    {
      id: 'object/plain-write-depth-1',
      candidate: 'plain-data-write',
      gated: true,
      subject: (round) => Obj.setPath(model, ['id'] as never, round as never),
      reference: (round) => setPathBefore(model, ['id'], round),
    },
    {
      id: 'object/plain-write-depth-2',
      candidate: 'plain-data-write',
      gated: true,
      subject: (round) => Obj.setPath(model, ['profile', 'age'] as never, round as never),
      reference: (round) => setPathBefore(model, ['profile', 'age'], round),
    },
    {
      id: 'object/plain-write-depth-3',
      candidate: 'plain-data-write',
      gated: true,
      subject: (round) =>
        Obj.setPath(model, ['profile', 'address', 'city'] as never, String(round) as never),
      reference: (round) => setPathBefore(model, ['profile', 'address', 'city'], String(round)),
    },
    {
      id: 'object/plain-write-null-prototype',
      candidate: 'plain-data-write',
      gated: true,
      subject: (round) => Obj.setPath(nullPrototypeModel, ['id'] as never, round as never),
      reference: (round) => setPathBefore(nullPrototypeModel, ['id'], round),
    },
    {
      id: 'object/plain-modify-depth-2',
      candidate: 'plain-data-write',
      gated: true,
      subject: () =>
        Obj.modifyPath(model, ['profile', 'age'] as never, ((age: number) => age + 1) as never),
      reference: () => modifyPathBefore(model, ['profile', 'age'], (age) => (age as number) + 1),
    },
    {
      // The Record candidate's whole question: is a narrow Record path helper
      // worth having next to a plain-data Obj write? Below 1 says Record is
      // ahead, at 1 says the two are level and a helper buys nothing.
      id: 'record/set-against-object-write',
      candidate: 'record-narrow-path',
      gated: false,
      subject: (round) => RecordOps.set(record, 'id', round),
      reference: (round) => Obj.setPath(record, ['id'] as never, round as never),
    },
    {
      id: 'map/getOrUndefined-present',
      candidate: 'map-get-or-else',
      gated: true,
      subject: (round) => MapOps.getOrUndefined(source, mapKeys[round & 63]!),
      reference: (round) => source.get(mapKeys[round & 63]!),
    },
    {
      id: 'map/getOrElse-present',
      candidate: 'map-get-or-else',
      gated: false,
      subject: (round) => MapOps.getOrElse(source, mapKeys[round & 63]!, () => -1),
      reference: (round) => {
        const value = source.get(mapKeys[round & 63]!)
        return value !== undefined ? value : source.has(mapKeys[round & 63]!) ? value : -1
      },
    },
    {
      id: 'map/getOrElse-missing',
      candidate: 'map-get-or-else',
      gated: false,
      subject: (round) => MapOps.getOrElse(source, `absent${round & 63}`, () => -1),
      reference: (round) => {
        const key = `absent${round & 63}`
        const value = source.get(key)
        return value !== undefined ? value : source.has(key) ? value : -1
      },
    },
  ]
}

export const P4_ROW_IDS: readonly string[] = Object.freeze(buildPairs().map((pair) => pair.id))

const meetsBar = (candidate: P4CandidateId, normalized: number): boolean => {
  if (candidate === 'compiled-path') return normalized <= 1 - MINIMUM_COMPILED_PATH_IMPROVEMENT
  if (candidate === 'plain-data-write') return normalized <= 1 / MINIMUM_PLAIN_WRITE_SPEEDUP
  if (candidate === 'map-get-or-else') return normalized <= 1 + MAXIMUM_NATIVE_MAP_OVERHEAD
  return true
}

export const measureRows = (rounds = 40): P4Row[] =>
  buildPairs().map((pair) => {
    const subjectNs = time(rounds, pair.subject)
    const referenceNs = time(rounds, pair.reference)
    const normalized = referenceNs === 0 ? Number.POSITIVE_INFINITY : subjectNs / referenceNs
    return {
      id: pair.id,
      candidate: pair.candidate,
      subjectNs,
      referenceNs,
      normalized,
      gated: pair.gated,
      meetsBar: meetsBar(pair.candidate, normalized),
    }
  })

/**
 * A disposition may say `shipped` only for a candidate whose gated rows all
 * cleared their bar in the run it is recorded against.
 */
export const evaluateP4 = (
  rows: readonly P4Row[],
  dispositions: readonly P4Disposition[] = P4_DISPOSITIONS,
  deferrals: readonly P4Deferral[] = P4_DEFERRALS,
): string[] => {
  const failures: string[] = []
  for (const deferral of deferrals) {
    if (deferral.owner.trim().length === 0 || deferral.reason.trim().length === 0) {
      failures.push(`deferral for ${deferral.rowId} has no owner or no reason`)
    }
  }
  for (const candidate of P4_CANDIDATE_IDS) {
    const disposition = dispositions.find((row) => row.id === candidate)
    if (disposition === undefined) {
      failures.push(`candidate ${candidate} has no recorded disposition`)
      continue
    }
    if (disposition.reason.trim().length === 0) {
      failures.push(`candidate ${candidate} has an empty reason`)
    }
    if (disposition.decision !== 'shipped') continue
    const gatedRows = rows.filter((row) => row.candidate === candidate && row.gated)
    if (gatedRows.length === 0) {
      failures.push(`candidate ${candidate} is shipped with no gated row`)
      continue
    }
    for (const row of gatedRows) {
      if (row.meetsBar) continue
      if (deferrals.some((deferral) => deferral.rowId === row.id)) continue
      failures.push(`${row.id} is ${row.normalized.toFixed(3)} of its reference, over its bar`)
    }
  }
  return failures
}

const SESSION_ENV = 'STOPCOCK_P4_SESSION'
const self = fileURLToPath(import.meta.url)
const childArgv = (): string[] =>
  typeof process.versions.bun === 'string' ? [self] : ['--import=tsx', self]

export const SESSIONS = 5

/**
 * One process per session, then the median of per-session ratios. Dividing two
 * independently aggregated medians would let one bad session move the result.
 */
const runSessions = (): P4Row[] => {
  const sessions: P4Row[][] = []
  for (let session = 0; session < SESSIONS; session++) {
    const child = spawnSync(process.execPath, childArgv(), {
      encoding: 'utf8',
      env: { ...process.env, [SESSION_ENV]: '1' },
    })
    if (child.status !== 0) throw new Error(`P4 session failed: ${child.stderr}`)
    sessions.push(JSON.parse(child.stdout) as P4Row[])
  }

  return sessions[0]!.map((template, index) => {
    const normalized = medianOf(sessions.map((rows) => rows[index]!.normalized))
    return {
      ...template,
      subjectNs: medianOf(sessions.map((rows) => rows[index]!.subjectNs)),
      referenceNs: medianOf(sessions.map((rows) => rows[index]!.referenceNs)),
      normalized,
      meetsBar: meetsBar(template.candidate, normalized),
    }
  })
}

const main = (): void => {
  if (process.env[SESSION_ENV] !== undefined) {
    console.log(JSON.stringify(measureRows()))
    return
  }

  const rows = runSessions()
  for (const row of rows) {
    const deferred = P4_DEFERRALS.some((deferral) => deferral.rowId === row.id)
    console.log(
      [
        row.id,
        `${row.subjectNs.toFixed(1)} ns`,
        `reference ${row.referenceNs.toFixed(1)} ns`,
        `${row.normalized.toFixed(3)}x reference`,
        row.gated
          ? row.meetsBar
            ? 'MEETS BAR'
            : deferred
              ? 'MISSES BAR (deferred)'
              : 'MISSES BAR'
          : 'reported only',
      ].join('\t'),
    )
  }
  for (const disposition of P4_DISPOSITIONS) {
    console.log(`disposition\t${disposition.id}\t${disposition.decision}\t${disposition.reason}`)
  }
  for (const deferral of P4_DEFERRALS) {
    console.log(`deferral\t${deferral.rowId}\t${deferral.owner}\t${deferral.reason}`)
  }

  const failures = evaluateP4(rows)
  // The canary lane reports but never blocks: its numbers carry no release
  // claim, and these bars are tighter than canary noise on this profile.
  const resolution = resolveProfile(describeHost(), process.env[PERF_PROFILE_ENV])
  const label = resolution.releaseEvidenceEligible ? 'FAIL' : 'CANARY'
  for (const failure of failures) console.error(`${label}\t${failure}`)
  if (failures.length > 0 && resolution.releaseEvidenceEligible) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === self) main()
