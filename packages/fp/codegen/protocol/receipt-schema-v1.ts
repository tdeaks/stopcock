import { hashCanonical } from './operator-v1'

export const RECEIPT_SCHEMA_DEFINITION_V1 = {
  protocol: 'stopcock.receipt-schema',
  schemaVersion: 1,
  receiptKinds: [
    'stopcock.compiler-receipt',
    'stopcock.plan-receipt',
    'stopcock.runtime-profile',
    'stopcock.release-evidence-ref',
  ],
  semanticModes: ['exact', 'pure'],
  segmentKinds: ['stream', 'boundary', 'opaque'],
  dispositions: ['transformed', 'fallback', 'skipped', 'error'],
  fallbackTiers: ['sequential', 'compact', 'optimized', 'compiler', 'none'],
  evidenceKinds: [
    'declared-capability',
    'static-decision',
    'semantic-differential',
    'runtime-observation',
    'qualified-benchmark',
    'release-artifact',
  ],
  renderStatuses: [
    'declared',
    'statically-selected',
    'corpus-verified',
    'runtime-observed',
    'release-qualified',
    'rejected',
    'stale',
    'unavailable',
  ],
  reasonCodes: [
    'unsupported-operator',
    'opaque-callback',
    'mutable-or-unsafe-capture',
    'unsupported-binding-form',
    'semantic-mode-mismatch',
    'materialization-boundary',
    'domain-boundary',
    'unsupported-import',
    'stale-semantic-hash',
    'stale-lowering-hash',
    'unavailable-backend',
    'unsupported-layout',
    'csp-restriction',
    'host-restriction',
    'strict-scope-exclusion',
    'compiler-defect',
  ],
  allocationScopes: [
    'compiler-emitted-result',
    'fusion-runner-result',
    'fusion-runner-scratch',
    'caller-provided',
    'backend-staging',
  ],
  joinKeys: [
    'receiptId',
    'planHash',
    'sourceHash',
    'siteFingerprint',
    'semanticManifestHash',
    'semanticHash',
    'loweringHash',
    'artifactHash',
    'runtimeHash',
    'corpusHash',
  ],
  validation: {
    unknownFields: 'reject',
    hashes: 'sha256-lowercase-hex-64',
    identifiers: 'stable-namespaced-id',
    compilerSemanticIdentities:
      'ordered-generated-identities-may-be-empty-for-unidentified-fallback',
    compilerReceiptId: 'sha256-of-complete-deterministic-core-excluding-receipt-id',
    numericObservations: 'finite-non-negative',
    sourcePaths: 'normalized-project-relative-or-hashed-external-locator',
    expectedJoinKey: 'must-exist-and-match',
    privacyValues: 'always-false',
  },
  recordKeys: {
    compiler: [
      'kind',
      'schemaVersion',
      'receiptId',
      'sourcePath',
      'sourceHash',
      'sourceSpecifier',
      'sourceExport',
      'sourceSpan',
      'siteFingerprint',
      'compilerHash',
      'configHash',
      'semanticManifestHash',
      'semanticIds',
      'semanticMode',
      'segmentKinds',
      'disposition',
      'loweringHash',
      'fallbackTier',
      'reasonCodes',
      'emittedCodeHash',
      'sourceMapHash',
      'artifactContext',
      'evidenceRefs',
    ],
    plan: [
      'kind',
      'schemaVersion',
      'receiptId',
      'planHash',
      'semanticManifestHash',
      'semanticIds',
      'segmentKinds',
      'selectedLoweringHashes',
      'fallbackTier',
      'reasonCodes',
      'evidenceRefs',
    ],
    runtimeProfile: [
      'kind',
      'schemaVersion',
      'profileId',
      'receiptId',
      'planHash',
      'artifactHash',
      'runtimeHash',
      'executions',
      'inputSizeBucket',
      'consumedItems',
      'selectedRunnerId',
      'executedRunnerId',
      'hotness',
      'timingNanoseconds',
      'allocations',
      'privacy',
    ],
    evidenceRef: [
      'kind',
      'schemaVersion',
      'evidenceRefId',
      'evidenceKind',
      'artifactHash',
      'semanticHash',
      'loweringHash',
      'corpusHash',
      'status',
    ],
  },
} as const

export const RECEIPT_SCHEMA_V1_HASH = hashCanonical(RECEIPT_SCHEMA_DEFINITION_V1)

export type ReceiptViewTargetV1 = 'fp-fusion-debug' | 'fp-compiler'

export function renderReceiptSchemaViewV1(target: ReceiptViewTargetV1): string {
  const schema = JSON.stringify(RECEIPT_SCHEMA_DEFINITION_V1, null, 2)
  return `// GENERATED FILE -- do not edit by hand.
// ReceiptSchemaV1 target: ${target}
// Source: packages/fp/codegen/protocol/receipt-schema-v1.ts

export const RECEIPT_SCHEMA_V1_HASH = '${RECEIPT_SCHEMA_V1_HASH}' as const
export const RECEIPT_SCHEMA_V1 = ${schema} as const

export type ReceiptReasonCodeV1 = (typeof RECEIPT_SCHEMA_V1.reasonCodes)[number]
export type ReceiptRenderStatusV1 = (typeof RECEIPT_SCHEMA_V1.renderStatuses)[number]
export type ReceiptEvidenceKindV1 = (typeof RECEIPT_SCHEMA_V1.evidenceKinds)[number]
export type ReceiptAllocationScopeV1 = (typeof RECEIPT_SCHEMA_V1.allocationScopes)[number]
export type ReceiptSemanticModeV1 = (typeof RECEIPT_SCHEMA_V1.semanticModes)[number]

export interface ReceiptSemanticIdentityV1 {
  readonly semanticId: string
  readonly semanticRevision: number
  readonly semanticHash: string
  readonly mode: ReceiptSemanticModeV1
}

export interface CompilerReceiptV1 {
  readonly kind: 'stopcock.compiler-receipt'
  readonly schemaVersion: 1
  readonly receiptId: string
  readonly sourcePath: string
  readonly sourceHash: string
  readonly sourceSpecifier: string | null
  readonly sourceExport: string | null
  readonly sourceSpan: {
    readonly startLine: number
    readonly startColumn: number
    readonly endLine: number
    readonly endColumn: number
  } | null
  readonly siteFingerprint: string
  readonly compilerHash: string
  readonly configHash: string
  readonly semanticManifestHash: string
  readonly semanticIds: readonly ReceiptSemanticIdentityV1[]
  readonly semanticMode: ReceiptSemanticModeV1
  readonly segmentKinds: readonly ('stream' | 'boundary' | 'opaque')[]
  readonly disposition: 'transformed' | 'fallback' | 'skipped' | 'error'
  readonly loweringHash: string | null
  readonly fallbackTier: 'sequential' | 'compact' | 'optimized' | 'compiler' | 'none'
  readonly reasonCodes: readonly ReceiptReasonCodeV1[]
  readonly emittedCodeHash: string | null
  readonly sourceMapHash: string | null
  /**
   * Bound packed-artifact identity for extracted-host qualification. Ordinary
   * source builds intentionally carry null: a receipt must never imply a
   * package artifact it did not execute against.
   */
  readonly artifactContext: CompilerReceiptArtifactContextV1 | null
  readonly evidenceRefs: readonly string[]
}

export interface CompilerReceiptArtifactContextV1 {
  readonly fpArtifactHash: string
  readonly compilerArtifactHash: string
  readonly optimizerArtifactHash: string | null
  readonly fpAbiHash: string
  readonly optimizerBankHash: string | null
}

export interface PlanReceiptV1 {
  readonly kind: 'stopcock.plan-receipt'
  readonly schemaVersion: 1
  readonly receiptId: string
  readonly planHash: string
  readonly semanticManifestHash: string
  readonly semanticIds: readonly ReceiptSemanticIdentityV1[]
  readonly segmentKinds: readonly ('stream' | 'boundary' | 'opaque')[]
  readonly selectedLoweringHashes: readonly string[]
  readonly fallbackTier: 'sequential' | 'compact' | 'optimized' | 'compiler' | 'none'
  readonly reasonCodes: readonly ReceiptReasonCodeV1[]
  readonly evidenceRefs: readonly string[]
}

export interface RuntimeAllocationObservationV1 {
  readonly scope: ReceiptAllocationScopeV1
  readonly count: number
  readonly bytes: number
}

export interface RuntimeProfileV1 {
  readonly kind: 'stopcock.runtime-profile'
  readonly schemaVersion: 1
  readonly profileId: string
  readonly receiptId: string
  readonly planHash: string
  readonly artifactHash: string
  readonly runtimeHash: string
  readonly executions: number
  readonly inputSizeBucket: string
  readonly consumedItems: number
  readonly selectedRunnerId: string
  readonly executedRunnerId: string
  readonly hotness: number
  readonly timingNanoseconds: number
  readonly allocations: readonly RuntimeAllocationObservationV1[]
  readonly privacy: {
    readonly inputValues: false
    readonly callbackCaptures: false
    readonly resultValues: false
  }
}

export interface ReleaseEvidenceRefV1 {
  readonly kind: 'stopcock.release-evidence-ref'
  readonly schemaVersion: 1
  readonly evidenceRefId: string
  readonly evidenceKind: ReceiptEvidenceKindV1
  readonly artifactHash: string
  readonly semanticHash: string
  readonly loweringHash: string
  readonly corpusHash: string
  readonly status: ReceiptRenderStatusV1
}

export type ReceiptRecordV1 =
  | CompilerReceiptV1
  | PlanReceiptV1
  | RuntimeProfileV1
  | ReleaseEvidenceRefV1

export type ReceiptValidationV1 =
  | { readonly ok: true; readonly value: ReceiptRecordV1 }
  | { readonly ok: false; readonly errors: readonly string[] }

const HASH = /^sha256:[a-f0-9]{64}$/u
const ID = /^[a-z0-9@][a-zA-Z0-9@/._:-]*$/u

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null)

const exactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
  errors: string[],
): void => {
  const actual = Object.keys(value).sort()
  const keys = [...expected].sort()
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    errors.push(\`\${path} has unknown or missing fields\`)
  }
}

const hasHash = (value: unknown): value is string =>
  typeof value === 'string' && HASH.test(value)

const hasId = (value: unknown): value is string =>
  typeof value === 'string' && ID.test(value)

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const stringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const hashes = (
  value: unknown,
  path: string,
  errors: string[],
  allowEmpty = true,
): void => {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some((item) => !hasHash(item))
  ) {
    errors.push(\`\${path} must contain sha256 hashes\`)
  }
}

const enumArray = (
  value: unknown,
  allowed: readonly string[],
  path: string,
  errors: string[],
): void => {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !allowed.includes(item))
  ) {
    errors.push(\`\${path} contains an unknown value\`)
  }
}

const semanticIdentities = (
  value: unknown,
  errors: string[],
  allowEmpty = false,
): void => {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    errors.push(
      allowEmpty
        ? 'semanticIds must be an array'
        : 'semanticIds must be a non-empty array',
    )
    return
  }
  value.forEach((item, index) => {
    const path = \`semanticIds[\${index}]\`
    if (!isRecord(item)) {
      errors.push(\`\${path} must be an object\`)
      return
    }
    exactKeys(item, ['semanticId', 'semanticRevision', 'semanticHash', 'mode'], path, errors)
    if (!hasId(item.semanticId)) errors.push(\`\${path}.semanticId is invalid\`)
    if (!Number.isSafeInteger(item.semanticRevision) || (item.semanticRevision as number) < 1) {
      errors.push(\`\${path}.semanticRevision is invalid\`)
    }
    if (!hasHash(item.semanticHash)) errors.push(\`\${path}.semanticHash is invalid\`)
    if (!RECEIPT_SCHEMA_V1.semanticModes.includes(item.mode as never)) {
      errors.push(\`\${path}.mode is invalid\`)
    }
  })
}

const commonVersion = (value: Record<string, unknown>, errors: string[]): void => {
  if (value.schemaVersion !== 1) errors.push('unknown receipt schema version')
}

const commonReceiptId = (
  value: Record<string, unknown>,
  key: 'receiptId' | 'profileId' | 'evidenceRefId',
  errors: string[],
): void => {
  if (!hasHash(value[key])) errors.push(\`\${key} must be a deterministic sha256 hash\`)
}

const artifactContext = (value: unknown, errors: string[]): void => {
  if (value === null) return
  if (!isRecord(value)) {
    errors.push('artifactContext must be null or an object')
    return
  }
  exactKeys(
    value,
    [
      'fpArtifactHash',
      'compilerArtifactHash',
      'optimizerArtifactHash',
      'fpAbiHash',
      'optimizerBankHash',
    ],
    'artifactContext',
    errors,
  )
  for (const key of ['fpArtifactHash', 'compilerArtifactHash', 'fpAbiHash'] as const) {
    if (!hasHash(value[key])) errors.push(\`artifactContext.\${key} must be a sha256 hash\`)
  }
  const optimizerAbsent =
    value.optimizerArtifactHash === null && value.optimizerBankHash === null
  const optimizerPresent =
    hasHash(value.optimizerArtifactHash) && hasHash(value.optimizerBankHash)
  if (!optimizerAbsent && !optimizerPresent) {
    errors.push(
      'artifactContext optimizerArtifactHash and optimizerBankHash must both be sha256 hashes or both be null',
    )
  }
}

const validateCompiler = (
  value: Record<string, unknown>,
  errors: string[],
): void => {
  exactKeys(value, RECEIPT_SCHEMA_V1.recordKeys.compiler, 'compiler receipt', errors)
  commonVersion(value, errors)
  commonReceiptId(value, 'receiptId', errors)
  const malformedExternalLocator =
    typeof value.sourcePath === 'string' &&
    value.sourcePath.startsWith('external/') &&
    !/^external\\/sha256-[0-9a-f]{64}$/u.test(value.sourcePath)
  if (
    typeof value.sourcePath !== 'string' ||
    value.sourcePath.length === 0 ||
    value.sourcePath.startsWith('/') ||
    /^[a-zA-Z]:[\\\\/]/u.test(value.sourcePath) ||
    value.sourcePath.includes('\\\\') ||
    value.sourcePath.includes('//') ||
    /(?:^|\\/)\\.{1,2}(?:\\/|$)/u.test(value.sourcePath) ||
    malformedExternalLocator
  ) {
    errors.push(
      'sourcePath must be normalized project-relative or an exact hashed external locator',
    )
  }
  for (const key of [
    'sourceHash',
    'siteFingerprint',
    'compilerHash',
    'configHash',
    'semanticManifestHash',
  ] as const) {
    if (!hasHash(value[key])) errors.push(\`\${key} must be a sha256 hash\`)
  }
  const sourceSpecifierValid =
    value.sourceSpecifier === null ||
    (typeof value.sourceSpecifier === 'string' && value.sourceSpecifier.length > 0)
  if (!sourceSpecifierValid) {
    errors.push('sourceSpecifier must be null or a non-empty module specifier')
  }
  const sourceExportValid = value.sourceExport === null || hasId(value.sourceExport)
  if (!sourceExportValid) {
    errors.push('sourceExport must be null or a stable exported identifier')
  }
  if (value.sourceSpan === null) {
    if (value.sourceSpecifier !== null || value.sourceExport !== null) {
      errors.push('a missing sourceSpan requires null sourceSpecifier and sourceExport')
    }
  } else if (!isRecord(value.sourceSpan)) {
    errors.push('sourceSpan must be null or an object')
  } else {
    exactKeys(
      value.sourceSpan,
      ['startLine', 'startColumn', 'endLine', 'endColumn'],
      'sourceSpan',
      errors,
    )
    const { startLine, startColumn, endLine, endColumn } = value.sourceSpan
    if (
      !Number.isSafeInteger(startLine) ||
      (startLine as number) < 1 ||
      !Number.isSafeInteger(startColumn) ||
      (startColumn as number) < 0 ||
      !Number.isSafeInteger(endLine) ||
      (endLine as number) < 1 ||
      !Number.isSafeInteger(endColumn) ||
      (endColumn as number) < 0 ||
      (endLine as number) < (startLine as number) ||
      ((endLine as number) === (startLine as number) &&
        (endColumn as number) < (startColumn as number))
    ) {
      errors.push('sourceSpan must be an ordered one-based line and zero-based column range')
    }
    if (value.sourceSpecifier === null || value.sourceExport === null) {
      errors.push('a discovered sourceSpan requires sourceSpecifier and sourceExport')
    }
  }
  semanticIdentities(value.semanticIds, errors, true)
  if (!RECEIPT_SCHEMA_V1.semanticModes.includes(value.semanticMode as never)) {
    errors.push('semanticMode is invalid')
  }
  enumArray(value.segmentKinds, RECEIPT_SCHEMA_V1.segmentKinds, 'segmentKinds', errors)
  if (!RECEIPT_SCHEMA_V1.dispositions.includes(value.disposition as never)) {
    errors.push('disposition is invalid')
  }
  if (value.loweringHash !== null && !hasHash(value.loweringHash)) {
    errors.push('loweringHash must be null or a sha256 hash')
  }
  if (!RECEIPT_SCHEMA_V1.fallbackTiers.includes(value.fallbackTier as never)) {
    errors.push('fallbackTier is invalid')
  }
  enumArray(value.reasonCodes, RECEIPT_SCHEMA_V1.reasonCodes, 'reasonCodes', errors)
  if (value.emittedCodeHash !== null && !hasHash(value.emittedCodeHash)) {
    errors.push('emittedCodeHash must be null or a sha256 hash')
  }
  if (value.sourceMapHash !== null && !hasHash(value.sourceMapHash)) {
    errors.push('sourceMapHash must be null or a sha256 hash')
  }
  artifactContext(value.artifactContext, errors)
  hashes(value.evidenceRefs, 'evidenceRefs', errors)
}

const validatePlan = (
  value: Record<string, unknown>,
  errors: string[],
): void => {
  exactKeys(value, RECEIPT_SCHEMA_V1.recordKeys.plan, 'plan receipt', errors)
  commonVersion(value, errors)
  commonReceiptId(value, 'receiptId', errors)
  for (const key of ['planHash', 'semanticManifestHash'] as const) {
    if (!hasHash(value[key])) errors.push(\`\${key} must be a sha256 hash\`)
  }
  semanticIdentities(value.semanticIds, errors)
  enumArray(value.segmentKinds, RECEIPT_SCHEMA_V1.segmentKinds, 'segmentKinds', errors)
  hashes(value.selectedLoweringHashes, 'selectedLoweringHashes', errors)
  if (!RECEIPT_SCHEMA_V1.fallbackTiers.includes(value.fallbackTier as never)) {
    errors.push('fallbackTier is invalid')
  }
  enumArray(value.reasonCodes, RECEIPT_SCHEMA_V1.reasonCodes, 'reasonCodes', errors)
  hashes(value.evidenceRefs, 'evidenceRefs', errors)
}

const validateRuntimeProfile = (
  value: Record<string, unknown>,
  errors: string[],
): void => {
  exactKeys(value, RECEIPT_SCHEMA_V1.recordKeys.runtimeProfile, 'runtime profile', errors)
  commonVersion(value, errors)
  commonReceiptId(value, 'profileId', errors)
  for (const key of ['receiptId', 'planHash', 'artifactHash', 'runtimeHash'] as const) {
    if (!hasHash(value[key])) errors.push(\`\${key} must be a sha256 hash\`)
  }
  for (const key of [
    'executions',
    'consumedItems',
    'hotness',
    'timingNanoseconds',
  ] as const) {
    if (!finiteNonNegative(value[key])) errors.push(\`\${key} must be finite and non-negative\`)
  }
  for (const key of ['inputSizeBucket', 'selectedRunnerId', 'executedRunnerId'] as const) {
    if (!hasId(value[key])) errors.push(\`\${key} must be a stable ID\`)
  }
  if (!Array.isArray(value.allocations)) {
    errors.push('allocations must be an array')
  } else {
    value.allocations.forEach((allocation, index) => {
      const path = \`allocations[\${index}]\`
      if (!isRecord(allocation)) {
        errors.push(\`\${path} must be an object\`)
        return
      }
      exactKeys(allocation, ['scope', 'count', 'bytes'], path, errors)
      if (!RECEIPT_SCHEMA_V1.allocationScopes.includes(allocation.scope as never)) {
        errors.push(\`\${path}.scope is invalid\`)
      }
      if (!finiteNonNegative(allocation.count)) errors.push(\`\${path}.count is invalid\`)
      if (!finiteNonNegative(allocation.bytes)) errors.push(\`\${path}.bytes is invalid\`)
    })
  }
  if (!isRecord(value.privacy)) {
    errors.push('privacy must be an object')
  } else {
    exactKeys(
      value.privacy,
      ['inputValues', 'callbackCaptures', 'resultValues'],
      'privacy',
      errors,
    )
    for (const key of ['inputValues', 'callbackCaptures', 'resultValues'] as const) {
      if (value.privacy[key] !== false) errors.push(\`privacy.\${key} must be false\`)
    }
  }
}

const validateEvidenceRef = (
  value: Record<string, unknown>,
  errors: string[],
): void => {
  exactKeys(value, RECEIPT_SCHEMA_V1.recordKeys.evidenceRef, 'evidence reference', errors)
  commonVersion(value, errors)
  commonReceiptId(value, 'evidenceRefId', errors)
  if (!RECEIPT_SCHEMA_V1.evidenceKinds.includes(value.evidenceKind as never)) {
    errors.push('evidenceKind is invalid')
  }
  for (const key of ['artifactHash', 'semanticHash', 'loweringHash', 'corpusHash'] as const) {
    if (!hasHash(value[key])) errors.push(\`\${key} must be a sha256 hash\`)
  }
  if (!RECEIPT_SCHEMA_V1.renderStatuses.includes(value.status as never)) {
    errors.push('status is invalid')
  }
}

export function validateReceiptV1(value: unknown): ReceiptValidationV1 {
  const errors: string[] = []
  if (!isRecord(value)) return { ok: false, errors: ['receipt must be a plain object'] }
  if (typeof value.kind !== 'string') return { ok: false, errors: ['receipt kind is missing'] }
  switch (value.kind) {
    case 'stopcock.compiler-receipt':
      validateCompiler(value, errors)
      break
    case 'stopcock.plan-receipt':
      validatePlan(value, errors)
      break
    case 'stopcock.runtime-profile':
      validateRuntimeProfile(value, errors)
      break
    case 'stopcock.release-evidence-ref':
      validateEvidenceRef(value, errors)
      break
    default:
      errors.push('unknown receipt kind')
  }
  return errors.length === 0
    ? { ok: true, value: value as unknown as ReceiptRecordV1 }
    : { ok: false, errors }
}

export function assertReceiptV1(value: unknown): asserts value is ReceiptRecordV1 {
  const result = validateReceiptV1(value)
  if (!result.ok) throw new Error(\`ReceiptSchemaV1: \${result.errors.join('; ')}\`)
}

export function validateReceiptJoinV1(
  receipt: ReceiptRecordV1,
  expected: Readonly<Record<string, string>>,
): ReceiptValidationV1 {
  const validated = validateReceiptV1(receipt)
  if (!validated.ok) return validated
  const errors: string[] = []
  const record = receipt as unknown as Record<string, unknown>
  const valuesForJoin = (key: string): readonly string[] => {
    if (key === 'semanticHash' && Array.isArray(record.semanticIds)) {
      return record.semanticIds.flatMap((identity) =>
        isRecord(identity) && typeof identity.semanticHash === 'string'
          ? [identity.semanticHash]
          : [],
      )
    }
    if (key === 'loweringHash' && Array.isArray(record.selectedLoweringHashes)) {
      return record.selectedLoweringHashes.filter(
        (value): value is string => typeof value === 'string',
      )
    }
    return typeof record[key] === 'string' ? [record[key] as string] : []
  }
  for (const [key, hash] of Object.entries(expected)) {
    if (!RECEIPT_SCHEMA_V1.joinKeys.includes(key as never)) {
      errors.push(\`unknown join key \${key}\`)
      continue
    }
    if (!hasHash(hash)) {
      errors.push(\`join value for \${key} is not a sha256 hash\`)
      continue
    }
    const actual = valuesForJoin(key)
    if (actual.length === 0) {
      errors.push(\`join key \${key} is absent from this receipt\`)
    } else if (!actual.includes(hash)) {
      errors.push(\`join mismatch for \${key}\`)
    }
  }
  return errors.length === 0 ? validated : { ok: false, errors }
}

export function isReceiptStringArrayV1(value: unknown): value is readonly string[] {
  return stringArray(value)
}
`
}
