import { dual } from './dual'

export type Traversal<S, A> = {
  readonly _tag: 'Traversal'
  readonly getAll: (s: S) => A[]
  readonly modify: (s: S, f: (a: A) => A) => S
}

export function traversal<S, A>(getAll: (s: S) => A[], modify: (s: S, f: (a: A) => A) => S): Traversal<S, A> {
  return { _tag: 'Traversal', getAll, modify }
}

export function each<A>(): Traversal<A[], A> {
  return traversal(
    s => [...s],
    (s, f) => s.map(f),
  )
}

export function filtered<A>(pred: (a: A) => boolean): Traversal<A[], A> {
  return traversal(
    s => s.filter(pred),
    (s, f) => s.map(a => pred(a) ? f(a) : a),
  )
}

export function compose<S, A, B>(outer: Traversal<S, A>, inner: Traversal<A, B>): Traversal<S, B> {
  return traversal(
    s => outer.getAll(s).flatMap(a => inner.getAll(a)),
    (s, f) => outer.modify(s, a => inner.modify(a, f)),
  )
}

export const toArray: {
  <S, A>(s: S, traversal: Traversal<S, A>): A[]
  <S, A>(traversal: Traversal<S, A>): (s: S) => A[]
} = dual(2, <S, A>(s: S, t: Traversal<S, A>): A[] => t.getAll(s))

export const modify: {
  <S, A>(s: S, traversal: Traversal<S, A>, f: (a: A) => A): S
  <S, A>(traversal: Traversal<S, A>, f: (a: A) => A): (s: S) => S
} = dual(3, <S, A>(s: S, t: Traversal<S, A>, f: (a: A) => A): S => t.modify(s, f))

export const set: {
  <S, A>(s: S, traversal: Traversal<S, A>, value: A): S
  <S, A>(traversal: Traversal<S, A>, value: A): (s: S) => S
} = dual(3, <S, A>(s: S, t: Traversal<S, A>, value: A): S => t.modify(s, () => value))
