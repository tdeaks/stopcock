import * as t from '@babel/types'
import { planInline } from './inline'
import type { CompilerOperatorFact } from './ops'
import type {
  CompilerFallbackTier,
  CompilerSegmentKind,
  CompilerSemantics,
} from './types'
import type { SourceSpan } from './mapped-code'

export type CompilerSiteKind = 'pipe' | 'flow' | 'compile' | 'compilePure'
export type PlanResultKind = 'value' | 'runner'
export type OpaqueReceiverAbi = 'receiver-insensitive' | 'step-vector'
export type PlanExecutionLayout = 'sequential-stages' | 'fused-streams'
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
}

export interface PlanPureRewrite {
  readonly kind: 'elide-unused-map'
  /** Map steps whose values cannot affect the following length terminal. */
  readonly elidedStepIndexes: readonly number[]
  readonly terminalIndex: number
}

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
   * Every source operator expression is observable construction-time code,
   * including in pure mode. Pure rewrites may remove per-element callback
   * execution, but never the JavaScript expressions passed to pipe/compile.
   */
  readonly operatorConstruction: 'observable'
  readonly result: PlanResultKind
  readonly call: SourceSpan
  readonly source?: PlanValueRef
  readonly captures: readonly PlanCapture[]
  readonly steps: readonly PlanStep[]
  readonly segments: readonly PlanSegment[]
  readonly segmentKinds: readonly CompilerSegmentKind[]
  /** Explicit pure-only rewrites selected before emitter segmentation. */
  readonly pureRewrites: readonly PlanPureRewrite[]
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
])

const spanOf = (node: { readonly start?: number | null; readonly end?: number | null }): SourceSpan => {
  if (node.start == null || node.end == null) {
    throw new Error('fp-compiler: static plan node has no source span')
  }
  return { start: node.start, end: node.end }
}

export const segmentKindsForOperatorFacts = (
  facts: readonly CompilerOperatorFact[],
  executionLayout: PlanExecutionLayout,
): readonly CompilerSegmentKind[] => {
  if (executionLayout === 'sequential-stages') {
    return facts.map((fact) =>
      fact.compilerPipelineRole === 'boundary' ? 'boundary' : 'stream',
    )
  }

  const kinds: CompilerSegmentKind[] = []
  let streamOpen = false
  for (const fact of facts) {
    if (fact.compilerPipelineRole === 'boundary') {
      streamOpen = false
      kinds.push('boundary')
      continue
    }
    if (!streamOpen) {
      kinds.push('stream')
      streamOpen = true
    }
    if (fact.compilerPipelineRole === 'terminal') streamOpen = false
  }
  return kinds
}

const segmentPlan = (
  steps: readonly PlanStep[],
  executionLayout: PlanExecutionLayout,
): readonly PlanSegment[] => {
  const segments: PlanSegment[] = []
  let streamStart = -1
  let streamLength = 0
  let streamInput: CompilerOperatorFact['inputDomain'] | 'unknown' = 'unknown'
  let streamOutput: CompilerOperatorFact['outputDomain'] | 'unknown' = 'unknown'
  let terminalIndex: number | undefined

  const flushStream = (): void => {
    if (streamLength === 0) return
    segments.push({
      kind: 'stream',
      start: streamStart,
      length: streamLength,
      inputDomain: streamInput,
      outputDomain: streamOutput,
      ...(terminalIndex === undefined ? {} : { terminalIndex }),
    })
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
    if (step.fact.compilerPipelineRole === 'boundary') {
      flushStream()
      segments.push({
        kind: 'boundary',
        start: step.index,
        length: 1,
        inputDomain: step.fact.inputDomain,
        outputDomain: step.fact.outputDomain,
      })
      continue
    }
    if (executionLayout === 'sequential-stages') {
      flushStream()
      segments.push({
        kind: 'stream',
        start: step.index,
        length: 1,
        inputDomain: step.fact.inputDomain,
        outputDomain: step.fact.outputDomain,
        ...(step.fact.compilerPipelineRole === 'terminal'
          ? { terminalIndex: step.index }
          : {}),
      })
      continue
    }
    if (streamLength === 0) {
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

export function createStaticCompilerPlan(
  input: StaticCompilerPlanInput,
): StaticCompilerPlanV1 {
  if (
    input.opaqueReceiver === 'step-vector' &&
    input.sourceTier !== 'sequential'
  ) {
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
     * Always evaluate the official operator expression exactly once at its
     * original construction point. Pure mode changes only eligible execution
     * semantics after construction; it cannot erase argument evaluation,
     * factory caches/provenance, inherited setters, or thrown errors.
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
  let pureRewrites: readonly PlanPureRewrite[] = []
  /*
   * Pure mode permits callback elision only where the entire value path is a
   * sequence of maps consumed solely by length. Factory construction remains
   * in `captures`, so argument/factory evaluation still happens once at runner
   * construction; only per-element callback execution is removed.
   */
  if (
    input.mode === 'pure' &&
    input.residual === undefined &&
    planSteps.length >= 2 &&
    planSteps.every(
      (step, index) =>
        step.kind === 'operator' &&
        (index === planSteps.length - 1
          ? step.fact.name === 'length'
          : step.fact.name === 'map'),
    )
  ) {
    const terminal = planSteps[planSteps.length - 1] as OperatorPlanStep
    const elidedStepIndexes = planSteps.slice(0, -1).map((step) => step.index)
    pureRewrites = [
      {
        kind: 'elide-unused-map',
        elidedStepIndexes,
        terminalIndex: terminal.index,
      },
    ]
    executionSteps = [terminal]
  }
  const segments = segmentPlan(executionSteps, executionLayout)
  return {
    irVersion: 1,
    siteKind: input.siteKind,
    mode: input.mode,
    sourceTier: input.sourceTier,
    executionLayout,
    operatorConstruction: 'observable',
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
