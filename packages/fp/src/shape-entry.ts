// ShapeEntry: the one canonical mutable cell per execution identity (plan
// shape key, semantic mode, applied-rewrite signature). Every cache layer
// (shape registry itself, pipe's front caches, pipe's identity cache, and
// eventually the tier-2 cache) holds a reference to the same ShapeEntry.
// Nothing may close over a concrete runner function: dispatch always reads
// entry.run at call time, so a tier swap or an eviction is a single field
// write every holder observes immediately. See docs/superpowers/plans/
// 2026-07-21-stopcock-fp-tiered-execution-implementation.md, "Execution
// identity and ownership model".
import type { PortableRunner } from './lower'
import type { PlanShape, StepBinding } from './plan'

export type SemanticMode = 'exact' | 'pure'

/** Tier-2 candidate not yet promoted: recurs at tier 1, tracked until it
 * crosses vector-cache.ts's VECTOR_SIGHTING_THRESHOLD. */
export interface VectorSighting {
  readonly bindings: readonly StepBinding[]
  count: number
}

/** An instantiated tier-2 runner for one exact callback vector. `lastUsed` is
 * a plain monotonic counter (see vector-cache.ts's clock), not an LRU-Map
 * reinsertion: findVectorRunner is on the hot dispatch path, so a touch is
 * one field write, not a Map delete+insert on every call. */
export interface VectorSlot {
  readonly bindings: readonly StepBinding[]
  readonly run: (input: unknown) => unknown
  lastUsed: number
}

/** Which codegen shape this entry's tier-1/2 generation targets: an
 * array-indexed loop (generateShapeRunner) or a for-of-driven loop over an
 * arbitrary Iterable (generateIterableRunner). Folded into the execution
 * identity key so an iterable-sourced Stream chain and an array-backed one
 * over the same opcode sequence never share a ShapeEntry -- their generated
 * code shapes differ, so they can't share a tier. */
export type SourceKind = 'array' | 'iterable'

export interface ShapeEntry {
  /** Current dispatch target. Read at call time; never captured. */
  run: PortableRunner
  /** 0 = portable, 1 = generated (tier 2 lands in W4). */
  tier: number
  readonly sourceKind: SourceKind
  /** Tier-0 fallback. Eviction and demotion both revert run to this. */
  readonly portableRun: PortableRunner
  /** Tier-1/2 generated runner, once one exists. */
  generatedRun: PortableRunner | null
  execCount: number
  consumedElements: number
  /** csp / opt-out / churn / import-failed — an entry never retries once one of these is set. */
  disabledReasons: string[]
  chunkState: 'unloaded' | 'loading' | 'loaded'
  /** The PlanShape this entry lowers, needed to feed the JIT chunk's codegen on promotion. */
  shape: PlanShape | null
  /** False for entries built from a pure-rewrite fusion (top-k, elide-unused-map): those have no
   * PlanShape-faithful codegen path yet, so they stay portable forever. */
  generatable: boolean
  /** Wall-clock time.now() of the last tier-1 generation, or null pre-promotion. */
  generatedAt: number | null
  /** Tier-2 candidates not yet promoted, per vector-cache.ts. Bounded per
   * entry (SIGHTING_CAP); churn that never earns a runner still can't grow
   * this without limit. */
  vectorSightings: VectorSighting[]
  /** Instantiated tier-2 runners for this entry's distinct callback vectors.
   * Bounded globally, not per entry, by vector-cache.ts's 64-entry LRU. */
  vectorRunners: VectorSlot[]
  /** Bare pipe's alternation guard (vector-cache.ts's
   * noteDispatchAndShouldUseTier1): the last vector slot dispatched through
   * this entry, and a saturating, decaying flip counter. Per-entry, not
   * per-call-site, and never a permanent demotion -- explicit
   * compile/compilePure/flow runners never touch this. */
  lastVectorSlot: VectorSlot | null
  vectorFlipCount: number
}

function makeEntry(portableRun: PortableRunner, sourceKind: SourceKind): ShapeEntry {
  return {
    run: portableRun,
    tier: 0,
    sourceKind,
    portableRun,
    generatedRun: null,
    execCount: 0,
    consumedElements: 0,
    disabledReasons: [],
    chunkState: 'unloaded',
    shape: null,
    generatable: false,
    generatedAt: null,
    vectorSightings: [],
    vectorRunners: [],
    lastVectorSlot: null,
    vectorFlipCount: 0,
  }
}

let evictionCount = 0
let demotionCount = 0

export function evictionStats(): { evictions: number; demotions: number } {
  return { evictions: evictionCount, demotions: demotionCount }
}

export function resetEvictionStats(): void {
  evictionCount = 0
  demotionCount = 0
}

/** vector-cache.ts calls this when its global 64-entry LRU evicts a tier-2
 * runner: shares the shape-registry's cacheEvictions counter rather than
 * introducing a second one, since both are "a bounded cache lost an entry". */
export function recordVectorEviction(): void {
  evictionCount++
}

export function executionIdentityKey(
  shapeKey: string,
  mode: SemanticMode,
  rewriteSignature: string,
  sourceKind: SourceKind = 'array',
): string {
  return `${shapeKey}|${mode}|${rewriteSignature}|${sourceKind}`
}

const ENTRY_LIMIT = 256

/** Bounded LRU: keys reinserted on hit to move to the most-recently-used end. */
const entries = new Map<string, ShapeEntry>()

function evictOldest(): void {
  const oldestKey = entries.keys().next().value
  if (oldestKey === undefined) return
  const entry = entries.get(oldestKey)
  entries.delete(oldestKey)
  // Downgrade in place: holders keep the same object reference and keep
  // working against the portable tier once it falls out of the registry.
  if (entry) {
    evictionCount++
    if (entry.tier > 0) demotionCount++
    entry.run = entry.portableRun
    entry.tier = 0
  }
}

/**
 * Looks up the entry for (shapeKey, mode, rewriteSignature), creating it via
 * createPortableRun on miss. Returns hit so callers can drive their own
 * optimizer-stats counters.
 */
export function getOrCreateEntry(
  shapeKey: string,
  mode: SemanticMode,
  rewriteSignature: string,
  createPortableRun: () => PortableRunner,
  sourceKind: SourceKind = 'array',
): { entry: ShapeEntry; hit: boolean } {
  const key = executionIdentityKey(shapeKey, mode, rewriteSignature, sourceKind)
  const cached = entries.get(key)
  if (cached) {
    entries.delete(key)
    entries.set(key, cached)
    return { entry: cached, hit: true }
  }
  const entry = makeEntry(createPortableRun(), sourceKind)
  entries.set(key, entry)
  if (entries.size > ENTRY_LIMIT) evictOldest()
  return { entry, hit: false }
}

export function entryCount(): number {
  return entries.size
}

/** Test-only: look up an entry without creating one, for tier-swap tests. */
export function __lookupEntry(
  shapeKey: string,
  mode: SemanticMode,
  rewriteSignature: string,
  sourceKind: SourceKind = 'array',
): ShapeEntry | undefined {
  return entries.get(executionIdentityKey(shapeKey, mode, rewriteSignature, sourceKind))
}

/** Test-only: force eviction of every entry, downgrading each in place. */
export function __clearEntries(): void {
  for (const entry of entries.values()) {
    evictionCount++
    if (entry.tier > 0) demotionCount++
    entry.run = entry.portableRun
    entry.tier = 0
  }
  entries.clear()
}
