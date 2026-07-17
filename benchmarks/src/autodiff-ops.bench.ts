import { bench, describe } from 'vitest'
import { Mat } from '@stopcock/la'
import {
  add,
  differentiable,
  matMul,
  matNormSquared,
  sin,
  square,
  vecDot,
  type Mat as AdMat,
  type Var,
  type Vec as AdVec,
} from '@stopcock/autodiff'

class Value {
  grad = 0

  constructor(
    readonly data: number,
    private readonly prev: readonly Value[] = [],
    private readonly backwardFn: () => void = () => {},
  ) {}

  add(other: number | Value) {
    const rhs = other instanceof Value ? other : new Value(other)
    const out = new Value(this.data + rhs.data, [this, rhs], () => {
      this.grad += out.grad
      rhs.grad += out.grad
    })
    return out
  }

  mul(other: number | Value) {
    const rhs = other instanceof Value ? other : new Value(other)
    const out = new Value(this.data * rhs.data, [this, rhs], () => {
      this.grad += rhs.data * out.grad
      rhs.grad += this.data * out.grad
    })
    return out
  }

  sin() {
    const out = new Value(Math.sin(this.data), [this], () => {
      this.grad += Math.cos(this.data) * out.grad
    })
    return out
  }

  square() {
    return this.mul(this)
  }

  backward() {
    const topo: Value[] = []
    const seen = new Set<Value>()
    const visit = (v: Value) => {
      if (seen.has(v)) return
      seen.add(v)
      for (const child of v.prev) visit(child)
      topo.push(v)
    }
    visit(this)
    this.grad = 1
    for (let i = topo.length - 1; i >= 0; i--) topo[i].backwardFn()
  }
}

const scalarSteps = 17

const scalarAd = differentiable((x: Var<number>) => {
  let y = x
  for (let i = 0; i < scalarSteps; i++)
    y = sin(add(square(y), 0.001))
  return y
})

const scalarAnalytical = (x0: number) => {
  let x = x0
  let dx = 1
  for (let i = 0; i < scalarSteps; i++) {
    const squared = x * x
    const shifted = squared + 0.001
    dx = Math.cos(shifted) * 2 * x * dx
    x = Math.sin(shifted)
  }
  return dx
}

const scalarMicrograd = (x0: number) => {
  let x = new Value(x0)
  const input = x
  for (let i = 0; i < scalarSteps; i++)
    x = x.square().add(0.001).sin()
  x.backward()
  return input.grad
}

describe('autodiff scalar gradient', () => {
  bench('stopcock 50-op-ish chain', () => scalarAd.gradient(0.2))
  bench('analytical gradient', () => scalarAnalytical(0.2))
  bench('micrograd-style scalar tape', () => scalarMicrograd(0.2))
})

const v1000 = new Float64Array(1000).map((_, i) => Math.sin(i / 10))
const v1000b = new Float64Array(1000).map((_, i) => Math.cos(i / 10))
const dotAd = differentiable((v: Var<AdVec>) => vecDot(v, v1000b))

describe('autodiff vector gradient', () => {
  bench('stopcock vecDot gradient 1000d', () => dotAd.gradient(v1000))
  bench('analytical vecDot gradient 1000d', () => new Float64Array(v1000b))
})

const randomMat = (rows: number, cols: number): AdMat => ({
  rows,
  cols,
  data: new Float64Array(rows * cols).map((_, i) => Math.sin(i / 7)),
})

const a64 = randomMat(64, 64)
const b64 = randomMat(64, 64)
const matAd = differentiable((a: Var<AdMat>, b: Var<AdMat>) =>
  matNormSquared(matMul(a, b))
)

const analyticalMatMulGrad = (a: AdMat, b: AdMat) => {
  const out = Mat.multiply(a, b)
  const g = Mat.scale(out, 2)
  return [
    Mat.multiply(g, Mat.transpose(b)),
    Mat.multiply(Mat.transpose(a), g),
  ] as const
}

describe('autodiff matrix gradient', () => {
  bench('stopcock 64x64 matMul gradient', () => matAd.gradient(a64, b64))
  bench('analytical 64x64 matMul gradient', () => analyticalMatMulGrad(a64, b64))
})
