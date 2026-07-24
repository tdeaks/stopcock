import { describe, expect, test } from 'vite-plus/test'
import {
  evaluateCallbackChurnReport,
  type CallbackChurnCase,
  type CallbackChurnReport,
} from './portable-callback-churn-gate'
import {
  CALLBACK_LANE_SATURATION_SCENARIO,
  CHARACTERIZED_CALLBACK_LANE_COUNT,
} from './portable-v8-callback-churn'
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

const makeCases = (ratio = 8): CallbackChurnCase[] => [
  {
    name: 'identity/mod/sub',
    size: 100,
    correctnessOk: true,
    bindingSetCount: 1,
    alternationOrder: [0],
    rounds: 60,
    batchIterations: 1_000,
    medianRatio: ratio,
    meanRatio: ratio,
    ciLow: ratio * 0.98,
    ciHigh: ratio * 1.02,
    signTestP: 1,
    relativeMarginOfError: 2,
  },
  {
    name: 'linear/mod/add',
    size: 10_000,
    correctnessOk: true,
    bindingSetCount: 1,
    alternationOrder: [0],
    rounds: 60,
    batchIterations: 10,
    medianRatio: ratio,
    meanRatio: ratio,
    ciLow: ratio * 0.98,
    ciHigh: ratio * 1.02,
    signTestP: 1,
    relativeMarginOfError: 2,
  },
  {
    name: 'allocLinear/allocMod/add',
    size: 100_000,
    correctnessOk: true,
    bindingSetCount: 1,
    alternationOrder: [0],
    rounds: 60,
    batchIterations: 1,
    medianRatio: ratio,
    meanRatio: ratio,
    ciLow: ratio * 0.98,
    ciHigh: ratio * 1.02,
    signTestP: 1,
    relativeMarginOfError: 2,
  },
  {
    name: 'lane-saturation/alternating-8',
    size: 1_000,
    correctnessOk: true,
    bindingSetCount: 8,
    alternationOrder: [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7],
    rounds: 60,
    batchIterations: 7,
    medianRatio: ratio,
    meanRatio: ratio,
    ciLow: ratio * 0.98,
    ciHigh: ratio * 1.02,
    signTestP: 1,
    relativeMarginOfError: 2,
  },
]

const geomean = (values: readonly number[]): number =>
  Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length)

const makeReport = (
  cases: readonly CallbackChurnCase[],
  engineId: PerfEngineId = 'bun-jsc',
  overrides: Partial<CallbackChurnReport> = {},
): CallbackChurnReport => {
  const ratios = cases.map((item) => item.medianRatio)
  return {
    generatedAt: '2026-07-23T12:00:00.000Z',
    runtime:
      engineId === 'bun-jsc'
        ? { runtime: 'bun', version: '1.3.14' }
        : { runtime: 'node', node: 'v22.19.0', v8: '12.4.254.21-node.29' },
    args: { rounds: 60 },
    summary: {
      count: cases.length,
      allCorrect: true,
      geomeanRatio: geomean(ratios),
      minRatio: Math.min(...ratios),
    },
    cases,
    ...overrides,
  }
}

describe('portable callback-churn release policy', () => {
  test('pins a bounded saturation schedule above the four-lane bank', () => {
    const scenario = CALLBACK_LANE_SATURATION_SCENARIO
    const firstCycle = scenario.alternationOrder.slice(0, scenario.bindingSetCount)
    const secondCycle = scenario.alternationOrder.slice(scenario.bindingSetCount)

    expect(scenario.bindingSetCount).toBeGreaterThan(CHARACTERIZED_CALLBACK_LANE_COUNT)
    expect(scenario.stepsByBinding).toHaveLength(scenario.bindingSetCount)
    expect(new Set(firstCycle).size).toBe(scenario.bindingSetCount)
    expect(secondCycle).toEqual(firstCycle)
    expect(firstCycle).toEqual(
      Array.from({ length: scenario.bindingSetCount }, (_, index) => index),
    )
  })

  test('accepts complete reports under both characterized engines', () => {
    for (const engineId of ['bun-jsc', 'node-v8'] as const) {
      expect(
        evaluateCallbackChurnReport(makeReport(makeCases(), engineId), ENGINES[engineId]),
      ).toEqual({ passed: true, failures: [] })
    }
  })

  test('fails closed on missing, incorrect, noisy, or undersampled rows', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      correctnessOk: false,
      rounds: 8,
      batchIterations: 1,
      relativeMarginOfError: 10,
    }
    const report = makeReport(cases.slice(0, -1), 'bun-jsc', {
      args: { rounds: 8 },
      summary: {
        count: 3,
        allCorrect: false,
        geomeanRatio: 99,
        minRatio: 99,
      },
    })

    const evaluation = evaluateCallbackChurnReport(report, ENGINES['bun-jsc'])
    const failures = evaluation.failures.join('\n')

    expect(evaluation.passed).toBe(false)
    expect(failures).toContain('expected 4')
    expect(failures).toContain('outputs differ')
    expect(failures).toContain('used 8 rounds')
    expect(failures).toContain('used batch size 1')
    expect(failures).toContain('relative margin of error')
    expect(failures).toContain('does not match the case rows')
  })

  test('rejects the shape-specific V8 callback-identity regression', () => {
    const cases = makeCases()
    cases[1] = { ...cases[1], medianRatio: 0.81, meanRatio: 0.81 }

    const evaluation = evaluateCallbackChurnReport(makeReport(cases, 'node-v8'), ENGINES['node-v8'])

    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain('linear/mod/add: ratio 0.810')
  })

  test('accepts wide intervals only when the full interval clears the case floor', () => {
    const safelyNoisy = makeCases()
    safelyNoisy[2] = {
      ...safelyNoisy[2],
      ciLow: 6,
      ciHigh: 10,
      relativeMarginOfError: 25,
    }
    expect(
      evaluateCallbackChurnReport(makeReport(safelyNoisy), ENGINES['bun-jsc']).passed,
    ).toBe(true)

    const unsafelyNoisy = makeCases()
    unsafelyNoisy[2] = {
      ...unsafelyNoisy[2],
      ciLow: 3.9,
      ciHigh: 12.1,
      relativeMarginOfError: 51.25,
    }
    const failures = evaluateCallbackChurnReport(
      makeReport(unsafelyNoisy),
      ENGINES['bun-jsc'],
    ).failures.join('\n')
    expect(failures).toContain('relative margin of error')
  })

  test('rejects saturation reports that do not exceed and alternate the lane bank', () => {
    const cases = makeCases()
    cases[3] = {
      ...cases[3],
      bindingSetCount: CHARACTERIZED_CALLBACK_LANE_COUNT,
      alternationOrder: [0, 1, 2, 3],
    }

    const evaluation = evaluateCallbackChurnReport(makeReport(cases), ENGINES['bun-jsc'])
    const failures = evaluation.failures.join('\n')

    expect(evaluation.passed).toBe(false)
    expect(failures).toContain('used 4 binding sets; expected 8')
    expect(failures).toContain('alternation order does not match the pinned scenario')
  })
})
