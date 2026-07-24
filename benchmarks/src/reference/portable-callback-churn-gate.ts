import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { currentPerfEngine, expectedEngineName, type PerfEngine } from './perf-engine'
import { geomean } from './perf-runner'

export type CallbackChurnCaseId =
  | 'identity/mod/sub'
  | 'linear/mod/add'
  | 'allocLinear/allocMod/add'
  | 'lane-saturation/alternating-8'

const EXPECTED_CASES = Object.freeze({
  'identity/mod/sub': Object.freeze({
    size: 100,
    minimumBatchIterations: 1_000,
    bindingSetCount: 1,
    alternationOrder: Object.freeze([0]),
  }),
  'linear/mod/add': Object.freeze({
    size: 10_000,
    minimumBatchIterations: 10,
    bindingSetCount: 1,
    alternationOrder: Object.freeze([0]),
  }),
  'allocLinear/allocMod/add': Object.freeze({
    size: 100_000,
    minimumBatchIterations: 1,
    bindingSetCount: 1,
    alternationOrder: Object.freeze([0]),
  }),
  'lane-saturation/alternating-8': Object.freeze({
    size: 1_000,
    minimumBatchIterations: 7,
    bindingSetCount: 8,
    alternationOrder: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7]),
  }),
} satisfies Readonly<
  Record<
    CallbackChurnCaseId,
    {
      readonly size: number
      readonly minimumBatchIterations: number
      readonly bindingSetCount: number
      readonly alternationOrder: readonly number[]
    }
  >
>)

interface CallbackChurnPolicy {
  readonly minimumRounds: number
  readonly maximumRme: number
  readonly minimumGeomean: number
  readonly minimumRatios: Readonly<Record<CallbackChurnCaseId, number>>
}

/**
 * This protects the callback-identity lane-bank optimization separately from
 * the broad corpus. Every case deliberately reuses one pipeline shape with
 * different binding identities. The saturation row additionally alternates
 * eight binding sets through the four-lane bank, which is the V8 failure mode
 * that an aggregate or sequential-only corpus result can otherwise hide.
 */
export const CALLBACK_CHURN_POLICIES = Object.freeze({
  'bun-jsc': Object.freeze({
    minimumRounds: 60,
    maximumRme: 5,
    minimumGeomean: 1.35,
    minimumRatios: Object.freeze({
      'identity/mod/sub': 0.58,
      'linear/mod/add': 1.05,
      'allocLinear/allocMod/add': 4,
      'lane-saturation/alternating-8': 1.05,
    }),
  }),
  'node-v8': Object.freeze({
    minimumRounds: 60,
    maximumRme: 5,
    minimumGeomean: 1.2,
    minimumRatios: Object.freeze({
      'identity/mod/sub': 0.9,
      'linear/mod/add': 0.9,
      'allocLinear/allocMod/add': 2.8,
      'lane-saturation/alternating-8': 0.82,
    }),
  }),
} satisfies Readonly<Record<PerfEngine['id'], CallbackChurnPolicy>>)

export interface CallbackChurnCase {
  readonly name: CallbackChurnCaseId
  readonly size: number
  readonly correctnessOk: boolean
  readonly bindingSetCount: number
  readonly alternationOrder: readonly number[]
  readonly rounds: number
  readonly batchIterations: number
  readonly medianRatio: number
  readonly meanRatio: number
  readonly ciLow: number
  readonly ciHigh: number
  readonly signTestP: number
  readonly relativeMarginOfError: number
}

export interface CallbackChurnReport {
  readonly generatedAt: string
  readonly runtime: Readonly<Record<string, unknown>> & { readonly runtime: string }
  readonly args: {
    readonly rounds: number
    readonly out?: string
  }
  readonly summary: {
    readonly count: number
    readonly allCorrect: boolean
    readonly geomeanRatio: number
    readonly minRatio: number
  }
  readonly cases: readonly CallbackChurnCase[]
}

export interface CallbackChurnEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
}

const approximatelyEqual = (left: number, right: number): boolean =>
  Number.isFinite(left) &&
  Number.isFinite(right) &&
  Math.abs(left - right) <= Math.max(1e-9, Math.abs(right) * 1e-9)

const sameNumbers = (left: readonly number[], right: readonly number[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const recordFailure = (failures: string[], condition: boolean, message: string): void => {
  if (!condition) failures.push(message)
}

export const evaluateCallbackChurnReport = (
  report: CallbackChurnReport,
  engine: PerfEngine,
): CallbackChurnEvaluation => {
  const failures: string[] = []
  const policy = CALLBACK_CHURN_POLICIES[engine.id]
  recordFailure(
    failures,
    engine.name === expectedEngineName(engine.id) && report.runtime.runtime === engine.runtime,
    `unexpected benchmark engine ${engine.id}/${engine.name} with runtime ${report.runtime.runtime}`,
  )
  recordFailure(
    failures,
    typeof report.generatedAt === 'string' && Number.isFinite(Date.parse(report.generatedAt)),
    'report has no valid generatedAt timestamp',
  )
  recordFailure(
    failures,
    Number.isSafeInteger(report.args.rounds) && report.args.rounds >= policy.minimumRounds,
    `report used ${report.args.rounds} rounds; minimum is ${policy.minimumRounds}`,
  )
  recordFailure(
    failures,
    report.cases.length === Object.keys(EXPECTED_CASES).length,
    `report contains ${report.cases.length} cases; expected ${Object.keys(EXPECTED_CASES).length}`,
  )
  recordFailure(
    failures,
    report.summary.count === report.cases.length,
    'callback-churn summary count does not match the case rows',
  )
  recordFailure(failures, report.summary.allCorrect === true, 'callback-churn summary is incorrect')

  const seen = new Set<CallbackChurnCaseId>()
  for (const item of report.cases) {
    const expected = EXPECTED_CASES[item.name]
    recordFailure(failures, expected !== undefined, `unexpected callback-churn case ${item.name}`)
    recordFailure(failures, !seen.has(item.name), `duplicate callback-churn case ${item.name}`)
    seen.add(item.name)
    if (expected === undefined) continue
    recordFailure(
      failures,
      item.size === expected.size,
      `${item.name}: used unexpected input size ${item.size}`,
    )
    recordFailure(
      failures,
      item.correctnessOk === true,
      `${item.name}: Stopcock and retained emitter outputs differ`,
    )
    recordFailure(
      failures,
      item.bindingSetCount === expected.bindingSetCount,
      `${item.name}: used ${item.bindingSetCount} binding sets; expected ${expected.bindingSetCount}`,
    )
    recordFailure(
      failures,
      sameNumbers(item.alternationOrder, expected.alternationOrder),
      `${item.name}: alternation order does not match the pinned scenario`,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.rounds) && item.rounds >= policy.minimumRounds,
      `${item.name}: used ${item.rounds} rounds`,
    )
    recordFailure(
      failures,
      Number.isSafeInteger(item.batchIterations) &&
        item.batchIterations >= expected.minimumBatchIterations,
      `${item.name}: used batch size ${item.batchIterations}`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.medianRatio) && item.medianRatio > 0,
      `${item.name}: invalid median ratio ${item.medianRatio}`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.meanRatio) && item.meanRatio > 0,
      `${item.name}: invalid mean ratio ${item.meanRatio}`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.ciLow) &&
        item.ciLow > 0 &&
        Number.isFinite(item.ciHigh) &&
        item.ciHigh >= item.ciLow &&
        item.ciLow <= item.medianRatio &&
        item.ciHigh >= item.medianRatio,
      `${item.name}: invalid confidence interval [${item.ciLow}, ${item.ciHigh}]`,
    )
    recordFailure(
      failures,
      Number.isFinite(item.signTestP) && item.signTestP >= 0 && item.signTestP <= 1,
      `${item.name}: invalid sign-test p-value ${item.signTestP}`,
    )
    const computedRme = ((item.ciHigh - item.ciLow) / (2 * item.medianRatio)) * 100
    recordFailure(
      failures,
      Number.isFinite(item.relativeMarginOfError) &&
        item.relativeMarginOfError >= 0 &&
        approximatelyEqual(item.relativeMarginOfError, computedRme),
      `${item.name}: reported relative margin of error does not match its confidence interval`,
    )
    recordFailure(
      failures,
      item.relativeMarginOfError <= policy.maximumRme ||
        // A GC-sensitive allocating case may have a wide interval while
        // remaining unambiguously above its shape-specific throughput floor.
        item.ciLow >= policy.minimumRatios[item.name],
      `${item.name}: relative margin of error ${item.relativeMarginOfError.toFixed(2)}% exceeds ${policy.maximumRme.toFixed(2)}%`,
    )
    recordFailure(
      failures,
      item.medianRatio >= policy.minimumRatios[item.name],
      `${item.name}: ratio ${item.medianRatio.toFixed(3)} is below ${policy.minimumRatios[item.name].toFixed(3)}`,
    )
  }
  for (const name of Object.keys(EXPECTED_CASES) as CallbackChurnCaseId[]) {
    recordFailure(failures, seen.has(name), `missing callback-churn case ${name}`)
  }

  const validRatios = report.cases
    .map((item) => item.medianRatio)
    .filter((ratio) => Number.isFinite(ratio) && ratio > 0)
  const globalGeomean = geomean(validRatios)
  const minimumRatio = validRatios.length === 0 ? Number.NaN : Math.min(...validRatios)
  recordFailure(
    failures,
    approximatelyEqual(report.summary.geomeanRatio, globalGeomean),
    'reported callback-churn geomean does not match the case rows',
  )
  recordFailure(
    failures,
    approximatelyEqual(report.summary.minRatio, minimumRatio),
    'reported callback-churn minimum does not match the case rows',
  )
  recordFailure(
    failures,
    globalGeomean >= policy.minimumGeomean,
    `callback-churn geomean ${globalGeomean.toFixed(3)} is below ${policy.minimumGeomean.toFixed(3)}`,
  )

  return { passed: failures.length === 0, failures: Object.freeze(failures) }
}

const artifactDirectory = (): string =>
  resolve(process.env.PERF_ARTIFACT_DIR ?? join(tmpdir(), 'stopcock-fp-performance'))

const main = async (): Promise<void> => {
  const engine = currentPerfEngine()
  const policy = CALLBACK_CHURN_POLICIES[engine.id]
  const directory = artifactDirectory()
  const reportPath = join(directory, `portable-callback-churn-${engine.id}.json`)
  const gatePath = join(directory, `portable-callback-churn-${engine.id}-gate.json`)
  const runnerPath = fileURLToPath(new URL('./portable-v8-callback-churn.ts', import.meta.url))
  const runnerArgs =
    engine.id === 'bun-jsc'
      ? ['run', runnerPath, '--rounds', String(policy.minimumRounds), '--out', reportPath]
      : ['--import=tsx', runnerPath, '--rounds', String(policy.minimumRounds), '--out', reportPath]

  await mkdir(directory, { recursive: true })
  const runner = spawnSync(process.execPath, runnerArgs, { stdio: 'inherit' })
  let report: CallbackChurnReport | undefined
  let evaluation: CallbackChurnEvaluation = {
    passed: false,
    failures: Object.freeze(['callback-churn benchmark did not produce a readable JSON report']),
  }
  try {
    report = JSON.parse(await readFile(reportPath, 'utf8')) as CallbackChurnReport
    evaluation = evaluateCallbackChurnReport(report, engine)
  } catch (error) {
    evaluation = {
      passed: false,
      failures: Object.freeze([
        `callback-churn report could not be evaluated: ${(error as Error).message}`,
      ]),
    }
  }

  const runnerPassed = runner.status === 0 && runner.signal === null
  const passed = runnerPassed && evaluation.passed
  await writeFile(
    gatePath,
    `${JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        engine,
        policy,
        runner: { status: runner.status, signal: runner.signal, reportPath },
        reportSummary: report?.summary,
        evaluation,
        passed,
      },
      null,
      2,
    )}\n`,
  )

  console.log(`\nPortable callback-churn release gate (${engine.name})\n`)
  for (const item of report?.cases ?? []) {
    console.log(
      [
        item.name,
        `ratio=${item.medianRatio.toFixed(3)}`,
        `RME=${item.relativeMarginOfError.toFixed(2)}%`,
        item.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  if (!runnerPassed) {
    console.error(`benchmark runner failed with status ${String(runner.status)}`)
  }
  for (const failure of evaluation.failures) console.error(`FAIL\t${failure}`)
  console.log(`raw report: ${reportPath}`)
  console.log(`gate report: ${gatePath}`)
  if (!passed) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
