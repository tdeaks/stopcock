/**
 * Optimized fusion.
 *
 * Identical to `@stopcock/fp/fusion` today, and deliberately a separate entry:
 * S10 gives it its own runner, and consumers who name it now do not have to
 * change their imports then.
 */
export { pipe, pipe as fusedPipe } from './internal/fusion-engine'
export { flow, flow as fusedFlow } from './internal/fusion-flow'
export { compile, compilePure, type Runner } from './compile'

// Engine-bound diagnostics. They live here rather than in `/fusion/debug`
// because they cannot be answered without the engine, and pairing them with
// the static `explain` surface dragged this chunk into compact consumers.
export {
  explainRunner,
  getOptimizerStats,
  resetOptimizerStats,
  type OptimizerStats,
  type RunnerExplanation,
} from './compile'
