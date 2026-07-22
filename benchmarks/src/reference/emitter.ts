// Frozen reference emitter (W0a). Owned by benchmarks/, never imported by
// production code. Given a pipeline description it emits the source text of
// a hand-fused loop: one flat labeled loop per stream segment, boundary ops
// materialized as explicit steps between loops, sinks fused into the loop
// that produces their input, no thrown sentinels for early exit. Callbacks
// are referenced as bindings[i].fn / bindings[i].a1, never stringified.
//
// Grammar covered: map, filter, reject, filterMap, flatMap, take, drop,
// takeWhile, dropWhile as stream ops; count, reduce, forEach, find, every,
// some, plus toArray (implicit collect-to-array terminal, no real opcode)
// as sinks; sort, sortBy, sortAsc, sortDesc, reverse, uniq, sum as boundary
// ops. This intentionally follows the registry's classification rather than
// the "sum is a sink" intuition: OP_SUM's cardinality in registry.ts is
// 'materializer', and interpret.ts runs it in runBoundary (its own pass
// over the fully materialized array), not fused into runStreamSegment's
// per-item switch. The emitter mirrors that, not the informal grammar
// description that groups sum with count/reduce/etc as if it were fused.
//
// scan and without are now tagged in array.ts (OP_SCAN, OP_WITHOUT) and
// covered below: scan as a stream op (registry cardinality 'stateful',
// n+1 output with the initial accumulator emitted before any element —
// see opcodes.ts's OP_SCAN comment), without as a boundary op (registry
// cardinality 'materializer', values bound at .fn per opcodes.ts's
// OP_WITHOUT comment). See CHANGELOG.md's 2026-07-21 grammar-extension
// entry. toArray-as-a-real-op remains absent: it has no opcode at all (see
// EMITTER_OPCODES below), synthetic sink only.
//
// 2026-07-21 W6 outlier investigation (map->flatMap->filter->filterMap->reduce
// at ~0.2x vs this emitter): flatMap here fans out with an indexed for-loop
// (`for (let j = 0; j < items.length; j++) { let v = items[j]; ... }`, see
// emitChain's 'flatMap' case below), while jit-chunk.ts's tier-1/2 flatMap
// (added by W5, shared with Stream) uses `for (const v of items) { ... }`.
// The fuzz cross-tier extension (benchmarks/src/reference/fuzz-correctness.test.ts)
// found this is not just a denominator-distortion style difference: jit-chunk's
// `const v` throws "Assignment to constant variable" the moment any later
// stage in the same segment reassigns v (map, filterMap, mapWhile, scan, a
// second flatMap), because the for-of binding shadows the outer loop's `let
// v` and can't be written to. That is a tier-1/2 correctness bug, not an
// emitter concern — see CHANGELOG.md for the proposed jit-chunk.ts fix. This
// emitter is NOT being changed to match jit-chunk's idiom: its indexed loop
// is correct as written, and copying `for (const v of items)` here would
// import the same bug into the oracle. Left as documentation only per the
// frozen-emitter changelog discipline.
import {
  OP_COUNT,
  OP_DROP,
  OP_DROP_WHILE,
  OP_EVERY,
  OP_FILTER,
  OP_FILTER_MAP,
  OP_FIND,
  OP_FLAT_MAP,
  OP_FOR_EACH,
  OP_MAP,
  OP_REDUCE,
  OP_REJECT,
  OP_REVERSE,
  OP_SCAN,
  OP_SOME,
  OP_SORT,
  OP_SORT_ASC,
  OP_SORT_BY,
  OP_SORT_DESC,
  OP_SUM,
  OP_TAKE,
  OP_TAKE_WHILE,
  OP_UNIQ_INLINE,
  OP_WITHOUT,
} from '../../../packages/fp/src/opcodes'
import { mergeSortAsc, mergeSortBy, mergeSortDesc } from '../../../packages/fp/src/sort-kernel'

export type StreamStepKind =
  | 'map'
  | 'filter'
  | 'reject'
  | 'filterMap'
  | 'flatMap'
  | 'take'
  | 'drop'
  | 'takeWhile'
  | 'dropWhile'
  | 'scan'

export type SinkStepKind = 'count' | 'reduce' | 'forEach' | 'find' | 'every' | 'some' | 'toArray'

export type BoundaryStepKind = 'sort' | 'sortBy' | 'sortAsc' | 'sortDesc' | 'reverse' | 'uniq' | 'sum' | 'without'

export interface StepDesc {
  readonly kind: StreamStepKind | SinkStepKind | BoundaryStepKind
}

export interface PipelineDesc {
  readonly steps: readonly StepDesc[]
}

/** Binding slots, index-aligned with PipelineDesc.steps, mirroring plan.ts's StepBinding shape. */
export interface EmitterBinding {
  readonly fn?: unknown
  readonly a1?: unknown
}

const STREAM_KINDS: ReadonlySet<string> = new Set([
  'map',
  'filter',
  'reject',
  'filterMap',
  'flatMap',
  'take',
  'drop',
  'takeWhile',
  'dropWhile',
  'scan',
])
const SINK_KINDS: ReadonlySet<string> = new Set(['count', 'reduce', 'forEach', 'find', 'every', 'some', 'toArray'])
const BOUNDARY_KINDS: ReadonlySet<string> = new Set([
  'sort',
  'sortBy',
  'sortAsc',
  'sortDesc',
  'reverse',
  'uniq',
  'sum',
  'without',
])

export function isStreamKind(kind: string): kind is StreamStepKind {
  return STREAM_KINDS.has(kind)
}
export function isSinkKind(kind: string): kind is SinkStepKind {
  return SINK_KINDS.has(kind)
}
export function isBoundaryKind(kind: string): kind is BoundaryStepKind {
  return BOUNDARY_KINDS.has(kind)
}

/** The registry opcode each grammar kind corresponds to; null for kinds with no real opcode (toArray). */
export const EMITTER_OPCODES: Readonly<Record<StreamStepKind | SinkStepKind | BoundaryStepKind, number | null>> = {
  map: OP_MAP,
  filter: OP_FILTER,
  reject: OP_REJECT,
  filterMap: OP_FILTER_MAP,
  flatMap: OP_FLAT_MAP,
  take: OP_TAKE,
  drop: OP_DROP,
  takeWhile: OP_TAKE_WHILE,
  dropWhile: OP_DROP_WHILE,
  scan: OP_SCAN,
  count: OP_COUNT,
  reduce: OP_REDUCE,
  forEach: OP_FOR_EACH,
  find: OP_FIND,
  every: OP_EVERY,
  some: OP_SOME,
  toArray: null,
  sort: OP_SORT,
  sortBy: OP_SORT_BY,
  sortAsc: OP_SORT_ASC,
  sortDesc: OP_SORT_DESC,
  reverse: OP_REVERSE,
  uniq: OP_UNIQ_INLINE,
  sum: OP_SUM,
  without: OP_WITHOUT,
}

interface StreamSegment {
  readonly kind: 'stream'
  readonly ops: ReadonlyArray<{ readonly index: number; readonly kind: StreamStepKind }>
  readonly sink?: { readonly index: number; readonly kind: SinkStepKind }
}
interface BoundarySegment {
  readonly kind: 'boundary'
  readonly index: number
  readonly stepKind: BoundaryStepKind
}
type Segment = StreamSegment | BoundarySegment

function segmentSteps(steps: readonly StepDesc[]): readonly Segment[] {
  const segments: Segment[] = []
  let current: Array<{ index: number; kind: StreamStepKind }> = []

  const flushStream = (sink?: { index: number; kind: SinkStepKind }): void => {
    if (current.length === 0 && sink === undefined) return
    segments.push({ kind: 'stream', ops: current, sink })
    current = []
  }

  for (let i = 0; i < steps.length; i++) {
    const kind = steps[i].kind
    if (isBoundaryKind(kind)) {
      flushStream()
      segments.push({ kind: 'boundary', index: i, stepKind: kind })
      continue
    }
    if (isSinkKind(kind)) {
      flushStream({ index: i, kind: kind as SinkStepKind })
      continue
    }
    current.push({ index: i, kind: kind as StreamStepKind })
  }
  flushStream()
  return segments
}

function emitChain(
  ops: StreamSegment['ops'],
  pos: number,
  sink: StreamSegment['sink'],
  out: string[],
): void {
  if (pos >= ops.length) {
    emitSinkStep(sink, out)
    return
  }
  const { index, kind } = ops[pos]
  switch (kind) {
    case 'map':
      out.push(`v = bindings[${index}].fn(v);`)
      emitChain(ops, pos + 1, sink, out)
      return
    case 'filter':
      out.push(`if (!bindings[${index}].fn(v)) continue;`)
      emitChain(ops, pos + 1, sink, out)
      return
    case 'reject':
      out.push(`if (bindings[${index}].fn(v)) continue;`)
      emitChain(ops, pos + 1, sink, out)
      return
    case 'filterMap':
      out.push(`v = bindings[${index}].fn(v);`)
      out.push('if (v == null) continue;')
      emitChain(ops, pos + 1, sink, out)
      return
    case 'take':
      out.push(`if (take${index} >= bindings[${index}].fn) break outer;`)
      out.push(`take${index}++;`)
      emitChain(ops, pos + 1, sink, out)
      return
    case 'drop':
      out.push(`if (drop${index} < bindings[${index}].fn) { drop${index}++; continue; }`)
      emitChain(ops, pos + 1, sink, out)
      return
    case 'takeWhile':
      out.push(`if (!bindings[${index}].fn(v)) break outer;`)
      emitChain(ops, pos + 1, sink, out)
      return
    case 'dropWhile':
      out.push(
        `if (dropWhileActive${index}) { if (bindings[${index}].fn(v)) continue; dropWhileActive${index} = false; }`,
      )
      emitChain(ops, pos + 1, sink, out)
      return
    case 'scan':
      // Per-element update only; the initial accumulator is emitted once,
      // before any element, by emitScanInits (see emitStreamSegment).
      out.push(`scanAcc${index} = bindings[${index}].fn(scanAcc${index}, v);`)
      out.push(`v = scanAcc${index};`)
      emitChain(ops, pos + 1, sink, out)
      return
    case 'flatMap': {
      out.push('{')
      out.push(`const items${index} = bindings[${index}].fn(v);`)
      out.push(`for (let j${index} = 0; j${index} < items${index}.length; j${index}++) {`)
      out.push(`let v = items${index}[j${index}];`)
      emitChain(ops, pos + 1, sink, out)
      out.push('}')
      out.push('}')
      return
    }
  }
}

function emitSinkStep(sink: StreamSegment['sink'], out: string[]): void {
  if (!sink || sink.kind === 'toArray') {
    out.push('out.push(v);')
    return
  }
  const index = sink.index
  switch (sink.kind) {
    case 'reduce':
      out.push(`acc = bindings[${index}].fn(acc, v);`)
      return
    case 'forEach':
      out.push(`bindings[${index}].fn(v);`)
      return
    case 'every':
      out.push(`if (!bindings[${index}].fn(v)) { everyResult = false; break outer; }`)
      return
    case 'some':
      out.push(`if (bindings[${index}].fn(v)) { someResult = true; break outer; }`)
      return
    case 'find':
      out.push(`if (bindings[${index}].fn(v)) { foundResult = v; break outer; }`)
      return
    case 'count':
      out.push(`if (bindings[${index}].fn(v)) countResult++;`)
      return
  }
}

function emitStreamSegment(seg: StreamSegment): string[] {
  const lines: string[] = ['{', 'const src = data;']
  for (const op of seg.ops) {
    if (op.kind === 'take') lines.push(`let take${op.index} = 0;`)
    else if (op.kind === 'drop') lines.push(`let drop${op.index} = 0;`)
    else if (op.kind === 'dropWhile') lines.push(`let dropWhileActive${op.index} = true;`)
    else if (op.kind === 'scan') lines.push(`let scanAcc${op.index} = bindings[${op.index}].a1;`)
  }

  const sink = seg.sink
  let result = 'out'
  if (!sink || sink.kind === 'toArray') {
    lines.push('const out = [];')
  } else if (sink.kind === 'reduce') {
    lines.push(`let acc = bindings[${sink.index}].a1;`)
    result = 'acc'
  } else if (sink.kind === 'forEach') {
    result = 'undefined'
  } else if (sink.kind === 'every') {
    lines.push('let everyResult = true;')
    result = 'everyResult'
  } else if (sink.kind === 'some') {
    lines.push('let someResult = false;')
    result = 'someResult'
  } else if (sink.kind === 'find') {
    lines.push('let foundResult = undefined;')
    result = 'foundResult'
  } else if (sink.kind === 'count') {
    lines.push('let countResult = 0;')
    result = 'countResult'
  }

  // scan emits its initial accumulator before any real element (array.ts's
  // scan: out[0] = init). Each scan position gets a one-shot do-while pass
  // walking the chain after it with the phantom value, run in descending
  // position order before the main loop -- a later scan's own phantom must
  // fire before an earlier scan's phantom reaches it (matches
  // interpret.ts's runScanArrayInits / lower.ts's ordering exactly).
  // `outer` labels the enclosing block, not the loop itself, so `break
  // outer` from inside a phantom pass skips the real loop entirely, while
  // unlabeled `continue` inside a pass (a do-while with a false condition)
  // just ends that pass and falls through to the next one.
  const scanPositions = seg.ops.filter((op) => op.kind === 'scan').map((op) => op.index)
  scanPositions.reverse()

  lines.push('outer: {')
  for (const index of scanPositions) {
    const pos = seg.ops.findIndex((op) => op.index === index)
    const initLines: string[] = [`let v = scanAcc${index};`]
    emitChain(seg.ops, pos + 1, sink, initLines)
    lines.push('do {', ...initLines, '} while (false);')
  }
  lines.push('for (let i = 0; i < src.length; i++) {')
  lines.push('let v = src[i];')
  emitChain(seg.ops, 0, sink, lines)
  lines.push('}')
  lines.push('}')
  lines.push(`data = ${result};`)
  lines.push('}')
  return lines
}

function emitBoundarySegment(seg: BoundarySegment): string[] {
  const { index, stepKind } = seg
  switch (stepKind) {
    case 'sort':
    case 'sortAsc':
      return ['data = __sortKernel.asc(data);']
    case 'sortDesc':
      return ['data = __sortKernel.desc(data);']
    case 'sortBy':
      return [`data = __sortKernel.by(data, bindings[${index}].fn);`]
    case 'reverse':
      return ['data = data.slice().reverse();']
    case 'uniq':
      return ['data = Array.from(new Set(data));']
    case 'without':
      return [
        '{',
        `const exclude = new Set(bindings[${index}].fn);`,
        'data = data.filter((x) => !exclude.has(x));',
        '}',
      ]
    case 'sum':
      return [
        '{',
        'let sumResult = 0;',
        'for (let i = 0; i < data.length; i++) sumResult += data[i];',
        'data = sumResult;',
        '}',
      ]
  }
}

/** Emits the body of a `(input, bindings) => data` function for the given pipeline description. */
export function emitPipeline(desc: PipelineDesc): string {
  const segments = segmentSteps(desc.steps)
  const lines: string[] = ['let data = input;']
  for (const seg of segments) {
    lines.push(...(seg.kind === 'stream' ? emitStreamSegment(seg) : emitBoundarySegment(seg)))
  }
  lines.push('return data;')
  return lines.join('\n')
}

export type EmittedRunner = (input: unknown, bindings: readonly EmitterBinding[]) => unknown

// Sort steps call the shared merge-sort kernel rather than emitting
// Array.prototype.sort: since the library tiers hand-write their sorts
// (sort-kernel.ts), comparator call traces are kernel-defined, and the
// fuzz oracle's exact-trace check requires the emitter to match. Passed as
// a parameter because new Function bodies can't reach module scope.
const __sortKernel = { asc: mergeSortAsc, desc: mergeSortDesc, by: mergeSortBy }

/** Compiles emitted source via `new Function`. Harness-only: never used outside benchmarks/. */
export function compileEmittedPipeline(desc: PipelineDesc): EmittedRunner {
  const body = emitPipeline(desc)
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const raw = new Function('input', 'bindings', '__sortKernel', body)
  return ((input, bindings) => raw(input, bindings, __sortKernel)) as EmittedRunner
}
