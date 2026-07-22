export const identity: <A>(a: A) => A = (a) => a

export const always: <T, A>(a: A) => (_: T) => A = (a) => () => a

export const flip: <A, B, C>(fn: (a: A, b: B) => C) => (b: B, a: A) => C =
  (fn) => (b, a) => fn(a, b)

export const complement: <A>(pred: (a: A) => boolean) => (a: A) => boolean =
  (pred) => (a) => !pred(a)

export const once: <A, B>(fn: (a: A) => B) => (a: A) => B = <A, B>(fn: (a: A) => B) => {
  let called = false
  let result: B
  return (a: A) => {
    if (called) return result
    result = fn(a)
    called = true
    return result
  }
}

export const memoize: <A, B>(fn: (a: A) => B) => (a: A) => B = once

export const converge: <A, B, C>(after: (bs: B[]) => C, fns: Array<(a: A) => B>) => (a: A) => C =
  (after, fns) => (a) => after(fns.map((f) => f(a)))

export const juxt: <A, B>(fns: Array<(a: A) => B>) => (a: A) => B[] =
  (fns) => (a) => fns.map((f) => f(a))
