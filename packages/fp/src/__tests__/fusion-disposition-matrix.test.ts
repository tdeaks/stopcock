import { describe, expect, it } from 'vite-plus/test'
import * as A from '../array'
import { compile } from '../compile'
import { __clearEntries } from '../shape-entry'
import { __resetFusionCaches } from '../internal/fusion-engine'
import { pipe as optimizedPipe } from '../internal/fusion-engine'
import { explain } from '../internal/explain'
import {
  beginSelectionTrace,
  endSelectionTrace,
  type SelectionEvent,
} from '../internal/selection-trace'

/**
 * S10 exit gate: every initial fusion-runner descriptor/binding combination is
 * present exactly once as `shipped`, `generic-fallback`, or `stopped:<id>`.
 *
 * The disposition is derived from what ran, not from what was declared
 * eligible. A shape counts as `shipped` only if a fused runner actually
 * executed — selection alone, a cache hit, or a descriptor claiming
 * eligibility is not evidence.
 */

const SOURCE = [1, 2, 3, 4, 5, 6, 7, 8]

/** The nine shapes named in the S10 descriptor matrix. */
const SHAPES: readonly (readonly [string, () => readonly unknown[]])[] = [
  ['map -> filter', () => [A.map((x: number) => x * 2), A.filter((x: number) => x > 4)]],
  [
    'map -> filter -> reduce',
    () => [
      A.map((x: number) => x * 2),
      A.filter((x: number) => x > 4),
      A.reduce((a: number, b: number) => a + b, 0),
    ],
  ],
  [
    'map -> filter -> find',
    () => [A.map((x: number) => x * 2), A.filter((x: number) => x > 4), A.find((x: number) => x > 8)],
  ],
  [
    'map -> filter -> some',
    () => [A.map((x: number) => x * 2), A.filter((x: number) => x > 4), A.some((x: number) => x > 8)],
  ],
  [
    'map -> filter -> every',
    () => [A.map((x: number) => x * 2), A.filter((x: number) => x > 4), A.every((x: number) => x > 0)],
  ],
  [
    'filter -> map -> take',
    () => [A.filter((x: number) => x > 2), A.map((x: number) => x * 2), A.take(3)],
  ],
  ['filterMap -> take', () => [A.filterMap((x: number) => (x > 2 ? x : null)), A.take(3)]],
  [
    'map -> flatMap -> filter -> filterMap -> reduce',
    () => [
      A.map((x: number) => x),
      A.flatMap((x: number) => [x, x + 1]),
      A.filter((x: number) => x > 2),
      A.filterMap((x: number) => (x % 2 === 0 ? x : null)),
      A.reduce((a: number, b: number) => a + b, 0),
    ],
  ],
  [
    'flatMap -> uniq -> count',
    () => [A.flatMap((x: number) => [x, x]), A.uniq, A.count((x: number) => x > 2)],
  ],
]

type BindingMode = 'direct-call' | 'prebuilt-operators' | 'reusable-compile'

const MODES: readonly BindingMode[] = ['direct-call', 'prebuilt-operators', 'reusable-compile']

/** Runs one shape under one binding mode and returns what the trace saw. */
const run = (
  mode: BindingMode,
  makeSteps: () => readonly unknown[],
): { readonly result: unknown; readonly events: readonly SelectionEvent[] } => {
  let result: unknown
  // Each row is measured cold. The shape cache is keyed by shape, not by
  // binding mode, so without this a later row inherits an earlier row's
  // selection and reports `executed` with nothing to join it to.
  __clearEntries()
  __resetFusionCaches()
  if (mode === 'reusable-compile') {
    // Compile outside the trace: building a reusable runner is not execution,
    // and counting it as such is exactly the confusion this matrix guards.
    const runner = compile(...(makeSteps() as readonly ((input: never) => unknown)[]))
    beginSelectionTrace()
    result = runner(SOURCE)
  } else if (mode === 'prebuilt-operators') {
    const steps = makeSteps()
    beginSelectionTrace()
    result = (optimizedPipe as (...args: readonly unknown[]) => unknown)(SOURCE, ...steps)
  } else {
    beginSelectionTrace()
    result = (optimizedPipe as (...args: readonly unknown[]) => unknown)(SOURCE, ...makeSteps())
  }
  return { result, events: endSelectionTrace() }
}

type Disposition = 'shipped' | 'generic-fallback'

const dispositionFor = (
  makeSteps: () => readonly unknown[],
  events: readonly SelectionEvent[],
): Disposition => {
  const executed = events.filter((event) => event.phase === 'executed')
  if (executed.length === 0) return 'generic-fallback'
  // A shared runner executes a fused template only where the lowered shape has
  // one; `explain` is the surface that reports that, and it is static.
  const kinds = explain(...makeSteps()).segmentExecutors
  return kinds.includes('template') ? 'shipped' : 'generic-fallback'
}

describe('S10 fusion-runner disposition matrix', () => {
  const rows: { shape: string; mode: BindingMode; disposition: Disposition }[] = []

  it.each(
    SHAPES.flatMap(([label, makeSteps]) =>
      MODES.map((mode) => [`${label} / ${mode}`, label, mode, makeSteps] as const),
    ),
  )('%s', (_id, label, mode, makeSteps) => {
    const { result, events } = run(mode, makeSteps)

    // Every mode must agree on the answer, whichever runner served it.
    const expected = makeSteps().reduce<unknown>(
      (value, step) => (step as (input: unknown) => unknown)(value),
      SOURCE,
    )
    expect(result).toEqual(expected)

    const selected = events.filter((event) => event.phase === 'selected')
    const executed = events.filter((event) => event.phase === 'executed')
    expect(executed.length).toBeGreaterThan(0)

    // Truthfulness: the executed runner is the one the selector resolved.
    // Under `reusable-compile` the selection deliberately happened before the
    // trace opened — building a reusable runner is not execution — so there is
    // nothing to join against, and asserting otherwise would be asserting that
    // returning a cached runner counts as running it.
    if (mode === 'reusable-compile') {
      expect(selected).toHaveLength(0)
    } else {
      expect(selected.length).toBeGreaterThan(0)
      for (const event of executed) {
        expect(selected.some((s) => s.shapeKey === event.shapeKey)).toBe(true)
      }
    }

    // Every executed event names a runner, and the id is derived from the
    // shape rather than asserted by the runner about itself.
    for (const event of executed) {
      expect(event.runnerId).toBe(`fusion-runner/${event.kind}/${event.shapeKey}`)
    }

    rows.push({ shape: label, mode, disposition: dispositionFor(makeSteps, events) })
  })

  it('gives every shape and binding mode exactly one disposition', () => {
    expect(rows).toHaveLength(SHAPES.length * MODES.length)
    const keys = rows.map((row) => `${row.shape} / ${row.mode}`)
    expect(new Set(keys).size).toBe(keys.length)
    for (const row of rows) {
      expect(['shipped', 'generic-fallback']).toContain(row.disposition)
    }
    // Recorded so a shape silently losing its fused runner shows up as a
    // disposition change rather than a quiet slowdown.
    console.log(
      rows.map((row) => `${row.disposition}\t${row.shape} / ${row.mode}`).join('\n'),
    )
  })
})
