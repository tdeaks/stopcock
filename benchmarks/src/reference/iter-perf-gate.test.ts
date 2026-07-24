import { describe, expect, test } from 'vite-plus/test'
import { evaluateIterPerfReport, type IterPerfCase, type IterPerfReport } from './iter-perf-gate'
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

const makeCases = (ratio = 1): IterPerfCase[] =>
  [1_000, 10_000, 100_000].map((size) => {
    const consumedInputItems = 200
    const rounds = 60
    const batchIterations = 20_000
    const targetConsumedItemsPerMicroBatch = 10_000
    const microBatchIterations = consumedItemsMicroBatchIterations(
      consumedInputItems,
      batchIterations,
      targetConsumedItemsPerMicroBatch,
    )
    return {
      size,
      consumedInputItems,
      correctnessOk: true,
      outputLength: 100,
      rounds,
      batchIterations,
      sampling: {
        id: INTERLEAVED_PAIRED_SAMPLER_ID,
        order: INTERLEAVED_PAIRED_SAMPLER_ORDER,
        batchIterationsPerSide: batchIterations,
        microBatchIterations,
        microBatchesPerSide: Math.ceil(batchIterations / microBatchIterations),
        targetConsumedItemsPerMicroBatch,
        nominalConsumedItemsPerMicroBatch: microBatchIterations * consumedInputItems,
      },
      medianRatio: ratio,
      meanRatio: ratio,
      ciLow: ratio,
      ciHigh: ratio,
      signTestP: 1,
      relativeMarginOfError: 0,
      stopcockSamplesNs: Array.from({ length: rounds }, () => 100),
      nativeSamplesNs: Array.from({ length: rounds }, () => 100 * ratio),
      pairedRatios: Array.from({ length: rounds }, () => ratio),
    }
  })

const geomean = (values: readonly number[]): number =>
  Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length)

const makeReport = (
  cases: readonly IterPerfCase[],
  overrides: Partial<IterPerfReport> = {},
  engineId: PerfEngineId = 'bun-jsc',
): IterPerfReport => {
  const ratios = cases.map((item) => item.medianRatio)
  return {
    generatedAt: '2026-07-23T12:00:00.000Z',
    engine: ENGINES[engineId],
    comparison: {
      candidate: 'stopcock Iter.from map/filter/take/toArray',
      reference: 'native loop map/filter/take with early exit',
      ratio: 'nativeLoopNs / stopcockIterNs; greater is faster',
    },
    args: { rounds: 60, batchIterations: 20_000 },
    summary: {
      count: cases.length,
      expectedCount: 3,
      geomeanRatio: geomean(ratios),
      minRatio: Math.min(...ratios),
      allCorrect: true,
      complete: true,
    },
    cases,
    skipped: [],
    ...overrides,
  }
}

describe('Iter performance release policy', () => {
  test('accepts complete reports under both characterized engines', () => {
    for (const engineId of ['bun-jsc', 'node-v8'] as const) {
      expect(evaluateIterPerfReport(makeReport(makeCases(), {}, engineId))).toEqual({
        passed: true,
        failures: [],
      })
    }
  })

  test('fails closed on missing, incorrect, noisy, or undersampled rows', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      correctnessOk: false,
      rounds: 8,
      relativeMarginOfError: 10,
    }
    const base = makeReport(cases.slice(0, -1))
    const report = makeReport(cases.slice(0, -1), {
      args: { rounds: 8, batchIterations: 100 },
      summary: { ...base.summary, allCorrect: false, complete: false },
      skipped: ['n=100000 failed'],
    })

    const evaluation = evaluateIterPerfReport(report)
    const failures = evaluation.failures.join('\n')

    expect(evaluation.passed).toBe(false)
    expect(failures).toContain('expected 3')
    expect(failures).toContain('incorrect output')
    expect(failures).toContain('used 8 rounds')
    expect(failures).toContain('relative margin of error')
    expect(failures).toContain('skipped-case')
  })

  test('rejects a broad or size-specific Iter regression', () => {
    const cases = makeCases()
    cases[1] = { ...cases[1], medianRatio: 0.4, meanRatio: 0.4 }

    const evaluation = evaluateIterPerfReport(makeReport(cases))

    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain('n=10000: ratio 0.400')
  })

  test('applies the separately characterized Node/V8 floor', () => {
    const evaluation = evaluateIterPerfReport(makeReport(makeCases(0.59), {}, 'node-v8'))

    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain('Iter geomean 0.590 is below 0.600')
  })

  test('accepts a wide interval only when its raw lower bound clears the case floor', () => {
    const safelyNoisy = makeCases()
    const safeRatios = [
      ...Array.from({ length: 29 }, () => 0.6),
      0.65,
      0.65,
      ...Array.from({ length: 29 }, () => 0.7),
    ]
    safelyNoisy[0] = {
      ...safelyNoisy[0],
      medianRatio: 0.65,
      meanRatio: 0.65,
      ciLow: 0.6,
      ciHigh: 0.7,
      relativeMarginOfError: ((0.7 - 0.6) / (2 * 0.65)) * 100,
      stopcockSamplesNs: Array.from({ length: 60 }, () => 100),
      nativeSamplesNs: safeRatios.map((ratio) => ratio * 100),
      pairedRatios: safeRatios,
    }
    expect(evaluateIterPerfReport(makeReport(safelyNoisy, {}, 'node-v8')).passed).toBe(true)

    const unsafelyNoisy = makeCases()
    const unsafeRatios = [
      ...Array.from({ length: 29 }, () => 0.54),
      0.65,
      0.65,
      ...Array.from({ length: 29 }, () => 0.76),
    ]
    unsafelyNoisy[0] = {
      ...unsafelyNoisy[0],
      medianRatio: 0.65,
      meanRatio: 0.65,
      ciLow: 0.54,
      ciHigh: 0.76,
      relativeMarginOfError: ((0.76 - 0.54) / (2 * 0.65)) * 100,
      stopcockSamplesNs: Array.from({ length: 60 }, () => 100),
      nativeSamplesNs: unsafeRatios.map((ratio) => ratio * 100),
      pairedRatios: unsafeRatios,
    }
    expect(
      evaluateIterPerfReport(makeReport(unsafelyNoisy, {}, 'node-v8')).failures.join('\n'),
    ).toContain('relative margin of error')
  })

  test('pins sampler identity, order, and micro-batch shape', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      sampling: {
        ...cases[0].sampling,
        id: 'forged' as typeof INTERLEAVED_PAIRED_SAMPLER_ID,
        order: 'forged' as typeof INTERLEAVED_PAIRED_SAMPLER_ORDER,
        microBatchIterations: 1,
      },
    }

    const failures = evaluateIterPerfReport(makeReport(cases)).failures.join('\n')
    expect(failures).toContain('unexpected sampler identity')
    expect(failures).toContain('unexpected sampler order')
    expect(failures).toContain('unexpected sampler micro-batch')
  })

  test('rejects forged raw samples and aggregate ratios', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      stopcockSamplesNs: [0, ...cases[0].stopcockSamplesNs.slice(1)],
      nativeSamplesNs: cases[0].nativeSamplesNs.slice(1),
      pairedRatios: [99, ...cases[0].pairedRatios.slice(1)],
      medianRatio: 99,
      meanRatio: 99,
      relativeMarginOfError: 0,
    }

    const failures = evaluateIterPerfReport(makeReport(cases)).failures.join('\n')
    expect(failures).toContain('raw sample count')
    expect(failures).toContain('finite and positive')
    expect(failures).toContain('paired ratios do not match')
    expect(failures).toContain('invalid mean ratio')
    expect(failures).toContain('invalid confidence interval')
  })
})
