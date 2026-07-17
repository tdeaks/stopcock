import { describe, expect, it } from 'vitest'
import { pipe } from '@stopcock/fp'
import { differentiable } from '../differentiable'
import { abs, cos, exp, leakyRelu, log, relu, sigmoid, sin, softplus, sqrt, tan, tanh } from '../math'
import { add, mul, square, sub } from '../scalar'
import type { Var } from '../types'

const numerical = (f: (x: number) => number, x: number, h = 1e-5) =>
  (f(x + h) - f(x - h)) / (2 * h)

describe('math ops', () => {
  it.each([
    ['sin', (x: Var<number>) => sin(x), Math.sin, 0.7, 1e-5],
    ['cos', (x: Var<number>) => cos(x), Math.cos, 0.7, 1e-5],
    ['tan', (x: Var<number>) => tan(x), Math.tan, 0.4, 1e-4],
    ['exp', (x: Var<number>) => exp(x), Math.exp, 0.7, 1e-5],
    ['log', (x: Var<number>) => log(x), Math.log, 1.7, 1e-5],
    ['sqrt', (x: Var<number>) => sqrt(x), Math.sqrt, 1.7, 1e-5],
    ['abs', (x: Var<number>) => abs(x), Math.abs, -1.7, 1e-5],
    ['tanh', (x: Var<number>) => tanh(x), Math.tanh, 0.7, 1e-5],
    ['sigmoid', (x: Var<number>) => sigmoid(x), (x: number) => 1 / (1 + Math.exp(-x)), 0.7, 1e-5],
    ['relu', (x: Var<number>) => relu(x), (x: number) => Math.max(0, x), 0.7, 1e-5],
    ['softplus', (x: Var<number>) => softplus(x), (x: number) => Math.log1p(Math.exp(x)), 0.7, 1e-5],
  ])('%s matches central differences', (_, op, raw, x, tol) => {
    const f = differentiable((v: Var<number>) => op(v))

    expect(f.gradient(x)).toBeCloseTo(numerical(raw, x), tol)
  })

  it('handles leakyRelu on both sides of zero', () => {
    const f = differentiable((x: Var<number>) => leakyRelu(0.2)(x))

    expect(f.gradient(2)).toBe(1)
    expect(f.gradient(-2)).toBe(0.2)
    expect(f.gradient(0)).toBe(0.2)
  })

  it('matches central differences for a composite chain', () => {
    const f = differentiable((x: Var<number>) =>
      pipe(
        x,
        square,
        add(0.5),
        sin,
        mul(1.2),
        sub(0.1),
        tanh,
        exp,
        log,
      )
    )
    const x = 0.4

    expect(f.gradient(x)).toBeCloseTo(numerical(f.forward, x), 4)
  })

  it('documents subgradient and NaN edge behaviour', () => {
    expect(differentiable((x: Var<number>) => abs(x)).gradient(0)).toBe(0)
    expect(differentiable((x: Var<number>) => relu(x)).gradient(0)).toBe(0)
    expect(differentiable((x: Var<number>) => sqrt(x)).gradient(0)).toBe(Number.POSITIVE_INFINITY)
    expect(differentiable((x: Var<number>) => log(x)).gradient(0)).toBeNaN()
    expect(differentiable((x: Var<number>) => log(x)).gradient(-1)).toBeNaN()
  })
})
