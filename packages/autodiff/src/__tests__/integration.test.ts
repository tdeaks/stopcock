import { describe, expect, it } from 'vite-plus/test'
import { differentiable } from '../differentiable'
import { add, mul, square, sub } from '../scalar'
import { sigmoid } from '../math'
import type { Var } from '../types'

const predict = (
  x1: number,
  x2: number,
  w11: Var<number>,
  w12: Var<number>,
  w21: Var<number>,
  w22: Var<number>,
  b1: Var<number>,
  b2: Var<number>,
  v1: Var<number>,
  v2: Var<number>,
  c: Var<number>,
) => {
  const h1 = sigmoid(add(add(mul(w11, x1), mul(w21, x2)), b1))
  const h2 = sigmoid(add(add(mul(w12, x1), mul(w22, x2)), b2))
  return sigmoid(add(add(mul(v1, h1), mul(v2, h2)), c))
}

describe('autodiff integration', () => {
  it('reduces loss for a tiny hand-written XOR MLP', () => {
    const samples = [
      [0, 0, 0],
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
    ] as const

    const loss = differentiable(
      (
        w11: Var<number>,
        w12: Var<number>,
        w21: Var<number>,
        w22: Var<number>,
        b1: Var<number>,
        b2: Var<number>,
        v1: Var<number>,
        v2: Var<number>,
        c: Var<number>,
      ) => {
        let total = square(
          sub(
            predict(samples[0][0], samples[0][1], w11, w12, w21, w22, b1, b2, v1, v2, c),
            samples[0][2],
          ),
        )
        for (let i = 1; i < samples.length; i++) {
          const [x1, x2, y] = samples[i]
          total = add(total, square(sub(predict(x1, x2, w11, w12, w21, w22, b1, b2, v1, v2, c), y)))
        }
        return total
      },
    )

    let params = [1.5, -1.5, 1.5, -1.5, -0.5, 2.5, 1.5, 1.5, -1.2] as const
    const initial = loss.forward(...params)

    for (let epoch = 0; epoch < 1000; epoch++) {
      const grad = loss.gradient(...params)
      params = params.map((value, i) => value - 0.8 * grad[i]) as typeof params
    }

    expect(loss.forward(...params)).toBeLessThan(initial * 0.35)
  })
})
