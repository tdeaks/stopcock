import { describe, expectTypeOf, it } from 'vite-plus/test'
import { leakyRelu } from '../math'
import { matAdd, matMul, matScale, matSub, type MatInput } from '../mat'
import { add, div, mul, pow, sub, type ScalarInput } from '../scalar'
import { accumulate, backward, gradOf, record } from '../tape'
import type { Grad, Mat, Tape, Var, Vec } from '../types'
import { vecAdd, vecDot, vecScale, vecSub, type VecInput } from '../vec'

describe('dual operation types', () => {
  it('keeps both scalar branches', () => {
    const x = null as unknown as Var<number>

    expectTypeOf(add(x, 2)).toEqualTypeOf<Var<number>>()
    expectTypeOf(add(2)).toEqualTypeOf<(a: ScalarInput) => Var<number>>()
    expectTypeOf(sub(x, 2)).toEqualTypeOf<Var<number>>()
    expectTypeOf(sub(2)).toEqualTypeOf<(a: ScalarInput) => Var<number>>()
    expectTypeOf(mul(x, 2)).toEqualTypeOf<Var<number>>()
    expectTypeOf(mul(2)).toEqualTypeOf<(a: ScalarInput) => Var<number>>()
    expectTypeOf(div(x, 2)).toEqualTypeOf<Var<number>>()
    expectTypeOf(div(2)).toEqualTypeOf<(a: ScalarInput) => Var<number>>()
    expectTypeOf(pow(x, 2)).toEqualTypeOf<Var<number>>()
    expectTypeOf(pow(2)).toEqualTypeOf<(a: ScalarInput) => Var<number>>()
    expectTypeOf(leakyRelu(x, 0.2)).toEqualTypeOf<Var<number>>()
    expectTypeOf(leakyRelu(0.2)).toEqualTypeOf<(x: ScalarInput) => Var<number>>()
  })

  it('keeps both vector branches', () => {
    const a = null as unknown as Var<Vec>
    const b = new Float64Array([1, 2])
    const s = null as unknown as Var<number>

    expectTypeOf(vecAdd(a, b)).toEqualTypeOf<Var<Vec>>()
    expectTypeOf(vecAdd(b)).toEqualTypeOf<(a: VecInput) => Var<Vec>>()
    expectTypeOf(vecSub(a, b)).toEqualTypeOf<Var<Vec>>()
    expectTypeOf(vecSub(b)).toEqualTypeOf<(a: VecInput) => Var<Vec>>()
    expectTypeOf(vecScale(a, s)).toEqualTypeOf<Var<Vec>>()
    expectTypeOf(vecScale(s)).toEqualTypeOf<(v: VecInput) => Var<Vec>>()
    expectTypeOf(vecDot(a, b)).toEqualTypeOf<Var<number>>()
    expectTypeOf(vecDot(b)).toEqualTypeOf<(a: VecInput) => Var<number>>()
  })

  it('keeps both matrix branches', () => {
    const a = null as unknown as Var<Mat>
    const b = null as unknown as Mat
    const s = null as unknown as Var<number>

    expectTypeOf(matAdd(a, b)).toEqualTypeOf<Var<Mat>>()
    expectTypeOf(matAdd(b)).toEqualTypeOf<(a: MatInput) => Var<Mat>>()
    expectTypeOf(matSub(a, b)).toEqualTypeOf<Var<Mat>>()
    expectTypeOf(matSub(b)).toEqualTypeOf<(a: MatInput) => Var<Mat>>()
    expectTypeOf(matMul(a, b)).toEqualTypeOf<Var<Mat>>()
    expectTypeOf(matMul(b)).toEqualTypeOf<(a: MatInput) => Var<Mat>>()
    expectTypeOf(matScale(a, s)).toEqualTypeOf<Var<Mat>>()
    expectTypeOf(matScale(s)).toEqualTypeOf<(m: MatInput) => Var<Mat>>()
  })

  it('keeps both tape branches', () => {
    const x = null as unknown as Var<number>
    const tape = null as unknown as Tape
    const parents: readonly Var<Grad>[] = [x]
    const scalarBackward = (grad: number): readonly Grad[] => [grad]
    const scalarValue: number = 1

    expectTypeOf(accumulate(undefined, 1)).toEqualTypeOf<Grad>()
    expectTypeOf(accumulate(1)).toEqualTypeOf<(existing: Grad | undefined) => Grad>()
    expectTypeOf(record(scalarValue, parents, scalarBackward)).toEqualTypeOf<Var<number>>()
    expectTypeOf(record(parents, scalarBackward)).toEqualTypeOf<(value: number) => Var<number>>()
    expectTypeOf(backward(x, tape)).toEqualTypeOf<void>()
    expectTypeOf(backward(tape)).toEqualTypeOf<(output: Var<Grad>) => void>()
    expectTypeOf(gradOf(x, tape)).toEqualTypeOf<number>()
    expectTypeOf(gradOf(tape)(x)).toEqualTypeOf<number>()
  })
})
