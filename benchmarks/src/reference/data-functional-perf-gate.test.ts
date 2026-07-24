import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vite-plus/test'
import {
  evaluateDataFunctionalPerfReport,
  type DataFunctionalPerfEvaluation,
} from './data-functional-perf-gate'
import {
  DATA_FUNCTIONAL_PERF_POLICIES,
  EXPECTED_DATA_FUNCTIONAL_BASELINE,
  EXPECTED_DATA_FUNCTIONAL_CASES,
  EXPECTED_DATA_FUNCTIONAL_COVERAGE,
  EXPECTED_DATA_FUNCTIONAL_SUBJECT_FILES,
  EXPECTED_DATA_FUNCTIONAL_SUBJECT_ID,
  EXPECTED_DATA_FUNCTIONAL_SUBJECT_SHA256,
  minimumDataFunctionalBatchIterations,
} from './data-functional-perf-contract'
import type {
  DataFunctionalPerfCase,
  DataFunctionalPerfReport,
} from './data-functional-perf'
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
    runtimeVersion: '24.18.0',
    v8: '13.6.233.17-node.50',
    platform: 'darwin',
    architecture: 'arm64',
  },
}

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex')

const jsonSha256 = (value: unknown): string => sha256(JSON.stringify(value))

const makeCase = (
  expected: (typeof EXPECTED_DATA_FUNCTIONAL_CASES)[number],
  engineId: PerfEngineId,
): DataFunctionalPerfCase => {
  const policy = DATA_FUNCTIONAL_PERF_POLICIES[engineId]
  const batchIterations = minimumDataFunctionalBatchIterations(
    expected.workUnits,
    policy,
  )
  const microBatchIterations = consumedItemsMicroBatchIterations(
    expected.workUnits,
    batchIterations,
    policy.targetWorkUnitsPerMicroBatch,
  )
  const samples = Array.from({ length: policy.minimumRounds }, () => 100)
  const ratios = Array.from({ length: policy.minimumRounds }, () => 1)
  return {
    name: expected.name,
    workUnits: expected.workUnits,
    correctnessOk: true,
    workerEngine: ENGINES[engineId],
    rounds: policy.minimumRounds,
    batchIterations,
    sampling: {
      id: INTERLEAVED_PAIRED_SAMPLER_ID,
      order: INTERLEAVED_PAIRED_SAMPLER_ORDER,
      batchIterationsPerSide: batchIterations,
      microBatchIterations,
      microBatchesPerSide: Math.ceil(batchIterations / microBatchIterations),
      targetWorkUnitsPerMicroBatch: policy.targetWorkUnitsPerMicroBatch,
      nominalWorkUnitsPerMicroBatch:
        microBatchIterations * expected.workUnits,
    },
    medianRatio: 1,
    meanRatio: 1,
    ciLow: 1,
    ciHigh: 1,
    signTestP: 1,
    relativeMarginOfError: 0,
    currentSamplesNs: samples,
    baselineSamplesNs: samples.slice(),
    pairedRatios: ratios,
  }
}

const makeCases = (
  engineId: PerfEngineId = 'bun-jsc',
): DataFunctionalPerfCase[] =>
  EXPECTED_DATA_FUNCTIONAL_CASES.map((item) => makeCase(item, engineId))

const geomean = (values: readonly number[]): number =>
  Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) / values.length,
  )

const makeReport = (
  cases: readonly DataFunctionalPerfCase[],
  engineId: PerfEngineId = 'bun-jsc',
  overrides: Partial<DataFunctionalPerfReport> = {},
): DataFunctionalPerfReport => {
  const policy = DATA_FUNCTIONAL_PERF_POLICIES[engineId]
  const ratios = cases.map((item) => item.medianRatio)
  return {
    version: 1,
    generatedAt: '2026-07-23T12:00:00.000Z',
    engine: ENGINES[engineId],
    subject: {
      id: EXPECTED_DATA_FUNCTIONAL_SUBJECT_ID,
      files: EXPECTED_DATA_FUNCTIONAL_SUBJECT_FILES,
      sha256: EXPECTED_DATA_FUNCTIONAL_SUBJECT_SHA256,
    },
    baseline: EXPECTED_DATA_FUNCTIONAL_BASELINE,
    coverage: EXPECTED_DATA_FUNCTIONAL_COVERAGE,
    args: {
      rounds: policy.minimumRounds,
      warmupRounds: policy.minimumWarmupRounds,
      minimumBatchWorkUnits: policy.minimumBatchWorkUnits,
      targetWorkUnitsPerMicroBatch: policy.targetWorkUnitsPerMicroBatch,
      quick: false,
    },
    summary: {
      count: cases.length,
      expectedCount: EXPECTED_DATA_FUNCTIONAL_COVERAGE.caseCount,
      geomeanRatio: geomean(ratios),
      minRatio: Math.min(...ratios),
      maxRelativeMarginOfError: Math.max(
        ...cases.map((item) => item.relativeMarginOfError),
      ),
      allCorrect: true,
      complete: true,
    },
    cases,
    skipped: [],
    ...overrides,
  }
}

const failures = (evaluation: DataFunctionalPerfEvaluation): string =>
  evaluation.failures.join('\n')

describe('data-functional performance gate', () => {
  test('pins baseline bytes and the exact ordered case projection', async () => {
    const baseline = await readFile(
      new URL('./data-functional-before.ts', import.meta.url),
    )
    const names = EXPECTED_DATA_FUNCTIONAL_CASES.map((item) => item.name)
    const projection = EXPECTED_DATA_FUNCTIONAL_CASES.map(
      ({ name, workUnits }) => ({ name, workUnits }),
    )

    expect(sha256(baseline)).toBe(EXPECTED_DATA_FUNCTIONAL_BASELINE.sha256)
    expect(names).toHaveLength(EXPECTED_DATA_FUNCTIONAL_COVERAGE.caseCount)
    expect(jsonSha256(names)).toBe(
      EXPECTED_DATA_FUNCTIONAL_COVERAGE.caseNamesSha256,
    )
    expect(jsonSha256(projection)).toBe(
      EXPECTED_DATA_FUNCTIONAL_COVERAGE.projectionSha256,
    )
  })

  test('accepts complete auditable reports for both engines', () => {
    for (const engineId of ['bun-jsc', 'node-v8'] as const) {
      const evaluation = evaluateDataFunctionalPerfReport(
        makeReport(makeCases(engineId), engineId),
      )
      expect(evaluation.passed).toBe(true)
      expect(evaluation.failures).toEqual([])
      expect(evaluation.measurements).toHaveLength(2)
    }
  })

  test('fails closed on quick, filtered, incomplete, skipped, and incorrect reports', () => {
    const cases = makeCases()
    cases[0] = { ...cases[0], correctnessOk: false }
    const base = makeReport(cases)
    const report = makeReport(cases.slice(0, -1), 'bun-jsc', {
      args: {
        ...base.args,
        rounds: 8,
        quick: true,
        casesFilter: 'indexed',
      },
      summary: {
        ...base.summary,
        count: cases.length - 1,
        complete: false,
        allCorrect: false,
      },
      skipped: ['missing row'],
    })

    const output = failures(evaluateDataFunctionalPerfReport(report))
    expect(output).toContain('cannot use --quick')
    expect(output).toContain('cannot filter')
    expect(output).toContain('incomplete')
    expect(output).toContain('skipped')
    expect(output).toContain('incorrect')
    expect(output).toContain('expected 11')
  })

  test('rejects provenance, ordering, worker, sampler, and raw-sample substitution', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      workerEngine: ENGINES['node-v8'],
      sampling: {
        ...cases[0].sampling,
        id: 'forged' as typeof INTERLEAVED_PAIRED_SAMPLER_ID,
      },
      currentSamplesNs: [0, ...cases[0].currentSamplesNs.slice(1)],
      pairedRatios: [2, ...cases[0].pairedRatios.slice(1)],
    }
    const base = makeReport(cases)
    const report = {
      ...base,
      subject: {
        ...base.subject,
        id: 'changed',
        files: base.subject.files.slice(1),
        sha256: '0'.repeat(64),
      },
      baseline: { ...base.baseline, sha256: '0'.repeat(64) },
      coverage: { ...base.coverage, projectionSha256: 'f'.repeat(64) },
      cases: [cases[1], cases[0], ...cases.slice(2)],
    }

    const output = failures(evaluateDataFunctionalPerfReport(report))
    expect(output).toContain('unexpected data-functional subject')
    expect(output).toContain('provenance files')
    expect(output).toContain('subject provenance SHA-256')
    expect(output).toContain('baseline SHA-256')
    expect(output).toContain('order/population')
    expect(output).toContain('projection SHA-256')
    expect(output).toContain('worker runtime identity')
    expect(output).toContain('sampler')
    expect(output).toContain('raw samples')
    expect(output).toContain('raw paired ratios')
  })

  test('enforces policy arguments, noise ceiling, summary integrity, and floors', () => {
    const cases = makeCases('node-v8')
    const pairedRatios = Array.from({ length: cases[0].rounds }, (_, index) =>
      index < cases[0].rounds / 2 ? 0.6 : 0.78,
    )
    cases[0] = {
      ...cases[0],
      currentSamplesNs: pairedRatios.map(() => 100),
      baselineSamplesNs: pairedRatios.map((ratio) => ratio * 100),
      pairedRatios,
      medianRatio: 0.69,
      meanRatio: 0.69,
      ciLow: 0.6,
      ciHigh: 0.78,
      relativeMarginOfError: ((0.78 - 0.6) / (2 * 0.69)) * 100,
    }
    const base = makeReport(cases, 'node-v8')
    const report = makeReport(cases, 'node-v8', {
      args: {
        ...base.args,
        rounds: 59,
        warmupRounds: 99,
        minimumBatchWorkUnits: 99_999,
        targetWorkUnitsPerMicroBatch: 9_999,
      },
      summary: {
        ...base.summary,
        geomeanRatio: 99,
        minRatio: 99,
        maxRelativeMarginOfError: 99,
      },
    })

    const evaluation = evaluateDataFunctionalPerfReport(report)
    const output = failures(evaluation)
    expect(output).toContain('round count')
    expect(output).toContain('warmup count')
    expect(output).toContain('batch-work target')
    expect(output).toContain('micro-batch target')
    expect(output).toContain('exceeds 5%')
    expect(output).toContain('summary statistics')
    expect(output).toContain('worst case')
    expect(evaluation.measurements[1].passed).toBe(false)
  })

  test('accepts noisy samples only when their raw confidence interval clears the case floor', () => {
    const cases = makeCases('node-v8')
    const pairedRatios = Array.from({ length: cases[0].rounds }, (_, index) =>
      index < cases[0].rounds / 2 ? 0.9 : 1.1,
    )
    cases[0] = {
      ...cases[0],
      currentSamplesNs: pairedRatios.map(() => 100),
      baselineSamplesNs: pairedRatios.map((ratio) => ratio * 100),
      pairedRatios,
      ciLow: 0.9,
      ciHigh: 1.1,
      relativeMarginOfError: 10,
    }

    const evaluation = evaluateDataFunctionalPerfReport(
      makeReport(cases, 'node-v8'),
    )
    expect(evaluation.passed).toBe(true)
    expect(evaluation.failures).toEqual([])
  })

  test('rejects malformed report shapes without throwing', () => {
    const evaluation = evaluateDataFunctionalPerfReport(
      null as unknown as DataFunctionalPerfReport,
    )
    expect(evaluation.passed).toBe(false)
    expect(failures(evaluation)).toContain('malformed')
  })
})
