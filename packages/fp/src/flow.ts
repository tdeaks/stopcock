/**
 * Root `flow`. The fused implementation lives in the engine-owned module; see
 * `./pipe` for why a facade must not depend on this symbol.
 */
export { flow } from './internal/fusion-flow'
