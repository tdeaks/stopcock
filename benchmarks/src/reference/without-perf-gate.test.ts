import { describe, expect, test } from 'vite-plus/test'
import type { PerfEngine, PerfEngineId } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
} from './perf-runner'
import {
  evaluateHotPathPerfReport,
  HOT_PATH_CASE_IDS,
  HOT_PATH_WORKER_MARKER,
  parseHotPathWorkerOutput,
  validateHotPathImplementations,
  type HotPathPerfCase,
  type HotPathPerfReport,
} from './without-perf-gate'

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
    runtimeVersion: '24.18.0',
    v8: '13.6.233.17-node.50',
    platform: 'darwin',
    architecture: 'arm64',
  },
}

const makeCases = (ratio = 1.2): HotPathPerfCase[] =>
  HOT_PATH_CASE_IDS.map((id) => {
    const rounds = 80
    const consumedInputItems = 64
    const batchIterations = 1_024
    const targetConsumedItemsPerMicroBatch = 10_000
    const microBatchIterations = consumedItemsMicroBatchIterations(
      consumedInputItems,
      batchIterations,
      targetConsumedItemsPerMicroBatch,
    )
    return {
      id,
      consumedInputItems,
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
        nominalConsumedItemsPerMicroBatch: microBatchIterations * consumedInputItems,
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
  cases: readonly HotPathPerfCase[],
  engineId: PerfEngineId = 'bun-jsc',
  overrides: Partial<HotPathPerfReport> = {},
): HotPathPerfReport => {
  const engine = ENGINES[engineId]
  const engineCases = cases.map((item) => ({ ...item, workerEngine: engine }))
  const ratios = engineCases.map((item) => item.medianRatio)
  return {
    generatedAt: '2026-07-23T12:00:00.000Z',
    engine,
    comparison: {
      candidate: '@stopcock/fp current hot paths',
      reference: 'frozen pre-optimization equivalents',
      ratio: 'frozenNs / currentNs; greater is faster',
    },
    args: {
      rounds: 80,
      minimumBatchInputItems: 65_536,
      warmupRounds: engineId === 'bun-jsc' ? 20 : 30,
    },
    summary: {
      count: cases.length,
      expectedCount: HOT_PATH_CASE_IDS.length,
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

describe('Array.without performance policy', () => {
  test('accepts one matching worker envelope and rejects marker, case, and runtime substitution', () => {
    const result = makeCases()[0]
    const success = {
      ok: true as const,
      workerCaseIndex: 0,
      workerCaseId: result.id,
      workerConsumedInputItems: result.consumedInputItems,
      workerEngine: ENGINES['bun-jsc'],
      result,
    }
    const expected = {
      caseIndex: 0,
      caseId: result.id,
      consumedInputItems: result.consumedInputItems,
      engine: ENGINES['bun-jsc'],
    }
    const marker = `${HOT_PATH_WORKER_MARKER}${JSON.stringify(success)}\n`
    expect(parseHotPathWorkerOutput(marker, 0, null, expected)).toEqual(success)

    const rejected = [
      parseHotPathWorkerOutput('', 1, null, expected),
      parseHotPathWorkerOutput(`${marker}${marker}`, 0, null, expected),
      parseHotPathWorkerOutput(
        `${HOT_PATH_WORKER_MARKER}${JSON.stringify({
          ...success,
          workerCaseIndex: 1,
        })}\n`,
        0,
        null,
        expected,
      ),
      parseHotPathWorkerOutput(
        `${HOT_PATH_WORKER_MARKER}${JSON.stringify({
          ...success,
          workerCaseId: 'substitute',
        })}\n`,
        0,
        null,
        expected,
      ),
      parseHotPathWorkerOutput(
        `${HOT_PATH_WORKER_MARKER}${JSON.stringify({
          ...success,
          workerEngine: ENGINES['node-v8'],
        })}\n`,
        0,
        null,
        expected,
      ),
      parseHotPathWorkerOutput(marker, 1, null, expected),
    ]
    for (const outcome of rejected) expect(outcome.ok).toBe(false)
  })

  test('keeps every candidate semantically equal to its frozen reference', () => {
    expect(validateHotPathImplementations()).toEqual([])
  })

  test('accepts complete reports on both engines', () => {
    for (const engineId of ['bun-jsc', 'node-v8'] as const) {
      expect(evaluateHotPathPerfReport(makeReport(makeCases(), engineId))).toEqual({
        passed: true,
        failures: [],
      })
    }
  })

  test('accepts a wide interval only when its lower bound clears the floor', () => {
    // Both fixtures sit beyond the bun 1.4.0-requalified 26% cap, so only
    // the CI-lower escape hatch separates them.
    const cases = makeCases(1)
    cases[0] = {
      ...cases[0],
      ciLow: 0.86,
      ciHigh: 1.5,
      relativeMarginOfError: 32,
    }
    expect(evaluateHotPathPerfReport(makeReport(cases)).passed).toBe(true)

    cases[0] = {
      ...cases[0],
      ciLow: 0.8,
      ciHigh: 1.44,
      relativeMarginOfError: 32,
    }
    expect(
      evaluateHotPathPerfReport(makeReport(cases)).failures.join('\n'),
    ).toContain('invalid or excessive RME')
  })

  test('fails closed on missing, incorrect, or undersampled rows', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      correctnessOk: false,
      rounds: 4,
      batchIterations: 1,
    }
    const partial = cases.slice(0, -1)
    const evaluation = evaluateHotPathPerfReport(
      makeReport(partial, 'node-v8', {
        args: { rounds: 4, minimumBatchInputItems: 100, warmupRounds: 1 },
        summary: {
          count: partial.length,
          expectedCount: HOT_PATH_CASE_IDS.length,
          geomeanRatio: geomean(partial.map((item) => item.medianRatio)),
          minRatio: Math.min(...partial.map((item) => item.medianRatio)),
          allCorrect: false,
          complete: false,
        },
        skipped: ['without failed'],
      }),
    )
    const failures = evaluation.failures.join('\n')
    expect(failures).toContain('expected 27')
    expect(failures).toContain('skipped')
    expect(failures).toContain('incorrect output')
    expect(failures).toContain('insufficient consumed input')
  })

  test('pins sampler metadata and recomputes raw ratios', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      sampling: {
        ...cases[0].sampling,
        id: 'forged' as typeof INTERLEAVED_PAIRED_SAMPLER_ID,
        order: 'forged' as typeof INTERLEAVED_PAIRED_SAMPLER_ORDER,
        microBatchIterations: 1,
      },
      currentSamplesNs: [0, ...cases[0].currentSamplesNs.slice(1)],
      frozenSamplesNs: cases[0].frozenSamplesNs.slice(1),
      pairedRatios: [99, ...cases[0].pairedRatios.slice(1)],
      medianRatio: 99,
      meanRatio: 99,
    }
    const failures = evaluateHotPathPerfReport(makeReport(cases)).failures.join('\n')
    expect(failures).toContain('unexpected sampler identity')
    expect(failures).toContain('unexpected sampler order')
    expect(failures).toContain('sampler batch shape')
    expect(failures).toContain('raw sample count')
    expect(failures).toContain('invalid current samples')
    expect(failures).toContain('paired ratios do not match')
    expect(failures).toContain('mean does not match')
  })

  test('rejects a hidden slow row despite a fast aggregate', () => {
    const cases = makeCases(1.5)
    cases[20] = {
      ...cases[20],
      medianRatio: 0.5,
      meanRatio: 0.5,
      ciLow: 0.49,
      ciHigh: 0.51,
      currentSamplesNs: cases[20].currentSamplesNs.map(() => 200),
      frozenSamplesNs: cases[20].frozenSamplesNs.map(() => 100),
      pairedRatios: cases[20].pairedRatios.map(() => 0.5),
    }
    const report = makeReport(cases, 'bun-jsc', {
      summary: {
        count: cases.length,
        expectedCount: HOT_PATH_CASE_IDS.length,
        geomeanRatio: geomean(cases.map((item) => item.medianRatio)),
        minRatio: 0.5,
        allCorrect: true,
        complete: true,
      },
    })
    const failures = evaluateHotPathPerfReport(report).failures.join('\n')
    expect(failures).toContain('ratio 0.500 is below 0.850')
  })
})
