/**
 * Deprecated compatibility entry.
 *
 * `compile` and `compilePure` are markers `@stopcock/fp-compiler` recognises
 * at build time; a compiled call site never runs this file. Uncompiled, both
 * alias plain left-to-right application over `pipe` -- there is no separate
 * runtime engine any more, so there is nothing left for `compilePure` to opt
 * into that `compile` does not already do. Preserves exact callback order and
 * counts, same as every other tier.
 *
 * @deprecated Import `@stopcock/fp/fusion` for the explicit fusion entry.
 */
import { sequentialPipe } from './internal/sequential'
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

const applySequentially = sequentialPipe as (value: unknown, ...rest: readonly never[]) => unknown

const compileExact = (...steps: readonly unknown[]): Runner => {
  if (steps.length === 0) return (value: unknown) => value
  return (value: unknown) => applySequentially(value, ...(steps as never[]))
}

export const compile = compileExact as Compile
export const compilePure = compileExact as Compile
export type { Runner }
