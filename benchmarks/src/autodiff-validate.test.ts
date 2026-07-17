import { describe, expect, it } from 'vitest'
import { differentiable, matMul, matNormSquared, sin, square, add, type Mat, type Var } from '@stopcock/autodiff'

const mat = (rows: number, cols: number, data: number[]): Mat => ({
  rows,
  cols,
  data: new Float64Array(data),
})

describe('autodiff regression baselines', () => {
  it('keeps a fixed scalar gradient stable', () => {
    const f = differentiable((x: Var<number>) => sin(add(square(x), 3)))

    expect(f.valueAndGradient(2)).toEqual({
      value: Math.sin(7),
      gradient: Math.cos(7) * 4,
    })
  })

  it('keeps a fixed matrix gradient stable', () => {
    const f = differentiable((a: Var<Mat>, b: Var<Mat>) =>
      matNormSquared(matMul(a, b))
    )
    const [ga, gb] = f.gradient(
      mat(2, 2, [1, 2, 3, 4]),
      mat(2, 1, [2, -1]),
    )

    expect(Array.from(ga.data)).toEqual([0, 0, 8, -4])
    expect(Array.from(gb.data)).toEqual([12, 16])
  })
})
