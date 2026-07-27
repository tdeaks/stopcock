import {
  COMPILER_OPERATION_CORPUS_ID,
  COMPILER_OPERATION_CORPUS_VERSION,
  type CompilerSupportedOpName,
} from './compiler-operation-corpus'

export const EXPECTED_COMPILER_OPERATION_CORPUS = Object.freeze({
  id: COMPILER_OPERATION_CORPUS_ID,
  version: COMPILER_OPERATION_CORPUS_VERSION,
  totalCaseCount: 86,
  sha256: '7ef5dd5896a45290c2937506fd8044ea65b48bde4ad055d7c61c684040a3d3c7',
  caseNamesSha256: '6a7f4467f60eafbf33cc5fa5773ef8f9f20517e904fe7ac2899a289cae0e9115',
  targetOpsSha256: 'b4d23a208c5d444c9c0d464d9e5ba1e9143c8da79cdafd43aaac30cff53dc38f',
  opcodesSha256: '74f4a265782a0f089788c45e2f8d51f41d044b52b124cf62f6f7c58e33dc050d',
  categoryCounts: Object.freeze({
    element: 5,
    stateful: 7,
    terminal: 16,
    materializer: 58,
  }),
})

export const EXPECTED_COMPILER_OPERATION_REFERENCE = Object.freeze({
  id: 'stopcock-compiler-operation-reference-emitter-w0-v1',
  sha256: '35b4a4ec199c35dd992b56768dbebe5aa18df3f103c702e8d8fdf8a9fc97093e',
})

/**
 * Fixed-input repetition lets optimizing runtimes constant-fold these pure
 * scalar operations down to the harness counter loop. Keep the rows, raw
 * samples, correctness checks, and transformed-site checks as optimizer
 * canaries, but do not present their sub-cycle timings as operation latency.
 */
export const EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS = Object.freeze([
  'isEmpty',
  'length',
] as const satisfies readonly CompilerSupportedOpName[])

export const EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT = 84

export const isCompilerOperationOptimizerCanary = (targetOp: string): boolean =>
  (EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS as readonly string[]).includes(targetOp)

export const EXPECTED_COMPILER_OPERATION_CASE_NAMES = Object.freeze([
  'operation/adjust',
  'operation/aperture',
  'operation/append',
  'operation/arrayEndsWith',
  'operation/arrayStartsWith',
  'operation/chunk',
  'operation/count',
  'operation/difference',
  'operation/drop',
  'operation/dropLast',
  'operation/dropLastWhile',
  'operation/dropRepeats',
  'operation/dropWhile',
  'operation/every',
  'operation/filter',
  'operation/filterMap',
  'operation/find',
  'operation/findIndex',
  'operation/findIndexOrUndefined',
  'operation/findLast',
  'operation/findLastIndex',
  'operation/findMap',
  'operation/findMapOrUndefined',
  'operation/findOrUndefined',
  'operation/flatMap',
  'operation/flatten',
  'operation/forEach',
  'operation/groupBy',
  'operation/groupWith',
  'operation/hasAtLeast',
  'operation/head',
  'operation/includes',
  'operation/indexOf',
  'operation/init',
  'operation/insert',
  'operation/intersection',
  'operation/intersperse',
  'operation/isEmpty',
  'operation/join',
  'operation/last',
  'operation/lastIndexOf',
  'operation/length',
  'operation/map',
  'operation/mapWhile',
  'operation/max',
  'operation/meanBy',
  'operation/min',
  'operation/none',
  'operation/nth',
  'operation/partition',
  'operation/pluck',
  'operation/prepend',
  'operation/reduce',
  'operation/reduceRight',
  'operation/reduceWhile',
  'operation/reject',
  'operation/remove',
  'operation/reverse',
  'operation/scan',
  'operation/slidingWindow',
  'operation/some',
  'operation/sort',
  'operation/sortAsc',
  'operation/sortBy',
  'operation/sortDesc',
  'operation/splitAt',
  'operation/splitWhen',
  'operation/splitWhenever',
  'operation/sum',
  'operation/sumBy',
  'operation/symmetricDifference',
  'operation/tail',
  'operation/take',
  'operation/takeLast',
  'operation/takeLastWhile',
  'operation/takeUntil',
  'operation/takeWhile',
  'operation/union',
  'operation/uniq',
  'operation/uniqBy',
  'operation/uniqWith',
  'operation/update',
  'operation/without',
  'operation/xprod',
  'operation/zip',
  'operation/zipWith',
] as const)
