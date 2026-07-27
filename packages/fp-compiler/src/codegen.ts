import * as t from '@babel/types'
import { BOUNDARY_OPS, TERMINAL_OPS, callbackArity, opEmitFor } from './ops'
import type {
  CallbackHandle,
  DictEmitCtx,
  ElementEmitCtx,
  EmitFragment,
  IterEmitCtx,
  OpEmit,
  OptionEmitCtx,
} from './ops-table'
import { planInline, renderDirectInlineExpressionMapped, renderDirectInlineMapped } from './inline'
import {
  FULL_ARRAY_LOWERING_ID,
  FULL_RUNNER_LOWERING_ID,
  PREFIX_RESIDUAL_RECEIVER_INSENSITIVE_LOWERING_ID,
  PREFIX_RESIDUAL_STEP_VECTOR_LOWERING_ID,
  createStaticCompilerPlan,
  operatorStepsOf,
  type PlanCapture,
  type PlanSegment,
  type PlanValueRef,
  type StaticCompilerPlanV1,
  type Step,
} from './plan-ir'
import {
  SourceFragmentTracker,
  concatMappedCode,
  type GeneratedSourceFragment,
  type MappedCode,
} from './mapped-code'

export {
  FULL_ARRAY_LOWERING_ID,
  FULL_RUNNER_LOWERING_ID,
  PREFIX_RESIDUAL_RECEIVER_INSENSITIVE_LOWERING_ID,
  PREFIX_RESIDUAL_STEP_VECTOR_LOWERING_ID,
  createStaticCompilerPlan,
}
export type { StaticCompilerPlanV1, Step }

type ExpressionRenderer = (node: t.Expression) => string
type SourceRangeRenderer = (start: number, end: number) => string

const renderMappedInline = (
  rendered: ReturnType<typeof renderDirectInlineMapped>,
  renderSource: SourceRangeRenderer,
): string | undefined => {
  if (rendered === undefined) return undefined
  let tagged = ''
  let cursor = 0
  for (const fragment of rendered.sourceFragments) {
    tagged += rendered.text.slice(cursor, fragment.generatedStart)
    tagged += renderSource(fragment.sourceStart, fragment.sourceEnd)
    cursor = fragment.generatedEnd
  }
  tagged += rendered.text.slice(cursor)
  return tagged
}

// Inlined arrow callbacks are emitted as a block scoped to that step: the
// params become `const` bindings aliasing the already-computed input values,
// and the arrow body is spliced in as an expression referencing them. Block
// scoping means each step gets a fresh binding every iteration (no
// loop-carried variable for V8 to worry about) and different steps can
// reuse the same param name without colliding. Non-inlinable callbacks fall
// back to a hoisted temp holding the original function, called normally.
function emitCallback(
  argNode: t.Expression,
  code: string,
  tempName: string,
  preLines: string[],
  inputVars: readonly string[],
  inlineCallbacks: boolean,
  renderExpression: ExpressionRenderer,
  renderSource: SourceRangeRenderer,
  use: (expr: string) => string[],
): string[] {
  const direct = inlineCallbacks
    ? renderMappedInline(renderDirectInlineMapped(argNode, code, inputVars), renderSource)
    : undefined
  if (direct !== undefined) return use(`(${direct})`)

  const plan = inlineCallbacks ? planInline(argNode) : undefined
  if (plan) {
    const decls = plan.params.map((p, i) => `const ${p} = ${inputVars[i]};`)
    const bodyText = renderSource(plan.bodyStart, plan.bodyEnd)
    return ['{', ...decls, ...use(`(${bodyText})`), '}']
  }
  preLines.push(`var ${tempName} = (${renderExpression(argNode)});`)
  return use(`${tempName}(${inputVars.join(', ')})`)
}

export interface FusedBody {
  readonly stmts: string
  readonly resultVar: string
  /** User expressions captured before any generated loop executes. */
  readonly prelude: string
  /** Generated execution statements, after every capture has completed. */
  readonly execution: string
  readonly segmentKinds: readonly (
    | 'stream'
    | 'boundary'
    | 'opaque'
    | 'option'
    | 'dict'
    | 'iterable'
  )[]
  readonly sourceFragments: readonly GeneratedSourceFragment[]
}

export const DEFAULT_OPTION_NONE_LOCAL = '__stopcock_fp_none'

const INLINE_CALLBACK_LIMIT = 3
const CALLBACK_OPS = new Set([
  'map',
  'mapWithIndex',
  'filterWithIndex',
  'forEachWithIndex',
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
const DIRECT_FULL_ARRAY_TERMINALS = new Set(['head', 'last', 'length', 'isEmpty', 'min', 'max'])

interface IndexedStep {
  readonly index: number
  readonly step: Step
}

interface ElementSegment {
  readonly kind: 'element'
  readonly steps: readonly IndexedStep[]
  readonly terminal?: IndexedStep
}

interface BoundarySegment {
  readonly kind: 'boundary'
  readonly step: IndexedStep
}

/**
 * A run of consecutive Option/Result-domain steps (phase 2): straight-line
 * over persistent `_ok`/`_v`/`_err` locals, no loop. A step whose
 * `compilerPipelineRole` is `'terminal'` (getOrElse/match/toUndefined/
 * toNullable/toOption), if present, is always the last one and ends the run.
 */
interface OptionSegment {
  readonly kind: 'option'
  readonly steps: readonly IndexedStep[]
}

/**
 * A run of consecutive Record/Map/Set-domain steps (phase 3): a real fused
 * loop (unlike `OptionSegment`'s straight-line run) over persistent `_k`/`_v`
 * locals. A step whose `compilerPipelineRole` is `'terminal'` (`partition`,
 * `reduce`), if present, is always the last one and ends the run, exactly
 * like `ElementSegment.terminal`.
 */
interface DictSegment {
  readonly kind: 'dict'
  readonly steps: readonly IndexedStep[]
  readonly terminal?: IndexedStep
}

/**
 * A run of consecutive Iterable-domain steps (phase 4): a real fused loop
 * (`for (const _v of _src)`, or an indexed array loop when the source is
 * statically known to be an Array -- see `emitIterSegment`), exactly like
 * `DictSegment`. A step whose `compilerPipelineRole` is `'terminal'`
 * (`toArray`, `reduce`, `find`, ...), if present, is always last and ends
 * the run and eagerly consumes it; with no terminal, the segment's result
 * is a lazy, re-iterable wrapper object instead.
 */
interface IterSegment {
  readonly kind: 'iterable'
  readonly steps: readonly IndexedStep[]
  readonly terminal?: IndexedStep
}

type Segment = ElementSegment | BoundarySegment | OptionSegment | DictSegment | IterSegment

interface PresentConditionalPlan {
  readonly callback: t.ArrowFunctionExpression
  readonly test: t.Expression
  readonly value: t.Expression
  readonly valueWhenTestPasses: boolean
}

function isCanonicalNullish(node: t.Expression, globalUndefinedIsUnbound: boolean): boolean {
  return (
    t.isNullLiteral(node) ||
    (globalUndefinedIsUnbound && t.isIdentifier(node, { name: 'undefined' })) ||
    (t.isUnaryExpression(node, { operator: 'void' }) && t.isPureish(node.argument))
  )
}

function isDefinitelyPresent(node: t.Expression): boolean {
  return (
    t.isBinaryExpression(node) ||
    t.isUpdateExpression(node) ||
    (t.isUnaryExpression(node) && node.operator !== 'void') ||
    t.isNumericLiteral(node) ||
    t.isStringLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isBigIntLiteral(node) ||
    t.isRegExpLiteral(node) ||
    t.isTemplateLiteral(node) ||
    t.isArrayExpression(node) ||
    t.isObjectExpression(node) ||
    t.isArrowFunctionExpression(node) ||
    t.isFunctionExpression(node) ||
    t.isClassExpression(node) ||
    t.isNewExpression(node)
  )
}

function planPresentConditional(
  callback: t.Expression,
  globalUndefinedIsUnbound: boolean,
): PresentConditionalPlan | undefined {
  if (
    !t.isArrowFunctionExpression(callback) ||
    callback.params.some((param) => t.isIdentifier(param, { name: 'undefined' })) ||
    !t.isConditionalExpression(callback.body)
  ) {
    return undefined
  }
  if (
    isCanonicalNullish(callback.body.alternate, globalUndefinedIsUnbound) &&
    isDefinitelyPresent(callback.body.consequent)
  ) {
    return {
      callback,
      test: callback.body.test,
      value: callback.body.consequent,
      valueWhenTestPasses: true,
    }
  }
  if (
    isCanonicalNullish(callback.body.consequent, globalUndefinedIsUnbound) &&
    isDefinitelyPresent(callback.body.alternate)
  ) {
    return {
      callback,
      test: callback.body.test,
      value: callback.body.alternate,
      valueWhenTestPasses: false,
    }
  }
  return undefined
}

// Splits a pipeline's steps into alternating element-wise and boundary
// segments. A boundary op flushes the element-wise segment before it and
// starts a new one; a terminal (validated by the caller to only ever appear
// last) attaches to and flushes the segment it ends.
function segmentSteps(steps: readonly Step[]): readonly Segment[] {
  const segments: Segment[] = []
  let current: IndexedStep[] = []

  const flush = (terminal?: IndexedStep): void => {
    if (current.length === 0 && terminal === undefined) return
    segments.push({ kind: 'element', steps: current, terminal })
    current = []
  }

  steps.forEach((step, index) => {
    if (BOUNDARY_OPS.has(step.name)) {
      flush()
      segments.push({ kind: 'boundary', step: { index, step } })
      return
    }
    if (TERMINAL_OPS.has(step.name)) {
      // Direct accessor/stat terminals are already optimal as their native
      // full-array operator. Fuse them only when an upstream element segment
      // would otherwise allocate an intermediate array.
      if (current.length === 0 && DIRECT_FULL_ARRAY_TERMINALS.has(step.name)) {
        segments.push({ kind: 'boundary', step: { index, step } })
        return
      }
      flush({ index, step })
      return
    }
    current.push({ index, step })
  })
  flush()
  return segments
}

/**
 * Converts the authoritative Plan IR segments into emitter segments. This is
 * intentionally validation, not a second segmentation policy: source tier,
 * semantic mode, and barriers were already decided by `createStaticCompilerPlan`.
 */
function segmentsFromPlan(plan: StaticCompilerPlanV1): readonly Segment[] {
  const stepsByIndex = new Map<number, Step>()
  for (const step of plan.steps) {
    if (step.kind !== 'operator') continue
    stepsByIndex.set(step.index, {
      name: step.fact.name,
      node: step.node,
      args: step.args,
      fact: step.fact,
    })
  }

  const indexedSteps = (segment: PlanSegment): readonly IndexedStep[] => {
    const out: IndexedStep[] = []
    for (let index = segment.start; index < segment.start + segment.length; index++) {
      const step = stepsByIndex.get(index)
      if (step === undefined) {
        throw new Error(
          `fp-compiler: ${segment.kind} plan segment references non-operator step ${index}`,
        )
      }
      out.push({ index, step })
    }
    return out
  }

  const segments: Segment[] = []
  for (const planned of plan.segments) {
    if (planned.kind === 'opaque') continue
    if (planned.length <= 0) {
      throw new Error('fp-compiler: static plan contains an empty segment')
    }
    const indexed = indexedSteps(planned)
    if (planned.kind === 'boundary') {
      if (
        indexed.length !== 1 ||
        (indexed[0].step.fact.compilerPipelineRole !== 'boundary' &&
          !(
            planned.sourceTierBoundary === true &&
            indexed[0].step.fact.compilerPipelineRole === 'terminal'
          ))
      ) {
        throw new Error('fp-compiler: boundary plan segment does not contain one boundary fact')
      }
      segments.push({ kind: 'boundary', step: indexed[0] })
      continue
    }

    if (planned.kind === 'option') {
      let sawTerminal = false
      for (const item of indexed) {
        if (sawTerminal) {
          throw new Error('fp-compiler: option plan segment contains a step after its terminal')
        }
        if (item.step.fact.compilerPipelineRole === 'boundary') {
          throw new Error('fp-compiler: option plan segment contains a boundary fact')
        }
        if (item.step.fact.compilerPipelineRole === 'terminal') sawTerminal = true
      }
      segments.push({ kind: 'option', steps: indexed })
      continue
    }

    if (planned.kind === 'dict') {
      const dictElements: IndexedStep[] = []
      let dictTerminal: IndexedStep | undefined
      for (const item of indexed) {
        const role = item.step.fact.compilerPipelineRole
        if (role === 'boundary') {
          throw new Error('fp-compiler: dict plan segment contains a boundary fact')
        }
        if (role === 'terminal') {
          if (dictTerminal !== undefined) {
            throw new Error('fp-compiler: dict plan segment contains a step after its terminal')
          }
          dictTerminal = item
        } else {
          if (dictTerminal !== undefined) {
            throw new Error('fp-compiler: dict plan segment contains a step after its terminal')
          }
          dictElements.push(item)
        }
      }
      segments.push({
        kind: 'dict',
        steps: dictElements,
        ...(dictTerminal === undefined ? {} : { terminal: dictTerminal }),
      })
      continue
    }

    if (planned.kind === 'iterable') {
      const iterElements: IndexedStep[] = []
      let iterTerminal: IndexedStep | undefined
      for (const item of indexed) {
        const role = item.step.fact.compilerPipelineRole
        if (role === 'boundary') {
          throw new Error('fp-compiler: iterable plan segment contains a boundary fact')
        }
        if (role === 'terminal') {
          if (iterTerminal !== undefined) {
            throw new Error('fp-compiler: iterable plan segment contains a step after its terminal')
          }
          iterTerminal = item
        } else {
          if (iterTerminal !== undefined) {
            throw new Error('fp-compiler: iterable plan segment contains a step after its terminal')
          }
          iterElements.push(item)
        }
      }
      segments.push({
        kind: 'iterable',
        steps: iterElements,
        ...(iterTerminal === undefined ? {} : { terminal: iterTerminal }),
      })
      continue
    }

    const elements: IndexedStep[] = []
    let terminal: IndexedStep | undefined
    for (const item of indexed) {
      const role = item.step.fact.compilerPipelineRole
      if (role === 'boundary') {
        throw new Error('fp-compiler: stream plan segment contains a boundary fact')
      }
      if (role === 'terminal') {
        if (terminal !== undefined || item.index !== planned.terminalIndex) {
          throw new Error('fp-compiler: stream plan terminal metadata is inconsistent')
        }
        terminal = item
      } else {
        if (terminal !== undefined) {
          throw new Error('fp-compiler: stream plan contains an operator after its terminal')
        }
        elements.push(item)
      }
    }
    if ((terminal === undefined) !== (planned.terminalIndex === undefined)) {
      throw new Error('fp-compiler: stream plan terminal is missing')
    }
    segments.push({
      kind: 'element',
      steps: elements,
      ...(terminal === undefined ? {} : { terminal }),
    })
  }
  return segments
}

export const segmentKindsForSteps = (steps: readonly Step[]): readonly ('stream' | 'boundary')[] =>
  segmentSteps(steps).map((segment) => (segment.kind === 'boundary' ? 'boundary' : 'stream'))

/**
 * Single-step collectors can retain the runtime operation's exact
 * cardinality-aware representation. The generic fuser deliberately grows an
 * output with push because filters and expanding stages do not know their
 * final size; doing that for map/take/drop needlessly gives up dense
 * preallocation or the engine's native slice fast path.
 */
function emitSingleStepCollector(
  seg: ElementSegment,
  curData: string,
  nextData: string,
  code: string,
  preLines: string[],
  inlineCallbacks: boolean,
  renderExpression: ExpressionRenderer,
  renderSource: SourceRangeRenderer,
  arrayConstructorExpression: string | undefined,
  globalUndefinedIsUnbound: boolean,
  sequentialStage: boolean,
): string[] | undefined {
  if (seg.terminal || seg.steps.length !== 1) return undefined
  const { index, step } = seg.steps[0]
  const args = step.args
  const length = `_len${index}`

  switch (step.name) {
    case 'map': {
      const callbackLines = emitCallback(
        args[0],
        code,
        `_cb${index}`,
        preLines,
        ['_v0'],
        inlineCallbacks,
        renderExpression,
        renderSource,
        (expr) => [`${nextData}[_i] = ${expr};`],
      )
      const allocation =
        arrayConstructorExpression === undefined
          ? [`var ${nextData} = [];`, `${nextData}.length = ${length};`]
          : [`var ${nextData} = new ${arrayConstructorExpression}(${length});`]
      return [
        `var ${length} = ${curData}.length;`,
        ...allocation,
        `for (var _i = 0; _i < ${length}; _i++) {`,
        `var _v0 = ${curData}[_i];`,
        ...callbackLines,
        '}',
      ]
    }
    case 'mapWithIndex': {
      const callbackLines = emitCallback(
        args[0],
        code,
        `_cb${index}`,
        preLines,
        ['_v0', '_i'],
        inlineCallbacks,
        renderExpression,
        renderSource,
        (expr) => [`${nextData}[_i] = ${expr};`],
      )
      const allocation =
        arrayConstructorExpression === undefined
          ? [`var ${nextData} = [];`, `${nextData}.length = ${length};`]
          : [`var ${nextData} = new ${arrayConstructorExpression}(${length});`]
      return [
        `var ${length} = ${curData}.length;`,
        ...allocation,
        `for (var _i = 0; _i < ${length}; _i++) {`,
        `var _v0 = ${curData}[_i];`,
        ...callbackLines,
        '}',
      ]
    }
    case 'filterMap':
    case 'mapWhile': {
      const conditional = planPresentConditional(args[0], globalUndefinedIsUnbound)
      if (!conditional) return undefined
      const test = renderMappedInline(
        renderDirectInlineExpressionMapped(conditional.callback, conditional.test, code, ['_v0']),
        renderSource,
      )
      const value = renderMappedInline(
        renderDirectInlineExpressionMapped(conditional.callback, conditional.value, code, ['_v0']),
        renderSource,
      )
      if (test === undefined || value === undefined) return undefined
      const passes = conditional.valueWhenTestPasses ? `(${test})` : `!(${test})`
      const body =
        step.name === 'filterMap'
          ? [`if (${passes}) { ${nextData}.push((${value})); }`]
          : [`if (!(${passes})) break;`, `${nextData}.push((${value}));`]
      return [
        `var ${nextData} = [];`,
        `var ${length} = ${curData}.length;`,
        `for (var _i = 0; _i < ${length}; _i++) {`,
        `var _v0 = ${curData}[_i];`,
        ...body,
        '}',
      ]
    }
    case 'take': {
      if (!sequentialStage) return undefined
      const renderedCount = renderExpression(args[0])
      const count = /^[A-Za-z_$][\w$]*$/u.test(renderedCount) ? renderedCount : `_n${index}`
      if (count !== renderedCount) preLines.push(`var ${count} = (${renderedCount});`)
      return [
        `var ${length} = ${curData}.length;`,
        `var ${nextData};`,
        `if (${count} <= 0) {`,
        `${nextData} = [];`,
        '} else {',
        `${nextData} = ${curData}.slice(0, ${count} > ${length} ? ${length} : ${count});`,
        '}',
      ]
    }
    case 'drop': {
      if (!sequentialStage) return undefined
      const renderedCount = renderExpression(args[0])
      const count = /^[A-Za-z_$][\w$]*$/u.test(renderedCount) ? renderedCount : `_n${index}`
      if (count !== renderedCount) preLines.push(`var ${count} = (${renderedCount});`)
      return [
        `var ${length} = ${curData}.length;`,
        `var ${nextData};`,
        `if (${count} <= 0) {`,
        `${nextData} = ${curData}.slice();`,
        `} else if (${count} >= ${length}) {`,
        `${nextData} = [];`,
        '} else {',
        `${nextData} = ${curData}.slice(${count});`,
        '}',
      ]
    }
    case 'dropWhile': {
      if (!sequentialStage) return undefined
      const callbackLines = emitCallback(
        args[0],
        code,
        `_cb${index}`,
        preLines,
        ['_v0'],
        inlineCallbacks,
        renderExpression,
        renderSource,
        (expr) => [`if (!${expr}) { ${nextData} = ${curData}.slice(_i); break; }`],
      )
      return [
        `var ${nextData} = [];`,
        `var ${length} = ${curData}.length;`,
        `for (var _i = 0; _i < ${length}; _i++) {`,
        `var _v0 = ${curData}[_i];`,
        ...callbackLines,
        '}',
      ]
    }
    case 'reject':
    case 'takeWhile': {
      if (!sequentialStage) return undefined
      const callbackLines = emitCallback(
        args[0],
        code,
        `_cb${index}`,
        preLines,
        ['_v0'],
        inlineCallbacks,
        renderExpression,
        renderSource,
        (expr) =>
          step.name === 'reject'
            ? [`if (!${expr}) { ${nextData}.push(${curData}[_i]); }`]
            : [`if (!${expr}) break;`, `${nextData}.push(${curData}[_i]);`],
      )
      return [
        `var ${nextData} = [];`,
        `var ${length} = ${curData}.length;`,
        `for (var _i = 0; _i < ${length}; _i++) {`,
        `var _v0 = ${curData}[_i];`,
        ...callbackLines,
        '}',
      ]
    }
    default:
      return undefined
  }
}

function emitSequentialPropertyTerminal(
  seg: ElementSegment,
  curData: string,
  nextData: string,
  optionNoneLocal: string,
): string[] | undefined {
  if (seg.steps.length !== 0 || seg.terminal === undefined) {
    return undefined
  }
  switch (seg.terminal.step.name) {
    case 'head':
      return [
        `var ${nextData} = ${curData}.length === 0 ? ${optionNoneLocal} : { _tag: 1, value: ${curData}[0] };`,
      ]
    case 'last':
      return [
        `var ${nextData} = ${curData}.length === 0 ? ${optionNoneLocal} : { _tag: 1, value: ${curData}[${curData}.length - 1] };`,
      ]
    case 'length':
      return [`var ${nextData} = ${curData}.length;`]
    case 'isEmpty':
      return [`var ${nextData} = ${curData}.length === 0;`]
    default:
      return undefined
  }
}

const NO_CALLBACK_HANDLE: CallbackHandle = {
  emit: () => {
    throw new Error('fp-compiler: op has no callback slot')
  },
}

// Wraps `emitCallback` behind the `CallbackHandle` contract a template calls
// through `ctx.cb.emit(...)`. `emitCallback` would otherwise push a
// hoisted-temp declaration straight onto the shared `preLines` array; here
// it comes back as `pre` data instead, so a template decides where it lands
// relative to its own `pre` lines (see the comment on `CallbackHandle` in
// operator-v1.ts).
function makeCallbackHandle(
  argNode: t.Expression,
  tempName: string,
  code: string,
  inlineCallbacks: boolean,
  renderExpression: ExpressionRenderer,
  renderSource: SourceRangeRenderer,
): CallbackHandle {
  return {
    emit: (inputVars, use) => {
      const pre: string[] = []
      const body = emitCallback(
        argNode,
        code,
        tempName,
        pre,
        inputVars,
        inlineCallbacks,
        renderExpression,
        renderSource,
        use as (expr: string) => string[],
      )
      return { pre, body }
    },
  }
}

type ElementOpEmit = Exclude<
  OpEmit,
  { kind: 'boundary' } | { kind: 'optionStep' } | { kind: 'dictStep' } | { kind: 'iterStep' }
>

function requireElementEmit(name: string): ElementOpEmit {
  const emit = opEmitFor(name)
  if (
    !emit ||
    emit.kind === 'boundary' ||
    emit.kind === 'optionStep' ||
    emit.kind === 'dictStep' ||
    emit.kind === 'iterStep'
  ) {
    throw new Error(`fp-compiler: unhandled element op ${name}`)
  }
  return emit
}

/**
 * Builds the per-step template context. Bound arguments beyond a real
 * callback (arity > 0 puts it at args[0]) are rendered to text up front, so
 * templates never see an AST node. `isTerminal` picks the counter/position/
 * temp naming a `withIndex` op uses -- `_ix`/`_ixv`/`_cb` for an element
 * step, `_ixT`/`_ixvT`/`_cbT` for the terminal -- matching the hand-written
 * emitter's names exactly.
 */
function elementCtx(
  step: Step,
  index: number,
  curVar: string,
  next: string,
  isTerminal: boolean,
  code: string,
  stateLines: string[],
  bodyLines: string[],
  inlineCallbacks: boolean,
  renderExpression: ExpressionRenderer,
  renderSource: SourceRangeRenderer,
  sequentialStage: boolean,
  outerLabel: string,
  optionNoneLocal: string,
): ElementEmitCtx {
  const emit = requireElementEmit(step.name)
  const arity = callbackArity(step.name) ?? 0
  const hasCallback = arity > 0
  const restStart = hasCallback ? 1 : 0
  const a1Node = step.args[restStart]
  const a2Node = step.args[restStart + 1]
  const tSuffix = isTerminal ? 'T' : ''
  const cb = hasCallback
    ? makeCallbackHandle(
        step.args[0],
        `_cb${tSuffix}${index}`,
        code,
        inlineCallbacks,
        renderExpression,
        renderSource,
      )
    : NO_CALLBACK_HANDLE
  const indexed = !!emit.indexed
  const position = indexed ? `_ixv${tSuffix}${index}` : ''
  if (indexed) {
    stateLines.push(`var _ix${tSuffix}${index} = 0;`)
    bodyLines.push(`var ${position} = _ix${tSuffix}${index}++;`)
  }
  return {
    index,
    v: curVar,
    next,
    a1: a1Node ? `(${renderExpression(a1Node)})` : '',
    a2: a2Node ? `(${renderExpression(a2Node)})` : '',
    indexed,
    position,
    outerLabel,
    sequential: sequentialStage,
    optionNone: optionNoneLocal,
    cb,
  }
}

// The one emission a template kind cannot express: `findMap`'s AST fast
// path recognizes a `x != null ? x : undefined`-shaped callback and inlines
// its test/value expressions directly, skipping the callback call entirely.
// That needs `planPresentConditional` over the raw arrow function, which a
// serializable template has no access to. Falls back to the ops-table
// template (the slow path) when the shape doesn't match.
type ElementOverride = (
  ctx: ElementEmitCtx,
  args: readonly t.Expression[],
  code: string,
  renderSource: SourceRangeRenderer,
  globalUndefinedIsUnbound: boolean,
) => EmitFragment | undefined

const ELEMENT_EMIT_OVERRIDES: Readonly<Record<string, ElementOverride>> = {
  findMap: (ctx, args, code, renderSource, globalUndefinedIsUnbound) => {
    const conditional = planPresentConditional(args[0], globalUndefinedIsUnbound)
    if (!conditional) return undefined
    const test = renderMappedInline(
      renderDirectInlineExpressionMapped(conditional.callback, conditional.test, code, [ctx.v]),
      renderSource,
    )
    const value = renderMappedInline(
      renderDirectInlineExpressionMapped(conditional.callback, conditional.value, code, [ctx.v]),
      renderSource,
    )
    if (test === undefined || value === undefined) return undefined
    const passes = conditional.valueWhenTestPasses ? `(${test})` : `!(${test})`
    return {
      pre: [`var ${ctx.next} = ${ctx.optionNone};`],
      body: [
        `if (${passes}) { ${ctx.next} = { _tag: 1, value: (${value}) }; break ${ctx.outerLabel}; }`,
      ],
    }
  },
}

function emitStep(
  step: Step,
  ctx: ElementEmitCtx,
  code: string,
  renderSource: SourceRangeRenderer,
  globalUndefinedIsUnbound: boolean,
): EmitFragment {
  return (
    ELEMENT_EMIT_OVERRIDES[step.name]?.(ctx, step.args, code, renderSource, globalUndefinedIsUnbound) ??
    requireElementEmit(step.name).render(ctx)
  )
}

function splice(
  fragment: EmitFragment,
  preLines: string[],
  stateLines: string[],
  bodyLines: string[],
  closeBraces: string[],
): void {
  preLines.push(...(fragment.pre ?? []))
  stateLines.push(...(fragment.state ?? []))
  bodyLines.push(...fragment.body)
  closeBraces.push(...(fragment.close ?? []))
}

function emitElementSegment(
  seg: ElementSegment,
  curData: string,
  nextData: string,
  code: string,
  preLines: string[],
  optionNoneLocal: string,
  inlineCallbacks: boolean,
  renderExpression: ExpressionRenderer,
  renderSource: SourceRangeRenderer,
  arrayConstructorExpression: string | undefined,
  globalUndefinedIsUnbound: boolean,
  outerLabel: string,
  sequentialStage: boolean,
): string[] {
  const propertyTerminal = emitSequentialPropertyTerminal(seg, curData, nextData, optionNoneLocal)
  if (propertyTerminal !== undefined) return propertyTerminal

  const singleStepCollector = emitSingleStepCollector(
    seg,
    curData,
    nextData,
    code,
    preLines,
    inlineCallbacks,
    renderExpression,
    renderSource,
    arrayConstructorExpression,
    globalUndefinedIsUnbound,
    sequentialStage,
  )
  if (singleStepCollector) return singleStepCollector

  const stateLines: string[] = []
  const bodyLines: string[] = []
  const closeBraces: string[] = []

  bodyLines.push(`var _v0 = ${curData}[_i];`)
  let curVar = '_v0'

  seg.steps.forEach(({ index, step }) => {
    const nextVar = `_v${index + 1}`
    const ctx = elementCtx(
      step,
      index,
      curVar,
      nextVar,
      false,
      code,
      stateLines,
      bodyLines,
      inlineCallbacks,
      renderExpression,
      renderSource,
      sequentialStage,
      outerLabel,
      optionNoneLocal,
    )
    const fragment = emitStep(step, ctx, code, renderSource, globalUndefinedIsUnbound)
    splice(fragment, preLines, stateLines, bodyLines, closeBraces)
    curVar = nextVar
  })

  const terminal = seg.terminal
  if (!terminal) {
    preLines.push(`var ${nextData} = [];`)
    bodyLines.push(`${nextData}.push(${curVar});`)
  } else {
    const { index, step } = terminal
    const ctx = elementCtx(
      step,
      index,
      curVar,
      nextData,
      true,
      code,
      stateLines,
      bodyLines,
      inlineCallbacks,
      renderExpression,
      renderSource,
      sequentialStage,
      outerLabel,
      optionNoneLocal,
    )
    const fragment = emitStep(step, ctx, code, renderSource, globalUndefinedIsUnbound)
    splice(fragment, preLines, stateLines, bodyLines, closeBraces)
  }

  const loopIndex = seg.steps[0]?.index ?? seg.terminal!.index
  const loopLength = `_len${loopIndex}`
  stateLines.unshift(`var ${loopLength} = ${curData}.length;`)
  return [
    stateLines.join('\n'),
    `${outerLabel}: for (var _i = 0; _i < ${loopLength}; _i++) {`,
    bodyLines.join('\n'),
    ...closeBraces,
    '}',
  ]
}

// -- Phase 2: Option and Result -----------------------------------------
//
// An option/result segment is straight-line: no loop, no per-step variable
// renaming. `_ok`/`_v`(/`_err`) are declared once and mutated in place by
// every step's template (see the templates in operator-definitions.ts),
// exactly like the plan's own worked example
// (`pipe(x, O.fromNullable, O.map(f), O.filter(p), O.getOrElse(0))`).
//
// Identity is tracked separately from the templates, here, because it is a
// whole-run property no single op's template can see: `okRef`/`errRef`
// record what the *whole* Some/Ok or None/Err object would be if the chain
// ended right after the most recent step, so the final materialization can
// return the caller's own object instead of allocating a new one when
// nothing has actually changed it.

type RefUpdateKind = 'unchanged' | 'invalidate' | 'fresh'
interface RefUpdate {
  readonly kind: RefUpdateKind
  readonly prefix?: string
}
const UNCHANGED_REF: RefUpdate = { kind: 'unchanged' }
const INVALIDATE_REF: RefUpdate = { kind: 'invalidate' }
const freshRef = (prefix: string): RefUpdate => ({ kind: 'fresh', prefix })

interface RefState {
  readonly valid: boolean
  readonly expr: string
}
const INVALID_REF: RefState = { valid: false, expr: '' }

/**
 * Per-op identity transition, keyed by the canonical compiler name. Absent
 * for a terminal op (getOrElse/match/toUndefined/toNullable/toOption): those
 * end the run and compute their own output directly from `_ok`/`_v`/`_err`,
 * never from `okRef`/`errRef`.
 *
 * `optionFlatMap`/`resultFlatMap` land on one deterministic source when they
 * succeed (the callback's own returned Option/Result is the only way to
 * reach "ok" after them), so `ok` is always a fresh, valid reference. The two
 * cases whose *failure* channel is reachable two different ways
 * (`resultFlatMap`'s `err` -- pass-through-already-Err, or new-Err-from-
 * callback; `optionOrElse`'s `ok` -- pass-through-already-Some, or
 * fallback-now-Some) are deliberately conservative and always invalidate: a
 * correct, occasionally-one-allocation-more choice, not a soundness gap.
 */
const OPTION_REF_RULES: Readonly<
  Record<string, { readonly ok: RefUpdate; readonly err?: RefUpdate }>
> = {
  optionFromNullable: { ok: INVALIDATE_REF },
  optionFromPredicate: { ok: INVALIDATE_REF },
  optionMap: { ok: INVALIDATE_REF },
  optionFlatMap: { ok: freshRef('_t') },
  optionFilter: { ok: UNCHANGED_REF },
  optionOrElse: { ok: INVALIDATE_REF },
  optionTap: { ok: UNCHANGED_REF },
  optionZip: { ok: INVALIDATE_REF },
  resultMap: { ok: INVALIDATE_REF, err: UNCHANGED_REF },
  resultMapErr: { ok: UNCHANGED_REF, err: INVALIDATE_REF },
  resultFlatMap: { ok: freshRef('_t'), err: INVALIDATE_REF },
  resultFromThrowable: { ok: INVALIDATE_REF, err: INVALIDATE_REF },
}

function applyRefUpdate(pre: RefState, update: RefUpdate | undefined, index: number): RefState {
  if (update === undefined || update.kind === 'unchanged') return pre
  if (update.kind === 'invalidate') return INVALID_REF
  return { valid: true, expr: `${update.prefix}${index}` }
}

type OptionOpEmit = Extract<OpEmit, { kind: 'optionStep' }>

function requireOptionEmit(name: string): OptionOpEmit {
  const emit = opEmitFor(name)
  if (!emit || emit.kind !== 'optionStep') {
    throw new Error(`fp-compiler: unhandled option op ${name}`)
  }
  return emit
}

function optionElementCtx(
  step: Step,
  index: number,
  ok: string,
  v: string,
  err: string,
  next: string,
  code: string,
  inlineCallbacks: boolean,
  renderExpression: ExpressionRenderer,
  renderSource: SourceRangeRenderer,
  optionNoneLocal: string,
): OptionEmitCtx {
  const arity = callbackArity(step.name) ?? 0
  const hasCallback = arity > 0
  const restStart = hasCallback ? 1 : 0
  const a1Node = step.args[restStart]
  const a2Node = step.args[restStart + 1]
  const cb = hasCallback
    ? makeCallbackHandle(
        step.args[0],
        `_cb${index}`,
        code,
        inlineCallbacks,
        renderExpression,
        renderSource,
      )
    : NO_CALLBACK_HANDLE
  return {
    index,
    ok,
    v,
    err,
    next,
    a1: a1Node ? `(${renderExpression(a1Node)})` : '',
    a2: a2Node ? `(${renderExpression(a2Node)})` : '',
    optionNone: optionNoneLocal,
    cb,
  }
}

function emitOptionSegment(
  seg: OptionSegment,
  curData: string,
  nextData: string,
  code: string,
  preLines: string[],
  optionNoneLocal: string,
  inlineCallbacks: boolean,
  renderExpression: ExpressionRenderer,
  renderSource: SourceRangeRenderer,
): string[] {
  const bodyLines: string[] = []
  const startIndex = seg.steps[0].index
  const firstFact = seg.steps[0].step.fact
  const isResult = seg.steps.some(
    ({ step }) => step.fact.inputDomain === 'result' || step.fact.outputDomain === 'result',
  )
  const isConstructorStart = firstFact.inputDomain === 'scalar'
  const ok = `_ok${startIndex}`
  const v = `_v${startIndex}`
  const err = isResult ? `_err${startIndex}` : ''

  bodyLines.push(`var ${v} = ${curData};`)
  let okRef: RefState
  let errRef: RefState = INVALID_REF
  if (isConstructorStart) {
    // A constructor (fromNullable/fromPredicate/fromThrowable) computes
    // `_ok`(/`_v`/`_err`) itself from the raw incoming value; it declares no
    // wrapper object of its own, so there is nothing to reuse at the end.
    bodyLines.push(`var ${ok};`)
    if (isResult) bodyLines.push(`var ${err};`)
    okRef = INVALID_REF
  } else {
    // The run starts from an already-built Option/Result (either the pipe's
    // own source, or a preceding array segment's Option-producing terminal --
    // head/find/... -- flowing straight into this one). Reading `._tag`/
    // `.value`/`.error` is a cheap property access, not an allocation.
    bodyLines.push(`var ${ok} = ${v}._tag === 1;`)
    if (isResult) {
      bodyLines.push(`var ${err};`)
      bodyLines.push(`if (${ok}) { ${v} = ${v}.value; } else { ${err} = ${v}.error; }`)
    } else {
      bodyLines.push(`if (${ok}) { ${v} = ${v}.value; }`)
    }
    okRef = { valid: true, expr: curData }
    errRef = isResult ? { valid: true, expr: curData } : INVALID_REF
  }

  let endsInTerminal = false
  seg.steps.forEach(({ index, step }) => {
    const emit = requireOptionEmit(step.name)
    const isTerminal = step.fact.compilerPipelineRole === 'terminal'
    endsInTerminal = isTerminal
    const ctx = optionElementCtx(
      step,
      index,
      ok,
      v,
      err,
      isTerminal ? nextData : '',
      code,
      inlineCallbacks,
      renderExpression,
      renderSource,
      optionNoneLocal,
    )
    const fragment = emit.render(ctx)
    preLines.push(...(fragment.pre ?? []))
    bodyLines.push(...(fragment.state ?? []), ...fragment.body, ...(fragment.close ?? []))
    if (!isTerminal) {
      const rule = OPTION_REF_RULES[step.name]
      okRef = applyRefUpdate(okRef, rule?.ok, index)
      if (isResult) errRef = applyRefUpdate(errRef, rule?.err, index)
    }
  })

  if (!endsInTerminal) {
    const okExpr = okRef.valid ? okRef.expr : `{ _tag: 1, value: ${v} }`
    const notOkExpr = isResult
      ? errRef.valid
        ? errRef.expr
        : `{ _tag: 0, error: ${err} }`
      : optionNoneLocal
    bodyLines.push(`var ${nextData} = ${ok} ? (${okExpr}) : (${notOkExpr});`)
  }

  return bodyLines
}

// -- Phase 3: Record/Map/Set ("dict domain") ----------------------------
//
// Unlike an Option/Result segment, a dict segment is a real fused loop: one
// `for` over the source container, `_k`/`_v` persistent locals (named
// `_k{startIndex}`/`_v{startIndex}` after the segment's first step, exactly
// like `emitOptionSegment`'s `_ok{startIndex}`/`_v{startIndex}`) mutated in
// place by each step's template, then either a domain-appropriate default
// collector (map/filter/mapKeys/flatMap with no following terminal) or a
// terminal template (`partition`/`reduce`) that assigns the segment's result
// straight into `nextData`.

type DictOpEmit = Extract<OpEmit, { kind: 'dictStep' }>

function requireDictEmit(name: string): DictOpEmit {
  const emit = opEmitFor(name)
  if (!emit || emit.kind !== 'dictStep') {
    throw new Error(`fp-compiler: unhandled dict op ${name}`)
  }
  return emit
}

function dictElementCtx(
  step: Step,
  index: number,
  domain: 'record' | 'map' | 'set',
  k: string,
  v: string,
  next: string,
  code: string,
  inlineCallbacks: boolean,
  renderExpression: ExpressionRenderer,
  renderSource: SourceRangeRenderer,
): DictEmitCtx {
  const arity = callbackArity(step.name) ?? 0
  const hasCallback = arity > 0
  const restStart = hasCallback ? 1 : 0
  const a1Node = step.args[restStart]
  const a2Node = step.args[restStart + 1]
  const cb = hasCallback
    ? makeCallbackHandle(
        step.args[0],
        `_dcb${index}`,
        code,
        inlineCallbacks,
        renderExpression,
        renderSource,
      )
    : NO_CALLBACK_HANDLE
  return {
    index,
    domain,
    k,
    v,
    next,
    a1: a1Node ? `(${renderExpression(a1Node)})` : '',
    a2: a2Node ? `(${renderExpression(a2Node)})` : '',
    cb,
  }
}

function dictSegmentDomain(seg: DictSegment): 'record' | 'map' | 'set' {
  const anchor = seg.steps[0] ?? seg.terminal
  if (anchor === undefined) throw new Error('fp-compiler: empty dict plan segment')
  const domain = anchor.step.fact.inputDomain
  if (domain !== 'record' && domain !== 'map' && domain !== 'set') {
    throw new Error(`fp-compiler: dict plan segment has non-dict-domain fact ${domain}`)
  }
  return domain
}

function emitDictSegment(
  seg: DictSegment,
  curData: string,
  nextData: string,
  code: string,
  preLines: string[],
  inlineCallbacks: boolean,
  renderExpression: ExpressionRenderer,
  renderSource: SourceRangeRenderer,
): string[] {
  const domain = dictSegmentDomain(seg)
  const startIndex = (seg.steps[0] ?? seg.terminal!).index
  const k = `_k${startIndex}`
  const v = `_v${startIndex}`

  const stateLines: string[] = []
  const bodyLines: string[] = []
  const closeBraces: string[] = []

  let loopOpen: string
  if (domain === 'record') {
    // Reproduces `record.ts#enumerableKeys` exactly: one `Reflect.ownKeys`
    // snapshot (a stateful Proxy `ownKeys` trap must be enumerated once),
    // compacted in place to the keys `propertyIsEnumerable` accepts --
    // including symbol keys, and in `Reflect.ownKeys`'s own order
    // (integer-like string keys ascending, then other strings by insertion,
    // then symbols), not `Object.keys`/`for...in`/`Object.hasOwn`.
    const keys = `_dkeys${startIndex}`
    const scan = `_dscan${startIndex}`
    const write = `_dwrite${startIndex}`
    const scanKey = `_dskey${startIndex}`
    stateLines.push(
      `var ${keys} = Reflect.ownKeys(${curData});`,
      `var ${write} = 0;`,
      `for (var ${scan} = 0; ${scan} < ${keys}.length; ${scan}++) {`,
      `var ${scanKey} = ${keys}[${scan}];`,
      `if (Object.prototype.propertyIsEnumerable.call(${curData}, ${scanKey})) { ${keys}[${write}++] = ${scanKey}; }`,
      '}',
      `${keys}.length = ${write};`,
    )
    const ri = `_dri${startIndex}`
    loopOpen = `for (var ${ri} = 0; ${ri} < ${keys}.length; ${ri}++) {`
    bodyLines.push(`var ${k} = ${keys}[${ri}];`, `var ${v} = ${curData}[${k}];`)
  } else if (domain === 'map') {
    loopOpen = `for (var [${k}, ${v}] of ${curData}) {`
  } else {
    loopOpen = `for (var ${v} of ${curData}) {`
  }

  seg.steps.forEach(({ index, step }) => {
    const ctx = dictElementCtx(
      step,
      index,
      domain,
      k,
      v,
      '',
      code,
      inlineCallbacks,
      renderExpression,
      renderSource,
    )
    const fragment = requireDictEmit(step.name).render(ctx)
    splice(fragment, preLines, stateLines, bodyLines, closeBraces)
  })

  const terminal = seg.terminal
  if (!terminal) {
    if (domain === 'record') {
      preLines.push(`var ${nextData} = Object.create(null);`)
      bodyLines.push(`${nextData}[${k}] = ${v};`)
    } else if (domain === 'map') {
      preLines.push(`var ${nextData} = new Map();`)
      bodyLines.push(`${nextData}.set(${k}, ${v});`)
    } else {
      preLines.push(`var ${nextData} = new Set();`)
      bodyLines.push(`${nextData}.add(${v});`)
    }
  } else {
    const { index, step } = terminal
    const ctx = dictElementCtx(
      step,
      index,
      domain,
      k,
      v,
      nextData,
      code,
      inlineCallbacks,
      renderExpression,
      renderSource,
    )
    const fragment = requireDictEmit(step.name).render(ctx)
    splice(fragment, preLines, stateLines, bodyLines, closeBraces)
  }

  return [stateLines.join('\n'), loopOpen, bodyLines.join('\n'), ...closeBraces, '}']
}

// -- Phase 4: Iterable domain --------------------------------------------
//
// Like a dict segment, an iterable segment is a real fused loop: one
// `for (const _v of _src)` (or an indexed array loop when the source is
// statically known to be an Array -- `curDataIsArray`, threaded down from
// `generateFusedBody`/`generateStaticPlanBody`; this is what lets a bundler
// consumer skip `iter.ts`'s runtime kernel machinery entirely), `_v{startIndex}`
// mutated in place by each step's template exactly like `emitDictSegment`'s
// `_k`/`_v`. A step whose `compilerPipelineRole` is `'terminal'` ends the run
// and eagerly assigns to `nextData`, exactly like `DictSegment.terminal`.
//
// With no terminal, the whole loop becomes the body of a generator wrapped
// in a plain object literal -- `{ [Symbol.iterator]: function () { return
// (function* () { ... })() } }` -- re-invoked fresh on every
// `[Symbol.iterator]()` call, matching `iter.ts#make`'s lazy, re-iterable
// contract: the source is captured exactly once (evaluated once, like every
// other pipe argument -- `curData` is a stable local by the time this runs),
// but each traversal re-walks it from scratch, so a one-shot generator
// source is exhausted after the first pass and a re-iterable source (an
// Array, another Iter) runs again correctly, both matching `iter.ts` today.

type IterOpEmit = Extract<OpEmit, { kind: 'iterStep' }>

function requireIterEmit(name: string): IterOpEmit {
  const emit = opEmitFor(name)
  if (!emit || emit.kind !== 'iterStep') {
    throw new Error(`fp-compiler: unhandled iterable op ${name}`)
  }
  return emit
}

/**
 * Builds the per-step template context. Every Iter callback takes
 * `(value, index)`, so `indexed`/`position` follow `elementCtx`'s
 * `withIndex` mechanism exactly, just applied per `emit.indexed` rather than
 * per name -- see the comment on `IterEmitCtx` in operator-v1.ts for why an
 * unconditional per-step counter is safe even for `dropWhile`, whose real
 * index stops advancing once its predicate latches.
 */
function iterElementCtx(
  step: Step,
  index: number,
  v: string,
  isTerminal: boolean,
  nextData: string,
  code: string,
  stateLines: string[],
  bodyLines: string[],
  inlineCallbacks: boolean,
  renderExpression: ExpressionRenderer,
  renderSource: SourceRangeRenderer,
  outerLabel: string,
  optionNoneLocal: string,
): IterEmitCtx {
  const emit = requireIterEmit(step.name)
  const arity = callbackArity(step.name) ?? 0
  const hasCallback = arity > 0
  const restStart = hasCallback ? 1 : 0
  const a1Node = step.args[restStart]
  const a2Node = step.args[restStart + 1]
  const cb = hasCallback
    ? makeCallbackHandle(
        step.args[0],
        `_icb${index}`,
        code,
        inlineCallbacks,
        renderExpression,
        renderSource,
      )
    : NO_CALLBACK_HANDLE
  const indexed = !!emit.indexed
  const position = indexed ? `_ipv${index}` : ''
  if (indexed) {
    stateLines.push(`var _ipc${index} = 0;`)
    bodyLines.push(`var ${position} = _ipc${index}++;`)
  }
  return {
    index,
    v,
    next: isTerminal ? nextData : '',
    a1: a1Node ? `(${renderExpression(a1Node)})` : '',
    a2: a2Node ? `(${renderExpression(a2Node)})` : '',
    indexed,
    position,
    outerLabel,
    optionNone: optionNoneLocal,
    cb,
  }
}

/**
 * `iterTakeTemplate`'s internal clamped-count local, by construction (not by
 * reading it back out of the spliced fragment text): `_itn{index}`. Used to
 * build the whole-segment "any take is zero" guard below.
 */
const iterTakeZeroGuardVar = (index: number): string => `_itn${index}`

/**
 * A real fused loop over `curData`, `_v{startIndex}` mutated in place by
 * each step exactly like `emitDictSegment`. Two cross-cutting concerns live
 * here rather than in any one template:
 *
 * - `iter.ts#hasZeroTake`: a `take` step whose clamped count is exactly 0
 *   never evaluates the upstream iterable at all, wherever it sits in the
 *   chain. Every template's own `pre` already establishes the correct
 *   zero-elements result (`toArray`'s `[]`, `count`'s `0`, `find`'s `None`,
 *   ...), so wrapping only the loop itself in a guard reproduces that with
 *   no separate empty-result branch.
 * - `iterChunk`'s trailing partial buffer: real `chunk` only flushes it when
 *   its own upstream generator ends *naturally* (source exhaustion, or an
 *   upstream stage's own generator concluding), never when a downstream
 *   consumer abandons it early (`.return()`). In this fused single loop, a
 *   break from a downstream stage can only ever fire on an iteration where
 *   `chunk` has *just* emitted and reset its buffer to empty (downstream
 *   only runs when `chunk` forwards a full buffer), and a break from an
 *   upstream stage always lands here with the buffer however it was left --
 *   exactly the "my own source ended" case that real `chunk` flushes. So an
 *   unconditional `if (buffer.length > 0)` after the loop, replaying
 *   whatever ran after `chunk`'s own step, is correct either way with no
 *   need to track whether the loop exited via `break` at all. The replay is
 *   wrapped in its own labeled one-shot `do...while (false)` so a
 *   downstream `continue`/`break outerLabel` inside it -- syntax only legal
 *   inside a loop -- still resolves correctly for exactly one pass. (Known
 *   gap: a step upstream of `chunk` that opens its own nested scope, i.e.
 *   `flatMap` immediately before `chunk`, is not replayed correctly here --
 *   not exercised by this wave's op set combinations.)
 *
 * Known, accepted over-read: `take`'s own exhaustion guard (below) is
 * hoisted to the front of the loop body, so once it fires it stops before
 * `chunk` (or any other upstream step) does any work for that source
 * element -- but the `for (const _v of _src)` loop has already pulled that
 * one raw element to reach the top of the body at all, one more than a
 * hand-chained lazy generator would (which checks its own limit *before*
 * asking upstream for the next value). Bounded to exactly one extra source
 * pull, never unbounded, so an infinite source still terminates. The
 * *value* produced is identical either way; only a source with an
 * observable side effect in its own generator body (not a user callback)
 * would notice.
 */
function emitIterSegment(
  seg: IterSegment,
  curData: string,
  nextData: string,
  code: string,
  preLines: string[],
  optionNoneLocal: string,
  inlineCallbacks: boolean,
  renderExpression: ExpressionRenderer,
  renderSource: SourceRangeRenderer,
  outerLabel: string,
  curDataIsArray: boolean,
): string[] {
  const startIndex = (seg.steps[0] ?? seg.terminal!).index
  const v = `_v${startIndex}`

  const stateLines: string[] = []
  const bodyLines: string[] = []
  const closeBraces: string[] = []
  const zeroGuards: string[] = []
  let chunkFlush: { readonly buffer: string; readonly continuationStart: number } | undefined

  // `iter.ts#takeIterator` stops asking its upstream for a new value the
  // instant its count is already satisfied, so an upstream step positioned
  // before `take` in this same segment must not run for the source element
  // that only *discovers* the count was already met. A plain per-step
  // template can't express that (it only controls what happens at its own
  // position, after everything upstream already ran this iteration), so
  // this hoists an "already exhausted" check for every `take` in the
  // segment to the very front of the loop body, before any step's own
  // lines. `iterTakeTemplate`'s own body then only ever increments -- this
  // guard has already proved `count < n` by the time it's reached.
  const takeExhaustionGuards: string[] = []
  for (const { index, step } of seg.steps) {
    if (step.name === 'iterTake') {
      takeExhaustionGuards.push(`_itc${index} >= _itn${index}`)
    }
  }
  if (takeExhaustionGuards.length > 0) {
    bodyLines.push(`if (${takeExhaustionGuards.join(' || ')}) { break ${outerLabel}; }`)
  }

  seg.steps.forEach(({ index, step }) => {
    const ctx = iterElementCtx(
      step,
      index,
      v,
      false,
      nextData,
      code,
      stateLines,
      bodyLines,
      inlineCallbacks,
      renderExpression,
      renderSource,
      outerLabel,
      optionNoneLocal,
    )
    const fragment = requireIterEmit(step.name).render(ctx)
    splice(fragment, preLines, stateLines, bodyLines, closeBraces)
    if (step.name === 'iterTake') zeroGuards.push(iterTakeZeroGuardVar(index))
    if (step.name === 'iterChunk') {
      chunkFlush = { buffer: `_ickb${index}`, continuationStart: bodyLines.length }
    }
  })

  const terminal = seg.terminal
  if (terminal) {
    const ctx = iterElementCtx(
      terminal.step,
      terminal.index,
      v,
      true,
      nextData,
      code,
      stateLines,
      bodyLines,
      inlineCallbacks,
      renderExpression,
      renderSource,
      outerLabel,
      optionNoneLocal,
    )
    const fragment = requireIterEmit(terminal.step.name).render(ctx)
    splice(fragment, preLines, stateLines, bodyLines, closeBraces)
  } else {
    bodyLines.push(`yield ${v};`)
  }

  const loopOpen = curDataIsArray
    ? [
        `${outerLabel}: for (var _vi${startIndex} = 0, _vlen${startIndex} = ${curData}.length; _vi${startIndex} < _vlen${startIndex}; _vi${startIndex}++) {`,
        `var ${v} = ${curData}[_vi${startIndex}];`,
      ]
    : [`${outerLabel}: for (var ${v} of ${curData}) {`]

  // `stateLines` (counters, the scan accumulator, the chunk buffer, ...)
  // stay unguarded even when a `take` step's count is statically/dynamically
  // zero: they are cheap internal declarations with no observable effect of
  // their own, and the chunk flush below reads the buffer variable
  // unconditionally, so it must exist either way.
  const loopBody = [...loopOpen, bodyLines.join('\n'), ...closeBraces, '}']
  const guardedLoopBody =
    zeroGuards.length === 0
      ? loopBody
      : [`if (${zeroGuards.map((g) => `${g} !== 0`).join(' && ')}) {`, ...loopBody, '}']
  const guardedLoop = [stateLines.join('\n'), ...guardedLoopBody]

  const flushLines: string[] = []
  if (chunkFlush) {
    const { buffer, continuationStart } = chunkFlush
    const continuation = bodyLines.slice(continuationStart)
    flushLines.push(
      `if (${buffer}.length > 0) {`,
      `${v} = ${buffer};`,
      `${outerLabel}: do {`,
      continuation.join('\n'),
      '} while (false);',
      '}',
    )
  }

  if (terminal) return [...guardedLoop, ...flushLines]

  return [
    `var ${nextData} = {`,
    '[Symbol.iterator]: function () {',
    'return (function* () {',
    ...guardedLoop,
    ...flushLines,
    '})();',
    '},',
    '};',
  ]
}

// Boundary operator expressions are hoisted with the other pipe arguments.
// Calling the real operator preserves its stable sorting kernel, callback
// trace, and property-access/evaluation semantics instead of reimplementing
// an accidentally different Array.prototype operation in generated code.
/** `Obj.pick`/`Obj.omit`'s dangerous own keys: `object.ts#define` throws a
 * `TypeError` writing any of these, matching what real property assignment
 * cannot reproduce (a `__proto__` *data* property is legal, but only
 * `Object.defineProperty` can create one on a non-null-prototype target). */
const UNSAFE_OBJECT_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

/** A statically known array of string/numeric key literals, or `undefined`
 * for anything else (identifier, computed access, spread, symbol, ...) --
 * the compiler falls back to the generic capture-and-call boundary for those
 * (diagnostic reason `dynamic-keys`), never a hard failure: the real
 * `pick`/`omit` export already handles a dynamic key list correctly. */
function staticKeyLiteralsOf(node: t.Expression | undefined): readonly string[] | undefined {
  if (node === undefined || !t.isArrayExpression(node)) return undefined
  const keys: string[] = []
  for (const element of node.elements) {
    if (t.isStringLiteral(element)) {
      keys.push(element.value)
    } else if (t.isNumericLiteral(element)) {
      keys.push(String(element.value))
    } else {
      return undefined
    }
  }
  return keys
}

/**
 * `pick`'s unrolled fast path: `object.ts#pick` iterates the *requested*
 * keys (never the source's own key set), so every accessed key is already
 * statically known and the whole call becomes a guarded per-key read with
 * no `Set`/loop over the source at all. Skipped (falls back to the generic
 * boundary call) when a requested key is one `define()` would throw on --
 * simplest correct choice, since whether the throw actually fires depends on
 * the source object's own shape at run time, not on the static key list.
 */
function emitStaticPick(
  keys: readonly string[],
  curData: string,
  nextData: string,
): string[] | undefined {
  if (keys.some((key) => UNSAFE_OBJECT_KEYS.has(key))) return undefined
  const lines = [`var ${nextData} = Object.create(null);`]
  for (const key of keys) {
    const literal = JSON.stringify(key)
    lines.push(
      `if (Object.prototype.hasOwnProperty.call(${curData}, ${literal}) && Object.prototype.propertyIsEnumerable.call(${curData}, ${literal})) { ${nextData}[${literal}] = ${curData}[${literal}]; }`,
    )
  }
  return lines
}

/**
 * `omit`'s unrolled fast path: still a loop (the copied key set is whatever
 * the source has left over, only known at run time), but the excluded-key
 * `Set` + `normalizeKey` becomes inline `===` comparisons against the
 * static literals. The dangerous-key throw is still live here (unlike
 * `pick`, `omit` copies whatever the source's own enumerable keys are, so an
 * unexcluded `__proto__`/`constructor`/`prototype` can reach the write even
 * though the *static* omitted list never mentions it) and must match
 * `object.ts#define` exactly, including the throw.
 */
function emitStaticOmit(
  keys: readonly string[],
  curData: string,
  nextData: string,
  index: number,
): string[] {
  const ownKeys = `_omitKeys${index}`
  const scanIndex = `_omitI${index}`
  const scanKey = `_omitKey${index}`
  const exclusion =
    keys.length === 0
      ? []
      : [`if (${keys.map((key) => `${scanKey} === ${JSON.stringify(key)}`).join(' || ')}) { continue; }`]
  return [
    `var ${ownKeys} = Reflect.ownKeys(${curData});`,
    `var ${nextData} = Object.create(null);`,
    `for (var ${scanIndex} = 0; ${scanIndex} < ${ownKeys}.length; ${scanIndex}++) {`,
    `var ${scanKey} = ${ownKeys}[${scanIndex}];`,
    `if (!Object.prototype.propertyIsEnumerable.call(${curData}, ${scanKey})) { continue; }`,
    ...exclusion,
    `if (${scanKey} === '__proto__' || ${scanKey} === 'constructor' || ${scanKey} === 'prototype') { throw new TypeError('Unsafe object key: ' + String(${scanKey})); }`,
    `${nextData}[${scanKey}] = ${curData}[${scanKey}];`,
    '}',
  ]
}

function emitBoundarySegment(
  seg: BoundarySegment,
  curData: string,
  nextData: string,
  code: string,
  preLines: string[],
  renderExpression: ExpressionRenderer,
  sourceTier: StaticCompilerPlanV1['sourceTier'],
  optionNoneLocal: string,
): string[] {
  const { step } = seg.step
  if (step.name === 'objectPick' || step.name === 'objectOmit') {
    const keys = staticKeyLiteralsOf(step.args[0])
    if (keys !== undefined) {
      const unrolled =
        step.name === 'objectPick'
          ? emitStaticPick(keys, curData, nextData)
          : emitStaticOmit(keys, curData, nextData, seg.step.index)
      if (unrolled !== undefined) return unrolled
    }
    // Falls through to the generic capture-and-call boundary below: a
    // dynamic key list (or a static-but-dangerous pick list) still compiles
    // correctly through the real `pick`/`omit` export, just without the
    // unrolled fast path.
  }
  const sourceTierUsesRuntimePlan = sourceTier === 'compact'
  // These bare terminals are validated imports with no construction-time
  // bindings. Lowering them to their defining property checks avoids a
  // function call on the tiny arrays where call overhead dominates.
  if (step.name === 'length') {
    return [`var ${nextData} = ${curData}.length;`]
  }
  if (step.name === 'isEmpty') {
    return [`var ${nextData} = ${curData}.length === 0;`]
  }
  /*
   * Compact's frozen reference interpreter implements reverse as
   * slice().reverse(). The public leaf prefers toReversed() when available,
   * whose indexed source-read order is observably different for proxies.
   * Keep root sequential and compiler tiers on their own public boundary,
   * but reproduce the compact tier exactly here.
   */
  if (step.name === 'reverse' && sourceTier === 'compact') {
    return [`var ${nextData} = ${curData}.slice().reverse();`]
  }
  if (step.name === 'init' && sourceTierUsesRuntimePlan) {
    return [
      `var ${nextData} = ${curData}.length <= 1 ? [] : ${curData}.slice(0, -1);`,
    ]
  }
  if (step.name === 'flatten' && sourceTierUsesRuntimePlan) {
    return [`var ${nextData} = ${curData}.flat();`]
  }
  if (step.name === 'without' && sourceTierUsesRuntimePlan) {
    const excluded = `_withoutSet${seg.step.index}`
    const value = `_withoutValue${seg.step.index}`
    return [
      `var ${excluded} = new Set(${renderExpression(step.args[0])});`,
      `var ${nextData} = ${curData}.filter(function (${value}) { return !${excluded}.has(${value}); });`,
    ]
  }
  const sourceTierMaterializer =
    sourceTier === 'sequential' || sourceTier === 'compact'
  if (step.name === 'sum' && sourceTierMaterializer) {
    return [
      `var ${nextData} = 0;`,
      `for (var _i = 0; _i < ${curData}.length; _i++) {`,
      `${nextData} += ${curData}[_i];`,
      '}',
    ]
  }
  if ((step.name === 'min' || step.name === 'max') && sourceTierMaterializer) {
    const comparison = step.name === 'min' ? '<' : '>'
    return [
      `var ${nextData} = ${curData}.length === 0 ? ${optionNoneLocal} : { _tag: 1, value: ${curData}[0] };`,
      `for (var _i = 1; _i < ${curData}.length; _i++) {`,
      `if (${curData}[_i] ${comparison} ${nextData}.value) ${nextData}.value = ${curData}[_i];`,
      '}',
    ]
  }
  const operator = `_boundary${seg.step.index}`
  preLines.push(`var ${operator} = (${renderExpression(step.node)});`)
  return [`var ${nextData} = ${operator}(${curData});`]
}

// Phase 1.4: a scalar op (math/string/object/guard) is `compilerPipelineRole:
// 'boundary'` for segmenting purposes only -- its registered `inputDomain` is
// `'scalar'`, never `'array'`, so `segmentSteps`/`segmentsFromPlan` must never
// glom it into an adjacent array segment's per-element loop (that would run
// it once per element instead of once over the pipe's whole current value,
// diverging from both the sequential and compact reference executors). But
// unlike sort/reverse/uniq/keys/values, most of these ops have a named `expr`
// template rather than `{ kind: 'boundary' }`, so instead of the generic
// capture-and-call mechanism above, splice the template directly over the
// segment's current-value local: no loop scaffold, no captured function
// reference, just the same straight-line statement an element step would
// contribute to a loop body, here running once between two array segments
// (or standing alone, for an all-scalar pipe with no array step at all).
function emitInlineBoundaryStep(
  emit: ElementOpEmit,
  step: Step,
  index: number,
  curData: string,
  nextData: string,
  preLines: string[],
  renderExpression: ExpressionRenderer,
  outerLabel: string,
  optionNoneLocal: string,
): string[] {
  const a1Node = step.args[0]
  const a2Node = step.args[1]
  const ctx: ElementEmitCtx = {
    index,
    v: curData,
    next: nextData,
    a1: a1Node ? `(${renderExpression(a1Node)})` : '',
    a2: a2Node ? `(${renderExpression(a2Node)})` : '',
    indexed: false,
    position: '',
    outerLabel,
    sequential: false,
    optionNone: optionNoneLocal,
    cb: NO_CALLBACK_HANDLE,
  }
  const fragment = emit.render(ctx)
  preLines.push(...(fragment.pre ?? []))
  return [...fragment.body]
}

function emitPureMapLengthBoundary(stepIndex: number, curData: string, nextData: string): string[] {
  const length = `_pureLength${stepIndex}`
  return [
    `var ${length} = ${curData}.length;`,
    `for (var _i = 0; _i < ${length}; _i++) {`,
    `void ${curData}[_i];`,
    '}',
    `var ${nextData} = ${length};`,
  ]
}

/**
 * Builds the statements for a fused pipeline over a validated step list --
 * everything except how the result is consumed and where the source value
 * comes from. Every arg (source, callback, bound value) is evaluated
 * exactly once, in appearance order, before the loop(s) run. Inlinable
 * callbacks become bare expressions in the loop body; everything else is a
 * call through a temp holding the original function value.
 *
 * A pipeline is split into segments at each boundary op (sort/sortBy/
 * sortAsc/sortDesc/reverse/uniq): each segment is either a fused loop
 * (element ops, optionally ending in a terminal) or a single materializing
 * statement. Segments run in sequence, each reading the previous segment's
 * output variable and producing the next.
 *
 * Callers that can splice statements directly into an existing function
 * body (arrow expression-body, `return pipe(...)`) should do so instead of
 * going through the IIFE in `generateFusedLoop`: an extra call frame means
 * V8 has to separately tier up two functions instead of one, which under
 * time-boxed warmup (as opposed to a long-running server) can leave the
 * loop stuck on a lower tier and miss loop vectorization entirely.
 */
/**
 * Whether a segment's own `nextData` is provably a fresh, plain Array --
 * used only to decide the *next* segment's loop shape (phase 4's
 * array-source fold). A boundary op's real outcome is whatever its fact
 * declares; an element/iterable segment with no terminal defaults to a
 * plain array only for the array domain (`emitElementSegment`'s
 * `nextData.push`), never the iterable domain (a no-terminal iterable
 * segment's `nextData` is the lazy wrapper object, not an array).
 */
function segmentOutputIsArray(seg: Segment): boolean {
  if (seg.kind === 'boundary') return seg.step.step.fact.outputDomain === 'array'
  if (seg.kind === 'option' || seg.kind === 'dict') return false
  if (seg.terminal) return seg.terminal.step.fact.outputDomain === 'array'
  return seg.kind === 'element'
}

function generateSegmentedBodyInternal(
  code: string,
  steps: readonly Step[],
  segments: readonly Segment[],
  allowCrossSegmentFolding: boolean,
  preLines: string[],
  optionNoneLocal: string,
  renderExpression: ExpressionRenderer,
  renderSource: SourceRangeRenderer,
  arrayConstructorExpression: string | undefined,
  globalUndefinedIsUnbound: boolean,
  outerLabel: string,
  pureMapLengthTerminalIndexes: ReadonlySet<number> = new Set(),
  sourceTier: StaticCompilerPlanV1['sourceTier'] = 'compiler',
  sourceIsArrayLiteral = false,
): Omit<FusedBody, 'sourceFragments'> {
  const blockLines: string[] = []

  // Splicing many callback bodies into one nested loop creates a large,
  // heavily scoped function that crosses optimiser cliffs in JavaScriptCore
  // and some V8 tiers. Beyond this small bound, hoisted callbacks give the
  // host engine compact functions it can inline itself and are consistently
  // faster across the release corpus.
  const inlineCallbacks =
    steps.reduce((count, step) => count + (CALLBACK_OPS.has(step.name) ? 1 : 0), 0) <=
    INLINE_CALLBACK_LIMIT
  let curData = '_src'
  let curDataIsArray = sourceIsArrayLiteral
  let counter = 0

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    const seg = segments[segmentIndex]

    const nextData = `_d${counter++}`
    if (seg.kind === 'boundary') {
      // A *segment* of kind `'boundary'` is not the same thing as an op whose
      // *own* `compilerPipelineRole` is `'boundary'`: `sum`/`min`/`max`/`head`/
      // `last`/`length`/`isEmpty` are `'terminal'`-role ops that `segmentSteps`/
      // `segmentsFromPlan` still box into a standalone boundary segment (a
      // direct full-array terminal, or -- for the sequential/compact source
      // tiers -- `hasSourceTierMaterializerTerminal`'s materializer-parity
      // case). Those already have bespoke real-loop handling in
      // `emitBoundarySegment` below; only splice the inline template for an
      // op that is genuinely boundary-classified itself (the phase 1.4
      // scalar stragglers), never merely because it landed in this segment.
      const inlineEmit =
        seg.step.step.fact.compilerPipelineRole === 'boundary'
          ? opEmitFor(seg.step.step.name)
          : undefined
      if (pureMapLengthTerminalIndexes.has(seg.step.index)) {
        blockLines.push(...emitPureMapLengthBoundary(seg.step.index, curData, nextData))
      } else if (
        inlineEmit !== undefined &&
        inlineEmit.kind !== 'boundary' &&
        inlineEmit.kind !== 'optionStep' &&
        inlineEmit.kind !== 'dictStep' &&
        inlineEmit.kind !== 'iterStep'
      ) {
        blockLines.push(
          ...emitInlineBoundaryStep(
            inlineEmit,
            seg.step.step,
            seg.step.index,
            curData,
            nextData,
            preLines,
            renderExpression,
            outerLabel,
            optionNoneLocal,
          ),
        )
      } else {
        blockLines.push(
          ...emitBoundarySegment(
            seg,
            curData,
            nextData,
            code,
            preLines,
            renderExpression,
            sourceTier,
            optionNoneLocal,
          ),
        )
      }
    } else if (seg.kind === 'option') {
      blockLines.push(
        ...emitOptionSegment(
          seg,
          curData,
          nextData,
          code,
          preLines,
          optionNoneLocal,
          inlineCallbacks,
          renderExpression,
          renderSource,
        ),
      )
    } else if (seg.kind === 'dict') {
      blockLines.push(
        ...emitDictSegment(
          seg,
          curData,
          nextData,
          code,
          preLines,
          inlineCallbacks,
          renderExpression,
          renderSource,
        ),
      )
    } else if (seg.kind === 'iterable') {
      blockLines.push(
        ...emitIterSegment(
          seg,
          curData,
          nextData,
          code,
          preLines,
          optionNoneLocal,
          inlineCallbacks,
          renderExpression,
          renderSource,
          outerLabel,
          curDataIsArray,
        ),
      )
    } else if (
      seg.steps.length === 0 &&
      seg.terminal !== undefined &&
      pureMapLengthTerminalIndexes.has(seg.terminal.index)
    ) {
      blockLines.push(...emitPureMapLengthBoundary(seg.terminal.index, curData, nextData))
    } else {
      blockLines.push(
        ...emitElementSegment(
          seg,
          curData,
          nextData,
          code,
          preLines,
          optionNoneLocal,
          inlineCallbacks,
          renderExpression,
          renderSource,
          arrayConstructorExpression,
          globalUndefinedIsUnbound,
          outerLabel,
          !allowCrossSegmentFolding,
        ),
      )
    }
    curData = nextData
    curDataIsArray = segmentOutputIsArray(seg)
  }

  const prelude = preLines.join('\n')
  const execution = blockLines.join('\n')
  const stmts = [prelude, execution].join('\n')
  return {
    stmts,
    resultVar: curData,
    prelude,
    execution,
    segmentKinds: segments.map((segment) =>
      segment.kind === 'boundary' ||
      segment.kind === 'option' ||
      segment.kind === 'dict' ||
      segment.kind === 'iterable'
        ? segment.kind
        : 'stream',
    ),
  }
}

export function generateFusedBody(
  code: string,
  sourceText: string,
  steps: readonly Step[],
  optionNoneLocal = DEFAULT_OPTION_NONE_LOCAL,
  renderExpression?: ExpressionRenderer,
  arrayConstructorExpression?: string,
  globalUndefinedIsUnbound = false,
  outerLabel = '_outer',
): FusedBody {
  const tracker = new SourceFragmentTracker(code)
  const renderSource: SourceRangeRenderer = (start, end) => tracker.source(start, end)
  const renderedExpression: ExpressionRenderer = renderExpression ?? ((node) => tracker.node(node))
  const body = generateSegmentedBodyInternal(
    code,
    steps,
    segmentSteps(steps),
    true,
    [`var _src = (${sourceText});`],
    optionNoneLocal,
    renderedExpression,
    renderSource,
    arrayConstructorExpression,
    globalUndefinedIsUnbound,
    outerLabel,
  )
  const mappedStatements = tracker.finish(body.stmts)
  const mappedPrelude = tracker.finish(body.prelude)
  const mappedExecution = tracker.finish(body.execution)
  return {
    ...body,
    stmts: mappedStatements.code,
    prelude: mappedPrelude.code,
    execution: mappedExecution.code,
    sourceFragments: mappedStatements.sourceFragments,
  }
}

const captureLocal = (capture: PlanCapture, sourceCaptureId: number | undefined): string =>
  capture.id === sourceCaptureId ? '_src' : capture.local

const valueRefText = (
  ref: PlanValueRef,
  captures: ReadonlyMap<number, PlanCapture>,
  sourceCaptureId: number | undefined,
): string | undefined => {
  if (ref.kind === 'inline') return undefined
  const capture = captures.get(ref.captureId)
  if (capture === undefined) {
    throw new Error(`fp-compiler: static plan references missing capture ${ref.captureId}`)
  }
  return captureLocal(capture, sourceCaptureId)
}

const captureExpression = (
  capture: PlanCapture,
  plan: StaticCompilerPlanV1,
  captures: ReadonlyMap<number, PlanCapture>,
  sourceCaptureId: number | undefined,
  tracker: SourceFragmentTracker,
): string => {
  if (capture.kind !== 'whole-step' || capture.stepIndex === undefined) {
    return tracker.node(capture.node)
  }
  const step = plan.steps.find((candidate) => candidate.index === capture.stepIndex)
  if (step === undefined || step.kind !== 'operator' || !t.isCallExpression(step.node)) {
    return tracker.node(capture.node)
  }
  let rendered = ''
  let cursor = step.node.start!
  step.bindings.forEach((binding, index) => {
    const argument = step.args[index]
    rendered += tracker.source(cursor, argument.start!)
    if (binding.kind === 'inline') {
      rendered += tracker.source(binding.source.start, binding.source.end)
    } else {
      const bindingCapture = captures.get(binding.captureId)
      if (bindingCapture === undefined || bindingCapture.kind !== 'binding') {
        throw new Error('fp-compiler: whole-step plan references a missing binding capture')
      }
      const local = captureLocal(bindingCapture, sourceCaptureId)
      /*
       * Keep argument capture inside the official operator call. JavaScript
       * resolves a call's callee before evaluating its arguments; splitting
       * the argument into an earlier statement would observe a different live
       * module binding if that argument mutates it.
       */
      rendered += `(${local} = (${tracker.node(bindingCapture.node)}))`
    }
    cursor = argument.end!
  })
  rendered += tracker.source(cursor, step.node.end!)
  return rendered
}

const constructionLinesForPlan = (
  plan: StaticCompilerPlanV1,
  captures: ReadonlyMap<number, PlanCapture>,
  sourceCaptureId: number | undefined,
  tracker: SourceFragmentTracker,
): readonly string[] => {
  const assignedInsideWholeStep = new Set<number>()
  const retainedWholeSteps = new Set<number>()
  const capturedWholeStepIndexes = new Set(
    plan.captures.flatMap((capture) =>
      capture.kind === 'whole-step' && capture.stepIndex !== undefined ? [capture.stepIndex] : [],
    ),
  )
  const stepVectorRetained = plan.steps.some(
    (step) => step.kind === 'opaque' && step.receiver === 'step-vector',
  )
  for (const step of plan.steps) {
    if (step.kind !== 'operator') continue
    if (stepVectorRetained || step.fact.compilerPipelineRole === 'boundary') {
      retainedWholeSteps.add(step.index)
    }
    for (const binding of step.bindings) {
      if (binding.kind === 'capture' && capturedWholeStepIndexes.has(step.index)) {
        assignedInsideWholeStep.add(binding.captureId)
      }
    }
  }

  return [...plan.captures]
    .sort((left, right) => left.evaluationOrder - right.evaluationOrder)
    .map((capture) => {
      const local = captureLocal(capture, sourceCaptureId)
      if (capture.kind === 'binding' && assignedInsideWholeStep.has(capture.id)) {
        return `var ${local};`
      }
      if (
        capture.kind === 'whole-step' &&
        capture.stepIndex !== undefined &&
        !retainedWholeSteps.has(capture.stepIndex)
      ) {
        return `${captureExpression(capture, plan, captures, sourceCaptureId, tracker)};`
      }
      return `var ${local} = (${captureExpression(
        capture,
        plan,
        captures,
        sourceCaptureId,
        tracker,
      )});`
    })
}

/**
 * Authoritative immediate-pipe lowering. The Plan IR owns capture order,
 * semantic segments, facade tier, opaque receiver ABI, and lowering identity;
 * emitters consume it rather than independently rediscovering those facts.
 */
export function generateStaticPlanBody(
  code: string,
  plan: StaticCompilerPlanV1,
  optionNoneLocal = DEFAULT_OPTION_NONE_LOCAL,
  arrayConstructorExpression?: string,
  globalUndefinedIsUnbound = false,
  outerLabel = '_outer',
): FusedBody {
  if (plan.siteKind !== 'pipe' || plan.result !== 'value' || plan.source === undefined) {
    throw new Error('fp-compiler: immediate body requested for a deferred static plan')
  }
  const tracker = new SourceFragmentTracker(code)
  const renderSource: SourceRangeRenderer = (start, end) => tracker.source(start, end)
  const captures = new Map(plan.captures.map((capture) => [capture.id, capture]))
  const sourceCaptureId = plan.source.kind === 'capture' ? plan.source.captureId : undefined

  const renderByNode = new Map<t.Expression, string>()
  for (const step of plan.steps) {
    if (step.kind === 'operator') {
      step.bindings.forEach((binding, index) => {
        const rendered = valueRefText(binding, captures, sourceCaptureId)
        if (rendered !== undefined) renderByNode.set(step.args[index], rendered)
      })
      const whole = plan.captures.find(
        (capture) => capture.kind === 'whole-step' && capture.stepIndex === step.index,
      )
      if (whole !== undefined) {
        renderByNode.set(step.node, captureLocal(whole, sourceCaptureId))
      }
    }
  }
  const renderExpression: ExpressionRenderer = (node) =>
    renderByNode.get(node) ?? tracker.node(node)

  const preLines: string[] = []
  if (plan.source.kind === 'inline') {
    preLines.push(
      `var _src = (${tracker.source(plan.source.source.start, plan.source.source.end)});`,
    )
  }
  preLines.push(...constructionLinesForPlan(plan, captures, sourceCaptureId, tracker))

  const opaque = plan.steps.find((step) => step.kind === 'opaque')
  let stepVector: string | undefined
  if (opaque?.receiver === 'step-vector') {
    const stepLocals = plan.steps.map((step) => {
      const capture = plan.captures.find(
        (candidate) =>
          candidate.stepIndex === step.index &&
          (candidate.kind === 'whole-step' || candidate.kind === 'opaque'),
      )
      if (capture === undefined) {
        throw new Error('fp-compiler: step-vector plan did not retain every step value')
      }
      return captureLocal(capture, sourceCaptureId)
    })
    stepVector = '_stepVector'
    // The runtime's rest-array is created after every call argument evaluates
    // and before any step runs. Keep that boundary ahead of emitter state.
    preLines.push(`var ${stepVector} = [${stepLocals.join(', ')}];`)
  }

  const operatorSteps = operatorStepsOf(plan)
  const pureMapLengthTerminalIndexes = new Set(
    plan.pureRewrites
      .filter((rewrite) => rewrite.kind === 'elide-unused-map')
      .map((rewrite) => rewrite.terminalIndex),
  )
  // Phase 4's array-source fold: a literal array argument (`pipe([1, 2, 3],
  // I.map(f), ...)`) is provably a fresh Array, so an iterable segment can
  // open an indexed loop over it instead of the generic `for...of`. Only
  // the `'capture'` source form carries the original AST node; the
  // `'inline'` form (an already-evaluated function parameter) is a runtime
  // value with no statically known shape, so it conservatively stays
  // `false`.
  const sourceIsArrayLiteral =
    plan.source.kind === 'capture' &&
    t.isArrayExpression(captures.get(plan.source.captureId)?.node)
  const knownBody = generateSegmentedBodyInternal(
    code,
    operatorSteps,
    segmentsFromPlan(plan),
    plan.executionLayout === 'fused-streams',
    preLines,
    optionNoneLocal,
    renderExpression,
    renderSource,
    arrayConstructorExpression,
    globalUndefinedIsUnbound,
    outerLabel,
    pureMapLengthTerminalIndexes,
    plan.sourceTier,
    sourceIsArrayLiteral,
  )

  let taggedStatements = knownBody.stmts
  let taggedExecution = knownBody.execution
  let resultVar = knownBody.resultVar
  if (opaque !== undefined) {
    const opaqueLocal = valueRefText(opaque.fn, captures, sourceCaptureId)
    if (opaqueLocal === undefined) {
      throw new Error('fp-compiler: opaque function is not captured')
    }
    const opaqueResult = `_d${plan.segments.length}`
    let invocation: string
    if (opaque.receiver === 'step-vector') {
      if (stepVector === undefined) {
        throw new Error('fp-compiler: step-vector receiver was not constructed')
      }
      invocation = `var ${opaqueResult} = ${stepVector}[${opaque.index}](${knownBody.resultVar});`
      taggedStatements = `${knownBody.stmts}\n${invocation}`
      taggedExecution = `${knownBody.execution}\n${invocation}`
    } else {
      invocation = `var ${opaqueResult} = ${opaqueLocal}(${knownBody.resultVar});`
      taggedStatements = `${knownBody.stmts}\n${invocation}`
      taggedExecution = `${knownBody.execution}\n${invocation}`
    }
    resultVar = opaqueResult
  }

  const mappedStatements = tracker.finish(taggedStatements)
  const mappedPrelude = tracker.finish(
    taggedStatements.slice(0, taggedStatements.length - taggedExecution.length - 1),
  )
  const mappedExecution = tracker.finish(taggedExecution)
  return {
    stmts: mappedStatements.code,
    resultVar,
    prelude: mappedPrelude.code,
    execution: mappedExecution.code,
    segmentKinds: plan.segmentKinds,
    sourceFragments: mappedStatements.sourceFragments,
  }
}

/**
 * Emits single-terminal pipelines directly in a caller's tail position.
 * Early-returning predicates and scalar property terminals otherwise pay for
 * a result temp, a labeled break, and a second return -- material overhead on
 * the tiny terminal corpus. Undefined means the general fused body is needed.
 */
export function generateFusedTailBody(
  code: string,
  sourceText: string,
  steps: readonly Step[],
  optionNoneLocal = DEFAULT_OPTION_NONE_LOCAL,
  renderExpression: ExpressionRenderer = (node) => code.slice(node.start!, node.end!),
  renderSource: SourceRangeRenderer = (start, end) => code.slice(start, end),
  arrayConstructorExpression?: string,
  directSourceIdentifier = false,
  mappedSourceText = sourceText,
): string | undefined {
  if (steps.length !== 1) return undefined
  const step = steps[0]
  const sourceIsIdentifier = /^[A-Za-z_$][\w$]*$/u.test(sourceText)
  const loopSource = directSourceIdentifier && sourceIsIdentifier ? mappedSourceText : '_src'
  const sourcePrelude =
    directSourceIdentifier && sourceIsIdentifier ? [] : [`const _src = (${mappedSourceText});`]
  const sourceAccess = sourceIsIdentifier ? mappedSourceText : `(${mappedSourceText})`
  if (step.name === 'length') {
    return `return ${sourceAccess}.length;`
  }
  if (step.name === 'isEmpty') {
    return `return ${sourceAccess}.length === 0;`
  }
  if (step.name === 'reduce') {
    // The operator constructor observes callback before seed. Capture a
    // non-inline callback in that order, then keep the accumulator as the
    // only loop-carried state for a single tail-position reduction.
    const preLines = [...sourcePrelude]
    const callbackLines = emitCallback(
      step.args[0],
      code,
      '_reduceCb0',
      preLines,
      ['_reduceAcc0', `${loopSource}[_i]`],
      true,
      renderExpression,
      renderSource,
      (expr) => [`_reduceAcc0 = ${expr};`],
    )
    preLines.push(`let _reduceAcc0 = (${renderExpression(step.args[1])});`)
    return [
      ...preLines,
      `for (let _i = 0, _len0 = ${loopSource}.length; _i < _len0; _i++) {`,
      ...callbackLines,
      '}',
      'return _reduceAcc0;',
    ].join('\n')
  }
  if (step.name === 'sum') {
    return [
      ...sourcePrelude,
      'let _sum0 = 0;',
      `for (let _i = 0, _len0 = ${loopSource}.length; _i < _len0; _i++) {`,
      `_sum0 += ${loopSource}[_i];`,
      '}',
      'return _sum0;',
    ].join('\n')
  }
  if (step.name === 'scan') {
    // Preserve pipe's left-to-right evaluation order: source first, then the
    // callback expression, then the seed. A simple expression arrow has no
    // construction-time effects and can be substituted directly; every
    // other callback is captured before evaluating the seed.
    const preLines = [...sourcePrelude]
    const callbackLines = emitCallback(
      step.args[0],
      code,
      '_scanCb0',
      preLines,
      ['_scanAcc0', `${loopSource}[_i]`],
      true,
      renderExpression,
      renderSource,
      (expr) => [`_scanAcc0 = ${expr};`],
    )
    preLines.push(`let _scanAcc0 = (${renderExpression(step.args[1])});`)
    preLines.push(`const _len0 = ${loopSource}.length;`)
    const allocation =
      arrayConstructorExpression === undefined
        ? ['const _scanOut0 = [];', '_scanOut0.length = _len0 + 1;']
        : [`const _scanOut0 = new ${arrayConstructorExpression}(_len0 + 1);`]
    return [
      ...preLines,
      ...allocation,
      '_scanOut0[0] = _scanAcc0;',
      'for (let _i = 0; _i < _len0; _i++) {',
      ...callbackLines,
      '_scanOut0[_i + 1] = _scanAcc0;',
      '}',
      'return _scanOut0;',
    ].join('\n')
  }
  if (step.name === 'takeUntil') {
    const preLines = [...sourcePrelude]
    const callbackLines = emitCallback(
      step.args[0],
      code,
      '_takeUntilCb0',
      preLines,
      ['_v0'],
      true,
      renderExpression,
      renderSource,
      (expr) => [`if (${expr}) break;`],
    )
    return [
      ...preLines,
      'const _takeUntilOut0 = [];',
      `for (let _i = 0, _len0 = ${loopSource}.length; _i < _len0; _i++) {`,
      `const _v0 = ${loopSource}[_i];`,
      ...callbackLines,
      '_takeUntilOut0.push(_v0);',
      '}',
      'return _takeUntilOut0;',
    ].join('\n')
  }
  if (
    step.name !== 'some' &&
    step.name !== 'none' &&
    step.name !== 'every' &&
    step.name !== 'findIndex'
  ) {
    return undefined
  }

  const preLines = [...sourcePrelude]
  const renderMatch = (expression: string): string[] => {
    if (step.name === 'some') {
      return [`if (${expression}) return true;`]
    }
    if (step.name === 'none') {
      return [`if (${expression}) return false;`]
    }
    if (step.name === 'findIndex') {
      return [`if (${expression}) return { _tag: 1, value: _i };`]
    }
    return [`if (!${expression}) return false;`]
  }
  const direct = renderMappedInline(
    renderDirectInlineMapped(step.args[0], code, [`${loopSource}[_i]`]),
    renderSource,
  )
  const matchLines =
    direct === undefined
      ? emitCallback(
          step.args[0],
          code,
          '_cbT0',
          preLines,
          ['_v0'],
          true,
          renderExpression,
          renderSource,
          renderMatch,
        )
      : renderMatch(`(${direct})`)
  const defaultResult =
    step.name === 'findIndex' ? optionNoneLocal : step.name === 'some' ? 'false' : 'true'
  return [
    ...preLines,
    `for (let _i = 0, _len0 = ${loopSource}.length; _i < _len0; _i++) {`,
    ...(direct === undefined ? [`const _v0 = ${loopSource}[_i];`] : []),
    ...matchLines,
    '}',
    `return ${defaultResult};`,
  ].join('\n')
}

export function generateStaticPlanTailBody(
  code: string,
  plan: StaticCompilerPlanV1,
  optionNoneLocal = DEFAULT_OPTION_NONE_LOCAL,
  arrayConstructorExpression?: string,
): MappedCode | undefined {
  if (
    plan.siteKind !== 'pipe' ||
    plan.source === undefined ||
    plan.steps.some((step) => step.kind === 'opaque')
  ) {
    return undefined
  }
  const tracker = new SourceFragmentTracker(code)
  const renderSource: SourceRangeRenderer = (start, end) => tracker.source(start, end)
  const captures = new Map(plan.captures.map((capture) => [capture.id, capture]))
  const sourceCaptureId = plan.source.kind === 'capture' ? plan.source.captureId : undefined
  const renderByNode = new Map<t.Expression, string>()
  for (const step of plan.steps) {
    if (step.kind !== 'operator') continue
    step.bindings.forEach((binding, index) => {
      const rendered = valueRefText(binding, captures, sourceCaptureId)
      if (rendered !== undefined) renderByNode.set(step.args[index], rendered)
    })
    const whole = plan.captures.find(
      (capture) => capture.kind === 'whole-step' && capture.stepIndex === step.index,
    )
    if (whole !== undefined) renderByNode.set(step.node, captureLocal(whole, sourceCaptureId))
  }
  const renderExpression: ExpressionRenderer = (node) =>
    renderByNode.get(node) ?? tracker.node(node)
  const captureLines = constructionLinesForPlan(plan, captures, sourceCaptureId, tracker)
  const tail = generateFusedTailBody(
    code,
    plan.source.kind === 'inline'
      ? code.slice(plan.source.source.start, plan.source.source.end)
      : '_src',
    operatorStepsOf(plan),
    optionNoneLocal,
    renderExpression,
    renderSource,
    arrayConstructorExpression,
    true,
    plan.source.kind === 'inline'
      ? tracker.source(plan.source.source.start, plan.source.source.end)
      : '_src',
  )
  if (tail === undefined) return undefined
  return tracker.finish([...captureLines, tail].join('\n'))
}

/**
 * Generates a reusable runner from the same ordered Plan IR used by pipe.
 * Construction-time binding expressions live outside the runner; generated
 * loop state lives inside it. The lexical arrow IIFE preserves enclosing
 * this/arguments/super/new.target while the transform rejects outer
 * await/yield before selecting this host.
 */
export function generateStaticPlanRunner(
  code: string,
  plan: StaticCompilerPlanV1,
  optionNoneLocal = DEFAULT_OPTION_NONE_LOCAL,
  arrayConstructorExpression?: string,
  globalUndefinedIsUnbound = false,
  outerLabel = '_outer',
): MappedCode {
  if (plan.siteKind === 'pipe' || plan.result !== 'runner' || plan.source !== undefined) {
    throw new Error('fp-compiler: deferred runner requested for an immediate static plan')
  }
  if (plan.steps.some((step) => step.kind === 'opaque')) {
    throw new Error('fp-compiler: deferred opaque runners are not selected in this wave')
  }
  const tracker = new SourceFragmentTracker(code)
  const renderSource: SourceRangeRenderer = (start, end) => tracker.source(start, end)
  const captures = new Map(plan.captures.map((capture) => [capture.id, capture]))
  const renderByNode = new Map<t.Expression, string>()
  for (const step of plan.steps) {
    if (step.kind !== 'operator') continue
    step.bindings.forEach((binding, index) => {
      const rendered = valueRefText(binding, captures, undefined)
      if (rendered !== undefined) renderByNode.set(step.args[index], rendered)
    })
    const whole = plan.captures.find(
      (capture) => capture.kind === 'whole-step' && capture.stepIndex === step.index,
    )
    if (whole !== undefined) renderByNode.set(step.node, whole.local)
  }
  const renderExpression: ExpressionRenderer = (node) =>
    renderByNode.get(node) ?? tracker.node(node)
  const constructionLines = constructionLinesForPlan(plan, captures, undefined, tracker)
  const pureMapLengthTerminalIndexes = new Set(
    plan.pureRewrites
      .filter((rewrite) => rewrite.kind === 'elide-unused-map')
      .map((rewrite) => rewrite.terminalIndex),
  )
  const body = generateSegmentedBodyInternal(
    code,
    operatorStepsOf(plan),
    segmentsFromPlan(plan),
    plan.executionLayout === 'fused-streams',
    ['var _src = (_in);'],
    optionNoneLocal,
    renderExpression,
    renderSource,
    arrayConstructorExpression,
    globalUndefinedIsUnbound,
    outerLabel,
    pureMapLengthTerminalIndexes,
    plan.sourceTier,
  )
  const tagged = [
    '(() => {',
    constructionLines.join('\n'),
    'return (_in) => {',
    body.stmts,
    `return ${body.resultVar};`,
    '};',
    '})()',
  ].join('\n')
  return tracker.finish(tagged)
}

/**
 * Expression-position fallback: wraps `generateFusedBody`'s statements in
 * an IIFE so the result can be spliced in wherever an expression is
 * required. Prefer emitting the body directly into an existing function
 * (see `generateFusedBody` doc) when the call site allows it.
 */
export function generateFusedLoop(
  code: string,
  sourceText: string,
  steps: readonly Step[],
  optionNoneLocal = DEFAULT_OPTION_NONE_LOCAL,
  arrayConstructorExpression?: string,
  globalUndefinedIsUnbound = false,
  outerLabel = '_outer',
): MappedCode {
  const body = generateFusedBody(
    code,
    sourceText,
    steps,
    optionNoneLocal,
    undefined,
    arrayConstructorExpression,
    globalUndefinedIsUnbound,
    outerLabel,
  )
  // An arrow wrapper preserves the enclosing lexical `this`, `arguments`,
  // `super`, and `new.target`. An ordinary-function IIFE silently changed all
  // four when a pipeline appeared inside a larger expression.
  return concatMappedCode([
    '(() => {\n',
    { code: body.stmts, sourceFragments: body.sourceFragments },
    `\nreturn ${body.resultVar};\n})()`,
  ])
}
