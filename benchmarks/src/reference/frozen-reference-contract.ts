/**
 * Reviewable identities for the frozen corpus and reference emitter that
 * the compiler-parity gate (and the shared batch-iteration policy below)
 * measure against. Shared across several perf-contract files, not owned by
 * any one gate.
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
  sha256: '92d755aab0e5fc60b14f0c6d18029340fcb3e9a40a7f7aaf61bf559c95d8c8c7',
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
    // The compact tier's plan builder and cache: the exact executor the
    // corpus actually measures, now that fp is the only runtime package.
    'packages/fp/src/internal/compact-runtime.ts',
    'packages/fp/src/internal/compact/plan.ts',
    // Rewrite policy that compile.ts used to hold inline. Part of the executed
    // runtime, so the frozen subject has to cover it.
    'packages/fp/src/internal/plan-analysis.ts',
    'packages/fp/src/internal/provenance.ts',
    'packages/fp/src/number.ts',
    'packages/fp/src/opcodes.ts',
    'packages/fp/src/option.ts',
    'packages/fp/src/plan.ts',
    'packages/fp/src/registry.ts',
    'packages/fp/src/sort-kernel.ts',
  ] as const),
  sha256: '50be3b76910da3d1d30141b5489e1d37d4181b3ccba02cd62bc51959b3a578e6',
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
