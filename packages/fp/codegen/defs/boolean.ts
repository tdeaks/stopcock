import { dual } from './dual'
import * as RS from './Boolean.gen'

// Arity 1
export const not_: (a: boolean) => boolean = RS.not_

// Arity 2
export const and_: {
  (a: boolean, b: boolean): boolean
  (b: boolean): (a: boolean) => boolean
} = dual(2, RS.and_)

export const or_: {
  (a: boolean, b: boolean): boolean
  (b: boolean): (a: boolean) => boolean
} = dual(2, RS.or_)

// Arity 3
export const ifElse: {
  <A>(cond: boolean, onTrue: () => A, onFalse: () => A): A
  <A>(onTrue: () => A, onFalse: () => A): (cond: boolean) => A
} = dual(3, RS.ifElse)
