import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vite-plus/test'
import {
  evaluateIterKernelPerfReport,
  ITER_KERNEL_CASE_IDS,
  ITER_KERNEL_PERF_POLICIES,
  ITER_KERNEL_SHAPE_IDS,
  ITER_KERNEL_TERMINAL_IDS,
  type IterKernelPerfCase,
  type IterKernelPerfReport,
  ITER_KERNEL_FLOOR_EXCEPTIONS,
} from './iter-array-kernel-gate'
import {
  evaluateIterSubpathSize,
  ITER_SUBPATH_SIZE_CONTRACT,
  measureIterSubpathGzipBytes,
} from './iter-subpath-size-contract'
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

const makeCase = (id: string, ratio: number, gated = true): IterKernelPerfCase => {
  const [shape, terminal] = id.split('/')
  const rounds = ITER_KERNEL_PERF_POLICIES['bun-jsc'].minimumRounds
  return {
    id,
    shape: shape as IterKernelPerfCase['shape'],
    terminal: terminal as IterKernelPerfCase['terminal'],
    inputSize: 4_096,
    correctnessOk: true,
    gated,
    rounds,
    batchIterations: ITER_KERNEL_PERF_POLICIES['bun-jsc'].minimumBatchIterations,
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
    kernelSamplesNs: Array.from({ length: rounds }, () => 100),
    handSamplesNs: Array.from({ length: rounds }, () => 100 * ratio),
    pairedRatios: Array.from({ length: rounds }, () => ratio),
  }
}

const makeReport = (cases: readonly IterKernelPerfCase[]): IterKernelPerfReport => {
  const gated = cases.filter((item) => item.gated).map((item) => item.medianRatio)
  return {
    generatedAt: '2026-07-25T00:00:00.000Z',
    engine: BUN,
    comparison: {
      candidate: '@stopcock/fp generated Iter Array kernels',
      reference: 'hand-written indexed loops',
      ratio: 'handNs / kernelNs; greater is faster',
    },
    summary: {
      count: cases.length,
      expectedCount: ITER_KERNEL_CASE_IDS.length,
      geomeanRatio: Math.exp(
        gated.reduce((total, value) => total + Math.log(value), 0) / gated.length,
      ),
      minRatio: Math.min(...gated),
      belowReleaseTarget: [],
      allCorrect: true,
      complete: cases.length === ITER_KERNEL_CASE_IDS.length,
    },
    cases,
    dispatchDominated: cases.filter((item) => !item.gated),
    skipped: [],
  }
}

describe('shipped Array kernel policy', () => {
  test('covers the shipped shape by terminal matrix', () => {
    expect(ITER_KERNEL_CASE_IDS).toHaveLength(
      ITER_KERNEL_SHAPE_IDS.length * ITER_KERNEL_TERMINAL_IDS.length,
    )
    expect(new Set(ITER_KERNEL_CASE_IDS).size).toBe(ITER_KERNEL_CASE_IDS.length)
  })

  test('accepts a complete report that clears the floor', () => {
    const cases = ITER_KERNEL_CASE_IDS.map((id) => makeCase(id, 0.95, !id.endsWith('/first')))
    expect(evaluateIterKernelPerfReport(makeReport(cases))).toEqual({
      passed: true,
      failures: [],
      acceptedBelowFloor: [],
    })
  })

  test('fails on a single gated row below the floor', () => {
    const cases = ITER_KERNEL_CASE_IDS.map((id) => makeCase(id, 0.95, !id.endsWith('/first')))
    cases[0] = makeCase(ITER_KERNEL_CASE_IDS[0] as string, 0.79)
    const failures = evaluateIterKernelPerfReport(makeReport(cases)).failures.join('\n')
    expect(failures).toContain('is below 0.80')
  })

  test('fails closed on a missing row', () => {
    const cases = ITER_KERNEL_CASE_IDS.slice(1).map((id) =>
      makeCase(id, 0.95, !id.endsWith('/first')),
    )
    const evaluation = evaluateIterKernelPerfReport(makeReport(cases))
    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain('missing shipped kernel row')
  })

  test('a dispatch-dominated row is reported but does not set the floor', () => {
    const cases = ITER_KERNEL_CASE_IDS.map((id) => makeCase(id, 0.95, !id.endsWith('/first')))
    const withSlowFirst = cases.map((item) =>
      item.gated
        ? item
        : { ...item, medianRatio: 0.2, pairedRatios: item.pairedRatios.map(() => 0.2) },
    )
    expect(evaluateIterKernelPerfReport(makeReport(withSlowFirst)).passed).toBe(true)
  })
})

describe('iter subpath size, measured against the built artifact', () => {
  test('the real dist subpath is within the accepted ceiling', async () => {
    const { readFile } = await import('node:fs/promises')
<<<<<<< Updated upstream
    const { join } = await import('node:path')
    // Checking a synthetic report only proves the evaluator. The ceiling is
    // about the file consumers actually download, and a breach here was silent
    // until a lane reported it by hand.
    const dist = join(REPO_ROOT, 'packages', 'fp', 'dist', 'iter.js')
    const measured = measureIterSubpathGzipBytes(await readFile(dist))
    const evaluation = evaluateIterSubpathSize({
      gzipBytes: measured,
      kernelCount: ITER_SUBPATH_SIZE_CONTRACT.exception.distinctKernels,
=======
    const { dirname, join, resolve } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const dist = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      'packages',
      'fp',
      'dist',
    )
    // Enforcing against a synthetic report only proves the evaluator. The
    // ceiling is about the artifact consumers actually download.
    const bytes = await readFile(join(dist, 'iter.js'))
    const measured = measureIterSubpathGzipBytes(bytes)
    const evaluation = evaluateIterSubpathSize({
      gzipBytes: measured,
      kernelCount: ITER_SUBPATH_SIZE_CONTRACT.distinctKernelCount,
>>>>>>> Stashed changes
    })
    expect({ measured, failures: evaluation.failures }).toEqual({ measured, failures: [] })
  })
})

describe('iter subpath size exception', () => {
  test('the exception is taken explicitly and is not within the ordinary tolerance', () => {
    const evaluation = evaluateIterSubpathSize({
      gzipBytes: ITER_SUBPATH_SIZE_CONTRACT.acceptedGzipBytes,
      kernelCount: ITER_SUBPATH_SIZE_CONTRACT.exception.distinctKernels,
    })
    expect(evaluation.passed).toBe(true)
    expect(evaluation.withinOrdinaryTolerance).toBe(false)
  })

  test('growth beyond the accepted size fails', () => {
    const evaluation = evaluateIterSubpathSize({
      gzipBytes: ITER_SUBPATH_SIZE_CONTRACT.acceptedGzipBytes + 1,
      kernelCount: ITER_SUBPATH_SIZE_CONTRACT.exception.distinctKernels,
    })
    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain('above the accepted')
  })

  test('a kernel set the exception does not name fails', () => {
    const evaluation = evaluateIterSubpathSize({
      gzipBytes: ITER_SUBPATH_SIZE_CONTRACT.baselineGzipBytes,
      kernelCount: ITER_SUBPATH_SIZE_CONTRACT.exception.distinctKernels + 1,
    })
    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain('size exception names')
  })

  test('the named kernel count matches the checked-in generated module', () => {
    const generated = readFileSync(join(REPO_ROOT, 'packages/fp/src/iter-kernels.ts'), 'utf8')
    const declared = [...generated.matchAll(/^function kernel\$/gmu)]
    expect(declared).toHaveLength(ITER_SUBPATH_SIZE_CONTRACT.exception.distinctKernels)

    const manifest = JSON.parse(
      readFileSync(
        join(REPO_ROOT, 'packages/fp/codegen/generated/iter-kernel-manifest-v1.json'),
        'utf8',
      ),
    ) as { readonly shippedRows: number; readonly expectedRows: number }
    expect(manifest.shippedRows).toBe(ITER_SUBPATH_SIZE_CONTRACT.exception.shippedMatrixRows)
    expect(manifest.expectedRows).toBe(210)
  })
})

describe('recorded floor exceptions', () => {
  test('a listed terminal below the floor is accepted, not failed', () => {
    // Paired with a clearing row so the geomean floor is not what is measured.
    const evaluation = evaluateIterKernelPerfReport(
      makeReport([makeCase('map/forEach', 0.7), makeCase('map/toArray', 1.2)]),
    )
    expect(evaluation.failures.filter((f) => f.includes('is below 0.80'))).toEqual([])
    expect(evaluation.acceptedBelowFloor).toHaveLength(1)
    expect(evaluation.acceptedBelowFloor[0]).toContain('S11')
  })

  test('an unlisted terminal below the floor still fails', () => {
    const evaluation = evaluateIterKernelPerfReport(makeReport([makeCase('map/toArray', 0.7)]))
    expect(evaluation.failures.some((f) => f.includes('is below'))).toBe(true)
  })

  test('every exception names an owning stage and a reason', () => {
    for (const exception of ITER_KERNEL_FLOOR_EXCEPTIONS) {
      expect(exception.owner.length).toBeGreaterThan(0)
      expect(exception.reason.length).toBeGreaterThan(0)
    }
  })
})
