/**
 * Focused callback-identity churn probe for the portable template runtime.
 *
 * V8 speculatively inlines callback targets inside a shared shape template.
 * This sequence deliberately reuses map -> filter -> reduce with three
 * independently compiled binding sets. The saturation scenario additionally
 * cycles eight same-shape binding sets twice per invocation. That exceeds the
 * four-lane bank and makes every lane alternate between two callback sets,
 * preventing a sequential benchmark from hiding lane saturation. The frozen
 * emitter remains the paired reference, and all callbacks/results are
 * resolved from the same specs.
 *
 * Run with:
 *   node --import=tsx src/reference/portable-v8-callback-churn.ts
 *   deno run -A src/reference/portable-v8-callback-churn.ts
 *   bun run src/reference/portable-v8-callback-churn.ts
 */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from '../../../packages/fp/src/compile'
import { generateInputArray, resolvePipeline, type SerializedStep } from './generate'
import { compileEmittedPipeline, type PipelineDesc } from './emitter'
import { geomean, runPaired } from './perf-runner'

const compileDynamic = compile as unknown as (
  ...steps: readonly unknown[]
) => (input: unknown) => unknown

interface ChurnCase {
  readonly name: string
  readonly inputSeed: number
  readonly size: number
  readonly steps: readonly SerializedStep[]
}

const SIMPLE_CASES: readonly ChurnCase[] = [
  {
    name: 'identity/mod/sub',
    inputSeed: 0x41,
    size: 100,
    steps: [
      { kind: 'map', spec: { kind: 'identity' } },
      { kind: 'filter', spec: { kind: 'mod', m: 2, r: 1 } },
      { kind: 'reduce', spec: { kind: 'reduceSub' }, a1: 0 },
    ],
  },
  {
    name: 'linear/mod/add',
    inputSeed: 0x42,
    size: 10_000,
    steps: [
      { kind: 'map', spec: { kind: 'linear', a: 2, b: -2 } },
      { kind: 'filter', spec: { kind: 'mod', m: 3, r: 0 } },
      { kind: 'reduce', spec: { kind: 'reduceAdd' }, a1: 0 },
    ],
  },
  {
    name: 'allocLinear/allocMod/add',
    inputSeed: 0x43,
    size: 100_000,
    steps: [
      { kind: 'map', spec: { kind: 'allocLinear', a: 3 } },
      { kind: 'filter', spec: { kind: 'allocMod', m: 4, r: 2 } },
      { kind: 'reduce', spec: { kind: 'reduceAdd' }, a1: 0 },
    ],
  },
]

/** The production templates use four bounded static callback lanes. */
export const CHARACTERIZED_CALLBACK_LANE_COUNT = 4

/**
 * Kept as data so evaluator tests can prove the probe really exceeds the
 * bounded lane bank and revisits every binding set after the bank is full.
 */
export const CALLBACK_LANE_SATURATION_SCENARIO = Object.freeze({
  name: 'lane-saturation/alternating-8' as const,
  inputSeed: 0x44,
  size: 1_000,
  bindingSetCount: 8,
  alternationOrder: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7]),
  stepsByBinding: Object.freeze(
    Array.from({ length: 8 }, (_, index): readonly SerializedStep[] =>
      Object.freeze([
        {
          kind: 'map',
          spec: { kind: 'linear', a: (index % 4) + 1, b: index - 3 },
        },
        {
          kind: 'filter',
          spec: { kind: 'mod', m: (index % 4) + 2, r: index % ((index % 4) + 2) },
        },
        {
          kind: 'reduce',
          spec: index % 2 === 0 ? { kind: 'reduceAdd' } : { kind: 'reduceSub' },
          a1: index,
        },
      ]),
    ),
  ),
})

const TARGET_ELEMENTS_PER_SAMPLE = 100_000
let measurementSink: unknown

const batched = (run: () => unknown, iterations: number): (() => void) => {
  return () => {
    let last: unknown
    for (let index = 0; index < iterations; index++) last = run()
    measurementSink = last
  }
}

const relativeMarginOfError = (low: number, high: number, median: number): number =>
  ((high - low) / (2 * median)) * 100

const alternating = (
  runners: readonly (() => unknown)[],
  order: readonly number[],
): (() => unknown) => {
  return () => {
    let last: unknown
    for (const index of order) last = runners[index]()
    return last
  }
}

function parseArgs(argv: readonly string[]): {
  readonly rounds: number
  readonly out?: string
} {
  let rounds = 40
  let out: string | undefined
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--rounds') rounds = Number(argv[++index])
    else if (argument === '--out') out = argv[++index]
  }
  if (!Number.isSafeInteger(rounds) || rounds < 1) {
    throw new RangeError('--rounds must be a positive safe integer')
  }
  return { rounds, out }
}

function runtimeIdentity(): Record<string, unknown> {
  const globals = globalThis as {
    readonly Bun?: { readonly version?: string }
    readonly Deno?: { readonly version?: Record<string, string> }
  }
  if (globals.Bun) return { runtime: 'bun', version: globals.Bun.version }
  if (globals.Deno) return { runtime: 'deno', ...globals.Deno.version }
  return {
    runtime: 'node',
    node: process.version,
    v8: process.versions.v8,
  }
}

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2))
  const simpleReports = SIMPLE_CASES.map((item) => {
    const input = generateInputArray(item.inputSeed, item.size)
    const resolved = resolvePipeline({ input, steps: item.steps })
    const stopcock = compileDynamic(...resolved.realSteps)
    const reference = compileEmittedPipeline(resolved.desc as PipelineDesc)
    const expected = reference(resolved.input, resolved.bindings)
    const actual = stopcock(resolved.input)
    const correctnessOk = Object.is(actual, expected)
    const batchIterations = Math.max(1, Math.ceil(TARGET_ELEMENTS_PER_SAMPLE / item.size))
    const measured = runPaired(
      batched(() => stopcock(resolved.input), batchIterations),
      batched(() => reference(resolved.input, resolved.bindings), batchIterations),
      { rounds: args.rounds },
    )
    return {
      name: item.name,
      size: item.size,
      correctnessOk,
      bindingSetCount: 1,
      alternationOrder: [0],
      rounds: measured.pairedRatios.length,
      batchIterations,
      medianRatio: measured.medianRatio,
      meanRatio: measured.meanRatio,
      ciLow: measured.ciLow,
      ciHigh: measured.ciHigh,
      signTestP: measured.signTestP,
      relativeMarginOfError: relativeMarginOfError(
        measured.ciLow,
        measured.ciHigh,
        measured.medianRatio,
      ),
    }
  })

  const saturation = CALLBACK_LANE_SATURATION_SCENARIO
  const saturationInput = generateInputArray(saturation.inputSeed, saturation.size)
  const saturationResolved = saturation.stepsByBinding.map((steps) =>
    resolvePipeline({ input: saturationInput, steps }),
  )
  const saturationStopcockRunners = saturationResolved.map((resolved) => {
    const runner = compileDynamic(...resolved.realSteps)
    return () => runner(resolved.input)
  })
  const saturationReferenceRunners = saturationResolved.map((resolved) => {
    const runner = compileEmittedPipeline(resolved.desc as PipelineDesc)
    return () => runner(resolved.input, resolved.bindings)
  })
  const saturationCorrectnessOk = saturationStopcockRunners.every((runner, index) =>
    Object.is(runner(), saturationReferenceRunners[index]()),
  )
  const saturationBatchIterations = Math.max(
    1,
    Math.ceil(
      TARGET_ELEMENTS_PER_SAMPLE / (saturation.size * saturation.alternationOrder.length),
    ),
  )
  const saturationMeasured = runPaired(
    batched(
      alternating(saturationStopcockRunners, saturation.alternationOrder),
      saturationBatchIterations,
    ),
    batched(
      alternating(saturationReferenceRunners, saturation.alternationOrder),
      saturationBatchIterations,
    ),
    { rounds: args.rounds },
  )
  const saturationReport = {
    name: saturation.name,
    size: saturation.size,
    correctnessOk: saturationCorrectnessOk,
    bindingSetCount: saturation.bindingSetCount,
    alternationOrder: saturation.alternationOrder,
    rounds: saturationMeasured.pairedRatios.length,
    batchIterations: saturationBatchIterations,
    medianRatio: saturationMeasured.medianRatio,
    meanRatio: saturationMeasured.meanRatio,
    ciLow: saturationMeasured.ciLow,
    ciHigh: saturationMeasured.ciHigh,
    signTestP: saturationMeasured.signTestP,
    relativeMarginOfError: relativeMarginOfError(
      saturationMeasured.ciLow,
      saturationMeasured.ciHigh,
      saturationMeasured.medianRatio,
    ),
  }
  const reports = [...simpleReports, saturationReport]
  const ratios = reports.map((report) => report.medianRatio)
  const output = {
    generatedAt: new Date().toISOString(),
    runtime: runtimeIdentity(),
    args,
    summary: {
      count: reports.length,
      allCorrect: reports.every((report) => report.correctnessOk),
      geomeanRatio: geomean(ratios),
      minRatio: Math.min(...ratios),
    },
    cases: reports,
  }

  console.log('Portable callback-churn probe (ratio = emitted reference ns / Stopcock ns)')
  for (const report of reports) {
    console.log(
      [
        report.name,
        report.medianRatio.toFixed(3),
        `[${report.ciLow.toFixed(3)}, ${report.ciHigh.toFixed(3)}]`,
        report.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(
    `geomean=${output.summary.geomeanRatio.toFixed(3)} min=${output.summary.minRatio.toFixed(3)}`,
  )
  if (args.out) await writeFile(args.out, `${JSON.stringify(output, null, 2)}\n`)
  void measurementSink
  if (!output.summary.allCorrect) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
