import { dual } from '@stopcock/fp'
import { Vec as LaVec } from '@stopcock/la'
import { asVar, record } from './tape'
import { ShapeError, type Vec, type Var } from './types'
import type { ScalarInput } from './scalar'

export type VecInput = Var<Vec> | Vec

type BinaryVecOp = {
  (a: VecInput, b: VecInput): Var<Vec>
  (b: VecInput): (a: VecInput) => Var<Vec>
}

type VecScaleOp = {
  (v: VecInput, s: ScalarInput): Var<Vec>
  (s: ScalarInput): (v: VecInput) => Var<Vec>
}

type VecDotOp = {
  (a: VecInput, b: VecInput): Var<number>
  (b: VecInput): (a: VecInput) => Var<number>
}

const assertSameLength = (op: string, a: Vec, b: Vec) => {
  if (a.length !== b.length) throw new ShapeError(`${op}: ${a.length} vs ${b.length}`)
}

const ones = (n: number): Vec => {
  const out = new Float64Array(n)
  out.fill(1)
  return out
}

export const vecAdd = dual(2, (a: VecInput, b: VecInput): Var<Vec> => {
  const av = asVar(a)
  const bv = asVar(b)
  assertSameLength('vecAdd', av.value, bv.value)
  return record(LaVec.add(av.value, bv.value), [av, bv], (grad) => [grad, grad])
}) as BinaryVecOp

export const vecSub = dual(2, (a: VecInput, b: VecInput): Var<Vec> => {
  const av = asVar(a)
  const bv = asVar(b)
  assertSameLength('vecSub', av.value, bv.value)
  return record(LaVec.sub(av.value, bv.value), [av, bv], (grad) => [grad, LaVec.scale(grad, -1)])
}) as BinaryVecOp

export const vecScale = dual(2, (v: VecInput, s: ScalarInput): Var<Vec> => {
  const vv = asVar(v)
  const sv = asVar(s)
  return record(LaVec.scale(vv.value, sv.value), [vv, sv], (grad) => [
    LaVec.scale(grad, sv.value),
    LaVec.dot(grad, vv.value),
  ])
}) as VecScaleOp

export const vecDot = dual(2, (a: VecInput, b: VecInput): Var<number> => {
  const av = asVar(a)
  const bv = asVar(b)
  assertSameLength('vecDot', av.value, bv.value)
  return record(LaVec.dot(av.value, bv.value), [av, bv], (grad) => [
    LaVec.scale(bv.value, grad),
    LaVec.scale(av.value, grad),
  ])
}) as VecDotOp

export const vecNorm = (v: VecInput): Var<number> => {
  const vv = asVar(v)
  const value = LaVec.norm(vv.value)
  return record(value, [vv], (grad) => [
    value === 0 ? new Float64Array(vv.value.length) : LaVec.scale(vv.value, grad / value),
  ])
}

export const vecSum = (v: VecInput): Var<number> => {
  const vv = asVar(v)
  let value = 0
  for (let i = 0; i < vv.value.length; i++) value += vv.value[i]
  return record(value, [vv], (grad) => [LaVec.scale(ones(vv.value.length), grad)])
}
