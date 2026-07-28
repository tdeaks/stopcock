import { Vec as LaVec } from '@stopcock/la'
import { asVar, record } from './tape'
import { ShapeError, type Vec, type Var } from './types'
import type { ScalarInput } from './scalar'

export type VecInput = Var<Vec> | Vec

const assertSameLength = (op: string, a: Vec, b: Vec) => {
  if (a.length !== b.length) throw new ShapeError(`${op}: ${a.length} vs ${b.length}`)
}

const ones = (n: number): Vec => {
  const out = new Float64Array(n)
  out.fill(1)
  return out
}

export const vecAdd: (b: VecInput) => (a: VecInput) => Var<Vec> = (b) => (a) => {
  const av = asVar(a)
  const bv = asVar(b)
  assertSameLength('vecAdd', av.value, bv.value)
  return record(LaVec.add(av.value, bv.value), [av, bv], (grad) => [grad, grad])
}

export const vecSub: (b: VecInput) => (a: VecInput) => Var<Vec> = (b) => (a) => {
  const av = asVar(a)
  const bv = asVar(b)
  assertSameLength('vecSub', av.value, bv.value)
  return record(LaVec.sub(av.value, bv.value), [av, bv], (grad) => [grad, LaVec.scale(grad, -1)])
}

export const vecScale: (s: ScalarInput) => (v: VecInput) => Var<Vec> = (s) => (v) => {
  const vv = asVar(v)
  const sv = asVar(s)
  return record(LaVec.scale(vv.value, sv.value), [vv, sv], (grad) => [
    LaVec.scale(grad, sv.value),
    LaVec.dot(grad, vv.value),
  ])
}

export const vecDot: (b: VecInput) => (a: VecInput) => Var<number> = (b) => (a) => {
  const av = asVar(a)
  const bv = asVar(b)
  assertSameLength('vecDot', av.value, bv.value)
  return record(LaVec.dot(av.value, bv.value), [av, bv], (grad) => [
    LaVec.scale(bv.value, grad),
    LaVec.scale(av.value, grad),
  ])
}

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
