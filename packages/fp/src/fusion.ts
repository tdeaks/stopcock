/**
 * Compact fusion.
 *
 * Fuses through one generic exact executor rather than a bank of specialized
 * templates. It is honestly size-first: smaller than optimized fusion and
 * slower than it. If you want the fastest fused execution, import
 * `@stopcock/fp/fusion/optimized`; if you build with a bundler,
 * `@stopcock/fp-compiler` beats both and leaves no runtime engine at all.
 *
 * Semantics are identical to every other tier: same results, same callback
 * order, same early-exit counts.
 */
export { compactPipe as pipe, compactPipe as fusedPipe } from './internal/compact-runtime'
export { compactFlow as flow, compactFlow as fusedFlow } from './internal/compact-runtime'
export { compactCompile as compile } from './internal/compact-runtime'
export type { Runner } from './compile'
