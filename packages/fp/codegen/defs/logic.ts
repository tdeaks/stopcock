import { dual } from './dual'

// Structural equality (deep, arrays/dates/plain-objects)
function structEq(a: any, b: any): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== typeof b) return false
  if (typeof a !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!structEq(a[i], b[i])) return false
    return true
  }
  if (a instanceof Date && b instanceof Date) return +a === +b
  for (const k in a) if (!structEq(a[k], b[k])) return false
  for (const k in b) if (!(k in a)) return false
  return true
}

// Arity 1. Predicate combinators (return predicates, no dual)
export const both: <A>(p1: (a: A) => boolean, p2: (a: A) => boolean) => (a: A) => boolean =
  (p1: any, p2: any) => (x: any) => (p1(x) ? p2(x) : false)
export const either: <A>(p1: (a: A) => boolean, p2: (a: A) => boolean) => (a: A) => boolean =
  (p1: any, p2: any) => (x: any) => (p1(x) ? true : p2(x))
export const allPass: <A>(preds: ((a: A) => boolean)[]) => (a: A) => boolean = (preds: any) => (x: any) => {
  for (let i = 0; i < preds.length; i++) if (!preds[i](x)) return false
  return true
}
export const anyPass: <A>(preds: ((a: A) => boolean)[]) => (a: A) => boolean = (preds: any) => (x: any) => {
  for (let i = 0; i < preds.length; i++) if (preds[i](x)) return true
  return false
}

// Arity 2
export const equals: {
  <A>(a: A, b: A): boolean
  <A>(b: A): (a: A) => boolean
} = dual(2, structEq)

// Data-first as (opt, fallback)
export const defaultTo: {
  <A>(opt: A | undefined, fallback: A): A
  <A>(fallback: A): (opt: A | undefined) => A
} = dual(2, <A>(opt: A | undefined, fallback: A) => (opt !== undefined ? opt : fallback))

// Data-first as (value, conditions)
export const cond: {
  <A, B>(value: A, conditions: [(a: A) => boolean, (a: A) => B][]): B | undefined
  <A, B>(conditions: [(a: A) => boolean, (a: A) => B][]): (value: A) => B | undefined
} = dual(2, <A, B>(value: A, conditions: [(a: A) => boolean, (a: A) => B][]) => {
  for (let i = 0; i < conditions.length; i++) {
    const [pred, f] = conditions[i]
    if (pred(value)) return f(value)
  }
  return undefined
})

// Arity 3
export const when_: {
  <A>(value: A, pred: (a: A) => boolean, f: (a: A) => A): A
  <A>(pred: (a: A) => boolean, f: (a: A) => A): (value: A) => A
} = dual(3, (value: any, pred: any, f: any) => {
  if (pred(value)) {
    return f(value);
  } else {
    return value;
  }
})

export const unless: {
  <A>(value: A, pred: (a: A) => boolean, f: (a: A) => A): A
  <A>(pred: (a: A) => boolean, f: (a: A) => A): (value: A) => A
} = dual(3, (value: any, pred: any, f: any) => {
  if (pred(value)) {
    return value;
  } else {
    return f(value);
  }
})
