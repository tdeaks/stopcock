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
export interface PlanRewriteElideUnusedMap {
  readonly kind: 'elide-unused-map'
  /** Map steps whose values cannot affect the following length terminal. */
  readonly elidedStepIndexes: readonly number[]
  readonly terminalIndex: number
}

/**
 * `sortBy(cmp) |> take(k)` -> one bounded top-k pass. A full `sortBy` sorts
 * every element before `take` throws all but the first k away; this rewrite
 * selects the k smallest in a single pass over the source instead, with no
 * full sort. `takeIndex` is the step immediately following `sortIndex` --
 * codegen removes it from the segment it would otherwise start (see
 * `createStaticCompilerPlan`'s `executionSteps` filtering) and folds its
 * count argument into the sort boundary's own emission.
 */
export interface PlanRewriteFuseSortTake {
  readonly kind: 'fuse-sort-take'
  readonly sortIndex: number
  readonly takeIndex: number
}

export type PlanRewrite = PlanRewriteElideUnusedMap | PlanRewriteFuseSortTake

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
 * Sort-family ops this rewrite covers. `sortBy` takes a comparator, so its
 * key function is the thing a bounded selection must call instead of a full
 * sort. `sort`/`sortAsc`/`sortDesc` take no callback at all (numeric
 * ascending/descending via native `<`/`>`); fusing those too is a plausible
 * follow-up but needs its own emission (no comparator local to reuse), so
 * they are deliberately left alone here.
 */
const FUSIBLE_SORT_OPS = new Set(['sortBy'])

/**
 * `sortBy(cmp) |> take(k)` -> `emitFusedSortTake`'s bounded top-k pass.
 * Unconditional, any mode: unlike the map/length elision above, this never
 * skips a callback that the source program could observe running -- it
 * changes *how many times* the comparator runs (fewer comparisons than a
 * full sort touches when k is small), never *whether* the two operators'
 * argument expressions evaluate. Both `sortBy`'s comparator and `take`'s
 * count still evaluate exactly once, in original order, through the plan's
 * ordinary capture mechanism (`createStaticCompilerPlan`'s `captures` loop
 * runs over every step before this rewrite ever touches segmentation).
 * Only adjacent pairs match: nothing may sit between the two steps, since
 * codegen fuses them into a single boundary segment covering both indexes.
 */
function matchFuseSortTake(steps: readonly PlanStep[]): PlanRewriteFuseSortTake[] {
  const rewrites: PlanRewriteFuseSortTake[] = []
  for (let position = 0; position < steps.length - 1; position++) {
    const sortStep = steps[position]
    const takeStep = steps[position + 1]
    if (
      sortStep.kind !== 'operator' ||
      sortStep.fact.compilerPipelineRole !== 'boundary' ||
      !FUSIBLE_SORT_OPS.has(sortStep.fact.name) ||
      takeStep.kind !== 'operator' ||
      takeStep.fact.name !== 'take'
    ) {
      continue
    }
    rewrites.push({ kind: 'fuse-sort-take', sortIndex: sortStep.index, takeIndex: takeStep.index })
  }
  return rewrites
}

/**
 * `emitFusedSortTake`'s generated code, in three shapes based on the
 * runtime value of `take`'s count (`k`), normalized exactly as the compiled
 * `take` op itself normalizes it (see `ops-table.ts`'s `take` render: `k =
 * k > 0 ? (k === Infinity ? k : trunc(k)) : 0`), so both fused and unfused
 * `take` treat `k <= 0`, non-integer `k`, and `k = Infinity` identically:
 *
 * - `k <= 0` (after normalizing): the result is always `[]`. The comparator
 *   never runs -- a full sort would have run it ~n*log(n) times for a
 *   result that gets thrown away, so this is strictly fewer calls, never
 *   more.
 * - `k >= n`: `take` would keep everything, so this calls the exact same
 *   captured `sortBy(cmp)` operator a normal (unfused) boundary segment
 *   would have called. Same code, same result, same comparator call count.
 * - `0 < k < n`: the only case that actually needs a bounded pass. Keeps a
 *   sorted buffer of the k best-so-far source elements; a new element
 *   either grows the buffer (while it has room) or replaces the current
 *   worst kept element when strictly better than it (never on a tie).
 *   Insertion shifts only elements strictly greater than the incoming
 *   value, exactly like `sort-kernel.ts`'s insertion-sort runs -- so a tied
 *   key never moves past an equal one already in the buffer. Composing that
 *   with left-to-right source order reproduces a stable sort's tie-break
 *   (earlier index wins) without ever comparing indexes: an incoming
 *   element can only ever be inserted *after* every already-kept element it
 *   ties with, and a kept element can only be evicted by a strictly smaller
 *   one, never by a later arrival with an equal key. Worst case is
 *   O(n*k) (an adversarial input that replaces the worst element on every
 *   iteration); this is the same asymptotic trade `takeSortedBy` in
 *   `array.ts` already makes with quickselect's O(n^2) worst case, and the
 *   common case (random data, small k) is close to O(n).
 */
export function emitFusedSortTake(
  sortStepIndex: number,
  cmpExpr: string,
  sortOperatorExpr: string,
  takeCountExpr: string,
  curData: string,
  nextData: string,
): string[] {
  const n = `_ftN${sortStepIndex}`
  const k = `_ftK${sortStepIndex}`
  const lim = `_ftLim${sortStepIndex}`
  const top = `_ftTop${sortStepIndex}`
  const size = `_ftSize${sortStepIndex}`
  const i = `_ftI${sortStepIndex}`
  const v = `_ftV${sortStepIndex}`
  const p = `_ftP${sortStepIndex}`
  return [
    `var ${n} = ${curData}.length;`,
    `var ${k} = (${takeCountExpr});`,
    `${k} = ${k} > 0 ? (${k} === 1 / 0 ? ${k} : ${k} - ${k} % 1) : 0;`,
    `var ${lim} = ${k} < ${n} ? ${k} : ${n};`,
    `var ${nextData};`,
    `if (${lim} <= 0) {`,
    `${nextData} = [];`,
    `} else if (${lim} >= ${n}) {`,
    `${nextData} = (${sortOperatorExpr})(${curData});`,
    `} else {`,
    `var ${top} = new Array(${lim});`,
    `var ${size} = 0;`,
    `var ${p};`,
    `for (var ${i} = 0; ${i} < ${n}; ${i}++) {`,
    `var ${v} = ${curData}[${i}];`,
    `if (${size} < ${lim}) {`,
    `${p} = ${size};`,
    `while (${p} > 0 && (${cmpExpr})(${top}[${p} - 1], ${v}) > 0) { ${top}[${p}] = ${top}[${p} - 1]; ${p}--; }`,
    `${top}[${p}] = ${v};`,
    `${size}++;`,
    `} else if ((${cmpExpr})(${v}, ${top}[${lim} - 1]) < 0) {`,
    `${p} = ${lim} - 1;`,
    `while (${p} > 0 && (${cmpExpr})(${top}[${p} - 1], ${v}) > 0) { ${top}[${p}] = ${top}[${p} - 1]; ${p}--; }`,
    `${top}[${p}] = ${v};`,
    '}',
    '}',
    `${nextData} = ${top};`,
    '}',
  ]
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
  rewrites.push(...matchFuseSortTake(steps))
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
