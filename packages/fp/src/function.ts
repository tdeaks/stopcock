import {
  identity as _identity,
  always as _always,
  flip as _flip,
  complement as _complement,
  memoize as _memoize,
  once as _once,
  converge as _converge,
  juxt as _juxt,
} from './Function.gen'

export const identity: <A>(a: A) => A = _identity
export const always: <T, A>(a: A) => (_: T) => A = _always
export const flip: <A, B, C>(fn: (a: A, b: B) => C) => (b: B, a: A) => C = _flip
export const complement: <A>(pred: (a: A) => boolean) => (a: A) => boolean = _complement
export const memoize: <A, B>(fn: (a: A) => B) => (a: A) => B = _memoize
export const once: <A, B>(fn: (a: A) => B) => (a: A) => B = _once
export const converge: <A, B, C>(after: (bs: B[]) => C, fns: Array<(a: A) => B>) => (a: A) => C = _converge
export const juxt: <A, B>(fns: Array<(a: A) => B>) => (a: A) => B[] = _juxt
