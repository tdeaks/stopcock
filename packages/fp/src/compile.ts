// Root compilation API: compile/compilePure/explainPipeline/optimizer stats.
// Plans and binds once at compile time; the returned runner dispatches on
// input domain at first call and caches the lowered shape executor in a
// bounded LRU. See docs/superpowers/plans/
// 2026-07-21-stopcock-fp-absolute-performance-implementation.md,
// "Compilation API" and "Runtime caches and tiering".
import { OP_SORT, OP_SORT_ASC, OP_SORT_BY, OP_SORT_DESC, OP_SORT_INLINE, OP_TAKE, OP_LENGTH, OP_MAP } from './opcodes'
import { type OpCode, type OpDomain } from './registry'
import { buildPlan, planShapeKey, type BoundStep, type PlanShape, type SegmentShape, type StepBinding } from './plan'
import { lowerShape, lowerIterableShape, segmentExecutorKinds, type ConsumeMeta, type PortableRunner } from './lower'
import {
  entryCount,
  evictionStats,
  getOrCreateEntry,
  resetEvictionStats,
  type SemanticMode,
  type ShapeEntry,
  type SourceKind,
} from './shape-entry'
import {
  activeVectorRunnerCount,
  findVectorSlot,
  hasVectorRunner,
  noteDispatchAndShouldUseTier1,
  recordSightingAndMaybeGenerateSlot,
  registerVectorRunner,
  __resetVectorCache,
} from './vector-cache'
// The loader is reached only through the '#jit-loader' package-internal
// import (see package.json "imports"): the default condition resolves to
// jit-loader.ts, which is the only module with an import path (dynamic) to
// './jit-chunk'. A stopcock-portable build resolves this same specifier to
// jit-loader-portable.ts instead, which has no path to jit-chunk.ts at all.
// compile.ts never knows which graph it's in. See docs/superpowers/plans/
// 2026-07-21-stopcock-fp-tiered-execution-implementation.md, "Portable boundary".
import {
  chunkLoadState,
  ensureGenerated as loaderEnsureGenerated,
  generateEagerly,
  generateVectorRunnerFor,
  __resetJitModuleCache as loaderResetJitModuleCache,
  type ChunkLoadState,
} from '#jit-loader'

export type Runner = (input: unknown) => unknown

export interface PureRewrite {
  readonly kind: 'top-k' | 'elide-unused-map' | 'early-stop'
  readonly description: string
}

export interface PipelineExplanation {
  readonly domains: readonly OpDomain[]
  readonly segments: readonly SegmentShape[]
  readonly materializationBoundaries: readonly number[]
  readonly semantics: 'exact' | 'pure'
  readonly executor: 'portable'
  readonly segmentExecutors: readonly ('template' | 'generic')[]
  readonly appliedRewrites: readonly PureRewrite[]
}

export type { ChunkLoadState }

export interface OptimizerStats {
  readonly plansBuilt: number
  readonly lowerings: number
  readonly shapeCacheHits: number
  readonly shapeCacheMisses: number
  readonly shapeCacheSize: number
  readonly generations: number
  readonly promotions: number
  readonly demotions: number
  readonly cacheEvictions: number
  readonly chunkLoadState: ChunkLoadState
  /** Tier-2 vector runners currently live, across every ShapeEntry (bounded
   * globally at 64, see vector-cache.ts). */
  readonly vectorRunners: number
}

let plansBuilt = 0
let lowerings = 0
let shapeCacheHits = 0
let shapeCacheMisses = 0
let generations = 0
let promotions = 0

export function getOptimizerStats(): Readonly<OptimizerStats> {
  const { evictions, demotions } = evictionStats()
  return Object.freeze({
    plansBuilt,
    lowerings,
    shapeCacheHits,
    shapeCacheMisses,
    shapeCacheSize: entryCount(),
    generations,
    promotions,
    demotions,
    cacheEvictions: evictions,
    chunkLoadState: chunkLoadState(),
    vectorRunners: activeVectorRunnerCount(),
  })
}

export function resetOptimizerStats(): void {
  plansBuilt = 0
  lowerings = 0
  shapeCacheHits = 0
  shapeCacheMisses = 0
  generations = 0
  promotions = 0
  resetEvictionStats()
  __resetVectorCache()
}

export { __resetVectorCache }

/**
 * Resolves the canonical ShapeEntry for (shape, mode, rewriteSignature),
 * creating it via lowerShape (or the given factory, for pure-rewrite
 * fusions) on miss. Centralizes plansBuilt/lowerings/shapeCache bookkeeping.
 */
function shapeEntryFor(
  shape: PlanShape,
  mode: SemanticMode,
  rewriteSignature: string,
  createPortableRun?: () => PortableRunner,
  sourceKind: SourceKind = 'array',
): ShapeEntry {
  const key = planShapeKey(shape)
  const { entry, hit } = getOrCreateEntry(
    key,
    mode,
    rewriteSignature,
    () => {
      lowerings++
      return createPortableRun ? createPortableRun() : lowerShape(shape)
    },
    sourceKind,
  )
  if (hit) shapeCacheHits++
  else shapeCacheMisses++
  // Only the plain (unrewritten) identity has a PlanShape-faithful codegen
  // path today: top-k and elide-unused-map fuse a custom closure that
  // doesn't correspond 1:1 with the shape's segments, so those entries stay
  // portable forever (generatable: false) rather than have the JIT chunk
  // silently regenerate the unoptimized version underneath them.
  entry.shape = shape
  entry.generatable = rewriteSignature === 'none'
  return entry
}

// --- Tiered promotion: shared by bare pipe (adaptive, threshold-gated) and
// compile/compilePure/flow/compileJit (eager, triggered at construction or
// deterministically awaited). See the ownership model in the plan doc: the
// chunk import is memoized process-wide, but generation is per ShapeEntry.
const PROMOTE_EXECUTIONS = 8
const PROMOTE_ELEMENTS = 4096

/** Test-only: forget the memoized dynamic import so a fresh probe/import runs. */
export function __resetJitModuleCache(): void {
  loaderResetJitModuleCache()
}

function ensureGenerated(entry: ShapeEntry, onGenerated?: () => void): void {
  loaderEnsureGenerated(entry, () => {
    generations++
    promotions++
    onGenerated?.()
  })
}

/** Bare pipe's dispatch path. Increments per-entry execution/consumed-element
 * counters and, once a threshold is crossed, requests promotion. Skipped
 * entirely once an entry is already tier >= 1 or not generatable, so the
 * promoted hot path pays zero bookkeeping cost. Once tier >= 1, dispatches
 * through the tier-2 vector cache: an exact-vector hit runs the monomorphic
 * runner directly, UNLESS recent dispatches through this entry have been
 * flipping between different vectors enough that tier 1 is faster (see
 * vector-cache.ts's noteDispatchAndShouldUseTier1 -- alternating between two
 * compiled closures at one call site is a real, measured V8 cost). A miss
 * records a sighting and falls back to the shared tier-1 runner meanwhile.
 * Only bare pipe calls this: compile/compilePure/flow/compileJit runners use
 * explicitDispatch below, which is never subject to the flip guard, since
 * their call site is monomorphic by construction. */
export function dispatchAndTrack(entry: ShapeEntry, data: unknown, bindings: readonly StepBinding[]): unknown {
  if (entry.tier === 0) {
    if (!entry.generatable) return entry.run(data, bindings)
    const meta: ConsumeMeta = { consumed: 0 }
    const result = entry.run(data, bindings, meta)
    entry.execCount++
    entry.consumedElements += meta.consumed
    if (entry.execCount >= PROMOTE_EXECUTIONS || entry.consumedElements >= PROMOTE_ELEMENTS) {
      ensureGenerated(entry)
    }
    return result
  }

  const slot = findVectorSlot(entry, bindings)
  if (slot) {
    // Steady state fast path: this call site has been landing on the same
    // vector with no recent flips (flip count already decayed to 0), so
    // noteDispatchAndShouldUseTier1 would just re-confirm "same slot, count
    // stays 0, don't fall back" -- skip the call and its comparisons
    // entirely. Any actual flip (different slot, or a nonzero decaying
    // count) still goes through the real bookkeeping below.
    if (entry.lastVectorSlot === slot && entry.vectorFlipCount === 0) return slot.run(data)
    if (noteDispatchAndShouldUseTier1(entry, slot)) return entry.run(data, bindings)
    return slot.run(data)
  }
  const generatedSlot = recordSightingAndMaybeGenerateSlot(entry, bindings, () => generateVectorRunnerFor(entry, bindings))
  if (generatedSlot) {
    if (noteDispatchAndShouldUseTier1(entry, generatedSlot)) return entry.run(data, bindings)
    return generatedSlot.run(data)
  }
  return entry.run(data, bindings)
}

/** compile/compilePure/flow/compileJit's dispatch path: the runner's
 * callback vector is fixed for its whole lifetime, so its call site is
 * monomorphic by construction once tier 2 lands -- unlike bare pipe, it
 * never consults the alternation guard (there's nothing to alternate
 * between). Falls back to dispatchAndTrack (tier-0 promotion bookkeeping)
 * until tier 1 has landed. */
function explicitDispatch(entry: ShapeEntry, data: unknown, bindings: readonly StepBinding[]): unknown {
  if (entry.tier >= 1) {
    const slot = findVectorSlot(entry, bindings)
    if (slot) return slot.run(data)
    return entry.run(data, bindings)
  }
  return dispatchAndTrack(entry, data, bindings)
}

/** compile/compilePure/flow/compileJit: building a reusable runner is itself
 * the reuse signal, so tier 2 instantiates directly for this runner's fixed
 * vector -- no sighting threshold, unlike bare pipe's adaptive path. Safe to
 * call before the chunk is resident (generateVectorRunnerFor no-ops until
 * tier 1 has landed); the eager tier-1 request above always fires first. */
function instantiateVectorEagerly(entry: ShapeEntry, bindings: readonly StepBinding[]): void {
  if (entry.tier < 1) return
  registerVectorRunner(entry, bindings, () => generateVectorRunnerFor(entry, bindings))
}

/** compile/compilePure/flow: building a reusable runner is itself the reuse
 * signal, so request generation up front instead of waiting on thresholds.
 * Once tier 1 lands (synchronously if the chunk is already resident, or
 * once the dynamic import settles), tier 2 follows immediately for this
 * runner's one fixed vector. */
function triggerEagerGeneration(entry: ShapeEntry, bindings: readonly StepBinding[]): void {
  ensureGenerated(entry, () => instantiateVectorEagerly(entry, bindings))
  if (entry.tier >= 1) instantiateVectorEagerly(entry, bindings)
}

/**
 * Used by pipe()'s opcode-keyed fast path: builds a Plan and resolves its
 * ShapeEntry without going through buildPortable's pure-rewrite checks
 * (pipe() never runs in pure mode, so mode is always 'exact').
 */
export function planAndLowerFast(steps: readonly unknown[]): {
  readonly entry: ShapeEntry
  readonly bindings: readonly StepBinding[]
} {
  const plan = buildPlan(steps)
  plansBuilt++
  const entry = shapeEntryFor(plan.shape, 'exact', 'none')
  return { entry, bindings: plan.bindings }
}

/**
 * Test-only: resolves the ShapeEntry a given step list would dispatch
 * through, without incurring a real pipe()/compile() call. Used to verify
 * the ownership model — swapping entry.run here must be observed by every
 * cache that holds the same entry.
 */
export function __shapeEntryForSteps(steps: readonly unknown[], mode: SemanticMode = 'exact'): ShapeEntry {
  const plan = buildPlan(steps)
  return shapeEntryFor(plan.shape, mode, 'none')
}

/**
 * Stream's entry point into the same ShapeEntry/tier machinery pipe() and
 * compile() use, for a plan already built from Stream's persistent node
 * chain (see plan.ts's buildPlanFromOps and stream.ts). Bare-Stream
 * terminals (toArray/reduce/... on an array-backed Stream) dispatch through
 * dispatchAndTrack against the returned entry, same adaptive promotion as
 * bare pipe.
 */
export function resolveStreamEntry(shape: PlanShape): ShapeEntry {
  plansBuilt++
  return shapeEntryFor(shape, 'exact', 'none')
}

/**
 * Stream's entry point for an iterable-sourced (non-array, early-termination)
 * chain: same ShapeEntry/tier machinery as resolveStreamEntry, but keyed with
 * the 'iterable' source-kind discriminator (see shape-entry.ts's
 * executionIdentityKey) so it never collides with the array-backed entry for
 * the same opcode sequence, and its tier-0 portable runner is the iterable
 * push loop (lowerIterableShape) rather than the array-indexed one.
 */
export function resolveIterableStreamEntry(shape: PlanShape): ShapeEntry {
  plansBuilt++
  return shapeEntryFor(shape, 'exact', 'none', () => lowerIterableShape(shape), 'iterable')
}

/**
 * Stream.compile's entry point: building a reusable Iterable-to-Stream
 * function is itself the reuse signal, so this requests tier-1/2
 * generation eagerly for the entry Stream's own cache already resolved —
 * the same way compile()/compilePure() do via triggerEagerGeneration.
 */
export function triggerStreamEagerGeneration(entry: ShapeEntry, bindings: readonly StepBinding[]): void {
  triggerEagerGeneration(entry, bindings)
}

export type { BoundStep }

function domainsOf(shape: PlanShape): readonly OpDomain[] {
  return shape.segments.map((s) => s.domain)
}

function boundaryIndexes(shape: PlanShape): readonly number[] {
  const out: number[] = []
  for (const seg of shape.segments) if (seg.kind === 'boundary') out.push(seg.startIndex)
  return out
}

/**
 * Detects a sort boundary (sort/sortBy/sortAsc/sortDesc) immediately
 * followed by a stream segment whose only op is take, and returns the
 * take count. Used by compilePure to lower sort+take into bounded stable
 * top-k instead of a full sort.
 */
function findSortThenTake(
  codes: readonly OpCode[],
  segments: readonly SegmentShape[],
): { sortSegIndex: number; takeSegIndex: number; takeCount: number } | undefined {
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]
    const next = segments[i + 1]
    if (seg.kind !== 'boundary') continue
    const op = codes[seg.startIndex]
    if (op !== OP_SORT && op !== OP_SORT_ASC && op !== OP_SORT_DESC && op !== OP_SORT_BY && op !== OP_SORT_INLINE)
      continue
    if (next.kind !== 'stream' || next.length !== 1) continue
    if (codes[next.startIndex] !== OP_TAKE) continue
    return { sortSegIndex: i, takeSegIndex: i + 1, takeCount: -1 }
  }
  return undefined
}

/**
 * Detects a stream segment made entirely of one-to-one map/tap steps
 * immediately followed by a length boundary: the mapped values can never
 * affect a count, so the map stage is elided.
 */
function findElidableMapBeforeLength(
  codes: readonly OpCode[],
  segments: readonly SegmentShape[],
): number | undefined {
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]
    const next = segments[i + 1]
    if (seg.kind !== 'stream') continue
    if (next.kind !== 'boundary' || codes[next.startIndex] !== OP_LENGTH) continue
    let allMap = true
    for (let j = 0; j < seg.length; j++) {
      if (codes[seg.startIndex + j] !== OP_MAP) {
        allMap = false
        break
      }
    }
    if (allMap) return i
  }
  return undefined
}

function stableTopK(
  data: readonly unknown[],
  cmp: (a: unknown, b: unknown) => number,
  k: number,
): unknown[] {
  const kk = Math.max(0, k)
  if (kk === 0) return []
  const buf: unknown[] = []
  for (let i = 0; i < data.length; i++) {
    const v = data[i]
    if (buf.length === kk && cmp(v, buf[kk - 1]) >= 0) continue
    let lo = 0
    let hi = buf.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cmp(buf[mid], v) <= 0) lo = mid + 1
      else hi = mid
    }
    buf.splice(lo, 0, v)
    if (buf.length > kk) buf.pop()
  }
  return buf
}

function defaultNumericCmp(a: unknown, b: unknown): number {
  return (a as number) - (b as number)
}

function buildPortable(shape: PlanShape, bindings: readonly StepBinding[], pure: boolean): {
  run: (input: unknown) => unknown
  rewrites: PureRewrite[]
  entry: ShapeEntry
} {
  const rewrites: PureRewrite[] = []

  if (pure) {
    const sortTake = findSortThenTake(shape.codes, shape.segments)
    if (sortTake) {
      const sortSeg = shape.segments[sortTake.sortSegIndex]
      const takeSeg = shape.segments[sortTake.takeSegIndex]
      const sortOp = shape.codes[sortSeg.startIndex]
      const sortBinding = bindings[sortSeg.startIndex]
      const takeBinding = bindings[takeSeg.startIndex]
      const preSegments = shape.segments.slice(0, sortTake.sortSegIndex)
      const postSegments = shape.segments.slice(sortTake.takeSegIndex + 1)
      const preRunners = preSegments.map((seg) => lowerShape({ codes: shape.codes, segments: [seg] }))
      const postRunners = postSegments.map((seg) => lowerShape({ codes: shape.codes, segments: [seg] }))
      rewrites.push({
        kind: 'top-k',
        description: 'sort followed by take lowered to bounded stable top-k with source-index tie-break',
      })
      const fusedRun = (input: unknown): unknown => {
        let data: unknown = input
        for (const r of preRunners) data = r(data, bindings)
        const cmp: (a: unknown, b: unknown) => number =
          sortOp === OP_SORT_BY || sortOp === OP_SORT_INLINE
            ? (sortBinding.fn as (a: unknown, b: unknown) => number)
            : sortOp === OP_SORT_DESC
              ? (a, b) => defaultNumericCmp(b, a)
              : defaultNumericCmp
        const k = takeBinding.fn as number
        data = stableTopK(data as readonly unknown[], cmp, k)
        for (const r of postRunners) data = r(data, bindings)
        return data
      }
      const entry = shapeEntryFor(shape, 'pure', 'top-k', () => (input) => fusedRun(input))
      return { run: (input) => entry.run(input, bindings), rewrites, entry }
    }

    const elidable = findElidableMapBeforeLength(shape.codes, shape.segments)
    if (elidable !== undefined) {
      // elidable + 1 is the OP_LENGTH boundary segment itself: both the map
      // stream segment and the length boundary are subsumed by data.length.
      const preSegments = shape.segments.slice(0, elidable)
      const postSegments = shape.segments.slice(elidable + 2)
      const preRunners = preSegments.map((seg) => lowerShape({ codes: shape.codes, segments: [seg] }))
      const postRunners = postSegments.map((seg) => lowerShape({ codes: shape.codes, segments: [seg] }))
      rewrites.push({
        kind: 'elide-unused-map',
        description: 'map stage elided: only a downstream length depends on this segment',
      })
      const fusedRun = (input: unknown): unknown => {
        let data: unknown = input
        for (const r of preRunners) data = r(data, bindings)
        let result: unknown = (data as readonly unknown[]).length
        for (const r of postRunners) result = r(result, bindings)
        return result
      }
      const entry = shapeEntryFor(shape, 'pure', 'elide-unused-map', () => (input) => fusedRun(input))
      return { run: (input) => entry.run(input, bindings), rewrites, entry }
    }
  }

  const entry = shapeEntryFor(shape, pure ? 'pure' : 'exact', 'none')
  return { run: (input) => explicitDispatch(entry, input, bindings), rewrites, entry }
}

export function toArrayInput(input: unknown): unknown {
  if (Array.isArray(input)) return input
  if (input != null && typeof input === 'object' && Symbol.iterator in (input as object)) {
    return Array.from(input as Iterable<unknown>)
  }
  return input
}

/** What explainRunner needs: the ShapeEntry plus the one fixed callback
 * vector this particular runner was built with, since a shape's tier-2
 * status is per vector, not per entry (a bare-pipe call site sharing the
 * same shape with a different vector may or may not be at tier 2). */
interface RunnerRecord {
  readonly entry: ShapeEntry
  readonly bindings: readonly StepBinding[]
}

// Runner -> RunnerRecord, for explainRunner. Only compile/compilePure/flow
// and compileJit runners are attached: those are the stable, reusable
// runner objects the plan calls out explicitly; bare pipe() never returns a
// runner to the caller, so its live tier is inspected through explainSteps
// instead.
const runnerEntries = new WeakMap<Runner, RunnerRecord>()

function compileInternal(pure: boolean, steps: readonly unknown[]): Runner {
  // Single-op collapse: one step can never fuse with anything, so the tagged
  // (or opaque) function itself already IS the eager data-first kernel --
  // dispatch straight to it with zero plan/shape/lowering machinery. Keeps
  // plansBuilt bookkeeping consistent with the multi-step path without
  // paying for it.
  if (steps.length === 1) {
    plansBuilt++
    const fn = steps[0] as (input: unknown) => unknown
    return (input: unknown) => fn(toArrayInput(input))
  }
  const plan = buildPlan(steps)
  plansBuilt++
  const { run, entry } = buildPortable(plan.shape, plan.bindings, pure)
  // Building a reusable runner is itself the reuse signal: request tier-1
  // generation now rather than waiting on bare pipe's execution thresholds.
  triggerEagerGeneration(entry, plan.bindings)
  const runner: Runner = (input: unknown) => run(toArrayInput(input))
  runnerEntries.set(runner, { entry, bindings: plan.bindings })
  return runner
}

export function compile(...steps: readonly unknown[]): Runner {
  return compileInternal(false, steps)
}

export function compilePure(...steps: readonly unknown[]): Runner {
  return compileInternal(true, steps)
}

export class JitUnavailableError extends Error {
  constructor(message = 'compileJit: dynamic code generation is unavailable in this environment') {
    super(message)
    this.name = 'JitUnavailableError'
  }
}

export interface JitCompileOptions {
  readonly assumePure?: boolean
  readonly onUnavailable?: 'throw' | 'fallback'
}

/**
 * Legacy shape kept for the test hook below: `promoted` reports tier >= 1.
 * Real state lives on the ShapeEntry now (see the ownership model); this is
 * a read-only projection of it.
 */
interface JitRunnerState {
  execCount: number
  processedCount: number
  promoted: boolean
}

/** Test-only: inspect a compileJit (or compile/compilePure) runner's tiering state without touching execution. */
export function __getJitRunnerState(runner: Runner): Readonly<JitRunnerState> | undefined {
  const record = runnerEntries.get(runner)
  if (!record) return undefined
  const { entry } = record
  return { execCount: entry.execCount, processedCount: entry.consumedElements, promoted: entry.tier >= 1 }
}

function isJitOptions(value: unknown): value is JitCompileOptions {
  return typeof value === 'object' && value !== null
}

/** A synthetic, unregistered ShapeEntry for explainRunner's benefit only — the
 * single-op fast path below never plans, lowers, or generates anything, so
 * there is nothing for the real shape registry to own. Reported as tier 1
 * because there is no faster tier: generated code cannot beat calling the
 * tagged op's own eager kernel directly. */
function singleOpEntry(): ShapeEntry {
  const noop: PortableRunner = () => undefined
  return {
    run: noop,
    tier: 1,
    sourceKind: 'array',
    portableRun: noop,
    generatedRun: null,
    execCount: 0,
    consumedElements: 0,
    disabledReasons: [],
    chunkState: 'unloaded',
    shape: null,
    generatable: false,
    generatedAt: Date.now(),
    vectorSightings: [],
    vectorRunners: [],
    lastVectorSlot: null,
    vectorFlipCount: 0,
  }
}

/**
 * Dynamically imports the internal JIT chunk once (memoized process-wide),
 * then deterministically generates tier-1 code before resolving: the
 * returned runner dispatches to generated code from call one, no gradual
 * promotion, no separate warm-up. When dynamic code is unavailable,
 * onUnavailable: 'throw' (the default) rejects with JitUnavailableError and
 * 'fallback' resolves to the portable compile() runner instead. Either way
 * the shared ShapeEntry records the outcome, so bare pipe() and compile()
 * calls against the same shape see it too.
 *
 * Single-step pipelines never go through plan/codegen at all, same as
 * compile()'s single-op collapse: one step can't fuse with anything, so
 * dispatching straight to its own eager kernel already IS the fastest tier
 * codegen could produce, without a chunk import or a generation pass.
 */
export function compileJit(options: JitCompileOptions, ...steps: readonly unknown[]): Promise<Runner>
export function compileJit(...steps: readonly unknown[]): Promise<Runner>
export async function compileJit(optionsOrFirstStep?: unknown, ...rest: readonly unknown[]): Promise<Runner> {
  const hasOptions = isJitOptions(optionsOrFirstStep)
  const options: JitCompileOptions = hasOptions ? (optionsOrFirstStep as JitCompileOptions) : {}
  const steps = hasOptions || optionsOrFirstStep === undefined ? rest : [optionsOrFirstStep, ...rest]
  const onUnavailable = options.onUnavailable ?? 'throw'
  const assumePure = options.assumePure ?? false

  if (steps.length === 1) {
    plansBuilt++
    const fn = steps[0] as (input: unknown) => unknown
    const runner: Runner = (input: unknown) => fn(toArrayInput(input))
    runnerEntries.set(runner, { entry: singleOpEntry(), bindings: [] })
    return runner
  }

  const plan = buildPlan(steps)
  plansBuilt++
  const { run: portableRun, entry } = buildPortable(plan.shape, plan.bindings, assumePure)
  const fallbackRunner: Runner = (input: unknown) => portableRun(toArrayInput(input))

  // Deterministic prewarm: awaits the chunk import and generates now,
  // synchronously, so the runner is at tier 1 from the very first call —
  // this is what an explicit await compileJit buys over bare pipe's
  // eventual, threshold-gated promotion. The outcome uniformly covers
  // import-failed, csp, and the portable-env pin: any non-'generated'
  // outcome falls through to the same throw/fallback contract.
  const outcome = await generateEagerly(entry, () => {
    generations++
    promotions++
  })
  if (outcome !== 'generated') {
    if (onUnavailable === 'fallback') return fallbackRunner
    throw new JitUnavailableError()
  }
  // Same reuse signal as compile()/compilePure(): this runner's vector is
  // fixed at construction, so tier 2 follows tier 1 immediately.
  instantiateVectorEagerly(entry, plan.bindings)

  const runner: Runner = (input: unknown) => explicitDispatch(entry, toArrayInput(input), plan.bindings)
  runnerEntries.set(runner, { entry, bindings: plan.bindings })
  return runner
}

export function explainPipeline(...steps: readonly unknown[]): PipelineExplanation {
  const plan = buildPlan(steps)
  const { rewrites } = buildPortable(plan.shape, plan.bindings, true)
  return Object.freeze({
    domains: domainsOf(plan.shape),
    segments: plan.shape.segments,
    materializationBoundaries: boundaryIndexes(plan.shape),
    semantics: rewrites.length > 0 ? 'pure' : 'exact',
    executor: 'portable',
    segmentExecutors: segmentExecutorKinds(plan.shape),
    appliedRewrites: Object.freeze(rewrites),
  })
}

export interface RunnerExplanation {
  readonly tier: number
  readonly execCount: number
  readonly consumedElements: number
  readonly chunkState: 'unloaded' | 'loading' | 'loaded'
  readonly disabledReasons: readonly string[]
  readonly generatedAt: number | null
}

/** `vectorActive` reports whether the concrete callback vector at hand has
 * its own tier-2 runner right now: entry.tier alone can't say this, since a
 * shape at tier 1 may have some of its recurring vectors promoted to tier 2
 * and others not. */
function explainEntry(entry: ShapeEntry, vectorActive: boolean): RunnerExplanation {
  return Object.freeze({
    tier: vectorActive ? 2 : entry.tier,
    execCount: entry.execCount,
    consumedElements: entry.consumedElements,
    chunkState: entry.chunkState,
    disabledReasons: Object.freeze([...entry.disabledReasons]),
    generatedAt: entry.generatedAt,
  })
}

/**
 * Live truth for a real runner returned by compile/compilePure/flow or
 * compileJit: current tier (2 once this runner's own fixed callback vector
 * has earned a vector-cache slot), promotion counters, chunk state,
 * generation timestamp, disable reasons. Unlike explainPipeline (static
 * eligibility only), this reflects what the runner is actually doing right
 * now.
 */
export function explainRunner(runner: Runner): RunnerExplanation {
  const record = runnerEntries.get(runner)
  if (!record) {
    throw new Error('explainRunner: not a compile/compilePure/flow/compileJit runner (or it has been garbage collected)')
  }
  return explainEntry(record.entry, hasVectorRunner(record.entry, record.bindings))
}

/**
 * Resolves the live ShapeEntry for the shape `steps` would dispatch through
 * — the same identity bare pipe(...) uses for these steps — and reports its
 * current tier. Unlike explainRunner, this doesn't need a saved runner
 * reference: it looks up whichever entry is canonical for the shape right
 * now, reflecting however pipe() has been exercising it elsewhere. There is
 * no single concrete callback vector to check here (pipe's call sites each
 * have their own), so this only ever reports tier 0 or 1 — inspect a
 * specific bare-pipe call site's tier-2 status through explainRunner on a
 * compile/compilePure/flow runner built with the same steps instead.
 */
export function explainSteps(...steps: readonly unknown[]): RunnerExplanation {
  const entry = __shapeEntryForSteps(steps, 'exact')
  return explainEntry(entry, false)
}
