/**
 * Explicit fusion entry.
 *
 * There is no separate fused runtime any more: `pipe`/`flow` here are the
 * same sequential, left-to-right functions as root `@stopcock/fp`. The only
 * real fusion left in the package is `@stopcock/fp-compiler`, which lowers a
 * recognised `pipe`/`flow`/`compile` call at build time regardless of which
 * of these entries it was imported from. This module exists so a call site
 * can say "I mean fusion" by name and keep working whether or not the build
 * actually compiles it.
 *
 * Semantics are identical to every other tier: same results, same callback
 * order, same early-exit counts.
 */
export { pipe, pipe as fusedPipe } from './pipe'
export { flow, flow as fusedFlow } from './flow'
export { compile } from './compile'
/** A compiled pipeline: one input in, one output out. */
export type Runner<Input = unknown, Output = unknown> = (input: Input) => Output
