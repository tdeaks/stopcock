import {
  COMPILER_OPERATION_CORPUS_ID,
  COMPILER_OPERATION_CORPUS_VERSION,
  type CompilerSupportedOpName,
} from './compiler-operation-corpus'

export const EXPECTED_COMPILER_OPERATION_CORPUS = Object.freeze({
  id: COMPILER_OPERATION_CORPUS_ID,
  version: COMPILER_OPERATION_CORPUS_VERSION,
  totalCaseCount: 59,
  sha256: '5c3013de00b77852a597bdc94c80ae72601dc2b200c471c0be0a11723e5ca849',
  caseNamesSha256: '8dd32b6e19a50826c31b28fbba3701faf61b786d8fe8b9f2e254b82359b97849',
  targetOpsSha256: '4a46339dae99693f5830dd8ed3cf894e538abe57541d69696a571ef4dd4f0014',
  opcodesSha256: '88c687171e8dfd0d88525791f8633fe4914341663db57e8c23f4f00121ce0988',
  categoryCounts: Object.freeze({
    element: 5,
    stateful: 7,
    terminal: 16,
    materializer: 31,
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

export const EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT = 57

export const isCompilerOperationOptimizerCanary = (targetOp: string): boolean =>
  (EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS as readonly string[]).includes(targetOp)

export const EXPECTED_COMPILER_OPERATION_CASE_NAMES = Object.freeze([
  'operation/adjust',
  'operation/aperture',
  'operation/chunk',
  'operation/count',
  'operation/difference',
  'operation/drop',
  'operation/dropRepeats',
  'operation/dropWhile',
  'operation/every',
  'operation/filter',
  'operation/filterMap',
  'operation/find',
  'operation/findIndex',
  'operation/findMap',
  'operation/flatMap',
  'operation/flatten',
  'operation/forEach',
  'operation/groupBy',
  'operation/head',
  'operation/includes',
  'operation/init',
  'operation/insert',
  'operation/intersection',
  'operation/intersperse',
  'operation/isEmpty',
  'operation/join',
  'operation/last',
  'operation/length',
  'operation/map',
  'operation/mapWhile',
  'operation/max',
  'operation/min',
  'operation/none',
  'operation/partition',
  'operation/reduce',
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
  'operation/sum',
  'operation/symmetricDifference',
  'operation/tail',
  'operation/take',
  'operation/takeUntil',
  'operation/takeWhile',
  'operation/union',
  'operation/uniq',
  'operation/uniqBy',
  'operation/update',
  'operation/without',
  'operation/xprod',
  'operation/zip',
  'operation/zipWith',
] as const)
