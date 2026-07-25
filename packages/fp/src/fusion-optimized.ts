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
