import { describe, expect, test } from 'vite-plus/test'
import {
  evaluatePipeDispatchReport,
  type PipeDispatchCase,
  type PipeDispatchReport,
} from './pipe-dispatch-gate'
import type { PerfEngine, PerfEngineId } from './perf-engine'

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

const CASE_IDS = ['stable-2-step', 'stable-6-step', 'fresh-2-step', 'fresh-3-step'] as const

const makeCases = (ratio = 2, batchIterations = 2_000): PipeDispatchCase[] =>
  CASE_IDS.map((id) => ({
    id,
    correctnessOk: true,
    rounds: 60,
    batchIterations,
    medianRatio: ratio,
    meanRatio: ratio,
    ciLow: ratio * 0.98,
    ciHigh: ratio * 1.02,
    signTestP: 1,
    relativeMarginOfError: 2,
  }))

const geomean = (values: readonly number[]): number =>
  Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length)

const makeReport = (
  cases: readonly PipeDispatchCase[],
  overrides: Partial<PipeDispatchReport> = {},
  engineId: PerfEngineId = 'bun-jsc',
): PipeDispatchReport => {
  const ratios = cases.map((item) => item.medianRatio)
  const batchIterations = cases[0]?.batchIterations ?? 2_000
  return {
    generatedAt: '2026-07-23T12:00:00.000Z',
    engine: ENGINES[engineId],
    comparison: {
      candidate: 'current pipe',
      reference: 'pre-hot-identity-front-cache-v1',
      ratio: 'retainedBaselineNs / currentPipeNs; greater is faster',
    },
    args: { rounds: 60, batchIterations },
    summary: {
      count: cases.length,
      expectedCount: 4,
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

describe('pipe-dispatch performance release policy', () => {
  test('accepts complete reports under both engines', () => {
    for (const engineId of ['bun-jsc', 'node-v8'] as const) {
      const batchIterations = engineId === 'node-v8' ? 8_000 : 2_000
      expect(
        evaluatePipeDispatchReport(makeReport(makeCases(2, batchIterations), {}, engineId)),
      ).toEqual({
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
      relativeMarginOfError: 30,
    }
    const base = makeReport(cases.slice(0, -1))
    const report = makeReport(cases.slice(0, -1), {
      args: { rounds: 8, batchIterations: 100 },
      summary: { ...base.summary, allCorrect: false, complete: false },
      skipped: ['fresh-3-step failed'],
    })

    const evaluation = evaluatePipeDispatchReport(report)
    const failures = evaluation.failures.join('\n')

    expect(evaluation.passed).toBe(false)
    expect(failures).toContain('expected 4')
    expect(failures).toContain('outputs differ')
    expect(failures).toContain('used 8 rounds')
    expect(failures).toContain('relative margin of error')
    expect(failures).toContain('skipped-case')
  })

  test('rejects a shape-specific dispatch regression', () => {
    const cases = makeCases()
    cases[2] = { ...cases[2], medianRatio: 0.1, meanRatio: 0.1 }

    const evaluation = evaluatePipeDispatchReport(makeReport(cases))

    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain('fresh-2-step: ratio 0.1000')
  })
})
