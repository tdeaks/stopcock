import type { Option } from './option'
import type { Result } from './result'
import { some, none, isSome } from './option'
import { dual } from './dual'

export type Prism<S, A> = {
  readonly _tag: 'Prism'
  readonly getOption: (s: S) => Option<A>
  readonly set: (s: S, a: A) => S
}

export function prism<S, A>(getOption: (s: S) => Option<A>, set: (s: S, a: A) => S): Prism<S, A> {
  return { _tag: 'Prism', getOption, set }
}

export function fromPredicate<A>(pred: (a: A) => boolean): Prism<A, A> {
  return prism(
    a => pred(a) ? some(a) : none,
    (_, a) => a,
  )
}

function some_<A>(): Prism<Option<A>, A> {
  return prism(
    o => o,
    (_, a) => some(a),
  )
}
export { some_ as some }

export function ok<A, E>(): Prism<Result<A, E>, A> {
  return prism(
    r => r._tag === 1 ? some(r.value) : none,
    (r, a) => r._tag === 1 ? { _tag: 1, value: a } : r,
  )
}

export const preview: {
  <S, A>(s: S, prism: Prism<S, A>): Option<A>
  <S, A>(prism: Prism<S, A>): (s: S) => Option<A>
} = dual(2, <S, A>(s: S, p: Prism<S, A>): Option<A> => p.getOption(s))

export const set: {
  <S, A>(s: S, prism: Prism<S, A>, a: A): S
  <S, A>(prism: Prism<S, A>, a: A): (s: S) => S
} = dual(3, <S, A>(s: S, p: Prism<S, A>, a: A): S => {
  return isSome(p.getOption(s)) ? p.set(s, a) : s
})

export const over: {
  <S, A>(s: S, prism: Prism<S, A>, f: (a: A) => A): S
  <S, A>(prism: Prism<S, A>, f: (a: A) => A): (s: S) => S
} = dual(3, <S, A>(s: S, p: Prism<S, A>, f: (a: A) => A): S => {
  const opt = p.getOption(s)
  return isSome(opt) ? p.set(s, f(opt.value)) : s
})

export function compose<S, A, B>(outer: Prism<S, A>, inner: Prism<A, B>): Prism<S, B> {
  return prism(
    s => {
      const a = outer.getOption(s)
      return isSome(a) ? inner.getOption(a.value) : none
    },
    (s, b) => {
      const a = outer.getOption(s)
      if (!isSome(a)) return s
      return outer.set(s, inner.set(a.value, b))
    },
  )
}
