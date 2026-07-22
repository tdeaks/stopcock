// Default JIT loader graph: the only module that ever imports './jit-chunk',
// and only dynamically. compile.ts reaches this file through the '#jit-loader'
// package import (see package.json "imports"), never through a direct
// relative import, so the portable build can swap in jit-loader-portable.ts
// at the same subpath with zero code changes in compile.ts. See docs/superpowers/plans/
// 2026-07-21-stopcock-fp-tiered-execution-implementation.md, "Portable boundary".
import type { PortableRunner } from './lower'
import type { PlanShape, StepBinding } from './plan'
import type { ShapeEntry } from './shape-entry'

export type ChunkLoadState = 'unloaded' | 'loading' | 'loaded' | 'unavailable'

export type VectorRunner = (input: unknown) => unknown

export interface JitBackend {
  generateShapeRunner(shape: PlanShape): PortableRunner
  generateVectorRunner(shape: PlanShape, bindings: readonly StepBinding[]): VectorRunner
  generateIterableRunner(shape: PlanShape): PortableRunner
  generateIterableVectorRunner(shape: PlanShape, bindings: readonly StepBinding[]): VectorRunner
  probeDynamicCode(): boolean
}

export type EagerGenerationOutcome = 'generated' | 'csp' | 'import-failed' | 'portable-env'

// Read exactly once, at module init, strictly before the loadJitModule below
// can ever fire an import() — this is what makes STOPCOCK_PORTABLE_ONLY a
// pin rather than a per-call check: once this module has been evaluated, the
// dynamic import path is permanently closed off for the process.
const PORTABLE_ENV_PIN: boolean = (() => {
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    const v = proc?.env?.STOPCOCK_PORTABLE_ONLY
    return v != null && v !== '' && v !== '0' && v !== 'false'
  } catch {
    return false
  }
})()

let jitModulePromise: Promise<JitBackend> | undefined
let resolvedJitModule: JitBackend | undefined
let chunkState: ChunkLoadState = 'unloaded'

export function chunkLoadState(): ChunkLoadState {
  return chunkState
}

function loadJitModule(): Promise<JitBackend> {
  if (resolvedJitModule) return Promise.resolve(resolvedJitModule)
  jitModulePromise ??= import('./jit-chunk').then((mod) => {
    resolvedJitModule = mod
    return mod
  })
  chunkState = 'loading'
  return jitModulePromise
}

/** Test-only: forget the memoized dynamic import so a fresh probe/import runs. */
export function __resetJitModuleCache(): void {
  jitModulePromise = undefined
  resolvedJitModule = undefined
  chunkState = 'unloaded'
}

function generateNow(entry: ShapeEntry, mod: JitBackend): boolean {
  if (entry.tier !== 0 || !entry.generatable || entry.shape === null) return false
  entry.generatedRun =
    entry.sourceKind === 'iterable' ? mod.generateIterableRunner(entry.shape) : mod.generateShapeRunner(entry.shape)
  entry.run = entry.generatedRun
  entry.tier = 1
  entry.generatedAt = Date.now()
  entry.chunkState = 'loaded'
  return true
}

/**
 * Requests generation for `entry`. If the chunk is already resident (module
 * loaded, probe already run), generates synchronously. Otherwise kicks off
 * the dynamic import (memoized process-wide) and generates once it settles.
 * Never retries an entry that has already recorded a disable reason —
 * automatic promotion fails silent to portable. `onGenerated` is the caller's
 * stats hook (generations/promotions counters live in compile.ts, not here).
 */
export function ensureGenerated(entry: ShapeEntry, onGenerated?: () => void): void {
  if (!entry.generatable || entry.tier !== 0) return
  if (entry.disabledReasons.length > 0) return

  if (PORTABLE_ENV_PIN) {
    entry.disabledReasons.push('portable-env')
    return
  }

  if (resolvedJitModule) {
    if (resolvedJitModule.probeDynamicCode()) {
      if (generateNow(entry, resolvedJitModule)) onGenerated?.()
    } else {
      chunkState = 'unavailable'
      entry.disabledReasons.push('csp')
    }
    return
  }

  if (entry.chunkState === 'loading') return
  entry.chunkState = 'loading'
  loadJitModule()
    .then((mod) => {
      chunkState = 'loaded'
      if (!mod.probeDynamicCode()) {
        chunkState = 'unavailable'
        entry.chunkState = 'unloaded'
        entry.disabledReasons.push('csp')
        return
      }
      if (generateNow(entry, mod)) onGenerated?.()
    })
    .catch(() => {
      entry.chunkState = 'unloaded'
      entry.disabledReasons.push('import-failed')
    })
}

/**
 * Resolves a tier-2 vector runner for `entry`'s shape and the given exact
 * callback vector, if the chunk is already resident (it must be: tier 2
 * only ever activates once tier 1 has -- see vector-cache.ts's callers).
 * Returns undefined otherwise rather than kicking off an import, since
 * tier-2 instantiation is always driven from a tier-1-generated call path.
 */
export function generateVectorRunnerFor(
  entry: ShapeEntry,
  bindings: readonly StepBinding[],
): VectorRunner | undefined {
  if (!resolvedJitModule || entry.shape === null) return undefined
  return entry.sourceKind === 'iterable'
    ? resolvedJitModule.generateIterableVectorRunner(entry.shape, bindings)
    : resolvedJitModule.generateVectorRunner(entry.shape, bindings)
}

/**
 * Deterministic prewarm for compileJit: awaits the chunk import, probes,
 * and generates synchronously before resolving, so the runner is at tier 1
 * from call one. Returns the outcome instead of throwing so the caller
 * (compileJit) applies its own throw/fallback contract uniformly across
 * csp, import-failed, and the portable-env pin.
 */
export async function generateEagerly(entry: ShapeEntry, onGenerated?: () => void): Promise<EagerGenerationOutcome> {
  if (PORTABLE_ENV_PIN) {
    if (!entry.disabledReasons.includes('portable-env')) entry.disabledReasons.push('portable-env')
    return 'portable-env'
  }

  let jitModule: JitBackend
  try {
    jitModule = await loadJitModule()
  } catch {
    if (!entry.disabledReasons.includes('import-failed')) entry.disabledReasons.push('import-failed')
    return 'import-failed'
  }

  if (!jitModule.probeDynamicCode()) {
    chunkState = 'unavailable'
    if (!entry.disabledReasons.includes('csp')) entry.disabledReasons.push('csp')
    return 'csp'
  }
  chunkState = 'loaded'
  if (generateNow(entry, jitModule)) onGenerated?.()
  return 'generated'
}
