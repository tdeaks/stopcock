/**
 * Competitor cliff detector.
 *
 * Every other gate in this directory measures stopcock against itself: hand
 * loops, frozen baselines, its own before-state. All of them stayed green while
 * `flow` composed 15x slower than lodash for the entire programme, because none
 * of them look outward.
 *
 * This is not a ranking harness and it does not chase wins. It fails when
 * stopcock falls off a cliff against a library a user would plausibly compare
 * it to. The floor is deliberately loose: known deficits in the 0.5-0.8 band
 * pass, and only a collapse fails.
 */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipe as tbPipe, A as TB } from '@mobily/ts-belt'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as A from '../../../packages/fp/src/array'
import { flow } from '../../../packages/fp/src/flow'
import { pipe } from '../../../packages/fp/src/pipe'
import { runInterleavedPaired } from './perf-runner'
import { PERF_PROFILE_ENV } from './perf-profile-contract'
import { describeHost, resolveProfile } from './perf-profile-gate'

/**
 * Two times slower than a competitor is a bad row worth knowing about. Ten
 * times slower is a defect. This catches the second without arguing about the
 * first.
 */
export const COMPETITOR_FLOOR = 0.5

export interface CompetitorCase {
  readonly id: string
  readonly competitor: 'lodash' | 'ramda' | 'ts-belt'
  readonly stopcock: () => unknown
  readonly other: () => unknown
  /**
   * A row measured but not enforced, with the reason. Only for rows where the
   * measurement itself is in question, never to excuse a bad result.
   */
  readonly reportedOnly?: string
}

const inc = (x: number) => x + 1
const dbl = (x: number) => x * 2
const neg = (x: number) => -x
const big = (x: number) => x > 100
const data: readonly number[] = Array.from({ length: 1_000 }, (_, i) => i)

/**
 * Scalar rows feed a changing value. With a constant input the optimizer can
 * fold a simple implementation away entirely while a variadic one resists it,
 * which reported stopcock's `pipe` at 0.39x ts-belt when an isolated
 * measurement with varying input put it at 1.28x. Both sides pay the same
 * counter.
 */
let seed = 0
const nextInput = (): number => (seed = (seed + 1) & 1023)

// Hoisted: these rows measure the call, not closure construction, so the
// operator is built once outside the timed cases below.
const arrayMapOp = A.map(dbl)
const arrayFilterOp = A.filter(big)

export const COMPETITOR_CASES: readonly CompetitorCase[] = Object.freeze([
  // The row that would have caught the flow regression on the day it landed.
  Object.freeze({
    id: 'flow/compose',
    competitor: 'lodash' as const,
    stopcock: () => flow(inc, dbl, neg),
    other: () => _.flow([inc, dbl, neg]),
  }),
  Object.freeze({
    id: 'flow/compose-and-call',
    competitor: 'ramda' as const,
    stopcock: () => flow(inc, dbl, neg)(nextInput()),
    other: () => Ra.pipe(inc, dbl, neg)(nextInput()),
  }),
  Object.freeze({
    id: 'pipe/two-functions',
    competitor: 'ts-belt' as const,
    stopcock: () => pipe(nextInput(), inc, dbl),
    other: () => tbPipe(nextInput(), inc, dbl),
    // Three harnesses disagree by 3x on this row: vitest bench 0.93x, a plain
    // varying-input loop 1.28x, and this paired sampler 0.39x. Removing work
    // from the untagged path moved the loop number and left this one
    // unchanged, so the paired regime is measuring something other than the
    // work done. Enforcing a floor on a number nobody can reproduce would be
    // worse than reporting it.
    reportedOnly: 'measurement regimes disagree by 3x; which one is canonical is unresolved',
  }),
  Object.freeze({
    id: 'array/map',
    competitor: 'lodash' as const,
    stopcock: () => arrayMapOp(data),
    other: () => _.map(data, dbl),
  }),
  Object.freeze({
    id: 'array/filter',
    competitor: 'lodash' as const,
    stopcock: () => arrayFilterOp(data),
    other: () => _.filter(data, big),
  }),
  Object.freeze({
    id: 'pipeline/map-filter',
    competitor: 'ts-belt' as const,
    stopcock: () => pipe(data, A.map(dbl), A.filter(big)),
    other: () => tbPipe(data, TB.map(dbl), TB.filter(big)),
  }),
])

const median = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((l, r) => l - r)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export interface CompetitorRow {
  readonly id: string
  readonly competitor: CompetitorCase['competitor']
  /** Stopcock throughput over theirs. Above 1 means stopcock is faster. */
  readonly ratio: number
}

export const measureCompetitors = (
  cases: readonly CompetitorCase[] = COMPETITOR_CASES,
  sessions = 3,
): CompetitorRow[] =>
  cases.map((testCase) => {
    const ratios: number[] = []
    for (let session = 0; session < sessions; session++) {
      const run = runInterleavedPaired(testCase.stopcock, testCase.other, {
        rounds: 24,
        batchIterations: 16,
        microBatchIterations: 4,
        warmupRounds: 32,
      })
      // The sampler reports reference over subject, which is already
      // stopcock-over-competitor for this orientation.
      ratios.push(median(run.pairedRatios))
    }
    return { id: testCase.id, competitor: testCase.competitor, ratio: median(ratios) }
  })

export const evaluateCompetitors = (rows: readonly CompetitorRow[]): string[] => {
  const failures: string[] = []
  for (const testCase of COMPETITOR_CASES) {
    const row = rows.find((candidate) => candidate.id === testCase.id)
    // A missing row is always a failure, reported-only or not: the point is to
    // notice when a comparison stops being made at all.
    if (row === undefined) {
      failures.push(`missing competitor row for ${testCase.id}`)
      continue
    }
    if (testCase.reportedOnly !== undefined) continue
    if (row.ratio < COMPETITOR_FLOOR) {
      failures.push(
        `${row.id} is ${row.ratio.toFixed(2)}x ${row.competitor}, below the ${COMPETITOR_FLOOR} cliff floor`,
      )
    }
  }
  return failures
}

const main = (): void => {
  const rows = measureCompetitors()
  for (const row of rows) {
    const testCase = COMPETITOR_CASES.find((candidate) => candidate.id === row.id)
    const note =
      testCase?.reportedOnly === undefined ? '' : `\treported only: ${testCase.reportedOnly}`
    console.log(`${row.id}\tvs ${row.competitor}\t${row.ratio.toFixed(2)}x${note}`)
  }
  const failures = evaluateCompetitors(rows)
  const resolution = resolveProfile(describeHost(), process.env[PERF_PROFILE_ENV])
  const label = resolution.releaseEvidenceEligible ? 'FAIL' : 'CANARY'
  for (const failure of failures) console.error(`${label}\t${failure}`)
  if (failures.length > 0 && resolution.releaseEvidenceEligible) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) main()
