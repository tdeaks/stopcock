/**
 * The optimizer's only route to a plan.
 *
 * FP builds and authenticates it; this just reshapes the vetted result into the
 * `BoundPlan` the lowerer already consumes. There is deliberately no plan
 * builder in this package: a second one could segment a pipeline differently
 * from the one FP enforces, and the two disagreeing about where a boundary
 * falls is precisely the class of bug the ABI exists to make impossible.
 */
import { vetPipeline, type BoundPlan } from '@stopcock/fp/abi'

export function buildPlan(steps: readonly unknown[]): BoundPlan {
  const vetted = vetPipeline(steps)
  return {
    shape: { codes: vetted.codes, segments: vetted.segments },
    bindings: vetted.bindings,
  }
}
