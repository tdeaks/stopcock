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
} = function fromPredicate<A, E>(predicate: Predicate<A>, onFalse: (value: A) => E, __df?: any): any {
  if (arguments.length >= 3) return (fromPredicate as any)(onFalse, __df)(predicate)
  return (value: A): Result<A, E> =>
    predicate(value) ? ok(value) : err(onFalse(value))
} as any

export const map: {
  <A, E, B>(result: Result<A, E>, f: (value: A) => B): Result<B, E>
  <A, B>(f: (value: A) => B): <E = never>(result: Result<A, E>) => Result<B, E>
} = function map(f: (value: unknown) => unknown, __df?: any): any {
  if (arguments.length >= 2) return (map as any)(__df)(f)
  return (result: Result<unknown, unknown>) =>
      result._tag === 1 ? ok(f(result.value)) : result
} as any

export const mapErr: {
  <A, E, F>(result: Result<A, E>, f: (error: E) => F): Result<A, F>
  <E, F>(f: (error: E) => F): <A = never>(result: Result<A, E>) => Result<A, F>
} = function mapErr(f: (error: unknown) => unknown, __df?: any): any {
  if (arguments.length >= 2) return (mapErr as any)(__df)(f)
  return (result: Result<unknown, unknown>) =>
      isErr(result) ? err(f(result.error)) : result
} as any

export const mapBoth: {
  <A, E, B, F>(
    result: Result<A, E>,
    handlers: { readonly ok: (value: A) => B; readonly err: (error: E) => F },
  ): Result<B, F>
  <A, E, B, F>(handlers: {
    readonly ok: (value: A) => B
    readonly err: (error: E) => F
  }): (result: Result<A, E>) => Result<B, F>
} = function mapBoth<A, E, B, F>(handlers: { readonly ok: (value: A) => B; readonly err: (error: E) => F }, __df?: any): any {
  if (arguments.length >= 2) return (mapBoth as any)(__df)(handlers)
  return (result: Result<A, E>): Result<B, F> =>
    isOk(result) ? ok(handlers.ok(result.value)) : err(handlers.err(result.error))
} as any

export const flatMap: {
  <A, E, B, E2>(result: Result<A, E>, f: (value: A) => Result<B, E2>): Result<B, E | E2>
  <A, B, E2>(f: (value: A) => Result<B, E2>): <E = never>(result: Result<A, E>) => Result<B, E | E2>
} = function flatMap(f: (value: unknown) => Result<unknown, unknown>, __df?: any): any {
  if (arguments.length >= 2) return (flatMap as any)(__df)(f)
  return (result: Result<unknown, unknown>) =>
      isOk(result) ? f(result.value) : result
} as any

export const andThen = flatMap

export const flatten = <A, E, F>(result: Result<Result<A, F>, E>): Result<A, E | F> =>
  isOk(result) ? result.value : result

export const orElse: {
  <A, E, B, F>(result: Result<A, E>, onErr: (error: E) => Result<B, F>): Result<A | B, F>
  <E, B, F>(onErr: (error: E) => Result<B, F>): <A>(result: Result<A, E>) => Result<A | B, F>
} = function orElse(onErr: (error: unknown) => Result<unknown, unknown>, __df?: any): any {
  if (arguments.length >= 2) return (orElse as any)(__df)(onErr)
  return (result: Result<unknown, unknown>) =>
      isOk(result) ? result : onErr(result.error)
} as any

export const and: {
  <A, E, B, F>(result: Result<A, E>, next: Result<B, F>): Result<B, E | F>
  <B, F>(next: Result<B, F>): <A, E>(result: Result<A, E>) => Result<B, E | F>
} = function and(next: Result<unknown, unknown>, __df?: any): any {
  if (arguments.length >= 2) return (and as any)(__df)(next)
  return (result: Result<unknown, unknown>) =>
    isOk(result) ? next : result
} as any

export const zip: {
  <A, E, B, F>(result: Result<A, E>, that: Result<B, F>): Result<readonly [A, B], E | F>
  <B, F>(that: Result<B, F>): <A, E>(result: Result<A, E>) => Result<readonly [A, B], E | F>
} = function zip(that: Result<unknown, unknown>, __df?: any): any {
  if (arguments.length >= 2) return (zip as any)(__df)(that)
  return (result: Result<unknown, unknown>) =>
    isErr(result) ? result : isErr(that) ? that : ok([result.value, that.value] as const)
} as any

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
} = function zipWith(that: Result<unknown, unknown>, f: (left: unknown, right: unknown) => unknown, __df?: any): any {
  if (arguments.length >= 3) return (zipWith as any)(f, __df)(that)
  return (result: Result<unknown, unknown>) =>
      isErr(result) ? result : isErr(that) ? that : ok(f(result.value, that.value))
} as any

export const ap: {
  <A, E, B, F>(result: Result<A, E>, fn: Result<(value: A) => B, F>): Result<B, E | F>
  <A, B, F>(fn: Result<(value: A) => B, F>): <E>(result: Result<A, E>) => Result<B, E | F>
} = function ap(fn: Result<(value: unknown) => unknown, unknown>, __df?: any): any {
  if (arguments.length >= 2) return (ap as any)(__df)(fn)
  return (result: Result<unknown, unknown>) =>
      isErr(result) ? result : isErr(fn) ? fn : ok(fn.value(result.value))
} as any

export const map2 = zipWith

export const lift2: {
  <A, B, C, E, F>(
    left: Result<A, E>,
    right: Result<B, F>,
    f: (left: A, right: B) => C,
  ): Result<C, E | F>
  <A, B, C>(
    f: (left: A, right: B) => C,
  ): <E, F>(left: Result<A, E>, right: Result<B, F>) => Result<C, E | F>
} = function lift2<A, B, C>(
  f: (left: A, right: B) => C,
  right?: Result<B, unknown>,
  __df?: any,
): any {
  if (arguments.length >= 3) return (lift2 as any)(__df)(f, right)
  return <E, F>(left: Result<A, E>, right: Result<B, F>): Result<C, E | F> =>
    zipWith<A, B, F, C>(right, f)(left)
} as any

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
} = function filterOrElse<A, E, F>(predicate: Predicate<A>, onFalse: (value: A) => F, __df?: any): any {
  if (arguments.length >= 3) return (filterOrElse as any)(onFalse, __df)(predicate)
  return (result: Result<A, E>): Result<A, E | F> =>
    isErr(result) ? result : predicate(result.value) ? result : err(onFalse(result.value))
} as any

export const ensure = filterOrElse

const sameValueZero = (left: unknown, right: unknown): boolean =>
  left === right || (left !== left && right !== right)

export const contains: {
  <A, E>(result: Result<A, E>, value: A): boolean
  <A>(value: A): <E>(result: Result<A, E>) => boolean
} = function contains<A>(value: A, __df?: any): any {
  if (arguments.length >= 2) return (contains as any)(__df)(value)
  return <E>(result: Result<A, E>): boolean =>
    isOk(result) && sameValueZero(result.value, value)
} as any

export const containsWith: {
  <A, E>(
    result: Result<A, E>,
    value: A,
    equals: (left: A, right: A) => boolean,
  ): boolean
  <A>(
    equals: (left: A, right: A) => boolean,
  ): (value: A) => <E>(result: Result<A, E>) => boolean
} = function containsWith<A>(
  equals: (left: A, right: A) => boolean,
  value?: A,
  __df?: any,
): any {
  if (arguments.length >= 3) return (containsWith as any)(__df)(value)(equals)
  return (value: A) =>
  <E>(result: Result<A, E>): boolean =>
    isOk(result) && equals(result.value, value)
} as any

export const exists: {
  <A, E>(result: Result<A, E>, predicate: Predicate<A>): boolean
  <A>(predicate: Predicate<A>): <E>(result: Result<A, E>) => boolean
} = function exists<A>(predicate: Predicate<A>, __df?: any): any {
  if (arguments.length >= 2) return (exists as any)(__df)(predicate)
  return <E>(result: Result<A, E>): boolean =>
    isOk(result) && predicate(result.value)
} as any

export const getOrElse: {
  <A, E, B>(result: Result<A, E>, onErr: (error: E) => B): A | B
  <E, B>(onErr: (error: E) => B): <A>(result: Result<A, E>) => A | B
} = function getOrElse(onErr: (error: unknown) => unknown, __df?: any): any {
  if (arguments.length >= 2) return (getOrElse as any)(__df)(onErr)
  return (result: Result<unknown, unknown>) =>
    isOk(result) ? result.value : onErr(result.error)
} as any

export const getOrThrow: {
  <A, E>(result: Result<A, E>, onErr: (error: E) => unknown): A
  <E>(onErr: (error: E) => unknown): <A>(result: Result<A, E>) => A
} = function getOrThrow(onErr: (error: unknown) => unknown, __df?: any): any {
  if (arguments.length >= 2) return (getOrThrow as any)(__df)(onErr)
  return (result: Result<unknown, unknown>): unknown => {
      if (isOk(result)) return result.value
      throw onErr(result.error)
    }
} as any

export interface Matchers<A, E, B, C = B> {
  readonly err: (error: E) => B
  readonly ok: (value: A) => C
}

export const match: {
  <A, E, B, C>(result: Result<A, E>, matchers: Matchers<A, E, B, C>): B | C
  <A, E, B, C>(matchers: Matchers<A, E, B, C>): (result: Result<A, E>) => B | C
} = function match<A, E, B, C>(matchers: Matchers<A, E, B, C>, __df?: any): any {
  if (arguments.length >= 2) return (match as any)(__df)(matchers)
  return (result: Result<A, E>): B | C =>
    isOk(result) ? matchers.ok(result.value) : matchers.err(result.error)
} as any

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

export const fromNullable: {
  <A, E>(value: A | null | undefined, onNullish: () => E): Result<NonNullable<A>, E>
  <E>(onNullish: () => E): <A>(value: A | null | undefined) => Result<NonNullable<A>, E>
} = function fromNullable<E>(onNullish: () => E, __df?: any): any {
  if (arguments.length >= 2) return (fromNullable as any)(__df)(onNullish)
  return <A>(value: A | null | undefined): Result<NonNullable<A>, E> =>
    value == null ? err(onNullish()) : ok(value as NonNullable<A>)
} as any

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
} = function traverse<A, B, E>(f: (value: A, index: number) => Result<B, E>, __df?: any): any {
  if (arguments.length >= 2) return (traverse as any)(__df)(f)
  return (values: readonly A[]): Result<B[], E> => {
    const output: B[] = []
    for (let index = 0; index < values.length; index++) {
      const result = f(values[index], index)
      if (isErr(result)) return result
      output.push(result.value)
    }
    return ok(output)
  }
} as any

export type NonEmptyArray<A> = readonly [A, ...A[]]

export function allValidation<const T extends readonly Result<unknown, unknown>[]>(
  results: T,
): Result<ResultValues<T>, NonEmptyArray<ResultError<T[number]>>>
export function allValidation<A, E>(
  results: readonly Result<A, E>[],
  combine: (left: E, right: E) => E,
): Result<A[], E>
export function allValidation<A, E>(
  combine: (left: E, right: E) => E,
): (results: readonly Result<A, E>[]) => Result<A[], E>
export function allValidation(
  resultsOrCombine:
    | readonly Result<unknown, unknown>[]
    | ((left: unknown, right: unknown) => unknown),
  combine?: (left: unknown, right: unknown) => unknown,
): Result<unknown[], unknown> | ((results: readonly Result<unknown, unknown>[]) => Result<unknown[], unknown>) {
  if (typeof resultsOrCombine === 'function') {
    return (results: readonly Result<unknown, unknown>[]): Result<unknown[], unknown> =>
      allValidation(results, resultsOrCombine)
  }
  const results = resultsOrCombine
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
} = function traverseValidation<A, B, E>(f: (value: A, index: number) => Result<B, E>, __df?: any): any {
  if (arguments.length >= 2) return (traverseValidation as any)(__df)(f)
  return (values: readonly A[]): Result<B[], NonEmptyArray<E>> =>
    allValidation(values.map((value, index) => f(value, index))) as Result<B[], NonEmptyArray<E>>
} as any

export const optional: {
  <A, B, E>(value: A | undefined, decode: (value: A) => Result<B, E>): Result<B | undefined, E>
  <A, B, E>(decode: (value: A) => Result<B, E>): (value: A | undefined) => Result<B | undefined, E>
} = function optional<A, B, E>(decode: (value: A) => Result<B, E>, __df?: any): any {
  if (arguments.length >= 2) return (optional as any)(__df)(decode)
  return (value: A | undefined): Result<B | undefined, E> =>
    value === undefined ? ok(undefined) : decode(value)
} as any

export const nullable: {
  <A, B, E>(value: A | null, decode: (value: A) => Result<B, E>): Result<B | null, E>
  <A, B, E>(decode: (value: A) => Result<B, E>): (value: A | null) => Result<B | null, E>
} = function nullable<A, B, E>(decode: (value: A) => Result<B, E>, __df?: any): any {
  if (arguments.length >= 2) return (nullable as any)(__df)(decode)
  return (value: A | null): Result<B | null, E> =>
    value === null ? ok(null) : decode(value)
} as any

export const swap = <A, E>(result: Result<A, E>): Result<E, A> =>
  isOk(result) ? err(result.value) : ok(result.error)

export const toOption = <A, E>(result: Result<A, E>): Option<A> =>
  isOk(result) ? some(result.value) : none

export const tap: {
  <A, E>(result: Result<A, E>, f: (value: A) => void): Result<A, E>
  <A>(f: (value: A) => void): <E>(result: Result<A, E>) => Result<A, E>
} = function tap(f: (value: unknown) => void, __df?: any): any {
  if (arguments.length >= 2) return (tap as any)(__df)(f)
  return (result: Result<unknown, unknown>): Result<unknown, unknown> => {
      if (isOk(result)) f(result.value)
      return result
    }
} as any

export const tapErr: {
  <A, E>(result: Result<A, E>, f: (error: E) => void): Result<A, E>
  <E>(f: (error: E) => void): <A>(result: Result<A, E>) => Result<A, E>
} = function tapErr(f: (error: unknown) => void, __df?: any): any {
  if (arguments.length >= 2) return (tapErr as any)(__df)(f)
  return (result: Result<unknown, unknown>): Result<unknown, unknown> => {
      if (isErr(result)) f(result.error)
      return result
    }
} as any

export const as: {
  <A, E, B>(result: Result<A, E>, value: B): Result<B, E>
  <B>(value: B): <A, E>(result: Result<A, E>) => Result<B, E>
} = function as<B>(value: B, __df?: any): any {
  if (arguments.length >= 2) return (as as any)(__df)(value)
  return <A, E>(result: Result<A, E>): Result<B, E> =>
    isOk(result) ? ok(value) : result
} as any

export const asVoid = <A, E>(result: Result<A, E>): Result<void, E> =>
  isOk(result) ? ok(undefined) : result

export const bindTo: {
  <A, E, Name extends PropertyKey>(
    result: Result<A, E>,
    name: Name,
  ): Result<{ readonly [K in Name]: A }, E>
  <Name extends PropertyKey>(
    name: Name,
  ): <A, E>(result: Result<A, E>) => Result<{ readonly [K in Name]: A }, E>
} = function bindTo<Name extends PropertyKey>(name: Name, __df?: any): any {
  if (arguments.length >= 2) return (bindTo as any)(__df)(name)
  return <A, E>(result: Result<A, E>): Result<{ readonly [K in Name]: A }, E> =>
    map((value: A) => ({ [name]: value }) as { readonly [K in Name]: A })(result)
} as any

export const bind: {
  <Name extends PropertyKey, A extends object, B, E, F>(
    result: Result<A, E>,
    name: Exclude<Name, keyof A>,
    f: (value: A) => Result<B, F>,
  ): Result<A & { readonly [K in Name]: B }, E | F>
  <Name extends PropertyKey, A extends object, B, F>(
    name: Exclude<Name, keyof A>,
    f: (value: A) => Result<B, F>,
  ): <E>(result: Result<A, E>) => Result<A & { readonly [K in Name]: B }, E | F>
} = function bind<Name extends PropertyKey, A extends object, B, F>(
  name: Exclude<Name, keyof A>,
  f: (value: A) => Result<B, F>,
  __df?: any,
): any {
  if (arguments.length >= 3) return (bind as any)(f, __df)(name)
  return <E>(result: Result<A, E>): Result<A & { readonly [K in Name]: B }, E | F> =>
    (flatMap as any)((value: A) =>
      map(
        (bound: B) =>
          Object.assign({}, value, { [name]: bound }) as A & {
            readonly [K in Name]: B
          },
      )(f(value)),
    )(result)
} as any

const letValue: {
  <Name extends PropertyKey, A extends object, B, E>(
    result: Result<A, E>,
    name: Exclude<Name, keyof A>,
    f: (value: A) => B,
  ): Result<A & { readonly [K in Name]: B }, E>
  <Name extends PropertyKey, A extends object, B>(
    name: Exclude<Name, keyof A>,
    f: (value: A) => B,
  ): <E>(result: Result<A, E>) => Result<A & { readonly [K in Name]: B }, E>
} = function letValue<Name extends PropertyKey, A extends object, B>(
  name: Exclude<Name, keyof A>,
  f: (value: A) => B,
  __df?: any,
): any {
  if (arguments.length >= 3) return (letValue as any)(f, __df)(name)
  return <E>(result: Result<A, E>): Result<A & { readonly [K in Name]: B }, E> =>
    map(
      (value: A) =>
        Object.assign({}, value, { [name]: f(value) }) as A & {
          readonly [K in Name]: B
        },
    )(result)
} as any

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
