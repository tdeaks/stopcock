/**
 * Runner selection tracing.
 *
 * S10 requires selection to be observable and checked against the runner
 * actually invoked. That distinction is not pedantic here: `bindCriticalRunner`
 * hand-binds `map -> filter` and the long flatMap reduce shape, bypassing the
 * template bank, and it can still hand control back to the shared runner at a
 * size threshold. A diagnostic derived from the template lookup would report a
 * shared runner for a call that ran hand-bound code.
 *
 * So `selected` is emitted by the branch that resolves a runner, and `executed`
 * only once control is inside one. Eligibility, a cache lookup, or returning a
 * reusable runner is never execution evidence.
 *
 * Off by default: `events` is null, so the recorded path is a single null check
 * that never allocates.
 */

/**
 * Which runner family the selector resolved.
 *
 * `bound` is a hand-bound critical closure; `shared` is the cached ShapeEntry
 * runner. Whether that shared runner executes a fused template or the generic
 * stage machine is a property of the lowered shape, and is what
 * `explain().segmentExecutors` reports — it is not a selection outcome, so it
 * is deliberately not a third value here.
 */
export type SelectionKind = 'bound' | 'shared'

export interface SelectionEvent {
  readonly phase: 'selected' | 'executed'
  readonly kind: SelectionKind
  readonly runnerId: string
  /** Opcode sequence of the shape being run, for joining to a descriptor. */
  readonly shapeKey: string
}

let events: SelectionEvent[] | null = null

export const runnerIdFor = (kind: SelectionKind, shapeKey: string): string =>
  `fusion-runner/${kind}/${shapeKey}`

export function beginSelectionTrace(): void {
  events = []
}

export function endSelectionTrace(): readonly SelectionEvent[] {
  const recorded = events ?? []
  events = null
  return recorded
}

export function isTracingSelection(): boolean {
  return events !== null
}

export function recordSelection(
  phase: 'selected' | 'executed',
  kind: SelectionKind,
  shapeKey: string,
): void {
  if (events === null) return
  events.push({ phase, kind, runnerId: runnerIdFor(kind, shapeKey), shapeKey })
}
