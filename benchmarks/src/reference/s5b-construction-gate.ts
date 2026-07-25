/**
 * S5B optional-candidate evidence.
 *
 * A weak operator cache only pays when the same callback constructs the same
 * operator again; on a fresh callback it is a pure WeakMap write. This gate
 * measures both modes for every candidate operation and reports what a cache
 * would actually save, so each candidate gets a measured decision instead of a
 * mechanical rewrite.
 *
 * The bar is the one the plan sets: at least 5% construction improvement
 * before a cache may be enabled.
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as A from '../../../packages/fp/src/array'

export const MINIMUM_CONSTRUCTION_IMPROVEMENT = 0.05

export interface CandidateOperation {
  readonly id: string
  readonly construct: (callback: (x: number) => never) => unknown
}

export const S5B_CANDIDATES: readonly CandidateOperation[] = Object.freeze([
  { id: 'filter', construct: (f) => A.filter(f as never) },
  { id: 'flatMap', construct: (f) => A.flatMap(f as never) },
  { id: 'reduce', construct: (f) => A.reduce(f as never, 0 as never) },
  { id: 'find', construct: (f) => A.find(f as never) },
  { id: 'some', construct: (f) => A.some(f as never) },
  { id: 'every', construct: (f) => A.every(f as never) },
  { id: 'take', construct: () => A.take(5) },
])

export interface CandidateDisposition {
  readonly id: string
  readonly decision: 'enabled' | 'stopped'
  readonly reason: string
}

/**
 * Measured stop decisions, not a mechanical rewrite. Every candidate clears
 * the 5% bar on repeat construction, and every candidate pays for it on churn.
 * The net is single-digit nanoseconds either way against a 100,000-element
 * execution that costs ~44,000 ns, so none of them buys anything a caller can
 * observe, and each one would add a module-level cache to direct-only bundles.
 *
 * `Array.map`'s cache is not on this list: it is S5B's mandatory retention
 * repair, not an optional candidate, and it exists to remove strong retention
 * rather than to win a benchmark.
 */
export const S5B_DISPOSITIONS: readonly CandidateDisposition[] = Object.freeze([
  Object.freeze({
    id: 'filter',
    decision: 'stopped',
    reason: 'best net of the candidates at ~16 ns, still immaterial against execution',
  }),
  Object.freeze({
    id: 'flatMap',
    decision: 'stopped',
    reason: 'net 7-18 ns, unstable between sessions',
  }),
  Object.freeze({
    id: 'reduce',
    decision: 'stopped',
    reason: 'net 2-5 ns, inside session noise',
  }),
  Object.freeze({
    id: 'find',
    decision: 'stopped',
    reason: 'net 8-10 ns against a 34-45% churn penalty',
  }),
  Object.freeze({
    id: 'some',
    decision: 'stopped',
    reason: 'churn cost 68-75%, the largest of the candidates',
  }),
  Object.freeze({
    id: 'every',
    decision: 'stopped',
    reason: 'churn cost 55-70% for a 4-6 ns net',
  }),
  Object.freeze({
    id: 'take',
    decision: 'stopped',
    reason: 'takes no callback, so it has no weak key; net flips sign between sessions',
  }),
])

const medianOf = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((l, r) => l - r)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * One construction costs less than the clock can resolve on this profile, so
 * every sample batches `BATCH` of them and the result is reported per
 * construction.
 */
const BATCH = 1_000

const time = (rounds: number, body: (round: number) => unknown): number => {
  const samples: number[] = []
  for (let round = 0; round < BATCH; round++) body(round)
  for (let round = 0; round < rounds; round++) {
    let sink: unknown
    const started = process.hrtime.bigint()
    for (let i = 0; i < BATCH; i++) sink = body(i)
    samples.push(Number(process.hrtime.bigint() - started) / BATCH)
    if (sink === undefined) throw new Error('candidate produced nothing')
  }
  return medianOf(samples)
}

export interface CandidateRow {
  readonly id: string
  /** Construction with one long-lived callback: what a cache would replace. */
  readonly repeatNs: number
  /** Construction with a new callback each time: a cache can only add cost. */
  readonly freshNs: number
  /** Cached repeat construction: a WeakMap hit instead of construction. */
  readonly cachedRepeatNs: number
  /** Cached churn: a WeakMap miss, then construction, then a write. */
  readonly cachedFreshNs: number
  readonly improvement: number
  /** What the cache costs a call site that never reuses a callback. */
  readonly churnCost: number
  /** Absolute nanoseconds saved on repeat minus paid on churn. */
  readonly netNs: number
  readonly qualifies: boolean
}

export const measureCandidates = (
  candidates: readonly CandidateOperation[] = S5B_CANDIDATES,
  rounds = 60,
): CandidateRow[] =>
  candidates.map((candidate) => {
    const stable = ((x: number) => x > 0) as unknown as (x: number) => never
    const repeatNs = time(rounds, () => candidate.construct(stable))
    // A distinct callback per construction, which is what a churny call site
    // actually does.
    const freshNs = time(rounds, (round) =>
      candidate.construct(((x: number) => x > round) as never),
    )

    // The real cached path, not a bare lookup: hit returns, miss constructs
    // and writes.
    const cache = new WeakMap<object, unknown>()
    const cached = (callback: (x: number) => never): unknown => {
      const hit = cache.get(callback)
      if (hit !== undefined) return hit
      const built = candidate.construct(callback)
      cache.set(callback, built)
      return built
    }
    const cachedRepeatNs = time(rounds, () => cached(stable))
    const cachedFreshNs = time(rounds, (round) => cached(((x: number) => x > round) as never))

    const improvement = repeatNs === 0 ? 0 : (repeatNs - cachedRepeatNs) / repeatNs
    const churnCost = freshNs === 0 ? 0 : (cachedFreshNs - freshNs) / freshNs
    const netNs = repeatNs - cachedRepeatNs - (cachedFreshNs - freshNs)
    return {
      id: candidate.id,
      repeatNs,
      freshNs,
      cachedRepeatNs,
      cachedFreshNs,
      improvement,
      churnCost,
      netNs,
      // A cache has to earn its place on both paths: clearing the 5% bar on
      // repeat construction is not enough if it costs more on churn.
      qualifies: improvement >= MINIMUM_CONSTRUCTION_IMPROVEMENT && netNs > 0,
    }
  })

/**
 * A disposition may say `enabled` only for a candidate that actually
 * qualified in the run it is recorded against.
 */
export const evaluateDispositions = (
  rows: readonly CandidateRow[],
  dispositions: readonly CandidateDisposition[] = S5B_DISPOSITIONS,
): string[] => {
  const failures: string[] = []
  for (const candidate of S5B_CANDIDATES) {
    const disposition = dispositions.find((row) => row.id === candidate.id)
    if (disposition === undefined) {
      failures.push(`candidate ${candidate.id} has no recorded disposition`)
      continue
    }
    if (disposition.reason.trim().length === 0) {
      failures.push(`candidate ${candidate.id} has an empty reason`)
    }
    if (disposition.decision !== 'enabled') continue
    const row = rows.find((measured) => measured.id === candidate.id)
    if (row === undefined || !row.qualifies) {
      failures.push(`candidate ${candidate.id} is enabled without qualifying`)
    }
  }
  return failures
}

const main = (): void => {
  const rows = measureCandidates()
  const failures = evaluateDispositions(rows)
  for (const row of rows) {
    console.log(
      [
        row.id,
        `repeat ${row.repeatNs.toFixed(1)}->${row.cachedRepeatNs.toFixed(1)} ns`,
        `churn ${row.freshNs.toFixed(1)}->${row.cachedFreshNs.toFixed(1)} ns`,
        `${(row.improvement * 100).toFixed(1)}% repeat`,
        `${(row.churnCost * 100).toFixed(1)}% churn`,
        `net ${row.netNs.toFixed(1)} ns`,
        row.qualifies ? 'CACHE QUALIFIES' : 'no cache',
      ].join('\t'),
    )
  }
  for (const disposition of S5B_DISPOSITIONS) {
    console.log(`disposition\t${disposition.id}\t${disposition.decision}\t${disposition.reason}`)
  }
  for (const failure of failures) console.error(`FAIL\t${failure}`)
  if (failures.length > 0) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) main()
