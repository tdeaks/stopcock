/**
 * `@stopcock/fp-optimizer` — the maximum-throughput tier for `@stopcock/fp`.
 *
 * Opt-in by construction. `@stopcock/fp` has no dependency or optional peer on
 * this package; installing FP alone gives you a complete sequential, compact,
 * and compiler product. You install and import this deliberately, and the only
 * thing you get for it is speed on the shapes it covers.
 *
 * The graph is one-way: this package declares an exact peer on FP and imports
 * FP's versioned ABI. FP never imports this package.
 *
 * Identity is negotiated before any specialized runner is invoked. An install
 * pairing mismatched builds executes no fused runner — it routes to FP's exact
 * executor or raises `IncompatibleOptimizerError`. Matching version ranges are
 * necessary but not sufficient, so the check is on hashes, not on ranges.
 */
import { negotiate, OPTIMIZER_ABI_IDENTITY, IncompatibleOptimizerError } from '@stopcock/fp/abi'
import { OPTIMIZER_BANK_IDENTITY } from './bank-identity.generated'

/**
 * Negotiated once, at import. A mismatch here means these runners were
 * generated against different semantic facts than the installed FP enforces,
 * which is not something to discover mid-pipeline.
 */
export const negotiationFailure: string | undefined = negotiate(OPTIMIZER_ABI_IDENTITY)

export const abiIdentity = OPTIMIZER_ABI_IDENTITY
export const bankIdentity = OPTIMIZER_BANK_IDENTITY

/** Throws unless this optimizer and the installed FP agree on identity. */
export function assertCompatible(): void {
  if (negotiationFailure !== undefined) {
    throw new IncompatibleOptimizerError(negotiationFailure)
  }
}

export { pipe, pipe as fusedPipe } from './fusion-engine'
export { flow, flow as fusedFlow } from './fusion-flow'
export {
  compile,
  compilePure,
  explainRunner,
  getOptimizerStats,
  resetOptimizerStats,
  type OptimizerStats,
  type Runner,
  type RunnerExplanation,
} from './compile'
export {
  beginSelectionTrace,
  endSelectionTrace,
  type SelectionEvent,
  type SelectionKind,
} from './selection-trace'
export { IncompatibleOptimizerError }
