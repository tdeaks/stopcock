import type { PerfEngine } from './perf-engine'
import { minimumPortableBatchIterations } from './frozen-reference-contract'

export const EXPECTED_DATA_FUNCTIONAL_SUBJECT_ID = 'stopcock-data-functional-hotpaths-live-v1'

export const EXPECTED_DATA_FUNCTIONAL_SUBJECT_FILES = Object.freeze([
  'packages/fp/src/validation.ts',
  'packages/fp/src/these.ts',
  'packages/fp/src/reader.ts',
  'packages/fp/src/state-fn.ts',
  'packages/fp/src/indexed.ts',
] as const)

export const EXPECTED_DATA_FUNCTIONAL_SUBJECT_SHA256 =
  'f4f409facb32c796ad7ee10f9c521f1a3cb2a5bb09a89c7087d57ee29f006003'

export const EXPECTED_DATA_FUNCTIONAL_BASELINE = Object.freeze({
  id: 'stopcock-data-functional-frozen-before-v1',
  sha256: '1680dfcb40474dffdc4ae69843d0900e074c3c44ac5db478defc1eeecae7bcac',
})

export const EXPECTED_DATA_FUNCTIONAL_CASES = Object.freeze([
  Object.freeze({ name: 'validation/all-success-128', workUnits: 128 }),
  Object.freeze({ name: 'validation/all-mixed-128', workUnits: 128 }),
  Object.freeze({ name: 'validation/all-custom-iterator-128', workUnits: 128 }),
  Object.freeze({ name: 'these/zip-right-right', workUnits: 1 }),
  Object.freeze({ name: 'these/zip-both-both', workUnits: 1 }),
  Object.freeze({ name: 'reader/tap', workUnits: 1 }),
  Object.freeze({ name: 'state/tap', workUnits: 1 }),
  Object.freeze({ name: 'indexed/includes-hit-late-1024', workUnits: 1_024 }),
  Object.freeze({ name: 'indexed/includes-miss-1024', workUnits: 1_024 }),
  Object.freeze({ name: 'indexed/slice-middle-1024', workUnits: 512 }),
  Object.freeze({ name: 'indexed/copy-1024', workUnits: 1_023 }),
] as const)

export const EXPECTED_DATA_FUNCTIONAL_COVERAGE = Object.freeze({
  caseCount: 11,
  caseNamesSha256: '4057d6acd6f285fb032d133a9cdfaecfb564b53e6a4d6654ea6fc8d1b052d1bf',
  projectionSha256: '0c7ecfb784f16263454da1000f4ab76825d1bd2922f1775256613bd4825016c7',
})

export interface DataFunctionalPerfPolicy {
  readonly minimumRounds: number
  readonly minimumWarmupRounds: number
  readonly minimumBatchWorkUnits: number
  readonly targetWorkUnitsPerMicroBatch: number
  readonly maximumRme: number
  readonly minimumGeomean: number
  readonly minimumCaseRatio: number
}

export const DATA_FUNCTIONAL_PERF_POLICIES = Object.freeze({
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
} satisfies Readonly<Record<PerfEngine['id'], DataFunctionalPerfPolicy>>)

export const minimumDataFunctionalBatchIterations = (
  workUnits: number,
  policy: Pick<DataFunctionalPerfPolicy, 'minimumBatchWorkUnits'>,
): number =>
  minimumPortableBatchIterations(workUnits, {
    minimumBatchInputItems: policy.minimumBatchWorkUnits,
  })
