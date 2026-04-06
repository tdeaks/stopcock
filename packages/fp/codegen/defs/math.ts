import { dual } from './dual'
import * as RS from './Math.gen'

// Arity 1 — tagged for scalar JIT
export const inc: (n: number) => number = dual(1, RS.inc, { op: 'inc' })
export const dec: (n: number) => number = dual(1, RS.dec, { op: 'dec' })
export const negate: (n: number) => number = dual(1, RS.negate, { op: 'negate' })
export const product: (arr: number[]) => number = RS.product

// Arity 2 — tagged for scalar JIT (v=v+n, v=v*n, etc.)
export const add: {
  (a: number, b: number): number
  (b: number): (a: number) => number
} = dual(2, RS.add, { op: 'add' })

export const subtract: {
  (a: number, b: number): number
  (b: number): (a: number) => number
} = dual(2, RS.subtract, { op: 'subtract' })

export const multiply: {
  (a: number, b: number): number
  (b: number): (a: number) => number
} = dual(2, RS.multiply, { op: 'multiply' })

export const divide: {
  (a: number, b: number): number
  (b: number): (a: number) => number
} = dual(2, RS.divide, { op: 'divide' })

export const modulo: {
  (a: number, b: number): number
  (b: number): (a: number) => number
} = dual(2, RS.modulo)
