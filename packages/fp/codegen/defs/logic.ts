import { dual } from './dual'
import * as RS from './Logic.gen'

// Arity 1. Predicate combinators (return predicates, no dual)
export const both: <A>(p1: (a: A) => boolean, p2: (a: A) => boolean) => (a: A) => boolean = RS.both
export const either: <A>(p1: (a: A) => boolean, p2: (a: A) => boolean) => (a: A) => boolean = RS.either
export const allPass: <A>(preds: ((a: A) => boolean)[]) => (a: A) => boolean = RS.allPass
export const anyPass: <A>(preds: ((a: A) => boolean)[]) => (a: A) => boolean = RS.anyPass

// Arity 2
export const equals: {
  <A>(a: A, b: A): boolean
  <A>(b: A): (a: A) => boolean
} = dual(2, RS.equals)

// RS.defaultTo has (fallback, opt). We want data-first as (opt, fallback)
export const defaultTo: {
  <A>(opt: A | undefined, fallback: A): A
  <A>(fallback: A): (opt: A | undefined) => A
} = dual(2, <A>(opt: A | undefined, fallback: A) => RS.defaultTo(fallback, opt))

// RS.cond has (conditions, value). We want data-first as (value, conditions)
export const cond: {
  <A, B>(value: A, conditions: [(a: A) => boolean, (a: A) => B][]): B | undefined
  <A, B>(conditions: [(a: A) => boolean, (a: A) => B][]): (value: A) => B | undefined
} = dual(2, <A, B>(value: A, conditions: [(a: A) => boolean, (a: A) => B][]) => RS.cond(conditions, value))

// Arity 3
export const when_: {
  <A>(value: A, pred: (a: A) => boolean, f: (a: A) => A): A
  <A>(pred: (a: A) => boolean, f: (a: A) => A): (value: A) => A
} = dual(3, RS.when_)

export const unless: {
  <A>(value: A, pred: (a: A) => boolean, f: (a: A) => A): A
  <A>(pred: (a: A) => boolean, f: (a: A) => A): (value: A) => A
} = dual(3, RS.unless)
