/**
 * Root `pipe`.
 *
 * The fused implementation itself lives in the engine-owned module so that the
 * explicit fusion facades can depend on it directly. They must not depend on
 * this symbol: S8 makes root `pipe` sequential, and a facade pointed here would
 * silently change meaning when it does.
 */
export { pipe } from './internal/fusion-engine'
export { NUM_KEY_BASE, NUM_KEY_MAX_LEN } from './internal/fusion-engine'
