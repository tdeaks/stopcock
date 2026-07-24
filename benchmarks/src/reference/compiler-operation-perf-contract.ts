import {
  COMPILER_OPERATION_CORPUS_ID,
  COMPILER_OPERATION_CORPUS_VERSION,
  type CompilerSupportedOpName,
} from './compiler-operation-corpus'

export const EXPECTED_COMPILER_OPERATION_CORPUS = Object.freeze({
  id: COMPILER_OPERATION_CORPUS_ID,
  version: COMPILER_OPERATION_CORPUS_VERSION,
  totalCaseCount: 39,
  sha256: 'c1e5bad27b54b7b67a97e466d328cf39614ee5bd5c8e950d18997fb06306223b',
  caseNamesSha256: '123e9c62f4bd6719d9f9c60e6325a0ee95aa3d835954c66ad869fdc42b61f685',
  targetOpsSha256: '11435622ebdc4617df24731995c22e4af6404d9bca59bc029f49f58f483e3f75',
  opcodesSha256: 'dbc93db6db025012e2eca49e8ac600d82c5a2116343eed2fa01472805103f1b8',
  categoryCounts: Object.freeze({
    element: 5,
    stateful: 7,
    terminal: 16,
    materializer: 11,
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

export const EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT = 37

export const isCompilerOperationOptimizerCanary = (targetOp: string): boolean =>
  (EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS as readonly string[]).includes(targetOp)

export const EXPECTED_COMPILER_OPERATION_CASE_NAMES = Object.freeze([
  'operation/count',
  'operation/drop',
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
