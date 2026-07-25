/**
 * Deprecated compatibility entry.
 *
 * The optimized engine that used to back this subpath now lives in
 * `@stopcock/fp-optimizer`. Rather than leave this specifier broken or make it
 * a hidden forwarder to a package that may not be installed, it resolves to
 * compact fusion: an FP-only install stays complete, and the semantics are the
 * same as every other tier — same results, same callback order, same early-exit
 * counts. Only the throughput differs.
 *
 * @deprecated Import `@stopcock/fp/fusion` for compact fusion, or install
 * `@stopcock/fp-optimizer` for the maximum-throughput tier.
 */
export { compactCompile as compile, compactCompile as compilePure } from './internal/compact-runtime'
export type { Runner } from './fusion'
