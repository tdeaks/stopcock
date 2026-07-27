/**
 * Compact fusion.
 *
 * Fuses through one generic exact executor rather than a bank of specialized
 * templates. If you build with a bundler, `@stopcock/fp-compiler` compiles
 * the pipeline and leaves no runtime engine at all.
 *
 * Semantics are identical to every other tier: same results, same callback
 * order, same early-exit counts.
 */
export { compactPipe as pipe, compactPipe as fusedPipe } from './internal/compact-runtime'
export { compactFlow as flow, compactFlow as fusedFlow } from './internal/compact-runtime'
export { compactCompile as compile } from './internal/compact-runtime'
/** A compiled pipeline: one input in, one output out. */
export type Runner<Input = unknown, Output = unknown> = (input: Input) => Output
