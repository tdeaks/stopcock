import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vite-plus/test'
import type { PerfEngine, PerfEngineId } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
} from './perf-runner'
import {
  EXPECTED_STRUCTURAL_BASELINE,
  EXPECTED_STRUCTURAL_CASES,
  EXPECTED_STRUCTURAL_COVERAGE,
  EXPECTED_STRUCTURAL_SUBJECT_FILES,
  EXPECTED_STRUCTURAL_SUBJECT_ID,
  EXPECTED_STRUCTURAL_SUBJECT_SHA256,
  minimumStructuralBatchIterations,
  STRUCTURAL_PERF_POLICIES,
} from './structural-perf-contract'
import {
  evaluateStructuralPerfReport,
  type StructuralPerfEvaluation,
} from './structural-perf-gate'
import type {
  StructuralPerfCase,
  StructuralPerfReport,
} from './structural-perf'

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

const jsonSha256 = (value: unknown): string =>
  sha256(JSON.stringify(value))

const makeCase = (
  expected: (typeof EXPECTED_STRUCTURAL_CASES)[number],
  engineId: PerfEngineId,
  ratio = 1,
): StructuralPerfCase => {
  const policy = STRUCTURAL_PERF_POLICIES[engineId]
  const batchIterations = minimumStructuralBatchIterations(
    expected.workUnits,
    policy,
  )
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
      microBatchesPerSide: Math.ceil(
        batchIterations / microBatchIterations,
      ),
      targetWorkUnitsPerMicroBatch:
        policy.targetWorkUnitsPerMicroBatch,
      nominalWorkUnitsPerMicroBatch:
        microBatchIterations * expected.workUnits,
    },
    medianRatio: ratio,
    meanRatio: ratio,
    ciLow: ratio,
    ciHigh: ratio,
    signTestP: ratio === 1 ? 1 : 0,
    relativeMarginOfError: 0,
    currentSamplesNs: Array.from(
      { length: policy.minimumRounds },
      () => 100,
    ),
    baselineSamplesNs: Array.from(
      { length: policy.minimumRounds },
      () => ratio * 100,
    ),
    pairedRatios: Array.from(
      { length: policy.minimumRounds },
      () => ratio,
    ),
  }
}

const makeCases = (
  engineId: PerfEngineId = 'bun-jsc',
): StructuralPerfCase[] =>
  EXPECTED_STRUCTURAL_CASES.map((item) => makeCase(item, engineId))

const geomean = (values: readonly number[]): number =>
  Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) /
      values.length,
  )

const makeReport = (
  cases: readonly StructuralPerfCase[],
  engineId: PerfEngineId = 'bun-jsc',
  overrides: Partial<StructuralPerfReport> = {},
): StructuralPerfReport => {
  const policy = STRUCTURAL_PERF_POLICIES[engineId]
  const ratios = cases.map((item) => item.medianRatio)
  return {
    version: 1,
    generatedAt: '2026-07-23T12:00:00.000Z',
    engine: ENGINES[engineId],
    subject: {
      id: EXPECTED_STRUCTURAL_SUBJECT_ID,
      files: EXPECTED_STRUCTURAL_SUBJECT_FILES,
      sha256: EXPECTED_STRUCTURAL_SUBJECT_SHA256,
    },
    baseline: EXPECTED_STRUCTURAL_BASELINE,
    coverage: EXPECTED_STRUCTURAL_COVERAGE,
    args: {
      rounds: policy.minimumRounds,
      warmupRounds: policy.minimumWarmupRounds,
      minimumBatchWorkUnits: policy.minimumBatchWorkUnits,
      targetWorkUnitsPerMicroBatch:
        policy.targetWorkUnitsPerMicroBatch,
      quick: false,
    },
    summary: {
      count: cases.length,
      expectedCount: EXPECTED_STRUCTURAL_COVERAGE.caseCount,
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

const failures = (evaluation: StructuralPerfEvaluation): string =>
  evaluation.failures.join('\n')

describe('structural performance gate', () => {
  test('pins frozen bytes and the exact ordered 15-row projection', async () => {
    const baselineBytes = await readFile(
      new URL('./structural-before.ts', import.meta.url),
    )
    const names = EXPECTED_STRUCTURAL_CASES.map((item) => item.name)
    const projection = EXPECTED_STRUCTURAL_CASES.map(
      ({ name, workUnits }) => ({ name, workUnits }),
    )

    expect(sha256(baselineBytes)).toBe(
      EXPECTED_STRUCTURAL_BASELINE.sha256,
    )
    expect(names).toHaveLength(
      EXPECTED_STRUCTURAL_COVERAGE.caseCount,
    )
    expect(jsonSha256(names)).toBe(
      EXPECTED_STRUCTURAL_COVERAGE.caseNamesSha256,
    )
    expect(jsonSha256(projection)).toBe(
      EXPECTED_STRUCTURAL_COVERAGE.projectionSha256,
    )
  })

  test('accepts complete auditable Bun and Node reports', () => {
    for (const engineId of ['bun-jsc', 'node-v8'] as const) {
      const evaluation = evaluateStructuralPerfReport(
        makeReport(makeCases(engineId), engineId),
      )
      expect(evaluation.passed).toBe(true)
      expect(evaluation.failures).toEqual([])
      expect(evaluation.measurements).toHaveLength(2)
    }
  })

  test('fails closed on incomplete, filtered, skipped, or substituted reports', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0]!,
      correctnessOk: false,
      workerEngine: ENGINES['node-v8'],
    }
    const base = makeReport(cases)
    const report = makeReport(cases.slice(0, -1), 'bun-jsc', {
      subject: {
        ...base.subject,
        id: 'changed',
        files: base.subject.files.slice(1),
        sha256: '0'.repeat(64),
      },
      baseline: { ...base.baseline, sha256: '0'.repeat(64) },
      args: {
        ...base.args,
        quick: true,
        casesFilter: 'object',
        rounds: 8,
      },
      summary: {
        ...base.summary,
        count: cases.length - 1,
        complete: false,
        allCorrect: false,
      },
      skipped: ['missing row'],
    })
    const output = failures(evaluateStructuralPerfReport(report))
    expect(output).toContain('cannot use --quick')
    expect(output).toContain('cannot filter')
    expect(output).toContain('incomplete')
    expect(output).toContain('skipped')
    expect(output).toContain('baseline SHA-256')
    expect(output).toContain('runtime identity')
    expect(output).toContain('order/population')
  })

  test('recomputes every retained raw statistic and batching invariant', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0]!,
      batchIterations: 1,
      sampling: {
        ...cases[0]!.sampling,
        id: 'forged' as typeof INTERLEAVED_PAIRED_SAMPLER_ID,
      },
      currentSamplesNs: [0, ...cases[0]!.currentSamplesNs.slice(1)],
      baselineSamplesNs: cases[0]!.baselineSamplesNs.slice(1),
      pairedRatios: [2, ...cases[0]!.pairedRatios.slice(1)],
      medianRatio: 2,
      meanRatio: 2,
      ciLow: 0.5,
      ciHigh: 2.5,
      signTestP: 0,
      relativeMarginOfError: 1,
    }
    const output = failures(
      evaluateStructuralPerfReport(makeReport(cases)),
    )
    expect(output).toContain('used batch size')
    expect(output).toContain('sampler identity')
    expect(output).toContain('raw sample count')
    expect(output).toContain('finite and positive')
    expect(output).toContain('raw paired ratios')
    expect(output).toContain('median or mean')
    expect(output).toContain('confidence interval')
    expect(output).toContain('sign-test')
    expect(output).toContain('relative margin of error')
  })

  test('enforces noise, global, and per-case floors and rejects malformed input', () => {
    const cases = makeCases('node-v8')
    cases[0] = makeCase(
      EXPECTED_STRUCTURAL_CASES[0],
      'node-v8',
      0.69,
    )
    cases[1] = {
      ...cases[1]!,
      ciLow: 0.94,
      ciHigh: 1.06,
      relativeMarginOfError: 6,
    }
    const evaluation = evaluateStructuralPerfReport(
      makeReport(cases, 'node-v8'),
    )
    const output = failures(evaluation)
    expect(output).toContain('exceeds 5%')
    expect(output).toContain('worst case')
    expect(evaluation.measurements[1]?.passed).toBe(false)

    const malformed = evaluateStructuralPerfReport(
      null as unknown as StructuralPerfReport,
    )
    expect(malformed.passed).toBe(false)
    expect(failures(malformed)).toContain('malformed')
  })
})
