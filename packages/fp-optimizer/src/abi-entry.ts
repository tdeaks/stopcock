/**
 * Packed optimizer entrypoint.
 *
 * The broad runtime surface remains owned by `index.ts`. This ABI-bound entry
 * deliberately replaces only its legacy self-negotiated identity exports with
 * the optimizer-generated expectation and bank contract. Keeping the boundary
 * here makes the generated compatibility seam independently reviewable.
 */
import { IncompatibleOptimizerError } from '@stopcock/fp/abi'
import {
  evaluateOptimizerCompatibility,
  installedOptimizerCompatibilityFailure,
  optimizerBankIdentity,
  OPTIMIZER_EXPECTED_FP_IDENTITY,
  type OptimizerCompatibilityCandidateV1,
  type OptimizerCompatibilityResultV1,
} from './abi-compatibility'

export * from './index'

export const negotiationFailure: string | undefined = installedOptimizerCompatibilityFailure()

export const abiIdentity = OPTIMIZER_EXPECTED_FP_IDENTITY
export const bankIdentity = optimizerBankIdentity

/**
 * Data-only public compatibility surface for packed/extracted consumer gates.
 * It cannot vet operators, mint provenance, or invoke a runner.
 */
export function evaluateCompatibility(
  candidate: OptimizerCompatibilityCandidateV1,
): OptimizerCompatibilityResultV1 {
  return evaluateOptimizerCompatibility(candidate)
}

/** Throws unless this optimizer and the installed FP agree on identity. */
export function assertCompatible(): void {
  if (negotiationFailure !== undefined) {
    throw new IncompatibleOptimizerError(negotiationFailure)
  }
}

export type {
  OptimizerBankIdentityV1,
  OptimizerCompatibilityCandidateV1,
  OptimizerCompatibilityResultV1,
  OptimizerPlanLayoutV1,
  OptimizerSemanticModeV1,
  OptimizerShapeCandidateV1,
} from './abi-compatibility'
