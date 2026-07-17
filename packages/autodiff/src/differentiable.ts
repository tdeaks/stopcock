import { backward, gradOf, variable, withTape } from './tape'
import type { DiffFn, Grad, GradReturn, UnvarsOf, Var } from './types'

const shapeGradient = <Args extends readonly unknown[]>(grads: Args): GradReturn<Args> =>
  (grads.length === 1 ? grads[0] : grads) as GradReturn<Args>

export function differentiable<Vs extends readonly Var<Grad>[]>(
  fn: (...args: Vs) => Var<number>,
): DiffFn<UnvarsOf<Vs>> {
  type Args = UnvarsOf<Vs>

  const makeInputs = (args: Args): Vs =>
    Array.from(args, arg => variable(arg as Grad)) as unknown as Vs

  return {
    forward: (...args: Args): number => withTape(() => {
      const inputs = makeInputs(args)
      return fn(...inputs).value
    }),

    gradient: (...args: Args): GradReturn<Args> => withTape((tape) => {
      const inputs = makeInputs(args)
      const output = fn(...inputs)
      backward(output, tape)
      const grads = inputs.map(input => gradOf(input, tape)) as unknown as Args
      return shapeGradient(grads)
    }),

    valueAndGradient: (...args: Args) => withTape((tape) => {
      const inputs = makeInputs(args)
      const output = fn(...inputs)
      backward(output, tape)
      const grads = inputs.map(input => gradOf(input, tape)) as unknown as Args
      return {
        value: output.value,
        gradient: shapeGradient(grads),
      }
    }),
  }
}
