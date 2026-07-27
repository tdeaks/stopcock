// Reference interpreter: the semantic oracle for the Plan IR. Deliberately
// simple and clear, not fast — every other lowering (portable closures and
// the build compiler) must agree with this implementation's exact semantics.
// No caching, no code generation.
import {
  OP_COUNT,
  OP_DICT_IS_EMPTY,
  OP_DICT_KEYS,
  OP_DICT_VALUES,
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
  OP_GUARD_IS_ARRAY,
  OP_GUARD_IS_BOOLEAN,
  OP_GUARD_IS_FUNCTION,
  OP_GUARD_IS_NIL,
  OP_GUARD_IS_NUMBER,
  OP_GUARD_IS_OBJECT,
  OP_GUARD_IS_STRING,
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
  OP_ADJUST,
  OP_APERTURE,
  OP_CHUNK,
  OP_DIFFERENCE,
  OP_GROUP_BY,
  OP_INCLUDES,
  OP_INSERT,
  OP_INTERSECTION,
  OP_INTERSPERSE,
  OP_PARTITION,
  OP_REMOVE,
  OP_SLIDING_WINDOW,
  OP_SYMMETRIC_DIFFERENCE,
  OP_UNION,
  OP_UNIQ_BY,
  OP_UPDATE,
  OP_XPROD,
  OP_ZIP,
  OP_ZIP_WITH,
} from './opcodes'
import type { OpCode } from './registry'
// Cardinality comes from the compact fact table rather than the registry.
// The registry is 20 KB of names and descriptions for diagnostics, and this
// module is also compact fusion's executor, where those bytes are the whole
// budget. Nothing here needs a name.
import { CARD_SINK, compactCardinality } from './internal/compact/facts.generated'
// Materialising boundaries run as one whole-array call in every tier, so the
// interpreter calls the operator itself rather than keeping a second copy of
// it that could drift.
import {
  adjust,
  aperture,
  chunk,
  difference,
  groupBy,
  includes,
  insert,
  intersection,
  intersperse,
  partition,
  remove,
  slidingWindow,
  symmetricDifference,
  union,
  uniqBy,
  update,
  xprod,
  zip,
  zipWith,
} from './array'
import { mergeSortAsc, mergeSortBy, mergeSortDesc } from './sort-kernel'
import { type BoundPlan, type SegmentShape, type StepBinding } from './plan'
import { none as optionNone, some as optionSome } from './option'

const HALT = Symbol('interpret.halt')

function unsupportedOp(op: OpCode): never {
  // Numeric only: resolving the name would pull the registry back in.
  throw new Error(`interpret: unsupported op ${op}`)
}

function runBoundary(op: OpCode, binding: StepBinding, data: readonly unknown[]): unknown {
  switch (op) {
    case OP_SORT_BY:
    case OP_SORT_INLINE:
      return mergeSortBy(data, binding.fn as (a: unknown, b: unknown) => number)
    case OP_SORT:
      return mergeSortAsc(data as readonly number[])
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
      return data.slice().reverse()
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
      // Set has SameValueZero semantics, matching array.ts's without exactly.
      const exclude = new Set(binding.fn as readonly unknown[])
      return data.filter((x) => !exclude.has(x))
    }
    case OP_CHUNK:
      return (chunk as any)(data, binding.fn)
    case OP_SLIDING_WINDOW:
      return (slidingWindow as any)(data, binding.fn)
    case OP_APERTURE:
      return (aperture as any)(data, binding.fn)
    case OP_INTERSPERSE:
      return (intersperse as any)(data, binding.fn)
    case OP_UNIQ_BY:
      return (uniqBy as any)(data, binding.fn)
    case OP_GROUP_BY:
      return (groupBy as any)(data, binding.fn)
    case OP_PARTITION:
      return (partition as any)(data, binding.fn)
    case OP_ZIP:
      return (zip as any)(data, binding.fn)
    case OP_XPROD:
      return (xprod as any)(data, binding.fn)
    case OP_INTERSECTION:
      return (intersection as any)(data, binding.fn)
    case OP_UNION:
      return (union as any)(data, binding.fn)
    case OP_DIFFERENCE:
      return (difference as any)(data, binding.fn)
    case OP_SYMMETRIC_DIFFERENCE:
      return (symmetricDifference as any)(data, binding.fn)
    case OP_INCLUDES:
      return (includes as any)(data, binding.fn)
    case OP_ZIP_WITH:
      return (zipWith as any)(data, binding.fn, binding.a1)
    case OP_ADJUST:
      return (adjust as any)(data, binding.fn, binding.a1)
    case OP_UPDATE:
      return (update as any)(data, binding.fn, binding.a1)
    case OP_INSERT:
      return (insert as any)(data, binding.fn, binding.a1)
    case OP_REMOVE:
      return (remove as any)(data, binding.fn, binding.a1)
    default:
      return unsupportedOp(op)
  }
}

function runScalarSegment(
  codes: readonly OpCode[],
  bindings: readonly StepBinding[],
  seg: SegmentShape,
): (value: unknown) => unknown {
  return (value: unknown): unknown => {
    let v: unknown = value
    for (let i = 0; i < seg.length; i++) {
      const op = codes[seg.startIndex + i]
      const b = bindings[seg.startIndex + i]
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

interface SinkState {
  acc?: unknown
  every: boolean
  some: boolean
  none: boolean
  count: number
  found: unknown
  foundIndex: number
  index: number
}

function runStreamSegment(
  codes: readonly OpCode[],
  bindings: readonly StepBinding[],
  seg: SegmentShape,
  source: readonly unknown[],
): unknown {
  const start = seg.startIndex
  const len = seg.length
  const lastOp = codes[start + len - 1]
  const hasSink = compactCardinality(lastOp) === CARD_SINK
  const streamLen = hasSink ? len - 1 : len
  const sinkBinding = hasSink ? bindings[start + len - 1] : undefined

  const out: unknown[] = []
  const state: SinkState = {
    every: true,
    some: false,
    none: true,
    count: 0,
    found: undefined,
    foundIndex: -1,
    index: 0,
  }
  if (hasSink && lastOp === OP_REDUCE) state.acc = sinkBinding!.a1

  const takeCount = new Array<number>(streamLen).fill(0)
  const dropCount = new Array<number>(streamLen).fill(0)
  const dropWhileActive = new Array<boolean>(streamLen).fill(true)
  const scanAcc = new Array<unknown>(streamLen)
  for (let s = 0; s < streamLen; s++) {
    if (codes[start + s] === OP_SCAN) scanAcc[s] = bindings[start + s].a1
  }

  function emitFinal(value: unknown): void {
    if (!hasSink) {
      out.push(value)
      return
    }
    const fn = sinkBinding!.fn as (...args: unknown[]) => unknown
    switch (lastOp) {
      case OP_REDUCE:
        state.acc = fn(state.acc, value)
        return
      case OP_FOR_EACH:
        fn(value)
        return
      case OP_EVERY:
        if (!fn(value)) {
          state.every = false
          throw HALT
        }
        return
      case OP_SOME:
        if (fn(value)) {
          state.some = true
          throw HALT
        }
        return
      case OP_FIND:
        if (fn(value)) {
          state.found = value
          state.foundIndex = 0
          throw HALT
        }
        return
      case OP_FIND_MAP: {
        const mapped = fn(value)
        if (mapped != null) {
          state.found = mapped
          state.foundIndex = 0
          throw HALT
        }
        return
      }
      case OP_FIND_INDEX:
        if (fn(value)) {
          state.foundIndex = state.index
          throw HALT
        }
        state.index++
        return
      case OP_NONE:
        if (fn(value)) {
          state.none = false
          throw HALT
        }
        return
      case OP_COUNT:
        if (fn(value)) state.count++
        return
      default:
        unsupportedOp(lastOp)
    }
  }

  function processFrom(s: number, value: unknown): void {
    if (s >= streamLen) {
      emitFinal(value)
      return
    }
    const op = codes[start + s]
    const b = bindings[start + s]
    switch (op) {
      case OP_MAP:
        processFrom(s + 1, (b.fn as (v: unknown) => unknown)(value))
        return
      case OP_FILTER:
        if ((b.fn as (v: unknown) => boolean)(value)) processFrom(s + 1, value)
        return
      case OP_REJECT:
        if (!(b.fn as (v: unknown) => boolean)(value)) processFrom(s + 1, value)
        return
      case OP_FILTER_MAP: {
        const mapped = (b.fn as (v: unknown) => unknown)(value)
        if (mapped != null) processFrom(s + 1, mapped)
        return
      }
      case OP_MAP_WHILE: {
        const mapped = (b.fn as (v: unknown) => unknown)(value)
        if (mapped == null) throw HALT
        processFrom(s + 1, mapped)
        return
      }
      case OP_TAKE_UNTIL:
        if ((b.fn as (v: unknown) => boolean)(value)) throw HALT
        processFrom(s + 1, value)
        return
      case OP_TAKE:
        if (takeCount[s] >= (b.fn as number)) throw HALT
        takeCount[s]++
        processFrom(s + 1, value)
        return
      case OP_SCAN: {
        // Per-element update only; the initial accumulator (out[0]) is
        // emitted once, before any element, by the pre-pass below.
        const acc = (b.fn as (a: unknown, v: unknown) => unknown)(scanAcc[s], value)
        scanAcc[s] = acc
        processFrom(s + 1, acc)
        return
      }
      case OP_DROP:
        if (dropCount[s] < (b.fn as number)) {
          dropCount[s]++
          return
        }
        processFrom(s + 1, value)
        return
      case OP_TAKE_WHILE:
        if (!(b.fn as (v: unknown) => boolean)(value)) throw HALT
        processFrom(s + 1, value)
        return
      case OP_DROP_WHILE:
        if (dropWhileActive[s]) {
          if ((b.fn as (v: unknown) => boolean)(value)) return
          dropWhileActive[s] = false
        }
        processFrom(s + 1, value)
        return
      case OP_FLAT_MAP: {
        // The executor accepts arbitrary Iterables so the same control-flow
        // machinery can serve arrays and lazy Iter pipelines. A thrown HALT
        // unwinding through this for-of triggers IteratorClose on the inner
        // iterator without extra bookkeeping here.
        const items = (b.fn as (v: unknown) => Iterable<unknown>)(value)
        for (const inner of items) processFrom(s + 1, inner)
        return
      }
      default:
        unsupportedOp(op)
    }
  }

  // OP_SCAN emits its initial accumulator before any element is processed
  // (array.ts's scan: out[0] = init). Done here, once, in descending
  // position order: a later scan's own phantom must reach it before an
  // earlier scan's phantom does (true serial composition of two chained
  // scans has the second scan see the first's phantom as a regular input,
  // after its own phantom already fired). A halt during this pre-pass
  // (e.g. a downstream take(0)) means the whole segment is done before the
  // real source is ever touched.
  let scanHalted = false
  for (let s = streamLen - 1; s >= 0 && !scanHalted; s--) {
    if (codes[start + s] !== OP_SCAN) continue
    try {
      processFrom(s + 1, scanAcc[s])
    } catch (e) {
      if (e === HALT) scanHalted = true
      else throw e
    }
  }

  if (!scanHalted) {
    // Snapshot the length once. The canonical source-mutation contract is
    // snapshot-then-dense-index-read: a callback that shrinks the array still
    // sees one call per original index, and one that grows it sees no extra
    // calls. Re-reading `source.length` each iteration silently gave compact
    // different behaviour from optimized fusion and the compiler.
    const sourceLength = source.length
    outer: for (let i = 0; i < sourceLength; i++) {
      try {
        processFrom(0, source[i])
      } catch (e) {
        if (e === HALT) break outer
        throw e
      }
    }
  }

  if (!hasSink) return out
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

/**
 * Executes a Plan against a single input with exact semantics: left to
 * right per accepted item, dense array holes (read as undefined, callbacks
 * still run), preserved callback order/count, first thrown error
 * propagates, forward evaluation completes before any materializer runs.
 */
export function interpret(plan: BoundPlan, input: unknown): unknown {
  let data: unknown = input
  const { codes, segments } = plan.shape

  for (const seg of segments) {
    if (seg.kind === 'opaque') {
      const binding = plan.bindings[seg.startIndex]
      data = (binding.opaqueFn as (v: unknown) => unknown)(data)
      continue
    }
    if (seg.domain === 'scalar') {
      data = runScalarSegment(codes, plan.bindings, seg)(data)
      continue
    }
    if (seg.kind === 'boundary') {
      const op = codes[seg.startIndex]
      const binding = plan.bindings[seg.startIndex]
      data = runBoundary(op, binding, data as readonly unknown[])
      continue
    }
    data = runStreamSegment(codes, plan.bindings, seg, data as readonly unknown[])
  }

  return data
}
