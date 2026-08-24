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
  // Re-pinned: emitter.ts's opcodes import (packages/fp/src/opcodes.ts,
  // deleted by the one-runtime-path plan) became a local frozen snapshot of
  // the same numbers. The emitter's own logic is unchanged.
  sha256: '2e4166aab334b2b208ec86d18ab2952b91cdc8ca856543cfa3d9acdeae496a59',
})

/**
 * Candidate runtime provenance. The digest is computed by hashing each
 * repository-relative path, a NUL separator, its bytes, and another NUL
 * separator in this exact order.
 *
 * One-runtime-path plan: the compact fusion engine (plan builder, cache,
 * pure-rewrite analysis, provenance, opcodes, registry) is gone. `compile()`
 * is now a plain alias over `internal/sequential.ts`, which is the exact
 * executor the corpus measures today.
 */
export const EXPECTED_PORTABLE_SUBJECT = Object.freeze({
  id: 'stopcock-portable-runtime-source-v1',
  files: Object.freeze([
    'packages/fp/src/array.ts',
    'packages/fp/src/compile.ts',
    'packages/fp/src/dual.ts',
    'packages/fp/src/internal/sequential.ts',
    'packages/fp/src/number.ts',
    'packages/fp/src/option.ts',
    'packages/fp/src/sort-kernel.ts',
  ] as const),
  // Re-pinned 2026-08-24 (twice): src/array.ts regenerated with dual
  // emission (2026-08-24-dual-performance-first.md Phase 1), then again
  // when the inline threshold tightened to 64 chars after the dual-parity
  // gate's quiet-machine take reading. Curried closures are byte-identical
  // to the single-form emission throughout; only factory headers and the
  // data-first dispatch branch changed.
  sha256: 'a78ba9e3616184366d33c892e051cb6ad99e01403cac601f46fbe1b306635380',
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
