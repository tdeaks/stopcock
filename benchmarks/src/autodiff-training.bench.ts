import { bench, describe } from 'vite-plus/test'
import { Vec } from '@stopcock/la'
import {
  add,
  differentiable,
  matMul,
  matNormSquared,
  matSub,
  square,
  sub,
  vecDot,
  type Mat,
  type Var,
  type Vec as AdVec,
} from '@stopcock/autodiff'

const linearXs = [
  new Float64Array([1, 0]),
  new Float64Array([0, 1]),
  new Float64Array([1, 1]),
  new Float64Array([2, 1]),
]
const linearYs = [2, -1, 1, 3]

const linearLoss = differentiable((w: Var<AdVec>) => {
  let total = square(sub(vecDot(w, linearXs[0]), linearYs[0]))
  for (let i = 1; i < linearXs.length; i++)
    total = add(total, square(sub(vecDot(w, linearXs[i]), linearYs[i])))
  return total
})

const runLinearRegression = () => {
  let w = new Float64Array([0, 0])
  for (let step = 0; step < 100; step++) {
    const grad = linearLoss.gradient(w)
    w = Vec.sub(w, Vec.scale(grad, 0.03))
  }
  return linearLoss.forward(w)
}

const mat = (rows: number, cols: number, data: number[]): Mat => ({
  rows,
  cols,
  data: new Float64Array(data),
})

const x = mat(4, 2, [0, 0, 0, 1, 1, 0, 1, 1])
const y = mat(4, 1, [0, -1, 2, 1])

const matrixLoss = differentiable((w1: Var<Mat>, w2: Var<Mat>) =>
  matNormSquared(matSub(matMul(matMul(x, w1), w2), y)),
)

const runTwoLayerLinearModel = () => {
  let w1 = mat(2, 2, [0.2, -0.1, 0.1, 0.3])
  let w2 = mat(2, 1, [0.4, -0.2])

  for (let step = 0; step < 100; step++) {
    const [g1, g2] = matrixLoss.gradient(w1, w2)
    const w1Data = new Float64Array(w1.data.length)
    const w2Data = new Float64Array(w2.data.length)
    for (let i = 0; i < w1Data.length; i++) w1Data[i] = w1.data[i] - 0.01 * g1.data[i]
    for (let i = 0; i < w2Data.length; i++) w2Data[i] = w2.data[i] - 0.01 * g2.data[i]
    w1 = { rows: w1.rows, cols: w1.cols, data: w1Data }
    w2 = { rows: w2.rows, cols: w2.cols, data: w2Data }
  }

  return matrixLoss.forward(w1, w2)
}

describe('autodiff training loops', () => {
  bench('linear regression 100 steps', () => runLinearRegression())
  bench('two-layer matrix model 100 steps', () => runTwoLayerLinearModel())
})
