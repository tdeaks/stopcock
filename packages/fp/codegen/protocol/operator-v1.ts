import { createHash } from 'node:crypto'

export const OPERATOR_PROTOCOL_V1 = 'stopcock.operator' as const
export const OPERATOR_PROTOCOL_VERSION_V1 = 1 as const
export const LOWERING_PROTOCOL_V1 = 'stopcock.operator-lowering' as const
export const LOWERING_PROTOCOL_VERSION_V1 = 1 as const
export const RUNNER_DESCRIPTOR_PROTOCOL_V1 = 'stopcock.fusion-runner' as const
export const RUNNER_DESCRIPTOR_PROTOCOL_VERSION_V1 = 1 as const

export type SemanticModeV1 = 'exact' | 'pure'
export type LogicalDomainV1 = 'array' | 'scalar' | 'iterable'
export type PhysicalLayoutV1 = 'js-array-dense' | 'js-array-sparse-as-undefined' | 'js-scalar'
export type CardinalityV1 =
  | 'one-to-one'
  | 'filtering'
  | 'expanding'
  | 'stateful'
  | 'sink'
  | 'materializer'
export type BindingSlotV1 = 'fn' | 'a1' | 'a2'
export type DiagnosticBindingFieldV1 = '_fn' | '_a1' | '_a2'
export type BindingRoleV1 = 'callback' | 'constant' | 'seed' | 'metadata'
export type CapabilityStatusV1 = 'unsupported'
export type ResultOwnershipV1 = 'fresh' | 'scalar-or-borrowed'
export type AliasingRuleV1 = 'none' | 'borrowed-element-only'
export type StorageClassV1 = 'js-array' | 'js-scalar' | 'none'
export type AllocationScopeV1 = 'fusion-runner-result' | 'fusion-runner-scratch' | 'none'
export type TargetTierV1 = 'legacy' | 'compiler'
export type TargetBackendV1 = 'portable' | 'aot'
export type CompilerPipelineRoleV1 = 'element' | 'terminal' | 'boundary' | 'none'

export interface BindingDefinitionV1 {
  readonly slot: BindingSlotV1
  readonly role: BindingRoleV1
  readonly required: boolean
}

export interface CallbackContractV1 {
  readonly arity: 0 | 1 | 2
  readonly arguments: readonly ('value' | 'index' | 'accumulator' | 'left' | 'right')[]
  readonly index: 'not-passed' | 'passed-as-second-argument'
  readonly count: 'once-per-consumed-value' | 'once-per-stable-merge-comparison' | 'not-applicable'
  readonly order: 'left-to-right' | 'right-to-left' | 'stable-merge-sort-order'
  readonly evaluationPoint:
    | 'during-element-consumption'
    | 'during-full-materialization'
    | 'not-applicable'
}

export interface EvaluationContractV1 {
  readonly exact: 'observable-order-and-count'
  readonly pure: 'equivalent-rewrite-allowed' | 'unsupported'
  readonly effects: 'callback-effects-observable' | 'built-in-effects-only'
  readonly determinism: 'deterministic-except-user-code' | 'nondeterministic-built-in'
  readonly sourceMutationVisibility: 'snapshot-array-length-then-dense-index-read' | 'scalar-value'
  readonly thrownErrorIdentity: 'preserved'
  readonly thrownErrorTiming: 'original-evaluation-point'
}

export interface TerminationContractV1 {
  readonly earlyTermination: boolean
  readonly streamTermination: boolean
  readonly fullMaterialization: boolean
  readonly domainTransition: boolean
}

export interface OwnershipContractV1 {
  readonly input: 'borrowed-readonly'
  readonly result: ResultOwnershipV1
  readonly aliasing: AliasingRuleV1
  readonly detachment: 'forbidden'
  readonly resultStorage: readonly StorageClassV1[]
  readonly scratchStorage: readonly StorageClassV1[]
  readonly allocationScopes: readonly AllocationScopeV1[]
}

export interface UnsupportedCapabilitiesV1 {
  readonly worker: CapabilityStatusV1
  readonly simd: CapabilityStatusV1
  readonly wasm: CapabilityStatusV1
  readonly incremental: CapabilityStatusV1
}

export interface PublicDiagnosticTagV1 {
  readonly opcodeField: '_op'
  readonly bindingFields: readonly DiagnosticBindingFieldV1[]
  readonly authority: 'diagnostic-only'
}

export interface OperatorLinksV1 {
  readonly referenceImplementationId: string
  readonly lawIds: readonly string[]
  readonly differentialCorpusIds: readonly string[]
}

export interface OperatorSemanticInputV1 {
  readonly protocol: typeof OPERATOR_PROTOCOL_V1
  readonly protocolVersion: typeof OPERATOR_PROTOCOL_VERSION_V1
  readonly semanticId: string
  readonly semanticRevision: number
  readonly publicName: string
  readonly inputDomain: LogicalDomainV1
  readonly outputDomain: LogicalDomainV1
  readonly acceptedLayouts: readonly PhysicalLayoutV1[]
  readonly cardinality: CardinalityV1
  readonly outputShapeFunction: string
  readonly bindings: readonly BindingDefinitionV1[]
  readonly callback: CallbackContractV1
  readonly evaluation: EvaluationContractV1
  readonly termination: TerminationContractV1
  readonly ownership: OwnershipContractV1
  readonly capabilities: UnsupportedCapabilitiesV1
  readonly diagnosticTag: PublicDiagnosticTagV1
  readonly links: OperatorLinksV1
}

export interface OperatorSemanticV1 extends OperatorSemanticInputV1 {
  readonly semanticHash: string
}

export interface CapabilityPredicateV1 {
  readonly predicateId: string
  readonly rejectionCodes: readonly string[]
}

export interface SemanticIdentityV1 {
  readonly semanticId: string
  readonly semanticRevision: number
  readonly semanticHash: string
}

export interface LoweringOwnershipV1 {
  readonly result: ResultOwnershipV1
  readonly aliasing: AliasingRuleV1
  readonly resultStorage: readonly StorageClassV1[]
  readonly scratchStorage: readonly StorageClassV1[]
  readonly allocationScopes: readonly AllocationScopeV1[]
}

export interface OperatorLoweringInputV1 {
  readonly protocol: typeof LOWERING_PROTOCOL_V1
  readonly protocolVersion: typeof LOWERING_PROTOCOL_VERSION_V1
  readonly loweringId: string
  readonly loweringRevision: number
  readonly loweringAbiVersion: 1
  readonly semantic: SemanticIdentityV1
  readonly targetTier: TargetTierV1
  readonly targetBackend: TargetBackendV1
  readonly acceptedSemanticModes: readonly SemanticModeV1[]
  readonly acceptedLayouts: readonly PhysicalLayoutV1[]
  readonly cardinality: CardinalityV1
  readonly outputShapeFunction: string
  readonly termination: TerminationContractV1
  readonly ownership: LoweringOwnershipV1
  readonly capability: CapabilityPredicateV1
  readonly runnerId: string
  readonly exactFallback: SemanticIdentityV1
  readonly compilerPipelineRole: CompilerPipelineRoleV1
  readonly compilerFinalBoundary: boolean
}

export interface OperatorLoweringV1 extends OperatorLoweringInputV1 {
  readonly loweringHash: string
}

export interface FusionRunnerDescriptorV1 {
  readonly protocol: typeof RUNNER_DESCRIPTOR_PROTOCOL_V1
  readonly protocolVersion: typeof RUNNER_DESCRIPTOR_PROTOCOL_VERSION_V1
  readonly descriptorId: string
  readonly semantic: SemanticIdentityV1
  readonly loweringId: string
  readonly loweringRevision: number
  readonly loweringHash: string
  readonly loweringAbiVersion: 1
  readonly targetTier: TargetTierV1
  readonly targetBackend: TargetBackendV1
  readonly acceptedSemanticModes: readonly SemanticModeV1[]
  readonly acceptedLayouts: readonly PhysicalLayoutV1[]
  readonly cardinality: CardinalityV1
  readonly outputShapeFunction: string
  readonly termination: TerminationContractV1
  readonly ownership: LoweringOwnershipV1
  readonly capability: CapabilityPredicateV1
  readonly runnerId: string
  readonly exactFallback: SemanticIdentityV1
  readonly compilerPipelineRole: CompilerPipelineRoleV1
  readonly compilerFinalBoundary: boolean
  readonly descriptorHash: string
}

export interface OperatorEvidenceV1 {
  readonly protocol: 'stopcock.operator-evidence'
  readonly protocolVersion: 1
  readonly evidenceId: string
  readonly status: 'declared'
  readonly semantic: SemanticIdentityV1
  readonly loweringId: string
  readonly loweringHash: string
  readonly descriptorId: string
  readonly descriptorHash: string
  readonly emittedArtifactHash: string
  readonly corpora: readonly OperatorEvidenceCorpusJoinV1[]
}

export interface OperatorEvidenceCorpusJoinV1 {
  readonly corpusId: string
  readonly corpusHash: string
}

export interface OperatorEvidenceExternalJoinsV1 {
  readonly emittedArtifactHash: string
  readonly corpora: readonly OperatorEvidenceCorpusJoinV1[]
}

type PlainObject = Record<string, unknown>

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u
const ID_PATTERN = /^[a-z0-9@][a-zA-Z0-9@/._:-]*$/u
const PACKAGE_QUALIFIED_SEMANTIC_ID_PATTERN =
  /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*)+$/u

const SEMANTIC_KEYS = [
  'protocol',
  'protocolVersion',
  'semanticId',
  'semanticRevision',
  'publicName',
  'inputDomain',
  'outputDomain',
  'acceptedLayouts',
  'cardinality',
  'outputShapeFunction',
  'bindings',
  'callback',
  'evaluation',
  'termination',
  'ownership',
  'capabilities',
  'diagnosticTag',
  'links',
] as const

const LOWERING_KEYS = [
  'protocol',
  'protocolVersion',
  'loweringId',
  'loweringRevision',
  'loweringAbiVersion',
  'semantic',
  'targetTier',
  'targetBackend',
  'acceptedSemanticModes',
  'acceptedLayouts',
  'cardinality',
  'outputShapeFunction',
  'termination',
  'ownership',
  'capability',
  'runnerId',
  'exactFallback',
  'compilerPipelineRole',
  'compilerFinalBoundary',
] as const

function fail(message: string): never {
  throw new Error(`operator protocol v1: ${message}`)
}

function isPlainObject(value: unknown): value is PlainObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertPlainData(value: unknown, path: string): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return
  }
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
      fail(`${path} may not contain symbol keys`)
    }
    const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index))
    const actualKeys = Object.keys(value)
    if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) {
      fail(`${path} must be a dense plain-data array without custom fields`)
    }
    value.forEach((item, index) => assertPlainData(item, `${path}[${index}]`))
    return
  }
  if (isPlainObject(value)) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
      fail(`${path} may not contain symbol keys`)
    }
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        fail(`${path}.${key} must be an enumerable plain-data field`)
      }
      assertPlainData(descriptor.value, `${path}.${key}`)
    }
    return
  }
  fail(`${path} must contain only finite plain data`)
}

function assertExactKeys(
  value: unknown,
  keys: readonly string[],
  path: string,
): asserts value is PlainObject {
  if (!isPlainObject(value)) fail(`${path} must be a plain object`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    fail(`${path} keys must be exactly ${expected.join(', ')}`)
  }
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) fail(`${path} must be a non-empty string`)
}

function assertId(value: unknown, path: string): asserts value is string {
  assertString(value, path)
  if (!ID_PATTERN.test(value)) fail(`${path} must be a stable namespaced ID`)
}

function assertPackageQualifiedSemanticId(value: unknown, path: string): asserts value is string {
  assertString(value, path)
  if (!PACKAGE_QUALIFIED_SEMANTIC_ID_PATTERN.test(value)) {
    fail(`${path} must be a package-qualified semantic ID`)
  }
}

function assertHash(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    fail(`${path} must be a sha256 hash`)
  }
}

function assertInteger(value: unknown, path: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    fail(`${path} must be a positive safe integer`)
  }
}

function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== 'boolean') fail(`${path} must be boolean`)
}

function assertEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
): asserts value is T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    fail(`${path} must be one of ${values.join(', ')}`)
  }
}

function assertStringArray(
  value: unknown,
  path: string,
  options: { readonly nonEmpty?: boolean; readonly unique?: boolean } = {},
): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail(`${path} must be an array of strings`)
  }
  if (options.nonEmpty && value.length === 0) fail(`${path} must not be empty`)
  if (options.unique && new Set(value).size !== value.length) fail(`${path} must be unique`)
}

function copyPlain<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => copyPlain(item)) as T
  if (isPlainObject(value)) {
    const output: PlainObject = {}
    for (const [key, item] of Object.entries(value)) output[key] = copyPlain(item)
    return output as T
  }
  return value
}

export function deepFreezePlain<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    value.forEach((item) => deepFreezePlain(item))
    return Object.freeze(value) as Readonly<T>
  }
  if (isPlainObject(value)) {
    Object.values(value).forEach((item) => deepFreezePlain(item))
    return Object.freeze(value) as Readonly<T>
  }
  return value
}

export function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (!isPlainObject(value)) fail('canonical JSON input must be plain data')
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`
}

export function sha256Text(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

export function hashCanonical(value: unknown): string {
  assertPlainData(value, 'hash input')
  return sha256Text(canonicalJson(value))
}

export function semanticHashProjectionV1(
  semantic: OperatorSemanticInputV1 | OperatorSemanticV1,
): Omit<OperatorSemanticInputV1, 'links'> {
  return {
    protocol: semantic.protocol,
    protocolVersion: semantic.protocolVersion,
    semanticId: semantic.semanticId,
    semanticRevision: semantic.semanticRevision,
    publicName: semantic.publicName,
    inputDomain: semantic.inputDomain,
    outputDomain: semantic.outputDomain,
    acceptedLayouts: semantic.acceptedLayouts,
    cardinality: semantic.cardinality,
    outputShapeFunction: semantic.outputShapeFunction,
    bindings: semantic.bindings,
    callback: semantic.callback,
    evaluation: semantic.evaluation,
    termination: semantic.termination,
    ownership: semantic.ownership,
    capabilities: semantic.capabilities,
    diagnosticTag: semantic.diagnosticTag,
  }
}

function assertBindings(value: unknown): asserts value is readonly BindingDefinitionV1[] {
  if (!Array.isArray(value)) fail('bindings must be an array')
  const slots = new Set<string>()
  for (const [index, binding] of value.entries()) {
    assertExactKeys(binding, ['slot', 'role', 'required'], `bindings[${index}]`)
    assertEnum(binding.slot, ['fn', 'a1', 'a2'], `bindings[${index}].slot`)
    assertEnum(
      binding.role,
      ['callback', 'constant', 'seed', 'metadata'],
      `bindings[${index}].role`,
    )
    assertBoolean(binding.required, `bindings[${index}].required`)
    if (slots.has(binding.slot)) fail(`bindings contains duplicate slot ${binding.slot}`)
    slots.add(binding.slot)
  }
}

function assertCallback(value: unknown): asserts value is CallbackContractV1 {
  assertExactKeys(
    value,
    ['arity', 'arguments', 'index', 'count', 'order', 'evaluationPoint'],
    'callback',
  )
  if (value.arity !== 0 && value.arity !== 1 && value.arity !== 2) {
    fail('callback.arity must be 0, 1, or 2')
  }
  assertStringArray(value.arguments, 'callback.arguments')
  for (const argument of value.arguments) {
    assertEnum(
      argument,
      ['value', 'index', 'accumulator', 'left', 'right'],
      'callback.arguments item',
    )
  }
  if (value.arguments.length !== value.arity) {
    fail('callback.arguments length must equal callback.arity')
  }
  assertEnum(value.index, ['not-passed', 'passed-as-second-argument'], 'callback.index')
  assertEnum(
    value.count,
    ['once-per-consumed-value', 'once-per-stable-merge-comparison', 'not-applicable'],
    'callback.count',
  )
  assertEnum(
    value.order,
    ['left-to-right', 'right-to-left', 'stable-merge-sort-order'],
    'callback.order',
  )
  assertEnum(
    value.evaluationPoint,
    ['during-element-consumption', 'during-full-materialization', 'not-applicable'],
    'callback.evaluationPoint',
  )
  const comparator =
    value.arity === 2 && value.arguments[0] === 'left' && value.arguments[1] === 'right'
  const indexed = value.arguments[1] === 'index'
  if (indexed !== (value.index === 'passed-as-second-argument')) {
    fail('callback.index contradicts callback.arguments')
  }
  if (
    (value.arity === 0 &&
      (value.count !== 'not-applicable' || value.evaluationPoint !== 'not-applicable')) ||
    (comparator &&
      (value.count !== 'once-per-stable-merge-comparison' ||
        value.order !== 'stable-merge-sort-order' ||
        value.evaluationPoint !== 'during-full-materialization')) ||
    (value.arity > 0 &&
      !comparator &&
      (value.count !== 'once-per-consumed-value' ||
        (value.order !== 'left-to-right' && value.order !== 'right-to-left') ||
        value.evaluationPoint !== 'during-element-consumption'))
  ) {
    fail('callback count/evaluation point contradicts callback arity')
  }
}

function assertEvaluation(value: unknown): asserts value is EvaluationContractV1 {
  assertExactKeys(
    value,
    [
      'exact',
      'pure',
      'effects',
      'determinism',
      'sourceMutationVisibility',
      'thrownErrorIdentity',
      'thrownErrorTiming',
    ],
    'evaluation',
  )
  assertEnum(value.exact, ['observable-order-and-count'], 'evaluation.exact')
  assertEnum(value.pure, ['equivalent-rewrite-allowed', 'unsupported'], 'evaluation.pure')
  assertEnum(
    value.effects,
    ['callback-effects-observable', 'built-in-effects-only'],
    'evaluation.effects',
  )
  assertEnum(
    value.determinism,
    ['deterministic-except-user-code', 'nondeterministic-built-in'],
    'evaluation.determinism',
  )
  assertEnum(
    value.sourceMutationVisibility,
    ['snapshot-array-length-then-dense-index-read', 'scalar-value'],
    'evaluation.sourceMutationVisibility',
  )
  assertEnum(value.thrownErrorIdentity, ['preserved'], 'evaluation.thrownErrorIdentity')
  assertEnum(value.thrownErrorTiming, ['original-evaluation-point'], 'evaluation.thrownErrorTiming')
}

function assertTermination(
  value: unknown,
  path = 'termination',
): asserts value is TerminationContractV1 {
  assertExactKeys(
    value,
    ['earlyTermination', 'streamTermination', 'fullMaterialization', 'domainTransition'],
    path,
  )
  assertBoolean(value.earlyTermination, `${path}.earlyTermination`)
  assertBoolean(value.streamTermination, `${path}.streamTermination`)
  assertBoolean(value.fullMaterialization, `${path}.fullMaterialization`)
  assertBoolean(value.domainTransition, `${path}.domainTransition`)
}

function assertOwnership(value: unknown, path = 'ownership'): asserts value is OwnershipContractV1 {
  assertExactKeys(
    value,
    [
      'input',
      'result',
      'aliasing',
      'detachment',
      'resultStorage',
      'scratchStorage',
      'allocationScopes',
    ],
    path,
  )
  assertEnum(value.input, ['borrowed-readonly'], `${path}.input`)
  assertEnum(value.result, ['fresh', 'scalar-or-borrowed'], `${path}.result`)
  assertEnum(value.aliasing, ['none', 'borrowed-element-only'], `${path}.aliasing`)
  assertEnum(value.detachment, ['forbidden'], `${path}.detachment`)
  assertStringArray(value.resultStorage, `${path}.resultStorage`, {
    nonEmpty: true,
    unique: true,
  })
  assertStringArray(value.scratchStorage, `${path}.scratchStorage`, { unique: true })
  assertStringArray(value.allocationScopes, `${path}.allocationScopes`, {
    nonEmpty: true,
    unique: true,
  })
  value.resultStorage.forEach((storage, index) =>
    assertEnum(storage, ['js-array', 'js-scalar', 'none'], `${path}.resultStorage[${index}]`),
  )
  value.scratchStorage.forEach((storage, index) =>
    assertEnum(storage, ['js-array', 'js-scalar', 'none'], `${path}.scratchStorage[${index}]`),
  )
  value.allocationScopes.forEach((scope, index) =>
    assertEnum(
      scope,
      ['fusion-runner-result', 'fusion-runner-scratch', 'none'],
      `${path}.allocationScopes[${index}]`,
    ),
  )
}

function assertLoweringOwnership(
  value: unknown,
  path = 'ownership',
): asserts value is LoweringOwnershipV1 {
  assertExactKeys(
    value,
    ['result', 'aliasing', 'resultStorage', 'scratchStorage', 'allocationScopes'],
    path,
  )
  assertEnum(value.result, ['fresh', 'scalar-or-borrowed'], `${path}.result`)
  assertEnum(value.aliasing, ['none', 'borrowed-element-only'], `${path}.aliasing`)
  assertStringArray(value.resultStorage, `${path}.resultStorage`, {
    nonEmpty: true,
    unique: true,
  })
  assertStringArray(value.scratchStorage, `${path}.scratchStorage`, { unique: true })
  assertStringArray(value.allocationScopes, `${path}.allocationScopes`, {
    nonEmpty: true,
    unique: true,
  })
  value.resultStorage.forEach((storage, index) =>
    assertEnum(storage, ['js-array', 'js-scalar', 'none'], `${path}.resultStorage[${index}]`),
  )
  value.scratchStorage.forEach((storage, index) =>
    assertEnum(storage, ['js-array', 'js-scalar', 'none'], `${path}.scratchStorage[${index}]`),
  )
  value.allocationScopes.forEach((scope, index) =>
    assertEnum(
      scope,
      ['fusion-runner-result', 'fusion-runner-scratch', 'none'],
      `${path}.allocationScopes[${index}]`,
    ),
  )
}

function assertCapabilities(value: unknown): asserts value is UnsupportedCapabilitiesV1 {
  assertExactKeys(value, ['worker', 'simd', 'wasm', 'incremental'], 'capabilities')
  for (const capability of ['worker', 'simd', 'wasm', 'incremental'] as const) {
    assertEnum(value[capability], ['unsupported'], `capabilities.${capability}`)
  }
}

function assertDiagnosticTag(value: unknown): asserts value is PublicDiagnosticTagV1 {
  assertExactKeys(value, ['opcodeField', 'bindingFields', 'authority'], 'diagnosticTag')
  assertEnum(value.opcodeField, ['_op'], 'diagnosticTag.opcodeField')
  assertStringArray(value.bindingFields, 'diagnosticTag.bindingFields', { unique: true })
  for (const field of value.bindingFields) {
    assertEnum(field, ['_fn', '_a1', '_a2'], 'diagnosticTag.bindingFields item')
  }
  assertEnum(value.authority, ['diagnostic-only'], 'diagnosticTag.authority')
}

function assertLinks(value: unknown): asserts value is OperatorLinksV1 {
  assertExactKeys(value, ['referenceImplementationId', 'lawIds', 'differentialCorpusIds'], 'links')
  assertId(value.referenceImplementationId, 'links.referenceImplementationId')
  assertStringArray(value.lawIds, 'links.lawIds', { nonEmpty: true, unique: true })
  assertStringArray(value.differentialCorpusIds, 'links.differentialCorpusIds', {
    unique: true,
  })
  value.lawIds.forEach((id, index) => assertId(id, `links.lawIds[${index}]`))
  value.differentialCorpusIds.forEach((id, index) =>
    assertId(id, `links.differentialCorpusIds[${index}]`),
  )
}

function assertSemanticIdentity(value: unknown, path: string): asserts value is SemanticIdentityV1 {
  assertExactKeys(value, ['semanticId', 'semanticRevision', 'semanticHash'], path)
  assertPackageQualifiedSemanticId(value.semanticId, `${path}.semanticId`)
  assertInteger(value.semanticRevision, `${path}.semanticRevision`)
  assertHash(value.semanticHash, `${path}.semanticHash`)
}

export function defineOperatorV1(input: OperatorSemanticInputV1): OperatorSemanticV1 {
  assertPlainData(input, 'operator')
  assertExactKeys(input, SEMANTIC_KEYS, 'operator')
  assertEnum(input.protocol, [OPERATOR_PROTOCOL_V1], 'protocol')
  if (input.protocolVersion !== OPERATOR_PROTOCOL_VERSION_V1) {
    fail(`unsupported operator protocol version ${String(input.protocolVersion)}`)
  }
  assertPackageQualifiedSemanticId(input.semanticId, 'semanticId')
  assertInteger(input.semanticRevision, 'semanticRevision')
  assertString(input.publicName, 'publicName')
  assertEnum(input.inputDomain, ['array', 'scalar', 'iterable'], 'inputDomain')
  assertEnum(input.outputDomain, ['array', 'scalar', 'iterable'], 'outputDomain')
  assertStringArray(input.acceptedLayouts, 'acceptedLayouts', {
    nonEmpty: true,
    unique: true,
  })
  input.acceptedLayouts.forEach((layout, index) =>
    assertEnum(
      layout,
      ['js-array-dense', 'js-array-sparse-as-undefined', 'js-scalar'],
      `acceptedLayouts[${index}]`,
    ),
  )
  assertEnum(
    input.cardinality,
    ['one-to-one', 'filtering', 'expanding', 'stateful', 'sink', 'materializer'],
    'cardinality',
  )
  assertId(input.outputShapeFunction, 'outputShapeFunction')
  assertBindings(input.bindings)
  assertCallback(input.callback)
  assertEvaluation(input.evaluation)
  assertTermination(input.termination)
  assertOwnership(input.ownership)
  assertCapabilities(input.capabilities)
  assertDiagnosticTag(input.diagnosticTag)
  assertLinks(input.links)

  if (input.termination.domainTransition !== (input.inputDomain !== input.outputDomain)) {
    fail('termination.domainTransition must agree with the logical domains')
  }
  if (input.callback.arity > 0 && !input.bindings.some((binding) => binding.role === 'callback')) {
    fail('callback-bearing operator must declare a callback binding')
  }
  if (input.callback.arity === 0 && input.bindings.some((binding) => binding.role === 'callback')) {
    fail('callback-free operator may not declare a callback binding')
  }
  const expectedDiagnosticBindings = input.bindings.map(({ slot }) => `_${slot}`)
  if (!sameCanonical(input.diagnosticTag.bindingFields, expectedDiagnosticBindings)) {
    fail('diagnostic binding fields must exactly project the public tagged-function slots')
  }

  const copied = copyPlain(input)
  const semanticHash = hashCanonical(semanticHashProjectionV1(copied))
  return deepFreezePlain({ ...copied, semanticHash }) as OperatorSemanticV1
}

export function assertOperatorSemanticV1(value: unknown): asserts value is OperatorSemanticV1 {
  if (!isPlainObject(value)) fail('semantic must be a plain object')
  const { semanticHash, ...input } = value
  assertHash(semanticHash, 'semanticHash')
  const rebuilt = defineOperatorV1(input as unknown as OperatorSemanticInputV1)
  if (rebuilt.semanticHash !== semanticHash) fail('semantic hash drift')
}

export function defineLoweringV1(input: OperatorLoweringInputV1): OperatorLoweringV1 {
  assertPlainData(input, 'lowering')
  assertExactKeys(input, LOWERING_KEYS, 'lowering')
  assertEnum(input.protocol, [LOWERING_PROTOCOL_V1], 'lowering.protocol')
  if (input.protocolVersion !== LOWERING_PROTOCOL_VERSION_V1) {
    fail(`unsupported lowering protocol version ${String(input.protocolVersion)}`)
  }
  assertId(input.loweringId, 'lowering.loweringId')
  assertInteger(input.loweringRevision, 'lowering.loweringRevision')
  if (input.loweringAbiVersion !== 1) fail('lowering.loweringAbiVersion must be 1')
  assertSemanticIdentity(input.semantic, 'lowering.semantic')
  assertEnum(input.targetTier, ['legacy', 'compiler'], 'lowering.targetTier')
  assertEnum(input.targetBackend, ['portable', 'aot'], 'lowering.targetBackend')
  assertStringArray(input.acceptedSemanticModes, 'lowering.acceptedSemanticModes', {
    nonEmpty: true,
    unique: true,
  })
  input.acceptedSemanticModes.forEach((mode, index) =>
    assertEnum(mode, ['exact', 'pure'], `lowering.acceptedSemanticModes[${index}]`),
  )
  assertStringArray(input.acceptedLayouts, 'lowering.acceptedLayouts', {
    nonEmpty: true,
    unique: true,
  })
  input.acceptedLayouts.forEach((layout, index) =>
    assertEnum(
      layout,
      ['js-array-dense', 'js-array-sparse-as-undefined', 'js-scalar'],
      `lowering.acceptedLayouts[${index}]`,
    ),
  )
  assertEnum(
    input.cardinality,
    ['one-to-one', 'filtering', 'expanding', 'stateful', 'sink', 'materializer'],
    'lowering.cardinality',
  )
  assertId(input.outputShapeFunction, 'lowering.outputShapeFunction')
  assertTermination(input.termination, 'lowering.termination')
  assertLoweringOwnership(input.ownership, 'lowering.ownership')
  assertExactKeys(input.capability, ['predicateId', 'rejectionCodes'], 'lowering.capability')
  assertId(input.capability.predicateId, 'lowering.capability.predicateId')
  assertStringArray(input.capability.rejectionCodes, 'lowering.capability.rejectionCodes', {
    nonEmpty: true,
    unique: true,
  })
  input.capability.rejectionCodes.forEach((code, index) =>
    assertId(code, `lowering.capability.rejectionCodes[${index}]`),
  )
  assertId(input.runnerId, 'lowering.runnerId')
  assertSemanticIdentity(input.exactFallback, 'lowering.exactFallback')
  assertEnum(
    input.compilerPipelineRole,
    ['element', 'terminal', 'boundary', 'none'],
    'lowering.compilerPipelineRole',
  )
  assertBoolean(input.compilerFinalBoundary, 'lowering.compilerFinalBoundary')
  if (input.compilerPipelineRole !== 'boundary' && input.compilerFinalBoundary) {
    fail('only a compiler boundary may be final')
  }
  if (input.targetTier !== 'compiler' && input.compilerPipelineRole !== 'none') {
    fail('non-compiler lowering may not declare a compiler pipeline role')
  }

  const copied = copyPlain(input)
  const loweringHash = hashCanonical(copied)
  return deepFreezePlain({ ...copied, loweringHash }) as OperatorLoweringV1
}

export function assertOperatorLoweringV1(value: unknown): asserts value is OperatorLoweringV1 {
  if (!isPlainObject(value)) fail('lowering must be a plain object')
  const { loweringHash, ...input } = value
  assertHash(loweringHash, 'lowering.loweringHash')
  const rebuilt = defineLoweringV1(input as unknown as OperatorLoweringInputV1)
  if (rebuilt.loweringHash !== loweringHash) fail('lowering hash drift')
}

function identityOf(semantic: OperatorSemanticV1): SemanticIdentityV1 {
  return {
    semanticId: semantic.semanticId,
    semanticRevision: semantic.semanticRevision,
    semanticHash: semantic.semanticHash,
  }
}

function isSubset<T>(candidate: readonly T[], authority: readonly T[]): boolean {
  const allowed = new Set(authority)
  return candidate.every((item) => allowed.has(item))
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right)
}

export function assertLoweringRefinesSemanticV1(
  semantic: OperatorSemanticV1,
  lowering: OperatorLoweringV1,
): void {
  assertOperatorSemanticV1(semantic)
  assertOperatorLoweringV1(lowering)
  const identity = identityOf(semantic)
  if (!sameCanonical(lowering.semantic, identity)) fail('lowering semantic identity mismatch')
  if (!sameCanonical(lowering.exactFallback, identity)) {
    fail('lowering exact fallback must name the same semantic identity')
  }
  if (!isSubset(lowering.acceptedLayouts, semantic.acceptedLayouts)) {
    fail('lowering widens accepted physical layouts')
  }
  const allowedModes: readonly SemanticModeV1[] =
    semantic.evaluation.pure === 'equivalent-rewrite-allowed' ? ['exact', 'pure'] : ['exact']
  if (!isSubset(lowering.acceptedSemanticModes, allowedModes)) {
    fail('lowering widens accepted semantic modes')
  }
  if (lowering.cardinality !== semantic.cardinality) {
    fail('lowering changes semantic cardinality')
  }
  if (lowering.outputShapeFunction !== semantic.outputShapeFunction) {
    fail('lowering changes output shape')
  }
  if (!sameCanonical(lowering.termination, semantic.termination)) {
    fail('lowering changes termination or domain-transition behavior')
  }
  if (lowering.ownership.result !== semantic.ownership.result) {
    fail('lowering changes result ownership')
  }
  if (
    semantic.ownership.aliasing === 'none'
      ? lowering.ownership.aliasing !== 'none'
      : !['none', 'borrowed-element-only'].includes(lowering.ownership.aliasing)
  ) {
    fail('lowering weakens alias restrictions')
  }
  if (!isSubset(lowering.ownership.resultStorage, semantic.ownership.resultStorage)) {
    fail('lowering widens result storage')
  }
  if (!isSubset(lowering.ownership.scratchStorage, semantic.ownership.scratchStorage)) {
    fail('lowering widens scratch storage')
  }
  if (!isSubset(lowering.ownership.allocationScopes, semantic.ownership.allocationScopes)) {
    fail('lowering widens allocation scopes')
  }
}

function descriptorInputOf(
  lowering: OperatorLoweringV1,
): Omit<FusionRunnerDescriptorV1, 'descriptorHash'> {
  return {
    protocol: RUNNER_DESCRIPTOR_PROTOCOL_V1,
    protocolVersion: RUNNER_DESCRIPTOR_PROTOCOL_VERSION_V1,
    descriptorId: `${lowering.loweringId}/descriptor`,
    semantic: lowering.semantic,
    loweringId: lowering.loweringId,
    loweringRevision: lowering.loweringRevision,
    loweringHash: lowering.loweringHash,
    loweringAbiVersion: lowering.loweringAbiVersion,
    targetTier: lowering.targetTier,
    targetBackend: lowering.targetBackend,
    acceptedSemanticModes: lowering.acceptedSemanticModes,
    acceptedLayouts: lowering.acceptedLayouts,
    cardinality: lowering.cardinality,
    outputShapeFunction: lowering.outputShapeFunction,
    termination: lowering.termination,
    ownership: lowering.ownership,
    capability: lowering.capability,
    runnerId: lowering.runnerId,
    exactFallback: lowering.exactFallback,
    compilerPipelineRole: lowering.compilerPipelineRole,
    compilerFinalBoundary: lowering.compilerFinalBoundary,
  }
}

export function projectRunnerDescriptorV1(lowering: OperatorLoweringV1): FusionRunnerDescriptorV1 {
  assertOperatorLoweringV1(lowering)
  const input = copyPlain(descriptorInputOf(lowering))
  return deepFreezePlain({
    ...input,
    descriptorHash: hashCanonical(input),
  }) as FusionRunnerDescriptorV1
}

export function assertRunnerDescriptorProjectsLoweringV1(
  lowering: OperatorLoweringV1,
  descriptor: FusionRunnerDescriptorV1,
): void {
  const expected = projectRunnerDescriptorV1(lowering)
  if (!sameCanonical(expected, descriptor)) {
    fail('runner descriptor is not a lossless lowering projection')
  }
}

export function assertOperatorCatalogueV1(
  semantics: readonly OperatorSemanticV1[],
  lowerings: readonly OperatorLoweringV1[],
  descriptors: readonly FusionRunnerDescriptorV1[],
): void {
  const semanticKeys = new Set<string>()
  const semanticsByIdentity = new Map<string, OperatorSemanticV1>()
  for (const semantic of semantics) {
    assertOperatorSemanticV1(semantic)
    const key = `${semantic.semanticId}@${semantic.semanticRevision}`
    if (semanticKeys.has(key)) fail(`duplicate semantic identity ${key}`)
    semanticKeys.add(key)
    semanticsByIdentity.set(key, semantic)
  }

  const loweringKeys = new Set<string>()
  for (const lowering of lowerings) {
    assertOperatorLoweringV1(lowering)
    const key = `${lowering.loweringId}@${lowering.loweringRevision}`
    if (loweringKeys.has(key)) fail(`duplicate lowering identity ${key}`)
    loweringKeys.add(key)
    const semantic = semanticsByIdentity.get(
      `${lowering.semantic.semanticId}@${lowering.semantic.semanticRevision}`,
    )
    if (!semantic) fail(`lowering references unknown semantic ${lowering.semantic.semanticId}`)
    assertLoweringRefinesSemanticV1(semantic, lowering)
  }

  const descriptorsByLowering = new Map(
    descriptors.map((descriptor) => [
      `${descriptor.loweringId}@${descriptor.loweringRevision}`,
      descriptor,
    ]),
  )
  if (descriptorsByLowering.size !== descriptors.length) {
    fail('duplicate runner descriptor lowering identity')
  }
  if (descriptors.length !== lowerings.length) {
    fail('every lowering must have exactly one runner descriptor')
  }
  for (const lowering of lowerings) {
    const descriptor = descriptorsByLowering.get(
      `${lowering.loweringId}@${lowering.loweringRevision}`,
    )
    if (!descriptor) fail(`missing runner descriptor for ${lowering.loweringId}`)
    assertRunnerDescriptorProjectsLoweringV1(lowering, descriptor)
  }
}

export function assertEvidenceJoinsCurrentV1(
  evidence: OperatorEvidenceV1,
  semantics: readonly OperatorSemanticV1[],
  lowerings: readonly OperatorLoweringV1[],
  descriptors: readonly FusionRunnerDescriptorV1[],
  external: OperatorEvidenceExternalJoinsV1,
): void {
  assertPlainData(evidence, 'evidence')
  assertExactKeys(
    evidence,
    [
      'protocol',
      'protocolVersion',
      'evidenceId',
      'status',
      'semantic',
      'loweringId',
      'loweringHash',
      'descriptorId',
      'descriptorHash',
      'emittedArtifactHash',
      'corpora',
    ],
    'evidence',
  )
  assertEnum(evidence.protocol, ['stopcock.operator-evidence'], 'evidence.protocol')
  if (evidence.protocolVersion !== 1) fail('evidence.protocolVersion must be 1')
  assertId(evidence.evidenceId, 'evidence.evidenceId')
  assertEnum(evidence.status, ['declared'], 'evidence.status')
  assertSemanticIdentity(evidence.semantic, 'evidence.semantic')
  assertId(evidence.loweringId, 'evidence.loweringId')
  assertHash(evidence.loweringHash, 'evidence.loweringHash')
  assertId(evidence.descriptorId, 'evidence.descriptorId')
  assertHash(evidence.descriptorHash, 'evidence.descriptorHash')
  assertHash(evidence.emittedArtifactHash, 'evidence.emittedArtifactHash')
  assertPlainData(external, 'external evidence joins')
  assertExactKeys(external, ['emittedArtifactHash', 'corpora'], 'external evidence joins')
  assertHash(external.emittedArtifactHash, 'external evidence joins.emittedArtifactHash')

  const validateCorpora = (
    value: unknown,
    path: string,
  ): readonly OperatorEvidenceCorpusJoinV1[] => {
    if (!Array.isArray(value) || value.length === 0) {
      fail(`${path} must be a non-empty array`)
    }
    const ids = new Set<string>()
    for (const [index, corpus] of value.entries()) {
      assertExactKeys(corpus, ['corpusId', 'corpusHash'], `${path}[${index}]`)
      assertId(corpus.corpusId, `${path}[${index}].corpusId`)
      assertHash(corpus.corpusHash, `${path}[${index}].corpusHash`)
      if (ids.has(corpus.corpusId)) fail(`${path} contains duplicate corpus ID`)
      ids.add(corpus.corpusId)
    }
    return value as readonly OperatorEvidenceCorpusJoinV1[]
  }
  const evidenceCorpora = validateCorpora(evidence.corpora, 'evidence.corpora')
  const externalCorpora = validateCorpora(external.corpora, 'external evidence joins.corpora')

  const semantic = semantics.find(
    (candidate) =>
      candidate.semanticId === evidence.semantic.semanticId &&
      candidate.semanticRevision === evidence.semantic.semanticRevision,
  )
  if (!semantic || semantic.semanticHash !== evidence.semantic.semanticHash) {
    fail('evidence references a stale semantic hash')
  }
  const linkedCorpusIds = [...semantic.links.differentialCorpusIds].sort()
  const evidenceCorpusIds = evidenceCorpora.map(({ corpusId }) => corpusId).sort()
  if (!sameCanonical(evidenceCorpusIds, linkedCorpusIds)) {
    fail('evidence corpus IDs do not match the semantic links')
  }
  const lowering = lowerings.find((candidate) => candidate.loweringId === evidence.loweringId)
  if (
    !lowering ||
    lowering.loweringHash !== evidence.loweringHash ||
    !sameCanonical(lowering.semantic, evidence.semantic)
  ) {
    fail('evidence references a stale lowering hash')
  }
  const descriptor = descriptors.find(
    (candidate) => candidate.descriptorId === evidence.descriptorId,
  )
  if (
    !descriptor ||
    descriptor.descriptorHash !== evidence.descriptorHash ||
    descriptor.loweringHash !== evidence.loweringHash
  ) {
    fail('evidence references a stale runner descriptor hash')
  }
  if (evidence.emittedArtifactHash !== external.emittedArtifactHash) {
    fail('evidence references a stale emitted artifact hash')
  }
  if (!sameCanonical(evidenceCorpora, externalCorpora)) {
    fail('evidence references a stale corpus hash')
  }
  const { evidenceId: _evidenceId, ...evidenceIdentityInput } = evidence
  const expectedEvidenceId = `@stopcock/evidence/${hashCanonical(evidenceIdentityInput).slice(
    'sha256:'.length,
  )}`
  if (evidence.evidenceId !== expectedEvidenceId) fail('evidence identity hash drift')
}
