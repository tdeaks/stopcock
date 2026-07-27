/**
 * Deprecated compatibility entry.
 *
 * The optimized engine that used to back this subpath now lives in
 * `@stopcock/fp-optimizer`. Rather than leave this specifier broken or make it
 * a hidden forwarder to a package that may not be installed, it resolves to
 * compact fusion: an FP-only install stays complete. `compile` preserves exact
 * callback order and counts; `compilePure` opts into the documented pure
 * rewrites reported by `explainPure`.
 *
 * @deprecated Import `@stopcock/fp/fusion` for compact fusion, or install
 * `@stopcock/fp-optimizer` for the maximum-throughput tier.
 */
import { compactCompile } from './internal/compact-runtime'
import { compactCompilePure } from './internal/compact-pure-runtime'
import type { Runner } from './fusion'

type AnyUnary = (input: never) => unknown

type FirstInput<Steps extends readonly AnyUnary[]> = Steps extends readonly [
  infer First extends AnyUnary,
  ...(readonly AnyUnary[]),
]
  ? Parameters<First>[0]
  : unknown

type LastOutput<Steps extends readonly AnyUnary[]> = Steps extends readonly [
  ...(readonly AnyUnary[]),
  infer Last extends AnyUnary,
]
  ? ReturnType<Last>
  : unknown

type ValidChain<Steps extends readonly AnyUnary[]> = Steps extends readonly [
  infer First extends AnyUnary,
  infer Second extends AnyUnary,
  ...infer Rest extends readonly AnyUnary[],
]
  ? ReturnType<First> extends Parameters<Second>[0]
    ? readonly [First, ...ValidChain<readonly [Second, ...Rest]>]
    : never
  : Steps

interface Compile {
  (): Runner
  <const Steps extends readonly [AnyUnary, ...AnyUnary[]]>(
    ...steps: Steps & ValidChain<Steps>
  ): Runner<FirstInput<Steps>, LastOutput<Steps>>
  (...steps: readonly Runner[]): Runner
}

const compileExact = (...steps: readonly unknown[]): Runner => {
  return compactCompile(...steps)
}

export const compile = compileExact as Compile
export const compilePure = compactCompilePure as Compile
export type { Runner }
