// Portable JIT loader graph: the stopcock-portable export condition maps the
// package-internal '#jit-loader' import here instead of to jit-loader.ts (see
// package.json "imports"). This file has NO import path, static or dynamic,
// to './jit-chunk' — that's the whole point. Every load attempt is rejected
// immediately and the entry stays tier 0 forever, so no bundler, scanner, or
// CSP auditor can find new Function reachable from a portable build. See
// docs/superpowers/plans/2026-07-21-stopcock-fp-tiered-execution-implementation.md,
// "Portable boundary".
import type { StepBinding } from './plan'
import type { ShapeEntry } from './shape-entry'

export type ChunkLoadState = 'unloaded' | 'loading' | 'loaded' | 'unavailable'

export type EagerGenerationOutcome = 'generated' | 'csp' | 'import-failed' | 'portable-env' | 'portable-build'

export function chunkLoadState(): ChunkLoadState {
  return 'unavailable'
}

/** Portable graph: no chunk ever loads, so no vector runner can ever be
 * built either. */
export function generateVectorRunnerFor(
  _entry: ShapeEntry,
  _bindings: readonly StepBinding[],
): ((input: unknown) => unknown) | undefined {
  return undefined
}

export function ensureGenerated(entry: ShapeEntry): void {
  if (!entry.disabledReasons.includes('portable-build')) entry.disabledReasons.push('portable-build')
}

export async function generateEagerly(entry: ShapeEntry): Promise<EagerGenerationOutcome> {
  if (!entry.disabledReasons.includes('portable-build')) entry.disabledReasons.push('portable-build')
  return 'portable-build'
}

export function __resetJitModuleCache(): void {
  // Nothing to reset: this graph never loads a chunk.
}
