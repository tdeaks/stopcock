/**
 * The optimizer-owned half of the FP ABI contract.
 *
 * Do not import FP's identity constant here. Doing that would compare an FP
 * installation with itself and make a split/duplicate install look healthy.
 * These values are generated-release facts baked into this optimizer build;
 * the evaluator below compares supplied data only and has no provenance or
 * execution authority.
 */
import {
  vetPipeline,
  type BoundPlan,
  type OptimizerAbiIdentityV1,
  type VettedPlanV1,
} from '@stopcock/fp/abi'
import { OPTIMIZER_ABI_EXPECTATIONS } from './abi-expectations.generated'
import { OPTIMIZER_BANK_IDENTITY } from './bank-identity.generated'

export type OptimizerSemanticModeV1 = 'exact' | 'pure'
export type OptimizerPlanLayoutV1 = 'dense-array'

/** The FP ABI this optimizer release was compiled and tested against. */
export const OPTIMIZER_EXPECTED_FP_IDENTITY: OptimizerAbiIdentityV1 = Object.freeze({
  ...OPTIMIZER_ABI_EXPECTATIONS.fpIdentity,
})

// This is intentionally captured from the FP module this optimizer imports,
// rather than represented by a caller-supplied package/version string. A
// duplicate physical FP instance has a distinct opaque token and cannot make
// its plan eligible merely by describing itself as the primary instance.
const INSTALLED_FP_BOUNDARY = vetPipeline([]) as {
  readonly instanceToken?: object
  readonly identity: OptimizerAbiIdentityV1
}
const OPTIMIZER_EXPECTED_FP_INSTANCE_TOKEN = INSTALLED_FP_BOUNDARY.instanceToken

/**
 * Identity of the checked-in portable runner bank. This is intentionally
 * independent of the generated module imported above, so a stale or swapped
 * generated bank fails closed instead of negotiating with itself.
 */
export interface OptimizerBankIdentityV1 {
  readonly schemaVersion: number
  readonly bankHash: string
  readonly semanticManifestHash: string
  readonly runnerCount: number
}

export const OPTIMIZER_EXPECTED_BANK_IDENTITY: OptimizerBankIdentityV1 = Object.freeze({
  ...OPTIMIZER_ABI_EXPECTATIONS.optimizerBank,
})

/** Runtime projection of this installed optimizer's bank. */
export const optimizerBankIdentity: OptimizerBankIdentityV1 = Object.freeze({
  schemaVersion: OPTIMIZER_BANK_IDENTITY.schemaVersion,
  bankHash: OPTIMIZER_BANK_IDENTITY.bankHash,
  semanticManifestHash: OPTIMIZER_BANK_IDENTITY.semanticManifestHash,
  runnerCount: OPTIMIZER_BANK_IDENTITY.runnerCount,
})

export interface OptimizerShapeCandidateV1 {
  readonly codes: readonly number[]
  readonly segments: readonly {
    readonly kind: string
    readonly domain: string
    readonly startIndex: number
    readonly length: number
  }[]
  readonly bindingCount: number
}

/** A data-only compatibility request. Supplying this cannot mint trust. */
export interface OptimizerCompatibilityCandidateV1 {
  /** Opaque token emitted only by FP's vetPipeline for this physical module. */
  readonly fpInstanceToken: object | undefined
  readonly fpIdentity: OptimizerAbiIdentityV1
  readonly optimizerBank: OptimizerBankIdentityV1
  readonly requestedMode: OptimizerSemanticModeV1
  readonly planMode: OptimizerSemanticModeV1
  readonly layout: string
  readonly fullyTrusted: boolean
  readonly shape: OptimizerShapeCandidateV1
}

export type OptimizerCompatibilityResultV1 =
  | Readonly<{ readonly eligible: true }>
  | Readonly<{ readonly eligible: false; readonly reason: string }>

const eligible = (): OptimizerCompatibilityResultV1 => Object.freeze({ eligible: true })
const fallback = (reason: string): OptimizerCompatibilityResultV1 =>
  Object.freeze({ eligible: false, reason })

/**
 * The optimizer retains FP's complete authenticated boundary alongside the
 * lowerer's `shape` view. Specialized execution must never reconstruct these
 * facts from public operator fields.
 */
export type OptimizerBoundPlanV1 = VettedPlanV1 & BoundPlan

export function buildOptimizerPlan(
  steps: readonly unknown[],
  mode: OptimizerSemanticModeV1 = 'exact',
): OptimizerBoundPlanV1 {
  // Coordinated source checks can run before FP's declaration bundle has been
  // refreshed. The source ABI accepts this optional mode; retain the narrow
  // local call view until the release build refreshes the packed declaration.
  const vetted = (
    vetPipeline as (
      pipeline: readonly unknown[],
      semanticMode?: OptimizerSemanticModeV1,
    ) => VettedPlanV1
  )(steps, mode)
  return Object.freeze({
    ...vetted,
    shape: Object.freeze({ codes: vetted.codes, segments: vetted.segments }),
    bindings: vetted.bindings,
  })
}

/** Converts an authenticated FP plan to data for the optimizer-owned gate. */
export function compatibilityCandidateForPlan(
  plan: OptimizerBoundPlanV1,
  requestedMode: OptimizerSemanticModeV1,
): OptimizerCompatibilityCandidateV1 {
  return Object.freeze({
    fpInstanceToken: plan.instanceToken,
    fpIdentity: plan.identity,
    optimizerBank: optimizerBankIdentity,
    requestedMode,
    planMode: plan.mode,
    layout: plan.layout,
    fullyTrusted: plan.fullyTrusted,
    shape: {
      codes: plan.shape.codes,
      segments: plan.shape.segments,
      bindingCount: plan.bindings.length,
    },
  })
}

/** The one optimizer execution decision for an authenticated plan. */
export function evaluatePlanCompatibility(
  plan: OptimizerBoundPlanV1,
  requestedMode: OptimizerSemanticModeV1,
): OptimizerCompatibilityResultV1 {
  return evaluateOptimizerCompatibility(compatibilityCandidateForPlan(plan, requestedMode))
}

function sameIdentity(
  actual: OptimizerAbiIdentityV1,
  expected: OptimizerAbiIdentityV1,
): string | undefined {
  if (actual.abiVersion !== expected.abiVersion) return 'FP ABI version differs'
  if (actual.protocolVersion !== expected.protocolVersion) return 'FP protocol version differs'
  if (actual.semanticManifestHash !== expected.semanticManifestHash)
    return 'FP semantic manifest hash differs'
  if (actual.runnerSchemaHash !== expected.runnerSchemaHash) return 'FP runner schema hash differs'
  if (actual.bindingSchemaHash !== expected.bindingSchemaHash)
    return 'FP binding schema hash differs'
  if (actual.consumeSchemaHash !== expected.consumeSchemaHash)
    return 'FP consume schema hash differs'
  if (actual.executionContractHash !== expected.executionContractHash)
    return 'FP execution contract hash differs'
  return undefined
}

function sameBank(actual: OptimizerBankIdentityV1): string | undefined {
  if (actual.schemaVersion !== OPTIMIZER_EXPECTED_BANK_IDENTITY.schemaVersion)
    return 'optimizer bank schema version differs'
  if (actual.bankHash !== OPTIMIZER_EXPECTED_BANK_IDENTITY.bankHash)
    return 'optimizer bank hash differs'
  if (actual.semanticManifestHash !== OPTIMIZER_EXPECTED_BANK_IDENTITY.semanticManifestHash)
    return 'optimizer bank semantic manifest hash differs'
  if (actual.runnerCount !== OPTIMIZER_EXPECTED_BANK_IDENTITY.runnerCount)
    return 'optimizer bank runner count differs'
  return undefined
}

function validShape(shape: OptimizerShapeCandidateV1): string | undefined {
  if (
    !Number.isSafeInteger(shape.bindingCount) ||
    shape.bindingCount < 0 ||
    shape.codes.some((code) => !Number.isSafeInteger(code) || code < 0)
  ) {
    return 'unsupported or malformed opcode shape'
  }
  if (shape.codes.length !== shape.bindingCount)
    return 'shape binding count differs from opcode count'
  let nextIndex = 0
  for (const segment of shape.segments) {
    if (
      (segment.kind !== 'stream' && segment.kind !== 'boundary' && segment.kind !== 'opaque') ||
      (segment.domain !== 'array' &&
        segment.domain !== 'scalar' &&
        segment.domain !== 'iterable') ||
      !Number.isSafeInteger(segment.startIndex) ||
      !Number.isSafeInteger(segment.length) ||
      segment.length <= 0 ||
      segment.startIndex !== nextIndex ||
      segment.startIndex + segment.length > shape.codes.length
    ) {
      return 'unsupported or malformed plan shape'
    }
    nextIndex += segment.length
  }
  if (nextIndex !== shape.codes.length) return 'plan segments do not cover its opcode shape'
  return undefined
}

/**
 * Deterministically decides whether a supplied, already-vetted plan may reach
 * a specialized runner. It deliberately has no FP imports beyond types: this
 * is a pure data gate, not a second provenance system.
 */
export function evaluateOptimizerCompatibility(
  candidate: OptimizerCompatibilityCandidateV1,
): OptimizerCompatibilityResultV1 {
  if (candidate.fpInstanceToken !== OPTIMIZER_EXPECTED_FP_INSTANCE_TOKEN)
    return fallback('FP module instance differs')
  const identityFailure = sameIdentity(candidate.fpIdentity, OPTIMIZER_EXPECTED_FP_IDENTITY)
  if (identityFailure !== undefined) return fallback(identityFailure)

  const bankFailure = sameBank(candidate.optimizerBank)
  if (bankFailure !== undefined) return fallback(bankFailure)
  if (candidate.optimizerBank.semanticManifestHash !== candidate.fpIdentity.semanticManifestHash)
    return fallback('optimizer bank and FP semantic manifests differ')

  if (candidate.requestedMode !== candidate.planMode)
    return fallback('requested semantic mode differs from vetted plan mode')
  if (candidate.layout !== 'dense-array') return fallback('unsupported input layout')
  if (!candidate.fullyTrusted) return fallback('plan contains opaque or foreign provenance')

  const shapeFailure = validShape(candidate.shape)
  if (shapeFailure !== undefined) return fallback(shapeFailure)
  return eligible()
}

/** The FP facts captured from the physical module this optimizer imported. */
export interface InstalledFpBoundaryV1 {
  readonly instanceToken: object | undefined
  readonly identity: OptimizerAbiIdentityV1
}

/**
 * Installed-pair comparison, factored so qualification can prove that an
 * actual captured FP identity — not the optimizer's expected identity — is
 * what determines the import-time disposition.
 */
export function evaluateInstalledOptimizerPair(
  fp: InstalledFpBoundaryV1,
  bank: OptimizerBankIdentityV1 = optimizerBankIdentity,
): OptimizerCompatibilityResultV1 {
  return evaluateOptimizerCompatibility({
    fpInstanceToken: fp.instanceToken,
    fpIdentity: fp.identity,
    optimizerBank: bank,
    requestedMode: 'exact',
    planMode: 'exact',
    layout: 'dense-array',
    fullyTrusted: true,
    shape: { codes: [], segments: [], bindingCount: 0 },
  })
}

const INSTALLED_PAIR_RESULT = evaluateInstalledOptimizerPair({
  instanceToken: INSTALLED_FP_BOUNDARY.instanceToken,
  identity: INSTALLED_FP_BOUNDARY.identity,
})

/** Whether the installed generated bank still agrees with this optimizer build. */
export function installedOptimizerCompatibilityFailure(): string | undefined {
  return INSTALLED_PAIR_RESULT.eligible ? undefined : INSTALLED_PAIR_RESULT.reason
}
