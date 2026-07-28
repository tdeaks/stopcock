import { Mat as LaMat } from '@stopcock/la'
import { asVar, record } from './tape'
import { ShapeError, type Mat, type Var } from './types'
import type { ScalarInput } from './scalar'

export type MatInput = Var<Mat> | Mat

const assertSameShape = (op: string, a: Mat, b: Mat) => {
  if (a.rows !== b.rows || a.cols !== b.cols)
    throw new ShapeError(`${op}: ${a.rows}x${a.cols} vs ${b.rows}x${b.cols}`)
}

const assertMatMulShape = (a: Mat, b: Mat) => {
  if (a.cols !== b.rows) throw new ShapeError(`matMul: ${a.rows}x${a.cols} vs ${b.rows}x${b.cols}`)
}

const matFilled = (rows: number, cols: number, value: number): Mat => {
  const data = new Float64Array(rows * cols)
  data.fill(value)
  return { data, rows, cols }
}

const matInner = (a: Mat, b: Mat): number => {
  assertSameShape('matScale', a, b)
  let sum = 0
  for (let i = 0; i < a.data.length; i++) sum += a.data[i] * b.data[i]
  return sum
}

export const matMul: (b: MatInput) => (a: MatInput) => Var<Mat> = (b) => (a) => {
  const av = asVar(a)
  const bv = asVar(b)
  assertMatMulShape(av.value, bv.value)
  return record(LaMat.multiply(av.value, bv.value), [av, bv], (grad) => [
    LaMat.multiply(grad, LaMat.transpose(bv.value)),
    LaMat.multiply(LaMat.transpose(av.value), grad),
  ])
}

export const matAdd: (b: MatInput) => (a: MatInput) => Var<Mat> = (b) => (a) => {
  const av = asVar(a)
  const bv = asVar(b)
  assertSameShape('matAdd', av.value, bv.value)
  return record(LaMat.add(av.value, bv.value), [av, bv], (grad) => [grad, grad])
}

export const matSub: (b: MatInput) => (a: MatInput) => Var<Mat> = (b) => (a) => {
  const av = asVar(a)
  const bv = asVar(b)
  assertSameShape('matSub', av.value, bv.value)
  return record(LaMat.sub(av.value, bv.value), [av, bv], (grad) => [grad, LaMat.scale(grad, -1)])
}

export const matScale: (s: ScalarInput) => (m: MatInput) => Var<Mat> = (s) => (m) => {
  const mv = asVar(m)
  const sv = asVar(s)
  return record(LaMat.scale(mv.value, sv.value), [mv, sv], (grad) => [
    LaMat.scale(grad, sv.value),
    matInner(grad, mv.value),
  ])
}

export const matTranspose = (m: MatInput): Var<Mat> => {
  const mv = asVar(m)
  return record(LaMat.transpose(mv.value), [mv], (grad) => [LaMat.transpose(grad)])
}

export const matSum = (m: MatInput): Var<number> => {
  const mv = asVar(m)
  let value = 0
  for (let i = 0; i < mv.value.data.length; i++) value += mv.value.data[i]
  return record(value, [mv], (grad) => [matFilled(mv.value.rows, mv.value.cols, grad)])
}

export const matMean = (m: MatInput): Var<number> => {
  const mv = asVar(m)
  let value = 0
  for (let i = 0; i < mv.value.data.length; i++) value += mv.value.data[i]
  const n = mv.value.data.length
  return record(value / n, [mv], (grad) => [matFilled(mv.value.rows, mv.value.cols, grad / n)])
}

export const matNormSquared = (m: MatInput): Var<number> => {
  const mv = asVar(m)
  let value = 0
  for (let i = 0; i < mv.value.data.length; i++) value += mv.value.data[i] * mv.value.data[i]
  return record(value, [mv], (grad) => [LaMat.scale(mv.value, 2 * grad)])
}
