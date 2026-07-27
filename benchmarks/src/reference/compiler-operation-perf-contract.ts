import {
  COMPILER_OPERATION_CORPUS_ID,
  COMPILER_OPERATION_CORPUS_VERSION,
  type CompilerSupportedOpName,
} from './compiler-operation-corpus'

export const EXPECTED_COMPILER_OPERATION_CORPUS = Object.freeze({
  id: COMPILER_OPERATION_CORPUS_ID,
  version: COMPILER_OPERATION_CORPUS_VERSION,
  totalCaseCount: 40,
  sha256: 'f86324c0d2ec822b1e69b377c1126caf080a7958c486637331d3758bb5df4018',
  caseNamesSha256: '1b9083f1eb134b814a374dec1c455b882c2ed0efd606d358a59a848fd0b293bc',
  targetOpsSha256: '2339f0d39c82e4409513b1a7e31c4c899436ef1a49cc428a9ec88ba8e40b7b47',
  opcodesSha256: 'b45440b9a04fc8e47db883a2aa2d679687123b5ea74bc98109e458d0c359617d',
  categoryCounts: Object.freeze({
    element: 5,
    stateful: 7,
    terminal: 16,
    materializer: 12,
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

export const EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT = 38

export const isCompilerOperationOptimizerCanary = (targetOp: string): boolean =>
  (EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS as readonly string[]).includes(targetOp)

export const EXPECTED_COMPILER_OPERATION_CASE_NAMES = Object.freeze([
  'operation/count',
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
  'operation/head',
  'operation/init',
  'operation/isEmpty',
  'operation/join',
  'operation/last',
  'operation/length',
  'operation/map',
  'operation/mapWhile',
  'operation/max',
  'operation/min',
  'operation/none',
  'operation/reduce',
  'operation/reject',
  'operation/reverse',
  'operation/scan',
  'operation/some',
  'operation/sort',
  'operation/sortAsc',
  'operation/sortBy',
  'operation/sortDesc',
  'operation/sum',
  'operation/tail',
  'operation/take',
  'operation/takeUntil',
  'operation/takeWhile',
  'operation/uniq',
  'operation/without',
] as const)
