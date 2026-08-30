import { asVar, record } from './tape'
import type { Var } from './types'

export type ScalarInput = Var<number> | number

type BinaryScalar = {
  (a: ScalarInput, b: ScalarInput): Var<number>
  (b: ScalarInput): (a: ScalarInput) => Var<number>
}

const binaryScalar = (body: (a: ScalarInput, b: ScalarInput) => Var<number>): BinaryScalar =>
  function binaryScalar(b: ScalarInput, __df?: ScalarInput): any {
    if (arguments.length >= 2) return binaryScalar(__df as ScalarInput)(b)
    return (a: ScalarInput): Var<number> => body(a, b)
  }

export const add = binaryScalar((a, b) => {
  const av = asVar(a)
  const bv = asVar(b)
  return record(av.value + bv.value, [av, bv], (grad) => [grad, grad])
})

export const sub = binaryScalar((a, b) => {
  const av = asVar(a)
  const bv = asVar(b)
  return record(av.value - bv.value, [av, bv], (grad) => [grad, -grad])
})

export const mul = binaryScalar((a, b) => {
  const av = asVar(a)
  const bv = asVar(b)
  return record(av.value * bv.value, [av, bv], (grad) => [grad * bv.value, grad * av.value])
})

export const div = binaryScalar((a, b) => {
  const av = asVar(a)
  const bv = asVar(b)
  return record(av.value / bv.value, [av, bv], (grad) => [
    grad / bv.value,
    -(grad * av.value) / (bv.value * bv.value),
  ])
})

export const neg = (x: ScalarInput): Var<number> => {
  const xv = asVar(x)
  return record(-xv.value, [xv], (grad) => [-grad])
}

export const square = (x: ScalarInput): Var<number> => {
  const xv = asVar(x)
  return record(xv.value * xv.value, [xv], (grad) => [2 * grad * xv.value])
}

export const pow = binaryScalar((a, b) => {
  const exponentIsVar = asVar(b).id >= 0
  const av = asVar(a)
  const bv = asVar(b)
  const value = av.value ** bv.value
  return record(value, [av, bv], (grad) => [
    grad * bv.value * av.value ** (bv.value - 1),
    exponentIsVar ? grad * value * Math.log(av.value) : 0,
  ])
})
