import * as t from '@babel/types'
import { BOUNDARY_OPS, TERMINAL_OPS, bindingSlots } from './ops'
import { planInline, renderDirectInline, renderDirectInlineExpression } from './inline'

export interface Step {
  readonly name: string
  readonly node: t.Expression
  readonly args: readonly t.Expression[]
}

type ExpressionRenderer = (node: t.Expression) => string

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
  use: (expr: string) => string[],
): string[] {
  const direct = inlineCallbacks ? renderDirectInline(argNode, code, inputVars) : undefined
  if (direct !== undefined) return use(`(${direct})`)

  const plan = inlineCallbacks ? planInline(argNode) : undefined
  if (plan) {
    const decls = plan.params.map((p, i) => `const ${p} = ${inputVars[i]};`)
    const bodyText = code.slice(plan.bodyStart, plan.bodyEnd)
    return ['{', ...decls, ...use(`(${bodyText})`), '}']
  }
  preLines.push(`var ${tempName} = (${renderExpression(argNode)});`)
  return use(`${tempName}(${inputVars.join(', ')})`)
}

export interface FusedBody {
  readonly stmts: string
  readonly resultVar: string
}

export const DEFAULT_OPTION_NONE_LOCAL = '__stopcock_fp_none'

const INLINE_CALLBACK_LIMIT = 3
const CALLBACK_OPS = new Set([
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

type Segment = ElementSegment | BoundarySegment

interface LiteralFlatMapPlan {
  readonly callback: t.ArrowFunctionExpression
  readonly params: readonly string[]
  readonly elements: readonly t.Expression[]
}

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

/**
 * A materializing flatMap whose inline callback returns a fixed-width array
 * does not need to allocate that short-lived array for every source item.
 * Keep this deliberately narrow: downstream element steps need the generic
 * nested-loop shape so early termination still happens at the right point.
 */
function planLiteralFlatMap(
  seg: ElementSegment,
  inlineCallbacks: boolean,
): LiteralFlatMapPlan | undefined {
  if (!inlineCallbacks || seg.terminal || seg.steps.length !== 1) return undefined
  const [{ step }] = seg.steps
  if (step.name !== 'flatMap') return undefined
  const callback = step.args[0]
  const inline = planInline(callback)
  if (!inline || !t.isArrowFunctionExpression(callback) || !t.isArrayExpression(callback.body)) {
    return undefined
  }
  const elements: t.Expression[] = []
  for (const element of callback.body.elements) {
    // Spreads have observable iterator semantics. Holes are uncommon and
    // remain on the generic path rather than giving the specialization a
    // subtly different representation.
    if (element == null || t.isSpreadElement(element)) return undefined
    elements.push(element)
  }
  return { callback, params: inline.params, elements }
}

function planLiteralMapFlatten(
  element: ElementSegment,
  boundary: BoundarySegment,
  inlineCallbacks: boolean,
): LiteralFlatMapPlan | undefined {
  if (
    !inlineCallbacks ||
    element.terminal ||
    element.steps.length !== 1 ||
    element.steps[0].step.name !== 'map' ||
    boundary.step.step.name !== 'flatten'
  ) {
    return undefined
  }
  const callback = element.steps[0].step.args[0]
  const inline = planInline(callback)
  if (!inline || !t.isArrowFunctionExpression(callback) || !t.isArrayExpression(callback.body)) {
    return undefined
  }
  const elements: t.Expression[] = []
  for (const item of callback.body.elements) {
    if (item == null || t.isSpreadElement(item)) return undefined
    elements.push(item)
  }
  return { callback, params: inline.params, elements }
}

function emitLiteralArrayExpansion(
  plan: LiteralFlatMapPlan,
  index: number,
  curData: string,
  nextData: string,
  code: string,
  arrayConstructorExpression: string | undefined,
): string[] {
  const width = plan.elements.length
  const sourceLength = `_fmLen${index}`
  const directElements = plan.elements.map((element) =>
    renderDirectInlineExpression(plan.callback, element, code, ['_v0']),
  )
  const useDirectElements = directElements.every(
    (element): element is string => element !== undefined,
  )
  const parameterLines = plan.params.map(
    (param, paramIndex) => `const ${param} = ${paramIndex === 0 ? `${curData}[_i]` : 'undefined'};`,
  )
  const writeLines = plan.elements.map(
    (element, elementIndex) =>
      `${nextData}[_i * ${width} + ${elementIndex}] = (${
        useDirectElements ? directElements[elementIndex] : code.slice(element.start!, element.end!)
      });`,
  )
  const allocation =
    arrayConstructorExpression === undefined
      ? [`var ${nextData} = [];`, `${nextData}.length = ${sourceLength} * ${width};`]
      : [`var ${nextData} = new ${arrayConstructorExpression}(${sourceLength} * ${width});`]
  return [
    `var ${sourceLength} = ${curData}.length;`,
    ...allocation,
    `_outer: for (var _i = 0; _i < ${sourceLength}; _i++) {`,
    ...(useDirectElements ? [`var _v0 = ${curData}[_i];`] : ['{', ...parameterLines]),
    ...writeLines,
    ...(useDirectElements ? [] : ['}']),
    '}',
  ]
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
  arrayConstructorExpression: string | undefined,
  globalUndefinedIsUnbound: boolean,
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
      const test = renderDirectInlineExpression(conditional.callback, conditional.test, code, [
        '_v0',
      ])
      const value = renderDirectInlineExpression(conditional.callback, conditional.value, code, [
        '_v0',
      ])
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
      const count = `_n${index}`
      preLines.push(`var ${count} = (${renderExpression(args[0])});`)
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
      const count = `_n${index}`
      preLines.push(`var ${count} = (${renderExpression(args[0])});`)
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
      const callbackLines = emitCallback(
        args[0],
        code,
        `_cb${index}`,
        preLines,
        ['_v0'],
        inlineCallbacks,
        renderExpression,
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
    default:
      return undefined
  }
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
  arrayConstructorExpression: string | undefined,
  globalUndefinedIsUnbound: boolean,
): string[] {
  const literalFlatMap = planLiteralFlatMap(seg, inlineCallbacks)
  if (literalFlatMap) {
    const [{ index }] = seg.steps
    return emitLiteralArrayExpansion(
      literalFlatMap,
      index,
      curData,
      nextData,
      code,
      arrayConstructorExpression,
    )
  }

  const singleStepCollector = emitSingleStepCollector(
    seg,
    curData,
    nextData,
    code,
    preLines,
    inlineCallbacks,
    renderExpression,
    arrayConstructorExpression,
    globalUndefinedIsUnbound,
  )
  if (singleStepCollector) return singleStepCollector

  const stateLines: string[] = []
  const bodyLines: string[] = []
  const closeBraces: string[] = []

  bodyLines.push(`var _v0 = ${curData}[_i];`)
  let curVar = '_v0'

  seg.steps.forEach(({ index, step }) => {
    const nextVar = `_v${index + 1}`
    const args = step.args
    switch (step.name) {
      case 'map': {
        const lines = emitCallback(
          args[0],
          code,
          `_cb${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`var ${nextVar} = ${expr};`],
        )
        bodyLines.push(...lines)
        break
      }
      case 'filter': {
        const lines = emitCallback(
          args[0],
          code,
          `_cb${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`if (!${expr}) { continue; }`],
        )
        bodyLines.push(...lines)
        bodyLines.push(`var ${nextVar} = ${curVar};`)
        break
      }
      case 'reject': {
        const lines = emitCallback(
          args[0],
          code,
          `_cb${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`if (${expr}) { continue; }`],
        )
        bodyLines.push(...lines)
        bodyLines.push(`var ${nextVar} = ${curVar};`)
        break
      }
      case 'filterMap': {
        const lines = emitCallback(
          args[0],
          code,
          `_cb${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`var _m${index} = ${expr};`, `if (_m${index} == null) { continue; }`],
        )
        bodyLines.push(...lines)
        bodyLines.push(`var ${nextVar} = _m${index};`)
        break
      }
      case 'mapWhile': {
        const lines = emitCallback(
          args[0],
          code,
          `_cb${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`var _mw${index} = ${expr};`, `if (_mw${index} == null) { break _outer; }`],
        )
        bodyLines.push(...lines)
        bodyLines.push(`var ${nextVar} = _mw${index};`)
        break
      }
      case 'flatMap': {
        const lines = emitCallback(
          args[0],
          code,
          `_cb${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`var _fm${index} = ${expr};`],
        )
        bodyLines.push(...lines)
        // Nested loop over the inner array, spliced into the tail position of
        // the outer per-item body: everything downstream of this step (more
        // element ops, the sink) executes once per inner item, nested inside
        // this for. break _outer (labeled on the top-level loop, see
        // generateFusedBody) is what lets take/takeWhile/find/etc downstream
        // of a flatMap exit both loops at once; plain continue still only
        // needs to skip the innermost (inner) loop, which is correct here too.
        bodyLines.push(
          `for (var _j${index} = 0, _rlen${index} = _fm${index}.length; _j${index} < _rlen${index}; _j${index}++) {`,
        )
        bodyLines.push(`var ${nextVar} = _fm${index}[_j${index}];`)
        closeBraces.push('}')
        break
      }
      case 'take': {
        const nTemp = `_n${index}`
        preLines.push(`var ${nTemp} = (${renderExpression(args[0])});`)
        stateLines.push(`var _take${index} = 0;`)
        bodyLines.push(`if (_take${index} >= ${nTemp}) break _outer;`)
        bodyLines.push(`_take${index}++;`)
        bodyLines.push(`var ${nextVar} = ${curVar};`)
        break
      }
      case 'takeUntil': {
        const lines = emitCallback(
          args[0],
          code,
          `_cb${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`if (${expr}) { break _outer; }`],
        )
        bodyLines.push(...lines)
        bodyLines.push(`var ${nextVar} = ${curVar};`)
        break
      }
      case 'drop': {
        const nTemp = `_n${index}`
        preLines.push(`var ${nTemp} = (${renderExpression(args[0])});`)
        stateLines.push(`var _drop${index} = 0;`)
        bodyLines.push(`if (_drop${index} < ${nTemp}) { _drop${index}++; continue; }`)
        bodyLines.push(`var ${nextVar} = ${curVar};`)
        break
      }
      case 'takeWhile': {
        const lines = emitCallback(
          args[0],
          code,
          `_cb${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`if (!${expr}) break _outer;`],
        )
        bodyLines.push(...lines)
        bodyLines.push(`var ${nextVar} = ${curVar};`)
        break
      }
      case 'dropWhile': {
        stateLines.push(`var _dw${index} = true;`)
        const lines = emitCallback(
          args[0],
          code,
          `_cb${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`if (_dw${index}) { if (${expr}) { continue; } _dw${index} = false; }`],
        )
        bodyLines.push(...lines)
        bodyLines.push(`var ${nextVar} = ${curVar};`)
        break
      }
      default:
        throw new Error(`fp-compiler: unhandled element op ${step.name}`)
    }
    curVar = nextVar
  })

  const terminal = seg.terminal
  if (!terminal) {
    preLines.push(`var ${nextData} = [];`)
    bodyLines.push(`${nextData}.push(${curVar});`)
  } else {
    const { index, step } = terminal
    const args = step.args
    switch (step.name) {
      case 'sum':
        preLines.push(`var ${nextData} = 0;`)
        bodyLines.push(`${nextData} += ${curVar};`)
        break
      case 'count': {
        preLines.push(`var ${nextData} = 0;`)
        const lines = emitCallback(
          args[0],
          code,
          `_cbT${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`if (${expr}) { ${nextData}++; }`],
        )
        bodyLines.push(...lines)
        break
      }
      case 'reduce': {
        const [fnArg, initArg] = args
        preLines.push(`var ${nextData} = (${renderExpression(initArg)});`)
        const direct = inlineCallbacks
          ? renderDirectInline(fnArg, code, [nextData, curVar])
          : undefined
        if (direct !== undefined) {
          bodyLines.push(`${nextData} = (${direct});`)
          break
        }
        const plan = inlineCallbacks ? planInline(fnArg) : undefined
        if (plan) {
          const decls = plan.params.map((p, i) => `const ${p} = ${i === 0 ? nextData : curVar};`)
          const bodyText = code.slice(plan.bodyStart, plan.bodyEnd)
          bodyLines.push('{', ...decls, `${nextData} = (${bodyText});`, '}')
        } else {
          preLines.push(`var _cbT${index} = (${renderExpression(fnArg)});`)
          bodyLines.push(`${nextData} = _cbT${index}(${nextData}, ${curVar});`)
        }
        break
      }
      case 'forEach': {
        const lines = emitCallback(
          args[0],
          code,
          `_cbT${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`${expr};`],
        )
        bodyLines.push(...lines)
        preLines.push(`var ${nextData} = undefined;`)
        break
      }
      case 'find': {
        preLines.push(`var ${nextData} = ${optionNoneLocal};`)
        const lines = emitCallback(
          args[0],
          code,
          `_cbT${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`if (${expr}) { ${nextData} = { _tag: 1, value: ${curVar} }; break _outer; }`],
        )
        bodyLines.push(...lines)
        break
      }
      case 'findIndex': {
        preLines.push(`var ${nextData} = ${optionNoneLocal};`)
        stateLines.push(`var _pos${index} = 0;`)
        const lines = emitCallback(
          args[0],
          code,
          `_cbT${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [
            `if (${expr}) { ${nextData} = { _tag: 1, value: _pos${index} }; break _outer; }`,
            `_pos${index}++;`,
          ],
        )
        bodyLines.push(...lines)
        break
      }
      case 'findMap': {
        preLines.push(`var ${nextData} = ${optionNoneLocal};`)
        const conditional = planPresentConditional(args[0], globalUndefinedIsUnbound)
        if (conditional) {
          const test = renderDirectInlineExpression(conditional.callback, conditional.test, code, [
            curVar,
          ])
          const value = renderDirectInlineExpression(
            conditional.callback,
            conditional.value,
            code,
            [curVar],
          )
          if (test !== undefined && value !== undefined) {
            const passes = conditional.valueWhenTestPasses ? `(${test})` : `!(${test})`
            bodyLines.push(
              `if (${passes}) { ${nextData} = { _tag: 1, value: (${value}) }; break _outer; }`,
            )
            break
          }
        }
        const lines = emitCallback(
          args[0],
          code,
          `_cbT${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [
            `var _fmv${index} = ${expr};`,
            `if (_fmv${index} != null) { ${nextData} = { _tag: 1, value: _fmv${index} }; break _outer; }`,
          ],
        )
        bodyLines.push(...lines)
        break
      }
      case 'every': {
        preLines.push(`var ${nextData} = true;`)
        const lines = emitCallback(
          args[0],
          code,
          `_cbT${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`if (!${expr}) { ${nextData} = false; break _outer; }`],
        )
        bodyLines.push(...lines)
        break
      }
      case 'some': {
        preLines.push(`var ${nextData} = false;`)
        const lines = emitCallback(
          args[0],
          code,
          `_cbT${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`if (${expr}) { ${nextData} = true; break _outer; }`],
        )
        bodyLines.push(...lines)
        break
      }
      case 'none': {
        preLines.push(`var ${nextData} = true;`)
        const lines = emitCallback(
          args[0],
          code,
          `_cbT${index}`,
          preLines,
          [curVar],
          inlineCallbacks,
          renderExpression,
          (expr) => [`if (${expr}) { ${nextData} = false; break _outer; }`],
        )
        bodyLines.push(...lines)
        break
      }
      case 'head': {
        preLines.push(`var ${nextData} = ${optionNoneLocal};`)
        bodyLines.push(
          `if (${nextData}._tag === 0) { ${nextData} = { _tag: 1, value: ${curVar} }; }`,
        )
        break
      }
      case 'last': {
        preLines.push(`var ${nextData} = ${optionNoneLocal};`)
        bodyLines.push(
          `if (${nextData}._tag === 0) { ${nextData} = { _tag: 1, value: ${curVar} }; } else { ${nextData}.value = ${curVar}; }`,
        )
        break
      }
      case 'length':
        preLines.push(`var ${nextData} = 0;`)
        bodyLines.push(`${nextData}++;`)
        break
      case 'isEmpty':
        preLines.push(`var ${nextData} = true;`)
        bodyLines.push(`${nextData} = false;`)
        break
      case 'min': {
        preLines.push(`var ${nextData} = ${optionNoneLocal};`)
        bodyLines.push(
          `if (${nextData}._tag === 0) { ${nextData} = { _tag: 1, value: ${curVar} }; } else if (${curVar} < ${nextData}.value) { ${nextData}.value = ${curVar}; }`,
        )
        break
      }
      case 'max': {
        preLines.push(`var ${nextData} = ${optionNoneLocal};`)
        bodyLines.push(
          `if (${nextData}._tag === 0) { ${nextData} = { _tag: 1, value: ${curVar} }; } else if (${curVar} > ${nextData}.value) { ${nextData}.value = ${curVar}; }`,
        )
        break
      }
      default:
        throw new Error(`fp-compiler: unhandled terminal op ${step.name}`)
    }
  }

  const loopIndex = seg.steps[0]?.index ?? seg.terminal!.index
  const loopLength = `_len${loopIndex}`
  stateLines.unshift(`var ${loopLength} = ${curData}.length;`)
  return [
    stateLines.join('\n'),
    `_outer: for (var _i = 0; _i < ${loopLength}; _i++) {`,
    bodyLines.join('\n'),
    ...closeBraces,
    '}',
  ]
}

// Boundary operator expressions are hoisted with the other pipe arguments.
// Calling the real operator preserves its stable sorting kernel, callback
// trace, and property-access/evaluation semantics instead of reimplementing
// an accidentally different Array.prototype operation in generated code.
function emitBoundarySegment(
  seg: BoundarySegment,
  curData: string,
  nextData: string,
  code: string,
  preLines: string[],
  renderExpression: ExpressionRenderer,
): string[] {
  const { step } = seg.step
  // These bare terminals are validated imports with no construction-time
  // bindings. Lowering them to their defining property checks avoids a
  // function call on the tiny arrays where call overhead dominates.
  if (step.name === 'length') {
    return [`var ${nextData} = ${curData}.length;`]
  }
  if (step.name === 'isEmpty') {
    return [`var ${nextData} = ${curData}.length === 0;`]
  }
  const operator = `_boundary${seg.step.index}`
  preLines.push(`var ${operator} = (${renderExpression(step.node)});`)
  return [`var ${nextData} = ${operator}(${curData});`]
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
export function generateFusedBody(
  code: string,
  sourceText: string,
  steps: readonly Step[],
  optionNoneLocal = DEFAULT_OPTION_NONE_LOCAL,
  renderExpression: ExpressionRenderer = (node) => code.slice(node.start!, node.end!),
  arrayConstructorExpression?: string,
  globalUndefinedIsUnbound = false,
): FusedBody {
  const preLines: string[] = [`var _src = (${sourceText});`]
  const blockLines: string[] = []

  const segments = segmentSteps(steps)
  // Splicing many callback bodies into one nested loop creates a large,
  // heavily scoped function that crosses optimiser cliffs in JavaScriptCore
  // and some V8 tiers. Beyond this small bound, hoisted callbacks give the
  // host engine compact functions it can inline itself and are consistently
  // faster across the release corpus.
  const inlineCallbacks =
    steps.reduce((count, step) => count + (CALLBACK_OPS.has(step.name) ? 1 : 0), 0) <=
    INLINE_CALLBACK_LIMIT
  let curData = '_src'
  let counter = 0

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    const seg = segments[segmentIndex]
    const following = segments[segmentIndex + 1]
    if (seg.kind === 'element' && following?.kind === 'boundary') {
      const mapFlatten = planLiteralMapFlatten(seg, following, inlineCallbacks)
      if (mapFlatten) {
        const nextData = `_d${counter++}`
        blockLines.push(
          ...emitLiteralArrayExpansion(
            mapFlatten,
            seg.steps[0].index,
            curData,
            nextData,
            code,
            arrayConstructorExpression,
          ),
        )
        curData = nextData
        segmentIndex++
        continue
      }
    }

    const nextData = `_d${counter++}`
    if (seg.kind === 'boundary') {
      blockLines.push(
        ...emitBoundarySegment(seg, curData, nextData, code, preLines, renderExpression),
      )
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
          arrayConstructorExpression,
          globalUndefinedIsUnbound,
        ),
      )
    }
    curData = nextData
  }

  const stmts = [preLines.join('\n'), blockLines.join('\n')].join('\n')
  return { stmts, resultVar: curData }
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
  arrayConstructorExpression?: string,
  directSourceIdentifier = false,
): string | undefined {
  if (steps.length !== 1) return undefined
  const step = steps[0]
  const sourceIsIdentifier = /^[A-Za-z_$][\w$]*$/u.test(sourceText)
  const loopSource = directSourceIdentifier && sourceIsIdentifier ? sourceText : '_src'
  const sourcePrelude = loopSource === '_src' ? [`const _src = (${sourceText});`] : []
  const sourceAccess = /^[A-Za-z_$][\w$]*$/u.test(sourceText) ? sourceText : `(${sourceText})`
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
  const direct = renderDirectInline(step.args[0], code, [`${loopSource}[_i]`])
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

/**
 * Generates a reusable runner while preserving the construction-time
 * evaluation semantics of flow()/compile(). Each original tagged step is
 * created exactly once, left-to-right, and its captured binding slots feed
 * the generated loop on every invocation.
 */
export function generateFusedRunner(
  code: string,
  steps: readonly Step[],
  optionNoneLocal = DEFAULT_OPTION_NONE_LOCAL,
  arrayConstructorExpression?: string,
  globalUndefinedIsUnbound = false,
): string {
  const captures = new Map<t.Expression, string>()
  const captureLines: string[] = []

  steps.forEach((step, index) => {
    const stepLocal = `_step${index}`
    captureLines.push(`var ${stepLocal} = (${code.slice(step.node.start!, step.node.end!)});`)
    captures.set(step.node, stepLocal)

    const slots = bindingSlots(step.name)
    if (!slots || slots.length !== step.args.length) {
      throw new Error(`fp-compiler: missing binding metadata for ${step.name}`)
    }
    step.args.forEach((arg, argIndex) => {
      captures.set(arg, `${stepLocal}._${slots[argIndex]}`)
    })
  })

  const renderExpression: ExpressionRenderer = (node) =>
    captures.get(node) ?? code.slice(node.start!, node.end!)
  const { stmts, resultVar } = generateFusedBody(
    code,
    '_in',
    steps,
    optionNoneLocal,
    renderExpression,
    arrayConstructorExpression,
    globalUndefinedIsUnbound,
  )
  return [
    '(function () {',
    captureLines.join('\n'),
    'return (_in) => {',
    stmts,
    `return ${resultVar};`,
    '};',
    '})()',
  ].join('\n')
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
): string {
  const { stmts, resultVar } = generateFusedBody(
    code,
    sourceText,
    steps,
    optionNoneLocal,
    undefined,
    arrayConstructorExpression,
    globalUndefinedIsUnbound,
  )
  return ['(function () {', stmts, `return ${resultVar};`, '})()'].join('\n')
}
