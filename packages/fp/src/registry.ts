// Canonical operation registry: one entry per opcode in opcodes.ts.
// This is the single source of truth the Plan IR (plan.ts) and the
// reference interpreter (interpret.ts) are driven from.
import * as OpCodes from './opcodes'
import { OP_CODES, OP_NON_FUSEABLE } from './opcodes'

export type OpCode = number

export type OpDomain = 'array' | 'scalar' | 'iterable'

export type OpCardinality =
  | 'one-to-one' // exactly one output per accepted input, same domain
  | 'filtering' // zero or one output per accepted input
  | 'expanding' // zero or many outputs per accepted input
  | 'stateful' // carries running state across items (take/drop/while family)
  | 'sink' // terminal, consumes the stream and returns a scalar/void
  | 'materializer' // operates on the fully materialized array, not per-item

export type ArgBinding = 'fn' | 'a1' | 'a2'

export interface OpMeta {
  readonly op: OpCode
  readonly name: string
  readonly inputDomain: OpDomain
  readonly outputDomain: OpDomain
  readonly cardinality: OpCardinality
  /** Number of user-supplied callback arguments the op invokes (0, 1, or 2). */
  readonly callbackArity: 0 | 1 | 2
  /** Which tagged-fn slots (_fn/_a1/_a2) are bound and in what role. */
  readonly bindings: readonly ArgBinding[]
  /** True when the op can stop consuming input before the source is exhausted. */
  readonly earlyTermination: boolean
  /** True when the op preserves the input array's constructor (e.g. typed arrays). */
  readonly constructorPreserving: boolean
  /** Dense semantics: holes read as undefined and the callback still runs. Always true. */
  readonly denseHoles: true
  /** True when running the op backwards over the same input yields the same result set. */
  readonly reverseSafe: boolean
  /** Exact (left-to-right, no elision) lowering is always permitted. */
  readonly exactLowering: true
  /** Pure-mode lowering may reorder/eliminate/reassociate this op. */
  readonly pureLowering: boolean
  readonly simdEligible: boolean
  readonly workerEligible: boolean
  /** True when this op forces a segment boundary in the Plan IR. */
  readonly isMaterializationBoundary: boolean
}

function meta(partial: {
  op: OpCode
  name: string
  inputDomain: OpDomain
  outputDomain: OpDomain
  cardinality: OpCardinality
  callbackArity: 0 | 1 | 2
  bindings: readonly ArgBinding[]
  earlyTermination?: boolean
  constructorPreserving?: boolean
  reverseSafe?: boolean
  pureLowering?: boolean
  simdEligible?: boolean
  workerEligible?: boolean
}): OpMeta {
  const cardinality = partial.cardinality
  return {
    op: partial.op,
    name: partial.name,
    inputDomain: partial.inputDomain,
    outputDomain: partial.outputDomain,
    cardinality,
    callbackArity: partial.callbackArity,
    bindings: partial.bindings,
    earlyTermination: partial.earlyTermination ?? false,
    constructorPreserving: partial.constructorPreserving ?? false,
    denseHoles: true,
    reverseSafe: partial.reverseSafe ?? cardinality !== 'stateful',
    exactLowering: true,
    pureLowering: partial.pureLowering ?? true,
    simdEligible: partial.simdEligible ?? false,
    workerEligible: partial.workerEligible ?? false,
    isMaterializationBoundary: cardinality === 'materializer' || cardinality === 'sink',
  }
}

const REGISTRY: ReadonlyMap<OpCode, OpMeta> = new Map(
  (
    [
      // Fuseable stream ops
      meta({
        op: OpCodes.OP_MAP,
        name: 'map',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'one-to-one',
        callbackArity: 1,
        bindings: ['fn'],
        constructorPreserving: true,
      }),
      meta({
        op: OpCodes.OP_FILTER,
        name: 'filter',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'filtering',
        callbackArity: 1,
        bindings: ['fn'],
        constructorPreserving: true,
      }),
      meta({
        op: OpCodes.OP_TAKE,
        name: 'take',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'stateful',
        callbackArity: 0,
        bindings: ['fn'],
        earlyTermination: true,
        constructorPreserving: true,
      }),
      meta({
        op: OpCodes.OP_DROP,
        name: 'drop',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'stateful',
        callbackArity: 0,
        bindings: ['fn'],
        constructorPreserving: true,
      }),
      meta({
        op: OpCodes.OP_TAKE_WHILE,
        name: 'takeWhile',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'stateful',
        callbackArity: 1,
        bindings: ['fn'],
        earlyTermination: true,
        constructorPreserving: true,
      }),
      meta({
        op: OpCodes.OP_DROP_WHILE,
        name: 'dropWhile',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'stateful',
        callbackArity: 1,
        bindings: ['fn'],
        constructorPreserving: true,
      }),
      meta({
        op: OpCodes.OP_FLAT_MAP,
        name: 'flatMap',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'expanding',
        callbackArity: 1,
        bindings: ['fn'],
        earlyTermination: true,
        reverseSafe: false,
      }),

      // Fuseable terminal ops (sinks)
      meta({
        op: OpCodes.OP_REDUCE,
        name: 'reduce',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'sink',
        callbackArity: 2,
        bindings: ['fn', 'a1'],
        reverseSafe: false,
        pureLowering: false,
      }),
      meta({
        op: OpCodes.OP_FOR_EACH,
        name: 'forEach',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'sink',
        callbackArity: 1,
        bindings: ['fn'],
        pureLowering: false,
      }),
      meta({
        op: OpCodes.OP_EVERY,
        name: 'every',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'sink',
        callbackArity: 1,
        bindings: ['fn'],
        earlyTermination: true,
      }),
      meta({
        op: OpCodes.OP_SOME,
        name: 'some',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'sink',
        callbackArity: 1,
        bindings: ['fn'],
        earlyTermination: true,
      }),
      meta({
        op: OpCodes.OP_FIND,
        name: 'find',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'sink',
        callbackArity: 1,
        bindings: ['fn'],
        earlyTermination: true,
      }),
      meta({
        op: OpCodes.OP_FIND_INDEX,
        name: 'findIndex',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'sink',
        callbackArity: 1,
        bindings: ['fn'],
        earlyTermination: true,
        reverseSafe: false,
      }),

      // Fuseable stream ops (extended)
      meta({
        op: OpCodes.OP_FILTER_MAP,
        name: 'filterMap',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'filtering',
        callbackArity: 1,
        bindings: ['fn'],
      }),
      meta({
        op: OpCodes.OP_MAP_WHILE,
        name: 'mapWhile',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'stateful',
        callbackArity: 1,
        bindings: ['fn'],
        earlyTermination: true,
      }),
      meta({
        op: OpCodes.OP_REJECT,
        name: 'reject',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'filtering',
        callbackArity: 1,
        bindings: ['fn'],
        constructorPreserving: true,
      }),
      meta({
        op: OpCodes.OP_TAKE_UNTIL,
        name: 'takeUntil',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'stateful',
        callbackArity: 1,
        bindings: ['fn'],
        earlyTermination: true,
      }),

      // Fuseable terminal ops (extended)
      meta({
        op: OpCodes.OP_NONE,
        name: 'none',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'sink',
        callbackArity: 1,
        bindings: ['fn'],
        earlyTermination: true,
      }),
      meta({
        op: OpCodes.OP_COUNT,
        name: 'count',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'sink',
        callbackArity: 1,
        bindings: ['fn'],
      }),
      meta({
        op: OpCodes.OP_FIND_MAP,
        name: 'findMap',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'sink',
        callbackArity: 1,
        bindings: ['fn'],
        earlyTermination: true,
        reverseSafe: false,
      }),

      // Non-fuseable but recognized (materialization boundaries)
      meta({
        op: OpCodes.OP_SORT_BY,
        name: 'sortBy',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'materializer',
        callbackArity: 1,
        bindings: ['fn'],
        constructorPreserving: true,
        pureLowering: true,
      }),
      meta({
        op: OpCodes.OP_SORT,
        name: 'sort',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
        constructorPreserving: true,
      }),

      // Accessor terminal ops (operate on the completed result, not per-element)
      meta({
        op: OpCodes.OP_HEAD,
        name: 'head',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_LAST,
        name: 'last',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_LENGTH,
        name: 'length',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_IS_EMPTY,
        name: 'isEmpty',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_TAIL,
        name: 'tail',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
        constructorPreserving: true,
      }),
      meta({
        op: OpCodes.OP_INIT,
        name: 'init',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
        constructorPreserving: true,
      }),
      meta({
        op: OpCodes.OP_REVERSE,
        name: 'reverse',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
        constructorPreserving: true,
      }),
      meta({
        op: OpCodes.OP_SORT_INLINE,
        name: 'sortInline',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'materializer',
        callbackArity: 1,
        bindings: ['fn'],
        constructorPreserving: true,
      }),
      meta({
        op: OpCodes.OP_UNIQ_INLINE,
        name: 'uniq',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_JOIN,
        name: 'join',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: ['a1'],
      }),
      meta({
        op: OpCodes.OP_FLATTEN,
        name: 'flatten',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_SUM,
        name: 'sum',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
        simdEligible: true,
        workerEligible: true,
      }),
      meta({
        op: OpCodes.OP_MIN,
        name: 'min',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
        simdEligible: true,
        workerEligible: true,
      }),
      meta({
        op: OpCodes.OP_MAX,
        name: 'max',
        inputDomain: 'array',
        outputDomain: 'scalar',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
        simdEligible: true,
        workerEligible: true,
      }),

      // String accessor ops (transforms on string values, no callback)
      meta({
        op: OpCodes.OP_STR_TRIM,
        name: 'trim',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_STR_LOWER,
        name: 'toLowerCase',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_STR_UPPER,
        name: 'toUpperCase',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_STR_TRIM_START,
        name: 'trimStart',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_STR_TRIM_END,
        name: 'trimEnd',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_STR_SPLIT,
        name: 'split',
        inputDomain: 'scalar',
        outputDomain: 'array',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: ['a1'],
      }),
      meta({
        op: OpCodes.OP_STR_LENGTH,
        name: 'strLength',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_STR_IS_EMPTY,
        name: 'strIsEmpty',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),

      // Dict accessor ops
      meta({
        op: OpCodes.OP_DICT_KEYS,
        name: 'keys',
        inputDomain: 'scalar',
        outputDomain: 'array',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_DICT_VALUES,
        name: 'values',
        inputDomain: 'scalar',
        outputDomain: 'array',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_DICT_IS_EMPTY,
        name: 'dictIsEmpty',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),

      // Math stream ops (inline arithmetic, no callback)
      meta({
        op: OpCodes.OP_MATH_ADD,
        name: 'add',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: ['a1'],
        simdEligible: true,
        workerEligible: true,
      }),
      meta({
        op: OpCodes.OP_MATH_SUBTRACT,
        name: 'subtract',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: ['a1'],
        simdEligible: true,
        workerEligible: true,
      }),
      meta({
        op: OpCodes.OP_MATH_MULTIPLY,
        name: 'multiply',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: ['a1'],
        simdEligible: true,
        workerEligible: true,
      }),
      meta({
        op: OpCodes.OP_MATH_DIVIDE,
        name: 'divide',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: ['a1'],
        simdEligible: true,
        workerEligible: true,
      }),
      meta({
        op: OpCodes.OP_MATH_NEGATE,
        name: 'negate',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
        simdEligible: true,
        workerEligible: true,
      }),
      meta({
        op: OpCodes.OP_MATH_INC,
        name: 'inc',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
        simdEligible: true,
        workerEligible: true,
      }),
      meta({
        op: OpCodes.OP_MATH_DEC,
        name: 'dec',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
        simdEligible: true,
        workerEligible: true,
      }),

      // Guard predicate ops (inline typeof checks). Standalone in a scalar
      // chain they transform the value to a boolean; inlined inside filter
      // or reject they act as the predicate directly (see fuse.ts).
      meta({
        op: OpCodes.OP_GUARD_IS_NUMBER,
        name: 'isNumber',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_GUARD_IS_STRING,
        name: 'isString',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_GUARD_IS_BOOLEAN,
        name: 'isBoolean',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_GUARD_IS_NIL,
        name: 'isNil',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_GUARD_IS_ARRAY,
        name: 'isArray',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_GUARD_IS_OBJECT,
        name: 'isObject',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_GUARD_IS_FUNCTION,
        name: 'isFunction',
        inputDomain: 'scalar',
        outputDomain: 'scalar',
        cardinality: 'one-to-one',
        callbackArity: 0,
        bindings: [],
      }),

      // Sort specialization
      meta({
        op: OpCodes.OP_SORT_ASC,
        name: 'sortAsc',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
      }),
      meta({
        op: OpCodes.OP_SORT_DESC,
        name: 'sortDesc',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: [],
      }),

      // Stream-dialect ops. The previous plan (M3) skipped this decision;
      // both behaviors are preserved via distinct opcodes. Signed off
      // 2026-07-21 (see docs/superpowers/plans/
      // 2026-07-21-stopcock-fp-tiered-execution-implementation.md, W5):
      //   - take: the array Plan IR's OP_TAKE checks its quota *before*
      //     processing the next upstream item, so one extra upstream
      //     callback fires (on the item that trips the quota) before the
      //     halt is detected — see pipe-fusion.test.ts. OP_TAKE_STREAM stops
      //     the source immediately after the quota-filling item itself: no
      //     extra upstream callback.
      //   - scan: array.ts's scan (codegen/dual-inline.ts output) emits the
      //     initial accumulator as output[0] (length n+1 for n inputs).
      //     OP_SCAN_STREAM does not emit the initial value — exactly one
      //     output per input (length n). Now registered as its own opcode,
      //     OP_SCAN, below, rather than reusing this one.
      meta({
        op: OpCodes.OP_TAKE_STREAM,
        name: 'takeStream',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'stateful',
        callbackArity: 0,
        bindings: ['fn'],
        earlyTermination: true,
        constructorPreserving: true,
      }),
      meta({
        op: OpCodes.OP_SCAN_STREAM,
        name: 'scanStream',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'stateful',
        callbackArity: 2,
        bindings: ['fn', 'a1'],
        reverseSafe: false,
      }),

      // Array-domain scan: emits the initial accumulator (a1) before any
      // element is processed, then one output per input -- length n+1 for
      // n inputs. See opcodes.ts's OP_SCAN comment and the OP_SCAN_STREAM
      // dialect note above.
      meta({
        op: OpCodes.OP_SCAN,
        name: 'scan',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'stateful',
        callbackArity: 2,
        bindings: ['fn', 'a1'],
        reverseSafe: false,
      }),

      // without(arr, values): whole-array materializer, values is a single
      // array binding. dual-inline's arity-2 codegen always writes the sole
      // curried argument into the _fn slot (see take/drop above, which bind
      // their plain numeric count the same way) -- bindings: ['fn'] here
      // matches that, not the semantic "is this a callback" question.
      meta({
        op: OpCodes.OP_WITHOUT,
        name: 'without',
        inputDomain: 'array',
        outputDomain: 'array',
        cardinality: 'materializer',
        callbackArity: 0,
        bindings: ['fn'],
        constructorPreserving: false,
      }),
    ] satisfies readonly OpMeta[]
  ).map((entry) => [entry.op, entry]),
)

/** Every opcode covered by the registry, sorted ascending. */
export const REGISTERED_OP_CODES: readonly OpCode[] = Object.freeze(
  Array.from(REGISTRY.keys()).sort((a, b) => a - b),
)

export function getOpMeta(op: OpCode): OpMeta | undefined {
  return REGISTRY.get(op)
}

export function requireOpMeta(op: OpCode): OpMeta {
  const found = REGISTRY.get(op)
  if (!found) throw new Error(`registry: no metadata for opcode ${op}`)
  return found
}

export function assertOpMeta(op: OpCode): asserts op is OpCode {
  if (!REGISTRY.has(op)) throw new Error(`registry: no metadata for opcode ${op}`)
}

export function isRegisteredOp(op: OpCode): boolean {
  return REGISTRY.has(op)
}

export function isTerminal(op: OpCode): boolean {
  const found = REGISTRY.get(op)
  return found !== undefined && (found.cardinality === 'sink' || found.cardinality === 'materializer')
}

export function isBoundary(op: OpCode): boolean {
  const found = REGISTRY.get(op)
  return found !== undefined && found.isMaterializationBoundary
}

export function isStreamable(op: OpCode): boolean {
  const found = REGISTRY.get(op)
  if (!found) return false
  return (
    found.cardinality === 'one-to-one' ||
    found.cardinality === 'filtering' ||
    found.cardinality === 'expanding' ||
    found.cardinality === 'stateful'
  )
}

/** All opcode names exported from opcodes.ts, excluding the OP_NON_FUSEABLE sentinel (0, "not tagged"). */
export function allSourceOpCodes(): readonly OpCode[] {
  const codes = new Set<OpCode>()
  for (const value of Object.values(OP_CODES)) codes.add(value)
  for (const [key, value] of Object.entries(OpCodes)) {
    if (key.startsWith('OP_') && typeof value === 'number' && value !== OP_NON_FUSEABLE) {
      codes.add(value)
    }
  }
  return Object.freeze(Array.from(codes).sort((a, b) => a - b))
}

export function opName(op: OpCode): string {
  return REGISTRY.get(op)?.name ?? `op:${op}`
}
