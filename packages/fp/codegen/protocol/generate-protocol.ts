import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPILER_OPERATION_CORPUS_ID_V1,
  FUSION_RUNNER_DESCRIPTORS_V1,
  OPERATOR_DEFINITION_RECORDS_V1,
  OPERATOR_LOWERINGS_V1,
  OPERATOR_SEMANTICS_V1,
  assertEmitCoverageV1,
  assertRuntimeEncodingCatalogueV1,
  runtimeRecordsInOpcodeOrderV1,
  type OperatorDefinitionRecordV1,
  type RuntimeBackedOperatorDefinitionRecordV1,
} from './operator-definitions'
import {
  assertOperatorCatalogueV1,
  hashCanonical,
  type FusionRunnerDescriptorV1,
  type OpEmit,
  type OperatorEvidenceCorpusJoinV1,
  type OperatorLoweringV1,
  type OperatorSemanticV1,
} from './operator-v1'
import {
  FUSION_RUNNER_PROTOCOL,
  FUSION_RUNNER_PROTOCOL_VERSION,
} from './fusion-runner-v1'

const FP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const REPO_ROOT = resolve(FP_ROOT, '../..')

/** Single authority for the packed FP-to-optimizer wire versions. */
export const OPTIMIZER_ABI_VERSION_V1 = 2
export const OPTIMIZER_PROTOCOL_VERSION_V1 = 1
export const OPTIMIZER_BANK_PROTOCOL_VERSION_V1 = 1

export const RETAINED_COMPILER_OPERATION_CORPUS_V1 = Object.freeze<OperatorEvidenceCorpusJoinV1>({
  corpusId: COMPILER_OPERATION_CORPUS_ID_V1,
  corpusHash: 'sha256:5b67b126ece103aac8d9a77cc03004f60b8748377e4a41ab4b42a9f088ee8dec',
})

export interface ProtocolCatalogueV1 {
  readonly definitions: readonly OperatorDefinitionRecordV1[]
  readonly semantics: readonly OperatorSemanticV1[]
  readonly lowerings: readonly OperatorLoweringV1[]
  readonly runnerDescriptors: readonly FusionRunnerDescriptorV1[]
}

const CANONICAL_PROTOCOL_CATALOGUE_V1 = Object.freeze<ProtocolCatalogueV1>({
  definitions: OPERATOR_DEFINITION_RECORDS_V1,
  semantics: OPERATOR_SEMANTICS_V1,
  lowerings: OPERATOR_LOWERINGS_V1,
  runnerDescriptors: FUSION_RUNNER_DESCRIPTORS_V1,
})

export function emitAfterProtocolCatalogueValidationV1<Result>(
  catalogue: ProtocolCatalogueV1,
  emit: () => Result,
): Result {
  assertRuntimeEncodingCatalogueV1(catalogue.definitions)
  assertEmitCoverageV1(catalogue.definitions)
  assertOperatorCatalogueV1(catalogue.semantics, catalogue.lowerings, catalogue.runnerDescriptors)
  return emit()
}

function emitAfterCanonicalProtocolValidationV1<Result>(emit: () => Result): Result {
  return emitAfterProtocolCatalogueValidationV1(CANONICAL_PROTOCOL_CATALOGUE_V1, emit)
}

export const PROTOCOL_GENERATED_PATHS_V1 = ['packages/fp-compiler/src/ops-table.ts'] as const

function absolute(relativePath: string): string {
  return resolve(REPO_ROOT, relativePath)
}

function writeGenerated(relativePath: string, contents: string): void {
  const path = absolute(relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}


const OPTIMIZER_OPCODE_VOCABULARY_V1 = Object.freeze(
  runtimeRecordsInOpcodeOrderV1().map((record) => ({
    opcode: record.legacyRuntime.opcode,
    semanticId: record.semantic.semanticId,
    semanticRevision: record.semantic.semanticRevision,
    semanticHash: record.semantic.semanticHash,
  })),
)

/**
 * The FP-owned, data-only projection of the optimizer boundary.  These facts
 * intentionally describe the wire and execution contracts, never a concrete
 * optimizer runner bank: FP must be able to ship and validate on its own.
 *
 * Keep these as plain objects rather than TypeScript type strings.  Their
 * canonical hashes are release facts and therefore remain meaningful across
 * package builds and physical installations.
 */
const OPTIMIZER_RUNNER_SCHEMA_V1 = Object.freeze({
  protocol: 'stopcock.optimizer-runner-schema',
  protocolVersion: 1,
  bank: {
    fields: [
      'protocol',
      'protocolVersion',
      'semanticManifestHash',
      'bankHash',
      'genericFallbackId',
      'runnerCount',
      'descriptors',
    ],
    protocol: 'stopcock.fusion-runner-bank',
    protocolVersion: OPTIMIZER_BANK_PROTOCOL_VERSION_V1,
    semanticManifestHash: 'sha256/canonical-operator-manifest',
    bankHash: 'sha256/canonical-runner-bank-projection',
    genericFallbackId: 'fusion-runner/generic-exact',
    runnerCount: 'safe-integer/non-negative/equals-descriptors-length',
    descriptors: {
      ordering: 'runner-id/ascending',
      identityFields: [
        'protocol',
        'protocolVersion',
        'semanticManifestHash',
        'bankHash',
        'runnerId',
        'descriptorHash',
      ],
      fields: [
        'protocol',
        'protocolVersion',
        'semanticManifestHash',
        'bankHash',
        'runnerId',
        'semanticSequence',
        'mode',
        'capability',
        'outputShape',
        'cardinality',
        'termination',
        'materializes',
        'domainBoundary',
        'reportsConsumed',
        'resultOwnership',
        'aliasesInput',
        'allocationScope',
        'scratchClass',
        'fallbackRunnerId',
        'descriptorHash',
      ],
      protocol: FUSION_RUNNER_PROTOCOL,
      protocolVersion: FUSION_RUNNER_PROTOCOL_VERSION,
      semanticManifestHash: 'equals-bank-semantic-manifest-hash',
      bankHash: 'equals-bank-hash',
      runnerId: 'stable/non-empty/unique-within-bank',
      semanticSequence: {
        element: 'safe-integer/positive/registered-opcode',
        vocabulary: OPTIMIZER_OPCODE_VOCABULARY_V1,
        cardinality: 'non-empty',
      },
      mode: ['exact'],
      capability: {
        fields: [
          'layouts',
          'arity',
          'readsBindingSlots',
          'requiredBindingSlots',
          'rejectionCodes',
        ],
        layouts: ['dense-array', 'array-like'],
        arity: 'safe-integer/positive/equals-semantic-sequence-length',
        readsBindingSlots: {
          element: ['fn', 'a1', 'a2'],
          ordering: 'stable/no-duplicates',
        },
        requiredBindingSlots: {
          element: ['fn', 'a1', 'a2'],
          relation: 'subset-of-reads-binding-slots',
          ordering: 'stable/no-duplicates',
        },
        rejectionCodes: [
          'layout-unsupported',
          'arity-mismatch',
          'binding-incomplete',
          'domain-boundary',
        ],
      },
      outputShape: ['array', 'scalar', 'option', 'boolean', 'index'],
      cardinality: ['one-to-one', 'filtering', 'folding', 'expanding'],
      termination: ['exhaustive', 'limit', 'predicate'],
      materializes: 'boolean',
      domainBoundary: ['none', 'sum-materializer'],
      reportsConsumed: 'boolean',
      resultOwnership: ['fresh', 'borrowed'],
      aliasesInput: 'boolean',
      allocationScope: ['none', 'result-only', 'scratch'],
      scratchClass: ['none', 'per-call'],
      fallbackRunnerId: 'fusion-runner/generic-exact',
      descriptorHash: 'sha256/canonical-descriptor-without-bank-and-semantic-identities',
    },
    genericFallback: {
      runnerId: 'fusion-runner/generic-exact',
      mode: 'exact',
      coverage: 'all-vetted-plan-shapes',
      bindingLifetime: 'per-invocation-input/no-runner-bank-retention',
    },
  },
})

const OPTIMIZER_ABI_IDENTITY_FIELDS_V1 = Object.freeze([
  'abiVersion',
  'protocolVersion',
  'semanticManifestHash',
  'runnerSchemaHash',
  'bindingSchemaHash',
  'consumeSchemaHash',
  'executionContractHash',
])

const OPTIMIZER_BINDING_SCHEMA_V1 = Object.freeze({
  protocol: 'stopcock.optimizer-binding-schema',
  protocolVersion: 1,
  vettedPlan: {
    fields: [
      'instanceToken',
      'identity',
      'codes',
      'segments',
      'bindings',
      'mode',
      'layout',
      'fullyTrusted',
    ],
    instanceToken: 'opaque-per-fp-module/identity-only/non-serializable',
    identity: {
      fields: OPTIMIZER_ABI_IDENTITY_FIELDS_V1,
      values: 'exact-generated-release-facts',
    },
    codes: {
      dataGateElement: 'safe-integer/non-negative',
      authenticatedPlanElement: 'zero-non-fuseable-sentinel-or-registered-opcode',
      nonFuseableSentinel: 0,
      registeredVocabulary: OPTIMIZER_OPCODE_VOCABULARY_V1,
      ordering: 'pipeline-order',
    },
    segments: {
      fields: ['kind', 'domain', 'startIndex', 'length'],
      kind: ['stream', 'boundary', 'opaque'],
      domain: ['array', 'scalar', 'iterable'],
      startIndex: 'safe-integer/non-negative',
      length: 'safe-integer/positive',
      coverage: 'ordered-contiguous-complete-over-codes',
    },
    bindings: {
      stepFields: ['fn', 'a1', 'a2', 'opaqueFn'],
      optionalFields: ['fn', 'a1', 'a2', 'opaqueFn'],
      opaqueFn: 'present-only-for-corresponding-opaque-segment-step',
      cardinality: 'equals-codes-length',
      ordering: 'one-binding-per-code/pipeline-order',
      boundaryTransfer: 'fresh-vetted-plan-data',
      shapeCaches: 'no-bindings-or-callables',
      pipeIdentityCache:
        'bounded-four-entry/exact-step-identity/bindings-retained-until-entry-eviction',
      compiledRunner:
        'bindings-retained-until-returned-runner-and-weak-runner-record-are-unreachable',
      reuse: 'never-across-different-step-identities',
    },
    mode: ['exact', 'pure'],
    layout: ['dense-array'],
    fullyTrusted:
      'boolean/false-only-for-foreign-or-untrusted-provenance/trusted-non-fuseable-may-remain-true',
  },
  semantics: OPERATOR_SEMANTICS_V1.map((semantic) => ({
    semanticId: semantic.semanticId,
    semanticRevision: semantic.semanticRevision,
    semanticHash: semantic.semanticHash,
    bindings: semantic.bindings,
    callback: semantic.callback,
  })),
})

const OPTIMIZER_CONSUME_SCHEMA_V1 = Object.freeze({
  protocol: 'stopcock.optimizer-consume-schema',
  protocolVersion: 1,
  consumeMeta: {
    fields: ['consumed'],
    consumed: 'safe-integer/first-true-source-read/only-early-termination',
    ownership: 'fresh-caller-owned',
  },
})

const OPTIMIZER_EXECUTION_CONTRACT_V1 = Object.freeze({
  protocol: 'stopcock.optimizer-execution-contract',
  protocolVersion: 1,
  boundary: {
    modes: ['exact', 'pure'],
    layout: 'dense-array',
    shape: 'codes-and-contiguous-segments',
    output: 'same-as-fp-exact-fallback',
    evaluationOrder: 'source-order/callback-order',
    effects: 'exact-mode-preserves-observable-effects',
    errors: 'deterministic-original-thrown-error-identity',
    termination: 'descriptor-declared-and-consume-reported',
    sourceMutation: 'same-snapshot-boundary-as-fp-exact-fallback',
    ownership: 'fresh-result-unless-descriptor-declares-aliasing',
    aliasing: 'descriptor-declared',
    scratch: 'descriptor-declared/no-callable-retention',
  },
  semantics: OPERATOR_SEMANTICS_V1.map((semantic) => ({
    semanticId: semantic.semanticId,
    semanticRevision: semantic.semanticRevision,
    semanticHash: semantic.semanticHash,
    inputDomain: semantic.inputDomain,
    outputDomain: semantic.outputDomain,
    acceptedLayouts: semantic.acceptedLayouts,
    cardinality: semantic.cardinality,
    outputShapeFunction: semantic.outputShapeFunction,
    evaluation: semantic.evaluation,
    termination: semantic.termination,
    ownership: semantic.ownership,
  })),
})

export const OPTIMIZER_RUNNER_SCHEMA_V1_HASH = hashCanonical(OPTIMIZER_RUNNER_SCHEMA_V1)
export const OPTIMIZER_BINDING_SCHEMA_V1_HASH = hashCanonical(OPTIMIZER_BINDING_SCHEMA_V1)
export const OPTIMIZER_CONSUME_SCHEMA_V1_HASH = hashCanonical(OPTIMIZER_CONSUME_SCHEMA_V1)
export const OPTIMIZER_EXECUTION_CONTRACT_V1_HASH = hashCanonical(OPTIMIZER_EXECUTION_CONTRACT_V1)

interface CompilerTableEntryV1 {
  readonly name: string
  readonly callbackArity: 0 | 1 | 2
  readonly bindings: readonly ('fn' | 'a1' | 'a2')[]
  readonly semanticId: string
  readonly semanticRevision: number
  readonly inputDomain: string
  readonly outputDomain: string
  readonly cardinality: string
  readonly streamTermination: boolean
  readonly fullMaterialization: boolean
  readonly domainTransition: boolean
  readonly loweringId: string
  readonly loweringRevision: number
  readonly runnerId: string
  readonly compilerPipelineRole: 'element' | 'terminal' | 'boundary'
  readonly compilerFinalBoundary: boolean
  readonly emit: OpEmit
}

function compilerEntriesV1(): readonly CompilerTableEntryV1[] {
  // Every op with a compiler-tier lowering belongs in the table, not only the
  // public array exports: phase 1.4 gave the math/string/object/guard
  // stragglers real compiler lowerings too, and `record.compilerPipelineRole`
  // (below) is already `'none'` for anything that declined one.
  return OPERATOR_DEFINITION_RECORDS_V1.filter((record) => record.compilerPipelineRole !== 'none')
    .map((record) => {
      const lowering = record.lowerings.find((candidate) => candidate.targetTier === 'compiler')
      if (!lowering || lowering.compilerPipelineRole === 'none') {
        throw new Error(
          `protocol generation: public compiler operator ${record.semantic.semanticId} has no compiler lowering`,
        )
      }
      if (!record.emit) {
        throw new Error(
          `protocol generation: compiler operator ${record.semantic.semanticId} has no emit template`,
        )
      }
      return {
        // `legacyRuntime.name` (not `semantic.publicName`): the compiler
        // table is one flat namespace keyed by name, and `publicName`
        // deliberately collides across namespaces for a few ops (string's
        // `strLength`/`strIsEmpty` publish as `length`/`isEmpty`, object's
        // `dictIsEmpty` as `isEmpty` -- see `semanticPublicName` in
        // operator-definitions.ts) to match what each module actually
        // exports. `legacyRuntime.name` is the disambiguated registry name,
        // unique across all 166 ops (`assertRuntimeEncodingCatalogueV1`
        // enforces it), and identical to `publicName` for every public array
        // export already in this table. The compiler's own transform.ts
        // resolves a user's written import name back to this canonical name
        // before ever consulting the table. `compilerName` is that same
        // disambiguated name for a compiler-only row too (option/result),
        // which has no `legacyRuntime` to read it from.
        name: record.compilerName,
        callbackArity: record.semantic.callback.arity,
        bindings: record.semantic.bindings.map(({ slot }) => slot),
        semanticId: record.semantic.semanticId,
        semanticRevision: record.semantic.semanticRevision,
        inputDomain: record.semantic.inputDomain,
        outputDomain: record.semantic.outputDomain,
        cardinality: record.semantic.cardinality,
        streamTermination: record.semantic.termination.streamTermination,
        fullMaterialization: record.semantic.termination.fullMaterialization,
        domainTransition: record.semantic.termination.domainTransition,
        loweringId: lowering.loweringId,
        loweringRevision: lowering.loweringRevision,
        runnerId: lowering.runnerId,
        compilerPipelineRole: lowering.compilerPipelineRole,
        compilerFinalBoundary: lowering.compilerFinalBoundary,
        emit: record.emit,
      }
    })
    .sort((left, right) => {
      const byId = left.semanticId.localeCompare(right.semanticId)
      return byId !== 0 ? byId : left.semanticRevision - right.semanticRevision
    })
}

/**
 * Renders one `emit` field as real source, not JSON: a boundary op has no
 * render function, everything else splices its `render` closure's own text
 * in verbatim. `Function.prototype.toString()` is safe here only because
 * every template in `operator-definitions.ts` closes over nothing but its
 * own `ctx` parameter -- see the comment above `ELEMENT_EMIT_TEMPLATES`.
 */
function renderEmitFieldV1(emit: OpEmit): string {
  if (emit.kind === 'boundary') return `{ kind: 'boundary' }`
  const indexed = 'indexed' in emit && emit.indexed ? '\n      indexed: true,' : ''
  return `{
      kind: ${JSON.stringify(emit.kind)},${indexed}
      render: ${emit.render.toString()},
    }`
}

function renderOpsTableEntryV1(entry: CompilerTableEntryV1): string {
  return `  {
    name: ${JSON.stringify(entry.name)},
    callbackArity: ${entry.callbackArity},
    bindings: ${JSON.stringify(entry.bindings)},
    semanticId: ${JSON.stringify(entry.semanticId)},
    semanticRevision: ${entry.semanticRevision},
    inputDomain: ${JSON.stringify(entry.inputDomain)},
    outputDomain: ${JSON.stringify(entry.outputDomain)},
    cardinality: ${JSON.stringify(entry.cardinality)},
    streamTermination: ${entry.streamTermination},
    fullMaterialization: ${entry.fullMaterialization},
    domainTransition: ${entry.domainTransition},
    loweringId: ${JSON.stringify(entry.loweringId)},
    loweringRevision: ${entry.loweringRevision},
    runnerId: ${JSON.stringify(entry.runnerId)},
    compilerPipelineRole: ${JSON.stringify(entry.compilerPipelineRole)},
    compilerFinalBoundary: ${entry.compilerFinalBoundary},
    emit: ${renderEmitFieldV1(entry.emit)},
  }`
}

export function renderCompilerOpsTableV1(): string {
  const entries = compilerEntriesV1()
  const byRole = (role: CompilerTableEntryV1['compilerPipelineRole']): string[] =>
    entries.filter((entry) => entry.compilerPipelineRole === role).map((entry) => entry.name)
  const finalBoundaries = entries
    .filter((entry) => entry.compilerFinalBoundary)
    .map((entry) => entry.name)
  return `// GENERATED FILE -- do not edit by hand.
// Source: packages/fp/codegen/protocol/operator-definitions.ts
// The compiler consumes a data-only projection; it never imports FP runtime modules.

/** A callback slot: either the inlined body or a hoisted temp call. \`pre\`
 * carries the hoisted-temp declaration (if any), \`body\` the \`use\`-produced
 * lines, as data rather than a push onto a shared array, so a template
 * controls exactly where the temp lands relative to its own \`pre\` lines. */
export interface CallbackHandle {
  readonly emit: (
    inputVars: readonly string[],
    use: (expr: string) => readonly string[],
  ) => { readonly pre?: readonly string[]; readonly body: readonly string[] }
}

/** Lines a template contributes to the fused loop: \`pre\` before it, \`state\`
 * in the per-segment state block, \`body\` inside the loop, \`close\` after it. */
export interface EmitFragment {
  readonly pre?: readonly string[]
  readonly state?: readonly string[]
  readonly body: readonly string[]
  readonly close?: readonly string[]
}

/** Everything a template needs to render one step, as plain strings. */
export interface ElementEmitCtx {
  readonly index: number
  readonly v: string
  readonly next: string
  readonly a1: string
  readonly a2: string
  readonly indexed: boolean
  readonly position: string
  readonly outerLabel: string
  readonly sequential: boolean
  readonly optionNone: string
  readonly cb: CallbackHandle
}

/** Everything an Option/Result template needs: persistent \`_ok\`/\`_v\`/\`_err\`
 * locals mutated straight-line across every step of one compiled run, no
 * loop. \`err\` is \`''\` for an Option-only run. \`next\` is only populated for
 * a \`'terminal'\`-role step. */
export interface OptionEmitCtx {
  readonly index: number
  readonly ok: string
  readonly v: string
  readonly err: string
  readonly next: string
  readonly a1: string
  readonly a2: string
  readonly optionNone: string
  readonly cb: CallbackHandle
}

/** Everything a Record/Map/Set template needs: persistent \`_k\`/\`_v\` locals
 * mutated in place across every step of one fused loop iteration (\`k\` is
 * unused/empty for a Set, which has no key). \`next\` is only populated for a
 * \`'terminal'\`-role step (\`partition\`, \`reduce\`). */
export interface DictEmitCtx {
  readonly index: number
  readonly domain: 'record' | 'map' | 'set'
  readonly k: string
  readonly v: string
  readonly next: string
  readonly a1: string
  readonly a2: string
  readonly cb: CallbackHandle
}

/** Everything an Iterable-domain template needs: a real fused loop (like
 * \`DictEmitCtx\`, not \`OptionEmitCtx\`'s straight-line run). \`indexed\` marks
 * an op whose callback takes \`(value, index)\`; \`position\` is this step's
 * own per-step counter, populated only then. \`next\` is only populated for a
 * \`'terminal'\`-role step. */
export interface IterEmitCtx {
  readonly index: number
  readonly v: string
  readonly next: string
  readonly a1: string
  readonly a2: string
  readonly indexed: boolean
  readonly position: string
  readonly outerLabel: string
  readonly optionNone: string
  readonly cb: CallbackHandle
}

export type OpEmitKind = 'expr' | 'filter' | 'expand' | 'stateful' | 'sink'

export type OpEmit =
  | {
      readonly kind: OpEmitKind
      readonly indexed?: true
      readonly render: (ctx: ElementEmitCtx) => EmitFragment
    }
  | {
      readonly kind: 'optionStep'
      readonly render: (ctx: OptionEmitCtx) => EmitFragment
    }
  | {
      readonly kind: 'dictStep'
      readonly render: (ctx: DictEmitCtx) => EmitFragment
    }
  | {
      readonly kind: 'iterStep'
      readonly indexed?: true
      readonly render: (ctx: IterEmitCtx) => EmitFragment
    }
  | { readonly kind: 'boundary' }

export interface OpsTableEntry {
  readonly name: string
  readonly callbackArity: 0 | 1 | 2
  readonly bindings: readonly ('fn' | 'a1' | 'a2')[]
  readonly semanticId: string
  readonly semanticRevision: number
  readonly inputDomain: 'array' | 'scalar' | 'iterable' | 'option' | 'result' | 'record' | 'map' | 'set'
  readonly outputDomain: 'array' | 'scalar' | 'iterable' | 'option' | 'result' | 'record' | 'map' | 'set'
  readonly cardinality:
    | 'one-to-one'
    | 'filtering'
    | 'expanding'
    | 'stateful'
    | 'sink'
    | 'materializer'
  readonly streamTermination: boolean
  readonly fullMaterialization: boolean
  readonly domainTransition: boolean
  readonly loweringId: string
  readonly loweringRevision: number
  readonly runnerId: string
  readonly compilerPipelineRole: 'element' | 'terminal' | 'boundary'
  readonly compilerFinalBoundary: boolean
  readonly emit: OpEmit
}

export const ELEMENT_OP_NAMES = ${JSON.stringify(byRole('element'), null, 2)} as const
export const TERMINAL_OP_NAMES = ${JSON.stringify(byRole('terminal'), null, 2)} as const
export const BOUNDARY_OP_NAMES = ${JSON.stringify(byRole('boundary'), null, 2)} as const
export const FINAL_BOUNDARY_OP_NAMES = ${JSON.stringify(finalBoundaries, null, 2)} as const

export const OPS_TABLE: readonly OpsTableEntry[] = [
${entries.map(renderOpsTableEntryV1).join(',\n')}
]
`
}

export function writeCompilerOpsTableV1(): void {
  emitAfterCanonicalProtocolValidationV1(() => {
    writeGenerated('packages/fp-compiler/src/ops-table.ts', renderCompilerOpsTableV1())
  })
}

export function formatGeneratedProtocolTypeScriptV1(
  paths: readonly string[] = PROTOCOL_GENERATED_PATHS_V1,
): void {
  if (process.env.STOPCOCK_CODEGEN_SKIP_FORMAT === '1') return
  const result = spawnSync('vp', ['fmt', '--write', ...paths], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('protocol generation: formatter failed')
}

export function generateProtocolViewsV1(): readonly string[] {
  return emitAfterCanonicalProtocolValidationV1(() => {
    writeCompilerOpsTableV1()
    return PROTOCOL_GENERATED_PATHS_V1
  })
}

export function describeGeneratedProtocolPathsV1(): readonly string[] {
  return PROTOCOL_GENERATED_PATHS_V1.map((path) => relative(REPO_ROOT, absolute(path)))
}

if (import.meta.main) {
  const generated = generateProtocolViewsV1()
  formatGeneratedProtocolTypeScriptV1()
  console.log(`operator protocol v1: generated ${generated.length} files`)
}
