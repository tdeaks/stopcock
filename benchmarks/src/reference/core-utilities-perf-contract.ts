import type { PerfEngine } from './perf-engine'
import { minimumPortableBatchIterations } from './frozen-reference-contract'

export const EXPECTED_CORE_UTILITIES_SUBJECT_ID = 'stopcock-core-utilities-live-v1'

export const EXPECTED_CORE_UTILITIES_SUBJECT_FILES = Object.freeze([
  'packages/fp/src/function.ts',
  'packages/fp/src/option.ts',
  'packages/fp/src/result.ts',
  'packages/fp/src/map.ts',
  'packages/fp/src/set.ts',
  'packages/fp/src/record.ts',
] as const)

// Re-pinned 2026-08-24: the previous pin was already stale at HEAD before
// the dual-emission phase touched anything (verified by hashing the six
// subject files at HEAD with the gate's own algorithm; none of them are
// generated modules and none changed in that phase). Same gap pattern the
// one-runtime-path ledger documented for scalar-text-hash: a later commit
// touched a subject file without re-pinning this contract.
export const EXPECTED_CORE_UTILITIES_SUBJECT_SHA256 =
  'f4ef36a4c445dfc5c72aa4c9f05b722516fcdaf3ddb1419d99b0e4405e0b8786'

export const EXPECTED_CORE_UTILITIES_BASELINE = Object.freeze({
  id: 'stopcock-core-utilities-frozen-before-v1',
  sha256: 'cba6afb5e6e11a67eba8f310a52d38995f38ffa7d83073125e85a625e4cd0bf4',
})

export const EXPECTED_CORE_UTILITIES_CASES = Object.freeze([
  Object.freeze({ name: 'compose/arity-1', workUnits: 1 }),
  Object.freeze({ name: 'compose/arity-2', workUnits: 1 }),
  Object.freeze({ name: 'compose/arity-4', workUnits: 1 }),
  Object.freeze({ name: 'compose/fallback-5', workUnits: 1 }),
  Object.freeze({ name: 'curry/arity-2', workUnits: 1 }),
  Object.freeze({ name: 'curry/arity-4', workUnits: 1 }),
  Object.freeze({ name: 'curry/fallback-5', workUnits: 1 }),
  Object.freeze({ name: 'option/map-some', workUnits: 1 }),
  Object.freeze({ name: 'option/map-none', workUnits: 1 }),
  Object.freeze({ name: 'result/map-ok', workUnits: 1 }),
  Object.freeze({ name: 'result/map-err', workUnits: 1 }),
  Object.freeze({ name: 'result/liftThrowable-ok', workUnits: 1 }),
  Object.freeze({ name: 'map/get-present', workUnits: 1 }),
  Object.freeze({ name: 'map/get-present-undefined', workUnits: 1 }),
  Object.freeze({ name: 'map/get-missing', workUnits: 1 }),
  Object.freeze({ name: 'set/intersection-128', workUnits: 128 }),
  Object.freeze({ name: 'set/isDisjoint-128', workUnits: 128 }),
  Object.freeze({ name: 'record/omit-128', workUnits: 128 }),
] as const)

export const EXPECTED_CORE_UTILITIES_COVERAGE = Object.freeze({
  caseCount: 18,
  caseNamesSha256: 'cf4043f4503b324c9b1050921930f624027b2ae9c43f6b8491f0eea913e0a585',
  projectionSha256: '65a2213d263449cba6bd49a77c6a8e428291ffbf5a6805fc578fadc654d92ca3',
})

export interface CoreUtilitiesPerfPolicy {
  readonly minimumRounds: number
  readonly minimumWarmupRounds: number
  readonly minimumBatchWorkUnits: number
  readonly targetWorkUnitsPerMicroBatch: number
  readonly maximumRme: number
  readonly minimumGeomean: number
  readonly minimumCaseRatio: number
  readonly caseOverrides: Readonly<
    Record<
      string,
      {
        readonly maximumRme?: number
        readonly minimumCaseRatio?: number
      }
    >
  >
}

/**
 * Initial fail-closed no-regression policy. Throughput floors are relative to
 * the checked-in frozen/native-equivalent functions, not absolute machine
 * speed. They intentionally require characterization before being raised.
 */
export const CORE_UTILITIES_PERF_POLICIES = Object.freeze({
  'bun-jsc': Object.freeze({
    minimumRounds: 60,
    minimumWarmupRounds: 30,
    minimumBatchWorkUnits: 100_000,
    targetWorkUnitsPerMicroBatch: 10_000,
    // bun 1.4.0 requalification 2026-08-24: worst quiet-machine reading in
    // the 4-run RME ceremony was 25.16% (dual-performance-first ledger).
    // Ratio floors below are unchanged and remain the substantive check.
    maximumRme: 33,
    minimumGeomean: 0.9,
    minimumCaseRatio: 0.7,
    caseOverrides: Object.freeze({
      // The get-first implementation makes the common present path one
      // lookup (8x faster here) while a miss must perform get + has to
      // distinguish absence from a stored undefined value.
      'map/get-missing': Object.freeze({
        minimumCaseRatio: 0.62,
      }),
    }),
  }),
  'node-v8': Object.freeze({
    minimumRounds: 60,
    minimumWarmupRounds: 100,
    minimumBatchWorkUnits: 100_000,
    targetWorkUnitsPerMicroBatch: 10_000,
    maximumRme: 5,
    minimumGeomean: 0.9,
    minimumCaseRatio: 0.7,
    caseOverrides: Object.freeze({
      // A successful get can avoid Map.has and is faster on V8 and JSC.
      // A missing key necessarily pays the second lookup to
      // distinguish absence from a stored undefined value.
      'map/get-missing': Object.freeze({
        minimumCaseRatio: 0.62,
      }),
      // V8 gives the frozen recursive/spread currying baselines two stable
      // optimizer plateaus. Both confidence intervals remain over 20x above
      // the throughput floor, so these narrow noise ceilings describe that
      // row without weakening any other case.
      'curry/arity-2': Object.freeze({
        maximumRme: 10,
      }),
      'curry/arity-4': Object.freeze({
        maximumRme: 10,
      }),
    }),
  }),
} satisfies Readonly<Record<PerfEngine['id'], CoreUtilitiesPerfPolicy>>)

export const minimumCoreUtilitiesBatchIterations = (
  workUnits: number,
  policy: Pick<CoreUtilitiesPerfPolicy, 'minimumBatchWorkUnits'>,
): number =>
  minimumPortableBatchIterations(workUnits, {
    minimumBatchInputItems: policy.minimumBatchWorkUnits,
  })
