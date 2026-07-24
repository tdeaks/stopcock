export interface None {
  readonly _tag: 0
}

export interface Some<A> {
  readonly _tag: 1
  readonly value: A
}

export type OptionCase<A> = None | Some<A>

export interface Err<E> {
  readonly _tag: 0
  readonly error: E
}

export interface Ok<A> {
  readonly _tag: 1
  readonly value: A
}

export type ResultCase<A, E> = Ok<A> | Err<E>

export const optionCases = <A>(values: Iterable<A>): readonly OptionCase<A>[] => [
  { _tag: 0 },
  ...Array.from(values, (value): OptionCase<A> => ({ _tag: 1, value })),
]

export const resultCases = <A, E>(
  values: Iterable<A>,
  errors: Iterable<E>,
): readonly ResultCase<A, E>[] => [
  ...Array.from(values, (value): ResultCase<A, E> => ({ _tag: 1, value })),
  ...Array.from(errors, (error): ResultCase<A, E> => ({ _tag: 0, error })),
]

export const arrayCases = <A>(
  values: readonly A[],
  maxLength = 3,
  maxCases = 256,
): readonly (readonly A[])[] => {
  const length = Number.isNaN(maxLength) ? 0 : Math.max(0, Math.floor(maxLength))
  const limit = Number.isNaN(maxCases) ? 1 : Math.max(1, Math.floor(maxCases))
  const output: A[][] = [[]]
  let frontier: A[][] = [[]]

  for (let depth = 1; depth <= length && output.length < limit; depth++) {
    if (frontier.length === 0) break
    const next: A[][] = []
    for (const prefix of frontier) {
      for (const value of values) {
        const item = [...prefix, value]
        output.push(item)
        next.push(item)
        if (output.length >= limit) return output
      }
    }
    frontier = next
  }
  return output
}

export const tupleCases = <A, B>(
  left: Iterable<A>,
  right: Iterable<B>,
): readonly (readonly [A, B])[] => {
  const rightValues = Array.from(right)
  const output: Array<readonly [A, B]> = []
  for (const first of left) {
    for (const second of rightValues) output.push([first, second])
  }
  return output
}

export const numberEdgeCases: readonly number[] = [
  0,
  -0,
  1,
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.MIN_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER,
  Number.MIN_SAFE_INTEGER - 1,
  Number.MAX_SAFE_INTEGER + 1,
  Number.MIN_VALUE,
  Number.MAX_VALUE,
  Number.EPSILON,
  -Number.EPSILON,
]

export const stringEdgeCases: readonly string[] = [
  '',
  ' ',
  '\0',
  '\n',
  'é',
  'e\u0301',
  '💧',
  '\ud800',
  '__proto__',
]
