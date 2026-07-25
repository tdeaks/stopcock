/**
 * Reviewable identities for the portable performance comparison.
 *
 * Raw SHA-256 values deliberately pin the exact checked-in bytes. A corpus or
 * reference-emitter edit must therefore update this contract in the same
 * change instead of silently moving the release-gate denominator.
 */
export const EXPECTED_PORTABLE_CORPUS = Object.freeze({
  id: 'stopcock-portable-stratified-w0b-v1',
  version: 1,
  caseCount: 44,
  sha256: '5bf73c23dd62e46c2a686649e6de20f7328f758be96da4f1bcbf0a56f9378549',
})

export const EXPECTED_FROZEN_EMITTER = Object.freeze({
  id: 'stopcock-reference-emitter-w0a-v1',
  sha256: '2010e33a2e61657b3f9d1e728fa66a6c18412966274154207a2c21514220ff71',
})

/**
 * Candidate runtime provenance. The digest is computed by hashing each
 * repository-relative path, a NUL separator, its bytes, and another NUL
 * separator in this exact order.
 */
export const EXPECTED_PORTABLE_SUBJECT = Object.freeze({
  id: 'stopcock-portable-runtime-source-v1',
  files: Object.freeze([
    'packages/fp/src/array.ts',
    'packages/fp/src/compile.ts',
    'packages/fp/src/dual.ts',
    'packages/fp/src/interpret.ts',
    'packages/fp/src/lower.ts',
    'packages/fp/src/number.ts',
    'packages/fp/src/opcodes.ts',
    'packages/fp/src/option.ts',
    'packages/fp/src/plan.ts',
    'packages/fp/src/portable-templates.ts',
    'packages/fp/src/registry.ts',
    'packages/fp/src/shape-entry.ts',
    'packages/fp/src/sort-kernel.ts',
  ] as const),
  sha256: 'c06af859a53091b4cf17d633b52541efbfa861f3d73934356341c39ba5b7d066',
})

export interface PortableBatchPolicy {
  readonly minimumBatchInputItems: number
}

/**
 * Give every paired timing sample a useful amount of work based on source
 * elements actually consumed. This keeps an immediate early exit and a
 * never-matching full scan equally bounded instead of blindly executing a
 * 100k-element scan thousands of times.
 */
export const minimumPortableBatchIterations = (
  consumedInputItems: number,
  policy: PortableBatchPolicy,
): number => {
  if (!Number.isSafeInteger(consumedInputItems) || consumedInputItems <= 0) return 0
  const nominalInputBatch = Math.ceil(
    policy.minimumBatchInputItems / consumedInputItems,
  )
  return Math.max(
    1,
    nominalInputBatch,
    // Ten-call medium-size and single-call large samples remained vulnerable
    // to optimizer and GC phase changes on both engines. Fifty medium calls
    // or three 100k-element calls keep samples bounded while making bootstrap
    // intervals reproducible.
    consumedInputItems <= 10_000 ? 50 : 3,
  )
}
