import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vite-plus/test'
import {
  evaluateIterViewPerfReport,
  ITER_VIEW_CASE_IDS,
  ITER_VIEW_FLOOR_EXCEPTIONS,
  ITER_VIEW_MEASURED_GAIN,
  ITER_VIEW_PERF_POLICIES,
  ITER_VIEW_SHAPE_IDS,
  ITER_VIEW_SHARED_KERNEL_COST,
  ITER_VIEW_TERMINAL_IDS,
  type IterViewPerfCase,
  type IterViewPerfReport,
} from './iter-typed-array-kernel-gate'
import type { PerfEngine } from './perf-engine'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

const BUN: PerfEngine = {
  id: 'bun-jsc',
  name: 'Bun/JavaScriptCore',
  runtime: 'bun',
  runtimeVersion: '1.3.14',
  nodeCompatibility: '24.3.0',
  platform: 'darwin',
  architecture: 'arm64',
}

const makeCase = (id: string, ratio: number): IterViewPerfCase => {
  const [shape, terminal] = id.split('/')
  const rounds = ITER_VIEW_PERF_POLICIES['bun-jsc'].minimumRounds
  return {
    id,
    shape: shape as IterViewPerfCase['shape'],
    terminal: terminal as IterViewPerfCase['terminal'],
    inputSize: 4_096,
    correctnessOk: true,
    rounds,
    batchIterations: ITER_VIEW_PERF_POLICIES['bun-jsc'].minimumBatchIterations,
    sampling: {
      id: 'interleaved-paired',
      order: 'ABBA',
      batchIterationsPerSide: 40,
      microBatchIterations: 2,
      microBatchesPerSide: 20,
    },
    medianRatio: ratio,
    ciLow: ratio * 0.99,
    ciHigh: ratio * 1.01,
    relativeMarginOfError: 1,
    pairedRatios: Array.from({ length: rounds }, () => ratio),
  }
}

const makeReport = (cases: readonly IterViewPerfCase[]): IterViewPerfReport => ({
  generatedAt: '2026-07-25T00:00:00.000Z',
  engine: BUN,
  comparison: {
    candidate: '@stopcock/fp generated Iter typed-array kernels',
    reference: 'hand-written indexed loops over the same view',
    ratio: 'handNs / kernelNs; greater is faster',
  },
  summary: {
    count: cases.length,
    expectedCount: ITER_VIEW_CASE_IDS.length,
    geomeanRatio: Math.exp(
      cases.reduce((total, item) => total + Math.log(item.medianRatio), 0) / cases.length,
    ),
    minRatio: Math.min(...cases.map((item) => item.medianRatio)),
    allCorrect: true,
    complete: cases.length === ITER_VIEW_CASE_IDS.length,
  },
  cases,
  skipped: [],
})

describe('shipped typed-array kernel policy', () => {
  test('covers the shipped shape by terminal matrix', () => {
    expect(ITER_VIEW_CASE_IDS).toHaveLength(
      ITER_VIEW_SHAPE_IDS.length * ITER_VIEW_TERMINAL_IDS.length,
    )
    expect(new Set(ITER_VIEW_CASE_IDS).size).toBe(ITER_VIEW_CASE_IDS.length)
  })

  test('accepts a complete report that clears the floor', () => {
    const evaluation = evaluateIterViewPerfReport(
      makeReport(ITER_VIEW_CASE_IDS.map((id) => makeCase(id, 0.95))),
    )
    expect(evaluation).toEqual({ passed: true, failures: [], acceptedBelowFloor: [] })
  })

  test('fails on a single row below the floor', () => {
    const cases = ITER_VIEW_CASE_IDS.map((id) => makeCase(id, 0.95))
    cases[0] = makeCase(ITER_VIEW_CASE_IDS[0] as string, 0.74)
    const failures = evaluateIterViewPerfReport(makeReport(cases)).failures.join('\n')
    expect(failures).toContain('is below 0.75')
  })

  test('fails closed on a missing row', () => {
    const cases = ITER_VIEW_CASE_IDS.slice(1).map((id) => makeCase(id, 0.95))
    const evaluation = evaluateIterViewPerfReport(makeReport(cases))
    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain('missing shipped view kernel row')
  })

  test('forEach below the floor is accepted against a named owner', () => {
    const cases = ITER_VIEW_CASE_IDS.map((id) => makeCase(id, id.endsWith('/forEach') ? 0.24 : 1.3))
    const evaluation = evaluateIterViewPerfReport(makeReport(cases))
    expect(evaluation.failures.filter((failure) => failure.includes('is below 0.75'))).toEqual([])
    expect(evaluation.acceptedBelowFloor).toHaveLength(ITER_VIEW_SHAPE_IDS.length)
    expect(evaluation.acceptedBelowFloor[0]).toContain('S11')
  })

  test('every exception names an owning stage and a reason', () => {
    for (const exception of ITER_VIEW_FLOOR_EXCEPTIONS) {
      expect(exception.owner.length).toBeGreaterThan(0)
      expect(exception.reason.length).toBeGreaterThan(0)
    }
  })

  test('the recorded gain is a gain, and the split kernels cost the Array rows nothing', () => {
    for (const row of ITER_VIEW_MEASURED_GAIN) expect(row.after).toBeGreaterThan(row.before)
    expect(ITER_VIEW_SHARED_KERNEL_COST.splitGeomean).toBeGreaterThan(
      ITER_VIEW_SHARED_KERNEL_COST.sharedGeomean,
    )
  })
})

describe('typed-array kernel manifest', () => {
  const manifest = JSON.parse(
    readFileSync(
      join(REPO_ROOT, 'packages/fp/codegen/generated/iter-typed-array-kernel-manifest-v1.json'),
      'utf8',
    ),
  ) as {
    readonly expectedRows: number
    readonly shippedRows: number
    readonly rows: readonly {
      readonly kernelId: string
      readonly disposition: string
      readonly reason: string
    }[]
  }

  test('every constructor by shape by terminal row appears exactly once', () => {
    expect(manifest.expectedRows).toBe(210)
    expect(manifest.rows).toHaveLength(210)
    expect(new Set(manifest.rows.map((row) => row.kernelId)).size).toBe(210)
  })

  test('the shipped rows are the ones the perf gate measures', () => {
    // Seven terminals for six functions: last and lastOrUndefined share one.
    expect(manifest.shippedRows).toBe(21)
    expect(
      manifest.rows.every((row) => row.disposition === 'shipped' || row.reason.length > 0),
    ).toBe(true)
  })

  test('every unshipped row says why it iterates', () => {
    for (const row of manifest.rows) {
      if (row.disposition === 'shipped') continue
      expect(row.disposition).toBe('generic-fallback')
      expect(row.reason).toContain('generic iteration retained')
    }
  })

  test('the generated module declares one view kernel per shipped function', () => {
    const generated = readFileSync(join(REPO_ROOT, 'packages/fp/src/iter-kernels.ts'), 'utf8')
    expect([...generated.matchAll(/^function viewKernel\$/gmu)]).toHaveLength(18)
  })
})
