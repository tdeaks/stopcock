/**
 * Untagged internal duals.
 *
 * Deliberately independent of `./dual` and `./opcodes`, in a separate module
 * from both: a non-fusible operation has no opcode and never will, so
 * routing it through the public tagged dispatcher -- or merely sharing a
 * source file with it -- makes every consumer bundle retain the opcode
 * table and the fusion-shaped wrappers even when tree-shaking otherwise
 * removes the unused tagged path. `benchmarks/src/reference/
 * s3b-untagged-size-gate.ts` and `packages/fp-compiler/src/__tests__/
 * hosts.test.ts`'s construction-module allowlist both measure exactly this
 * separation; a file merge that reads as a harmless rename regresses both.
 *
 * `arguments.length` dispatch, partial application, `this`, error, identity,
 * and allocation behavior match the untagged branches of the public `dual`.
 * The public API is unchanged and is not re-exported here.
 */

type AnyFunction = (...args: never[]) => unknown

export const dualUntagged2 = <Body extends AnyFunction, Operation extends AnyFunction>(
  body: Body,
): Operation =>
  function () {
    if (arguments.length >= 2) return (body as Function)(arguments[0], arguments[1])
    const a0 = arguments[0]
    return (data: unknown) => (body as Function)(data, a0)
  } as unknown as Operation

export const dualUntagged3 = <Body extends AnyFunction, Operation extends AnyFunction>(
  body: Body,
): Operation =>
  function () {
    if (arguments.length >= 3) {
      return (body as Function)(arguments[0], arguments[1], arguments[2])
    }
    const a0 = arguments[0],
      a1 = arguments[1]
    return (data: unknown) => (body as Function)(data, a0, a1)
  } as unknown as Operation

export const dualUntagged4 = <Body extends AnyFunction, Operation extends AnyFunction>(
  body: Body,
): Operation =>
  function () {
    if (arguments.length >= 4) {
      return (body as Function)(arguments[0], arguments[1], arguments[2], arguments[3])
    }
    const a0 = arguments[0],
      a1 = arguments[1],
      a2 = arguments[2]
    return (data: unknown) => (body as Function)(data, a0, a1, a2)
  } as unknown as Operation

/** Bounded fallback for arity 1 and 5+. Rest arguments only where unavoidable. */
export const dualUntaggedN = <Body extends AnyFunction, Operation extends AnyFunction>(
  arity: number,
  body: Body,
): Operation =>
  function (...args: unknown[]) {
    if (args.length >= arity) return (body as Function)(...args)
    return (data: unknown) => (body as Function)(data, ...args)
  } as unknown as Operation

interface InternalDual {
  <Body extends AnyFunction, Operation extends AnyFunction>(
    arity: Parameters<Body>['length'],
    body: Body,
  ): Operation
}

/**
 * Arity-dispatched form for a module that has not been migrated to a fixed
 * arity yet. A migrated module calls its exact `dualUntagged*` directly so its
 * bundle retains only that one wrapper.
 */
export const dual: InternalDual = ((arity: number, body: AnyFunction) =>
  arity === 2
    ? dualUntagged2(body)
    : arity === 3
      ? dualUntagged3(body)
      : arity === 4
        ? dualUntagged4(body)
        : dualUntaggedN(arity, body)) as InternalDual
