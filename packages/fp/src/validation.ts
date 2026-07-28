import type { Predicate, Refinement } from './guard'
import { err, ok, type Result } from './result'

const nativeArrayIterator = Array.prototype[Symbol.iterator]
const nativeArrayIteratorPrototype = Object.getPrototypeOf(
  Reflect.apply(nativeArrayIterator, [], []),
) as object
const maximumArrayLikeLength = 9_007_199_254_740_991

// ArrayIterator's `next` performs LengthOfArrayLike on every step. Keeping the
// coercion here matters for Array proxies whose `length` trap can return
// fractional values or non-Number primitives.
const arrayIteratorLength = (value: unknown): number => {
  // Real Array lengths are uint32 values. Keep that overwhelmingly common
  // path scalar while retaining full ToLength coercion for proxies.
  if (typeof value === 'number' && value === (value >>> 0)) return value
  const numeric = +(value as number)
  if (numeric !== numeric || numeric <= 0) return 0
  if (numeric >= maximumArrayLikeLength) return maximumArrayLikeLength
  return numeric - (numeric % 1)
}

export type NonEmptyArray<E> = readonly [E, ...E[]]
export type Validation<A, E> = Result<A, NonEmptyArray<E>>

export const valid = <A>(value: A): Validation<A, never> => ok(value)

export const invalid = <E>(error: E): Validation<never, E> => err([error] as const)

export const fromResult = <A, E>(result: Result<A, E>): Validation<A, E> =>
  result._tag === 1 ? result : err([result.error] as const)

export const fromPredicate: {
  <A, B extends A, E>(
    predicate: Refinement<A, B>,
    onFalse: (value: A) => E,
  ): <C extends A>(value: C) => Validation<B & C, E>
  <A, E>(
    predicate: Predicate<A>,
    onFalse: (value: A) => E,
  ): <B extends A>(value: B) => Validation<B, E>
} =
  <A, E>(predicate: Predicate<A>, onFalse: (value: A) => E) =>
  (value: A): Validation<A, E> =>
    predicate(value) ? valid(value) : invalid(onFalse(value))

type ValidationValue<T> = T extends { readonly _tag: 1; readonly value: infer A } ? A : never
type ValidationError<T> = T extends {
  readonly _tag: 0
  readonly error: readonly [infer E, ...unknown[]]
}
  ? E
  : never
type ValidationValues<T extends readonly Validation<unknown, unknown>[]> = {
  -readonly [K in keyof T]: ValidationValue<T[K]>
}

export function all<const T extends readonly Validation<unknown, unknown>[]>(
  validations: T,
): Validation<ValidationValues<T>, ValidationError<T[number]>>
export function all(
  validations: readonly Validation<unknown, unknown>[],
): Validation<unknown[], unknown> {
  const values: unknown[] = []
  let errors: unknown[] | undefined

  // Read the iterator method exactly once, as for-of does. When it is the
  // captured intrinsic, indexed access has the same dynamic-length, dense-hole,
  // inherited-index, subclass, and proxy behavior without allocating the
  // iterator and IteratorResult objects. A user-defined ArrayIterator `return`
  // makes IteratorClose observable, so retain native iteration in that case.
  const iteratorMethod = validations[Symbol.iterator]
  if (
    iteratorMethod === nativeArrayIterator &&
    !('return' in nativeArrayIteratorPrototype)
  ) {
    for (
      let index = 0;
      index < arrayIteratorLength(validations.length);
      index += 1
    ) {
      const validation = validations[index] as Validation<unknown, unknown>
      if (validation._tag === 1) values.push(validation.value)
      else (errors ??= []).push(...validation.error)
    }
  } else {
    // The wrapper reuses the method lookup above while delegating iteration and
    // IteratorClose to the language's for-of machinery.
    const iterator = Reflect.apply(iteratorMethod, validations, [])
    const iterable = {
      [Symbol.iterator]: (): IterableIterator<Validation<unknown, unknown>> =>
        iterator as IterableIterator<Validation<unknown, unknown>>,
    }
    for (const validation of iterable) {
      if (validation._tag === 1) values.push(validation.value)
      else (errors ??= []).push(...validation.error)
    }
  }

  return errors === undefined || errors.length === 0
    ? valid(values)
    : err(errors as [unknown, ...unknown[]])
}

export const traverse: {
  <A, B, E>(validate: (value: A) => Validation<B, E>): (values: readonly A[]) => Validation<B[], E>
} =
  <A, B, E>(validate: (value: A) => Validation<B, E>) =>
  (values: readonly A[]): Validation<B[], E> =>
    all(values.map(validate))
