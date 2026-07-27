import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipe } from '../../../packages/fp/src/index'
import * as Iter from '../../../packages/fp/src/iter'
import { transformStopcockPipelines } from '../../../packages/fp-compiler/src/transform'
import { getData } from '../setup'
import { currentPerfEngine, type PerfEngine } from './perf-engine'
import { geomean, runInterleavedPaired } from './perf-runner'

/**
 * Phase 4: measures a *compiled* Iter chain against the same chain run
 * through the real, uncompiled `Iter` runtime -- both in-process, same
 * engine, same data. `iter-perf-gate.ts`/`iter-broad-perf-gate.ts` gate the
 * *runtime* tier (Iter vs a hand-written native loop) and stay unchanged;
 * this is the compiled tier's own gate, expected to clear a *multiple*
 * (several-fold), not a percentage-of-native-loop floor, since a compiled
 * chain drops the iterator-protocol/plan-object overhead entirely.
 *
 * No bootstrap CI / sign-test / sha256-pinned corpus apparatus here
 * (contrast `compiler-perf-gate.ts`): that machinery earns its cost over a
 * large, frozen op corpus measured release-to-release. This is a smaller,
 * honest reporting gate for one new domain's first compiled wave -- it
 * fails only if a chain regresses below native-loop parity (1.0x), a
 * threshold any quiet-vs-noisy machine can agree on, and otherwise prints
 * the measured multiples for a human to read.
 */

const SIZE = 100_000
const ROUNDS = 60
const WARMUP_ROUNDS = 5
const BATCH_ITERATIONS = 200

interface Workload {
  readonly id: string
  readonly compiledSource: string
  readonly run: (data: readonly number[]) => unknown
  readonly compiled: (data: readonly number[]) => unknown
}

function compile(source: string): (data: readonly number[]) => unknown {
  const wrapped = `import { pipe } from '@stopcock/fp/fusion'\nimport * as I from '@stopcock/fp/iter'\nexport function __bench(data) {\n${source}\n}\n`
  const result = transformStopcockPipelines(wrapped, 'iter-compiled-perf-gate-fixture.ts', {
    diagnostics: 'verbose',
  })
  if (!result.diagnostics[0]?.transformed) {
    throw new Error(`iter-compiled-perf-gate: fixture did not compile: ${result.diagnostics[0]?.reason}`)
  }
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gmu, '')
    .replace(/^export\s+/gmu, '')
  // `I.map(fn)` etc. still appear once each as construction-time capture
  // lines (preserving exact observable evaluation order), so the generated
  // function needs a real `I` binding even though the fused body never
  // calls through it at runtime.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function('I', 'pipe', `${stripped}\nreturn __bench;`)
  return factory(Iter, pipe) as (data: readonly number[]) => unknown
}

function workload(
  id: string,
  compiledSource: string,
  run: (data: readonly number[]) => unknown,
): Workload {
  return { id, compiledSource, run, compiled: compile(compiledSource) }
}

const double = (value: number): number => value * 2
const isEven = (value: number): boolean => value % 2 === 0

const WORKLOADS: readonly Workload[] = [
  workload(
    'map -> filter -> take -> toArray',
    `return pipe(data, I.map((x) => x * 2), I.filter((x) => x % 2 === 0), I.take(100), I.toArray);`,
    (data) =>
      pipe(data, Iter.map(double), Iter.filter(isEven), Iter.take(100), Iter.toArray),
  ),
  workload(
    'map -> filter -> reduce',
    `return pipe(data, I.map((x) => x * 2), I.filter((x) => x % 2 === 0), I.reduce((acc, x) => acc + x, 0));`,
    (data) =>
      pipe(
        data,
        Iter.map(double),
        Iter.filter(isEven),
        Iter.reduce((acc, x) => acc + x, 0),
      ),
  ),
  workload(
    'dropWhile -> takeWhile -> toArray',
    `return pipe(data, I.dropWhile((x) => x < 0.2), I.takeWhile((x) => x < 0.8), I.toArray);`,
    (data) =>
      pipe(
        data,
        Iter.dropWhile((x) => x < 0.2),
        Iter.takeWhile((x) => x < 0.8),
        Iter.toArray,
      ),
  ),
  workload(
    'chunk -> map -> toArray',
    `return pipe(data, I.chunk(4), I.map((c) => c.length), I.toArray);`,
    (data) =>
      pipe(
        data,
        Iter.chunk(4),
        Iter.map((c) => c.length),
        Iter.toArray,
      ),
  ),
  workload(
    'flatMap -> filter -> toArray',
    `return pipe(data, I.flatMap((x) => [x, x + 1]), I.filter((x) => x % 2 === 0), I.toArray);`,
    (data) =>
      pipe(
        data,
        Iter.flatMap((x) => [x, x + 1]),
        Iter.filter((x) => x % 2 === 0),
        Iter.toArray,
      ),
  ),
]

interface WorkloadResult {
  readonly id: string
  readonly correctnessOk: boolean
  readonly medianRatio: number
  readonly meanRatio: number
  readonly rounds: number
}

interface CompiledPerfReport {
  readonly generatedAt: string
  readonly engine: PerfEngine
  readonly size: number
  readonly cases: readonly WorkloadResult[]
  readonly geomeanRatio: number
  readonly minRatio: number
  readonly allCorrect: boolean
}

const deepEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const artifactDirectory = (): string =>
  resolve(process.env.PERF_ARTIFACT_DIR ?? join(tmpdir(), 'stopcock-fp-performance'))

const main = async (): Promise<void> => {
  const engine = currentPerfEngine()
  const data = getData<number>('numbers', SIZE)
  const cases: WorkloadResult[] = []

  for (const load of WORKLOADS) {
    const compiledOutput = load.compiled(data)
    const nativeOutput = load.run(data)
    const correctnessOk = deepEqual(compiledOutput, nativeOutput)

    const measured = runInterleavedPaired(
      () => load.compiled(data),
      () => load.run(data),
      {
        rounds: ROUNDS,
        warmupRounds: WARMUP_ROUNDS,
        batchIterations: BATCH_ITERATIONS,
        microBatchIterations: BATCH_ITERATIONS,
      },
    )

    cases.push({
      id: load.id,
      correctnessOk,
      medianRatio: measured.medianRatio,
      meanRatio: measured.meanRatio,
      rounds: measured.pairedRatios.length,
    })
  }

  const ratios = cases.map((item) => item.medianRatio)
  const report: CompiledPerfReport = {
    generatedAt: new Date().toISOString(),
    engine,
    size: SIZE,
    cases,
    geomeanRatio: geomean(ratios),
    minRatio: Math.min(...ratios),
    allCorrect: cases.every((item) => item.correctnessOk),
  }

  const directory = artifactDirectory()
  await mkdir(directory, { recursive: true })
  const reportPath = join(directory, `iter-compiled-perf-${engine.id}.json`)
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  console.log(`\nIter compiled-vs-runtime gate (${engine.name}, n=${SIZE})\n`)
  console.log(['case', 'median x', 'mean x', 'correct'].join('\t'))
  for (const item of cases) {
    console.log(
      [
        item.id,
        `${item.medianRatio.toFixed(2)}x`,
        `${item.meanRatio.toFixed(2)}x`,
        item.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(`\ngeomean: ${report.geomeanRatio.toFixed(2)}x  min: ${report.minRatio.toFixed(2)}x`)
  console.log(`report: ${reportPath}`)

  const failures: string[] = []
  if (!report.allCorrect) failures.push('one or more compiled/native outputs disagree')
  for (const item of cases) {
    if (item.medianRatio < 1) {
      failures.push(`${item.id}: compiled is slower than the uncompiled runtime (${item.medianRatio.toFixed(2)}x)`)
    }
  }
  for (const failure of failures) console.error(`FAIL\t${failure}`)
  if (failures.length > 0) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
