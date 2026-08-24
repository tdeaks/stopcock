import { describe, expect, it } from 'vite-plus/test'
import {
  evaluateTypedArrayPerfReport,
  parseTypedArrayWorkerOutput,
  TYPED_ARRAY_WORKER_MARKER,
  type TypedArrayPerfCase,
  type TypedArrayPerfReport,
} from './typed-array-perf-gate'
import type { PerfEngine } from './perf-engine'
import {
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
} from './perf-runner'

const kinds = ['float64', 'bigint64'] as const
const operations = [
  'clone',
  'copyInto',
  'filter',
  'concat',
  'slice',
  'reverse',
  'includes',
  'sort',
] as const
const sizes = [64, 4_096, 65_536] as const
const rounds = 160
const nodeEngine: PerfEngine = {
  id: 'node-v8',
  name: 'Node/V8',
  runtime: 'node',
  runtimeVersion: '24.0.0',
  v8: '13.6.233',
  platform: 'linux',
  architecture: 'x64',
}

const comparison = (
  ratio: number,
  requiresExplicitGc: boolean,
  warmupRounds = 400,
): TypedArrayPerfCase['frozen'] => ({
  workerEngine: nodeEngine,
  rounds,
  warmupRounds,
  batchIterations: 50,
  microBatchIterations: 10,
  medianRatio: ratio,
  meanRatio: ratio,
  ciLow: ratio,
  ciHigh: ratio,
  signTestP: 0,
  relativeMarginOfError: 0,
  candidateNs: Array.from({ length: rounds }, () => 100),
  referenceNs: Array.from({ length: rounds }, () => 100 * ratio),
  pairedRatios: Array.from({ length: rounds }, () => ratio),
  sampler: {
    id: INTERLEAVED_PAIRED_SAMPLER_ID,
    order: INTERLEAVED_PAIRED_SAMPLER_ORDER,
    batchIterationsPerSide: 50,
    microBatchIterations: 10,
    microBatchesPerSide: 5,
    garbageCollection: {
      mode: requiresExplicitGc ? 'between-paired-samples' : 'none',
      required: requiresExplicitGc,
      available: true,
    },
  },
})

const validReport = (): TypedArrayPerfReport => {
  const cases = kinds.flatMap((kind) =>
    operations.flatMap((operation) =>
      sizes.map((size) => ({
        kind,
        operation,
        size,
        correctnessOk: true,
        frozen: comparison(
          1.2,
          (kind === 'bigint64' && operation === 'sort' && size === 65_536) ||
            ((operation === 'clone' || operation === 'slice') && size === 65_536) ||
            (operation === 'concat' && size === 4_096),
          operation === 'slice' ? (size === 65_536 ? 2_000 : 1_200) : 400,
        ),
        native: comparison(
          1,
          (kind === 'bigint64' && operation === 'sort' && size === 65_536) ||
            (operation === 'concat' && size === 4_096),
        ),
      })),
    ),
  )
  return {
    gateId: 'stopcock-typed-array-cross-engine-v1',
    generatedAt: '2026-07-23T00:00:00.000Z',
    engine: nodeEngine,
    comparison: {
      candidate: '@stopcock/fp/typed-array current',
      frozen: 'frozen-pre-typed-array-bulk-v2',
      native: 'engine typed-array equivalent',
      ratio: 'referenceNs / candidateNs; greater is faster',
    },
    corpus: { kinds, operations, sizes, expectedCount: cases.length },
    args: { rounds, warmupRounds: 400 },
    summary: {
      count: cases.length,
      complete: true,
      allCorrect: true,
      frozenGeomean: 1.2,
      frozenMin: 1.2,
      nativeGeomean: 1,
      nativeMin: 1,
      maximumRme: 0,
    },
    cases,
    skipped: [],
  }
}

const mutate = (
  report: TypedArrayPerfReport,
  mutation: (draft: Record<string, any>) => void,
): TypedArrayPerfReport => {
  const draft = structuredClone(report) as unknown as Record<string, any>
  mutation(draft)
  return draft as unknown as TypedArrayPerfReport
}

describe('typed-array performance gate evaluator', () => {
  it('accepts exactly one matching isolated-worker result and rejects substitution', () => {
    const result = {
      kind: 'float64' as const,
      operation: 'clone' as const,
      size: 64,
      reference: 'frozen' as const,
      correctnessOk: true,
      samples: comparison(1.2, false),
    }
    const success = {
      ok: true as const,
      workerCaseIndex: 0,
      workerKind: 'float64' as const,
      workerOperation: 'clone' as const,
      workerSize: 64,
      workerReference: 'frozen' as const,
      workerEngine: nodeEngine,
      result,
    }
    const expected = {
      caseIndex: 0,
      kind: 'float64' as const,
      operation: 'clone' as const,
      size: 64,
      reference: 'frozen' as const,
      engine: nodeEngine,
    }
    const marker = `${TYPED_ARRAY_WORKER_MARKER}${JSON.stringify(success)}\n`
    expect(parseTypedArrayWorkerOutput(marker, 0, null, expected)).toEqual(success)

    const rejected = [
      parseTypedArrayWorkerOutput('', 1, null, expected),
      parseTypedArrayWorkerOutput(`${marker}${marker}`, 0, null, expected),
      parseTypedArrayWorkerOutput(
        `${TYPED_ARRAY_WORKER_MARKER}${JSON.stringify({ ...success, workerSize: 65 })}\n`,
        0,
        null,
        expected,
      ),
      parseTypedArrayWorkerOutput(
        `${TYPED_ARRAY_WORKER_MARKER}${JSON.stringify({ ...success, workerReference: 'native' })}\n`,
        0,
        null,
        expected,
      ),
      parseTypedArrayWorkerOutput(
        `${TYPED_ARRAY_WORKER_MARKER}${JSON.stringify({
          ...success,
          workerEngine: { ...nodeEngine, runtimeVersion: 'substitute' },
        })}\n`,
        0,
        null,
        expected,
      ),
    ]
    for (const outcome of rejected) expect(outcome.ok).toBe(false)
  })

  it('accepts a complete internally consistent report', () => {
    expect(evaluateTypedArrayPerfReport(validReport())).toEqual({ passed: true, failures: [] })
  })

  it('fails closed when corpus identity, samples, sampler, or summaries are substituted', () => {
    const mutations: ReadonlyArray<
      readonly [string, (draft: Record<string, any>) => void]
    > = [
      ['corpus arrays', (draft) => draft.corpus.kinds.reverse()],
      ['corpus combination', (draft) => (draft.cases[0].size = 65)],
      ['warmup count', (draft) => (draft.args.warmupRounds = 1)],
      ['sampler id', (draft) => (draft.cases[0].frozen.sampler.id = 'substitute')],
      ['sampler order', (draft) => (draft.cases[0].native.sampler.order = 'AABB')],
      ['micro-batch count', (draft) => (draft.cases[0].frozen.sampler.microBatchesPerSide = 4)],
      [
        'worker runtime',
        (draft) =>
          (draft.cases[0].frozen.workerEngine = {
            ...draft.cases[0].frozen.workerEngine,
            runtimeVersion: 'substitute',
          }),
      ],
      [
        'explicit GC policy',
        (draft) =>
          (draft.cases.at(-1).native.sampler.garbageCollection.available = false),
      ],
      ['raw candidate sample', (draft) => (draft.cases[0].native.candidateNs[0] = 0)],
      ['raw reference sample', (draft) => (draft.cases[0].native.referenceNs[0] = Number.NaN)],
      ['paired ratio', (draft) => (draft.cases[0].frozen.pairedRatios[0] = 9)],
      ['median', (draft) => (draft.cases[0].frozen.medianRatio = 9)],
      ['mean', (draft) => (draft.cases[0].native.meanRatio = 9)],
      ['confidence interval', (draft) => (draft.cases[0].native.ciHigh = 2)],
      ['row RME', (draft) => (draft.cases[0].native.relativeMarginOfError = 1)],
      ['summary geomean', (draft) => (draft.summary.frozenGeomean = 9)],
      ['summary minimum', (draft) => (draft.summary.nativeMin = 9)],
      ['summary maximum RME', (draft) => (draft.summary.maximumRme = 9)],
    ]

    for (const [label, applyMutation] of mutations) {
      const evaluation = evaluateTypedArrayPerfReport(
        mutate(validReport(), applyMutation),
      )
      expect(evaluation.passed, label).toBe(false)
      expect(evaluation.failures.length, label).toBeGreaterThan(0)
    }
  })

  it('pins the V8 tiny-BigInt intrinsic trade-off without weakening adjacent rows', () => {
    const report = validReport()
    const row = report.cases.find(
      (item) =>
        item.kind === 'bigint64' &&
        item.operation === 'includes' &&
        item.size === 64,
    )
    expect(row).toBeDefined()
    ;(row as { frozen: TypedArrayPerfCase['frozen'] }).frozen = comparison(0.81, false)
    const frozenRatios = report.cases.map((item) => item.frozen.medianRatio)
    ;(report.summary as { frozenGeomean: number; frozenMin: number }).frozenGeomean =
      Math.exp(
        frozenRatios.reduce((total, ratio) => total + Math.log(ratio), 0) /
          frozenRatios.length,
      )
    ;(report.summary as { frozenGeomean: number; frozenMin: number }).frozenMin =
      Math.min(...frozenRatios)
    expect(evaluateTypedArrayPerfReport(report).passed).toBe(true)

    ;(row as { frozen: TypedArrayPerfCase['frozen'] }).frozen = comparison(0.79, false)
    const slowerRatios = report.cases.map((item) => item.frozen.medianRatio)
    ;(report.summary as { frozenGeomean: number; frozenMin: number }).frozenGeomean =
      Math.exp(
        slowerRatios.reduce((total, ratio) => total + Math.log(ratio), 0) /
          slowerRatios.length,
      )
    ;(report.summary as { frozenGeomean: number; frozenMin: number }).frozenMin =
      Math.min(...slowerRatios)
    const rejected = evaluateTypedArrayPerfReport(report)
    expect(rejected.passed).toBe(false)
    expect(rejected.failures.join('\n')).toContain('below 0.800')
  })

  it('accepts wide intervals only when characterized or wholly above the floor', () => {
    const report = validReport()
    const noisy = comparison(1.2, false)
    ;(noisy as { ciLow: number; ciHigh: number; relativeMarginOfError: number }).ciLow =
      1.08
    ;(noisy as { ciLow: number; ciHigh: number; relativeMarginOfError: number }).ciHigh =
      1.32
    ;(
      noisy as {
        ciLow: number
        ciHigh: number
        relativeMarginOfError: number
      }
    ).relativeMarginOfError = 10

    const characterized = report.cases.find(
      (item) =>
        item.kind === 'bigint64' &&
        item.operation === 'filter' &&
        item.size === 4_096,
    )
    expect(characterized).toBeDefined()
    ;(characterized as { frozen: TypedArrayPerfCase['frozen'] }).frozen = noisy
    ;(report.summary as { maximumRme: number }).maximumRme = 10
    expect(evaluateTypedArrayPerfReport(report).passed).toBe(true)

    const adjacent = report.cases.find(
      (item) =>
        item.kind === 'float64' &&
        item.operation === 'filter' &&
        item.size === 4_096,
    )
    expect(adjacent).toBeDefined()
    ;(adjacent as { frozen: TypedArrayPerfCase['frozen'] }).frozen = noisy
    expect(evaluateTypedArrayPerfReport(report).passed).toBe(true)

    const unsafe = comparison(1.2, false)
    ;(unsafe as { ciLow: number; ciHigh: number; relativeMarginOfError: number }).ciLow =
      0.8
    ;(unsafe as { ciLow: number; ciHigh: number; relativeMarginOfError: number }).ciHigh =
      1.6
    ;(
      unsafe as {
        ciLow: number
        ciHigh: number
        relativeMarginOfError: number
      }
    ).relativeMarginOfError = ((1.6 - 0.8) / (2 * 1.2)) * 100
    ;(adjacent as { frozen: TypedArrayPerfCase['frozen'] }).frozen = unsafe
    ;(report.summary as { maximumRme: number }).maximumRme =
      unsafe.relativeMarginOfError
    const rejected = evaluateTypedArrayPerfReport(report)
    expect(rejected.passed).toBe(false)
    expect(rejected.failures.join('\n')).toContain('exceeds 5.00%')
  })
})
