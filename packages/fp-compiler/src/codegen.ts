import * as t from '@babel/types'
import { BOUNDARY_OPS, TERMINAL_OPS } from './ops'
import { planInline } from './inline'

export interface Step {
  readonly name: string
  readonly node: t.Expression
  readonly args: readonly t.Expression[]
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
  use: (expr: string) => string[],
): string[] {
  const plan = planInline(argNode)
  if (plan) {
    const decls = plan.params.map((p, i) => `const ${p} = ${inputVars[i]};`)
    const bodyText = code.slice(plan.bodyStart, plan.bodyEnd)
    return ['{', ...decls, ...use(`(${bodyText})`), '}']
  }
  preLines.push(`var ${tempName} = (${code.slice(argNode.start!, argNode.end!)});`)
  return use(`${tempName}(${inputVars.join(', ')})`)
}

export interface FusedBody {
  readonly stmts: string
  readonly resultVar: string
}

interface IndexedStep {
  readonly index: number
  readonly step: Step
}

interface StreamSegment {
  readonly kind: 'stream'
  readonly steps: readonly IndexedStep[]
  readonly terminal?: IndexedStep
}

interface BoundarySegment {
  readonly kind: 'boundary'
  readonly step: IndexedStep
}

type Segment = StreamSegment | BoundarySegment

// Splits a pipeline's steps into alternating stream and boundary segments,
// mirroring the frozen emitter's segmentSteps (benchmarks/src/reference/
// emitter.ts): a boundary op flushes whatever stream segment came before it
// and starts a new one; a terminal (validated by the caller to only ever
// appear last) attaches to and flushes the segment it ends.
function segmentSteps(steps: readonly Step[]): readonly Segment[] {
  const segments: Segment[] = []
  let current: IndexedStep[] = []

  const flush = (terminal?: IndexedStep): void => {
    if (current.length === 0 && terminal === undefined) return
    segments.push({ kind: 'stream', steps: current, terminal })
    current = []
  }

  steps.forEach((step, index) => {
    if (BOUNDARY_OPS.has(step.name)) {
      flush()
      segments.push({ kind: 'boundary', step: { index, step } })
      return
    }
    if (TERMINAL_OPS.has(step.name)) {
      flush({ index, step })
      return
    }
    current.push({ index, step })
  })
  flush()
  return segments
}

function emitStreamSegment(seg: StreamSegment, curData: string, nextData: string, code: string, preLines: string[]): string[] {
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
        const lines = emitCallback(args[0], code, `_cb${index}`, preLines, [curVar], (expr) => [`var ${nextVar} = ${expr};`])
        bodyLines.push(...lines)
        break
      }
      case 'filter': {
        const lines = emitCallback(args[0], code, `_cb${index}`, preLines, [curVar], (expr) => [`if (!${expr}) { continue; }`])
        bodyLines.push(...lines)
        bodyLines.push(`var ${nextVar} = ${curVar};`)
        break
      }
      case 'reject': {
        const lines = emitCallback(args[0], code, `_cb${index}`, preLines, [curVar], (expr) => [`if (${expr}) { continue; }`])
        bodyLines.push(...lines)
        bodyLines.push(`var ${nextVar} = ${curVar};`)
        break
      }
      case 'filterMap': {
        const lines = emitCallback(args[0], code, `_cb${index}`, preLines, [curVar], (expr) => [
          `var _m${index} = ${expr};`,
          `if (_m${index} == null) { continue; }`,
        ])
        bodyLines.push(...lines)
        bodyLines.push(`var ${nextVar} = _m${index};`)
        break
      }
      case 'flatMap': {
        const lines = emitCallback(args[0], code, `_cb${index}`, preLines, [curVar], (expr) => [`var _fm${index} = ${expr};`])
        bodyLines.push(...lines)
        // Nested loop over the inner array, spliced into the tail position of
        // the outer per-item body: everything downstream of this step (more
        // stream ops, the sink) executes once per inner item, nested inside
        // this for. break _outer (labeled on the top-level loop, see
        // generateFusedBody) is what lets take/takeWhile/find/etc downstream
        // of a flatMap exit both loops at once; plain continue still only
        // needs to skip the innermost (inner) loop, which is correct here too.
        bodyLines.push(`for (var _j${index} = 0; _j${index} < _fm${index}.length; _j${index}++) {`)
        bodyLines.push(`var ${nextVar} = _fm${index}[_j${index}];`)
        closeBraces.push('}')
        break
      }
      case 'take': {
        const nTemp = `_n${index}`
        preLines.push(`var ${nTemp} = (${code.slice(args[0].start!, args[0].end!)});`)
        stateLines.push(`var _take${index} = 0;`)
        bodyLines.push(`if (_take${index} >= ${nTemp}) break _outer;`)
        bodyLines.push(`_take${index}++;`)
        bodyLines.push(`var ${nextVar} = ${curVar};`)
        break
      }
      case 'drop': {
        const nTemp = `_n${index}`
        preLines.push(`var ${nTemp} = (${code.slice(args[0].start!, args[0].end!)});`)
        stateLines.push(`var _drop${index} = 0;`)
        bodyLines.push(`if (_drop${index} < ${nTemp}) { _drop${index}++; continue; }`)
        bodyLines.push(`var ${nextVar} = ${curVar};`)
        break
      }
      case 'takeWhile': {
        const lines = emitCallback(args[0], code, `_cb${index}`, preLines, [curVar], (expr) => [`if (!${expr}) break _outer;`])
        bodyLines.push(...lines)
        bodyLines.push(`var ${nextVar} = ${curVar};`)
        break
      }
      case 'dropWhile': {
        stateLines.push(`var _dw${index} = true;`)
        const lines = emitCallback(args[0], code, `_cb${index}`, preLines, [curVar], (expr) => [
          `if (_dw${index}) { if (${expr}) { continue; } _dw${index} = false; }`,
        ])
        bodyLines.push(...lines)
        bodyLines.push(`var ${nextVar} = ${curVar};`)
        break
      }
      default:
        throw new Error(`fp-compiler: unhandled stream op ${step.name}`)
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
        const lines = emitCallback(args[0], code, `_cbT${index}`, preLines, [curVar], (expr) => [
          `if (${expr}) { ${nextData}++; }`,
        ])
        bodyLines.push(...lines)
        break
      }
      case 'reduce': {
        const [fnArg, initArg] = args
        preLines.push(`var ${nextData} = (${code.slice(initArg.start!, initArg.end!)});`)
        const plan = planInline(fnArg)
        if (plan) {
          const decls = plan.params.map((p, i) => `const ${p} = ${i === 0 ? nextData : curVar};`)
          const bodyText = code.slice(plan.bodyStart, plan.bodyEnd)
          bodyLines.push('{', ...decls, `${nextData} = (${bodyText});`, '}')
        } else {
          preLines.push(`var _cbT${index} = (${code.slice(fnArg.start!, fnArg.end!)});`)
          bodyLines.push(`${nextData} = _cbT${index}(${nextData}, ${curVar});`)
        }
        break
      }
      case 'forEach': {
        const lines = emitCallback(args[0], code, `_cbT${index}`, preLines, [curVar], (expr) => [`${expr};`])
        bodyLines.push(...lines)
        preLines.push(`var ${nextData} = undefined;`)
        break
      }
      case 'find': {
        preLines.push(`var ${nextData} = undefined;`)
        const lines = emitCallback(args[0], code, `_cbT${index}`, preLines, [curVar], (expr) => [
          `if (${expr}) { ${nextData} = ${curVar}; break _outer; }`,
        ])
        bodyLines.push(...lines)
        break
      }
      case 'findIndex': {
        preLines.push(`var ${nextData} = undefined;`)
        stateLines.push(`var _pos${index} = 0;`)
        const lines = emitCallback(args[0], code, `_cbT${index}`, preLines, [curVar], (expr) => [
          `if (${expr}) { ${nextData} = _pos${index}; break _outer; }`,
          `_pos${index}++;`,
        ])
        bodyLines.push(...lines)
        break
      }
      case 'findMap': {
        preLines.push(`var ${nextData} = undefined;`)
        const lines = emitCallback(args[0], code, `_cbT${index}`, preLines, [curVar], (expr) => [
          `var _fmv${index} = ${expr};`,
          `if (_fmv${index} != null) { ${nextData} = _fmv${index}; break _outer; }`,
        ])
        bodyLines.push(...lines)
        break
      }
      case 'every': {
        preLines.push(`var ${nextData} = true;`)
        const lines = emitCallback(args[0], code, `_cbT${index}`, preLines, [curVar], (expr) => [
          `if (!${expr}) { ${nextData} = false; break _outer; }`,
        ])
        bodyLines.push(...lines)
        break
      }
      case 'some': {
        preLines.push(`var ${nextData} = false;`)
        const lines = emitCallback(args[0], code, `_cbT${index}`, preLines, [curVar], (expr) => [
          `if (${expr}) { ${nextData} = true; break _outer; }`,
        ])
        bodyLines.push(...lines)
        break
      }
      case 'none': {
        preLines.push(`var ${nextData} = true;`)
        const lines = emitCallback(args[0], code, `_cbT${index}`, preLines, [curVar], (expr) => [
          `if (${expr}) { ${nextData} = false; break _outer; }`,
        ])
        bodyLines.push(...lines)
        break
      }
      default:
        throw new Error(`fp-compiler: unhandled terminal op ${step.name}`)
    }
  }

  return [
    stateLines.join('\n'),
    `_outer: for (var _i = 0; _i < ${curData}.length; _i++) {`,
    bodyLines.join('\n'),
    ...closeBraces,
    '}',
  ]
}

// Boundary steps materialize the whole array once (sort/reverse/uniq),
// running exactly once between stream segments -- unlike stream-op args,
// there's no need to hoist the bound expression into a preLines temp: it's
// only ever evaluated the one time, right here, in appearance order.
function emitBoundarySegment(seg: BoundarySegment, curData: string, nextData: string, code: string): string[] {
  const { step } = seg.step
  switch (step.name) {
    case 'sort':
      return [`var ${nextData} = ${curData}.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));`]
    case 'sortAsc':
      return [`var ${nextData} = ${curData}.slice().sort((a, b) => a - b);`]
    case 'sortDesc':
      return [`var ${nextData} = ${curData}.slice().sort((a, b) => b - a);`]
    case 'sortBy': {
      const cmpText = code.slice(step.args[0].start!, step.args[0].end!)
      return [`var ${nextData} = ${curData}.slice().sort(${cmpText});`]
    }
    case 'reverse':
      return [`var ${nextData} = ${curData}.slice().reverse();`]
    case 'uniq':
      return [`var ${nextData} = Array.from(new Set(${curData}));`]
    default:
      throw new Error(`fp-compiler: unhandled boundary op ${step.name}`)
  }
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
 * (stream ops, optionally ending in a terminal) or a single materializing
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
export function generateFusedBody(code: string, sourceText: string, steps: readonly Step[]): FusedBody {
  const preLines: string[] = [`var _src = (${sourceText});`]
  const blockLines: string[] = []

  const segments = segmentSteps(steps)
  let curData = '_src'
  let counter = 0

  for (const seg of segments) {
    const nextData = `_d${counter++}`
    if (seg.kind === 'boundary') {
      blockLines.push(...emitBoundarySegment(seg, curData, nextData, code))
    } else {
      blockLines.push(...emitStreamSegment(seg, curData, nextData, code, preLines))
    }
    curData = nextData
  }

  const stmts = [preLines.join('\n'), blockLines.join('\n')].join('\n')
  return { stmts, resultVar: curData }
}

/**
 * Expression-position fallback: wraps `generateFusedBody`'s statements in
 * an IIFE so the result can be spliced in wherever an expression is
 * required. Prefer emitting the body directly into an existing function
 * (see `generateFusedBody` doc) when the call site allows it.
 */
export function generateFusedLoop(code: string, sourceText: string, steps: readonly Step[]): string {
  const { stmts, resultVar } = generateFusedBody(code, sourceText, steps)
  return ['(function () {', stmts, `return ${resultVar};`, '})()'].join('\n')
}
