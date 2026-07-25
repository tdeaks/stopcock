/**
 * Trusted operator provenance.
 *
 * The public `_op`/`_fn`/`_a1`/`_a2` fields are forgeable: any caller can set
 * them on any function. They stay for compatibility and diagnostics, but they
 * no longer authorize anything. Only a function this package constructed
 * itself appears in the module-private table below, and only that table can
 * promote a step to a fused plan.
 *
 * The table is a plain module-scoped `WeakMap`. It is not exported from the
 * package, there is no registrar in the public API, and two copies of this
 * module hold two separate tables, so a duplicate install cannot lend
 * provenance to another instance.
 *
 * `trusted` means internally constructed and authenticated. It does not mean
 * pure, exact, fast, worker-safe, corpus-verified, or release-qualified;
 * those facts come from the generated semantic definitions, and the planner
 * checks them separately.
 */

export interface TrustedOperatorEntry {
  /** Runtime opcode resolved at generation time, never from caller input. */
  readonly op: number
  readonly fn?: unknown
  readonly a1?: unknown
  readonly a2?: unknown
}

const TRUSTED = new WeakMap<object, TrustedOperatorEntry>()

/**
 * Records an operator this package just constructed. Callers cannot reach this
 * function: it is absent from the package export map, and every argument comes
 * from generated code rather than user input.
 */
export const registerTrustedOperator = <T extends object>(
  operator: T,
  op: number,
  fn?: unknown,
  a1?: unknown,
  a2?: unknown,
): T => {
  TRUSTED.set(operator, { op, fn, a1, a2 })
  return operator
}

/** Undefined for anything this package did not construct. */
export const trustedOperatorEntry = (candidate: unknown): TrustedOperatorEntry | undefined =>
  typeof candidate === 'function' ? TRUSTED.get(candidate as unknown as object) : undefined
