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
 *
 * There are now two exceptions. The second, for typed-array admission, is the
 * expensive one: the kernels themselves are about 397 gzip bytes and the
 * admission seam is about 1,723, because admitting a typed array safely means
 * authenticating the view, its iteration, its length, and its buffer. A
 * consumer importing `iter` pays those bytes whether or not it ever passes a
 * typed array, and the closure grows further because `iter` now reaches P2's
 * typed-array view module.
 */
export const ITER_SUBPATH_SIZE_CONTRACT = Object.freeze({
  artifact: 'dist/iter.js',
  compression: 'gzip level 9',
  /**
   * Bun and Node's zlib produce different output for identical bytes: this
   * artifact measures 10,563 under Bun and 10,543 under Node. Every number here
   * is Bun's, because that is what runs the suite. Re-measuring under Node and
   * "correcting" the ceiling would silently move it by 20 bytes.
   */
  measuredUnder: 'bun',
  baselineGzipBytes: 6_438,
  ordinaryToleranceRatio: 0.05,
  acceptedGzipBytes: 10_563,
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
  /**
   * Typed-array admission. Granted deliberately after the lane reported the
   * overage rather than raising the ceiling itself.
   */
  typedArrayException: Object.freeze({
    kernelSet: Object.freeze([
      'iter/typed-array/map/*',
      'iter/typed-array/filter/*',
      'iter/typed-array/map-filter/*',
    ]),
    shippedMatrixRows: 21,
    distinctKernels: 18,
    gzipBytesSpent: 2_110,
    admissionSeamGzipBytes: 1_723,
    consumerClosureGzipBytes: Object.freeze({ before: 10_481, after: 13_747 }),
    /**
     * Geomean of the shipped typed-array rows against hand-written indexed
     * loops over the same Float64Array, before and after admission. Bun
     * 1.3.14, n=4096, median of paired in-process sessions.
     */
    measuredGain: Object.freeze({ before: 0.075, after: 1.095 }),
    /**
     * Three `forEach` rows ship at 0.24-0.36 against the same floor P1A's
     * terminals carry, for the same measured reason: the hand reference
     * inlines the effect and the public terminal forces one indirect call per
     * element. The generic path they replace measures 0.03.
     */
    floorExceptionOwner: 'S11',
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
