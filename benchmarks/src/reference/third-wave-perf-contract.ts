import type { PerfEngine } from './perf-engine'
import { minimumPortableBatchIterations } from './portable-perf-contract'

export const EXPECTED_THIRD_WAVE_SUBJECT_ID =
  'stopcock-third-wave-live-v1'

export const EXPECTED_THIRD_WAVE_SUBJECT_FILES = Object.freeze([
  'packages/fp/src/recursion.ts',
  'packages/fp/src/match.ts',
  'packages/fp/src/schema.ts',
  'packages/fp/src/writer.ts',
] as const)

export const EXPECTED_THIRD_WAVE_SUBJECT_SHA256 =
  '45e083908f3c3a6961c0aaa2687bcb1a1000b5b3b214115f474bf4206809d95f'

export const EXPECTED_THIRD_WAVE_BASELINE = Object.freeze({
  id: 'stopcock-third-wave-frozen-before-v1',
  sha256:
    'ebce9bdd1060a6efc3d1ac1fef11567928803630725b7f13f053bc495a6910a6',
})

export const EXPECTED_THIRD_WAVE_CASES = Object.freeze([
  Object.freeze({
    name: 'recursion/map-suspended-128',
    workUnits: 128,
  }),
  Object.freeze({
    name: 'recursion/flatMap-suspended-128',
    workUnits: 128,
  }),
  Object.freeze({
    name: 'recursion/memoFix-cached-defined',
    workUnits: 1,
  }),
  Object.freeze({
    name: 'recursion/memoFix-cached-undefined',
    workUnits: 1,
  }),
  Object.freeze({
    name: 'match/discriminant-data-first',
    workUnits: 1,
  }),
  Object.freeze({
    name: 'match/discriminant-curried',
    workUnits: 1,
  }),
  Object.freeze({ name: 'match/tag-data-first', workUnits: 1 }),
  Object.freeze({ name: 'match/tag-curried', workUnits: 1 }),
  Object.freeze({ name: 'schema/map-sync-success', workUnits: 1 }),
  Object.freeze({ name: 'writer/zip', workUnits: 1 }),
  Object.freeze({ name: 'writer/sequence-128', workUnits: 128 }),
] as const)

export const EXPECTED_THIRD_WAVE_COVERAGE = Object.freeze({
  caseCount: 11,
  caseNamesSha256:
    '5e0e43ad068caf0aa0e9cefe370f51756a4febe3425fa1d7792ddc5cf2099e36',
  projectionSha256:
    'e13fc5e497e357b953319566c43681abb884b588b9427b2a2c4862d8306015cc',
})

export interface ThirdWavePerfPolicy {
  readonly minimumRounds: number
  readonly minimumWarmupRounds: number
  readonly minimumBatchWorkUnits: number
  readonly targetWorkUnitsPerMicroBatch: number
  readonly maximumRme: number
  readonly minimumGeomean: number
  readonly minimumCaseRatio: number
}

export const THIRD_WAVE_PERF_POLICIES = Object.freeze({
  'bun-jsc': Object.freeze({
    minimumRounds: 60,
    minimumWarmupRounds: 30,
    minimumBatchWorkUnits: 100_000,
    targetWorkUnitsPerMicroBatch: 10_000,
    maximumRme: 6,
    minimumGeomean: 0.9,
    minimumCaseRatio: 0.7,
  }),
  'node-v8': Object.freeze({
    minimumRounds: 60,
    minimumWarmupRounds: 100,
    minimumBatchWorkUnits: 100_000,
    targetWorkUnitsPerMicroBatch: 10_000,
    maximumRme: 5,
    minimumGeomean: 0.9,
    minimumCaseRatio: 0.7,
  }),
} satisfies Readonly<
  Record<PerfEngine['id'], ThirdWavePerfPolicy>
>)

export const minimumThirdWaveBatchIterations = (
  workUnits: number,
  policy: Pick<ThirdWavePerfPolicy, 'minimumBatchWorkUnits'>,
): number =>
  minimumPortableBatchIterations(workUnits, {
    minimumBatchInputItems: policy.minimumBatchWorkUnits,
  })
