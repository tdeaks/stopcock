import { describe, expect, it } from 'vite-plus/test'
import { Vec as LaVec } from '@stopcock/la'
import { differentiable } from '../differentiable'
import { add, square, sub } from '../scalar'
import { vecAdd, vecDot, vecNorm, vecScale, vecSub, vecSum } from '../vec'
import { ShapeError, type Var, type Vec } from '../types'

const approxVec = (actual: Vec, expected: number[], digits = 8) => {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < actual.length; i++) expect(actual[i]).toBeCloseTo(expected[i], digits)
}

const directional = (f: (x: Vec) => number, x: Vec, d: Vec, h = 1e-5) => {
  const xp = LaVec.add(x, LaVec.scale(d, h))
  const xm = LaVec.sub(x, LaVec.scale(d, h))
  return (f(xp) - f(xm)) / (2 * h)
}

describe('vector ops', () => {
  it('computes elementwise and scale gradients', () => {
    const f = differentiable((v: Var<Vec>) =>
      vecSum(vecSub(v)(vecScale(2)(vecAdd(new Float64Array([1, 1, 1]))(v)))),
    )

    expect(f.forward(new Float64Array([1, 2, 3]))).toBe(12)
    approxVec(f.gradient(new Float64Array([1, 2, 3])), [1, 1, 1])
  })

  it('computes dot-product gradients', () => {
    const f = differentiable((a: Var<Vec>, b: Var<Vec>) => vecDot(b)(a))
    const [da, db] = f.gradient(new Float64Array([1, 2]), new Float64Array([3, 4]))

    approxVec(da, [3, 4])
    approxVec(db, [1, 2])
  })

  it('matches a random-direction numerical check', () => {
    const f = differentiable((v: Var<Vec>) => square(sub(5)(vecNorm(v))))
    const x = new Float64Array([3, 4, 5])
    const dir = LaVec.normalize(new Float64Array([2, -1, 3]))
    const grad = f.gradient(x)

    expect(LaVec.dot(grad, dir)).toBeCloseTo(directional(f.forward, x, dir), 4)
  })

  it('throws ShapeError for mismatched vector shapes', () => {
    const f = differentiable((x: Var<Vec>) => vecSum(vecAdd(new Float64Array([1, 2]))(x)))

    expect(() => f.forward(new Float64Array([1]))).toThrow(ShapeError)
  })

  it('reduces linear-regression loss with gradient descent', () => {
    const xs = [
      new Float64Array([1, 0]),
      new Float64Array([0, 1]),
      new Float64Array([1, 1]),
      new Float64Array([2, 1]),
    ]
    const ys = [2, -1, 1, 3]
    const loss = differentiable((w: Var<Vec>) => {
      let total = square(sub(ys[0])(vecDot(xs[0])(w)))
      for (let i = 1; i < xs.length; i++)
        total = add(square(sub(ys[i])(vecDot(xs[i])(w))))(total)
      return total
    })

    let w = new Float64Array([0, 0])
    const initial = loss.forward(w)
    for (let step = 0; step < 100; step++) {
      const grad = loss.gradient(w)
      w = LaVec.sub(w, LaVec.scale(grad, 0.03))
    }

    expect(loss.forward(w)).toBeLessThan(initial * 0.05)
  })
})
