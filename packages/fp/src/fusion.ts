/**
 * Explicit fusion.
 *
 * Root `pipe` and `flow` fuse automatically today, and in 2.0 they stop. This
 * entry is the stable way to ask for fusion and keep getting it: it delegates
 * to the engine-owned module, never to the root symbols, so it means the same
 * thing before and after that change.
 *
 * `@stopcock/fp/fusion` and `@stopcock/fp/fusion/optimized` are the same
 * implementation today. They are separate entries so a consumer can commit to
 * one now and not have to move later, when optimized fusion becomes its own
 * runner.
 */
export { pipe, pipe as fusedPipe } from './internal/fusion-engine'
export { flow, flow as fusedFlow } from './internal/fusion-flow'
export { compile, compilePure, type Runner } from './compile'
