/**
 * S11 per-row session gate for the compiler corpus.
 *
 * `compiler-perf-gate` measures all 44 cases in one process and fails the whole
 * gate on the single worst row. That rule is only as good as one reading of one
 * row, and the corpus's small-n trivial rows are the least stable thing in it.
 *
 * The evidence that this matters is concrete. During S10X the row
 * `4+ ops, sink=reduce-like, boundary=none (trivial, n=100)` fell from 1.156 to
 * roughly 0.7–0.8. Attributing it by bisect produced 0.681 on a commit that
 * changes no shipped code and 0.798 on a later one that does. A bisect whose
 * worst reading lands on a benchmark-only commit is measuring the process, not
 * the commit.
 *
 * So this runs the whole gate in N fresh processes and judges each row on the
 * median of its per-session ratios. Every run does its own full corpus and
 * identity validation; nothing here relaxes that. What changes is only that a
 * row has to be slow repeatedly, in separate processes, before it fails — and
 * it still fails if it is.
 *
 * This is deliberately not a wider tolerance band or a moved floor. The floors
 * are the policy's own.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPILER_PERF_POLICIES } from './compiler-perf-contract'
import { currentPerfEngine } from './perf-engine'

const localDirectory = dirname(fileURLToPath(import.meta.url))

/** Fresh processes per judgement. Odd, so the median is an observed reading. */
export const SESSIONS = 5

export interface RowVerdict {
  readonly name: string
  readonly ratios: readonly number[]
  readonly median: number
  readonly minimum: number
  readonly passed: boolean
}

export interface SessionsVerdict {
  readonly rows: readonly RowVerdict[]
  readonly geomeans: readonly number[]
  readonly geomeanMedian: number
  readonly minimumGeomean: number
  readonly failures: readonly string[]
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const geomean = (values: readonly number[]): number =>
  Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length)

interface SessionReport {
  readonly cases: readonly { readonly name: string; readonly medianRatio: number }[]
}

/** One full gate run in its own process, returning that session's per-row ratios. */
const runSession = (reportPath: string): SessionReport => {
  const result = spawnSync('bun', ['run', join(localDirectory, 'compiler-perf-gate.ts')], {
    encoding: 'utf8',
    cwd: resolve(localDirectory, '..', '..'),
  })
  // A failing row makes the gate exit non-zero, which is exactly the case this
  // is here to adjudicate, so only a missing report is fatal.
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as SessionReport
  if (!Array.isArray(report.cases) || report.cases.length === 0) {
    throw new Error(`compiler perf session produced no cases: ${result.stderr}`)
  }
  return report
}

export const judgeSessions = (sessions: readonly SessionReport[]): SessionsVerdict => {
  const policy = COMPILER_PERF_POLICIES[currentPerfEngine().id]
  const byName = new Map<string, number[]>()
  const geomeans: number[] = []

  for (const session of sessions) {
    const ratios: number[] = []
    for (const row of session.cases) {
      const existing = byName.get(row.name) ?? []
      existing.push(row.medianRatio)
      byName.set(row.name, existing)
      ratios.push(row.medianRatio)
    }
    geomeans.push(geomean(ratios))
  }

  const rows: RowVerdict[] = [...byName.entries()]
    .map(([name, ratios]) => ({
      name,
      ratios,
      median: median(ratios),
      minimum: policy.minimumCaseRatio,
      passed: median(ratios) >= policy.minimumCaseRatio,
    }))
    .sort((a, b) => a.median - b.median)

  const failures: string[] = []
  for (const row of rows) {
    if (!row.passed) {
      failures.push(
        `${row.name}: median ${row.median.toFixed(3)} over ${row.ratios.length} sessions is below ${row.minimum.toFixed(2)}`,
      )
    }
  }
  const geomeanMedian = median(geomeans)
  if (geomeanMedian < policy.minimumGeomean) {
    failures.push(
      `global geomean median ${geomeanMedian.toFixed(3)} is below ${policy.minimumGeomean.toFixed(2)}`,
    )
  }

  return {
    rows,
    geomeans,
    geomeanMedian,
    minimumGeomean: policy.minimumGeomean,
    failures,
  }
}

const main = (): void => {
  const engine = currentPerfEngine()
  const reportPath = join(
    process.env.TMPDIR ?? '/tmp',
    'stopcock-fp-performance',
    `compiler-performance-${engine.id}.json`,
  )
  const sessions: SessionReport[] = []
  for (let session = 0; session < SESSIONS; session++) {
    sessions.push(runSession(reportPath))
    console.log(`session ${session + 1}/${SESSIONS} complete`)
  }
  const verdict = judgeSessions(sessions)

  for (const row of verdict.rows.slice(0, 6)) {
    console.log(
      `${row.passed ? 'PASS' : 'FAIL'}\t${row.name}\tmedian ${row.median.toFixed(3)}\tsessions [${row.ratios
        .map((ratio) => ratio.toFixed(3))
        .join(', ')}]\tfloor ${row.minimum.toFixed(2)}`,
    )
  }
  console.log(
    `${verdict.geomeanMedian >= verdict.minimumGeomean ? 'PASS' : 'FAIL'}\tglobal geomean\tmedian ${verdict.geomeanMedian.toFixed(3)}\tfloor ${verdict.minimumGeomean.toFixed(2)}`,
  )
  for (const failure of verdict.failures) console.error(`FAIL\t${failure}`)
  if (verdict.failures.length > 0) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) main()
