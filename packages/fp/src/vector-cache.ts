// Tier-2 identity-vector cache. Tier 2 is a generated runner closing over one
// concrete callback vector (see jit-chunk.ts's generateVectorRunner), giving
// monomorphic, inlinable call sites -- the W2 spike measured 80-87% wins from
// this over a shared, identity-blind tier-1 runner. Keyed by (ShapeEntry,
// exact callback vector); no per-call-site state, no permanent demotion: a
// vector that keeps recurring keeps its runner, churn just misses the cache
// and falls back to tier 1. See docs/superpowers/plans/
// 2026-07-21-stopcock-fp-tiered-execution-implementation.md, "Tier state and
// promotion" and W4.
import type { StepBinding } from './plan'
import { recordVectorEviction, type ShapeEntry, type VectorSlot } from './shape-entry'

export type VectorRunner = (input: unknown) => unknown

/** A vector must recur this many times at tier 1 before it earns a tier-2
 * instantiation. Per the W2 engine spike, a 3rd+ fresh specialization costs
 * ~7-8x re-warm on V8 (JSC penalizes from the 2nd, SpiderMonkey none), so
 * first- and second-sight vectors just run tier 1 -- tier 2 never
 * instantiates on first sight of anything. */
export const VECTOR_SIGHTING_THRESHOLD = 3

/** Per-entry bound on tracked-but-unpromoted vectors: alternating many
 * distinct vectors over one shape shouldn't grow this list without limit
 * even though most of them never cross the threshold. */
const SIGHTING_CAP = 8

/** Global bound on instantiated tier-2 runners across every ShapeEntry. */
const VECTOR_CACHE_LIMIT = 64

function matchesVector(a: readonly StepBinding[], b: readonly StepBinding[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x.fn !== y.fn || x.a1 !== y.a1 || x.a2 !== y.a2 || x.opaqueFn !== y.opaqueFn) return false
  }
  return true
}

// Global bound over instantiated slots, across every ShapeEntry. findVectorRunner
// is on the hot per-call dispatch path once tier 2 is active, so LRU order
// is tracked with a plain monotonic counter on each slot (one field write
// per hit) rather than a Map delete+reinsert: eviction only needs to find
// the minimum, and only does so when the 64-slot cap is actually exceeded,
// scanning at most 65 entries.
const globalSlots = new Map<VectorSlot, ShapeEntry>()
let clock = 0

function touch(slot: VectorSlot): void {
  slot.lastUsed = ++clock
}

function evictLeastRecentlyUsed(): void {
  let oldestSlot: VectorSlot | undefined
  let oldestOwner: ShapeEntry | undefined
  let oldestUsed = Infinity
  for (const [slot, owner] of globalSlots) {
    if (slot.lastUsed < oldestUsed) {
      oldestUsed = slot.lastUsed
      oldestSlot = slot
      oldestOwner = owner
    }
  }
  if (!oldestSlot) return
  globalSlots.delete(oldestSlot)
  if (oldestOwner) {
    const idx = oldestOwner.vectorRunners.indexOf(oldestSlot)
    if (idx >= 0) oldestOwner.vectorRunners.splice(idx, 1)
  }
  recordVectorEviction()
}

function insertSlot(entry: ShapeEntry, bindings: readonly StepBinding[], run: VectorRunner): VectorSlot {
  const slot: VectorSlot = { bindings, run, lastUsed: ++clock }
  entry.vectorRunners.push(slot)
  globalSlots.set(slot, entry)
  if (globalSlots.size > VECTOR_CACHE_LIMIT) evictLeastRecentlyUsed()
  return slot
}

/** Does a tier-2 runner already exist for this exact vector? Touches LRU
 * recency on hit (a single field write). Returns the slot (not just its
 * runner) so callers can track it for alternation bookkeeping; call
 * `hasVectorRunner` instead for a read-only check that doesn't touch LRU. */
export function findVectorSlot(entry: ShapeEntry, bindings: readonly StepBinding[]): VectorSlot | undefined {
  for (const slot of entry.vectorRunners) {
    if (matchesVector(slot.bindings, bindings)) {
      touch(slot)
      return slot
    }
  }
  return undefined
}

export function findVectorRunner(entry: ShapeEntry, bindings: readonly StepBinding[]): VectorRunner | undefined {
  return findVectorSlot(entry, bindings)?.run
}

/** How many consecutive-ish flips (dispatches landing on a *different*
 * vector slot than the last one) before bare pipe stops trusting tier 2 and
 * falls back to the shared tier-1 runner for this entry. Saturating and
 * decremented on every same-slot hit, so it decays: this is per-ShapeEntry
 * state, not per-call-site state (JS has no call-site token for bare pipe,
 * per the ownership model), and not a permanent demotion (a vector that
 * stops alternating recovers automatically once the counter decays back
 * below threshold). */
export const FLIP_SATURATION = 8

/**
 * Bare pipe's alternation guard: call once per dispatch that found a vector
 * slot, with that slot. Returns true when tier 1 should be dispatched
 * instead of the slot's tier-2 runner this time, because recent dispatches
 * have been flipping between vectors enough to make monomorphic-call-site
 * churn (a real, measured V8 cost -- alternating between two compiled
 * closures at one call site is 20-25% slower even with no cache bookkeeping
 * at all) outweigh tier 2's benefit. Explicit compile/compilePure/flow
 * runners never call this: their call site is monomorphic by construction
 * (one fixed vector for the runner's lifetime), so they always dispatch
 * their own vector runner directly once it exists.
 */
export function noteDispatchAndShouldUseTier1(entry: ShapeEntry, slot: VectorSlot): boolean {
  if (entry.lastVectorSlot === slot) {
    if (entry.vectorFlipCount > 0) entry.vectorFlipCount--
  } else {
    entry.lastVectorSlot = slot
    entry.vectorFlipCount = Math.min(entry.vectorFlipCount + 1, FLIP_SATURATION)
  }
  return entry.vectorFlipCount >= FLIP_SATURATION
}

/** Same lookup as findVectorRunner without the LRU touch, for read-only
 * diagnostics (explainRunner) that must not perturb eviction order. */
export function hasVectorRunner(entry: ShapeEntry, bindings: readonly StepBinding[]): boolean {
  for (const slot of entry.vectorRunners) if (matchesVector(slot.bindings, bindings)) return true
  return false
}

/** Explicit runners (compile/compilePure/flow/compileJit): the callback
 * vector is fixed at construction, so building a reusable runner IS the
 * reuse signal -- install directly, no sighting threshold. No-op (returns
 * the existing runner) if a slot already matches this vector; returns
 * undefined if `generate` can't produce one yet (chunk not resident). */
export function registerVectorRunner(
  entry: ShapeEntry,
  bindings: readonly StepBinding[],
  generate: () => VectorRunner | undefined,
): VectorRunner | undefined {
  const existing = findVectorRunner(entry, bindings)
  if (existing) return existing
  const run = generate()
  if (!run) return undefined
  insertSlot(entry, bindings, run)
  return run
}

/** Bare pipe's adaptive path: tracks how many times this exact vector has
 * recurred at tier 1 and, once VECTOR_SIGHTING_THRESHOLD is reached,
 * instantiates a tier-2 runner via `generate`. Returns the new slot once
 * instantiated; undefined while still below threshold, so the caller keeps
 * dispatching through tier 1. */
export function recordSightingAndMaybeGenerateSlot(
  entry: ShapeEntry,
  bindings: readonly StepBinding[],
  generate: () => VectorRunner | undefined,
): VectorSlot | undefined {
  const sightings = entry.vectorSightings
  for (let i = 0; i < sightings.length; i++) {
    const s = sightings[i]
    if (!matchesVector(s.bindings, bindings)) continue
    s.count++
    if (s.count < VECTOR_SIGHTING_THRESHOLD) return undefined
    const run = generate()
    if (!run) return undefined
    sightings.splice(i, 1)
    return insertSlot(entry, bindings, run)
  }
  if (sightings.length >= SIGHTING_CAP) sightings.shift()
  sightings.push({ bindings, count: 1 })
  return undefined
}

/** Total instantiated tier-2 runners across every entry: exposed via
 * getOptimizerStats().vectorRunners and used directly by the churn test to
 * assert generation stays bounded. */
export function activeVectorRunnerCount(): number {
  return globalSlots.size
}

/** Test-only: forget every instantiated tier-2 runner's LRU membership.
 * Per-entry vectorSightings/vectorRunners live on the ShapeEntry itself and
 * are already discarded by shape-entry.ts's __clearEntries. */
export function __resetVectorCache(): void {
  globalSlots.clear()
}
