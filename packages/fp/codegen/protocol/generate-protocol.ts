import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPILER_OPERATION_CORPUS_ID_V1,
  FUSION_RUNNER_DESCRIPTORS_V1,
  OPERATOR_DEFINITION_RECORDS_V1,
  OPERATOR_LOWERINGS_V1,
  OPERATOR_SEMANTICS_V1,
  runtimeRecordsInOpcodeOrderV1,
  type OperatorDefinitionRecordV1,
} from './operator-definitions'
import {
  assertEvidenceJoinsCurrentV1,
  hashCanonical,
  sha256Text,
  type OperatorEvidenceCorpusJoinV1,
  type OperatorEvidenceV1,
} from './operator-v1'
import {
  RECEIPT_SCHEMA_DEFINITION_V1,
  RECEIPT_SCHEMA_V1_HASH,
  renderReceiptSchemaViewV1,
} from './receipt-schema-v1'

const FP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const REPO_ROOT = resolve(FP_ROOT, '../..')

export const RETAINED_COMPILER_OPERATION_CORPUS_V1 = Object.freeze<OperatorEvidenceCorpusJoinV1>({
  corpusId: COMPILER_OPERATION_CORPUS_ID_V1,
  corpusHash: 'sha256:c1e5bad27b54b7b67a97e466d328cf39614ee5bd5c8e950d18997fb06306223b',
})

export const PROTOCOL_GENERATED_PATHS_V1 = [
  'packages/fp/src/opcodes.ts',
  'packages/fp/src/registry.ts',
  'packages/fp/src/internal/fusion-debug-receipt-schema.generated.ts',
  'packages/fp/codegen/generated/operator-manifest-v1.json',
  'packages/fp/codegen/generated/future-tier-manifest-v1.json',
  'packages/fp/codegen/generated/operator-evidence-v1.json',
  'packages/fp-compiler/src/ops-table.ts',
  'packages/fp-compiler/src/receipt-schema.generated.ts',
] as const

const PROTOCOL_GENERATED_TYPESCRIPT_PATHS_V1 = [
  'packages/fp/src/opcodes.ts',
  'packages/fp/src/registry.ts',
  'packages/fp/src/internal/fusion-debug-receipt-schema.generated.ts',
  'packages/fp-compiler/src/ops-table.ts',
  'packages/fp-compiler/src/receipt-schema.generated.ts',
] as const

function absolute(relativePath: string): string {
  return resolve(REPO_ROOT, relativePath)
}

function writeGenerated(relativePath: string, contents: string): void {
  const path = absolute(relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

function jsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function sourceHash(relativePath: string): string {
  return sha256Text(readFileSync(absolute(relativePath), 'utf8'))
}

function semanticFactsInputV1(): object {
  return {
    protocol: 'stopcock.operator-semantic-facts',
    protocolVersion: 1,
    semantics: OPERATOR_SEMANTICS_V1.map((semantic) => ({
      semanticId: semantic.semanticId,
      semanticRevision: semantic.semanticRevision,
      semanticHash: semantic.semanticHash,
    })),
  }
}

export const OPERATOR_SEMANTIC_FACTS_V1_HASH = hashCanonical(semanticFactsInputV1())

function semanticManifestInputV1(): object {
  return {
    protocol: 'stopcock.operator-manifest',
    protocolVersion: 1,
    semanticFactsHash: OPERATOR_SEMANTIC_FACTS_V1_HASH,
    semantics: OPERATOR_SEMANTICS_V1,
    lowerings: OPERATOR_LOWERINGS_V1,
    runnerDescriptors: FUSION_RUNNER_DESCRIPTORS_V1,
    receiptSchemaHash: RECEIPT_SCHEMA_V1_HASH,
  }
}

export const OPERATOR_MANIFEST_V1_HASH = hashCanonical(semanticManifestInputV1())

function operatorManifestV1(): object {
  return {
    ...semanticManifestInputV1(),
    manifestHash: OPERATOR_MANIFEST_V1_HASH,
  }
}

function rangePredicate(opcodes: readonly number[]): string {
  const sorted = [...new Set(opcodes)].sort((left, right) => left - right)
  const ranges: Array<readonly [number, number]> = []
  for (const opcode of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && last[1] + 1 === opcode) {
      ranges[ranges.length - 1] = [last[0], opcode]
    } else {
      ranges.push([opcode, opcode])
    }
  }
  return ranges
    .map(([start, end]) => (start === end ? `op === ${start}` : `(op >= ${start} && op <= ${end})`))
    .join(' ||\n  ')
}

function renderOpcodesV1(records: readonly OperatorDefinitionRecordV1[]): string {
  const declarations = records
    .map(
      ({ legacyRuntime }) =>
        `export const ${legacyRuntime.opcodeConstant} = ${legacyRuntime.opcode}`,
    )
    .join('\n')
  const lookup = records
    .filter(({ legacyRuntime }) => legacyRuntime.tagName !== null)
    .map(
      ({ legacyRuntime }) =>
        `  ${JSON.stringify(legacyRuntime.tagName)}: ${legacyRuntime.opcodeConstant},`,
    )
    .join('\n')
  const fuseable = records
    .filter(
      ({ legacyRuntime }) =>
        legacyRuntime.inputDomain === 'array' &&
        ['one-to-one', 'filtering', 'expanding', 'stateful'].includes(legacyRuntime.cardinality),
    )
    .map(({ legacyRuntime }) => legacyRuntime.opcode)
  const terminal = records
    .filter(({ legacyRuntime }) => legacyRuntime.cardinality === 'sink')
    .map(({ legacyRuntime }) => legacyRuntime.opcode)
  const accessorNames = new Set([
    'head',
    'last',
    'length',
    'isEmpty',
    'tail',
    'init',
    'reverse',
    'sortInline',
    'uniq',
    'join',
    'flatten',
    'sum',
    'min',
    'max',
    'without',
  ])
  const accessor = records
    .filter(({ legacyRuntime }) => accessorNames.has(legacyRuntime.name))
    .map(({ legacyRuntime }) => legacyRuntime.opcode)
  const scalar = records
    .filter(({ legacyRuntime }) => legacyRuntime.inputDomain === 'scalar')
    .map(({ legacyRuntime }) => legacyRuntime.opcode)

  return `// GENERATED FILE -- do not edit by hand.
// Source: packages/fp/codegen/protocol/operator-definitions.ts
// Numeric opcodes are compact internal encodings, never semantic identity or authority.

${declarations}

export const OP_NON_FUSEABLE = 0

export const OP_CODES: Record<string, number> = {
${lookup}
}

export const isFuseableOp = (op: number): boolean =>
  ${rangePredicate(fuseable)}

export const isTerminalOp = (op: number): boolean =>
  ${rangePredicate(terminal)}

export const isAccessorOp = (op: number): boolean =>
  ${rangePredicate(accessor)}

export const isScalarOp = (op: number): boolean =>
  ${rangePredicate(scalar)}

export const isFuseableOrTerminal = (op: number): boolean =>
  isFuseableOp(op) || isTerminalOp(op) || isAccessorOp(op) || isScalarOp(op)
`
}

function renderRegistryEntryV1(record: OperatorDefinitionRecordV1): string {
  const runtime = record.legacyRuntime
  return `  {
    op: OpCodes.${runtime.opcodeConstant},
    name: ${JSON.stringify(runtime.name)},
    inputDomain: ${JSON.stringify(runtime.inputDomain)},
    outputDomain: ${JSON.stringify(runtime.outputDomain)},
    cardinality: ${JSON.stringify(runtime.cardinality)},
    callbackArity: ${runtime.callbackArity},
    bindings: ${JSON.stringify(runtime.bindings)},
    earlyTermination: ${runtime.earlyTermination},
    constructorPreserving: ${runtime.constructorPreserving},
    denseHoles: true,
    reverseSafe: ${runtime.reverseSafe},
    exactLowering: true,
    pureLowering: ${runtime.pureLowering},
    simdEligible: false,
    workerEligible: false,
    isMaterializationBoundary: ${runtime.isMaterializationBoundary},
  }`
}

function renderRegistryV1(records: readonly OperatorDefinitionRecordV1[]): string {
  return `// GENERATED FILE -- do not edit by hand.
// Compatibility runtime projection of the canonical definition-only operator protocol.
// Source: packages/fp/codegen/protocol/operator-definitions.ts
// Semantic facts hash: ${OPERATOR_SEMANTIC_FACTS_V1_HASH}
import * as OpCodes from './opcodes'
import { OP_CODES, OP_NON_FUSEABLE } from './opcodes'

export type OpCode = number
export type OpDomain = 'array' | 'scalar' | 'iterable'
export type OpCardinality =
  | 'one-to-one'
  | 'filtering'
  | 'expanding'
  | 'stateful'
  | 'sink'
  | 'materializer'
export type ArgBinding = 'fn' | 'a1' | 'a2'

export interface OpMeta {
  readonly op: OpCode
  readonly name: string
  readonly inputDomain: OpDomain
  readonly outputDomain: OpDomain
  readonly cardinality: OpCardinality
  readonly callbackArity: 0 | 1 | 2
  readonly bindings: readonly ArgBinding[]
  readonly earlyTermination: boolean
  readonly constructorPreserving: boolean
  readonly denseHoles: true
  readonly reverseSafe: boolean
  readonly exactLowering: true
  readonly pureLowering: boolean
  readonly simdEligible: boolean
  readonly workerEligible: boolean
  readonly isMaterializationBoundary: boolean
}

const REGISTRY_ENTRIES: readonly OpMeta[] = [
${records.map(renderRegistryEntryV1).join(',\n')}
]

const REGISTRY: ReadonlyMap<OpCode, OpMeta> = new Map(
  REGISTRY_ENTRIES.map((entry) => [entry.op, entry]),
)

export const REGISTERED_OP_CODES: readonly OpCode[] = Object.freeze(
  Array.from(REGISTRY.keys()).sort((left, right) => left - right),
)

export function getOpMeta(op: OpCode): OpMeta | undefined {
  return REGISTRY.get(op)
}

export function requireOpMeta(op: OpCode): OpMeta {
  const found = REGISTRY.get(op)
  if (!found) throw new Error(\`registry: no metadata for opcode \${op}\`)
  return found
}

export function assertOpMeta(op: OpCode): asserts op is OpCode {
  if (!REGISTRY.has(op)) throw new Error(\`registry: no metadata for opcode \${op}\`)
}

export function isRegisteredOp(op: OpCode): boolean {
  return REGISTRY.has(op)
}

export function isTerminal(op: OpCode): boolean {
  const found = REGISTRY.get(op)
  return found !== undefined &&
    (found.cardinality === 'sink' || found.cardinality === 'materializer')
}

export function isBoundary(op: OpCode): boolean {
  return REGISTRY.get(op)?.isMaterializationBoundary === true
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

export function allSourceOpCodes(): readonly OpCode[] {
  const codes = new Set<OpCode>()
  for (const value of Object.values(OP_CODES)) codes.add(value)
  for (const [key, value] of Object.entries(OpCodes)) {
    if (key.startsWith('OP_') && typeof value === 'number' && value !== OP_NON_FUSEABLE) {
      codes.add(value)
    }
  }
  return Object.freeze(Array.from(codes).sort((left, right) => left - right))
}

export function opName(op: OpCode): string {
  return REGISTRY.get(op)?.name ?? \`op:\${op}\`
}
`
}

interface CompilerTableEntryV1 {
  readonly name: string
  readonly callbackArity: 0 | 1 | 2
  readonly bindings: readonly ('fn' | 'a1' | 'a2')[]
  readonly semanticId: string
  readonly semanticRevision: number
  readonly semanticHash: string
  readonly inputDomain: string
  readonly outputDomain: string
  readonly cardinality: string
  readonly streamTermination: boolean
  readonly fullMaterialization: boolean
  readonly domainTransition: boolean
  readonly loweringId: string
  readonly loweringHash: string
  readonly runnerId: string
  readonly compilerPipelineRole: 'element' | 'terminal' | 'boundary'
  readonly compilerFinalBoundary: boolean
}

function compilerEntriesV1(): readonly CompilerTableEntryV1[] {
  return OPERATOR_DEFINITION_RECORDS_V1.filter((record) => record.publicArrayExport)
    .map((record) => {
      const lowering = record.lowerings.find((candidate) => candidate.targetTier === 'compiler')
      if (!lowering || lowering.compilerPipelineRole === 'none') {
        throw new Error(
          `protocol generation: public compiler operator ${record.semantic.semanticId} has no compiler lowering`,
        )
      }
      return {
        name: record.legacyRuntime.name,
        callbackArity: record.semantic.callback.arity,
        bindings: record.semantic.bindings.map(({ slot }) => slot),
        semanticId: record.semantic.semanticId,
        semanticRevision: record.semantic.semanticRevision,
        semanticHash: record.semantic.semanticHash,
        inputDomain: record.semantic.inputDomain,
        outputDomain: record.semantic.outputDomain,
        cardinality: record.semantic.cardinality,
        streamTermination: record.semantic.termination.streamTermination,
        fullMaterialization: record.semantic.termination.fullMaterialization,
        domainTransition: record.semantic.termination.domainTransition,
        loweringId: lowering.loweringId,
        loweringHash: lowering.loweringHash,
        runnerId: lowering.runnerId,
        compilerPipelineRole: lowering.compilerPipelineRole,
        compilerFinalBoundary: lowering.compilerFinalBoundary,
      }
    })
    .sort((left, right) => {
      const byId = left.semanticId.localeCompare(right.semanticId)
      return byId !== 0 ? byId : left.semanticRevision - right.semanticRevision
    })
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
// Semantic facts hash: ${OPERATOR_SEMANTIC_FACTS_V1_HASH}

export interface OpsTableEntry {
  readonly name: string
  readonly callbackArity: 0 | 1 | 2
  readonly bindings: readonly ('fn' | 'a1' | 'a2')[]
  readonly semanticId: string
  readonly semanticRevision: number
  readonly semanticHash: string
  readonly inputDomain: 'array' | 'scalar' | 'iterable'
  readonly outputDomain: 'array' | 'scalar' | 'iterable'
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
  readonly loweringHash: string
  readonly runnerId: string
  readonly compilerPipelineRole: 'element' | 'terminal' | 'boundary'
  readonly compilerFinalBoundary: boolean
}

export const ELEMENT_OP_NAMES = ${JSON.stringify(byRole('element'), null, 2)} as const
export const TERMINAL_OP_NAMES = ${JSON.stringify(byRole('terminal'), null, 2)} as const
export const BOUNDARY_OP_NAMES = ${JSON.stringify(byRole('boundary'), null, 2)} as const
export const FINAL_BOUNDARY_OP_NAMES = ${JSON.stringify(finalBoundaries, null, 2)} as const

export const OPS_TABLE: readonly OpsTableEntry[] = ${JSON.stringify(entries, null, 2)}
`
}

export function writeCompilerOpsTableV1(): void {
  writeGenerated('packages/fp-compiler/src/ops-table.ts', renderCompilerOpsTableV1())
}

export function formatGeneratedProtocolTypeScriptV1(
  paths: readonly string[] = PROTOCOL_GENERATED_TYPESCRIPT_PATHS_V1,
): void {
  if (process.env.STOPCOCK_CODEGEN_SKIP_FORMAT === '1') return
  const result = spawnSync('vp', ['fmt', ...paths], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('protocol generation: formatter failed')
}

function futureTierManifestV1(): object {
  return {
    protocol: 'stopcock.future-tier-manifest',
    protocolVersion: 1,
    semanticManifestHash: OPERATOR_MANIFEST_V1_HASH,
    semanticFactsHash: OPERATOR_SEMANTIC_FACTS_V1_HASH,
    tiers: [
      {
        tier: 'compact',
        status: 'deferred',
        loweringAbiVersion: 1,
        descriptors: [],
      },
      {
        tier: 'optimized',
        status: 'deferred',
        loweringAbiVersion: 1,
        descriptors: [],
      },
    ],
    unsupportedCapabilities: ['worker', 'simd', 'wasm', 'incremental'],
  }
}

function evidenceIndexV1(): object {
  const artifactHashes = {
    legacy: sourceHash('packages/fp/src/registry.ts'),
    compiler: sourceHash('packages/fp-compiler/src/ops-table.ts'),
  }
  const descriptorsByLowering = new Map(
    FUSION_RUNNER_DESCRIPTORS_V1.map((descriptor) => [descriptor.loweringId, descriptor]),
  )
  const semanticsById = new Map(
    OPERATOR_SEMANTICS_V1.map((semantic) => [semantic.semanticId, semantic]),
  )
  const entries: OperatorEvidenceV1[] = OPERATOR_LOWERINGS_V1.filter(
    (lowering) => lowering.targetTier === 'compiler',
  ).map((lowering) => {
    const descriptor = descriptorsByLowering.get(lowering.loweringId)
    const semantic = semanticsById.get(lowering.semantic.semanticId)
    if (!descriptor || !semantic) {
      throw new Error(`protocol generation: incomplete evidence join for ${lowering.loweringId}`)
    }
    const evidenceInput = {
      protocol: 'stopcock.operator-evidence',
      protocolVersion: 1,
      status: 'declared',
      semantic: lowering.semantic,
      loweringId: lowering.loweringId,
      loweringHash: lowering.loweringHash,
      descriptorId: descriptor.descriptorId,
      descriptorHash: descriptor.descriptorHash,
      emittedArtifactHash: artifactHashes.compiler,
      corpora: [RETAINED_COMPILER_OPERATION_CORPUS_V1],
    } as const
    const evidence: OperatorEvidenceV1 = {
      ...evidenceInput,
      evidenceId: `@stopcock/evidence/${hashCanonical(evidenceInput).slice('sha256:'.length)}`,
    }
    assertEvidenceJoinsCurrentV1(
      evidence,
      OPERATOR_SEMANTICS_V1,
      OPERATOR_LOWERINGS_V1,
      FUSION_RUNNER_DESCRIPTORS_V1,
      {
        emittedArtifactHash: artifactHashes.compiler,
        corpora: [RETAINED_COMPILER_OPERATION_CORPUS_V1],
      },
    )
    return evidence
  })
  const input = {
    protocol: 'stopcock.operator-evidence-index',
    protocolVersion: 1,
    semanticManifestHash: OPERATOR_MANIFEST_V1_HASH,
    semanticFactsHash: OPERATOR_SEMANTIC_FACTS_V1_HASH,
    artifactHashes,
    retainedCorpora: [RETAINED_COMPILER_OPERATION_CORPUS_V1],
    entries,
  }
  return {
    ...input,
    evidenceIndexHash: hashCanonical(input),
  }
}

export function writeOperatorEvidenceIndexV1(): void {
  writeGenerated(
    'packages/fp/codegen/generated/operator-evidence-v1.json',
    jsonFile(evidenceIndexV1()),
  )
}

export function generateProtocolViewsV1(
  options: { readonly includeEvidence?: boolean } = {},
): readonly string[] {
  const records = runtimeRecordsInOpcodeOrderV1()
  writeGenerated('packages/fp/src/opcodes.ts', renderOpcodesV1(records))
  writeGenerated('packages/fp/src/registry.ts', renderRegistryV1(records))
  writeGenerated(
    'packages/fp/codegen/generated/operator-manifest-v1.json',
    jsonFile(operatorManifestV1()),
  )
  writeGenerated(
    'packages/fp/codegen/generated/future-tier-manifest-v1.json',
    jsonFile(futureTierManifestV1()),
  )
  writeGenerated(
    'packages/fp/src/internal/fusion-debug-receipt-schema.generated.ts',
    renderReceiptSchemaViewV1('fp-fusion-debug'),
  )
  writeGenerated(
    'packages/fp-compiler/src/receipt-schema.generated.ts',
    renderReceiptSchemaViewV1('fp-compiler'),
  )
  writeCompilerOpsTableV1()
  if (options.includeEvidence === true) writeOperatorEvidenceIndexV1()
  return PROTOCOL_GENERATED_PATHS_V1
}

export function describeGeneratedProtocolPathsV1(): readonly string[] {
  return PROTOCOL_GENERATED_PATHS_V1.map((path) => relative(REPO_ROOT, absolute(path)))
}

if (import.meta.main) {
  const generated = generateProtocolViewsV1({ includeEvidence: false })
  formatGeneratedProtocolTypeScriptV1()
  writeOperatorEvidenceIndexV1()
  console.log(
    `operator protocol v1: generated ${generated.length} files; manifest ${OPERATOR_MANIFEST_V1_HASH}`,
  )
  console.log(`receipt schema v1: ${RECEIPT_SCHEMA_V1_HASH}`)
  if (hashCanonical(RECEIPT_SCHEMA_DEFINITION_V1) !== RECEIPT_SCHEMA_V1_HASH) {
    throw new Error('receipt schema hash drift after generation')
  }
}
