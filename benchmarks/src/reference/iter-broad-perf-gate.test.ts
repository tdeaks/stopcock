import { describe, expect, test } from 'vite-plus/test'
import {
  evaluateIterBroadPerfReport,
  ITER_BROAD_CASE_IDS,
  ITER_BROAD_WORKER_MARKER,
  parseIterBroadWorkerOutput,
  type IterBroadPerfCase,
  type IterBroadPerfReport,
} from './iter-broad-perf-gate'
import type { PerfEngine, PerfEngineId } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
} from './perf-runner'

const ENGINES: Readonly<Record<PerfEngineId, PerfEngine>> = {
  'bun-jsc': {
    id: 'bun-jsc',
    name: 'Bun/JavaScriptCore',
    runtime: 'bun',
    runtimeVersion: '1.3.14',
    nodeCompatibility: '24.3.0',
    platform: 'darwin',
    architecture: 'arm64',
  },
  'node-v8': {
    id: 'node-v8',
    name: 'Node/V8',
    runtime: 'node',
    runtimeVersion: '22.19.0',
    v8: '12.4.254.21-node.29',
    platform: 'darwin',
    architecture: 'arm64',
  },
}

const makeCases = (ratio = 1.2): IterBroadPerfCase[] =>
  ITER_BROAD_CASE_IDS.map((id) => {
    const inputSize = 4_096
    const rounds = 300
    const batchIterations = 16
    const targetConsumedItemsPerMicroBatch = 10_000
    const microBatchIterations = consumedItemsMicroBatchIterations(
      inputSize,
      batchIterations,
      targetConsumedItemsPerMicroBatch,
    )
    return {
      id,
      sourceKind: id.startsWith('set/')
        ? 'set'
        : id.startsWith('generator/')
          ? 'generator'
          : 'array',
      inputSize,
      correctnessOk: true,
      workerEngine: ENGINES['bun-jsc'],
      rounds,
      batchIterations,
      sampling: {
        id: INTERLEAVED_PAIRED_SAMPLER_ID,
        order: INTERLEAVED_PAIRED_SAMPLER_ORDER,
        batchIterationsPerSide: batchIterations,
        microBatchIterations,
        microBatchesPerSide: Math.ceil(batchIterations / microBatchIterations),
        targetConsumedItemsPerMicroBatch,
        nominalConsumedItemsPerMicroBatch: microBatchIterations * inputSize,
      },
      medianRatio: ratio,
      meanRatio: ratio,
      ciLow: ratio * 0.98,
      ciHigh: ratio * 1.02,
      signTestP: 1,
      relativeMarginOfError: 2,
      currentSamplesNs: Array.from({ length: rounds }, () => 100),
      frozenSamplesNs: Array.from({ length: rounds }, () => 100 * ratio),
      pairedRatios: Array.from({ length: rounds }, () => ratio),
    }
  })

const geomean = (values: readonly number[]): number =>
  Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length)

const makeReport = (
  cases: readonly IterBroadPerfCase[],
  engineId: PerfEngineId = 'bun-jsc',
  overrides: Partial<IterBroadPerfReport> = {},
): IterBroadPerfReport => {
  const engine = ENGINES[engineId]
  const engineCases = cases.map((item) => ({ ...item, workerEngine: engine }))
  const ratios = cases.map((item) => item.medianRatio)
  return {
    generatedAt: '2026-07-23T12:00:00.000Z',
    engine,
    comparison: {
      candidate: '@stopcock/fp current Iter executor',
      reference: 'frozen pre-broadening Iter executor',
      ratio: 'frozenNs / currentNs; greater is faster',
    },
    args: { rounds: 300, minimumBatchItems: 65_536 },
    summary: {
      count: cases.length,
      expectedCount: ITER_BROAD_CASE_IDS.length,
      geomeanRatio: geomean(ratios),
      minRatio: Math.min(...ratios),
      allCorrect: true,
      complete: true,
    },
    cases: engineCases,
    skipped: [],
    ...overrides,
  }
}

describe('broad Iter performance policy', () => {
  test('accepts exactly one matching fresh-worker result and rejects substitution', () => {
    const result = makeCases()[0]
    const expected = {
      caseIndex: 0,
      caseId: result.id,
      sourceKind: result.sourceKind,
      inputSize: result.inputSize,
      engine: ENGINES['bun-jsc'],
    }
    const success = {
      ok: true,
      workerCaseIndex: 0,
      workerCaseId: result.id,
      workerEngine: ENGINES['bun-jsc'],
      result,
    }
    expect(
      parseIterBroadWorkerOutput(
        `${ITER_BROAD_WORKER_MARKER}${JSON.stringify(success)}\n`,
        0,
        null,
        expected,
      ),
    ).toEqual(success)

    const substituted = {
      ...success,
      workerCaseIndex: 1,
      workerEngine: ENGINES['node-v8'],
    }
    const rejected = parseIterBroadWorkerOutput(
      `${ITER_BROAD_WORKER_MARKER}${JSON.stringify(substituted)}\n`,
      0,
      null,
      expected,
    )
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) expect(rejected.reason).toContain('worker identity')
  })

  test('accepts complete characterized reports on Bun and Node', () => {
    for (const engineId of ['bun-jsc', 'node-v8'] as const) {
      expect(evaluateIterBroadPerfReport(makeReport(makeCases(), engineId))).toEqual({
        passed: true,
        failures: [],
      })
    }
  })

  test('fails closed on a missing, incorrect, noisy, or undersampled row', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      correctnessOk: false,
      rounds: 5,
      batchIterations: 1,
      relativeMarginOfError: 20,
    }
    const partial = cases.slice(0, -1)
    const evaluation = evaluateIterBroadPerfReport(
      makeReport(partial, 'node-v8', {
        args: { rounds: 5, minimumBatchItems: 100 },
        summary: {
          count: partial.length,
          expectedCount: ITER_BROAD_CASE_IDS.length,
          geomeanRatio: geomean(partial.map((item) => item.medianRatio)),
          minRatio: Math.min(...partial.map((item) => item.medianRatio)),
          allCorrect: false,
          complete: false,
        },
        skipped: ['generator/10-stage/reduce: failed'],
      }),
    )
    const failures = evaluation.failures.join('\n')

    expect(evaluation.passed).toBe(false)
    expect(failures).toContain('expected 14')
    expect(failures).toContain('skipped')
    expect(failures).toContain('incorrect output')
    expect(failures).toContain('batch covers only')
    expect(failures).toContain('RME')
  })

  test('rejects any hidden slow row even if the global result remains fast', () => {
    const cases = makeCases(1.5)
    cases[6] = {
      ...cases[6],
      medianRatio: 0.5,
      meanRatio: 0.5,
      ciLow: 0.49,
      ciHigh: 0.51,
    }
    const report = makeReport(cases, 'bun-jsc', {
      summary: {
        count: cases.length,
        expectedCount: ITER_BROAD_CASE_IDS.length,
        geomeanRatio: geomean(cases.map((item) => item.medianRatio)),
        minRatio: 0.5,
        allCorrect: true,
        complete: true,
      },
    })

    const evaluation = evaluateIterBroadPerfReport(report)
    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain(
      'array/flatMap-map-filter/collect: ratio 0.500',
    )
  })

  test('pins the interleaved sampler and bounded micro-batch shape', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      sampling: {
        ...cases[0].sampling,
        id: 'forged-sampler' as typeof INTERLEAVED_PAIRED_SAMPLER_ID,
        order: 'forged-order' as typeof INTERLEAVED_PAIRED_SAMPLER_ORDER,
        microBatchIterations: 1,
      },
    }

    const failures = evaluateIterBroadPerfReport(makeReport(cases)).failures.join('\n')
    expect(failures).toContain('unexpected sampler identity')
    expect(failures).toContain('unexpected sampler order')
    expect(failures).toContain('sampler micro-batch')
  })

  test('rejects forged raw samples and recomputed summaries', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      currentSamplesNs: [0, ...cases[0].currentSamplesNs.slice(1)],
      frozenSamplesNs: cases[0].frozenSamplesNs.slice(1),
      pairedRatios: [99, ...cases[0].pairedRatios.slice(1)],
      medianRatio: 99,
      meanRatio: 99,
      relativeMarginOfError: 0,
    }

    const failures = evaluateIterBroadPerfReport(makeReport(cases)).failures.join('\n')
    expect(failures).toContain('raw sample count')
    expect(failures).toContain('finite and positive')
    expect(failures).toContain('paired ratios do not match')
    expect(failures).toContain('mean ratio does not match')
    expect(failures).toContain('RME')
  })
})
