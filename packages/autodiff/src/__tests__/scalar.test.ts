import { describe, expect, it } from 'vite-plus/test'
import { differentiable } from '../differentiable'
import { add, div, mul, neg, pow, square, sub } from '../scalar'
import type { Var } from '../types'

const numerical = (f: (x: number) => number, x: number, h = 1e-5) => (f(x + h) - f(x - h)) / (2 * h)

const numericalA = (f: (a: number, b: number) => number, a: number, b: number, h = 1e-5) =>
  (f(a + h, b) - f(a - h, b)) / (2 * h)

const numericalB = (f: (a: number, b: number) => number, a: number, b: number, h = 1e-5) =>
  (f(a, b + h) - f(a, b - h)) / (2 * h)

describe('scalar ops', () => {
  it.each([
    [
      'add',
      (a: Var<number>, b: Var<number>) => add(a, b),
      (a: Var<number>, b: Var<number>) => add(b)(a),
      (a: number, b: number) => a + b,
    ],
    [
      'sub',
      (a: Var<number>, b: Var<number>) => sub(a, b),
      (a: Var<number>, b: Var<number>) => sub(b)(a),
      (a: number, b: number) => a - b,
    ],
    [
      'mul',
      (a: Var<number>, b: Var<number>) => mul(a, b),
      (a: Var<number>, b: Var<number>) => mul(b)(a),
      (a: number, b: number) => a * b,
    ],
    [
      'div',
      (a: Var<number>, b: Var<number>) => div(a, b),
      (a: Var<number>, b: Var<number>) => div(b)(a),
      (a: number, b: number) => a / b,
    ],
    [
      'pow',
      (a: Var<number>, b: Var<number>) => pow(a, b),
      (a: Var<number>, b: Var<number>) => pow(b)(a),
      (a: number, b: number) => a ** b,
    ],
  ])('%s keeps data-first and data-last in parity', (_, direct, curried, raw) => {
    const directFn = differentiable((a: Var<number>, b: Var<number>) => direct(a, b))
    const curriedFn = differentiable((a: Var<number>, b: Var<number>) => curried(a, b))
    const a = 1.7
    const b = 0.8
    const [da, db] = directFn.gradient(a, b)

    expect(directFn.forward(a, b)).toBeCloseTo(curriedFn.forward(a, b), 10)
    expect(directFn.gradient(a, b)).toEqual(curriedFn.gradient(a, b))
    expect(da).toBeCloseTo(numericalA(raw, a, b), 4)
    expect(db).toBeCloseTo(numericalB(raw, a, b), 4)
  })

  it.each([
    ['neg', (x: Var<number>) => neg(x), (x: number) => -x],
    ['square', (x: Var<number>) => square(x), (x: number) => x * x],
  ])('%s matches central differences', (_, op, raw) => {
    const f = differentiable((x: Var<number>) => op(x))
    const x = -1.3

    expect(f.gradient(x)).toBeCloseTo(numerical(raw, x), 5)
  })

  it('does not compute the exponent gradient for constant exponents', () => {
    const f = differentiable((x: Var<number>) => pow(2)(x))

    expect(f.forward(-2)).toBe(4)
    expect(f.gradient(-2)).toBe(-4)
  })

  it('supports data-last scalar ops', () => {
    const f = differentiable((x: Var<number>) => add(5)(mul(2)(x)))

    expect(f.forward(3)).toBe(11)
    expect(f.gradient(3)).toBe(2)
  })

  it('supports data-first scalar ops', () => {
    const f = differentiable((x: Var<number>) => add(mul(x, 2), 5))

    expect(f.forward(3)).toBe(11)
    expect(f.gradient(3)).toBe(2)
  })
})
