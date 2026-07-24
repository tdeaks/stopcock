import { describe, expect, it } from 'vite-plus/test'
import {
  EXPECTED_SCALAR_TEXT_HASH_BASELINE,
  EXPECTED_SCALAR_TEXT_HASH_CASES,
  EXPECTED_SCALAR_TEXT_HASH_COVERAGE,
  EXPECTED_SCALAR_TEXT_HASH_SUBJECT_FILES,
  EXPECTED_SCALAR_TEXT_HASH_SUBJECT_ID,
  EXPECTED_SCALAR_TEXT_HASH_SUBJECT_SHA256,
  minimumScalarTextHashBatchIterations,
  SCALAR_TEXT_HASH_PERF_POLICIES,
} from './scalar-text-hash-perf-contract'
import {
  evaluateScalarTextHashPerfReport,
  type ScalarTextHashPerfCase,
  type ScalarTextHashPerfReport,
} from './scalar-text-hash-perf-gate'
import {
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
} from './perf-runner'

const makeReport = (): ScalarTextHashPerfReport => {
  const policy = SCALAR_TEXT_HASH_PERF_POLICIES['node-v8']
  const cases: ScalarTextHashPerfCase[] =
    EXPECTED_SCALAR_TEXT_HASH_CASES.map((expected) => {
    const batchIterations = minimumScalarTextHashBatchIterations(
      expected.workUnits,
      policy.minimumBatchWorkUnits,
    )
    const microBatchIterations = consumedItemsMicroBatchIterations(
      expected.workUnits,
      batchIterations,
      policy.targetWorkUnitsPerMicroBatch,
    )
    const samples = new Array<number>(policy.minimumRounds).fill(100)
    const ratios = new Array<number>(policy.minimumRounds).fill(1)
    return {
      name: expected.name,
      workUnits: expected.workUnits,
      correctnessOk: true,
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
      medianRatio: 1,
      meanRatio: 1,
      ciLow: 1,
      ciHigh: 1,
      signTestP: 1,
      relativeMarginOfError: 0,
      currentSamplesNs: samples.slice(),
      baselineSamplesNs: samples.slice(),
      pairedRatios: ratios,
    }
    })
  return {
    version: 1,
    generatedAt: '2026-07-23T00:00:00.000Z',
    engine: {
      id: 'node-v8',
      name: 'Node/V8',
      runtime: 'node',
      runtimeVersion: '24.0.0',
      platform: 'linux',
      architecture: 'x64',
      v8: '13.6',
    },
    subject: {
      id: EXPECTED_SCALAR_TEXT_HASH_SUBJECT_ID,
      files: EXPECTED_SCALAR_TEXT_HASH_SUBJECT_FILES,
      sha256: EXPECTED_SCALAR_TEXT_HASH_SUBJECT_SHA256,
    },
    baseline: EXPECTED_SCALAR_TEXT_HASH_BASELINE,
    coverage: EXPECTED_SCALAR_TEXT_HASH_COVERAGE,
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
      expectedCount: cases.length,
      geomeanRatio: 1,
      minRatio: 1,
      maxRelativeMarginOfError: 0,
      allCorrect: true,
      complete: true,
    },
    cases,
  }
}

describe('scalar/text/hash performance gate evaluator', () => {
  it('accepts a complete pinned interleaved report', () => {
    expect(evaluateScalarTextHashPerfReport(makeReport())).toMatchObject({
      passed: true,
      failures: [],
    })
  })

  it('rejects baseline, coverage, population, and correctness substitution', () => {
    const report = makeReport()
    const forged = {
      ...report,
      subject: { ...report.subject, sha256: 'd'.repeat(64) },
      baseline: { ...report.baseline, sha256: 'b'.repeat(64) },
      coverage: { ...report.coverage, projectionSha256: 'c'.repeat(64) },
      summary: { ...report.summary, allCorrect: false },
      cases: report.cases.slice(0, -1),
    } as ScalarTextHashPerfReport
    const output = evaluateScalarTextHashPerfReport(forged).failures.join('\n')
    expect(output).toContain('subject provenance')
    expect(output).toContain('baseline provenance')
    expect(output).toContain('case order or population')
    expect(output).toContain('coverage hashes')
    expect(output).toContain('summary is incomplete or incorrect')
  })

  it('rejects sampler metadata and raw ratio forgery', () => {
    const report = makeReport()
    const first = report.cases[0]
    const forgedFirst = {
      ...first,
      sampling: { ...first.sampling, order: 'forged-order' },
      currentSamplesNs: [0, ...first.currentSamplesNs.slice(1)],
      pairedRatios: [2, ...first.pairedRatios.slice(1)],
    }
    const forged = {
      ...report,
      cases: [forgedFirst, ...report.cases.slice(1)],
    } as ScalarTextHashPerfReport
    const output = evaluateScalarTextHashPerfReport(forged).failures.join('\n')
    expect(output).toContain('sampler metadata')
    expect(output).toContain('raw samples or paired ratios')
  })

  it('rejects derived statistics, unstable rows, and weak sampling args', () => {
    const report = makeReport()
    const first = report.cases[0]
    const forgedFirst = {
      ...first,
      medianRatio: 2,
      relativeMarginOfError: 100,
    }
    const forged = {
      ...report,
      args: { ...report.args, quick: true, rounds: 1 },
      cases: [forgedFirst, ...report.cases.slice(1)],
    } as ScalarTextHashPerfReport
    const output = evaluateScalarTextHashPerfReport(forged).failures.join('\n')
    expect(output).toContain('quick mode')
    expect(output).toContain('sampling arguments')
    expect(output).toContain('derived statistics')
    expect(output).toContain('relative margin of error')
  })
})
