/**
 * OptimizerAbiV1 — the internal boundary between `@stopcock/fp` and
 * `@stopcock/fp-optimizer`.
 *
 * This is not the public operator SDK. It exists so one other Stopcock package
 * can execute a pipeline FP has already authenticated, and it is deliberately
 * narrow:
 *
 *   - Provenance stays inside FP. `vetPipeline` authenticates each step against
 *     FP's module-private registry and returns only vetted, call-local data.
 *     A public `_op` tag authorizes nothing here, exactly as it authorizes
 *     nothing anywhere else.
 *   - Nothing executable belonging to FP crosses. The optimizer receives
 *     opcodes, segment shapes, and the caller's bindings for this one call.
 *   - The optimizer cannot register an operator, mint a semantic fact, read
 *     FP's private registry, or upgrade evidence status. There is no export
 *     here that would let it, and none may be added.
 *
 * The graph is one-way. FP never imports, depends on, or peers on the
 * optimizer; the optimizer declares an exact peer on FP and imports this
 * module. Exact peer ranges are necessary but not sufficient, so identity is
 * negotiated by hash at runtime as well — see `OPTIMIZER_ABI_IDENTITY`.
 */
import { SEMANTIC_MANIFEST_HASH } from './internal/abi-identity.generated'
import { buildCompactPlan } from './internal/compact/plan'
import { interpret } from './interpret'
import { extractBinding as extractPlanBinding } from './plan'
import type { BoundPlan, ConsumeMeta, PlanShape, SegmentShape, StepBinding } from './plan'
import type { OpCode, OpDomain } from './registry'
import { trustedOperatorEntry } from './internal/provenance'

/** Incremented when the shape of anything below changes. */
export const OPTIMIZER_ABI_VERSION = 1
/** Incremented when opcode meanings change, independently of the ABI shape. */
export const OPTIMIZER_PROTOCOL_VERSION = 1

/**
 * Identity the two sides negotiate before a specialized runner is invoked.
 * A mismatch on any field means the optimizer must not run: its runners were
 * generated against a different set of facts than this FP is enforcing.
 */
export interface OptimizerAbiIdentityV1 {
  readonly abiVersion: number
  readonly protocolVersion: number
  /** Identity of the semantic manifest this FP's opcodes are read against. */
  readonly semanticManifestHash: string
}

export const OPTIMIZER_ABI_IDENTITY: OptimizerAbiIdentityV1 = Object.freeze({
  abiVersion: OPTIMIZER_ABI_VERSION,
  protocolVersion: OPTIMIZER_PROTOCOL_VERSION,
  semanticManifestHash: SEMANTIC_MANIFEST_HASH,
})

/**
 * A pipeline FP has authenticated, reduced to data.
 *
 * `bindings` holds the caller's callbacks for this call only. Neither side
 * retains it: FP builds it per call and the optimizer must not cache it, or a
 * later call with different callbacks would run against stale ones.
 */
export interface VettedPlanV1 {
  readonly identity: OptimizerAbiIdentityV1
  readonly codes: readonly number[]
  readonly segments: readonly SegmentShape[]
  readonly bindings: readonly StepBinding[]
  /** Exact semantics. Reserved so a future mode cannot be assumed away. */
  readonly mode: 'exact'
  /** Input layouts FP guarantees for this plan. */
  readonly layout: 'dense-array'
  /** True when every step authenticated. A false here must not be specialized. */
  readonly fullyTrusted: boolean
}

/**
 * Authenticates a pipeline and reduces it to ABI data.
 *
 * Every step is checked against the private provenance table. An untrusted
 * step does not fail the call — it becomes an opaque step in the plan, exactly
 * as it does for FP's own tiers — but it does clear `fullyTrusted`, and the
 * optimizer is required to treat that as ineligible for specialization.
 */
export function vetPipeline(steps: readonly unknown[]): VettedPlanV1 {
  const plan = buildCompactPlan(steps)
  return Object.freeze({
    identity: OPTIMIZER_ABI_IDENTITY,
    codes: plan.shape.codes,
    segments: plan.shape.segments,
    bindings: plan.bindings,
    mode: 'exact',
    layout: 'dense-array',
    fullyTrusted: steps.every((step) => trustedOperatorEntry(step) !== undefined),
  } as const)
}

/**
 * The exact fallback. This is the same executor FP's own compact tier runs, so
 * a plan the optimizer declines is not a degraded answer — only a slower one.
 */
export function runExactFallback(plan: VettedPlanV1, input: unknown): unknown {
  return interpret({ shape: { codes: plan.codes, segments: plan.segments }, bindings: plan.bindings }, input)
}

/** Raised when an install pairs incompatible FP and optimizer builds. */
export class IncompatibleOptimizerError extends Error {
  constructor(reason: string) {
    super(
      `@stopcock/fp-optimizer is not compatible with this @stopcock/fp build: ${reason}. ` +
        'Install matching versions of both packages.',
    )
    this.name = 'IncompatibleOptimizerError'
  }
}

/**
 * Compares a negotiated identity field by field. Returns the mismatch reason,
 * or undefined when the two agree.
 *
 * Structural duck-typing is deliberately not attempted: an optimizer built
 * against different facts may still present the right shape.
 */
export function negotiate(candidate: OptimizerAbiIdentityV1): string | undefined {
  if (candidate.abiVersion !== OPTIMIZER_ABI_VERSION) {
    return `ABI version ${candidate.abiVersion} != ${OPTIMIZER_ABI_VERSION}`
  }
  if (candidate.protocolVersion !== OPTIMIZER_PROTOCOL_VERSION) {
    return `protocol version ${candidate.protocolVersion} != ${OPTIMIZER_PROTOCOL_VERSION}`
  }
  if (candidate.semanticManifestHash !== OPTIMIZER_ABI_IDENTITY.semanticManifestHash) {
    return 'semantic manifest hash differs'
  }
  return undefined
}

/**
 * One authenticated operator, reduced to data.
 *
 * This is the whole of what provenance yields across the boundary. The private
 * table itself never leaves FP, there is no way to add to it from here, and an
 * operator carrying a forged public tag produces `undefined` exactly as it does
 * inside FP.
 */
export interface VettedOperatorV1 {
  readonly op: number
  readonly fn?: unknown
  readonly a1?: unknown
  readonly a2?: unknown
}

/**
 * Authenticates a single step. Returns undefined for anything FP did not
 * construct, which the caller must treat as opaque.
 *
 * Kept separate from `vetPipeline` because the optimizer's hot path needs to
 * classify steps one at a time to build its dispatch key, and forcing it
 * through a whole-plan build to do so would cost more than the dispatch saves.
 */
export function vetOperator(step: unknown): VettedOperatorV1 | undefined {
  return trustedOperatorEntry(step)
}

/**
 * Extracts call-local bindings without letting a callable's public metadata
 * become execution authority. Optimizer fixed-arity paths normally pass the
 * already-vetted private entry. The callable form exists for the fifth-slot
 * compatibility path and is authenticated again before any binding is read.
 */
export function extractBinding(entry: VettedOperatorV1 | unknown): StepBinding {
  if (typeof entry === 'function') {
    const trusted = trustedOperatorEntry(entry)
    return trusted === undefined ? {} : extractPlanBinding(trusted)
  }
  if (entry === null || typeof entry !== 'object') return {}
  return extractPlanBinding(entry as VettedOperatorV1)
}

// Opcodes, semantic facts, shape analysis, and the boundary sort kernels are
// protocol and pure algorithm, not policy. They are re-exported so the
// optimizer reads the same facts FP enforces rather than keeping a second copy
// that could drift.
export * from './opcodes'
export {
  CARD_MATERIALIZER,
  CARD_SINK,
  compactCardinality,
  compactDomain,
  isCompactRegistered,
} from './internal/compact/facts.generated'
export {
  boundaryIndexes,
  domainsOf,
  findElidableMapBeforeLength,
  findSortThenTake,
  pureRewrites,
  type PureRewrite,
} from './internal/plan-analysis'
export { mergeSortAsc, mergeSortBy, mergeSortDesc } from './sort-kernel'
export { planShapeKey } from './plan'
// Cache control for cross-package differential tests. Not public API: the
// public entries deliberately expose no cache handle.
export { resetCompactCache } from './internal/compact-runtime'
// The compact-tier explanation, so the optimizer can answer `segmentExecutors`
// against its own bank without importing a public subpath. Everything the
// optimizer needs from FP arrives through this one module.
export { explain, explainPure, type PipelineExplanation } from './internal/explain'
export { interpret } from './interpret'
export type { BoundPlan, ConsumeMeta, OpCode, OpDomain, PlanShape, SegmentShape, StepBinding }
