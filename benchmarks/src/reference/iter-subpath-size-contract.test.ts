import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vite-plus/test'
import {
  evaluateIterSubpathSize,
  ITER_SUBPATH_SIZE_CONTRACT,
  measureIterSubpathGzipBytes,
} from './iter-subpath-size-contract'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('iter subpath size, measured against the built artifact', () => {
  test('the real dist subpath is within the ceiling', async () => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    // Checking a synthetic report only proves the evaluator. The ceiling is
    // about the file consumers actually download, and a breach here was
    // silent until a lane reported it by hand.
    const dist = join(REPO_ROOT, 'packages', 'fp', 'dist', 'iter.js')
    const measured = measureIterSubpathGzipBytes(await readFile(dist))
    const evaluation = evaluateIterSubpathSize({ gzipBytes: measured })
    expect({ measured, failures: evaluation.failures }).toEqual({ measured, failures: [] })
  })
})

describe('iter subpath size ceiling', () => {
  test('the pinned baseline clears its own ceiling', () => {
    const evaluation = evaluateIterSubpathSize({
      gzipBytes: ITER_SUBPATH_SIZE_CONTRACT.baselineGzipBytes,
    })
    expect(evaluation.passed).toBe(true)
  })

  test('growth beyond the ordinary tolerance fails', () => {
    const ceiling = Math.floor(
      ITER_SUBPATH_SIZE_CONTRACT.baselineGzipBytes *
        (1 + ITER_SUBPATH_SIZE_CONTRACT.ordinaryToleranceRatio),
    )
    const evaluation = evaluateIterSubpathSize({ gzipBytes: ceiling + 1 })
    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain('above the ceiling')
  })
})
