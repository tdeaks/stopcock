import { describe, expect, it } from 'vite-plus/test'
import { NoActiveTapeError, type Var } from '../types'
import { accumulate, backward, currentTape, gradOf, variable, withTape } from '../tape'
import { differentiable } from '../differentiable'
import { add, mul } from '../scalar'
import { vecAdd } from '../vec'

describe('tape', () => {
  it('throws outside an active tape', () => {
    expect(() => currentTape()).toThrow(NoActiveTapeError)
    expect(() => mul(3)(2)).toThrow(NoActiveTapeError)
    expect(() => vecAdd(new Float64Array([1, 2]))(new Float64Array([1]))).toThrow(NoActiveTapeError)
  })

  it('records leaf variables without cloning their values', () => {
    const value = new Float64Array([1, 2, 3])

    withTape((tape) => {
      const v = variable(value)
      expect(v.value).toBe(value)
      expect(tape.entries[v.id].value).toBe(value)
    })
  })

  it('accumulates fan-out gradients instead of overwriting', () => {
    withTape((tape) => {
      const x = variable(3)
      const y = mul(x)(x)

      backward(y, tape)

      expect(gradOf(x, tape)).toBe(6)
    })
  })

  it('clones vector and matrix gradients on accumulation', () => {
    const vector = new Float64Array([1, 2])
    const vectorGrad = accumulate(undefined, vector) as Float64Array
    vector[0] = 99
    expect(Array.from(vectorGrad)).toEqual([1, 2])

    const matrix = { data: new Float64Array([3, 4]), rows: 1, cols: 2 }
    const matrixGrad = accumulate(undefined, matrix) as typeof matrix
    matrix.data[0] = 99
    expect(Array.from(matrixGrad.data)).toEqual([3, 4])
  })

  it('keeps nested differentiable tapes independent', () => {
    const outer = differentiable((x: Var<number>) => {
      const inner = differentiable((y: Var<number>) => mul(y)(y))
      return add(inner.gradient(3))(mul(x)(x))
    })

    expect(outer.forward(2)).toBe(10)
    expect(outer.gradient(2)).toBe(4)
  })
})
