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
  EXPECTED_THIRD_WAVE_BASELINE,
  EXPECTED_THIRD_WAVE_CASES,
  EXPECTED_THIRD_WAVE_COVERAGE,
  EXPECTED_THIRD_WAVE_SUBJECT_FILES,
  EXPECTED_THIRD_WAVE_SUBJECT_ID,
  EXPECTED_THIRD_WAVE_SUBJECT_SHA256,
  minimumThirdWaveBatchIterations,
  THIRD_WAVE_PERF_POLICIES,
} from './third-wave-perf-contract'
import {
  evaluateThirdWavePerfReport,
  type ThirdWavePerfEvaluation,
} from './third-wave-perf-gate'
import type {
  ThirdWavePerfCase,
  ThirdWavePerfReport,
} from './third-wave-perf'

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
  expected: (typeof EXPECTED_THIRD_WAVE_CASES)[number],
  engineId: PerfEngineId,
  ratio = 1,
): ThirdWavePerfCase => {
  const policy = THIRD_WAVE_PERF_POLICIES[engineId]
  const batchIterations = minimumThirdWaveBatchIterations(
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
): ThirdWavePerfCase[] =>
  EXPECTED_THIRD_WAVE_CASES.map((item) =>
    makeCase(item, engineId),
  )

const geomean = (values: readonly number[]): number =>
  Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) /
      values.length,
  )

const makeReport = (
  cases: readonly ThirdWavePerfCase[],
  engineId: PerfEngineId = 'bun-jsc',
  overrides: Partial<ThirdWavePerfReport> = {},
): ThirdWavePerfReport => {
  const policy = THIRD_WAVE_PERF_POLICIES[engineId]
  const ratios = cases.map((item) => item.medianRatio)
  return {
    version: 1,
    generatedAt: '2026-07-23T12:00:00.000Z',
    engine: ENGINES[engineId],
    subject: {
      id: EXPECTED_THIRD_WAVE_SUBJECT_ID,
      files: EXPECTED_THIRD_WAVE_SUBJECT_FILES,
      sha256: EXPECTED_THIRD_WAVE_SUBJECT_SHA256,
    },
    baseline: EXPECTED_THIRD_WAVE_BASELINE,
    coverage: EXPECTED_THIRD_WAVE_COVERAGE,
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
      expectedCount: EXPECTED_THIRD_WAVE_COVERAGE.caseCount,
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

const failures = (evaluation: ThirdWavePerfEvaluation): string =>
  evaluation.failures.join('\n')

describe('third-wave performance gate', () => {
  test('pins frozen bytes and the exact ordered 11-row projection', async () => {
    const baselineBytes = await readFile(
      new URL('./third-wave-before.ts', import.meta.url),
    )
    const subjectHash = createHash('sha256')
    for (const relativePath of EXPECTED_THIRD_WAVE_SUBJECT_FILES) {
      subjectHash.update(relativePath)
      subjectHash.update('\0')
      subjectHash.update(
        await readFile(
          new URL(`../../../${relativePath}`, import.meta.url),
        ),
      )
      subjectHash.update('\0')
    }
    const names = EXPECTED_THIRD_WAVE_CASES.map(
      (item) => item.name,
    )
    const projection = EXPECTED_THIRD_WAVE_CASES.map(
      ({ name, workUnits }) => ({ name, workUnits }),
    )

    expect(sha256(baselineBytes)).toBe(
      EXPECTED_THIRD_WAVE_BASELINE.sha256,
    )
    expect(subjectHash.digest('hex')).toBe(
      EXPECTED_THIRD_WAVE_SUBJECT_SHA256,
    )
    expect(names).toHaveLength(
      EXPECTED_THIRD_WAVE_COVERAGE.caseCount,
    )
    expect(jsonSha256(names)).toBe(
      EXPECTED_THIRD_WAVE_COVERAGE.caseNamesSha256,
    )
    expect(jsonSha256(projection)).toBe(
      EXPECTED_THIRD_WAVE_COVERAGE.projectionSha256,
    )
  })

  test('accepts complete auditable Bun and Node reports', () => {
    for (const engineId of ['bun-jsc', 'node-v8'] as const) {
      const evaluation = evaluateThirdWavePerfReport(
        makeReport(makeCases(engineId), engineId),
      )
      expect(evaluation.passed).toBe(true)
      expect(evaluation.failures).toEqual([])
      expect(evaluation.measurements).toHaveLength(2)
    }
  })

  test('fails closed on substituted or incomplete reports', () => {
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
        casesFilter: 'writer',
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
    const output = failures(evaluateThirdWavePerfReport(report))

    expect(output).toContain('cannot use --quick')
    expect(output).toContain('cannot filter')
    expect(output).toContain('incomplete')
    expect(output).toContain('skipped')
    expect(output).toContain('baseline identity or SHA-256')
    expect(output).toContain('pinned implementation')
    expect(output).toContain('runtime identity')
    expect(output).toContain('order/population')
  })

  test('recomputes raw statistics and batching metadata', () => {
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
      evaluateThirdWavePerfReport(makeReport(cases)),
    )

    expect(output).toContain('batch size')
    expect(output).toContain('sampler metadata')
    expect(output).toContain('raw samples')
    expect(output).toContain('raw ratios')
    expect(output).toContain('median or mean')
    expect(output).toContain('confidence interval')
    expect(output).toContain('sign test')
    expect(output).toContain('RME')
  })

  test('enforces noise and performance floors and rejects malformed input', () => {
    const cases = makeCases('node-v8')
    cases[0] = makeCase(
      EXPECTED_THIRD_WAVE_CASES[0],
      'node-v8',
      0.69,
    )
    cases[1] = {
      ...cases[1]!,
      ciLow: 0.94,
      ciHigh: 1.06,
      relativeMarginOfError: 6,
    }
    const evaluation = evaluateThirdWavePerfReport(
      makeReport(cases, 'node-v8'),
    )
    const output = failures(evaluation)

    expect(output).toContain('exceeds 5%')
    expect(output).toContain('worst case')
    expect(evaluation.measurements[1]?.passed).toBe(false)

    const malformed = evaluateThirdWavePerfReport(
      null as unknown as ThirdWavePerfReport,
    )
    expect(malformed.passed).toBe(false)
    expect(failures(malformed)).toContain('malformed')
  })
})
