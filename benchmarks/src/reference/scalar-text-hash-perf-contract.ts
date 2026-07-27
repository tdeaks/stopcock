import type { PerfEngine } from './perf-engine'

export const EXPECTED_SCALAR_TEXT_HASH_SUBJECT_ID = 'stopcock-scalar-text-hash-hotpaths-live-v1'

export const EXPECTED_SCALAR_TEXT_HASH_SUBJECT_FILES = Object.freeze([
  'packages/fp/src/string.ts',
  'packages/fp/src/number.ts',
  'packages/fp/src/eq.ts',
  'packages/fp/src/hash.ts',
] as const)

export const EXPECTED_SCALAR_TEXT_HASH_SUBJECT_SHA256 =
  'a83084728509f7f105a702ea5de6a400522453a2dac27924c63a5412ca3b729e'

export const EXPECTED_SCALAR_TEXT_HASH_BASELINE = Object.freeze({
  id: 'stopcock-scalar-text-hash-frozen-before-v1',
  sha256: 'a1827cbfc0d48221d84aa6f31d76549229962efab3c626e66b8d271e2c1a5028',
})

export const EXPECTED_SCALAR_TEXT_HASH_CASES = Object.freeze([
  Object.freeze({ name: 'string/camel-case-mixed-256', workUnits: 256 }),
  Object.freeze({ name: 'string/title-case-unicode-256', workUnits: 256 }),
  Object.freeze({ name: 'string/code-point-length-4096', workUnits: 4_096 }),
  Object.freeze({ name: 'number/gcd-large', workUnits: 1 }),
  Object.freeze({ name: 'number/round-to-curried', workUnits: 1 }),
  Object.freeze({ name: 'eq/deep-equal-primitive', workUnits: 1 }),
  Object.freeze({ name: 'eq/deep-equal-record-32', workUnits: 32 }),
  Object.freeze({ name: 'hash/number-prefix', workUnits: 1 }),
  Object.freeze({ name: 'hash/struct-16', workUnits: 16 }),
  Object.freeze({ name: 'hash/unknown-array-128', workUnits: 128 }),
  Object.freeze({ name: 'hash/unknown-record-64', workUnits: 64 }),
] as const)

export const EXPECTED_SCALAR_TEXT_HASH_COVERAGE = Object.freeze({
  caseCount: 11,
  caseNamesSha256: 'bd1c62f4e0c5262797954d75b4078683931647ca65de8ffa0add0e4a5c1a25f8',
  projectionSha256: '4efd357f119e53cefbb362a2fe3633b7bd49d04a2173e4ccee08eacb29a2f3fa',
})

export interface ScalarTextHashPerfPolicy {
  readonly minimumRounds: number
  readonly minimumWarmupRounds: number
  readonly minimumBatchWorkUnits: number
  readonly targetWorkUnitsPerMicroBatch: number
  readonly maximumRme: number
  readonly minimumGeomean: number
  readonly minimumCaseRatio: number
}

export const SCALAR_TEXT_HASH_PERF_POLICIES = Object.freeze({
  'bun-jsc': Object.freeze({
    minimumRounds: 60,
    minimumWarmupRounds: 30,
    minimumBatchWorkUnits: 100_000,
    targetWorkUnitsPerMicroBatch: 10_000,
    maximumRme: 6,
    minimumGeomean: 0.95,
    minimumCaseRatio: 0.75,
  }),
  'node-v8': Object.freeze({
    minimumRounds: 60,
    minimumWarmupRounds: 100,
    minimumBatchWorkUnits: 100_000,
    targetWorkUnitsPerMicroBatch: 10_000,
    maximumRme: 5,
    minimumGeomean: 0.95,
    minimumCaseRatio: 0.75,
  }),
} satisfies Readonly<Record<PerfEngine['id'], ScalarTextHashPerfPolicy>>)

export const minimumScalarTextHashBatchIterations = (
  workUnits: number,
  minimumBatchWorkUnits: number,
): number => Math.max(1, Math.ceil(minimumBatchWorkUnits / workUnits))
