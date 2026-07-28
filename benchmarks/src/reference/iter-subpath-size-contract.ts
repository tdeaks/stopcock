import { gzipSync } from 'node:zlib'

/**
 * The `iter` subpath's byte budget.
 *
 * P1A granted this subpath two named, documented oversize exceptions for
 * generated Array and typed-array kernels (2,110-2,673 gzip bytes of
 * admission seam and dispatch functions, against measured throughput gains).
 * Phase 6 deleted both kernel families: `iter.ts` runs the plain lazy
 * generator and hand-written Array/iterable fast plans unconditionally, with
 * no kernel dispatch and no typed-array admission seam. The exceptions are
 * gone with the code they were granted for, and the ceiling is a plain
 * baseline-plus-tolerance again.
 */
export const ITER_SUBPATH_SIZE_CONTRACT = Object.freeze({
  artifact: 'dist/iter.js',
  compression: 'gzip level 9',
  /**
   * Bun and Node's zlib produce different output for identical bytes: this
   * artifact measures 6,206 under Bun and 6,199 under Node, post phase-6
   * kernel deletion. Every number here is Bun's, because that is what runs
   * the suite.
   */
  measuredUnder: 'bun',
  baselineGzipBytes: 6_206,
  ordinaryToleranceRatio: 0.05,
})

export interface IterSubpathSizeReport {
  readonly gzipBytes: number
}

export interface IterSubpathSizeEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
}

export const measureIterSubpathGzipBytes = (source: Uint8Array): number =>
  gzipSync(source, { level: 9 }).byteLength

export const evaluateIterSubpathSize = (
  report: IterSubpathSizeReport,
): IterSubpathSizeEvaluation => {
  const contract = ITER_SUBPATH_SIZE_CONTRACT
  const failures: string[] = []
  const ceiling = Math.floor(contract.baselineGzipBytes * (1 + contract.ordinaryToleranceRatio))
  if (report.gzipBytes > ceiling) {
    failures.push(`iter subpath is ${report.gzipBytes} gzip bytes, above the ceiling ${ceiling}`)
  }
  return {
    passed: failures.length === 0,
    failures: Object.freeze(failures),
  }
}
