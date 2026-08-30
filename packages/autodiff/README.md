# @stopcock/autodiff

Reverse-mode automatic differentiation for scalar, vector, and matrix values.
Autodiff operations record to an ambient tape, so they compose naturally with
`pipe()` while avoiding the fused operation path that would hide the tape.
Operations with two data inputs support both direct data-first and curried
data-last calls under the same name.

```bash
bun add @stopcock/autodiff
```

## Dual operation reference

The left call is direct and data-first. The right call is the equivalent
data-last form.

```ts
add(a, b) / add(b)(a)
sub(a, b) / sub(b)(a)
mul(a, b) / mul(b)(a)
div(a, b) / div(b)(a)
pow(a, exponent) / pow(exponent)(a)
leakyRelu(value, alpha) / leakyRelu(alpha)(value)

vecAdd(a, b) / vecAdd(b)(a)
vecSub(a, b) / vecSub(b)(a)
vecScale(vector, scalar) / vecScale(scalar)(vector)
vecDot(a, b) / vecDot(b)(a)

matAdd(a, b) / matAdd(b)(a)
matSub(a, b) / matSub(b)(a)
matMul(a, b) / matMul(b)(a)
matScale(matrix, scalar) / matScale(scalar)(matrix)

accumulate(existing, incoming) / accumulate(incoming)(existing)
record(value, parents, backwardFn) / record(parents, backwardFn)(value)
backward(output, tape) / backward(tape)(output)
gradOf(variable, tape) / gradOf(tape)(variable)
```

## Scalar gradients

Annotate the callback parameters as `Var<...>` so TypeScript can infer the
input tuple.

```ts
import { pipe } from '@stopcock/fp'
import { differentiable, sin, square, add, type Var } from '@stopcock/autodiff'

const f = differentiable((x: Var<number>) => pipe(x, square, add(3), sin))

f.forward(2) // Math.sin(7)
f.gradient(2) // Math.cos(7) * 4
```

Use `valueAndGradient()` when you need both results from one forward pass.

## Linear regression

Vectors use `Float64Array`. Raw vectors and numbers are auto-lifted as
constants, so the only values you annotate are differentiable inputs.

```ts
import { differentiable, add, square, sub, vecDot, type Var, type Vec } from '@stopcock/autodiff'

const xs = [new Float64Array([1, 0]), new Float64Array([0, 1]), new Float64Array([1, 1])]
const ys = [2, -1, 1]

const loss = differentiable((w: Var<Vec>) => {
  let total = square(sub(vecDot(w, xs[0]), ys[0]))
  for (let i = 1; i < xs.length; i++) total = add(total, square(sub(vecDot(w, xs[i]), ys[i])))
  return total
})

let w = new Float64Array([0, 0])
for (let i = 0; i < 100; i++) {
  const grad = loss.gradient(w)
  w = new Float64Array([w[0] - 0.03 * grad[0], w[1] - 0.03 * grad[1]])
}
```

## Matrix loss

Matrices are `{ data: Float64Array; rows: number; cols: number }`.

```ts
import {
  differentiable,
  matMul,
  matNormSquared,
  matSub,
  type Mat,
  type Var,
} from '@stopcock/autodiff'

const x: Mat = { rows: 4, cols: 2, data: new Float64Array([0, 0, 0, 1, 1, 0, 1, 1]) }
const y: Mat = { rows: 4, cols: 1, data: new Float64Array([0, -1, 2, 1]) }

const loss = differentiable((w: Var<Mat>) => matNormSquared(matSub(matMul(x, w), y)))

const gradient = loss.gradient({ rows: 2, cols: 1, data: new Float64Array([0, 0]) })
```

## Lower-level tape API

Most users should prefer `differentiable()`, but the tape primitives are public
for manual control:

```ts
import { withTape, variable, backward, gradOf } from '@stopcock/autodiff'
import { record } from '@stopcock/autodiff/tape'

withTape((tape) => {
  const x = variable(3)
  const parents = [x]
  const doubleBackward = (grad: number) => [grad * 2]

  const y = record(x.value * 2, parents, doubleBackward)
  // Equivalent data-last form:
  // record(parents, doubleBackward)(x.value * 2)

  backward(y, tape)
  gradOf(x, tape) // 2
})
```

## Notes

- Outputs are scalar in v1. Vector-output Jacobians are intentionally deferred.
- Operations are synchronous. Do not `await` inside a differentiable callback.
- Vector and matrix ops validate shapes at the autodiff boundary and throw
  `ShapeError` on mismatches.
- The benchmark suite includes scalar, vector, matrix, and training workloads;
  published reports live at <https://stopcock.dev/performance/benchmarks>.
