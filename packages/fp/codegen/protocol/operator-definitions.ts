import {
  LOWERING_PROTOCOL_V1,
  LOWERING_PROTOCOL_VERSION_V1,
  OPERATOR_PROTOCOL_V1,
  OPERATOR_PROTOCOL_VERSION_V1,
  assertOperatorCatalogueV1,
  defineLoweringV1,
  defineOperatorV1,
  projectRunnerDescriptorV1,
  type BindingDefinitionV1,
  type BindingSlotV1,
  type CallbackContractV1,
  type CardinalityV1,
  type CompilerPipelineRoleV1,
  type LogicalDomainV1,
  type OperatorLoweringV1,
  type OperatorSemanticV1,
  type OpEmit,
  type OwnershipContractV1,
  type PhysicalLayoutV1,
  type ResultOwnershipV1,
  type SemanticIdentityV1,
  type UnsupportedCapabilitiesV1,
} from './operator-v1'

export type OperatorNamespaceV1 =
  | 'array'
  | 'string'
  | 'object'
  | 'math'
  | 'guard'
  | 'option'
  | 'result'

export const COMPILER_OPERATION_CORPUS_ID_V1 =
  'stopcock-fp-compiler-operation-complete-w0-v1' as const

/**
 * Byte-compatible projection of the 1.x runtime registry. These fields are
 * never semantic, lowering, or backend-selection authority.
 */
export interface LegacyRuntimeFactV1 {
  readonly opcode: number
  readonly opcodeConstant: string
  readonly tagName: string | null
  readonly name: string
  readonly inputDomain: LogicalDomainV1
  readonly outputDomain: LogicalDomainV1
  readonly cardinality: CardinalityV1
  readonly callbackArity: 0 | 1 | 2
  readonly callbackArityDisposition: 'matches-semantic' | 'legacy-comparator-metadata-preserved'
  readonly bindings: readonly BindingSlotV1[]
  readonly earlyTermination: boolean
  readonly constructorPreserving: boolean
  readonly reverseSafe: boolean
  readonly exactLowering: true
  readonly pureLowering: boolean
  readonly simdEligible: boolean
  readonly workerEligible: boolean
  readonly isMaterializationBoundary: boolean
}

export interface OperatorDefinitionRecordV1 {
  readonly semantic: OperatorSemanticV1
  readonly lowerings: readonly OperatorLoweringV1[]
  /**
   * Absent for a compiler-only row (the option/result domains, phase 2):
   * those never had a 1.x runtime encoding and must not mint one. `opcodes.ts`
   * and `registry.ts` are generated only from records that have this field;
   * `compilerName` below is the name every record projects into `ops-table.ts`.
   */
  readonly legacyRuntime?: LegacyRuntimeFactV1
  /**
   * The flat, disambiguated name this op occupies in the one shared
   * `ops-table.ts` namespace. Equal to `legacyRuntime.name` for every
   * runtime-backed op; a compiler-only row mints its own (`optionMap`,
   * `resultMap`, ...) because `map`/`flatMap`/`getOrElse`/`match`/
   * `fromPredicate` collide across the option, result, and array domains.
   */
  readonly compilerName: string
  readonly namespace: OperatorNamespaceV1
  readonly publicArrayExport: boolean
  readonly compilerPipelineRole: CompilerPipelineRoleV1
  readonly compilerFinalBoundary: boolean
  /** The compiled emission template, present iff `fusible` is true. */
  readonly emit?: OpEmit
  /** `false` only for the scalar/guard ops with no compiler pipeline role. */
  readonly fusible: boolean
  readonly contradictionDisposition:
    | 'legacy-classification-retained'
    | 'compiler-streaming-terminal-is-canonical'
  readonly previousCapabilityDeclarations: {
    readonly simd: boolean
    readonly worker: boolean
    /** The canonical capability remains explicit unsupported. */
    readonly disposition: 'unsupported-without-owned-implementation-and-corpus'
  }
}

interface LegacyRowV1 {
  readonly opcode: number
  readonly name: string
  readonly namespace: OperatorNamespaceV1
  readonly inputDomain: LogicalDomainV1
  readonly outputDomain: LogicalDomainV1
  readonly cardinality: CardinalityV1
  readonly callbackArity: 0 | 1 | 2
  readonly bindings: readonly BindingSlotV1[]
  readonly earlyTermination: boolean
  readonly constructorPreserving: boolean
  readonly reverseSafe: boolean
  readonly pureLowering: boolean
  readonly previousSimdDeclaration: boolean
  readonly previousWorkerDeclaration: boolean
  readonly hasPublicTagEncoding: boolean
  readonly publicArrayExport: boolean
  readonly compilerPipelineRole: Exclude<CompilerPipelineRoleV1, 'none'> | null
}

const UNSUPPORTED_CAPABILITIES = {
  worker: 'unsupported',
  simd: 'unsupported',
  wasm: 'unsupported',
  incremental: 'unsupported',
} as const satisfies UnsupportedCapabilitiesV1

const ARRAY_LAYOUTS = [
  'js-array-dense',
  'js-array-sparse-as-undefined',
] as const satisfies readonly PhysicalLayoutV1[]

const SCALAR_LAYOUTS = ['js-scalar'] as const satisfies readonly PhysicalLayoutV1[]
const OPTION_LAYOUTS = ['js-option'] as const satisfies readonly PhysicalLayoutV1[]
const RESULT_LAYOUTS = ['js-result'] as const satisfies readonly PhysicalLayoutV1[]

const NO_CALLBACK = {
  arity: 0,
  arguments: [],
  index: 'not-passed',
  count: 'not-applicable',
  order: 'left-to-right',
  evaluationPoint: 'not-applicable',
} as const satisfies CallbackContractV1

const VALUE_CALLBACK = {
  arity: 1,
  arguments: ['value'],
  index: 'not-passed',
  count: 'once-per-consumed-value',
  order: 'left-to-right',
  evaluationPoint: 'during-element-consumption',
} as const satisfies CallbackContractV1

const REDUCER_CALLBACK = {
  arity: 2,
  arguments: ['accumulator', 'value'],
  index: 'not-passed',
  count: 'once-per-consumed-value',
  order: 'left-to-right',
  evaluationPoint: 'during-element-consumption',
} as const satisfies CallbackContractV1

const REVERSE_VALUE_CALLBACK = {
  arity: 1,
  arguments: ['value'],
  index: 'not-passed',
  count: 'once-per-consumed-value',
  order: 'right-to-left',
  evaluationPoint: 'during-element-consumption',
} as const satisfies CallbackContractV1

const REVERSE_REDUCER_CALLBACK = {
  arity: 2,
  arguments: ['accumulator', 'value'],
  index: 'not-passed',
  count: 'once-per-consumed-value',
  order: 'right-to-left',
  evaluationPoint: 'during-element-consumption',
} as const satisfies CallbackContractV1

const INDEXED_VALUE_CALLBACK = {
  arity: 2,
  arguments: ['value', 'index'],
  index: 'passed-as-second-argument',
  count: 'once-per-consumed-value',
  order: 'left-to-right',
  evaluationPoint: 'during-element-consumption',
} as const satisfies CallbackContractV1

const COMPARATOR_CALLBACK = {
  arity: 2,
  arguments: ['left', 'right'],
  index: 'not-passed',
  count: 'once-per-stable-merge-comparison',
  order: 'stable-merge-sort-order',
  evaluationPoint: 'during-full-materialization',
} as const satisfies CallbackContractV1

function op(
  opcode: number,
  name: string,
  namespace: OperatorNamespaceV1,
  inputDomain: LogicalDomainV1,
  outputDomain: LogicalDomainV1,
  cardinality: CardinalityV1,
  callbackArity: 0 | 1 | 2,
  bindings: readonly BindingSlotV1[],
  earlyTermination: boolean,
  constructorPreserving: boolean,
  reverseSafe: boolean,
  pureLowering: boolean,
  previousSimdDeclaration: boolean,
  previousWorkerDeclaration: boolean,
  hasPublicTagEncoding: boolean,
  publicArrayExport: boolean,
  compilerPipelineRole: Exclude<CompilerPipelineRoleV1, 'none'> | null,
): LegacyRowV1 {
  return {
    opcode,
    name,
    namespace,
    inputDomain,
    outputDomain,
    cardinality,
    callbackArity,
    bindings,
    earlyTermination,
    constructorPreserving,
    reverseSafe,
    pureLowering,
    previousSimdDeclaration,
    previousWorkerDeclaration,
    hasPublicTagEncoding,
    publicArrayExport,
    compilerPipelineRole,
  }
}

// -- Compiled emission templates ---------------------------------------
//
// One `render` function per element/terminal op, keyed by public name. Each
// mirrors the hand-written case it replaces in
// `fp-compiler/src/codegen.ts#emitElementSegment` byte-for-byte. A template
// body may reference only its own `ctx` parameter: it gets spliced into the
// generated `ops-table.ts` as literal source via `Function.prototype.
// toString()`, so any reference to an outer variable would be dangling in
// that file. `map`/`mapWithIndex`, `filter`/`filterWithIndex`, and `forEach`/
// `forEachWithIndex` each share one function object between their two rows,
// distinguished by `indexed`.

const mapTemplate: OpEmit = {
  kind: 'expr',
  render: (ctx) => {
    const cb = ctx.cb.emit(ctx.indexed ? [ctx.v, ctx.position] : [ctx.v], (expr) => [
      `var ${ctx.next} = ${expr};`,
    ])
    return { pre: cb.pre, body: cb.body }
  },
}

const filterTemplate: OpEmit = {
  kind: 'filter',
  render: (ctx) => {
    const cb = ctx.cb.emit(ctx.indexed ? [ctx.v, ctx.position] : [ctx.v], (expr) => [
      `if (!${expr}) { continue; }`,
    ])
    return { pre: cb.pre, body: [...cb.body, `var ${ctx.next} = ${ctx.v};`] }
  },
}

const forEachTemplate: OpEmit = {
  kind: 'sink',
  render: (ctx) => {
    const cb = ctx.cb.emit(ctx.indexed ? [ctx.v, ctx.position] : [ctx.v], (expr) => [`${expr};`])
    return { pre: [...(cb.pre ?? []), `var ${ctx.next} = undefined;`], body: cb.body }
  },
}

const ELEMENT_EMIT_TEMPLATES: Readonly<Record<string, OpEmit>> = {
  map: mapTemplate,
  mapWithIndex: { ...mapTemplate, indexed: true },
  filter: filterTemplate,
  filterWithIndex: { ...filterTemplate, indexed: true },
  reject: {
    kind: 'filter',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.v], (expr) => [`if (${expr}) { continue; }`])
      return { pre: cb.pre, body: [...cb.body, `var ${ctx.next} = ${ctx.v};`] }
    },
  },
  filterMap: {
    kind: 'filter',
    render: (ctx) => {
      const tmp = `_m${ctx.index}`
      const cb = ctx.cb.emit([ctx.v], (expr) => [
        `var ${tmp} = ${expr};`,
        `if (${tmp} == null) { continue; }`,
      ])
      return { pre: cb.pre, body: [...cb.body, `var ${ctx.next} = ${tmp};`] }
    },
  },
  mapWhile: {
    kind: 'stateful',
    render: (ctx) => {
      const tmp = `_mw${ctx.index}`
      const cb = ctx.cb.emit([ctx.v], (expr) => [
        `var ${tmp} = ${expr};`,
        `if (${tmp} == null) { break ${ctx.outerLabel}; }`,
      ])
      return { pre: cb.pre, body: [...cb.body, `var ${ctx.next} = ${tmp};`] }
    },
  },
  flatMap: {
    kind: 'expand',
    render: (ctx) => {
      const fm = `_fm${ctx.index}`
      const j = `_j${ctx.index}`
      const rlen = `_rlen${ctx.index}`
      const cb = ctx.cb.emit([ctx.v], (expr) => [`var ${fm} = ${expr};`])
      return {
        pre: cb.pre,
        body: [
          ...cb.body,
          `for (var ${j} = 0, ${rlen} = ${fm}.length; ${j} < ${rlen}; ${j}++) {`,
          `var ${ctx.next} = ${fm}[${j}];`,
        ],
        close: ['}'],
      }
    },
  },
  take: {
    kind: 'stateful',
    render: (ctx) => {
      const n = `_n${ctx.index}`
      const take = `_take${ctx.index}`
      const state: string[] = []
      if (!ctx.sequential) {
        state.push(`${n} = ${n} > 0 ? (${n} === 1 / 0 ? ${n} : ${n} - ${n} % 1) : 0;`)
      }
      state.push(`var ${take} = 0;`)
      return {
        pre: [`var ${n} = ${ctx.a1};`],
        state,
        body: [
          `if (${take} >= ${n}) break ${ctx.outerLabel};`,
          `${take}++;`,
          `var ${ctx.next} = ${ctx.v};`,
        ],
      }
    },
  },
  takeUntil: {
    kind: 'stateful',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.v], (expr) => [`if (${expr}) { break ${ctx.outerLabel}; }`])
      return { pre: cb.pre, body: [...cb.body, `var ${ctx.next} = ${ctx.v};`] }
    },
  },
  drop: {
    kind: 'stateful',
    render: (ctx) => {
      const n = `_n${ctx.index}`
      const drop = `_drop${ctx.index}`
      const state: string[] = []
      if (!ctx.sequential) {
        state.push(`${n} = ${n} > 0 ? (${n} === 1 / 0 ? ${n} : ${n} - ${n} % 1) : 0;`)
      }
      state.push(`var ${drop} = 0;`)
      return {
        pre: [`var ${n} = ${ctx.a1};`],
        state,
        body: [`if (${drop} < ${n}) { ${drop}++; continue; }`, `var ${ctx.next} = ${ctx.v};`],
      }
    },
  },
  takeWhile: {
    kind: 'stateful',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.v], (expr) => [`if (!${expr}) break ${ctx.outerLabel};`])
      return { pre: cb.pre, body: [...cb.body, `var ${ctx.next} = ${ctx.v};`] }
    },
  },
  dropWhile: {
    kind: 'stateful',
    render: (ctx) => {
      const dw = `_dw${ctx.index}`
      const cb = ctx.cb.emit([ctx.v], (expr) => [
        `if (${dw}) { if (${expr}) { continue; } ${dw} = false; }`,
      ])
      return {
        state: [`var ${dw} = true;`],
        pre: cb.pre,
        body: [...cb.body, `var ${ctx.next} = ${ctx.v};`],
      }
    },
  },
  sum: {
    kind: 'sink',
    render: (ctx) => ({ pre: [`var ${ctx.next} = 0;`], body: [`${ctx.next} += ${ctx.v};`] }),
  },
  count: {
    kind: 'sink',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.v], (expr) => [`if (${expr}) { ${ctx.next}++; }`])
      return { pre: [`var ${ctx.next} = 0;`, ...(cb.pre ?? [])], body: cb.body }
    },
  },
  reduce: {
    kind: 'sink',
    render: (ctx) => {
      // `reduce(fn, seed)` evaluates `fn` before `seed`: a hoisted callback
      // temp (if any) must land before the seed line, not after, so this is
      // the one template that puts `cb.pre` ahead of its own line.
      const cb = ctx.cb.emit([ctx.next, ctx.v], (expr) => [`${ctx.next} = ${expr};`])
      return { pre: [...(cb.pre ?? []), `var ${ctx.next} = ${ctx.a1};`], body: cb.body }
    },
  },
  forEach: forEachTemplate,
  forEachWithIndex: { ...forEachTemplate, indexed: true },
  find: {
    kind: 'sink',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.v], (expr) => [
        `if (${expr}) { ${ctx.next} = { _tag: 1, value: ${ctx.v} }; break ${ctx.outerLabel}; }`,
      ])
      return { pre: [`var ${ctx.next} = ${ctx.optionNone};`, ...(cb.pre ?? [])], body: cb.body }
    },
  },
  findIndex: {
    kind: 'sink',
    render: (ctx) => {
      const pos = `_pos${ctx.index}`
      const cb = ctx.cb.emit([ctx.v], (expr) => [
        `if (${expr}) { ${ctx.next} = { _tag: 1, value: ${pos} }; break ${ctx.outerLabel}; }`,
        `${pos}++;`,
      ])
      return {
        pre: [`var ${ctx.next} = ${ctx.optionNone};`, ...(cb.pre ?? [])],
        state: [`var ${pos} = 0;`],
        body: cb.body,
      }
    },
  },
  // The AST fast path for a `x != null ? x : undefined`-shaped callback
  // (`planPresentConditional` in codegen.ts) inspects the callback's syntax
  // tree, which a serializable template cannot do. This is the slow-path
  // equivalent; codegen.ts keeps the fast path as a named override that
  // tries first and falls back to this template.
  findMap: {
    kind: 'sink',
    render: (ctx) => {
      const tmp = `_fmv${ctx.index}`
      const cb = ctx.cb.emit([ctx.v], (expr) => [
        `var ${tmp} = ${expr};`,
        `if (${tmp} != null) { ${ctx.next} = { _tag: 1, value: ${tmp} }; break ${ctx.outerLabel}; }`,
      ])
      return { pre: [`var ${ctx.next} = ${ctx.optionNone};`, ...(cb.pre ?? [])], body: cb.body }
    },
  },
  every: {
    kind: 'sink',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.v], (expr) => [
        `if (!${expr}) { ${ctx.next} = false; break ${ctx.outerLabel}; }`,
      ])
      return { pre: [`var ${ctx.next} = true;`, ...(cb.pre ?? [])], body: cb.body }
    },
  },
  some: {
    kind: 'sink',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.v], (expr) => [
        `if (${expr}) { ${ctx.next} = true; break ${ctx.outerLabel}; }`,
      ])
      return { pre: [`var ${ctx.next} = false;`, ...(cb.pre ?? [])], body: cb.body }
    },
  },
  none: {
    kind: 'sink',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.v], (expr) => [
        `if (${expr}) { ${ctx.next} = false; break ${ctx.outerLabel}; }`,
      ])
      return { pre: [`var ${ctx.next} = true;`, ...(cb.pre ?? [])], body: cb.body }
    },
  },
  head: {
    kind: 'sink',
    render: (ctx) => ({
      pre: [`var ${ctx.next} = ${ctx.optionNone};`],
      // Phase 2: fused behind a preceding array segment, `head` used to
      // scan every remaining element after finding the first (its own
      // one-step fast path in `emitSequentialPropertyTerminal` never hit
      // this template at all). Breaking here matches `find`/`some`/`every`
      // and is what the array-to-option boundary fusion corpus pins: the
      // fused loop must not keep calling an upstream predicate past the
      // first match.
      body: [
        `if (${ctx.next}._tag === 0) { ${ctx.next} = { _tag: 1, value: ${ctx.v} }; break ${ctx.outerLabel}; }`,
      ],
    }),
  },
  last: {
    kind: 'sink',
    render: (ctx) => ({
      pre: [`var ${ctx.next} = ${ctx.optionNone};`],
      body: [
        `if (${ctx.next}._tag === 0) { ${ctx.next} = { _tag: 1, value: ${ctx.v} }; } else { ${ctx.next}.value = ${ctx.v}; }`,
      ],
    }),
  },
  length: {
    kind: 'sink',
    render: (ctx) => ({ pre: [`var ${ctx.next} = 0;`], body: [`${ctx.next}++;`] }),
  },
  isEmpty: {
    kind: 'sink',
    render: (ctx) => ({ pre: [`var ${ctx.next} = true;`], body: [`${ctx.next} = false;`] }),
  },
  min: {
    kind: 'sink',
    render: (ctx) => ({
      pre: [`var ${ctx.next} = ${ctx.optionNone};`],
      body: [
        `if (${ctx.next}._tag === 0) { ${ctx.next} = { _tag: 1, value: ${ctx.v} }; } else if (${ctx.v} < ${ctx.next}.value) { ${ctx.next}.value = ${ctx.v}; }`,
      ],
    }),
  },
  max: {
    kind: 'sink',
    render: (ctx) => ({
      pre: [`var ${ctx.next} = ${ctx.optionNone};`],
      body: [
        `if (${ctx.next}._tag === 0) { ${ctx.next} = { _tag: 1, value: ${ctx.v} }; } else if (${ctx.v} > ${ctx.next}.value) { ${ctx.next}.value = ${ctx.v}; }`,
      ],
    }),
  },

  // -- Phase 1.4: the scalar/guard/string/object stragglers -----------------
  //
  // Every one of these has `compilerPipelineRole: 'boundary'` on its row
  // (not `'element'`): its registered `inputDomain` is `'scalar'`, never
  // `'array'`, so it must never be glommed into an adjacent array segment's
  // per-element loop by `segmentSteps`/`segmentsFromPlan` -- that would
  // apply it once per array element instead of once to the pipe's whole
  // current value, which is what both reference executors do (root
  // `pipe`/`sequentialPipe`'s plain `step(current)` and
  // `interpret.ts#runScalarSegment`, whose cases this mirrors exactly).
  // `compilerFinalBoundary` below is taught that a `'scalar'`-input boundary
  // is never final, so these compile mid-pipeline like `map -> uniq -> sum`
  // already does for the array-domain boundaries. Codegen still gets to
  // splice each one as a single straight-line statement over the segment's
  // current-value local rather than falling back to the generic
  // capture-and-call boundary mechanism, because these templates are
  // `expr` kind, not `{ kind: 'boundary' }`.
  add: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = (${ctx.v} + ${ctx.a1});`] }),
  },
  subtract: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = (${ctx.v} - ${ctx.a1});`] }),
  },
  multiply: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = (${ctx.v} * ${ctx.a1});`] }),
  },
  divide: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = (${ctx.v} / ${ctx.a1});`] }),
  },
  negate: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = (-${ctx.v});`] }),
  },
  inc: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = (${ctx.v} + 1);`] }),
  },
  dec: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = (${ctx.v} - 1);`] }),
  },
  trim: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = ${ctx.v}.trim();`] }),
  },
  trimStart: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = ${ctx.v}.trimStart();`] }),
  },
  trimEnd: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = ${ctx.v}.trimEnd();`] }),
  },
  toLowerCase: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = ${ctx.v}.toLowerCase();`] }),
  },
  toUpperCase: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = ${ctx.v}.toUpperCase();`] }),
  },
  split: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = ${ctx.v}.split(${ctx.a1});`] }),
  },
  strLength: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = ${ctx.v}.length;`] }),
  },
  strIsEmpty: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = (${ctx.v} === '');`] }),
  },
  dictIsEmpty: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = (Object.keys(${ctx.v}).length === 0);`] }),
  },
  isArray: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = Array.isArray(${ctx.v});`] }),
  },
  isBoolean: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = (typeof ${ctx.v} === 'boolean');`] }),
  },
  isFunction: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = (typeof ${ctx.v} === 'function');`] }),
  },
  isNil: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = (${ctx.v} == null);`] }),
  },
  isNumber: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = (typeof ${ctx.v} === 'number');`] }),
  },
  isObject: {
    kind: 'expr',
    render: (ctx) => ({
      body: [
        `var ${ctx.next} = (typeof ${ctx.v} === 'object' && ${ctx.v} !== null && !Array.isArray(${ctx.v}));`,
      ],
    }),
  },
  isString: {
    kind: 'expr',
    render: (ctx) => ({ body: [`var ${ctx.next} = (typeof ${ctx.v} === 'string');`] }),
  },
}

const BOUNDARY_EMIT_TEMPLATE: OpEmit = { kind: 'boundary' }

function emitDeclarationFor(row: LegacyRowV1): { readonly emit?: OpEmit; readonly fusible: boolean } {
  if (row.compilerPipelineRole === null) return { fusible: false }
  // A named template always wins, including for a `'boundary'`-role row: the
  // scalar stragglers above are boundary-segmented (see the comment on that
  // block) but render as an inline expression rather than the generic
  // capture-and-call mechanism. Only a boundary role with no named template
  // (sort/reverse/uniq/keys/values/sortInline/...) falls back to it.
  const template = ELEMENT_EMIT_TEMPLATES[row.name]
  if (template) return { emit: template, fusible: true }
  if (row.compilerPipelineRole === 'boundary') return { emit: BOUNDARY_EMIT_TEMPLATE, fusible: true }
  throw new Error(
    `operator definitions v1: ${row.name} has compilerPipelineRole ${row.compilerPipelineRole} but no emit template`,
  )
}

// -- Phase 2: Option and Result compiled emission ---------------------------
//
// Option is `(ok, v)`, Result is `(ok, v, err)`: persistent locals threaded
// straight-line through every step of one compiled run, no loop scaffold, no
// per-step renaming (contrast the array element templates above, which mint
// a fresh `_v{n+1}` per step because they live inside a shared loop body).
// `ctx.err` is `''` and unused for an Option-only run. A step whose
// `compilerPipelineRole` is `'terminal'` (getOrElse/match/toUndefined/
// toNullable/toOption) assigns `ctx.next` directly instead of mutating
// `ctx.v`/`ctx.ok`, exactly like an array terminal assigns `ctx.next` inside
// `emitElementSegment`'s loop. These templates are spliced into `ops-table.ts`
// as literal source the same way `ELEMENT_EMIT_TEMPLATES` are: a template
// body may reference only its own `ctx` parameter.
const OPTION_RESULT_EMIT_TEMPLATES: Readonly<Record<string, OpEmit>> = {
  optionMap: {
    kind: 'optionStep',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.v], (expr) => [`${ctx.v} = ${expr};`])
      return { pre: cb.pre, body: [`if (${ctx.ok}) {`, ...cb.body, '}'] }
    },
  },
  optionFlatMap: {
    kind: 'optionStep',
    render: (ctx) => {
      const t = `_t${ctx.index}`
      const cb = ctx.cb.emit([ctx.v], (expr) => [`var ${t} = ${expr};`])
      return {
        pre: cb.pre,
        body: [
          `if (${ctx.ok}) {`,
          ...cb.body,
          `${ctx.ok} = ${t}._tag === 1;`,
          `if (${ctx.ok}) { ${ctx.v} = ${t}.value; }`,
          '}',
        ],
      }
    },
  },
  optionFilter: {
    kind: 'optionStep',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.v], (expr) => [`if (!(${expr})) { ${ctx.ok} = false; }`])
      return { pre: cb.pre, body: [`if (${ctx.ok}) {`, ...cb.body, '}'] }
    },
  },
  optionGetOrElse: {
    kind: 'optionStep',
    render: (ctx) => ({
      body: [`var ${ctx.next} = ${ctx.ok} ? ${ctx.v} : (${ctx.a1})();`],
    }),
  },
  optionOrElse: {
    kind: 'optionStep',
    render: (ctx) => {
      const f = `_f${ctx.index}`
      return {
        body: [
          `if (!${ctx.ok}) {`,
          `var ${f} = ${ctx.a1};`,
          `${ctx.ok} = ${f}._tag === 1;`,
          `if (${ctx.ok}) { ${ctx.v} = ${f}.value; }`,
          '}',
        ],
      }
    },
  },
  optionMatch: {
    kind: 'optionStep',
    render: (ctx) => ({
      body: [`var ${ctx.next} = ${ctx.ok} ? (${ctx.a1}).some(${ctx.v}) : (${ctx.a1}).none();`],
    }),
  },
  // No `var` on `ctx.ok`/`ctx.err` here: a constructor is the first step of
  // its run, and the segment scaffold (`emitOptionSegment` in codegen.ts)
  // already declared `_ok`/`_v`(/`_err`) before splicing this template, the
  // same way `resultFromThrowable` below assumes it.
  optionFromNullable: {
    kind: 'optionStep',
    render: (ctx) => ({ body: [`${ctx.ok} = (${ctx.v} != null);`] }),
  },
  optionFromPredicate: {
    kind: 'optionStep',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.v], (expr) => [`${ctx.ok} = (${expr});`])
      return { pre: cb.pre, body: cb.body }
    },
  },
  optionToUndefined: {
    kind: 'optionStep',
    render: (ctx) => ({ body: [`var ${ctx.next} = ${ctx.ok} ? ${ctx.v} : undefined;`] }),
  },
  optionToNullable: {
    kind: 'optionStep',
    render: (ctx) => ({ body: [`var ${ctx.next} = ${ctx.ok} ? ${ctx.v} : null;`] }),
  },
  optionTap: {
    kind: 'optionStep',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.v], (expr) => [`${expr};`])
      return { pre: cb.pre, body: [`if (${ctx.ok}) {`, ...cb.body, '}'] }
    },
  },
  optionZip: {
    kind: 'optionStep',
    render: (ctx) => {
      const z = `_z${ctx.index}`
      return {
        body: [
          `if (${ctx.ok}) {`,
          `var ${z} = ${ctx.a1};`,
          `${ctx.ok} = ${z}._tag === 1;`,
          `if (${ctx.ok}) { ${ctx.v} = [${ctx.v}, ${z}.value]; }`,
          '}',
        ],
      }
    },
  },
  resultMap: {
    kind: 'optionStep',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.v], (expr) => [`${ctx.v} = ${expr};`])
      return { pre: cb.pre, body: [`if (${ctx.ok}) {`, ...cb.body, '}'] }
    },
  },
  resultMapErr: {
    kind: 'optionStep',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.err], (expr) => [`${ctx.err} = ${expr};`])
      return { pre: cb.pre, body: [`if (!${ctx.ok}) {`, ...cb.body, '}'] }
    },
  },
  resultFlatMap: {
    kind: 'optionStep',
    render: (ctx) => {
      const t = `_t${ctx.index}`
      const cb = ctx.cb.emit([ctx.v], (expr) => [`var ${t} = ${expr};`])
      return {
        pre: cb.pre,
        body: [
          `if (${ctx.ok}) {`,
          ...cb.body,
          `${ctx.ok} = ${t}._tag === 1;`,
          `if (${ctx.ok}) { ${ctx.v} = ${t}.value; } else { ${ctx.err} = ${t}.error; }`,
          '}',
        ],
      }
    },
  },
  resultGetOrElse: {
    kind: 'optionStep',
    render: (ctx) => {
      const cb = ctx.cb.emit([ctx.err], (expr) => [
        `var ${ctx.next} = ${ctx.ok} ? ${ctx.v} : (${expr});`,
      ])
      return { pre: cb.pre, body: cb.body }
    },
  },
  resultMatch: {
    kind: 'optionStep',
    render: (ctx) => ({
      body: [`var ${ctx.next} = ${ctx.ok} ? (${ctx.a1}).ok(${ctx.v}) : (${ctx.a1}).err(${ctx.err});`],
    }),
  },
  resultFromThrowable: {
    kind: 'optionStep',
    render: (ctx) => {
      const e = `_e${ctx.index}`
      return {
        body: [
          `try { ${ctx.v} = (${ctx.v})(); ${ctx.ok} = true; } catch (${e}) { ${ctx.err} = ${e}; ${ctx.ok} = false; }`,
        ],
      }
    },
  },
  resultToOption: {
    kind: 'optionStep',
    render: (ctx) => ({
      body: [`var ${ctx.next} = ${ctx.ok} ? { _tag: 1, value: ${ctx.v} } : ${ctx.optionNone};`],
    }),
  },
}

interface OptionResultRowV1 {
  readonly compilerName: string
  readonly publicName: string
  readonly namespace: 'option' | 'result'
  readonly inputDomain: LogicalDomainV1
  readonly outputDomain: LogicalDomainV1
  readonly bindings: readonly BindingSlotV1[]
  readonly callback: CallbackContractV1
  readonly compilerPipelineRole: 'element' | 'terminal'
}

const OPTION_RESULT_ROWS: readonly OptionResultRowV1[] = [
  {
    compilerName: 'optionMap',
    publicName: 'map',
    namespace: 'option',
    inputDomain: 'option',
    outputDomain: 'option',
    bindings: ['fn'],
    callback: VALUE_CALLBACK,
    compilerPipelineRole: 'element',
  },
  {
    compilerName: 'optionFlatMap',
    publicName: 'flatMap',
    namespace: 'option',
    inputDomain: 'option',
    outputDomain: 'option',
    bindings: ['fn'],
    callback: VALUE_CALLBACK,
    compilerPipelineRole: 'element',
  },
  {
    compilerName: 'optionFilter',
    publicName: 'filter',
    namespace: 'option',
    inputDomain: 'option',
    outputDomain: 'option',
    bindings: ['fn'],
    callback: VALUE_CALLBACK,
    compilerPipelineRole: 'element',
  },
  {
    compilerName: 'optionGetOrElse',
    publicName: 'getOrElse',
    namespace: 'option',
    inputDomain: 'option',
    outputDomain: 'scalar',
    bindings: ['a1'],
    callback: NO_CALLBACK,
    compilerPipelineRole: 'terminal',
  },
  {
    compilerName: 'optionOrElse',
    publicName: 'orElse',
    namespace: 'option',
    inputDomain: 'option',
    outputDomain: 'option',
    bindings: ['a1'],
    callback: NO_CALLBACK,
    compilerPipelineRole: 'element',
  },
  {
    compilerName: 'optionMatch',
    publicName: 'match',
    namespace: 'option',
    inputDomain: 'option',
    outputDomain: 'scalar',
    bindings: ['a1'],
    callback: NO_CALLBACK,
    compilerPipelineRole: 'terminal',
  },
  {
    compilerName: 'optionFromNullable',
    publicName: 'fromNullable',
    namespace: 'option',
    inputDomain: 'scalar',
    outputDomain: 'option',
    bindings: [],
    callback: NO_CALLBACK,
    compilerPipelineRole: 'element',
  },
  {
    compilerName: 'optionFromPredicate',
    publicName: 'fromPredicate',
    namespace: 'option',
    inputDomain: 'scalar',
    outputDomain: 'option',
    bindings: ['fn'],
    callback: VALUE_CALLBACK,
    compilerPipelineRole: 'element',
  },
  {
    compilerName: 'optionToUndefined',
    publicName: 'toUndefined',
    namespace: 'option',
    inputDomain: 'option',
    outputDomain: 'scalar',
    bindings: [],
    callback: NO_CALLBACK,
    compilerPipelineRole: 'terminal',
  },
  {
    compilerName: 'optionToNullable',
    publicName: 'toNullable',
    namespace: 'option',
    inputDomain: 'option',
    outputDomain: 'scalar',
    bindings: [],
    callback: NO_CALLBACK,
    compilerPipelineRole: 'terminal',
  },
  {
    compilerName: 'optionTap',
    publicName: 'tap',
    namespace: 'option',
    inputDomain: 'option',
    outputDomain: 'option',
    bindings: ['fn'],
    callback: VALUE_CALLBACK,
    compilerPipelineRole: 'element',
  },
  {
    compilerName: 'optionZip',
    publicName: 'zip',
    namespace: 'option',
    inputDomain: 'option',
    outputDomain: 'option',
    bindings: ['a1'],
    callback: NO_CALLBACK,
    compilerPipelineRole: 'element',
  },
  {
    compilerName: 'resultMap',
    publicName: 'map',
    namespace: 'result',
    inputDomain: 'result',
    outputDomain: 'result',
    bindings: ['fn'],
    callback: VALUE_CALLBACK,
    compilerPipelineRole: 'element',
  },
  {
    compilerName: 'resultMapErr',
    publicName: 'mapErr',
    namespace: 'result',
    inputDomain: 'result',
    outputDomain: 'result',
    bindings: ['fn'],
    callback: VALUE_CALLBACK,
    compilerPipelineRole: 'element',
  },
  {
    compilerName: 'resultFlatMap',
    publicName: 'flatMap',
    namespace: 'result',
    inputDomain: 'result',
    outputDomain: 'result',
    bindings: ['fn'],
    callback: VALUE_CALLBACK,
    compilerPipelineRole: 'element',
  },
  {
    compilerName: 'resultGetOrElse',
    publicName: 'getOrElse',
    namespace: 'result',
    inputDomain: 'result',
    outputDomain: 'scalar',
    bindings: ['fn'],
    callback: VALUE_CALLBACK,
    compilerPipelineRole: 'terminal',
  },
  {
    compilerName: 'resultMatch',
    publicName: 'match',
    namespace: 'result',
    inputDomain: 'result',
    outputDomain: 'scalar',
    bindings: ['a1'],
    callback: NO_CALLBACK,
    compilerPipelineRole: 'terminal',
  },
  {
    compilerName: 'resultFromThrowable',
    publicName: 'fromThrowable',
    namespace: 'result',
    inputDomain: 'scalar',
    outputDomain: 'result',
    bindings: [],
    callback: NO_CALLBACK,
    compilerPipelineRole: 'element',
  },
  {
    compilerName: 'resultToOption',
    publicName: 'toOption',
    namespace: 'result',
    inputDomain: 'result',
    outputDomain: 'option',
    bindings: [],
    callback: NO_CALLBACK,
    compilerPipelineRole: 'terminal',
  },
] as const satisfies readonly OptionResultRowV1[]

const LEGACY_ROWS = [
  op(
    1,
    'map',
    'array',
    'array',
    'array',
    'one-to-one',
    1,
    ['fn'],
    false,
    true,
    true,
    true,
    false,
    false,
    true,
    true,
    'element',
  ),
  op(
    2,
    'filter',
    'array',
    'array',
    'array',
    'filtering',
    1,
    ['fn'],
    false,
    true,
    true,
    true,
    false,
    false,
    true,
    true,
    'element',
  ),
  op(
    3,
    'take',
    'array',
    'array',
    'array',
    'stateful',
    0,
    ['fn'],
    true,
    true,
    false,
    true,
    false,
    false,
    true,
    true,
    'element',
  ),
  op(
    4,
    'drop',
    'array',
    'array',
    'array',
    'stateful',
    0,
    ['fn'],
    false,
    true,
    false,
    true,
    false,
    false,
    true,
    true,
    'element',
  ),
  op(
    5,
    'takeWhile',
    'array',
    'array',
    'array',
    'stateful',
    1,
    ['fn'],
    true,
    true,
    false,
    true,
    false,
    false,
    true,
    true,
    'element',
  ),
  op(
    6,
    'dropWhile',
    'array',
    'array',
    'array',
    'stateful',
    1,
    ['fn'],
    false,
    true,
    false,
    true,
    false,
    false,
    true,
    true,
    'element',
  ),
  op(
    7,
    'flatMap',
    'array',
    'array',
    'array',
    'expanding',
    1,
    ['fn'],
    true,
    false,
    false,
    true,
    false,
    false,
    true,
    true,
    'element',
  ),
  op(
    8,
    'reduce',
    'array',
    'array',
    'scalar',
    'sink',
    2,
    ['fn', 'a1'],
    false,
    false,
    false,
    false,
    false,
    false,
    true,
    true,
    'terminal',
  ),
  op(
    9,
    'forEach',
    'array',
    'array',
    'scalar',
    'sink',
    1,
    ['fn'],
    false,
    false,
    true,
    false,
    false,
    false,
    true,
    true,
    'terminal',
  ),
  op(
    10,
    'every',
    'array',
    'array',
    'scalar',
    'sink',
    1,
    ['fn'],
    true,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'terminal',
  ),
  op(
    11,
    'some',
    'array',
    'array',
    'scalar',
    'sink',
    1,
    ['fn'],
    true,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'terminal',
  ),
  op(
    12,
    'find',
    'array',
    'array',
    'scalar',
    'sink',
    1,
    ['fn'],
    true,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'terminal',
  ),
  op(
    13,
    'findIndex',
    'array',
    'array',
    'scalar',
    'sink',
    1,
    ['fn'],
    true,
    false,
    false,
    true,
    false,
    false,
    true,
    true,
    'terminal',
  ),
  op(
    14,
    'filterMap',
    'array',
    'array',
    'array',
    'filtering',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'element',
  ),
  op(
    15,
    'mapWhile',
    'array',
    'array',
    'array',
    'stateful',
    1,
    ['fn'],
    true,
    false,
    false,
    true,
    false,
    false,
    true,
    true,
    'element',
  ),
  op(
    16,
    'reject',
    'array',
    'array',
    'array',
    'filtering',
    1,
    ['fn'],
    false,
    true,
    true,
    true,
    false,
    false,
    true,
    true,
    'element',
  ),
  op(
    17,
    'none',
    'array',
    'array',
    'scalar',
    'sink',
    1,
    ['fn'],
    true,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'terminal',
  ),
  op(
    18,
    'count',
    'array',
    'array',
    'scalar',
    'sink',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'terminal',
  ),
  op(
    19,
    'takeUntil',
    'array',
    'array',
    'array',
    'stateful',
    1,
    ['fn'],
    true,
    false,
    false,
    true,
    false,
    false,
    true,
    true,
    'element',
  ),
  op(
    20,
    'sortBy',
    'array',
    'array',
    'array',
    'materializer',
    1,
    ['fn'],
    false,
    true,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    21,
    'sort',
    'array',
    'array',
    'array',
    'materializer',
    0,
    [],
    false,
    true,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    22,
    'findMap',
    'array',
    'array',
    'scalar',
    'sink',
    1,
    ['fn'],
    true,
    false,
    false,
    true,
    false,
    false,
    true,
    true,
    'terminal',
  ),
  op(
    30,
    'head',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'terminal',
  ),
  op(
    31,
    'last',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'terminal',
  ),
  op(
    32,
    'length',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'terminal',
  ),
  op(
    33,
    'isEmpty',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'terminal',
  ),
  op(
    34,
    'tail',
    'array',
    'array',
    'array',
    'materializer',
    0,
    [],
    false,
    true,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    35,
    'init',
    'array',
    'array',
    'array',
    'materializer',
    0,
    [],
    false,
    true,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    36,
    'reverse',
    'array',
    'array',
    'array',
    'materializer',
    0,
    [],
    false,
    true,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    37,
    'sortInline',
    'array',
    'array',
    'array',
    'materializer',
    1,
    ['fn'],
    false,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    'boundary',
  ),
  op(
    23,
    'dropRepeats',
    'array',
    'array',
    'array',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    38,
    'uniq',
    'array',
    'array',
    'array',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    39,
    'join',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    40,
    'flatten',
    'array',
    'array',
    'array',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    41,
    'sum',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    'terminal',
  ),
  op(
    42,
    'min',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    'terminal',
  ),
  op(
    43,
    'max',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    'terminal',
  ),
  op(
    50,
    'trim',
    'string',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    51,
    'toLowerCase',
    'string',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    52,
    'toUpperCase',
    'string',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    53,
    'trimStart',
    'string',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    54,
    'trimEnd',
    'string',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    55,
    'split',
    'string',
    'scalar',
    'array',
    'one-to-one',
    0,
    ['a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    56,
    'strLength',
    'string',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    57,
    'strIsEmpty',
    'string',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    60,
    'keys',
    'object',
    'scalar',
    'array',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    61,
    'values',
    'object',
    'scalar',
    'array',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    62,
    'dictIsEmpty',
    'object',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    70,
    'add',
    'math',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    ['a1'],
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    false,
    'boundary',
  ),
  op(
    71,
    'subtract',
    'math',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    ['a1'],
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    false,
    'boundary',
  ),
  op(
    72,
    'multiply',
    'math',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    ['a1'],
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    false,
    'boundary',
  ),
  op(
    73,
    'divide',
    'math',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    ['a1'],
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    false,
    'boundary',
  ),
  op(
    74,
    'negate',
    'math',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    false,
    'boundary',
  ),
  op(
    75,
    'inc',
    'math',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    false,
    'boundary',
  ),
  op(
    76,
    'dec',
    'math',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    false,
    'boundary',
  ),
  op(
    80,
    'isNumber',
    'guard',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    81,
    'isString',
    'guard',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    82,
    'isBoolean',
    'guard',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    83,
    'isNil',
    'guard',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    84,
    'isArray',
    'guard',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    85,
    'isObject',
    'guard',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    86,
    'isFunction',
    'guard',
    'scalar',
    'scalar',
    'one-to-one',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    'boundary',
  ),
  op(
    90,
    'sortAsc',
    'array',
    'array',
    'array',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    91,
    'sortDesc',
    'array',
    'array',
    'array',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    102,
    'scan',
    'array',
    'array',
    'array',
    'stateful',
    2,
    ['fn', 'a1'],
    false,
    false,
    false,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    103,
    'without',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    104,
    'chunk',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    105,
    'slidingWindow',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    106,
    'aperture',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    107,
    'intersperse',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    108,
    'uniqBy',
    'array',
    'array',
    'array',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    109,
    'groupBy',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    110,
    'partition',
    'array',
    'array',
    'array',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    111,
    'zip',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    112,
    'zipWith',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    113,
    'xprod',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    114,
    'intersection',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    115,
    'union',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    116,
    'difference',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    117,
    'symmetricDifference',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    118,
    'adjust',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    119,
    'update',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    120,
    'insert',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    121,
    'remove',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    122,
    'includes',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    24,
    'findOrUndefined',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    25,
    'findIndexOrUndefined',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    26,
    'findMapOrUndefined',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    27,
    'pluck',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    28,
    'dropLast',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    29,
    'takeLast',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    44,
    'dropLastWhile',
    'array',
    'array',
    'array',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    45,
    'takeLastWhile',
    'array',
    'array',
    'array',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    46,
    'append',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    47,
    'prepend',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    48,
    'indexOf',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    49,
    'lastIndexOf',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    92,
    'findLast',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    93,
    'findLastIndex',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    94,
    'reduceRight',
    'array',
    'array',
    'scalar',
    'materializer',
    2,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    95,
    'reduceWhile',
    'array',
    'array',
    'scalar',
    'materializer',
    2,
    ['fn', 'a1', 'a2'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    96,
    'sumBy',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    97,
    'meanBy',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    98,
    'hasAtLeast',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    99,
    'arrayStartsWith',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    100,
    'arrayEndsWith',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    101,
    'nth',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    123,
    'splitAt',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    124,
    'splitWhen',
    'array',
    'array',
    'array',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    125,
    'splitWhenever',
    'array',
    'array',
    'array',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    126,
    'uniqWith',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    127,
    'groupWith',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    128,
    'concat',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    129,
    'indexBy',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    130,
    'collectBy',
    'array',
    'array',
    'array',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    131,
    'dropRepeatsBy',
    'array',
    'array',
    'array',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    132,
    'dropRepeatsWith',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    133,
    'mapToObj',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    134,
    'zipObj',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    135,
    'groupByProp',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    136,
    'slice',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    137,
    'swap',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    138,
    'insertAll',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    139,
    'splice',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1', 'a2'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    140,
    'unionBy',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    141,
    'unionWith',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    142,
    'intersectionBy',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    143,
    'differenceBy',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    144,
    'differenceWith',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    145,
    'symmetricDifferenceBy',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    146,
    'symmetricDifferenceWith',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    147,
    'withoutBy',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    148,
    'mapAccum',
    'array',
    'array',
    'array',
    'materializer',
    2,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    149,
    'mapAccumRight',
    'array',
    'array',
    'array',
    'materializer',
    2,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    150,
    'reduceBy',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn', 'a1', 'a2'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    151,
    'takeSortedBy',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    152,
    'sortedIndexBy',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    153,
    'sortedIndexWith',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    154,
    'sortedLastIndexBy',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn', 'a1'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    155,
    'nthOrUndefined',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    156,
    'indexOfOrUndefined',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    157,
    'lastIndexOfOrUndefined',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    158,
    'findLastOrUndefined',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    159,
    'findLastIndexOrUndefined',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    160,
    'meanByOrUndefined',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    161,
    'meanByNonEmpty',
    'array',
    'array',
    'scalar',
    'materializer',
    1,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    162,
    'headOrUndefined',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    163,
    'headNonEmpty',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    164,
    'lastOrUndefined',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    165,
    'lastNonEmpty',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    166,
    'minOrUndefined',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    167,
    'minNonEmpty',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    168,
    'maxOrUndefined',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    169,
    'maxNonEmpty',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    170,
    'onlyOrUndefined',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    171,
    'only',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    172,
    'mergeAll',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    173,
    'transpose',
    'array',
    'array',
    'array',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    174,
    'unnest',
    'array',
    'array',
    'array',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    175,
    'mapWithIndex',
    'array',
    'array',
    'array',
    'one-to-one',
    2,
    ['fn'],
    false,
    true,
    true,
    true,
    false,
    false,
    true,
    true,
    'element',
  ),
  op(
    176,
    'filterWithIndex',
    'array',
    'array',
    'array',
    'filtering',
    2,
    ['fn'],
    false,
    true,
    true,
    true,
    false,
    false,
    true,
    true,
    'element',
  ),
  op(
    177,
    'forEachWithIndex',
    'array',
    'array',
    'scalar',
    'sink',
    2,
    ['fn'],
    false,
    false,
    true,
    false,
    false,
    false,
    true,
    true,
    'terminal',
  ),
  op(
    178,
    'shuffle',
    'array',
    'array',
    'array',
    'materializer',
    0,
    [],
    false,
    false,
    true,
    false,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    179,
    'sample',
    'array',
    'array',
    'array',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    false,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    180,
    'sortedIndex',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
  op(
    181,
    'sortedLastIndex',
    'array',
    'array',
    'scalar',
    'materializer',
    0,
    ['fn'],
    false,
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    'boundary',
  ),
] as const satisfies readonly LegacyRowV1[]

function opcodeConstantFor(row: LegacyRowV1): string {
  const special: Readonly<Record<string, string>> = {
    sortInline: 'OP_SORT_INLINE',
    uniq: 'OP_UNIQ_INLINE',
    trim: 'OP_STR_TRIM',
    toLowerCase: 'OP_STR_LOWER',
    toUpperCase: 'OP_STR_UPPER',
    trimStart: 'OP_STR_TRIM_START',
    trimEnd: 'OP_STR_TRIM_END',
    split: 'OP_STR_SPLIT',
    strLength: 'OP_STR_LENGTH',
    strIsEmpty: 'OP_STR_IS_EMPTY',
    keys: 'OP_DICT_KEYS',
    values: 'OP_DICT_VALUES',
    dictIsEmpty: 'OP_DICT_IS_EMPTY',
  }
  const explicit = special[row.name]
  if (explicit) return explicit
  const snake = row.name.replace(/([a-z0-9])([A-Z])/gu, '$1_$2').toUpperCase()
  const prefix =
    row.namespace === 'math' ? 'OP_MATH_' : row.namespace === 'guard' ? 'OP_GUARD_' : 'OP_'
  return `${prefix}${snake}`
}

function semanticPublicName(row: LegacyRowV1): string {
  if (row.namespace === 'string' && row.name === 'strLength') return 'length'
  if (row.namespace === 'string' && row.name === 'strIsEmpty') return 'isEmpty'
  if (row.namespace === 'object' && row.name === 'dictIsEmpty') return 'isEmpty'
  return row.name
}

/**
 * A boundary whose result leaves the array domain cannot be followed by
 * another array step, so the compiler has to treat it as the last one.
 */
function compilerFinalBoundary(row: LegacyRowV1): boolean {
  // A `'scalar'`-input boundary (the phase 1.4 stragglers: math/string/
  // object/guard ops applied to the pipe's current value) is never final --
  // it composes with whatever comes next, same as any other step. Every
  // existing final boundary (`sum`, `min`, `length`, `join`, ...) consumes a
  // whole array, so gating on `inputDomain === 'array'` here changes nothing
  // for them.
  return (
    row.compilerPipelineRole === 'boundary' &&
    row.outputDomain !== 'array' &&
    row.inputDomain === 'array'
  )
}

function semanticCardinality(row: LegacyRowV1): CardinalityV1 {
  return row.compilerPipelineRole === 'terminal' ? 'sink' : row.cardinality
}

function semanticEarlyTermination(row: LegacyRowV1): boolean {
  return row.earlyTermination || row.name === 'head' || row.name === 'isEmpty'
}

function semanticFullMaterialization(row: LegacyRowV1): boolean {
  return (
    row.cardinality === 'materializer' &&
    row.compilerPipelineRole !== 'terminal' &&
    row.name !== 'scan'
  )
}

function outputShapeFunction(row: LegacyRowV1, cardinality: CardinalityV1): string {
  if (row.outputDomain === 'scalar') return '@stopcock/fp/shape/scalar-v1'
  if (row.inputDomain === 'scalar') return '@stopcock/fp/shape/array-from-scalar-v1'
  if (row.name === 'scan') return '@stopcock/fp/shape/input-plus-seed-array-v1'
  if (cardinality === 'one-to-one') return '@stopcock/fp/shape/same-length-array-v1'
  if (cardinality === 'filtering') return '@stopcock/fp/shape/filtered-array-v1'
  if (cardinality === 'expanding') return '@stopcock/fp/shape/expanded-array-v1'
  if (cardinality === 'stateful') return '@stopcock/fp/shape/bounded-array-v1'
  return '@stopcock/fp/shape/materialized-array-v1'
}

function bindingDefinitions(row: LegacyRowV1): readonly BindingDefinitionV1[] {
  return row.bindings.map((slot, index) => ({
    slot,
    role:
      row.callbackArity > 0 && index === 0 && slot === 'fn'
        ? 'callback'
        : slot === 'a1' && row.callbackArity === 2
          ? 'seed'
          : 'constant',
    required: true,
  }))
}

/** Operators whose callback walks the source from the last element backwards. */
const RIGHT_TO_LEFT_CALLBACK_NAMES: ReadonlySet<string> = new Set([
  'dropLastWhile',
  'findLast',
  'findLastIndex',
  'mapAccumRight',
  'mapAccumRight',
  'reduceRight',
  'takeLastWhile',
])

/**
 * Operators whose built-in draws on Math.random, so two calls on the same
 * input need not agree. Their lowering is still exact -- every tier makes the
 * same single call to the same operator -- but no tier may cache or elide it
 * on the assumption that the result is a function of the input.
 */
const NONDETERMINISTIC_NAMES: ReadonlySet<string> = new Set(['sample', 'shuffle'])

/** Operators whose callback takes the element's position as a second argument. */
const INDEXED_CALLBACK_NAMES: ReadonlySet<string> = new Set([
  'filterWithIndex',
  'forEachWithIndex',
  'mapWithIndex',
])

function callbackContract(row: LegacyRowV1): CallbackContractV1 {
  if (row.name === 'sortBy' || row.name === 'sortInline') return COMPARATOR_CALLBACK
  if (INDEXED_CALLBACK_NAMES.has(row.name)) return INDEXED_VALUE_CALLBACK
  if (row.callbackArity === 0) return NO_CALLBACK
  if (RIGHT_TO_LEFT_CALLBACK_NAMES.has(row.name)) {
    return row.callbackArity === 1 ? REVERSE_VALUE_CALLBACK : REVERSE_REDUCER_CALLBACK
  }
  if (row.callbackArity === 1) return VALUE_CALLBACK
  return REDUCER_CALLBACK
}

function semanticIdentity(semantic: OperatorSemanticV1): SemanticIdentityV1 {
  return {
    semanticId: semantic.semanticId,
    semanticRevision: semantic.semanticRevision,
    semanticHash: semantic.semanticHash,
  }
}

function resultOwnership(outputDomain: LogicalDomainV1): ResultOwnershipV1 {
  return outputDomain === 'array' ? 'fresh' : 'scalar-or-borrowed'
}

function createRecord(row: LegacyRowV1): OperatorDefinitionRecordV1 {
  const cardinality = semanticCardinality(row)
  const callback = callbackContract(row)
  const acceptedLayouts = row.inputDomain === 'array' ? ARRAY_LAYOUTS : SCALAR_LAYOUTS
  const streamTermination = row.inputDomain === 'array' && row.outputDomain !== 'array'
  const termination = {
    earlyTermination: semanticEarlyTermination(row),
    streamTermination,
    fullMaterialization: semanticFullMaterialization(row),
    domainTransition: row.inputDomain !== row.outputDomain,
  } as const
  const result = resultOwnership(row.outputDomain)
  const ownership: OwnershipContractV1 = {
    input: 'borrowed-readonly',
    result,
    aliasing: result === 'fresh' ? 'none' : 'borrowed-element-only',
    detachment: 'forbidden',
    resultStorage:
      row.outputDomain === 'array' ? (['js-array'] as const) : (['js-scalar'] as const),
    scratchStorage:
      row.cardinality === 'materializer' ? (['js-array'] as const) : (['none'] as const),
    allocationScopes:
      row.outputDomain === 'array'
        ? (['fusion-runner-result', 'fusion-runner-scratch'] as const)
        : (['none'] as const),
  }
  const semanticId = `@stopcock/fp/${row.namespace}/${semanticPublicName(row)}`
  const semantic = defineOperatorV1({
    protocol: OPERATOR_PROTOCOL_V1,
    protocolVersion: OPERATOR_PROTOCOL_VERSION_V1,
    semanticId,
    semanticRevision: 1,
    publicName: semanticPublicName(row),
    inputDomain: row.inputDomain,
    outputDomain: row.outputDomain,
    acceptedLayouts,
    cardinality,
    outputShapeFunction: outputShapeFunction(row, cardinality),
    bindings: bindingDefinitions(row),
    callback,
    evaluation: {
      exact: 'observable-order-and-count',
      pure: row.pureLowering ? 'equivalent-rewrite-allowed' : 'unsupported',
      effects: callback.arity > 0 ? 'callback-effects-observable' : 'built-in-effects-only',
      determinism: NONDETERMINISTIC_NAMES.has(row.name)
        ? 'nondeterministic-built-in'
        : 'deterministic-except-user-code',
      sourceMutationVisibility:
        row.inputDomain === 'array'
          ? 'snapshot-array-length-then-dense-index-read'
          : 'scalar-value',
      thrownErrorIdentity: 'preserved',
      thrownErrorTiming: 'original-evaluation-point',
    },
    termination,
    ownership,
    capabilities: UNSUPPORTED_CAPABILITIES,
    diagnosticTag: {
      opcodeField: '_op',
      bindingFields: row.bindings.map((slot) => `_${slot}` as const),
      authority: 'diagnostic-only',
    },
    links: {
      referenceImplementationId: `@stopcock/fp/reference/${row.namespace}/${row.name}/v1`,
      lawIds: [`@stopcock/fp/law/${row.namespace}/${row.name}/v1`],
      differentialCorpusIds:
        row.compilerPipelineRole === null ? [] : [COMPILER_OPERATION_CORPUS_ID_V1],
    },
  })
  const identity = semanticIdentity(semantic)
  const acceptedSemanticModes = row.pureLowering
    ? (['exact', 'pure'] as const)
    : (['exact'] as const)
  const loweringOwnership = {
    result: ownership.result,
    aliasing: ownership.aliasing,
    resultStorage: ownership.resultStorage,
    scratchStorage: ownership.scratchStorage,
    allocationScopes: ownership.allocationScopes,
  }
  const legacyLowering = defineLoweringV1({
    protocol: LOWERING_PROTOCOL_V1,
    protocolVersion: LOWERING_PROTOCOL_VERSION_V1,
    loweringId: `${semanticId}/lowering/legacy-portable`,
    loweringRevision: 1,
    loweringAbiVersion: 1,
    semantic: identity,
    targetTier: 'legacy',
    targetBackend: 'portable',
    acceptedSemanticModes,
    acceptedLayouts,
    cardinality,
    outputShapeFunction: semantic.outputShapeFunction,
    termination,
    ownership: loweringOwnership,
    capability: {
      predicateId: '@stopcock/fp/capability/legacy-portable-v1',
      rejectionCodes: [
        '@stopcock/reason/unsupported-layout',
        '@stopcock/reason/semantic-mode-mismatch',
      ],
    },
    runnerId: `@stopcock/fp/runner/legacy/${row.name}/v1`,
    exactFallback: identity,
    compilerPipelineRole: 'none',
    compilerFinalBoundary: false,
  })
  const compilerRole = row.compilerPipelineRole ?? 'none'
  const lowerings: OperatorLoweringV1[] = [legacyLowering]
  if (compilerRole !== 'none') {
    lowerings.push(
      defineLoweringV1({
        protocol: LOWERING_PROTOCOL_V1,
        protocolVersion: LOWERING_PROTOCOL_VERSION_V1,
        loweringId: `${semanticId}/lowering/compiler-aot`,
        loweringRevision: 1,
        loweringAbiVersion: 1,
        semantic: identity,
        targetTier: 'compiler',
        targetBackend: 'aot',
        acceptedSemanticModes,
        acceptedLayouts,
        cardinality,
        outputShapeFunction: semantic.outputShapeFunction,
        termination,
        ownership: loweringOwnership,
        capability: {
          predicateId: '@stopcock/fp-compiler/capability/static-pipeline-v1',
          rejectionCodes: [
            '@stopcock/reason/unsupported-binding-form',
            '@stopcock/reason/opaque-callback',
            '@stopcock/reason/semantic-mode-mismatch',
          ],
        },
        runnerId: `@stopcock/fp-compiler/runner/${compilerRole}/${row.name}/v1`,
        exactFallback: identity,
        compilerPipelineRole: compilerRole,
        compilerFinalBoundary: compilerFinalBoundary(row),
      }),
    )
  }

  return {
    semantic,
    lowerings,
    legacyRuntime: {
      opcode: row.opcode,
      opcodeConstant: opcodeConstantFor(row),
      tagName: row.hasPublicTagEncoding ? row.name : null,
      name: row.name,
      inputDomain: row.inputDomain,
      outputDomain: row.outputDomain,
      cardinality: row.cardinality,
      callbackArity: row.callbackArity,
      callbackArityDisposition:
        row.callbackArity === semantic.callback.arity
          ? 'matches-semantic'
          : 'legacy-comparator-metadata-preserved',
      bindings: row.bindings,
      earlyTermination: row.earlyTermination,
      constructorPreserving: row.constructorPreserving,
      reverseSafe: row.reverseSafe,
      exactLowering: true,
      pureLowering: row.pureLowering,
      simdEligible: row.previousSimdDeclaration,
      workerEligible: row.previousWorkerDeclaration,
      isMaterializationBoundary: row.cardinality === 'sink' || row.cardinality === 'materializer',
    },
    compilerName: row.name,
    namespace: row.namespace,
    publicArrayExport: row.publicArrayExport,
    compilerPipelineRole: compilerRole,
    compilerFinalBoundary: compilerFinalBoundary(row),
    ...emitDeclarationFor(row),
    contradictionDisposition:
      row.cardinality === cardinality
        ? 'legacy-classification-retained'
        : 'compiler-streaming-terminal-is-canonical',
    previousCapabilityDeclarations: {
      simd: row.previousSimdDeclaration,
      worker: row.previousWorkerDeclaration,
      disposition: 'unsupported-without-owned-implementation-and-corpus',
    },
  }
}

/**
 * Builds a compiler-only `OperatorDefinitionRecordV1` for the option/result
 * domains (phase 2): a semantic identity and exactly one lowering (compiler
 * tier, aot backend), no `legacyRuntime` at all. `generateProtocolViewsV1`
 * only reads `legacyRuntime` to build `opcodes.ts`/`registry.ts`, so leaving
 * it absent is what keeps these ops out of both files -- they run today as
 * plain function calls through `pipe` (already correct) until a compiled
 * site recognizes them via `ops-table.ts`.
 */
function createCompilerOnlyRecord(row: OptionResultRowV1): OperatorDefinitionRecordV1 {
  const cardinality: CardinalityV1 = row.compilerPipelineRole === 'terminal' ? 'sink' : 'one-to-one'
  const semanticId = `@stopcock/fp/${row.namespace}/${row.publicName}`
  const termination = {
    earlyTermination: false,
    streamTermination: false,
    fullMaterialization: false,
    domainTransition: row.inputDomain !== row.outputDomain,
  } as const
  const result = resultOwnership(row.outputDomain)
  const ownership: OwnershipContractV1 = {
    input: 'borrowed-readonly',
    result,
    aliasing: result === 'fresh' ? 'none' : 'borrowed-element-only',
    detachment: 'forbidden',
    resultStorage: ['js-scalar'],
    scratchStorage: ['none'],
    allocationScopes: ['none'],
  }
  const bindings: BindingDefinitionV1[] = row.bindings.map((slot) => ({
    slot,
    role: slot === 'fn' ? 'callback' : 'constant',
    required: true,
  }))
  const outputShapeFunction =
    row.outputDomain === 'option'
      ? '@stopcock/fp/shape/option-v1'
      : row.outputDomain === 'result'
        ? '@stopcock/fp/shape/result-v1'
        : '@stopcock/fp/shape/scalar-v1'
  const semantic = defineOperatorV1({
    protocol: OPERATOR_PROTOCOL_V1,
    protocolVersion: OPERATOR_PROTOCOL_VERSION_V1,
    semanticId,
    semanticRevision: 1,
    publicName: row.publicName,
    inputDomain: row.inputDomain,
    outputDomain: row.outputDomain,
    acceptedLayouts: row.namespace === 'option' ? OPTION_LAYOUTS : RESULT_LAYOUTS,
    cardinality,
    outputShapeFunction,
    bindings,
    callback: row.callback,
    evaluation: {
      exact: 'observable-order-and-count',
      pure: 'unsupported',
      effects: row.callback.arity > 0 ? 'callback-effects-observable' : 'built-in-effects-only',
      determinism: 'deterministic-except-user-code',
      sourceMutationVisibility: 'scalar-value',
      thrownErrorIdentity: 'preserved',
      thrownErrorTiming: 'original-evaluation-point',
    },
    termination,
    ownership,
    capabilities: UNSUPPORTED_CAPABILITIES,
    diagnosticTag: {
      opcodeField: '_op',
      bindingFields: bindings.map(({ slot }) => `_${slot}` as const),
      authority: 'diagnostic-only',
    },
    links: {
      referenceImplementationId: `@stopcock/fp/reference/${row.namespace}/${row.publicName}/v1`,
      lawIds: [`@stopcock/fp/law/${row.namespace}/${row.publicName}/v1`],
      differentialCorpusIds: [COMPILER_OPERATION_CORPUS_ID_V1],
    },
  })
  const identity = semanticIdentity(semantic)
  const loweringOwnership = {
    result: ownership.result,
    aliasing: ownership.aliasing,
    resultStorage: ownership.resultStorage,
    scratchStorage: ownership.scratchStorage,
    allocationScopes: ownership.allocationScopes,
  }
  const compilerLowering = defineLoweringV1({
    protocol: LOWERING_PROTOCOL_V1,
    protocolVersion: LOWERING_PROTOCOL_VERSION_V1,
    loweringId: `${semanticId}/lowering/compiler-aot`,
    loweringRevision: 1,
    loweringAbiVersion: 1,
    semantic: identity,
    targetTier: 'compiler',
    targetBackend: 'aot',
    acceptedSemanticModes: ['exact'],
    acceptedLayouts: row.namespace === 'option' ? OPTION_LAYOUTS : RESULT_LAYOUTS,
    cardinality,
    outputShapeFunction: semantic.outputShapeFunction,
    termination,
    ownership: loweringOwnership,
    capability: {
      predicateId: '@stopcock/fp-compiler/capability/static-pipeline-v1',
      rejectionCodes: [
        '@stopcock/reason/unsupported-binding-form',
        '@stopcock/reason/opaque-callback',
        '@stopcock/reason/semantic-mode-mismatch',
      ],
    },
    runnerId: `@stopcock/fp-compiler/runner/${row.compilerPipelineRole}/${row.compilerName}/v1`,
    exactFallback: identity,
    compilerPipelineRole: row.compilerPipelineRole,
    compilerFinalBoundary: false,
  })
  return {
    semantic,
    lowerings: [compilerLowering],
    compilerName: row.compilerName,
    namespace: row.namespace,
    publicArrayExport: false,
    compilerPipelineRole: row.compilerPipelineRole,
    compilerFinalBoundary: false,
    emit: OPTION_RESULT_EMIT_TEMPLATES[row.compilerName],
    fusible: true,
    contradictionDisposition: 'legacy-classification-retained',
    previousCapabilityDeclarations: {
      simd: false,
      worker: false,
      disposition: 'unsupported-without-owned-implementation-and-corpus',
    },
  }
}

function freezeDefinitionRecordV1(record: OperatorDefinitionRecordV1): OperatorDefinitionRecordV1 {
  return Object.freeze({
    ...record,
    lowerings: Object.freeze([...record.lowerings]),
    ...(record.legacyRuntime === undefined
      ? {}
      : {
          legacyRuntime: Object.freeze({
            ...record.legacyRuntime,
            bindings: Object.freeze([...record.legacyRuntime.bindings]),
          }),
        }),
    previousCapabilityDeclarations: Object.freeze({
      ...record.previousCapabilityDeclarations,
    }),
  })
}

export const OPERATOR_DEFINITION_RECORDS_V1: readonly OperatorDefinitionRecordV1[] = Object.freeze(
  [...LEGACY_ROWS.map(createRecord), ...OPTION_RESULT_ROWS.map(createCompilerOnlyRecord)]
    .map(freezeDefinitionRecordV1)
    .sort((left, right) => {
      const byId = left.semantic.semanticId.localeCompare(right.semantic.semanticId)
      return byId !== 0 ? byId : left.semantic.semanticRevision - right.semantic.semanticRevision
    }),
)

export function assertRuntimeEncodingCatalogueV1(
  records: readonly OperatorDefinitionRecordV1[],
): void {
  const opcodes = new Set<number>()
  const constants = new Set<string>()
  const runtimeNames = new Set<string>()
  const publicTags = new Set<string>()
  for (const {
    semantic,
    legacyRuntime,
    previousCapabilityDeclarations,
    publicArrayExport,
  } of records) {
    // A compiler-only record (option/result) never had a 1.x runtime
    // encoding and mints no opcode/registry row at all -- see the comment on
    // `OperatorDefinitionRecordV1.legacyRuntime`.
    if (legacyRuntime === undefined) continue
    if (!Number.isSafeInteger(legacyRuntime.opcode) || legacyRuntime.opcode < 1) {
      throw new Error(`operator definitions v1: invalid opcode ${legacyRuntime.opcode}`)
    }
    if (opcodes.has(legacyRuntime.opcode)) {
      throw new Error(`operator definitions v1: duplicate opcode ${legacyRuntime.opcode}`)
    }
    if (constants.has(legacyRuntime.opcodeConstant)) {
      throw new Error(
        `operator definitions v1: duplicate opcode constant ${legacyRuntime.opcodeConstant}`,
      )
    }
    if (runtimeNames.has(legacyRuntime.name)) {
      throw new Error(`operator definitions v1: duplicate runtime name ${legacyRuntime.name}`)
    }
    if (publicArrayExport && legacyRuntime.name !== semantic.publicName) {
      throw new Error(`operator definitions v1: runtime name contradicts ${semantic.semanticId}`)
    }
    if (legacyRuntime.tagName !== null && publicTags.has(legacyRuntime.tagName)) {
      throw new Error(`operator definitions v1: duplicate public tag ${legacyRuntime.tagName}`)
    }
    const callbackArityMatches = legacyRuntime.callbackArity === semantic.callback.arity
    if (callbackArityMatches !== (legacyRuntime.callbackArityDisposition === 'matches-semantic')) {
      throw new Error(
        `operator definitions v1: runtime callback disposition contradicts ${semantic.semanticId}`,
      )
    }
    if (
      !callbackArityMatches &&
      !(
        legacyRuntime.callbackArityDisposition === 'legacy-comparator-metadata-preserved' &&
        legacyRuntime.callbackArity === 1 &&
        semantic.callback.arity === 2 &&
        semantic.callback.arguments[0] === 'left' &&
        semantic.callback.arguments[1] === 'right' &&
        (legacyRuntime.name === 'sortBy' || legacyRuntime.name === 'sortInline')
      )
    ) {
      throw new Error(
        `operator definitions v1: undeclared runtime callback contradiction for ${semantic.semanticId}`,
      )
    }
    if (
      JSON.stringify(legacyRuntime.bindings) !==
      JSON.stringify(semantic.bindings.map(({ slot }) => slot))
    ) {
      throw new Error(`operator definitions v1: runtime bindings contradict ${semantic.semanticId}`)
    }
    if (
      legacyRuntime.simdEligible !== previousCapabilityDeclarations.simd ||
      legacyRuntime.workerEligible !== previousCapabilityDeclarations.worker
    ) {
      throw new Error(
        `operator definitions v1: legacy capability projection drifted for ${semantic.semanticId}`,
      )
    }
    opcodes.add(legacyRuntime.opcode)
    constants.add(legacyRuntime.opcodeConstant)
    runtimeNames.add(legacyRuntime.name)
    if (legacyRuntime.tagName !== null) publicTags.add(legacyRuntime.tagName)
  }
}

/**
 * Invariant 4: every op has an `emit` template or is marked `fusible:
 * false`. No third state. This is the coverage rule from phase 1.2, and it
 * runs before any generated file is written.
 */
export function assertEmitCoverageV1(records: readonly OperatorDefinitionRecordV1[]): void {
  for (const record of records) {
    const hasEmit = record.emit !== undefined
    if (record.fusible && !hasEmit) {
      throw new Error(
        `operator definitions v1: ${record.semantic.semanticId} is fusible but has no emit template`,
      )
    }
    if (!record.fusible && hasEmit) {
      throw new Error(
        `operator definitions v1: ${record.semantic.semanticId} is fusible: false but declares an emit template`,
      )
    }
  }
}

export const OPERATOR_SEMANTICS_V1: readonly OperatorSemanticV1[] = Object.freeze(
  OPERATOR_DEFINITION_RECORDS_V1.map((record) => record.semantic),
)

export const OPERATOR_LOWERINGS_V1: readonly OperatorLoweringV1[] = Object.freeze(
  OPERATOR_DEFINITION_RECORDS_V1.flatMap((record) => record.lowerings).sort((left, right) => {
    const byId = left.loweringId.localeCompare(right.loweringId)
    return byId !== 0 ? byId : left.loweringRevision - right.loweringRevision
  }),
)

export const FUSION_RUNNER_DESCRIPTORS_V1 = Object.freeze(
  OPERATOR_LOWERINGS_V1.map(projectRunnerDescriptorV1),
)

assertRuntimeEncodingCatalogueV1(OPERATOR_DEFINITION_RECORDS_V1)
assertEmitCoverageV1(OPERATOR_DEFINITION_RECORDS_V1)
assertOperatorCatalogueV1(
  OPERATOR_SEMANTICS_V1,
  OPERATOR_LOWERINGS_V1,
  FUSION_RUNNER_DESCRIPTORS_V1,
)

const RUNTIME_RECORDS_BY_NAME = new Map(
  OPERATOR_DEFINITION_RECORDS_V1.map((record) => [record.compilerName, record]),
)

export function requireOperatorDefinitionByNameV1(name: string): OperatorDefinitionRecordV1 {
  const record = RUNTIME_RECORDS_BY_NAME.get(name)
  if (!record) throw new Error(`operator definitions v1: unknown operator ${name}`)
  return record
}

export function runtimeOpcodeByNameV1(name: string): number {
  const record = requireOperatorDefinitionByNameV1(name)
  if (record.legacyRuntime === undefined || record.legacyRuntime.tagName === null) {
    throw new Error(`operator definitions v1: ${name} has no public tag encoding`)
  }
  return record.legacyRuntime.opcode
}

export function findRuntimeOpcodeByNameV1(name: string): number | undefined {
  const record = RUNTIME_RECORDS_BY_NAME.get(name)
  if (record?.legacyRuntime === undefined || record.legacyRuntime.tagName === null) return undefined
  return record.legacyRuntime.opcode
}

/** Only the runtime-encoded records (those with `legacyRuntime`): a
 * compiler-only row (option/result) has no opcode to sort by and must never
 * reach `opcodes.ts`/`registry.ts` generation. */
/** A definition record guaranteed to carry `legacyRuntime` -- every record
 * that reaches `opcodes.ts`/`registry.ts` generation. */
export type RuntimeBackedOperatorDefinitionRecordV1 = OperatorDefinitionRecordV1 & {
  readonly legacyRuntime: LegacyRuntimeFactV1
}

export function runtimeRecordsInOpcodeOrderV1(): readonly RuntimeBackedOperatorDefinitionRecordV1[] {
  return Object.freeze(
    OPERATOR_DEFINITION_RECORDS_V1.filter(
      (record): record is RuntimeBackedOperatorDefinitionRecordV1 =>
        record.legacyRuntime !== undefined,
    ).sort((left, right) => left.legacyRuntime.opcode - right.legacyRuntime.opcode),
  )
}
