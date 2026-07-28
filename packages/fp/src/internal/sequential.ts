/**
 * Dependency-free sequential pipe/flow.
 *
 * Left to right, one call per step, nothing else: no plan, no registry, no
 * provenance, no caches. It imports nothing, so a consumer that only uses this
 * retains none of the fusion engine -- because there is no fusion engine left
 * to retain. `pipe.ts`, `flow.ts`, `fusion.ts`, and `compile.ts` all own their
 * public overload surface and delegate the runtime work here.
 *
 * Every step is invoked as `steps[i](value)` -- a property-access call, never
 * hoisted into a local first -- so an opaque step observes the step vector
 * itself as `this`, exactly as `@stopcock/fp-compiler`'s own codegen for an
 * unrecognized ("opaque") tail step does (see fp-compiler's
 * prefix-residual.test.ts).
 *
 * `steps` is a real rest parameter, not a manually-built array read off
 * `arguments`: a rest parameter is populated with define, not set,
 * semantics, so building it can't be hijacked by an inherited accessor an
 * adversarial (or just instrumented) caller planted on `Array.prototype` --
 * `arr[i] = value` would silently call that accessor's setter instead of
 * storing the step, corrupting the pipeline with no error until the missing
 * step is later called as `undefined(...)`. `pipe.ts` declares this same
 * rest parameter directly and applies it with its own loop, rather than
 * forwarding here through a second rest-collect and spread call, which is
 * what made root `pipe` slower than the frozen pre-hot-identity dispatch
 * baseline before.
 */

type Fn = (value: unknown) => unknown

export function sequentialPipe(value: unknown, ...steps: readonly Fn[]): unknown {
  if (steps.length === 0) return value
  let current = steps[0](value)
  for (let i = 1; i < steps.length; i++) current = steps[i](current)
  return current
}

export function sequentialFlow(...steps: readonly Fn[]): (value: unknown) => unknown {
  if (steps.length === 1) return steps[0]
  return (value: unknown): unknown => {
    let current = steps[0](value)
    for (let i = 1; i < steps.length; i++) current = steps[i](current)
    return current
  }
}
