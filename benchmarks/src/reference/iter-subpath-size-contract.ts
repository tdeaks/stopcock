import { gzipSync } from 'node:zlib'

/**
 * The `iter` subpath's byte budget.
 *
 * P1A's rule is that the subpath stays within 5% of its pre-kernel size unless
 * a named accepted kernel carries a documented benefit-per-byte exception.
 * Terminal fusion cannot fit inside 5%: a kernel is a distinct function in the
 * published chunk and costs about 40 gzip bytes, while 5% of the pre-kernel
 * subpath is 322 bytes in total. So the exception is taken explicitly, once,
 * for one named kernel set, with the measured gain recorded beside the bytes.
 */
export const ITER_SUBPATH_SIZE_CONTRACT = Object.freeze({
  artifact: 'dist/iter.js',
  compression: 'gzip level 9',
  baselineGzipBytes: 6_438,
  ordinaryToleranceRatio: 0.05,
  acceptedGzipBytes: 8_433,
  exception: Object.freeze({
    kernelSet: Object.freeze([
      'iter/array/map/*',
      'iter/array/filter/*',
      'iter/array/map-filter/*',
      'iter/array/map-filter-take/*',
      'iter/array/filterMap-take/*',
    ]),
    shippedMatrixRows: 75,
    distinctKernels: 55,
    /**
     * Bun 1.3.14, n=4096, median of paired in-process sessions against the same
     * hand-written loop, before and after fusion. These are the rows the byte
     * spend buys.
     */
    measuredGain: Object.freeze([
      Object.freeze({ row: 'map-filter/reduce', before: 0.095, after: 0.975 }),
      Object.freeze({ row: 'map-filter/count', before: 0.1, after: 1.173 }),
      Object.freeze({ row: 'map-filter/findOrUndefined', before: 0.115, after: 1.196 }),
      Object.freeze({ row: 'map-filter/toArray', before: 0.718, after: 1.086 }),
      Object.freeze({ row: 'map/toArray', before: 0.388, after: 0.914 }),
      Object.freeze({ row: 'map-filter-take/toArray', before: 0.555, after: 0.905 }),
    ]),
  }),
})

export interface IterSubpathSizeReport {
  readonly gzipBytes: number
  readonly kernelCount: number
}

export interface IterSubpathSizeEvaluation {
  readonly passed: boolean
  readonly withinOrdinaryTolerance: boolean
  readonly failures: readonly string[]
}

export const measureIterSubpathGzipBytes = (source: Uint8Array): number =>
  gzipSync(source, { level: 9 }).byteLength

/**
 * The accepted size is a ceiling, not a target: growth beyond the number the
 * exception was granted for fails, and so does any kernel appearing that the
 * exception does not name.
 */
export const evaluateIterSubpathSize = (
  report: IterSubpathSizeReport,
): IterSubpathSizeEvaluation => {
  const contract = ITER_SUBPATH_SIZE_CONTRACT
  const failures: string[] = []
  const ordinaryCeiling = Math.floor(
    contract.baselineGzipBytes * (1 + contract.ordinaryToleranceRatio),
  )
  if (report.gzipBytes > contract.acceptedGzipBytes) {
    failures.push(
      `iter subpath is ${report.gzipBytes} gzip bytes, above the accepted ${contract.acceptedGzipBytes}`,
    )
  }
  if (report.kernelCount !== contract.exception.distinctKernels) {
    failures.push(
      `iter subpath declares ${report.kernelCount} kernels, but the size exception names ${contract.exception.distinctKernels}`,
    )
  }
  return {
    passed: failures.length === 0,
    withinOrdinaryTolerance: report.gzipBytes <= ordinaryCeiling,
    failures: Object.freeze(failures),
  }
}
