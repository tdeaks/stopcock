// Shared control-flow lowering: turns a BoundPlan's shape into a portable
// executor built entirely from closure composition (no Function-to-string,
// no eval, no dynamic code). Structurally mirrors interpret.ts's exact
// semantics (the oracle) but compiles a per-segment closure chain once per
// invocation instead of switching on opcode per item, so hot loops call
// closures directly rather than re-dispatching.
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
  OP_MATH_ADD,
  OP_MATH_DEC,
  OP_MATH_DIVIDE,
  OP_MATH_INC,
  OP_MATH_MULTIPLY,
  OP_MATH_NEGATE,
  OP_MATH_SUBTRACT,
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
  OP_STR_IS_EMPTY,
  OP_STR_LENGTH,
  OP_STR_LOWER,
  OP_STR_SPLIT,
  OP_STR_TRIM,
  OP_STR_TRIM_END,
  OP_STR_TRIM_START,
  OP_STR_UPPER,
  OP_SCAN,
  OP_SUM,
  OP_TAIL,
  OP_TAKE,
  OP_TAKE_UNTIL,
  OP_TAKE_WHILE,
  OP_UNIQ_INLINE,
  OP_WITHOUT,
  OP_DICT_KEYS,
  OP_DICT_VALUES,
  OP_DICT_IS_EMPTY,
  OP_GUARD_IS_NUMBER,
  OP_GUARD_IS_STRING,
  OP_GUARD_IS_BOOLEAN,
  OP_GUARD_IS_NIL,
  OP_GUARD_IS_ARRAY,
  OP_GUARD_IS_OBJECT,
  OP_GUARD_IS_FUNCTION,
} from './opcodes'
import { type OpCode, requireOpMeta } from './registry'
import { mergeSortAsc, mergeSortBy, mergeSortDesc } from './sort-kernel'
import { type BoundPlan, type PlanShape, type SegmentShape, type StepBinding } from './plan'
import { ARRAY_TEMPLATES, SINK_TEMPLATES, type PortableTemplateFn } from './portable-templates'
import { none as optionNone, some as optionSome } from './option'

export const HALT = Symbol('lower.halt')

/** Segment-shape key -> template runner, for the direct (single-segment) lookup. */
const arrayTemplateByKey = new Map<string, PortableTemplateFn>()
for (const t of ARRAY_TEMPLATES) arrayTemplateByKey.set(t.key, t.run)
for (const t of SINK_TEMPLATES) arrayTemplateByKey.set(t.key, t.run)

/** Cross-segment key ("<op>>SUM") -> template runner, for stream-segment + SUM-boundary fusion. */
const sumFusionByKey = new Map<string, PortableTemplateFn>()
for (const t of SINK_TEMPLATES) if (t.kind === 'sum') sumFusionByKey.set(t.key, t.run)

function unsupportedOp(op: OpCode): never {
  throw new Error(`lower: unsupported op ${op} (${requireOpMeta(op).name})`)
}

// ConsumeMeta is only meaningful for the first segment in a shape --
// everything downstream reads from an already-realized intermediate array,
// not the caller's source. Re-exported from plan.ts, which also defines it
// for portable-templates.ts (avoiding a circular import between the two).
import type { ConsumeMeta } from './plan'
export type { ConsumeMeta }

/**
 * A lowered shape runner: reusable across BoundPlans sharing the same
 * PlanShape, taking the caller's bindings for that specific plan. Never
 * retains callbacks itself — bindings are threaded through per call. `meta`
 * is only ever populated by whichever runner sees the real source directly.
 */
export type PortableRunner = (
  input: unknown,
  bindings: readonly StepBinding[],
  meta?: ConsumeMeta,
) => unknown

function lengthOf(data: unknown): number {
  return Array.isArray(data) ? data.length : 1
}

function runBoundary(op: OpCode, binding: StepBinding, data: readonly unknown[]): unknown {
  switch (op) {
    case OP_SORT_BY:
    case OP_SORT_INLINE:
      return mergeSortBy(data, binding.fn as (a: unknown, b: unknown) => number)
    case OP_SORT:
    case OP_SORT_ASC:
      return mergeSortAsc(data as readonly number[])
    case OP_SORT_DESC:
      return mergeSortDesc(data as readonly number[])
    case OP_HEAD:
      return data.length === 0 ? optionNone : optionSome(data[0])
    case OP_LAST:
      return data.length === 0 ? optionNone : optionSome(data[data.length - 1])
    case OP_LENGTH:
      return data.length
    case OP_IS_EMPTY:
      return data.length === 0
    case OP_TAIL:
      return data.length <= 1 ? [] : data.slice(1)
    case OP_INIT:
      return data.length <= 1 ? [] : data.slice(0, -1)
    case OP_REVERSE:
      return (data as any).toReversed ? (data as any).toReversed() : data.slice().reverse()
    case OP_UNIQ_INLINE:
      return Array.from(new Set(data))
    case OP_JOIN:
      return (data as readonly string[]).join(binding.a1 as string)
    case OP_FLATTEN:
      return (data as readonly (readonly unknown[])[]).flat()
    case OP_SUM: {
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i] as number
      return sum
    }
    case OP_MIN: {
      if (data.length === 0) return optionNone
      let min = data[0] as number
      for (let i = 1; i < data.length; i++) if ((data[i] as number) < min) min = data[i] as number
      return optionSome(min)
    }
    case OP_MAX: {
      if (data.length === 0) return optionNone
      let max = data[0] as number
      for (let i = 1; i < data.length; i++) if ((data[i] as number) > max) max = data[i] as number
      return optionSome(max)
    }
    case OP_WITHOUT: {
      const exclude = new Set(binding.fn as readonly unknown[])
      return data.filter((x) => !exclude.has(x))
    }
    default:
      return unsupportedOp(op)
  }
}

export function lowerBoundarySegment(codes: readonly OpCode[], seg: SegmentShape): PortableRunner {
  const op = codes[seg.startIndex]
  const pos = seg.startIndex
  return (data, bindings, meta) => {
    if (meta) meta.consumed = lengthOf(data)
    return runBoundary(op, bindings[pos], data as readonly unknown[])
  }
}

export function lowerScalarSegment(codes: readonly OpCode[], seg: SegmentShape): PortableRunner {
  const start = seg.startIndex
  const len = seg.length
  const ops = codes.slice(start, start + len)
  return (value, bindings, meta) => {
    if (meta) meta.consumed = lengthOf(value)
    let v: unknown = value
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]
      const b = bindings[start + i]
      switch (op) {
        case OP_MATH_ADD:
          v = (v as number) + (b.fn as number)
          break
        case OP_MATH_SUBTRACT:
          v = (v as number) - (b.fn as number)
          break
        case OP_MATH_MULTIPLY:
          v = (v as number) * (b.fn as number)
          break
        case OP_MATH_DIVIDE:
          v = (v as number) / (b.fn as number)
          break
        case OP_MATH_NEGATE:
          v = -(v as number)
          break
        case OP_MATH_INC:
          v = (v as number) + 1
          break
        case OP_MATH_DEC:
          v = (v as number) - 1
          break
        case OP_STR_TRIM:
          v = (v as string).trim()
          break
        case OP_STR_LOWER:
          v = (v as string).toLowerCase()
          break
        case OP_STR_UPPER:
          v = (v as string).toUpperCase()
          break
        case OP_STR_TRIM_START:
          v = (v as string).trimStart()
          break
        case OP_STR_TRIM_END:
          v = (v as string).trimEnd()
          break
        case OP_STR_SPLIT:
          v = (v as string).split(b.fn as string)
          break
        case OP_STR_LENGTH:
          v = (v as string).length
          break
        case OP_STR_IS_EMPTY:
          v = v === ''
          break
        case OP_DICT_KEYS:
          v = Object.keys(v as object)
          break
        case OP_DICT_VALUES:
          v = Object.values(v as object)
          break
        case OP_DICT_IS_EMPTY:
          v = Object.keys(v as object).length === 0
          break
        case OP_GUARD_IS_NUMBER:
          v = typeof v === 'number'
          break
        case OP_GUARD_IS_STRING:
          v = typeof v === 'string'
          break
        case OP_GUARD_IS_BOOLEAN:
          v = typeof v === 'boolean'
          break
        case OP_GUARD_IS_NIL:
          v = v == null
          break
        case OP_GUARD_IS_ARRAY:
          v = Array.isArray(v)
          break
        case OP_GUARD_IS_OBJECT:
          v = typeof v === 'object' && v !== null && !Array.isArray(v)
          break
        case OP_GUARD_IS_FUNCTION:
          v = typeof v === 'function'
          break
        default:
          unsupportedOp(op)
      }
    }
    return v
  }
}

export interface SinkResult {
  push: (value: unknown) => void
  finish: () => unknown
}

/** Builds the terminal sink stage: fuses reduce/forEach/every/some/find/etc into the loop. */
export function buildSink(op: OpCode, b: StepBinding): SinkResult {
  const out: unknown[] = []
  let acc: unknown = op === OP_REDUCE ? b.a1 : undefined
  let every = true
  let some = false
  let none = true
  let count = 0
  let found: unknown
  let foundIndex = -1
  let index = 0
  const fn = b.fn as (...args: unknown[]) => unknown

  const push = (value: unknown): void => {
    switch (op) {
      case OP_REDUCE:
        acc = fn(acc, value)
        return
      case OP_FOR_EACH:
        fn(value)
        return
      case OP_EVERY:
        if (!fn(value)) {
          every = false
          throw HALT
        }
        return
      case OP_SOME:
        if (fn(value)) {
          some = true
          throw HALT
        }
        return
      case OP_FIND:
        if (fn(value)) {
          found = value
          foundIndex = 0
          throw HALT
        }
        return
      case OP_FIND_MAP: {
        const mapped = fn(value)
        if (mapped != null) {
          found = mapped
          foundIndex = 0
          throw HALT
        }
        return
      }
      case OP_FIND_INDEX:
        if (fn(value)) {
          foundIndex = index
          throw HALT
        }
        index++
        return
      case OP_NONE:
        if (fn(value)) {
          none = false
          throw HALT
        }
        return
      case OP_COUNT:
        if (fn(value)) count++
        return
      default:
        unsupportedOp(op)
    }
  }

  const finish = (): unknown => {
    switch (op) {
      case OP_REDUCE:
        return acc
      case OP_FOR_EACH:
        return undefined
      case OP_EVERY:
        return every
      case OP_SOME:
        return some
      case OP_FIND:
        return foundIndex === -1 ? optionNone : optionSome(found)
      case OP_FIND_MAP:
        return foundIndex === -1 ? optionNone : optionSome(found)
      case OP_FIND_INDEX:
        return foundIndex === -1 ? optionNone : optionSome(foundIndex)
      case OP_NONE:
        return none
      case OP_COUNT:
        return count
      default:
        return unsupportedOp(op)
    }
  }

  return { push, finish }
}

// Shared, never-mutated stand-ins for take/drop/dropWhile state when a
// segment has none of those ops, so a call doesn't pay for arrays it will
// never index into (the op that would read them can't occur).
const EMPTY_NUMBERS: number[] = []
const EMPTY_BOOLEANS: boolean[] = []
const EMPTY_UNKNOWNS: unknown[] = []

/** Per-call mutable state for the generic stream interpreter: one instance per invocation, shape fixed across calls so V8 keeps a stable hidden class. */
interface StreamState {
  out: unknown[]
  acc: unknown
  every: boolean
  some: boolean
  none: boolean
  count: number
  found: unknown
  foundIndex: number
  index: number
  readonly takeCount: number[]
  readonly dropCount: number[]
  readonly dropWhileActive: boolean[]
  readonly scanAcc: unknown[]
}

/**
 * Fused switch interpreter, built once per segment shape (not per call) so
 * `advance`/`emitFinal` stay the same function objects across every
 * invocation and can actually get JIT-optimized instead of being
 * reinterpreted from scratch each call. One loop over the source; `advance`
 * walks the segment's stages via a switch on opcode, looping stage-to-stage
 * in place and only recursing at a flatMap fan-out (bounded by segment
 * length, never by data size), so early exit through nested flatMaps is a
 * plain boolean return ("halted") instead of a thrown HALT. All per-stage
 * state (take/drop counters, dropWhile flags, sink accumulator) lives on
 * the call's StreamState, indexed by stage -- no per-stage closures.
 * Mirrors interpret.ts's runStreamSegment exactly (the oracle), swapping
 * its throw-based unwind for the same boolean-return propagation.
 *
 * `codes` and `bindings` are frozen (Object.freeze in plan.ts), which
 * downgrades them to a slow, non-fast-path elements kind in V8/JSC --
 * fine for the old per-stage closures (each binding read once, at
 * construction) but disastrous for a switch interpreter that re-reads
 * `codes[start+s]`/`bindings[start+s]` on every stage of every element.
 * So `ops` (opcodes) is copied into a plain array once per segment, and
 * `fns` (the per-stage bound callback/scalar) once per call, and the hot
 * loop only ever indexes those.
 */
interface StageMachine {
  readonly ops: readonly OpCode[]
  readonly hasTake: boolean
  readonly hasDrop: boolean
  readonly hasDropWhile: boolean
  /** Positions of array-domain OP_SCAN stages, descending. Empty when none. */
  readonly scanArrayPositions: readonly number[]
  /** Advances one element through stages [s..streamLen). Returns true when
   * downstream signals early exit (take/takeWhile/takeUntil satisfied, or
   * the sink itself halting). */
  readonly advance: (
    fns: readonly unknown[],
    sinkFn: ((...args: unknown[]) => unknown) | undefined,
    state: StreamState,
    s: number,
    value: unknown,
  ) => boolean
}

/** Builds the shared per-stage switch (advance/emitFinal) once per segment
 * shape, mirroring interpret.ts's runStreamSegment. See StageMachine's doc
 * comment for why this is factored out of buildGenericStreamRunner. */
function buildStageMachine(
  codes: readonly OpCode[],
  start: number,
  streamLen: number,
  hasSink: boolean,
  lastOp: OpCode,
): StageMachine {
  const ops: OpCode[] = new Array(streamLen)
  let hasTake = false
  let hasDrop = false
  let hasDropWhile = false
  const scanArrayPositions: number[] = []
  for (let s = 0; s < streamLen; s++) {
    const op = codes[start + s]
    ops[s] = op
    if (op === OP_TAKE) hasTake = true
    else if (op === OP_DROP) hasDrop = true
    else if (op === OP_DROP_WHILE) hasDropWhile = true
    else if (op === OP_SCAN) scanArrayPositions.unshift(s)
  }

  // Returns true when the whole element loop should stop (early exit).
  function emitFinal(
    sinkFn: ((...args: unknown[]) => unknown) | undefined,
    state: StreamState,
    value: unknown,
  ): boolean {
    if (!hasSink) {
      state.out.push(value)
      return false
    }
    const fn = sinkFn!
    switch (lastOp) {
      case OP_REDUCE:
        state.acc = fn(state.acc, value)
        return false
      case OP_FOR_EACH:
        fn(value)
        return false
      case OP_EVERY:
        if (!fn(value)) {
          state.every = false
          return true
        }
        return false
      case OP_SOME:
        if (fn(value)) {
          state.some = true
          return true
        }
        return false
      case OP_FIND:
        if (fn(value)) {
          state.found = value
          state.foundIndex = 0
          return true
        }
        return false
      case OP_FIND_MAP: {
        const mapped = fn(value)
        if (mapped != null) {
          state.found = mapped
          state.foundIndex = 0
          return true
        }
        return false
      }
      case OP_FIND_INDEX:
        if (fn(value)) {
          state.foundIndex = state.index
          return true
        }
        state.index++
        return false
      case OP_NONE:
        if (fn(value)) {
          state.none = false
          return true
        }
        return false
      case OP_COUNT:
        if (fn(value)) state.count++
        return false
      default:
        return unsupportedOp(lastOp)
    }
  }

  // Advances one element through stages [s..streamLen). Loops in place for
  // ordinary stages; only recurses when flatMap fans an element out into
  // several downstream elements. Returns true when downstream signals early
  // exit. `fns` is a plain per-call array (see buildGenericStreamRunner's
  // doc comment for why it isn't read straight out of `bindings`).
  function advance(
    fns: readonly unknown[],
    sinkFn: ((...args: unknown[]) => unknown) | undefined,
    state: StreamState,
    s: number,
    value: unknown,
  ): boolean {
    for (;;) {
      if (s >= streamLen) return emitFinal(sinkFn, state, value)
      const op = ops[s]
      const fn = fns[s]
      switch (op) {
        case OP_MAP:
          value = (fn as (v: unknown) => unknown)(value)
          s++
          continue
        case OP_FILTER:
          if (!(fn as (v: unknown) => boolean)(value)) return false
          s++
          continue
        case OP_REJECT:
          if ((fn as (v: unknown) => boolean)(value)) return false
          s++
          continue
        case OP_FILTER_MAP: {
          const mapped = (fn as (v: unknown) => unknown)(value)
          if (mapped == null) return false
          value = mapped
          s++
          continue
        }
        case OP_MAP_WHILE: {
          const mapped = (fn as (v: unknown) => unknown)(value)
          if (mapped == null) return true
          value = mapped
          s++
          continue
        }
        case OP_TAKE_UNTIL:
          if ((fn as (v: unknown) => boolean)(value)) return true
          s++
          continue
        case OP_TAKE:
          if (state.takeCount[s] >= (fn as number)) return true
          state.takeCount[s]++
          s++
          continue
        case OP_SCAN: {
          // Per-element update only; the initial accumulator is emitted
          // once, before any element, by runScanArrayInits below.
          const acc = (fn as (a: unknown, v: unknown) => unknown)(state.scanAcc[s], value)
          state.scanAcc[s] = acc
          value = acc
          s++
          continue
        }
        case OP_DROP:
          if (state.dropCount[s] < (fn as number)) {
            state.dropCount[s]++
            return false
          }
          s++
          continue
        case OP_TAKE_WHILE:
          if (!(fn as (v: unknown) => boolean)(value)) return true
          s++
          continue
        case OP_DROP_WHILE:
          if (state.dropWhileActive[s]) {
            if ((fn as (v: unknown) => boolean)(value)) return false
            state.dropWhileActive[s] = false
          }
          s++
          continue
        case OP_FLAT_MAP: {
          // Iterable, not array-indexed — see interpret.ts's OP_FLAT_MAP
          // comment. `return true` from inside this for-of triggers
          // IteratorClose on `items` automatically.
          const items = (fn as (v: unknown) => Iterable<unknown>)(value)
          for (const inner of items) {
            if (advance(fns, sinkFn, state, s + 1, inner)) return true
          }
          return false
        }
        default:
          return unsupportedOp(op)
      }
    }
  }

  return { ops, hasTake, hasDrop, hasDropWhile, scanArrayPositions, advance }
}

/**
 * Emits each OP_SCAN stage's initial accumulator before any real element is
 * processed (array.ts's scan: out[0] = init), in descending stage-position
 * order -- see interpret.ts's runStreamSegment for why order matters when
 * two scans are chained. Returns true when a downstream op halts during this
 * pre-pass (e.g. a take(0) after the scan), meaning the caller's main loop
 * over the real source must not run at all.
 */
function runScanArrayInits(
  machine: StageMachine,
  fns: readonly unknown[],
  sinkFn: ((...args: unknown[]) => unknown) | undefined,
  state: StreamState,
): boolean {
  for (const s of machine.scanArrayPositions) {
    if (machine.advance(fns, sinkFn, state, s + 1, state.scanAcc[s])) return true
  }
  return false
}

function finishSink(hasSink: boolean, lastOp: OpCode, state: StreamState): unknown {
  if (!hasSink) return state.out
  switch (lastOp) {
    case OP_REDUCE:
      return state.acc
    case OP_FOR_EACH:
      return undefined
    case OP_EVERY:
      return state.every
    case OP_SOME:
      return state.some
    case OP_FIND:
      return state.foundIndex === -1 ? optionNone : optionSome(state.found)
    case OP_FIND_MAP:
      return state.foundIndex === -1 ? optionNone : optionSome(state.found)
    case OP_FIND_INDEX:
      return state.foundIndex === -1 ? optionNone : optionSome(state.foundIndex)
    case OP_NONE:
      return state.none
    case OP_COUNT:
      return state.count
    default:
      return unsupportedOp(lastOp)
  }
}

function makeStreamState(
  streamLen: number,
  hasSink: boolean,
  lastOp: OpCode,
  machine: StageMachine,
  bindings: readonly StepBinding[],
  start: number,
): StreamState {
  const needsScanAcc = machine.scanArrayPositions.length > 0
  const scanAcc: unknown[] = needsScanAcc ? new Array(streamLen) : EMPTY_UNKNOWNS
  if (needsScanAcc) {
    for (let s = 0; s < streamLen; s++) {
      if (machine.ops[s] === OP_SCAN) scanAcc[s] = bindings[start + s].a1
    }
  }
  return {
    out: [],
    acc: hasSink && lastOp === OP_REDUCE ? bindings[start + streamLen].a1 : undefined,
    every: true,
    some: false,
    none: true,
    count: 0,
    found: undefined,
    foundIndex: -1,
    index: 0,
    takeCount: machine.hasTake ? new Array<number>(streamLen).fill(0) : EMPTY_NUMBERS,
    dropCount: machine.hasDrop ? new Array<number>(streamLen).fill(0) : EMPTY_NUMBERS,
    dropWhileActive: machine.hasDropWhile
      ? new Array<boolean>(streamLen).fill(true)
      : EMPTY_BOOLEANS,
    scanAcc,
  }
}

function buildGenericStreamRunner(
  codes: readonly OpCode[],
  start: number,
  streamLen: number,
  hasSink: boolean,
  lastOp: OpCode,
): PortableRunner {
  const machine = buildStageMachine(codes, start, streamLen, hasSink, lastOp)

  return (source, bindings, meta) => {
    const src = source as readonly unknown[]
    // Public array operators snapshot length before invoking callbacks.
    // Preserve that boundary for generic fused shapes and keep the property
    // load out of the loop condition.
    const sourceLength = src.length
    const fns: unknown[] = new Array(streamLen)
    for (let s = 0; s < streamLen; s++) fns[s] = bindings[start + s].fn
    const sinkFn = hasSink
      ? (bindings[start + streamLen].fn as (...args: unknown[]) => unknown)
      : undefined
    const state = makeStreamState(streamLen, hasSink, lastOp, machine, bindings, start)

    // `i` is hoisted out of the loop so its final value (elements actually
    // read from `src`, the true source) can be reported back through `meta`
    // -- take(1) over a huge array must credit 1, not src.length.
    let i = 0
    if (
      machine.scanArrayPositions.length === 0 ||
      !runScanArrayInits(machine, fns, sinkFn, state)
    ) {
      for (; i < sourceLength; i++) {
        if (machine.advance(fns, sinkFn, state, 0, src[i])) {
          i++
          break
        }
      }
    }
    if (meta) meta.consumed = i

    return finishSink(hasSink, lastOp, state)
  }
}

function lowerStreamSegment(codes: readonly OpCode[], seg: SegmentShape): PortableRunner {
  const start = seg.startIndex
  const len = seg.length
  const lastOp = codes[start + len - 1]
  const lastMeta = requireOpMeta(lastOp)
  const hasSink = lastMeta.cardinality === 'sink'
  const streamLen = hasSink ? len - 1 : len

  const templateKey = codes.slice(start, start + len).join(',')
  const template = arrayTemplateByKey.get(templateKey)
  if (template) {
    const isTake = codes[start + len - 1] === OP_TAKE
    return (source, bindings, meta) => {
      // Default to the up-front source-length snapshot. Take-limited and
      // short-circuit sink templates overwrite this with their exact count
      // on early exit; full traversals leave the default intact.
      if (meta) meta.consumed = lengthOf(source)
      const limit = isTake ? (bindings[start + len - 1].fn as number) : -1
      return template(source as readonly unknown[], bindings, start, limit, meta)
    }
  }

  return buildGenericStreamRunner(codes, start, streamLen, hasSink, lastOp)
}

export function lowerSegment(codes: readonly OpCode[], seg: SegmentShape): PortableRunner {
  if (seg.kind === 'opaque') {
    return (data, bindings, meta) => {
      if (meta) meta.consumed = lengthOf(data)
      return (bindings[seg.startIndex].opaqueFn as (v: unknown) => unknown)(data)
    }
  }
  if (seg.domain === 'scalar') return lowerScalarSegment(codes, seg)
  if (seg.kind === 'boundary') return lowerBoundarySegment(codes, seg)
  return lowerStreamSegment(codes, seg)
}

/** True when the given stream segment is a bare single-op chain (no take, no sink) eligible for cross-segment sum fusion. */
function isBareSingleOpSegment(codes: readonly OpCode[], seg: SegmentShape): boolean {
  if (seg.kind !== 'stream' || seg.length !== 1) return false
  const op = codes[seg.startIndex]
  return requireOpMeta(op).cardinality !== 'sink' && op !== OP_TAKE && op !== OP_SCAN
}

/** Executor kind actually used for a segment, or a fused pair: 'template' when a checked-in fused-loop template exists, 'generic' otherwise. Mirrors the lookup performed by lowerSegment/lowerShape. */
export function segmentExecutorKinds(shape: PlanShape): readonly ('template' | 'generic')[] {
  const { codes, segments } = shape
  const kinds: ('template' | 'generic')[] = []
  let i = 0
  while (i < segments.length) {
    const seg = segments[i]
    const next = segments[i + 1]
    if (
      next &&
      isBareSingleOpSegment(codes, seg) &&
      next.kind === 'boundary' &&
      codes[next.startIndex] === OP_SUM &&
      sumFusionByKey.has(`${codes[seg.startIndex]}>SUM`)
    ) {
      kinds.push('template', 'template')
      i += 2
      continue
    }
    if (seg.kind === 'stream') {
      const key = codes.slice(seg.startIndex, seg.startIndex + seg.length).join(',')
      kinds.push(arrayTemplateByKey.has(key) ? 'template' : 'generic')
    } else {
      kinds.push('generic')
    }
    i++
  }
  return kinds
}

/**
 * Lowers a PlanShape into one portable runner: a chain of segment executors
 * built once from closures, with explicit materialization boundaries at
 * join/reverse/sort/regrouping and no dynamic code anywhere. Adjacent
 * stream+SUM-boundary segments matching a checked-in template are fused
 * into a single pass before falling back to per-segment lowering.
 */
export function lowerShape(shape: PlanShape): PortableRunner {
  const { codes, segments } = shape
  const runners: PortableRunner[] = []
  let i = 0
  while (i < segments.length) {
    const seg = segments[i]
    const next = segments[i + 1]
    if (
      next &&
      isBareSingleOpSegment(codes, seg) &&
      next.kind === 'boundary' &&
      codes[next.startIndex] === OP_SUM
    ) {
      const fused = sumFusionByKey.get(`${codes[seg.startIndex]}>SUM`)
      if (fused) {
        const bindStart = seg.startIndex
        runners.push((data, bindings, meta) => {
          if (meta) meta.consumed = lengthOf(data)
          return fused(data as readonly unknown[], bindings, bindStart, -1)
        })
        i += 2
        continue
      }
    }
    runners.push(lowerSegment(codes, seg))
    i++
  }
  // The overwhelmingly common fused shape is one segment. Returning its
  // executor directly removes an otherwise permanent wrapper loop and call
  // from every compiled invocation, which matters most for early exits that
  // inspect only a handful of values.
  if (runners.length === 1) return runners[0]
  // Keep common boundary-heavy shapes monomorphic too. A generic loop here
  // makes V8/JSC load the next executor from an array at every materialization
  // boundary, even though the runner count is fixed for the lifetime of the
  // compiled shape.
  if (runners.length === 2) {
    const run0 = runners[0]
    const run1 = runners[1]
    return (input, bindings, meta) =>
      run1(run0(input, bindings, meta), bindings)
  }
  if (runners.length === 3) {
    const run0 = runners[0]
    const run1 = runners[1]
    const run2 = runners[2]
    return (input, bindings, meta) =>
      run2(run1(run0(input, bindings, meta), bindings), bindings)
  }
  if (runners.length === 4) {
    const run0 = runners[0]
    const run1 = runners[1]
    const run2 = runners[2]
    const run3 = runners[3]
    return (input, bindings, meta) =>
      run3(
        run2(run1(run0(input, bindings, meta), bindings), bindings),
        bindings,
      )
  }
  return (input, bindings, meta) => {
    let data: unknown = input
    for (let i = 0; i < runners.length; i++)
      data = runners[i](data, bindings, i === 0 ? meta : undefined)
    return data
  }
}

export function lowerPlan(plan: BoundPlan): (input: unknown) => unknown {
  const runner = lowerShape(plan.shape)
  return (input) => runner(input, plan.bindings)
}
