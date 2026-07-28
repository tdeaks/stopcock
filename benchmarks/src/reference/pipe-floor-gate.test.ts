import { describe, expect, test } from 'vite-plus/test'
import {
  evaluatePipeFloorReport,
  PIPE_FLOOR_SIZES,
  type PipeFloorCase,
  type PipeFloorReport,
  type PipeFloorShapeId,
} from './pipe-floor-gate'
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

const SHAPE_IDS: readonly PipeFloorShapeId[] = [
  'map',
  'map->filter',
  'map->filter->reduce',
  'map->filter->map->filter',
  '8-op chain',
]

const geomean = (values: readonly number[]): number =>
  Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length)

const makeCases = (ratio = 1): PipeFloorCase[] =>
  SHAPE_IDS.flatMap((shape) =>
    PIPE_FLOOR_SIZES.map((n) => ({
      shape,
      n,
      correctnessOk: true,
      rounds: 40,
      medianRatio: ratio,
      ciLow: ratio * 0.95,
      ciHigh: ratio * 1.05,
      relativeMarginOfError: 3,
    })),
  )

const makeReport = (
  cases: readonly PipeFloorCase[],
  overrides: Partial<PipeFloorReport> = {},
  engineId: PerfEngineId = 'bun-jsc',
): PipeFloorReport => {
  const ratios = cases.map((item) => item.medianRatio)
  return {
    generatedAt: '2026-07-28T12:00:00.000Z',
    engine: ENGINES[engineId],
    comparison: {
      candidate: 'root pipe (uncompiled)',
      reference: 'ramda',
      ratio: 'ramdaNs / pipeNs; greater is pipe faster',
    },
    summary: {
      count: cases.length,
      expectedCount: SHAPE_IDS.length * PIPE_FLOOR_SIZES.length,
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

describe('pipe floor (invariant 4) release policy', () => {
  test('accepts a report where pipe matches ramda on every shape', () => {
    expect(evaluatePipeFloorReport(makeReport(makeCases(1)))).toEqual({
      passed: true,
      failures: [],
    })
  })

  test('accepts the known spread: pipe slower on "map" alone, faster on longer chains', () => {
    const cases = makeCases(1)
    for (const item of cases) {
      if (item.shape === 'map') {
        item.medianRatio = 0.7
        item.ciLow = 0.66
        item.ciHigh = 0.74
      }
      if (item.shape === '8-op chain') {
        item.medianRatio = 1.3
        item.ciLow = 1.2
        item.ciHigh = 1.4
      }
    }
    expect(evaluatePipeFloorReport(makeReport(cases)).passed).toBe(true)
  })

  test('fails closed on missing, incorrect, noisy, or undersampled rows', () => {
    const cases = makeCases()
    cases[0] = { ...cases[0], correctnessOk: false, rounds: 5, relativeMarginOfError: 20 }
    const base = makeReport(cases.slice(0, -1))
    const report = makeReport(cases.slice(0, -1), {
      summary: { ...base.summary, allCorrect: false, complete: false },
      skipped: ['8-op chain n=100000 failed'],
    })

    const evaluation = evaluatePipeFloorReport(report)
    const failures = evaluation.failures.join('\n')

    expect(evaluation.passed).toBe(false)
    expect(failures).toContain('expected 10')
    expect(failures).toContain('outputs differ')
    expect(failures).toContain('used 5 rounds')
    expect(failures).toContain('RME')
    expect(failures).toContain('skipped-case')
  })

  test('rejects a geomean regression below the 1.2x floor', () => {
    const evaluation = evaluatePipeFloorReport(makeReport(makeCases(1 / 1.2 - 0.05)))

    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain('pipe-floor geomean')
  })

  test('rejects a single-shape collapse even if the geomean still clears the floor', () => {
    const cases = makeCases(1)
    const target = cases.find((item) => item.shape === 'map' && item.n === 100_000)!
    target.medianRatio = 0.2
    target.ciLow = 0.18
    target.ciHigh = 0.22

    const evaluation = evaluatePipeFloorReport(makeReport(cases))

    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain('row floor')
  })
})
