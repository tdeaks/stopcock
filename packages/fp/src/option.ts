import type { LazyValue } from './types'
import type { Result } from './result'

export type None = { readonly _tag: 0 }
export type Some<A> = { readonly _tag: 1; readonly value: A }
export type Option<A> = None | Some<A>

export const none: None = { _tag: 0 } as const

export const some = <A>(value: A): Option<A> => ({ _tag: 1, value })

export const fromNullable = <A>(value: A | null | undefined): Option<NonNullable<A>> =>
  value == null ? none : some(value as NonNullable<A>)

export const fromPredicate =
  <A>(predicate: (a: A) => boolean) =>
  (a: A): Option<A> =>
    predicate(a) ? some(a) : none

export const isSome = <A>(o: Option<A>): o is Some<A> => o._tag === 1

export const isNone = <A>(o: Option<A>): o is None => o._tag === 0

export const map =
  <A, B>(f: (a: A) => B) =>
  (o: Option<A>): Option<B> =>
    o._tag === 1 ? some(f(o.value)) : none

export const flatMap =
  <A, B>(f: (a: A) => Option<B>) =>
  (o: Option<A>): Option<B> =>
    o._tag === 1 ? f(o.value) : none

export const filter =
  <A>(predicate: (a: A) => boolean) =>
  (o: Option<A>): Option<A> =>
    o._tag === 1 && predicate(o.value) ? o : none

export const getOrElse =
  <B>(onNone: LazyValue<B>) =>
  <A>(o: Option<A>): A | B =>
    o._tag === 1 ? o.value : onNone()

export const getWithDefault =
  <B>(defaultValue: B) =>
  <A>(o: Option<A>): A | B =>
    o._tag === 1 ? o.value : defaultValue

export const match =
  <B, A, C = B>(onNone: LazyValue<B>, onSome: (a: A) => C) =>
  (o: Option<A>): B | C =>
    o._tag === 1 ? onSome(o.value) : onNone()

export const tap =
  <A>(f: (a: A) => void) =>
  (o: Option<A>): Option<A> => {
    if (o._tag === 1) f(o.value)
    return o
  }

export const toNullable = <A>(o: Option<A>): A | null =>
  o._tag === 1 ? o.value : null

export const toUndefined = <A>(o: Option<A>): A | undefined =>
  o._tag === 1 ? o.value : undefined

export const toResult =
  <E>(defaultError: E) =>
  <A>(o: Option<A>): Result<A, E> =>
    o._tag === 1
      ? { _tag: 1, value: o.value }
      : { _tag: 0, error: defaultError }
