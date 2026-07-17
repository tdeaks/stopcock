import { dual } from '@stopcock/fp'
import { asVar, record } from './tape'
import type { Var } from './types'
import type { ScalarInput } from './scalar'

const sigmoidValue = (x: number): number => {
  if (x >= 0) {
    const z = Math.exp(-x)
    return 1 / (1 + z)
  }
  const z = Math.exp(x)
  return z / (1 + z)
}

export const sin = (x: ScalarInput): Var<number> => {
  const xv = asVar(x)
  return record(Math.sin(xv.value), [xv], grad => [grad * Math.cos(xv.value)])
}

export const cos = (x: ScalarInput): Var<number> => {
  const xv = asVar(x)
  return record(Math.cos(xv.value), [xv], grad => [-grad * Math.sin(xv.value)])
}

export const tan = (x: ScalarInput): Var<number> => {
  const xv = asVar(x)
  return record(Math.tan(xv.value), [xv], grad => {
    const c = Math.cos(xv.value)
    return [c === 0 ? Number.NaN : grad / (c * c)]
  })
}

export const exp = (x: ScalarInput): Var<number> => {
  const xv = asVar(x)
  const value = Math.exp(xv.value)
  return record(value, [xv], grad => [grad * value])
}

export const log = (x: ScalarInput): Var<number> => {
  const xv = asVar(x)
  return record(Math.log(xv.value), [xv], grad => [
    xv.value <= 0 ? Number.NaN : grad / xv.value,
  ])
}

export const sqrt = (x: ScalarInput): Var<number> => {
  const xv = asVar(x)
  const value = Math.sqrt(xv.value)
  return record(value, [xv], grad => [
    xv.value < 0 ? Number.NaN : grad / (2 * value),
  ])
}

export const abs = (x: ScalarInput): Var<number> => {
  const xv = asVar(x)
  return record(Math.abs(xv.value), [xv], grad => [
    xv.value > 0 ? grad : xv.value < 0 ? -grad : 0,
  ])
}

export const tanh = (x: ScalarInput): Var<number> => {
  const xv = asVar(x)
  const value = Math.tanh(xv.value)
  return record(value, [xv], grad => [grad * (1 - value * value)])
}

export const sigmoid = (x: ScalarInput): Var<number> => {
  const xv = asVar(x)
  const value = sigmoidValue(xv.value)
  return record(value, [xv], grad => [grad * value * (1 - value)])
}

export const relu = (x: ScalarInput): Var<number> => {
  const xv = asVar(x)
  return record(Math.max(0, xv.value), [xv], grad => [
    xv.value > 0 ? grad : 0,
  ])
}

type LeakyReluOp = {
  (x: ScalarInput, alpha: number): Var<number>
  (alpha: number): (x: ScalarInput) => Var<number>
}

export const leakyRelu = dual(2, (x: ScalarInput, alpha: number): Var<number> => {
  const xv = asVar(x)
  const value = xv.value > 0 ? xv.value : alpha * xv.value
  return record(value, [xv], grad => [
    xv.value > 0 ? grad : grad * alpha,
  ])
}) as LeakyReluOp

export const softplus = (x: ScalarInput): Var<number> => {
  const xv = asVar(x)
  const value = xv.value > 0
    ? xv.value + Math.log1p(Math.exp(-xv.value))
    : Math.log1p(Math.exp(xv.value))
  return record(value, [xv], grad => [grad * sigmoidValue(xv.value)])
}
