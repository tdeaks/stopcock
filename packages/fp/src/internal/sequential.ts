/**
 * Dependency-free sequential pipe/flow.
 *
 * Left to right, one call per step, nothing else: no plan, no registry, no
 * provenance, no caches. It imports nothing, so a consumer that only uses this
 * retains none of the fusion engine.
 *
 * Deliberately not connected to root yet. S8 makes root `pipe`/`flow` use it,
 * and owns the public overload surface at that point; this module is here so
 * that change is a rewire rather than a rewrite.
 */

type AnyStep = (value: never) => unknown

const applyAll = (value: unknown, steps: readonly AnyStep[]): unknown => {
  let current = value
  for (let i = 0; i < steps.length; i++) {
    current = (steps[i] as (input: unknown) => unknown)(current)
  }
  return current
}

export function sequentialPipe(value: unknown, ...steps: readonly AnyStep[]): unknown {
  // Arity dispatch for the common lengths avoids the loop and the rest-array
  // allocation, matching what the fusion engine does for its own fast paths.
  switch (steps.length) {
    case 0:
      return value
    case 1:
      return (steps[0] as (input: unknown) => unknown)(value)
    case 2:
      return (steps[1] as (input: unknown) => unknown)(
        (steps[0] as (input: unknown) => unknown)(value),
      )
    case 3:
      return (steps[2] as (input: unknown) => unknown)(
        (steps[1] as (input: unknown) => unknown)((steps[0] as (input: unknown) => unknown)(value)),
      )
    default:
      return applyAll(value, steps)
  }
}

export function sequentialFlow(...steps: readonly AnyStep[]): (value: unknown) => unknown {
  if (steps.length === 1) return steps[0] as (value: unknown) => unknown
  return (value: unknown) => applyAll(value, steps)
}
