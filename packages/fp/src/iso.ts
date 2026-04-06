export type Iso<S, A> = {
  readonly _tag: 'Iso'
  readonly get: (s: S) => A
  readonly reverseGet: (a: A) => S
}

export function iso<S, A>(get: (s: S) => A, reverseGet: (a: A) => S): Iso<S, A> {
  return { _tag: 'Iso', get, reverseGet }
}

export function reverse<S, A>(i: Iso<S, A>): Iso<A, S> {
  return iso(i.reverseGet, i.get)
}

export function compose<S, A, B>(outer: Iso<S, A>, inner: Iso<A, B>): Iso<S, B> {
  return iso(
    s => inner.get(outer.get(s)),
    b => outer.reverseGet(inner.reverseGet(b)),
  )
}
