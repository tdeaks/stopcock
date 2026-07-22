// Internal JIT backend. ONLY ever reached via a dynamic import from
// compile.ts (compileJit, and the promotion path shared by pipe/compile/flow)
// — never statically imported from index.ts or any portable compile path, so
// root bundles and the root entry chunk never pull in dynamic-code
// generation. See docs/superpowers/plans/
// 2026-07-21-stopcock-fp-tiered-execution-implementation.md, "W3: tier 1 on
// the ShapeEntry model".
//
// generateShapeRunner emits ONE flat, single-frame function per execution
// identity, covering the whole plan wherever the grammar supports it: every
// stream segment becomes a fused labeled loop inlined directly in that
// function's body (per-iteration bindings hoisted to consts before the
// loop), every boundary segment becomes an explicit inline materialization
// step (sort/reverse/sum/... written directly as source, since the op is
// static at generation time), and sinks are fused into the same loop as the
// last stage. Segments the grammar doesn't cover (scalar domain, opaque
// steps, or a stream op codegen doesn't know) fall back to the portable
// per-segment lowering — still invoked from inside the one generated
// function, as an opaque callable passed in through the `fb` parameter, so
// there is still exactly one call frame per plan execution rather than one
// per segment. Callback source is never parsed, stringified, or spliced —
// only opcodes (known at generation time) become source text; the actual
// callbacks and bound constants travel through `bindings`, read by index.
import {
  OP_COUNT,
  OP_DROP,
  OP_DROP_WHILE,
  OP_EVERY,
  OP_FILTER,
  OP_FILTER_MAP,
  OP_FIND,
  OP_FIND_INDEX,
  OP_FIND_MAP,
  OP_FLAT_MAP,
  OP_FLATTEN,
  OP_FOR_EACH,
  OP_HEAD,
  OP_INIT,
  OP_IS_EMPTY,
  OP_JOIN,
  OP_LAST,
  OP_LENGTH,
  OP_MAP,
  OP_MAP_WHILE,
  OP_MAX,
  OP_MIN,
  OP_NONE,
  OP_REDUCE,
  OP_REJECT,
  OP_REVERSE,
  OP_SOME,
  OP_SORT,
  OP_SORT_ASC,
  OP_SORT_BY,
  OP_SORT_DESC,
  OP_SORT_INLINE,
  OP_SCAN,
  OP_SCAN_STREAM,
  OP_SUM,
  OP_TAIL,
  OP_TAKE,
  OP_TAKE_STREAM,
  OP_TAKE_UNTIL,
  OP_TAKE_WHILE,
  OP_UNIQ_INLINE,
  OP_WITHOUT,
} from './opcodes'
import { type OpCode, requireOpMeta } from './registry'
import { type PlanShape, type SegmentShape, type StepBinding } from './plan'
import { lowerSegment, type ConsumeMeta, type PortableRunner } from './lower'

/** One-time CSP capability probe: can this engine evaluate dynamic code? */
let dynamicCodeAvailable: boolean | undefined

export function probeDynamicCode(): boolean {
  if (dynamicCodeAvailable !== undefined) return dynamicCodeAvailable
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    dynamicCodeAvailable = new Function('return 1')() === 1
  } catch {
    dynamicCodeAvailable = false
  }
  return dynamicCodeAvailable
}

/** Test-only hook: force the next probeDynamicCode() result. */
export function __setProbeOverride(value: boolean | undefined): void {
  dynamicCodeAvailable = value
}

const STREAM_OPS = new Set<OpCode>([
  OP_MAP,
  OP_FILTER,
  OP_REJECT,
  OP_FILTER_MAP,
  OP_MAP_WHILE,
  OP_TAKE_UNTIL,
  OP_TAKE,
  OP_DROP,
  OP_TAKE_WHILE,
  OP_DROP_WHILE,
  OP_FLAT_MAP,
  OP_TAKE_STREAM,
  OP_SCAN_STREAM,
  OP_SCAN,
])

function counterKindsSupported(codes: readonly OpCode[], seg: SegmentShape): boolean {
  const lastOp = codes[seg.startIndex + seg.length - 1]
  const lastMeta = requireOpMeta(lastOp)
  const streamLen = lastMeta.cardinality === 'sink' ? seg.length - 1 : seg.length
  for (let i = 0; i < streamLen; i++) if (!STREAM_OPS.has(codes[seg.startIndex + i])) return false
  return true
}

/** Inline source for a boundary op, or null when codegen doesn't cover it (caller falls back to the portable lowering). Mirrors lower.ts's runBoundary exactly; the op is static at generation time, so it becomes source text rather than a runtime switch. When `hoistSink` is given (tier-2 instantiation), a bound field like `bindings[pos].fn` is read once into a named const pushed to `hoistSink` instead of being re-read from `bindings` inline every call. */
function emitBoundaryInline(codes: readonly OpCode[], seg: SegmentShape, hoistSink?: string[]): string | null {
  const op = codes[seg.startIndex]
  const pos = seg.startIndex
  const fieldRef = (field: 'fn' | 'a1'): string => {
    if (!hoistSink) return `bindings[${pos}].${field}`
    const name = `b${pos}_${field}`
    hoistSink.push(`const ${name} = bindings[${pos}].${field};`)
    return name
  }
  switch (op) {
    case OP_SORT_BY:
    case OP_SORT_INLINE:
    case OP_SORT:
    case OP_SORT_ASC:
    case OP_SORT_DESC:
      // Generated code can't reach module scope, so sorts take the fb[]
      // fallback into lower.ts's runBoundary and share the merge-sort kernel
      // with every other tier. The indirect call is noise next to the sort.
      return null
    case OP_HEAD:
      return `data = data[0];`
    case OP_LAST:
      return `data = data[data.length - 1];`
    case OP_LENGTH:
      return `data = data.length;`
    case OP_IS_EMPTY:
      return `data = data.length === 0;`
    case OP_TAIL:
      return `data = data.length <= 1 ? [] : data.slice(1);`
    case OP_INIT:
      return `data = data.length <= 1 ? [] : data.slice(0, -1);`
    case OP_REVERSE:
      return `data = data.toReversed ? data.toReversed() : data.slice().reverse();`
    case OP_UNIQ_INLINE:
      return `data = Array.from(new Set(data));`
    case OP_JOIN:
      return `data = data.join(${fieldRef('a1')});`
    case OP_FLATTEN:
      return `data = data.flat();`
    case OP_SUM:
      return `{ let __s = 0; for (let __k = 0; __k < data.length; __k++) __s += data[__k]; data = __s; }`
    case OP_MIN:
      return `{ let __m = data[0]; for (let __k = 1; __k < data.length; __k++) if (data[__k] < __m) __m = data[__k]; data = __m; }`
    case OP_MAX:
      return `{ let __m = data[0]; for (let __k = 1; __k < data.length; __k++) if (data[__k] > __m) __m = data[__k]; data = __m; }`
    case OP_WITHOUT:
      return `{ const __ex = new Set(${fieldRef('fn')}); data = data.filter((x) => !__ex.has(x)); }`
    default:
      return null
  }
}

/** `bump` is `__i++;` for the array-indexed emitter (the afterthought clause
 * never runs before a `break`, so the consumed count needs one manual bump
 * to include the current element) or empty for the iterable emitter (there
 * `__i` is bumped once per pulled item at the top of the loop body, already
 * counting the current element before any stage runs). */
function emitFinalStage(hasSink: boolean, lastOp: OpCode, sinkIdx: number, bump: string): string {
  if (!hasSink) return 'out.push(v);\n'
  const fn = `sinkFn${sinkIdx}`
  switch (lastOp) {
    case OP_REDUCE:
      return `acc = ${fn}(acc, v);\n`
    case OP_FOR_EACH:
      return `${fn}(v);\n`
    case OP_EVERY:
      return `if (!${fn}(v)) { every = false; ${bump}break outer; }\n`
    case OP_SOME:
      return `if (${fn}(v)) { some = true; ${bump}break outer; }\n`
    case OP_FIND:
      return `if (${fn}(v)) { found = v; ${bump}break outer; }\n`
    case OP_FIND_MAP:
      return `{ const m = ${fn}(v); if (m != null) { found = m; ${bump}break outer; } }\n`
    case OP_FIND_INDEX:
      return `if (${fn}(v)) { foundIdx = idx; ${bump}break outer; } idx++;\n`
    case OP_NONE:
      return `if (${fn}(v)) { none = false; ${bump}break outer; }\n`
    case OP_COUNT:
      return `if (${fn}(v)) cnt++;\n`
    default:
      throw new Error(`jit-chunk: unimplemented sink op ${lastOp} (${requireOpMeta(lastOp).name})`)
  }
}

function sinkFinishAssign(lastOp: OpCode): string {
  switch (lastOp) {
    case OP_REDUCE:
      return 'data = acc;'
    case OP_FOR_EACH:
      return 'data = undefined;'
    case OP_EVERY:
      return 'data = every;'
    case OP_SOME:
      return 'data = some;'
    case OP_FIND:
    case OP_FIND_MAP:
      return 'data = found;'
    case OP_FIND_INDEX:
      return 'data = foundIdx === -1 ? undefined : foundIdx;'
    case OP_NONE:
      return 'data = none;'
    case OP_COUNT:
      return 'data = cnt;'
    default:
      throw new Error(`jit-chunk: unimplemented sink op ${lastOp} (${requireOpMeta(lastOp).name})`)
  }
}

/** Recursively emits stage [s..streamLen) of one stream segment as flat source, mirroring lower.ts's buildGenericStreamRunner (the oracle for this grammar) stage for stage. `iterable` selects the array-indexed vs for-of consumed-counting convention (see emitFinalStage's doc comment). `declared` dedupes per-stage `let` declarations across multiple chain builds rooted at different start positions (see OP_SCAN's phantom pre-pass in emitStreamSegment, which re-walks stages downstream of a scan). `phantom`, when true, forces the halt bump to a no-op: a phantom (OP_SCAN's initial accumulator) was never read from the real source, so a downstream halt during its pass must not credit `__i`. */
function emitStageChain(
  codes: readonly OpCode[],
  start: number,
  streamLen: number,
  s: number,
  hasSink: boolean,
  lastOp: OpCode,
  sinkIdx: number,
  declares: string[],
  iterable: boolean,
  declared: Set<number>,
  phantom = false,
): string {
  const bump = phantom ? '' : iterable ? '' : '__i++; '
  if (s === streamLen) return emitFinalStage(hasSink, lastOp, sinkIdx, bump)
  const idx = start + s
  const op = codes[idx]
  const f = `f${idx}`
  const rest = (): string =>
    emitStageChain(codes, start, streamLen, s + 1, hasSink, lastOp, sinkIdx, declares, iterable, declared, phantom)
  const declareOnce = (...lines: string[]): void => {
    if (declared.has(idx)) return
    declared.add(idx)
    declares.push(...lines)
  }
  switch (op) {
    case OP_MAP:
      return `v = ${f}(v);\n${rest()}`
    case OP_FILTER:
      return `if (!${f}(v)) continue;\n${rest()}`
    case OP_REJECT:
      return `if (${f}(v)) continue;\n${rest()}`
    case OP_FILTER_MAP:
      return `{ const m = ${f}(v); if (m == null) continue; v = m; }\n${rest()}`
    case OP_MAP_WHILE:
      return `{ const m = ${f}(v); if (m == null) { ${bump}break outer; } v = m; }\n${rest()}`
    case OP_TAKE_UNTIL:
      return `if (${f}(v)) { ${bump}break outer; }\n${rest()}`
    case OP_TAKE: {
      const c = `tk${idx}`
      declareOnce(`let ${c} = 0;`)
      return `if (${c} >= ${f}) { ${bump}break outer; }\n${c}++;\n${rest()}`
    }
    case OP_DROP: {
      const c = `dp${idx}`
      declareOnce(`let ${c} = 0;`)
      return `if (${c} < ${f}) { ${c}++; continue; }\n${rest()}`
    }
    case OP_TAKE_WHILE:
      return `if (!${f}(v)) { ${bump}break outer; }\n${rest()}`
    case OP_DROP_WHILE: {
      const c = `dw${idx}`
      declareOnce(`let ${c} = true;`)
      return `if (${c}) { if (${f}(v)) continue; ${c} = false; }\n${rest()}`
    }
    case OP_TAKE_STREAM: {
      // Stream dialect: quota-reached stops the source immediately after
      // this item finishes (no extra upstream callback), unlike OP_TAKE
      // above — so the halt check runs *after* rest() rather than before.
      const c = `tk${idx}`
      const h = `th${idx}`
      declareOnce(`let ${c} = 0;`, `let ${h} = false;`)
      return (
        `if (${f} <= 0) { ${bump}break outer; }\n${c}++;\nif (${c} >= ${f}) ${h} = true;\n${rest()}` +
        `if (${h}) { ${bump}break outer; }\n`
      )
    }
    case OP_SCAN_STREAM: {
      const acc = `sc${idx}`
      declareOnce(`let ${acc} = bindings[${idx}].a1;`)
      return `${acc} = ${f}(${acc}, v);\nv = ${acc};\n${rest()}`
    }
    case OP_SCAN: {
      // Array dialect: the initial accumulator is emitted before any real
      // element by a separate phantom pre-pass (see emitStreamSegment) that
      // walks stages [idx+1..) with v = sc{idx}'s current (still initial)
      // value. This case only ever runs the per-element update.
      const acc = `sc${idx}`
      declareOnce(`let ${acc} = bindings[${idx}].a1;`)
      return `${acc} = ${f}(${acc}, v);\nv = ${acc};\n${rest()}`
    }
    case OP_FLAT_MAP: {
      // Iterable, not array-indexed — array.ts's flatMap returns arrays
      // (also iterable) but Stream's flatMap can return arbitrary, even
      // infinite, iterables (see stream.ts). A `break outer`/thrown error
      // from inside this for-of triggers the engine's own IteratorClose.
      const items = `it${idx}`
      return `const ${items} = ${f}(v);\nfor (let v of ${items}) {\n${rest()}}\n`
    }
    default:
      throw new Error(`jit-chunk: unimplemented stream op ${op} (${requireOpMeta(op).name})`)
  }
}

/** Emits one stream segment as a self-contained block that reads `data`, loops it, and reassigns `data` to the result — inline in the enclosing plan-level function, not a separate call. When `hoistSink` is given (tier-2 instantiation), the per-call-fn consts (f{idx}, sinkFn{idx}) are pushed there instead of declared inline, so they're read from the concrete callback vector once per instantiation rather than once per call — the same identifier names are still referenced from inside the loop, they're just declared in the enclosing factory scope instead of this block. `iterableSource` (only ever true for the first segment — see generateIterableRunner) drives the loop with `for (const ... of src)` instead of an index, for a `data` that's an arbitrary Iterable rather than an array. */
function emitStreamSegment(
  codes: readonly OpCode[],
  seg: SegmentShape,
  isFirst: boolean,
  hoistSink?: string[],
  iterableSource = false,
): string {
  const start = seg.startIndex
  const len = seg.length
  const lastOp = codes[start + len - 1]
  const lastMeta = requireOpMeta(lastOp)
  const hasSink = lastMeta.cardinality === 'sink'
  const streamLen = hasSink ? len - 1 : len
  const sinkIdx = start + streamLen

  const localHoists: string[] = []
  const hoists = hoistSink ?? localHoists
  for (let s = 0; s < streamLen; s++) hoists.push(`const f${start + s} = bindings[${start + s}].fn;`)

  const declares: string[] = []
  const declared = new Set<number>()
  const stageBody = emitStageChain(codes, start, streamLen, 0, hasSink, lastOp, sinkIdx, declares, iterableSource, declared)

  // OP_SCAN (array dialect) emits its initial accumulator before any real
  // element is processed. Each scan position gets its own one-shot
  // do-while pass (walking stages after it with the phantom value), run in
  // descending position order before the main loop -- see lower.ts's
  // runScanArrayInits for the identical ordering rationale (a later scan's
  // own phantom must fire before an earlier scan's phantom reaches it).
  const scanPositions: number[] = []
  for (let s = 0; s < streamLen; s++) if (codes[start + s] === OP_SCAN) scanPositions.unshift(s)
  const scanInitBlocks = scanPositions.map((s) => {
    const idx = start + s
    const chain = emitStageChain(codes, start, streamLen, s + 1, hasSink, lastOp, sinkIdx, declares, iterableSource, declared, true)
    return `do {\nlet v = sc${idx};\n${chain}} while (false);\n`
  })

  const sinkInit: string[] = []
  if (hasSink) {
    hoists.push(`const sinkFn${sinkIdx} = bindings[${sinkIdx}].fn;`)
    switch (lastOp) {
      case OP_REDUCE:
        sinkInit.push(`let acc = bindings[${sinkIdx}].a1;`)
        break
      case OP_EVERY:
        sinkInit.push('let every = true;')
        break
      case OP_SOME:
        sinkInit.push('let some = false;')
        break
      case OP_NONE:
        sinkInit.push('let none = true;')
        break
      case OP_COUNT:
        sinkInit.push('let cnt = 0;')
        break
      case OP_FIND:
      case OP_FIND_MAP:
        sinkInit.push('let found;')
        break
      case OP_FIND_INDEX:
        sinkInit.push('let foundIdx = -1;\nlet idx = 0;')
        break
      default:
        break
    }
  }

  const lines = [
    '{',
    'const src = data;',
    ...(hoistSink ? [] : localHoists),
    ...declares,
    hasSink ? '' : 'const out = [];',
    ...sinkInit,
    'let __i = 0;',
    'outer: {',
    ...scanInitBlocks,
    iterableSource ? 'for (const __v of src) {' : 'for (; __i < src.length; __i++) {',
    iterableSource ? '__i++;\nlet v = __v;' : 'let v = src[__i];',
    stageBody,
    '}',
    '}',
    hasSink ? sinkFinishAssign(lastOp) : 'data = out;',
    isFirst ? 'if (meta) meta.consumed = __i;' : '',
    '}',
  ]
  return lines.filter((l) => l !== '').join('\n')
}

/**
 * Emits the per-segment source for a whole PlanShape, in call order: stream
 * segments as fused labeled loops, boundary segments as direct
 * materialization steps, and segments codegen doesn't cover (scalar domain,
 * opaque steps, unsupported stream ops) as a call into the portable
 * per-segment lowering, still from inside the one caller-supplied function
 * body. Shared by generateShapeRunner (tier 1, `hoistSink` omitted: fn
 * consts declared inline, re-read from the `bindings` parameter every call)
 * and generateVectorRunner (tier 2, `hoistSink` given: fn consts collected
 * there and declared once at the enclosing factory's instantiation scope
 * instead, since that vector's bindings never change again).
 *
 * `iterableFirst` (generateIterableRunner / generateIterableVectorRunner
 * only) drives the first segment's loop with `for (const ... of src)`
 * instead of indexing, for an `input` that's an arbitrary Iterable rather
 * than an array. Every op Stream's own vocabulary can append is
 * array-domain and never a materializer (plan.ts's segmentBoundSteps), so a
 * Stream-built shape always has exactly one segment, itself 'stream' —
 * asserted here rather than silently mis-emitting a boundary/opaque/scalar
 * segment against a non-array `data`.
 */
function buildRunnerBody(
  shape: PlanShape,
  hoistSink: string[] | undefined,
  iterableFirst = false,
): { body: string[]; fallbacks: PortableRunner[] } {
  const { codes, segments } = shape
  if (iterableFirst && segments[0]?.kind !== 'stream') {
    throw new Error('jit-chunk: iterable-sourced shape must have a stream segment first')
  }
  const fallbacks: PortableRunner[] = []
  const body: string[] = ['let data = input;']

  segments.forEach((seg, segIdx) => {
    const isFirst = segIdx === 0
    if (isFirst) body.push('const __src0 = data;')

    if (seg.domain === 'scalar') {
      const i = fallbacks.length
      fallbacks.push(lowerSegment(codes, seg))
      body.push(`data = fb[${i}](data, bindings${isFirst ? ', meta' : ''});`)
      return
    }

    if (seg.kind === 'opaque') {
      if (hoistSink) {
        const name = `opq${seg.startIndex}`
        hoistSink.push(`const ${name} = bindings[${seg.startIndex}].opaqueFn;`)
        body.push(`data = ${name}(data);`)
      } else {
        body.push(`data = bindings[${seg.startIndex}].opaqueFn(data);`)
      }
      if (isFirst) body.push('if (meta) meta.consumed = Array.isArray(__src0) ? __src0.length : 1;')
      return
    }

    if (seg.kind === 'boundary') {
      const inline = emitBoundaryInline(codes, seg, hoistSink)
      if (inline) {
        body.push(inline)
      } else {
        const i = fallbacks.length
        fallbacks.push(lowerSegment(codes, seg))
        body.push(`data = fb[${i}](data, bindings);`)
      }
      if (isFirst) body.push('if (meta) meta.consumed = Array.isArray(__src0) ? __src0.length : 1;')
      return
    }

    // stream
    if (!counterKindsSupported(codes, seg)) {
      const i = fallbacks.length
      fallbacks.push(lowerSegment(codes, seg))
      body.push(`data = fb[${i}](data, bindings${isFirst ? ', meta' : ''});`)
      return
    }
    body.push(emitStreamSegment(codes, seg, isFirst, hoistSink, isFirst && iterableFirst))
  })

  body.push('return data;')
  return { body, fallbacks }
}

/**
 * Builds a tier-1 generated runner for a whole PlanShape as ONE flat
 * function, identity-blind: bindings are read by index from the `bindings`
 * parameter on every call, so the same generated function serves every
 * callback vector for this shape. Callback source is never parsed,
 * stringified, or spliced -- only opcodes become source text.
 */
export function generateShapeRunner(shape: PlanShape): PortableRunner {
  const { body, fallbacks } = buildRunnerBody(shape, undefined)
  const source = `(fb) => (input, bindings, meta) => {\n${body.join('\n')}\n}`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(`return ${source}`)() as (fb: PortableRunner[]) => PortableRunner
  return factory(fallbacks)
}

/**
 * Iterable-source variant of generateShapeRunner: same fused single-frame
 * body, but the (necessarily sole, see buildRunnerBody) stream segment loops
 * `input` with `for (const ... of input)` instead of an index — used for
 * Stream terminals over a non-array, early-termination chain (stream.ts's
 * resolveIterableStreamEntry), which is why this exists as a separate tier-1
 * codegen entry point rather than a runtime branch inside generateShapeRunner:
 * the generated code shape genuinely differs (a labeled for-of vs. a
 * for-index loop), not just the value passed in.
 */
export function generateIterableRunner(shape: PlanShape): PortableRunner {
  const { body, fallbacks } = buildRunnerBody(shape, undefined, true)
  const source = `(fb) => (input, bindings, meta) => {\n${body.join('\n')}\n}`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(`return ${source}`)() as (fb: PortableRunner[]) => PortableRunner
  return factory(fallbacks)
}

export type VectorRunner = (input: unknown, meta?: ConsumeMeta) => unknown

/**
 * Builds a tier-2 generated runner for one exact callback vector: same body
 * shape as generateShapeRunner, but every `bindings[idx].field` read that
 * generateShapeRunner would repeat on every call is instead read exactly
 * once here, into a const declared in the outer instantiation scope
 * (`new Function('bindings', 'return function(input){ const f0 =
 * bindings[0].fn; ... }')(bindings)`), closing over this vector's concrete
 * callbacks. Every call to the returned function then sees the exact same
 * function reference at each call site -- monomorphic and inlinable, unlike
 * tier 1's shared, identity-blind runner. Only instantiate this for a vector
 * that has actually recurred (see vector-cache.ts): a fresh instantiation is
 * not free, so this is never the right call on first sight of a shape.
 */
export function generateVectorRunner(shape: PlanShape, bindings: readonly StepBinding[]): VectorRunner {
  const outerHoists: string[] = []
  const { body, fallbacks } = buildRunnerBody(shape, outerHoists)
  const source =
    `(fb, bindings) => {\n${outerHoists.join('\n')}\n` + `return (input, meta) => {\n${body.join('\n')}\n};\n}`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(`return ${source}`)() as (
    fb: PortableRunner[],
    bindings: readonly StepBinding[],
  ) => VectorRunner
  return factory(fallbacks, bindings)
}

/** Iterable-source variant of generateVectorRunner, mirroring
 * generateIterableRunner's relationship to generateShapeRunner: same
 * monomorphic-vector instantiation, but the sole stream segment loops its
 * input with a for-of instead of an index. */
export function generateIterableVectorRunner(shape: PlanShape, bindings: readonly StepBinding[]): VectorRunner {
  const outerHoists: string[] = []
  const { body, fallbacks } = buildRunnerBody(shape, outerHoists, true)
  const source =
    `(fb, bindings) => {\n${outerHoists.join('\n')}\n` + `return (input, meta) => {\n${body.join('\n')}\n};\n}`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(`return ${source}`)() as (
    fb: PortableRunner[],
    bindings: readonly StepBinding[],
  ) => VectorRunner
  return factory(fallbacks, bindings)
}
