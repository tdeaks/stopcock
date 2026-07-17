import { describe, expectTypeOf, it } from 'vitest'
import { differentiable } from '../differentiable'
import { add, mul, square } from '../scalar'
import { vecDot } from '../vec'
import type { Var, Vec } from '../types'

describe('differentiable types', () => {
  it('unboxes unary scalar gradients', () => {
    const f = differentiable((x: Var<number>) => square(x))

    expectTypeOf(f.forward).parameters.toEqualTypeOf<[number]>()
    expectTypeOf(f.gradient(2)).toEqualTypeOf<number>()
  })

  it('keeps multi-input gradients as tuples', () => {
    const f = differentiable((x: Var<number>, y: Var<number>) => add(mul(x, y), x))

    expectTypeOf(f.gradient(1, 2)).toEqualTypeOf<readonly [number, number]>()
  })

  it('preserves vector gradient shapes', () => {
    const f = differentiable((w: Var<Vec>, x: Var<Vec>) => vecDot(w, x))
    const w = new Float64Array([1, 2])
    const x = new Float64Array([3, 4])

    expectTypeOf(f.gradient(w, x)).toEqualTypeOf<readonly [Vec, Vec]>()
  })
})
