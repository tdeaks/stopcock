import type { PerfEngine } from './perf-engine'
import { minimumPortableBatchIterations } from './portable-perf-contract'

/**
 * Stable subject identity for the source-to-source compiler lane. The subject
 * implementation is expected to change, so its source hash is recorded in the
 * report as provenance rather than pinned as a denominator.
 */
export const EXPECTED_COMPILER_SUBJECT_ID = 'stopcock-fp-compiler-static-transform-v1'

export const EXPECTED_COMPILER_IMPLEMENTATION_FILES = Object.freeze([
  'packages/fp-compiler/src/codegen.ts',
  'packages/fp-compiler/src/ops-table.ts',
  'packages/fp-compiler/src/ops.ts',
  'packages/fp-compiler/src/transform.ts',
] as const)

/**
 * Exact compiler capability surface used to project the portable corpus.
 * Sorting is intentional: Set insertion order and ops-table declaration order
 * must not be able to move the release-gate population silently.
 */
export const EXPECTED_COMPILER_SUPPORTED_OP_NAMES = Object.freeze([
  'count',
  'drop',
  'dropWhile',
  'every',
  'filter',
  'filterMap',
  'find',
  'findIndex',
  'findMap',
  'flatMap',
  'flatten',
  'forEach',
  'head',
  'init',
  'isEmpty',
  'join',
  'last',
  'length',
  'map',
  'mapWhile',
  'max',
  'min',
  'none',
  'reduce',
  'reject',
  'reverse',
  'scan',
  'some',
  'sort',
  'sortAsc',
  'sortBy',
  'sortDesc',
  'sum',
  'tail',
  'take',
  'takeUntil',
  'takeWhile',
  'uniq',
  'without',
] as const)

export const EXPECTED_COMPILER_SUPPORTED_OPS_SHA256 =
  '11435622ebdc4617df24731995c22e4af6404d9bca59bc029f49f58f483e3f75'

/**
 * The compiler currently claims all 44 portable-corpus cases. Keeping the
 * exact ordered names here prevents a same-sized substitute population from
 * satisfying the gate, while the projection hash also pins every case's
 * ordered step kinds and the complete unsupported-gap ledger.
 */
export const EXPECTED_COMPILER_SUPPORTED_CASE_NAMES = Object.freeze([
  'single-op map (trivial, n=100)',
  'single-op filter (arithmetic, n=10000)',
  'single-op reject (allocating, n=100000)',
  'single-op filterMap (trivial, n=100)',
  'single-op take (arithmetic, n=10000)',
  'single-op drop (allocating, n=100000)',
  '2-3 ops, sink=collect, boundary=none (trivial, n=100)',
  '2-3 ops, sink=collect, boundary=none (arithmetic, n=10000)',
  '2-3 ops, sink=collect, boundary=none (allocating, n=100000)',
  '2-3 ops, sink=collect, boundary=present (trivial, n=100)',
  '2-3 ops, sink=collect, boundary=present (arithmetic, n=10000)',
  '2-3 ops, sink=collect, boundary=present (allocating, n=100000)',
  'map -> filter -> reduce (sentinel)',
  '2-3 ops, sink=reduce-like, boundary=none (arithmetic, n=10000)',
  '2-3 ops, sink=reduce-like, boundary=none (allocating, n=100000)',
  '2-3 ops, sink=reduce-like, boundary=present (trivial, n=100)',
  '2-3 ops, sink=reduce-like, boundary=present (arithmetic, n=10000)',
  '2-3 ops, sink=reduce-like, boundary=present (allocating, n=100000)',
  '2-3 ops, sink=short-circuit, boundary=none (trivial, n=100)',
  '2-3 ops, sink=short-circuit, boundary=none (arithmetic, n=10000)',
  '2-3 ops, sink=short-circuit, boundary=none (allocating, n=100000)',
  '2-3 ops, sink=short-circuit, boundary=present (trivial, n=100)',
  '2-3 ops, sink=short-circuit, boundary=present (arithmetic, n=10000)',
  '2-3 ops, sink=short-circuit, boundary=present (allocating, n=100000)',
  '4+ ops, sink=collect, boundary=none (trivial, n=100)',
  '4+ ops, sink=collect, boundary=none (arithmetic, n=10000)',
  '4+ ops, sink=collect, boundary=none (allocating, n=100000)',
  '4+ ops, sink=collect, boundary=present (trivial, n=100)',
  '4+ ops, sink=collect, boundary=present (arithmetic, n=10000)',
  '4+ ops, sink=collect, boundary=present (allocating, n=100000)',
  '4+ ops, sink=reduce-like, boundary=none (trivial, n=100)',
  '4+ ops, sink=reduce-like, boundary=none (arithmetic, n=10000)',
  '4+ ops, sink=reduce-like, boundary=none (allocating, n=100000)',
  '4+ ops, sink=reduce-like, boundary=present (trivial, n=100)',
  '4+ ops, sink=reduce-like, boundary=present (arithmetic, n=10000)',
  '4+ ops, sink=reduce-like, boundary=present (allocating, n=100000)',
  '4+ ops, sink=short-circuit, boundary=none (trivial, n=100)',
  '4+ ops, sink=short-circuit, boundary=none (arithmetic, n=10000)',
  '4+ ops, sink=short-circuit, boundary=none (allocating, n=100000)',
  '4+ ops, sink=short-circuit, boundary=present (trivial, n=100)',
  '4+ ops, sink=short-circuit, boundary=present (arithmetic, n=10000)',
  '4+ ops, sink=short-circuit, boundary=present (allocating, n=100000)',
  'filterMap -> take (sentinel)',
  'flatMap -> uniq -> count (sentinel)',
] as const)

export const EXPECTED_COMPILER_COVERAGE = Object.freeze({
  corpusCaseCount: 44,
  supportedCaseCount: 44,
  gapCount: 0,
  supportedCaseNamesSha256: 'bf4432f0cb45ee127ad59a6a0a1da741fccd486c23e14baaf956689a400ac6db',
  projectionSha256: 'd93e6cb4b7d47824448e8e2326030cb30603921020bd12c7258d9822c17b128c',
})

export interface CompilerPerfPolicy {
  readonly minimumRounds: number
  readonly minimumWarmupRounds: number
  readonly minimumBatchInputItems: number
  readonly targetConsumedItemsPerMicroBatch: number
  readonly maximumRme: number
  readonly minimumGeomean: number
  readonly minimumCaseRatio: number
}

/**
 * The historical throughput floors remain unchanged: geomean >= 0.90 on
 * both engines, with no case below 0.80 on Bun/JSC or 0.70 on Node/V8.
 * This contract strengthens measurement quality around those same floors.
 */
export const COMPILER_PERF_POLICIES = Object.freeze({
  'bun-jsc': Object.freeze({
    minimumRounds: 40,
    minimumWarmupRounds: 30,
    minimumBatchInputItems: 100_000,
    targetConsumedItemsPerMicroBatch: 10_000,
    maximumRme: 6,
    minimumGeomean: 0.9,
    minimumCaseRatio: 0.8,
  }),
  'node-v8': Object.freeze({
    minimumRounds: 40,
    minimumWarmupRounds: 100,
    minimumBatchInputItems: 100_000,
    targetConsumedItemsPerMicroBatch: 10_000,
    maximumRme: 5,
    minimumGeomean: 0.9,
    minimumCaseRatio: 0.7,
  }),
} satisfies Readonly<Record<PerfEngine['id'], CompilerPerfPolicy>>)

export const minimumCompilerBatchIterations = (
  consumedInputItems: number,
  policy: Pick<CompilerPerfPolicy, 'minimumBatchInputItems'>,
): number => minimumPortableBatchIterations(consumedInputItems, policy)
