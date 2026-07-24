import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vite-plus/test'
import {
  evaluateCoreUtilitiesPerfReport,
  type CoreUtilitiesPerfEvaluation,
} from './core-utilities-perf-gate'
import {
  CORE_UTILITIES_PERF_POLICIES,
  EXPECTED_CORE_UTILITIES_BASELINE,
  EXPECTED_CORE_UTILITIES_CASES,
  EXPECTED_CORE_UTILITIES_COVERAGE,
  EXPECTED_CORE_UTILITIES_SUBJECT_FILES,
  EXPECTED_CORE_UTILITIES_SUBJECT_ID,
  EXPECTED_CORE_UTILITIES_SUBJECT_SHA256,
  minimumCoreUtilitiesBatchIterations,
} from './core-utilities-perf-contract'
import type { CoreUtilitiesPerfCase, CoreUtilitiesPerfReport } from './core-utilities-perf'
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

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex')

const jsonSha256 = (value: unknown): string => sha256(JSON.stringify(value))

const makeCase = (
  expected: (typeof EXPECTED_CORE_UTILITIES_CASES)[number],
  engineId: PerfEngineId,
  ratio = 1,
): CoreUtilitiesPerfCase => {
  const policy = CORE_UTILITIES_PERF_POLICIES[engineId]
  const batchIterations = minimumCoreUtilitiesBatchIterations(expected.workUnits, policy)
  const microBatchIterations = consumedItemsMicroBatchIterations(
    expected.workUnits,
    batchIterations,
    policy.targetWorkUnitsPerMicroBatch,
  )
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
      nominalWorkUnitsPerMicroBatch: microBatchIterations * expected.workUnits,
    },
    medianRatio: ratio,
    meanRatio: ratio,
    ciLow: ratio,
    ciHigh: ratio,
    signTestP: ratio === 1 ? 1 : 0,
    relativeMarginOfError: 0,
    currentSamplesNs: Array.from({ length: policy.minimumRounds }, () => 100),
    baselineSamplesNs: Array.from({ length: policy.minimumRounds }, () => ratio * 100),
    pairedRatios: Array.from({ length: policy.minimumRounds }, () => ratio),
  }
}

const makeCases = (engineId: PerfEngineId = 'bun-jsc'): CoreUtilitiesPerfCase[] =>
  EXPECTED_CORE_UTILITIES_CASES.map((item) => makeCase(item, engineId))

const geomean = (values: readonly number[]): number =>
  Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length)

const makeReport = (
  cases: readonly CoreUtilitiesPerfCase[],
  engineId: PerfEngineId = 'bun-jsc',
  overrides: Partial<CoreUtilitiesPerfReport> = {},
): CoreUtilitiesPerfReport => {
  const policy = CORE_UTILITIES_PERF_POLICIES[engineId]
  const ratios = cases.map((item) => item.medianRatio)
  return {
    version: 1,
    generatedAt: '2026-07-23T12:00:00.000Z',
    engine: ENGINES[engineId],
    subject: {
      id: EXPECTED_CORE_UTILITIES_SUBJECT_ID,
      files: EXPECTED_CORE_UTILITIES_SUBJECT_FILES,
      sha256: EXPECTED_CORE_UTILITIES_SUBJECT_SHA256,
    },
    baseline: EXPECTED_CORE_UTILITIES_BASELINE,
    coverage: EXPECTED_CORE_UTILITIES_COVERAGE,
    args: {
      rounds: policy.minimumRounds,
      warmupRounds: policy.minimumWarmupRounds,
      minimumBatchWorkUnits: policy.minimumBatchWorkUnits,
      targetWorkUnitsPerMicroBatch: policy.targetWorkUnitsPerMicroBatch,
      quick: false,
    },
    summary: {
      count: cases.length,
      expectedCount: EXPECTED_CORE_UTILITIES_COVERAGE.caseCount,
      geomeanRatio: geomean(ratios),
      minRatio: Math.min(...ratios),
      maxRelativeMarginOfError: Math.max(...cases.map((item) => item.relativeMarginOfError)),
      allCorrect: true,
      complete: true,
    },
    cases,
    skipped: [],
    ...overrides,
  }
}

const failures = (evaluation: CoreUtilitiesPerfEvaluation): string => evaluation.failures.join('\n')

describe('core-utilities performance gate', () => {
  test('pins the baseline bytes and exact ordered row projection', async () => {
    const baselineBytes = await readFile(new URL('./core-utilities-before.ts', import.meta.url))
    const names = EXPECTED_CORE_UTILITIES_CASES.map((item) => item.name)
    const projection = EXPECTED_CORE_UTILITIES_CASES.map(({ name, workUnits }) => ({
      name,
      workUnits,
    }))

    expect(sha256(baselineBytes)).toBe(EXPECTED_CORE_UTILITIES_BASELINE.sha256)
    expect(names).toHaveLength(EXPECTED_CORE_UTILITIES_COVERAGE.caseCount)
    expect(jsonSha256(names)).toBe(EXPECTED_CORE_UTILITIES_COVERAGE.caseNamesSha256)
    expect(jsonSha256(projection)).toBe(EXPECTED_CORE_UTILITIES_COVERAGE.projectionSha256)
  })

  test('accepts complete auditable reports for both engines', () => {
    for (const engineId of ['bun-jsc', 'node-v8'] as const) {
      const evaluation = evaluateCoreUtilitiesPerfReport(makeReport(makeCases(engineId), engineId))
      expect(evaluation.passed).toBe(true)
      expect(evaluation.failures).toEqual([])
      expect(evaluation.measurements).toHaveLength(2)
    }
  })

  test('keeps the cross-engine missing-map tradeoff and V8 curry noise exceptions narrow', () => {
    expect(CORE_UTILITIES_PERF_POLICIES['bun-jsc'].caseOverrides).toEqual({
      'map/get-missing': { minimumCaseRatio: 0.62 },
    })
    expect(CORE_UTILITIES_PERF_POLICIES['node-v8'].caseOverrides).toEqual({
      'map/get-missing': { minimumCaseRatio: 0.62 },
      'curry/arity-2': { maximumRme: 10 },
      'curry/arity-4': { maximumRme: 10 },
    })

    const missingIndex = EXPECTED_CORE_UTILITIES_CASES.findIndex(
      (item) => item.name === 'map/get-missing',
    )
    const missingCase = EXPECTED_CORE_UTILITIES_CASES[missingIndex]
    if (!missingCase) throw new Error('missing map/get-missing contract row')
    for (const engineId of ['bun-jsc', 'node-v8'] as const) {
      const passing = makeCases(engineId)
      passing[missingIndex] = makeCase(missingCase, engineId, 0.63)
      expect(
        evaluateCoreUtilitiesPerfReport(makeReport(passing, engineId)).passed,
      ).toBe(true)

      const failing = passing.slice()
      failing[missingIndex] = makeCase(missingCase, engineId, 0.61)
      expect(
        failures(
          evaluateCoreUtilitiesPerfReport(makeReport(failing, engineId)),
        ),
      ).toContain('map/get-missing: median ratio')
    }
  })

  test('fails closed on quick, filtered, incomplete, skipped, and incorrect reports', () => {
    const cases = makeCases()
    cases[0] = { ...cases[0], correctnessOk: false }
    const base = makeReport(cases)
    const report = makeReport(cases.slice(0, -1), 'bun-jsc', {
      args: { ...base.args, rounds: 8, quick: true, casesFilter: 'compose' },
      summary: {
        ...base.summary,
        count: cases.length - 1,
        complete: false,
        allCorrect: false,
      },
      skipped: ['missing row'],
    })

    const output = failures(evaluateCoreUtilitiesPerfReport(report))
    expect(output).toContain('cannot use --quick')
    expect(output).toContain('cannot filter')
    expect(output).toContain('incomplete')
    expect(output).toContain('skipped')
    expect(output).toContain('incorrect')
    expect(output).toContain('expected 18')
  })

  test('rejects baseline, subject, coverage, and worker-runtime substitution', () => {
    const cases = makeCases()
    cases[0] = { ...cases[0], workerEngine: ENGINES['node-v8'] }
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

    const output = failures(evaluateCoreUtilitiesPerfReport(report))
    expect(output).toContain('unexpected core-utilities subject')
    expect(output).toContain('provenance files')
    expect(output).toContain('subject provenance SHA-256')
    expect(output).toContain('baseline SHA-256')
    expect(output).toContain('order/population')
    expect(output).toContain('projection SHA-256')
    expect(output).toContain('worker runtime identity')
  })

  test('pins batching and the allocation-free interleaved sampler', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      batchIterations: 1,
      sampling: {
        ...cases[0].sampling,
        id: 'forged' as typeof INTERLEAVED_PAIRED_SAMPLER_ID,
        order: 'forged' as typeof INTERLEAVED_PAIRED_SAMPLER_ORDER,
        microBatchIterations: 2,
      },
    }

    const output = failures(evaluateCoreUtilitiesPerfReport(makeReport(cases)))
    expect(output).toContain('used batch size')
    expect(output).toContain('unexpected sampler identity')
    expect(output).toContain('unexpected sampler order')
    expect(output).toContain('micro-batch iterations')
  })

  test('recomputes raw ratios, summary statistics, confidence interval, sign test, and RME', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      currentSamplesNs: [0, ...cases[0].currentSamplesNs.slice(1)],
      baselineSamplesNs: cases[0].baselineSamplesNs.slice(1),
      pairedRatios: [2, ...cases[0].pairedRatios.slice(1)],
      medianRatio: 2,
      meanRatio: 2,
      ciLow: 0.5,
      ciHigh: 2.5,
      signTestP: 0,
      relativeMarginOfError: 1,
    }

    const output = failures(evaluateCoreUtilitiesPerfReport(makeReport(cases)))
    expect(output).toContain('raw sample count')
    expect(output).toContain('finite and positive')
    expect(output).toContain('raw paired ratios')
    expect(output).toContain('reported median')
    expect(output).toContain('reported mean')
    expect(output).toContain('confidence interval')
    expect(output).toContain('sign-test')
    expect(output).toContain('relative margin of error')
  })

  test('enforces policy arguments, noise ceiling, geomean, and worst-case floors', () => {
    const cases = makeCases('node-v8')
    cases[0] = makeCase(EXPECTED_CORE_UTILITIES_CASES[0], 'node-v8', 0.69)
    const base = makeReport(cases, 'node-v8')
    cases[1] = {
      ...cases[1],
      ciLow: 0.94,
      ciHigh: 1.06,
      relativeMarginOfError: 6,
    }
    const report = makeReport(cases, 'node-v8', {
      args: {
        ...base.args,
        rounds: 59,
        warmupRounds: 99,
        minimumBatchWorkUnits: 99_999,
        targetWorkUnitsPerMicroBatch: 9_999,
      },
    })

    const evaluation = evaluateCoreUtilitiesPerfReport(report)
    const output = failures(evaluation)
    expect(output).toContain('minimum is 60')
    expect(output).toContain('warmup rounds')
    expect(output).toContain('batch-work target')
    expect(output).toContain('micro-batch target')
    expect(output).toContain('exceeds 5%')
    expect(output).toContain('worst case')
    expect(evaluation.measurements[0].passed).toBe(true)
    expect(evaluation.measurements[1].passed).toBe(false)
  })

  test('rejects forged summaries and malformed report shapes without throwing', () => {
    const base = makeReport(makeCases())
    const forged = {
      ...base,
      summary: {
        ...base.summary,
        count: 1,
        geomeanRatio: 99,
        minRatio: 99,
        maxRelativeMarginOfError: 99,
      },
    }
    expect(failures(evaluateCoreUtilitiesPerfReport(forged))).toContain(
      'does not match measured rows',
    )
    const malformed = evaluateCoreUtilitiesPerfReport(null as unknown as CoreUtilitiesPerfReport)
    expect(malformed.passed).toBe(false)
    expect(failures(malformed)).toContain('malformed')
  })
})
