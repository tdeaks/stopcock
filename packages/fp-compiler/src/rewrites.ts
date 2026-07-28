import type { PlanStep } from './plan-ir'
import type { CompilerSemantics } from './types'

/**
 * Phase 5: rewrites are a fixed, ordered list of peepholes over the plan's
 * op array, applied once (no fixpoint) before segmentation/codegen. Every
 * entry is justified by pure facts on the ops whose work it deletes, plus
 * corpus cases proving output is unchanged when it fires and that it does
 * not fire when the deleted work could be observed. No pattern DSL, no cost
 * model: each rewrite is its own small function, tried in order.
 */
export interface PlanRewrite {
  readonly kind: 'elide-unused-map'
  /** Map steps whose values cannot affect the following length terminal. */
  readonly elidedStepIndexes: readonly number[]
  readonly terminalIndex: number
}

/**
 * `map* |> length` -> `length`. Gated on `mode === 'pure'`, the exact
 * mechanism `assumePure` compiles down to: `transform.ts` sets `semantics =
 * options.assumePure === true ? 'pure' : 'exact'` (or forces `'pure'` per
 * call site through `compilePure`), and `createStaticCompilerPlan` only
 * calls this matcher when `input.mode === 'pure'`. Every map between the
 * nearest boundary and the `length` terminal has its return value thrown
 * away by `length`, so under the caller's opt-in guarantee that map
 * callbacks have no side effects, the callbacks need never run. Without
 * `assumePure` this never matches -- a plain map still calls its callback
 * once per element, in order, exactly as written.
 */
function matchElideUnusedMap(
  steps: readonly PlanStep[],
  mode: CompilerSemantics,
): PlanRewrite | undefined {
  if (mode !== 'pure') return undefined
  for (let terminalPosition = 1; terminalPosition < steps.length; terminalPosition++) {
    const terminalStep = steps[terminalPosition]
    if (terminalStep.kind !== 'operator' || terminalStep.fact.name !== 'length') continue
    let streamStart = terminalPosition
    while (streamStart > 0) {
      const previous = steps[streamStart - 1]
      if (previous.kind !== 'operator' || previous.fact.compilerPipelineRole !== 'element') break
      streamStart--
    }
    const elidedStepIndexes: number[] = []
    for (let position = streamStart; position < terminalPosition; position++) {
      const step = steps[position]
      if (step.kind !== 'operator' || step.fact.name !== 'map') {
        elidedStepIndexes.length = 0
        break
      }
      elidedStepIndexes.push(step.index)
    }
    if (elidedStepIndexes.length > 0) {
      return { kind: 'elide-unused-map', elidedStepIndexes, terminalIndex: terminalStep.index }
    }
  }
  return undefined
}

/**
 * `filter |> length` -> a counting loop, no output array. Unconditional --
 * unlike the map/length elision above, this never skips a callback: the
 * predicate still runs once per element, in original order, the same
 * number of times either way. Only the intermediate array disappears, and
 * that array is never observable (it is a fused segment's own temp, never
 * bound to anything the source program can see).
 *
 * `compile`/`compilePure` already get this for free: their plans use the
 * `'fused-streams'` execution layout, where a `filter` immediately followed
 * by `length` lands in the same stream segment and the ordinary
 * element+terminal codegen (length's own `emit: { kind: 'sink' }` template,
 * a bare `${next}++`) already avoids allocating anything. The gap is a bare
 * `pipe()`/`flow()` call: its plan's `sourceTier` is `'sequential'`, so
 * `segmentPlan` uses the `'sequential-stages'` layout and gives every step
 * its own segment, matching what the uncompiled sequential runtime does
 * stage by stage. That per-stage split is what actually materializes the
 * filtered array before reading `.length` off it. This matcher finds
 * exactly that adjacent, otherwise-unmerged pair so codegen can splice them
 * back into one segment and hand it to the same element+terminal path.
 */
export interface FusibleStep {
  readonly index: number
  readonly step: { readonly name: string }
}
export interface FusibleSegment {
  readonly kind: string
  readonly steps: readonly FusibleStep[]
  readonly terminal?: FusibleStep
}

export function fuseFilterLength<S extends FusibleSegment>(
  current: S,
  next: S | undefined,
): { readonly steps: readonly FusibleStep[]; readonly terminal: FusibleStep } | undefined {
  if (
    current.kind !== 'element' ||
    current.terminal !== undefined ||
    current.steps.length !== 1 ||
    current.steps[0].step.name !== 'filter' ||
    next === undefined ||
    next.kind !== 'element' ||
    next.steps.length !== 0 ||
    next.terminal === undefined ||
    next.terminal.step.name !== 'length'
  ) {
    return undefined
  }
  return { steps: current.steps, terminal: next.terminal }
}

/** The whole rewrite list, applied once, in this fixed order. */
export function findPlanRewrites(
  steps: readonly PlanStep[],
  mode: CompilerSemantics,
): readonly PlanRewrite[] {
  const rewrites: PlanRewrite[] = []
  const mapLength = matchElideUnusedMap(steps, mode)
  if (mapLength !== undefined) rewrites.push(mapLength)
  return rewrites
}

/**
 * `map |> length`'s replacement text: read every source element (preserving
 * any read-time side effect, e.g. a getter or Proxy trap) without invoking
 * the elided map callbacks, then report the count. `assumePure` is what
 * makes skipping the callbacks itself safe; the read loop is what keeps
 * behavior identical when it is not.
 */
export function emitElideUnusedMap(stepIndex: number, curData: string, nextData: string): string[] {
  const length = `_pureLength${stepIndex}`
  return [
    `var ${length} = ${curData}.length;`,
    `for (var _i = 0; _i < ${length}; _i++) {`,
    `void ${curData}[_i];`,
    '}',
    `var ${nextData} = ${length};`,
  ]
}
