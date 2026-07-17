import { describe, expect, it } from 'vitest'
import { pipe } from '@stopcock/fp'
import { differentiable } from '../differentiable'
import { sin } from '../math'
import { add, mul, square } from '../scalar'
import type { Var } from '../types'

describe('differentiable', () => {
  it('runs the plan example end to end', () => {
    const f = differentiable((x: Var<number>) => sin(add(square(x), 3)))

    expect(f.forward(2)).toBeCloseTo(Math.sin(7), 10)
    expect(f.gradient(2)).toBeCloseTo(Math.cos(7) * 4, 6)
  })

  it('records through untagged pipe stages', () => {
    const piped = differentiable((x: Var<number>) =>
      pipe(x, square, add(3), sin)
    )
    const nested = differentiable((x: Var<number>) => sin(add(square(x), 3)))

    expect(piped.forward(2)).toBeCloseTo(nested.forward(2), 10)
    expect(piped.gradient(2)).toBeCloseTo(nested.gradient(2), 10)
  })

  it('returns tuples for multi-input gradients', () => {
    const f = differentiable((x: Var<number>, y: Var<number>) =>
      add(mul(x, y), square(x))
    )

    expect(f.gradient(2, 3)).toEqual([7, 2])
  })

  it('shares the forward pass for valueAndGradient', () => {
    let calls = 0
    const f = differentiable((x: Var<number>) => {
      calls++
      return square(x)
    })

    expect(f.valueAndGradient(4)).toEqual({ value: 16, gradient: 8 })
    expect(calls).toBe(1)
  })
})
