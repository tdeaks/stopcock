import { dual } from './dual-untagged'
import type { Predicate, Refinement } from './guard'
import { none, some, type Option } from './option'

export type Ok<A> = { readonly _tag: 1; readonly value: A }
export type Err<E> = { readonly _tag: 0; readonly error: E }
export type Result<A, E> = Ok<A> | Err<E>

type ResultValue<T> = T extends Ok<infer A> ? A : never
type ResultError<T> = T extends Err<infer E> ? E : never

export const ok = <A>(value: A): Ok<A> => ({ _tag: 1, value })

export const err = <E>(error: E): Err<E> => ({ _tag: 0, error })

export const isOk = <A, E>(result: Result<A, E>): result is Ok<A> => result._tag === 1

export const isErr = <A, E>(result: Result<A, E>): result is Err<E> => result._tag === 0

export const fromPredicate: {
  <A, B extends A, E>(value: A, predicate: Refinement<A, B>, onFalse: (value: A) => E): Result<B, E>
  <A, E>(value: A, predicate: Predicate<A>, onFalse: (value: A) => E): Result<A, E>
  <A, B extends A, E>(
    predicate: Refinement<A, B>,
    onFalse: (value: A) => E,
  ): <C extends A>(value: C) => Result<B & C, E>
  <A, E>(predicate: Predicate<A>, onFalse: (value: A) => E): <B extends A>(value: B) => Result<B, E>
} = /* @__PURE__ */ dual(3,
  <A, E>(value: A, predicate: Predicate<A>, onFalse: (value: A) => E): Result<A, E> =>
    predicate(value) ? ok(value) : err(onFalse(value)),
)

export const map: {
  <A, E, B>(result: Result<A, E>, f: (value: A) => B): Result<B, E>
  <A, B>(
    f: (value: A) => B,
  ): <Current extends Result<A, unknown>>(result: Current) => Result<B, ResultError<Current>>
} = /* @__PURE__ */ dual(2,
  <A, E, B>(result: Result<A, E>, f: (value: A) => B): Result<B, E> =>
    result._tag === 1 ? ok(f(result.value)) : result,
)

export const mapErr: {
  <A, E, F>(result: Result<A, E>, f: (error: E) => F): Result<A, F>
  <E, F>(
    f: (error: E) => F,
  ): <Current extends Result<unknown, E>>(result: Current) => Result<ResultValue<Current>, F>
} = /* @__PURE__ */ dual(2,
  <A, E, F>(result: Result<A, E>, f: (error: E) => F): Result<A, F> =>
    isErr(result) ? err(f(result.error)) : result,
)

export const mapBoth: {
  <A, E, B, F>(
    result: Result<A, E>,
    handlers: { readonly ok: (value: A) => B; readonly err: (error: E) => F },
  ): Result<B, F>
  <A, E, B, F>(handlers: {
    readonly ok: (value: A) => B
    readonly err: (error: E) => F
  }): (result: Result<A, E>) => Result<B, F>
} = /* @__PURE__ */ dual(2,
  <A, E, B, F>(
    result: Result<A, E>,
    handlers: { readonly ok: (value: A) => B; readonly err: (error: E) => F },
  ): Result<B, F> =>
    isOk(result) ? ok(handlers.ok(result.value)) : err(handlers.err(result.error)),
)

export const flatMap: {
  <A, E, Fn extends (value: A) => { readonly _tag: 0 | 1 }>(
    result: Result<A, E>,
    f: Fn,
  ): Result<ResultValue<ReturnType<Fn>>, E | ResultError<ReturnType<Fn>>>
  <A, Fn extends (value: A) => { readonly _tag: 0 | 1 }>(
    f: Fn,
  ): <Current extends Result<A, unknown>>(
    result: Current,
  ) => Result<ResultValue<ReturnType<Fn>>, ResultError<Current> | ResultError<ReturnType<Fn>>>
} = /* @__PURE__ */ dual(2,
  <A, E, B, F>(result: Result<A, E>, f: (value: A) => Result<B, F>): Result<B, E | F> =>
    isOk(result) ? f(result.value) : result,
)

export const andThen = flatMap

export const flatten = <A, E, F>(result: Result<Result<A, F>, E>): Result<A, E | F> =>
  isOk(result) ? result.value : result

export const orElse: {
  <A, E, B, F>(result: Result<A, E>, onErr: (error: E) => Result<B, F>): Result<A | B, F>
  <E, B, F>(onErr: (error: E) => Result<B, F>): <A>(result: Result<A, E>) => Result<A | B, F>
} = /* @__PURE__ */ dual(2,
  <A, E, B, F>(result: Result<A, E>, onErr: (error: E) => Result<B, F>): Result<A | B, F> =>
    isOk(result) ? result : onErr(result.error),
)

export const and: {
  <A, E, B, F>(result: Result<A, E>, next: Result<B, F>): Result<B, E | F>
  <B, F>(next: Result<B, F>): <A, E>(result: Result<A, E>) => Result<B, E | F>
} = /* @__PURE__ */ dual(2,
  <A, E, B, F>(result: Result<A, E>, next: Result<B, F>): Result<B, E | F> =>
    isOk(result) ? next : result,
)

export const zip: {
  <A, E, B, F>(result: Result<A, E>, that: Result<B, F>): Result<readonly [A, B], E | F>
  <B, F>(that: Result<B, F>): <A, E>(result: Result<A, E>) => Result<readonly [A, B], E | F>
} = /* @__PURE__ */ dual(2,
  <A, E, B, F>(result: Result<A, E>, that: Result<B, F>): Result<readonly [A, B], E | F> =>
    isErr(result) ? result : isErr(that) ? that : ok([result.value, that.value] as const),
)

export const zipWith: {
  <A, E, B, F, C>(
    result: Result<A, E>,
    that: Result<B, F>,
    f: (left: A, right: B) => C,
  ): Result<C, E | F>
  <A, B, F, C>(
    that: Result<B, F>,
    f: (left: A, right: B) => C,
  ): <E>(result: Result<A, E>) => Result<C, E | F>
} = /* @__PURE__ */ dual(3,
  <A, E, B, F, C>(
    result: Result<A, E>,
    that: Result<B, F>,
    f: (left: A, right: B) => C,
  ): Result<C, E | F> =>
    isErr(result) ? result : isErr(that) ? that : ok(f(result.value, that.value)),
)

export const ap: {
  <A, E, B, F>(result: Result<A, E>, fn: Result<(value: A) => B, F>): Result<B, E | F>
  <A, B, F>(fn: Result<(value: A) => B, F>): <E>(result: Result<A, E>) => Result<B, E | F>
} = /* @__PURE__ */ dual(2,
  <A, E, B, F>(result: Result<A, E>, fn: Result<(value: A) => B, F>): Result<B, E | F> =>
    isErr(result) ? result : isErr(fn) ? fn : ok(fn.value(result.value)),
)

export const map2 = zipWith

export const lift2 =
  <A, B, C>(f: (left: A, right: B) => C) =>
  <E, F>(left: Result<A, E>, right: Result<B, F>): Result<C, E | F> =>
    zipWith(left, right, f)

export const filterOrElse: {
  <A, B extends A, E, F>(
    result: Result<A, E>,
    predicate: Refinement<A, B>,
    onFalse: (value: A) => F,
  ): Result<B, E | F>
  <A, E, F>(
    result: Result<A, E>,
    predicate: Predicate<A>,
    onFalse: (value: A) => F,
  ): Result<A, E | F>
  <A, B extends A, F>(
    predicate: Refinement<A, B>,
    onFalse: (value: A) => F,
  ): <C extends A, E>(result: Result<C, E>) => Result<B & C, E | F>
  <A, F>(
    predicate: Predicate<A>,
    onFalse: (value: A) => F,
  ): <B extends A, E>(result: Result<B, E>) => Result<B, E | F>
} = /* @__PURE__ */ dual(3,
  <A, E, F>(
    result: Result<A, E>,
    predicate: Predicate<A>,
    onFalse: (value: A) => F,
  ): Result<A, E | F> =>
    isErr(result) ? result : predicate(result.value) ? result : err(onFalse(result.value)),
)

export const ensure = filterOrElse

const sameValueZero = (left: unknown, right: unknown): boolean =>
  left === right || (left !== left && right !== right)

export const contains: {
  <A, E>(result: Result<A, E>, value: A): boolean
  <A>(value: A): <E>(result: Result<A, E>) => boolean
} = /* @__PURE__ */ dual(2,
  <A, E>(result: Result<A, E>, value: A): boolean =>
    isOk(result) && sameValueZero(result.value, value),
)

export const containsWith =
  <A>(equals: (left: A, right: A) => boolean) =>
  (value: A) =>
  <E>(result: Result<A, E>): boolean =>
    isOk(result) && equals(result.value, value)

export const exists: {
  <A, E>(result: Result<A, E>, predicate: Predicate<A>): boolean
  <A>(predicate: Predicate<A>): <E>(result: Result<A, E>) => boolean
} = /* @__PURE__ */ dual(2,
  <A, E>(result: Result<A, E>, predicate: Predicate<A>): boolean =>
    isOk(result) && predicate(result.value),
)

export const getOrElse: {
  <A, E, B>(result: Result<A, E>, onErr: (error: E) => B): A | B
  <E, B>(onErr: (error: E) => B): <A>(result: Result<A, E>) => A | B
} = /* @__PURE__ */ dual(2, <A, E, B>(result: Result<A, E>, onErr: (error: E) => B): A | B =>
  isOk(result) ? result.value : onErr(result.error),
)

export const getOrThrow: {
  <A, E>(result: Result<A, E>, onErr: (error: E) => unknown): A
  <E>(onErr: (error: E) => unknown): <A>(result: Result<A, E>) => A
} = /* @__PURE__ */ dual(2, <A, E>(result: Result<A, E>, onErr: (error: E) => unknown): A => {
  if (isOk(result)) return result.value
  throw onErr(result.error)
})

export interface Matchers<A, E, B, C = B> {
  readonly err: (error: E) => B
  readonly ok: (value: A) => C
}

export const match: {
  <A, E, B, C>(result: Result<A, E>, matchers: Matchers<A, E, B, C>): B | C
  <A, E, B, C>(matchers: Matchers<A, E, B, C>): (result: Result<A, E>) => B | C
} = /* @__PURE__ */ dual(2,
  <A, E, B, C>(result: Result<A, E>, matchers: Matchers<A, E, B, C>): B | C =>
    isOk(result) ? matchers.ok(result.value) : matchers.err(result.error),
)

export function tryCatch<A>(thunk: () => A): Result<A, unknown>
export function tryCatch<A, E>(thunk: () => A, onError: (error: unknown) => E): Result<A, E>
export function tryCatch<A, E>(
  thunk: () => A,
  onError?: (error: unknown) => E,
): Result<A, unknown> {
  try {
    return ok(thunk())
  } catch (error) {
    return err(onError ? onError(error) : error)
  }
}

export function liftThrowable<Args extends readonly unknown[], A>(
  fn: (...args: Args) => A,
): (...args: Args) => Result<A, unknown>
export function liftThrowable<Args extends readonly unknown[], A, E>(
  fn: (...args: Args) => A,
  onError: (error: unknown) => E,
): (...args: Args) => Result<A, E>
export function liftThrowable<Args extends readonly unknown[], A, E>(
  fn: (...args: Args) => A,
  onError?: (error: unknown) => E,
): (...args: Args) => Result<A, unknown> {
  return (...args) => {
    try {
      return ok(fn(...args))
    } catch (error) {
      return err(onError ? onError(error) : error)
    }
  }
}

export const fromThrowable = tryCatch

export const fromNullable =
  <E>(onNullish: () => E) =>
  <A>(value: A | null | undefined): Result<NonNullable<A>, E> =>
    value == null ? err(onNullish()) : ok(value as NonNullable<A>)

export const liftNullable =
  <Args extends readonly unknown[], A, E>(
    fn: (...args: Args) => A | null | undefined,
    onNullish: (...args: Args) => E,
  ) =>
  (...args: Args): Result<NonNullable<A>, E> => {
    const value = fn(...args)
    return value == null ? err(onNullish(...args)) : ok(value as NonNullable<A>)
  }

type ResultValues<T extends readonly Result<unknown, unknown>[]> = {
  -readonly [K in keyof T]: ResultValue<T[K]>
}

export function all<const T extends readonly Result<unknown, unknown>[]>(
  results: T,
): Result<ResultValues<T>, ResultError<T[number]>>
export function all(results: readonly Result<unknown, unknown>[]): Result<unknown[], unknown> {
  const values: unknown[] = []
  for (const result of results) {
    if (isErr(result)) return result
    values.push(result.value)
  }
  return ok(values)
}

export const tuple: typeof all = all
export const sequence: typeof all = all

export function struct<const T extends Readonly<Record<PropertyKey, Result<unknown, unknown>>>>(
  fields: T,
): Result<{ -readonly [K in keyof T]: ResultValue<T[K]> }, ResultError<T[keyof T]>> {
  const output: Record<PropertyKey, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(fields)) {
    if (!Object.prototype.propertyIsEnumerable.call(fields, key)) continue
    const result = fields[key]
    if (isErr(result)) return result as Result<never, ResultError<T[keyof T]>>
    output[key] = result.value
  }
  return ok(output as { -readonly [K in keyof T]: ResultValue<T[K]> })
}

export const traverse: {
  <A, B, E>(values: readonly A[], f: (value: A, index: number) => Result<B, E>): Result<B[], E>
  <A, B, E>(f: (value: A, index: number) => Result<B, E>): (values: readonly A[]) => Result<B[], E>
} = /* @__PURE__ */ dual(2,
  <A, B, E>(values: readonly A[], f: (value: A, index: number) => Result<B, E>): Result<B[], E> => {
    const output: B[] = []
    for (let index = 0; index < values.length; index++) {
      const result = f(values[index], index)
      if (isErr(result)) return result
      output.push(result.value)
    }
    return ok(output)
  },
)

export type NonEmptyArray<A> = readonly [A, ...A[]]

export function allValidation<const T extends readonly Result<unknown, unknown>[]>(
  results: T,
): Result<ResultValues<T>, NonEmptyArray<ResultError<T[number]>>>
export function allValidation<A, E>(
  results: readonly Result<A, E>[],
  combine: (left: E, right: E) => E,
): Result<A[], E>
export function allValidation(
  results: readonly Result<unknown, unknown>[],
  combine?: (left: unknown, right: unknown) => unknown,
): Result<unknown[], unknown> {
  const values: unknown[] = []
  const errors: unknown[] = []
  let combined: unknown
  for (const result of results) {
    if (isOk(result)) {
      values.push(result.value)
    } else if (combine) {
      combined = errors.length === 0 ? result.error : combine(combined, result.error)
      errors.push(result.error)
    } else {
      errors.push(result.error)
    }
  }
  if (errors.length === 0) return ok(values)
  return err(combine ? combined : (errors as [unknown, ...unknown[]]))
}

export const traverseValidation: {
  <A, B, E>(
    values: readonly A[],
    f: (value: A, index: number) => Result<B, E>,
  ): Result<B[], NonEmptyArray<E>>
  <A, B, E>(
    f: (value: A, index: number) => Result<B, E>,
  ): (values: readonly A[]) => Result<B[], NonEmptyArray<E>>
} = /* @__PURE__ */ dual(2,
  <A, B, E>(
    values: readonly A[],
    f: (value: A, index: number) => Result<B, E>,
  ): Result<B[], NonEmptyArray<E>> =>
    allValidation(values.map((value, index) => f(value, index))) as Result<B[], NonEmptyArray<E>>,
)

export const optional: {
  <A, B, E>(value: A | undefined, decode: (value: A) => Result<B, E>): Result<B | undefined, E>
  <A, B, E>(decode: (value: A) => Result<B, E>): (value: A | undefined) => Result<B | undefined, E>
} = /* @__PURE__ */ dual(2,
  <A, B, E>(value: A | undefined, decode: (value: A) => Result<B, E>): Result<B | undefined, E> =>
    value === undefined ? ok(undefined) : decode(value),
)

export const nullable: {
  <A, B, E>(value: A | null, decode: (value: A) => Result<B, E>): Result<B | null, E>
  <A, B, E>(decode: (value: A) => Result<B, E>): (value: A | null) => Result<B | null, E>
} = /* @__PURE__ */ dual(2,
  <A, B, E>(value: A | null, decode: (value: A) => Result<B, E>): Result<B | null, E> =>
    value === null ? ok(null) : decode(value),
)

export const swap = <A, E>(result: Result<A, E>): Result<E, A> =>
  isOk(result) ? err(result.value) : ok(result.error)

export const toOption = <A, E>(result: Result<A, E>): Option<A> =>
  isOk(result) ? some(result.value) : none

export const tap: {
  <A, E>(result: Result<A, E>, f: (value: A) => void): Result<A, E>
  <A>(f: (value: A) => void): <E>(result: Result<A, E>) => Result<A, E>
} = /* @__PURE__ */ dual(2,
  <A, E>(result: Result<A, E>, f: (value: A) => void): Result<A, E> => {
    if (isOk(result)) f(result.value)
    return result
  },
)

export const tapErr: {
  <A, E>(result: Result<A, E>, f: (error: E) => void): Result<A, E>
  <E>(f: (error: E) => void): <A>(result: Result<A, E>) => Result<A, E>
} = /* @__PURE__ */ dual(2,
  <A, E>(result: Result<A, E>, f: (error: E) => void): Result<A, E> => {
    if (isErr(result)) f(result.error)
    return result
  },
)

export const as: {
  <A, E, B>(result: Result<A, E>, value: B): Result<B, E>
  <B>(value: B): <A, E>(result: Result<A, E>) => Result<B, E>
} = /* @__PURE__ */ dual(2,
  <A, E, B>(result: Result<A, E>, value: B): Result<B, E> => (isOk(result) ? ok(value) : result),
)

export const asVoid = <A, E>(result: Result<A, E>): Result<void, E> =>
  isOk(result) ? ok(undefined) : result

export const bindTo =
  <Name extends PropertyKey>(name: Name) =>
  <A, E>(result: Result<A, E>): Result<{ readonly [K in Name]: A }, E> =>
    map(result, (value) => ({ [name]: value }) as { readonly [K in Name]: A })

export const bind =
  <Name extends PropertyKey, A extends object, B, F>(
    name: Exclude<Name, keyof A>,
    f: (value: A) => Result<B, F>,
  ) =>
  <E>(result: Result<A, E>): Result<A & { readonly [K in Name]: B }, E | F> =>
    flatMap(result, (value) =>
      map(
        f(value),
        (bound) =>
          Object.assign({}, value, { [name]: bound }) as A & {
            readonly [K in Name]: B
          },
      ),
    )

const letValue =
  <Name extends PropertyKey, A extends object, B>(
    name: Exclude<Name, keyof A>,
    f: (value: A) => B,
  ) =>
  <E>(result: Result<A, E>): Result<A & { readonly [K in Name]: B }, E> =>
    map(
      result,
      (value) =>
        Object.assign({}, value, { [name]: f(value) }) as A & {
          readonly [K in Name]: B
        },
    )

export { letValue as let }

export const Do: Result<Record<never, never>, never> = ok({})

export function gen<A, E>(make: () => Generator<Result<unknown, E>, A, unknown>): Result<A, E> {
  const iterator = make()
  let state = iterator.next()
  while (!state.done) {
    if (isErr(state.value)) {
      iterator.return?.(undefined as A)
      return state.value
    }
    state = iterator.next(state.value.value)
  }
  return ok(state.value)
}
