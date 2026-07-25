/**
 * FusionRunnerDescriptorV1.
 *
 * S10 consolidates runner policy that was spread across portable-template
 * generation, the lowerer, and compile.ts. A descriptor is the single place
 * that says what one generated runner accepts, what it returns, who owns the
 * result, when it stops, and what runs instead when it is not eligible.
 *
 * Data only. No callback, binding, closure, or provenance crosses through a
 * descriptor, and nothing here points at evidence or an emitted artifact —
 * those join in the external sidecar, never in the runtime bank.
 */
import { canonicalJson, hashCanonical } from './operator-v1'

export const FUSION_RUNNER_PROTOCOL = 'stopcock.fusion-runner-descriptor'
export const FUSION_RUNNER_PROTOCOL_VERSION = 1

/** Input layouts a runner will accept. Anything else falls back. */
export type RunnerLayout = 'dense-array' | 'array-like'

/** What the runner produces for one accepted input. */
export type OutputShape = 'array' | 'scalar' | 'option' | 'boolean' | 'index'

/**
 * How the runner stops. `exhaustive` reads every source element;
 * `limit` stops at a caller-supplied count; `predicate` stops on the first
 * element satisfying the sink.
 */
export type Termination = 'exhaustive' | 'limit' | 'predicate'

/**
 * Where a runner is allowed to allocate. `result-only` runners allocate the
 * array they return and nothing else; `none` runners allocate nothing and
 * return a scalar; `scratch` runners hold a bounded intermediate.
 */
export type AllocationScope = 'none' | 'result-only' | 'scratch'

/** Lifetime of any scratch a runner holds. */
export type ScratchClass = 'none' | 'per-call'

/** Stable reasons a runner declines an input. Callers may branch on these. */
export type RejectionCode =
  | 'layout-unsupported'
  | 'arity-mismatch'
  | 'binding-incomplete'
  | 'domain-boundary'

export type BindingSlot = 'fn' | 'a1' | 'a2'

export interface CapabilityPredicate {
  readonly layouts: readonly RunnerLayout[]
  /** Exact number of bound steps the runner consumes, sink included. */
  readonly arity: number
  /**
   * Slots the runner dereferences. Wider than `requiredBindingSlots`: reduce
   * reads `a1` as its seed, and an absent seed is a legitimate `undefined`,
   * not a rejection.
   */
  readonly readsBindingSlots: readonly BindingSlot[]
  /** Slots that must be present. A missing one is `binding-incomplete`. */
  readonly requiredBindingSlots: readonly BindingSlot[]
  readonly rejectionCodes: readonly RejectionCode[]
}

export interface FusionRunnerDescriptorV1 {
  readonly protocol: typeof FUSION_RUNNER_PROTOCOL
  readonly protocolVersion: typeof FUSION_RUNNER_PROTOCOL_VERSION
  /** Identity of the semantic manifest this runner's opcode sequence is read against. */
  readonly semanticManifestHash: string
  /** Identity of the bank this runner belongs to. A runner ID alone means nothing. */
  readonly bankHash: string
  readonly runnerId: string
  /** Exact opcode sequence, sink last where there is one. */
  readonly semanticSequence: readonly number[]
  readonly mode: 'exact'
  readonly capability: CapabilityPredicate
  readonly outputShape: OutputShape
  /** `one-to-one` preserves length; `filtering` may shrink; `folding` collapses. */
  readonly cardinality: 'one-to-one' | 'filtering' | 'folding' | 'expanding'
  readonly termination: Termination
  /** True when the runner realizes an array rather than folding to a scalar. */
  readonly materializes: boolean
  /**
   * `sum-materializer` runners fuse a stream segment across the boundary that
   * would otherwise realize an intermediate array. Everything else stays
   * inside one segment.
   */
  readonly domainBoundary: 'none' | 'sum-materializer'
  /**
   * True when the runner reports exact elements consumed through `meta`. Only
   * meaningful for the segment reading the caller's source; downstream
   * segments read an already-realized array and are never passed `meta`.
   */
  readonly reportsConsumed: boolean
  readonly resultOwnership: 'fresh' | 'borrowed'
  /** True when the result may alias the input. Every current runner is non-aliasing. */
  readonly aliasesInput: boolean
  readonly allocationScope: AllocationScope
  readonly scratchClass: ScratchClass
  /** What executes when the capability predicate rejects. */
  readonly fallbackRunnerId: string
}

/** The generic stage machine. Always complete, always eligible, never generated. */
export const GENERIC_FALLBACK_ID = 'fusion-runner/generic-exact'

/**
 * Runner IDs are derived, not stored: the bank already carries the opcode
 * sequence, and charging the optimized budget for a string per entry to say
 * what the opcodes already say is not worth 4 KB.
 */
export const fusionRunnerId = (family: 'array' | 'sink', key: string): string =>
  `fusion-runner/${family}/${key}`

/** A descriptor minus everything that is or derives from an identity. */
export type DescriptorBody = Omit<
  FusionRunnerDescriptorV1,
  'protocol' | 'protocolVersion' | 'bankHash' | 'semanticManifestHash'
>

/**
 * Bank identity over the runner set. Excludes each descriptor's own identity
 * fields so neither hash is self-referential.
 */
export const bankProjection = (
  descriptors: readonly DescriptorBody[],
): unknown =>
  descriptors
    .map((descriptor) => {
      const { runnerId, ...rest } = descriptor
      return { runnerId, body: rest }
    })
    .sort((a, b) => (a.runnerId < b.runnerId ? -1 : a.runnerId > b.runnerId ? 1 : 0))

export const bankHashOf = (
  descriptors: readonly DescriptorBody[],
): string => hashCanonical(bankProjection(descriptors))

/** Descriptor identity, excluding its own identity fields. */
export const descriptorHashOf = (descriptor: FusionRunnerDescriptorV1): string => {
  const { bankHash: _bank, semanticManifestHash: _semantic, ...rest } = descriptor
  return hashCanonical(rest)
}

export { canonicalJson }
