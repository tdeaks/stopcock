import * as t from '@babel/types'
import { planInline } from './inline'
import type { CompilerOperatorFact } from './ops'
import type { CompilerFallbackTier, CompilerSegmentKind, CompilerSemantics } from './types'
import type { SourceSpan } from './mapped-code'
import { findPlanRewrites, type PlanRewrite } from './rewrites'

export type CompilerSiteKind = 'pipe' | 'flow' | 'compile' | 'compilePure'
export type PlanResultKind = 'value' | 'runner'
export type OpaqueReceiverAbi = 'receiver-insensitive' | 'step-vector'
export type PlanExecutionLayout = 'sequential-stages' | 'fused-streams'
export type OperatorConstructionMode = 'observable' | 'elided'
export type CaptureId = number

export interface Step {
  readonly name: string
  readonly node: t.Expression
  readonly args: readonly t.Expression[]
  /** Hash-pinned S2 fact; codegen never redefines observable semantics. */
  readonly fact: CompilerOperatorFact
}

export interface PlanCapture {
  readonly id: CaptureId
  readonly phase: 'construction'
  readonly evaluationOrder: number
  readonly kind: 'source' | 'binding' | 'whole-step' | 'opaque'
  readonly node: t.Expression
  readonly local: string
  readonly stepIndex?: number
  readonly bindingIndex?: number
}

export type PlanValueRef =
  | {
      readonly kind: 'capture'
      readonly captureId: CaptureId
    }
  | {
      readonly kind: 'inline'
      readonly source: SourceSpan
    }

export interface OperatorPlanStep {
  readonly kind: 'operator'
  readonly index: number
  readonly source: SourceSpan
  readonly node: t.Expression
  readonly args: readonly t.Expression[]
  readonly fact: CompilerOperatorFact
  readonly bindings: readonly PlanValueRef[]
}

export interface OpaquePlanStep {
  readonly kind: 'opaque'
  readonly index: number
  readonly source: SourceSpan
  readonly node: t.Expression
  readonly fn: PlanValueRef
  readonly receiver: OpaqueReceiverAbi
}

export type PlanStep = OperatorPlanStep | OpaquePlanStep

export interface PlanSegment {
  readonly kind: CompilerSegmentKind
  readonly start: number
  readonly length: number
  readonly inputDomain: CompilerOperatorFact['inputDomain'] | 'unknown'
  readonly outputDomain: CompilerOperatorFact['outputDomain'] | 'unknown'
  readonly terminalIndex?: number
  /** Runtime-tier materializer whose compiler fact is otherwise a terminal. */
  readonly sourceTierBoundary?: true
}

// The rewrite list itself (`PlanRewrite`, its matchers) lives in
// `rewrites.ts` -- phase 5 keeps every peephole and its justification in
// one file. This module only calls in and applies the result.

export interface StaticCompilerPlanV1 {
  readonly irVersion: 1
  readonly siteKind: CompilerSiteKind
  readonly mode: CompilerSemantics
  readonly sourceTier: CompilerFallbackTier
  /**
   * Tier-specific execution order. Root sequential calls materialize every
   * stage; explicit fusion/compiler tiers may interleave a stream segment.
   */
  readonly executionLayout: PlanExecutionLayout
  /**
   * Whether an official operator factory invocation remains observable
   * JavaScript at this site. A residual, dynamic, or boundary/step-vector
   * retained construction stays `'observable'`: the real factory call still
   * runs, in original order, with its caches, provenance, inherited setters,
   * and thrown errors intact. A fully-lowered static site elides the
   * factory call itself (`'elided'`): every argument expression still
   * evaluates exactly once, in original order, but the call that would
   * construct the operator object never executes, so nothing about that
   * factory, including a hostile inherited setter, is observable.
   */
  readonly operatorConstruction: OperatorConstructionMode
  readonly result: PlanResultKind
  readonly call: SourceSpan
  readonly source?: PlanValueRef
  readonly captures: readonly PlanCapture[]
  readonly steps: readonly PlanStep[]
  readonly segments: readonly PlanSegment[]
  readonly segmentKinds: readonly CompilerSegmentKind[]
  /** Explicit pure-only rewrites selected before emitter segmentation (see
   * `rewrites.ts`; the `filter |> length` rewrite is unconditional and
   * needs no plan-level record, so it never appears here -- codegen finds
   * it directly by inspecting adjacent segments). */
  readonly pureRewrites: readonly PlanRewrite[]
  readonly operatorFacts: readonly CompilerOperatorFact[]
  readonly loweringId: string
}

export const FULL_ARRAY_LOWERING_ID = '@stopcock/fp-compiler/array/full/v4'
export const FULL_RUNNER_LOWERING_ID = '@stopcock/fp-compiler/array/runner/v4'
export const PREFIX_RESIDUAL_STEP_VECTOR_LOWERING_ID =
  '@stopcock/fp-compiler/array/prefix-residual-unary/step-vector/v4'
export const PREFIX_RESIDUAL_RECEIVER_INSENSITIVE_LOWERING_ID =
  '@stopcock/fp-compiler/array/prefix-residual-unary/receiver-insensitive/v4'

const INLINE_CALLBACK_OPS = new Set([
  'map',
  'filter',
  'reject',
  'filterMap',
  'mapWhile',
  'flatMap',
  'takeUntil',
  'takeWhile',
  'dropWhile',
  'count',
  'reduce',
  'forEach',
  'find',
  'findIndex',
  'findMap',
  'every',
  'some',
  'none',
  // phase 3: dict domain (record/map/set) element and terminal ops.
  'recordMap',
  'recordFilter',
  'recordFilterMap',
  'recordMapKeys',
  'recordPartition',
  'mapMap',
  'mapFilter',
  'mapFilterMap',
  'mapMapKeys',
  'mapPartition',
  'mapReduce',
  'setMap',
  'setFilter',
  'setFilterMap',
  'setFlatMap',
  'setPartition',
  'setReduce',
])

const spanOf = (node: {
  readonly start?: number | null
  readonly end?: number | null
}): SourceSpan => {
  if (node.start == null || node.end == null) {
    throw new Error('fp-compiler: static plan node has no source span')
  }
  return { start: node.start, end: node.end }
}

const hasSourceTierMaterializerTerminal = (
  fact: CompilerOperatorFact,
  sourceTier: CompilerFallbackTier,
): boolean =>
  (sourceTier === 'sequential' || sourceTier === 'compact') &&
  (fact.name === 'sum' || fact.name === 'min' || fact.name === 'max')

/**
 * True for a fact belonging to the option/result domains (phase 2): either
 * it consumes an already-built Option/Result (`map`, `flatMap`, `getOrElse`,
 * ...), or it is a raw-value constructor feeding one (`fromNullable`,
 * `fromPredicate`, `fromThrowable`). Distinguishing this from `'array'`/
 * `'scalar'` here is what routes a run of these ops into a straight-line
 * `'option'` segment instead of the array-loop `'stream'` scaffold.
 */
const isOptionDomain = (
  domain: CompilerOperatorFact['inputDomain'] | CompilerOperatorFact['outputDomain'],
): boolean => domain === 'option' || domain === 'result'

const isOptionFact = (fact: CompilerOperatorFact): boolean =>
  isOptionDomain(fact.inputDomain) ||
  (fact.inputDomain === 'scalar' && isOptionDomain(fact.outputDomain))

/**
 * True for a fact belonging to the Record/Map/Set domains (phase 3): either
 * it consumes/produces one of those containers directly (`map`, `filter`,
 * `mapKeys`, ...) or it is a `reduce` terminal folding one down to a scalar.
 * Distinguishing this from `'array'`/`'scalar'`/`'option'` here is what
 * routes a run of these ops into a `'dict'` segment (the `for (const key of
 * enumerableKeys(...))`/`for...of` loop scaffold in codegen.ts) instead of
 * the array-loop `'stream'` scaffold or the straight-line `'option'` run.
 */
const isDictDomain = (
  domain: CompilerOperatorFact['inputDomain'] | CompilerOperatorFact['outputDomain'],
): boolean => domain === 'record' || domain === 'map' || domain === 'set'

const isDictFact = (fact: CompilerOperatorFact): boolean =>
  isDictDomain(fact.inputDomain) || isDictDomain(fact.outputDomain)

/**
 * True for a fact belonging to the Iterable domain (phase 4): consumes a
 * lazy `Iter`/`Iterable` (`map`, `filter`, `take`, ...) or is one of its
 * terminals (`toArray`, `reduce`, `find`, ...). A terminal's `outputDomain`
 * may be `'option'` (`find`/`first`) -- routed here, not to `isOptionFact`,
 * the same way an array segment's Option-producing terminal (`head`/`find`)
 * stays a `'stream'` fact: only `inputDomain` decides, so the fused loop
 * still runs, and a following Option-domain segment picks up the produced
 * Option value via the same boundary-fusion machinery phase 2 built.
 */
const isIterFact = (fact: CompilerOperatorFact): boolean => fact.inputDomain === 'iterable'

const nonBoundaryKind = (fact: CompilerOperatorFact): 'stream' | 'option' | 'dict' | 'iterable' =>
  isOptionFact(fact) ? 'option' : isDictFact(fact) ? 'dict' : isIterFact(fact) ? 'iterable' : 'stream'

export const segmentKindsForOperatorFacts = (
  facts: readonly CompilerOperatorFact[],
  executionLayout: PlanExecutionLayout,
  sourceTier: CompilerFallbackTier = 'compiler',
): readonly CompilerSegmentKind[] => {
  if (executionLayout === 'sequential-stages') {
    return facts.map((fact) =>
      fact.compilerPipelineRole === 'boundary' ||
      hasSourceTierMaterializerTerminal(fact, sourceTier)
        ? 'boundary'
        : nonBoundaryKind(fact),
    )
  }

  const kinds: CompilerSegmentKind[] = []
  let openKind: 'stream' | 'option' | 'dict' | 'iterable' | undefined
  for (const fact of facts) {
    if (
      fact.compilerPipelineRole === 'boundary' ||
      hasSourceTierMaterializerTerminal(fact, sourceTier)
    ) {
      openKind = undefined
      kinds.push('boundary')
      continue
    }
    const kind = nonBoundaryKind(fact)
    if (openKind !== kind) {
      kinds.push(kind)
      openKind = kind
    }
    if (fact.compilerPipelineRole === 'terminal') openKind = undefined
  }
  return kinds
}

const segmentPlan = (
  steps: readonly PlanStep[],
  executionLayout: PlanExecutionLayout,
  sourceTier: CompilerFallbackTier,
): readonly PlanSegment[] => {
  const segments: PlanSegment[] = []
  let streamKind: 'stream' | 'option' | 'dict' | 'iterable' | undefined
  let streamStart = -1
  let streamLength = 0
  let streamInput: CompilerOperatorFact['inputDomain'] | 'unknown' = 'unknown'
  let streamOutput: CompilerOperatorFact['outputDomain'] | 'unknown' = 'unknown'
  let terminalIndex: number | undefined

  const flushStream = (): void => {
    if (streamLength === 0) return
    segments.push({
      kind: streamKind!,
      start: streamStart,
      length: streamLength,
      inputDomain: streamInput,
      outputDomain: streamOutput,
      ...(terminalIndex === undefined ? {} : { terminalIndex }),
    })
    streamKind = undefined
    streamStart = -1
    streamLength = 0
    streamInput = 'unknown'
    streamOutput = 'unknown'
    terminalIndex = undefined
  }

  for (const step of steps) {
    if (step.kind === 'opaque') {
      flushStream()
      segments.push({
        kind: 'opaque',
        start: step.index,
        length: 1,
        inputDomain: 'unknown',
        outputDomain: 'unknown',
      })
      continue
    }
    const sourceTierBoundary = hasSourceTierMaterializerTerminal(step.fact, sourceTier)
    if (step.fact.compilerPipelineRole === 'boundary' || sourceTierBoundary) {
      flushStream()
      segments.push({
        kind: 'boundary',
        start: step.index,
        length: 1,
        inputDomain: step.fact.inputDomain,
        outputDomain: step.fact.outputDomain,
        ...(sourceTierBoundary ? { sourceTierBoundary: true as const } : {}),
      })
      continue
    }
    const kind = nonBoundaryKind(step.fact)
    if (executionLayout === 'sequential-stages') {
      flushStream()
      segments.push({
        kind,
        start: step.index,
        length: 1,
        inputDomain: step.fact.inputDomain,
        outputDomain: step.fact.outputDomain,
        ...(step.fact.compilerPipelineRole === 'terminal' ? { terminalIndex: step.index } : {}),
      })
      continue
    }
    if (streamLength > 0 && streamKind !== kind) flushStream()
    if (streamLength === 0) {
      streamKind = kind
      streamStart = step.index
      streamInput = step.fact.inputDomain
    }
    streamLength++
    streamOutput = step.fact.outputDomain
    if (step.fact.compilerPipelineRole === 'terminal') {
      terminalIndex = step.index
      flushStream()
    }
  }
  flushStream()
  const expectedKinds = segmentKindsForOperatorFacts(
    steps.flatMap((step) => (step.kind === 'operator' ? [step.fact] : [])),
    executionLayout,
    sourceTier,
  )
  const actualKinds = segments
    .filter((segment) => segment.kind !== 'opaque')
    .map((segment) => segment.kind)
  if (
    expectedKinds.length !== actualKinds.length ||
    expectedKinds.some((kind, index) => kind !== actualKinds[index])
  ) {
    throw new Error('fp-compiler: static plan segment topology diverged from generated facts')
  }
  return segments
}

export interface StaticCompilerPlanInput {
  readonly siteKind: CompilerSiteKind
  readonly mode: CompilerSemantics
  readonly sourceTier: CompilerFallbackTier
  readonly call: t.CallExpression
  readonly source?: t.Expression
  readonly steps: readonly Step[]
  readonly residual?: t.Expression
  readonly opaqueReceiver?: OpaqueReceiverAbi
  /** A constant parameter is already evaluated on function entry. */
  readonly sourceAlreadyEvaluated?: boolean
}

export function createStaticCompilerPlan(input: StaticCompilerPlanInput): StaticCompilerPlanV1 {
  if (input.opaqueReceiver === 'step-vector' && input.sourceTier !== 'sequential') {
    throw new Error(
      'fp-compiler: step-vector receiver ABI is only valid for the sequential root tier',
    )
  }
  const captures: PlanCapture[] = []
  const planSteps: PlanStep[] = []
  let evaluationOrder = 0

  const capture = (
    kind: PlanCapture['kind'],
    node: t.Expression,
    stepIndex?: number,
    bindingIndex?: number,
  ): PlanCapture => {
    const id = captures.length
    const entry: PlanCapture = {
      id,
      phase: 'construction',
      evaluationOrder: evaluationOrder++,
      kind,
      node,
      local: `_c${id}`,
      ...(stepIndex === undefined ? {} : { stepIndex }),
      ...(bindingIndex === undefined ? {} : { bindingIndex }),
    }
    captures.push(entry)
    return entry
  }

  let sourceRef: PlanValueRef | undefined
  if (input.source !== undefined) {
    if (input.sourceAlreadyEvaluated === true) {
      sourceRef = { kind: 'inline', source: spanOf(input.source) }
    } else {
      const sourceCapture = capture('source', input.source)
      sourceRef = { kind: 'capture', captureId: sourceCapture.id }
    }
  }

  for (let index = 0; index < input.steps.length; index++) {
    const step = input.steps[index]
    const source = spanOf(step.node)
    const bindings: PlanValueRef[] = []
    step.args.forEach((arg, bindingIndex) => {
      if (
        bindingIndex === 0 &&
        INLINE_CALLBACK_OPS.has(step.name) &&
        planInline(arg) !== undefined
      ) {
        bindings.push({ kind: 'inline', source: spanOf(arg) })
        return
      }
      const binding = capture('binding', arg, index, bindingIndex)
      bindings.push({ kind: 'capture', captureId: binding.id })
    })
    /*
     * Mark the original construction point of the operator expression. Every
     * argument expression this step captures still evaluates exactly once,
     * in original order, regardless of what emission later does with the
     * factory call itself. A residual/boundary/step-vector retained site
     * still runs the real factory call at this point (pure mode changes only
     * eligible execution semantics after construction, never argument
     * evaluation, factory caches/provenance, inherited setters, or thrown
     * errors); a fully-lowered site elides the call and keeps only the
     * argument evaluation (see `operatorConstruction` and
     * `constructionLinesForPlan` in codegen.ts).
     */
    capture('whole-step', step.node, index)
    planSteps.push({
      kind: 'operator',
      index,
      source,
      node: step.node,
      args: step.args,
      fact: step.fact,
      bindings,
    })
  }

  if (input.residual !== undefined) {
    if (input.opaqueReceiver === undefined) {
      throw new Error('fp-compiler: residual plan has no receiver ABI')
    }
    const index = planSteps.length
    const opaque = capture('opaque', input.residual, index)
    planSteps.push({
      kind: 'opaque',
      index,
      source: spanOf(input.residual),
      node: input.residual,
      fn: { kind: 'capture', captureId: opaque.id },
      receiver: input.opaqueReceiver,
    })
  }

  const executionLayout: PlanExecutionLayout =
    input.sourceTier === 'sequential' ? 'sequential-stages' : 'fused-streams'
  let executionSteps = planSteps
  const pureRewrites: readonly PlanRewrite[] = findPlanRewrites(planSteps, input.mode)
  /*
   * Factory construction remains in `captures`, so argument evaluation (and,
   * at a residual/boundary/step-vector retained site, the real factory call)
   * still happens once at runner construction. Execution removes only a
   * complete maps-only stream immediately consumed by length; prefix
   * boundaries and a following residual remain in their original order.
   */
  const pureMapLength = pureRewrites.find(
    (rewrite): rewrite is Extract<PlanRewrite, { kind: 'elide-unused-map' }> =>
      rewrite.kind === 'elide-unused-map',
  )
  if (pureMapLength !== undefined) {
    const elided = new Set(pureMapLength.elidedStepIndexes)
    executionSteps = planSteps.filter((step) => !elided.has(step.index))
  }
  const segments = segmentPlan(executionSteps, executionLayout, input.sourceTier)
  /*
   * A whole-step's factory call is only genuinely retained when a following
   * step-vector residual consumes the constructed operator objects, or the
   * step's own role is `'boundary'` (its real return value feeds subsequent
   * code). Mirrors `retainedWholeSteps` in codegen.ts's
   * `constructionLinesForPlan`; the two must stay in lockstep.
   */
  const stepVectorRetained = planSteps.some(
    (step) => step.kind === 'opaque' && step.receiver === 'step-vector',
  )
  const operatorConstruction: OperatorConstructionMode = planSteps.some(
    (step) =>
      step.kind === 'operator' &&
      !stepVectorRetained &&
      step.fact.compilerPipelineRole !== 'boundary',
  )
    ? 'elided'
    : 'observable'
  return {
    irVersion: 1,
    siteKind: input.siteKind,
    mode: input.mode,
    sourceTier: input.sourceTier,
    executionLayout,
    operatorConstruction,
    result: input.siteKind === 'pipe' ? 'value' : 'runner',
    call: spanOf(input.call),
    ...(sourceRef === undefined ? {} : { source: sourceRef }),
    captures,
    steps: planSteps,
    segments,
    segmentKinds: segments.map((segment) => segment.kind),
    pureRewrites,
    operatorFacts: planSteps.flatMap((step) => (step.kind === 'operator' ? [step.fact] : [])),
    loweringId:
      input.residual !== undefined
        ? input.opaqueReceiver === 'step-vector'
          ? PREFIX_RESIDUAL_STEP_VECTOR_LOWERING_ID
          : PREFIX_RESIDUAL_RECEIVER_INSENSITIVE_LOWERING_ID
        : input.siteKind === 'pipe'
          ? FULL_ARRAY_LOWERING_ID
          : FULL_RUNNER_LOWERING_ID,
  }
}

export const operatorStepsOf = (plan: StaticCompilerPlanV1): readonly Step[] =>
  plan.steps.flatMap((step) =>
    step.kind === 'operator'
      ? [
          {
            name: step.fact.name,
            node: step.node,
            args: step.args,
            fact: step.fact,
          },
        ]
      : [],
  )
