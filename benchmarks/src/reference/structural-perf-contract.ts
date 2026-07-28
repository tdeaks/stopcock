import type { PerfEngine } from './perf-engine'
import { minimumPortableBatchIterations } from './frozen-reference-contract'

export const EXPECTED_STRUCTURAL_SUBJECT_ID = 'stopcock-structural-live-v1'

export const EXPECTED_STRUCTURAL_SUBJECT_FILES = Object.freeze([
  'packages/fp/src/object.ts',
  'packages/fp/src/optic.ts',
  'packages/fp/src/ord.ts',
  'packages/fp/src/non-empty-array.ts',
] as const)

export const EXPECTED_STRUCTURAL_SUBJECT_SHA256 =
  '1b93382360bdeea7dd36b32d4caf15bbceb8ec40ac38577a1ff619f2432e0033'

export const EXPECTED_STRUCTURAL_BASELINE = Object.freeze({
  id: 'stopcock-structural-frozen-before-v1',
  sha256: '87b219041933f9dcb124a554e98fb4800856686a6096d467aeb2debb08ae4312',
})

export const EXPECTED_STRUCTURAL_CASES = Object.freeze([
  Object.freeze({ name: 'object/values-128', workUnits: 128 }),
  Object.freeze({ name: 'object/entries-128', workUnits: 128 }),
  Object.freeze({ name: 'object/omitBy-128', workUnits: 128 }),
  Object.freeze({ name: 'object/getPath-hit-depth-4', workUnits: 4 }),
  Object.freeze({ name: 'optic/view-lens-data-first', workUnits: 1 }),
  Object.freeze({ name: 'optic/collect-lens-data-first', workUnits: 1 }),
  Object.freeze({ name: 'optic/set-lens-data-first', workUnits: 1 }),
  Object.freeze({ name: 'optic/compose-collect-128x8', workUnits: 1_024 }),
  Object.freeze({ name: 'ord/sort-ties-128', workUnits: 128 }),
  Object.freeze({ name: 'nea/fromIterable-128', workUnits: 128 }),
  Object.freeze({ name: 'nea/unsafeFromReadonlyArray-128', workUnits: 128 }),
  Object.freeze({ name: 'nea/zip-128', workUnits: 128 }),
  Object.freeze({ name: 'nea/min-128', workUnits: 128 }),
  Object.freeze({ name: 'nea/max-128', workUnits: 128 }),
  Object.freeze({ name: 'nea/chunksOf-128', workUnits: 128 }),
] as const)

export const EXPECTED_STRUCTURAL_COVERAGE = Object.freeze({
  caseCount: 15,
  caseNamesSha256: 'f6c53bcd4cde4517fdacda890bb7ebbc00a80de32bf29836a66532114edfcac4',
  projectionSha256: '449142cc051a1c940d0a19630bdc7e51b842957ac041cbdfd89433571e436351',
})

export interface StructuralPerfPolicy {
  readonly minimumRounds: number
  readonly minimumWarmupRounds: number
  readonly minimumBatchWorkUnits: number
  readonly targetWorkUnitsPerMicroBatch: number
  readonly maximumRme: number
  readonly minimumGeomean: number
  readonly minimumCaseRatio: number
}

export const STRUCTURAL_PERF_POLICIES = Object.freeze({
  'bun-jsc': Object.freeze({
    // The lens collector has two stable JSC timing plateaus; 120 paired
    // samples keep the median confidence interval below the release ceiling.
    minimumRounds: 120,
    minimumWarmupRounds: 30,
    minimumBatchWorkUnits: 100_000,
    targetWorkUnitsPerMicroBatch: 10_000,
    maximumRme: 6,
    minimumGeomean: 0.9,
    minimumCaseRatio: 0.7,
  }),
  'node-v8': Object.freeze({
    // V8's allocation paths for NonEmptyArray construction and zipping are
    // bimodal even in isolated workers. The larger sample keeps their
    // bootstrap median intervals reproducible without weakening the floor.
    minimumRounds: 480,
    minimumWarmupRounds: 100,
    minimumBatchWorkUnits: 100_000,
    targetWorkUnitsPerMicroBatch: 10_000,
    maximumRme: 5,
    minimumGeomean: 0.9,
    minimumCaseRatio: 0.7,
  }),
} satisfies Readonly<Record<PerfEngine['id'], StructuralPerfPolicy>>)

export const minimumStructuralBatchIterations = (
  workUnits: number,
  policy: Pick<StructuralPerfPolicy, 'minimumBatchWorkUnits'>,
): number =>
  minimumPortableBatchIterations(workUnits, {
    minimumBatchInputItems: policy.minimumBatchWorkUnits,
  })
