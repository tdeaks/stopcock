import { describe, expect, it } from 'vite-plus/test'
import { differentiable } from '../differentiable'
import {
  matAdd,
  matMean,
  matMul,
  matNormSquared,
  matScale,
  matSub,
  matSum,
  matTranspose,
} from '../mat'
import { ShapeError, type Mat, type Var } from '../types'

const mat = (rows: number, cols: number, data: number[]): Mat => ({
  data: new Float64Array(data),
  rows,
  cols,
})

const approxMat = (actual: Mat, expected: number[], digits = 8) => {
  expect(actual.data.length).toBe(expected.length)
  for (let i = 0; i < actual.data.length; i++)
    expect(actual.data[i]).toBeCloseTo(expected[i], digits)
}

const matInner = (a: Mat, b: Mat) => {
  let sum = 0
  for (let i = 0; i < a.data.length; i++) sum += a.data[i] * b.data[i]
  return sum
}

const perturb = (a: Mat, d: Mat, h: number): Mat => {
  const data = new Float64Array(a.data.length)
  for (let i = 0; i < data.length; i++) data[i] = a.data[i] + h * d.data[i]
  return { data, rows: a.rows, cols: a.cols }
}

const directional = (f: (x: Mat) => number, x: Mat, d: Mat, h = 1e-5) =>
  (f(perturb(x, d, h)) - f(perturb(x, d, -h))) / (2 * h)

describe('matrix ops', () => {
  it('computes transpose, scale, sum, and mean gradients', () => {
    const sumLoss = differentiable((m: Var<Mat>) => matSum(matScale(2)(matTranspose(m))))
    const meanLoss = differentiable((m: Var<Mat>) => matMean(m))
    const m = mat(2, 2, [1, 2, 3, 4])

    approxMat(sumLoss.gradient(m), [2, 2, 2, 2])
    approxMat(meanLoss.gradient(m), [0.25, 0.25, 0.25, 0.25])
  })

  it('computes matMul gradients against central differences', () => {
    const target = mat(2, 2, [1, -1, 0.5, 2])
    const loss = differentiable((a: Var<Mat>, b: Var<Mat>) =>
      matNormSquared(matSub(target)(matMul(b)(a))),
    )
    const a = mat(2, 3, [1, 2, -1, 0, 1, 3])
    const b = mat(3, 2, [2, -1, 0.5, 1, -2, 3])
    const dirA = mat(2, 3, [0.2, -0.4, 0.1, 0.3, -0.1, 0.5])
    const dirB = mat(3, 2, [-0.2, 0.1, 0.4, -0.3, 0.2, 0.5])
    const [gradA, gradB] = loss.gradient(a, b)

    expect(matInner(gradA, dirA)).toBeCloseTo(
      directional((x) => loss.forward(x, b), a, dirA),
      3,
    )
    expect(matInner(gradB, dirB)).toBeCloseTo(
      directional((x) => loss.forward(a, x), b, dirB),
      3,
    )
  })

  it('accumulates matrix fan-out gradients', () => {
    const f = differentiable((m: Var<Mat>) => matNormSquared(matAdd(m)(m)))
    const grad = f.gradient(mat(2, 2, [1, -2, 3, -4]))

    approxMat(grad, [8, -16, 24, -32])
  })

  it('throws ShapeError for mismatched matrix shapes', () => {
    const addLoss = differentiable((m: Var<Mat>) => matSum(matAdd(mat(1, 2, [1, 2]))(m)))
    const mulLoss = differentiable((m: Var<Mat>) => matSum(matMul(mat(4, 1, [1, 2, 3, 4]))(m)))

    expect(() => addLoss.forward(mat(2, 2, [1, 2, 3, 4]))).toThrow(ShapeError)
    expect(() => mulLoss.forward(mat(2, 2, [1, 2, 3, 4]))).toThrow(ShapeError)
  })

  it('reduces a matrix model loss with gradient descent', () => {
    const x = mat(4, 2, [0, 0, 0, 1, 1, 0, 1, 1])
    const y = mat(4, 1, [0, -1, 2, 1])
    const loss = differentiable((w: Var<Mat>) => matNormSquared(matSub(y)(matMul(w)(x))))

    let w = mat(2, 1, [0, 0])
    const initial = loss.forward(w)
    for (let step = 0; step < 120; step++) {
      const grad = loss.gradient(w)
      const data = new Float64Array(w.data.length)
      for (let i = 0; i < data.length; i++) data[i] = w.data[i] - 0.04 * grad.data[i]
      w = { data, rows: w.rows, cols: w.cols }
    }

    expect(loss.forward(w)).toBeLessThan(initial)
  })
})
