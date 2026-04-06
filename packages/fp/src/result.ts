import type { LazyValue } from './types'
import { some, none, type Option } from './option'

export type Ok<A> = { readonly _tag: 1; readonly value: A }
export type Err<E> = { readonly _tag: 0; readonly error: E }
export type Result<A, E> = Ok<A> | Err<E>

export const ok = <A>(value: A): Result<A, never> => ({ _tag: 1, value })

export const err = <E>(error: E): Result<never, E> => ({ _tag: 0, error })

export const isOk = <A, E>(r: Result<A, E>): r is Ok<A> => r._tag === 1

export const isErr = <A, E>(r: Result<A, E>): r is Err<E> => r._tag === 0

export const map =
  <A, B>(f: (a: A) => B) =>
  <E>(r: Result<A, E>): Result<B, E> =>
    r._tag === 1 ? ok(f(r.value)) : r

export const mapErr =
  <E, F>(f: (e: E) => F) =>
  <A>(r: Result<A, E>): Result<A, F> =>
    r._tag === 0 ? err(f(r.error)) : r

export const flatMap =
  <A, B, E2>(f: (a: A) => Result<B, E2>) =>
  <E>(r: Result<A, E>): Result<B, E | E2> =>
    r._tag === 1 ? f(r.value) : r

export const getOrElse =
  <B>(onErr: LazyValue<B>) =>
  <A, E>(r: Result<A, E>): A | B =>
    r._tag === 1 ? r.value : onErr()

export const match =
  <E, B, A, C = B>(onErr: (e: E) => B, onOk: (a: A) => C) =>
  (r: Result<A, E>): B | C =>
    r._tag === 1 ? onOk(r.value) : onErr(r.error)

export function tryCatch<A>(thunk: () => A): Result<A, unknown>
export function tryCatch<A, E>(thunk: () => A, onError: (e: unknown) => E): Result<A, E>
export function tryCatch<A, E>(thunk: () => A, onError?: (e: unknown) => E): Result<A, E | unknown> {
  try {
    return ok(thunk())
  } catch (e) {
    return err(onError ? onError(e) : e)
  }
}

export const fromNullable =
  <E>(defaultError: E) =>
  <A>(value: A | null | undefined): Result<NonNullable<A>, E> =>
    value == null ? err(defaultError) : ok(value as NonNullable<A>)

export const toOption = <A, E>(r: Result<A, E>): Option<A> =>
  r._tag === 1 ? some(r.value) : none

export const tap =
  <A>(f: (a: A) => void) =>
  <E>(r: Result<A, E>): Result<A, E> => {
    if (r._tag === 1) f(r.value)
    return r
  }

export const tapErr =
  <E>(f: (e: E) => void) =>
  <A>(r: Result<A, E>): Result<A, E> => {
    if (r._tag === 0) f(r.error)
    return r
  }
