/**
 * Turns a transformed site into a `CompilerReceiptV1`.
 *
 * A receipt records what the compiler decided and why, and nothing about
 * whether that decision turned out well. It never embeds later evidence about
 * itself: runtime observations live in separate `RuntimeProfileV1` records and
 * release evidence in `ReleaseEvidenceRefV1`, both joined by hash.
 *
 * Determinism is the whole point. Identical source, config, and semantics must
 * produce byte-identical receipts, so nothing here reads a clock, a random
 * source, or an absolute path.
 */
import { createHash } from 'node:crypto'
import { relative, sep } from 'node:path'
import {
  FULL_ARRAY_LOWERING_ID,
  FULL_RUNNER_LOWERING_ID,
  PREFIX_RESIDUAL_RECEIVER_INSENSITIVE_LOWERING_ID,
  PREFIX_RESIDUAL_STEP_VECTOR_LOWERING_ID,
} from './codegen.js'
import {
  COMPILER_EMITTER_ABI_V1_HASH,
  OPERATOR_SEMANTIC_FACTS_V1_HASH,
  OPS_TABLE,
} from './ops-table.js'
import { segmentKindsForOperatorFacts } from './plan-ir.js'
import { compilerReceiptCoreHash } from './receipt-core.js'
import type { CompilerReceiptV1, ReceiptReasonCodeV1 } from './receipt-schema.generated.js'
import type { DiagnosticSite } from './types.js'

export {
  compilerReceiptCore,
  compilerReceiptCoreHash,
  type CompilerReceiptCoreV1,
} from './receipt-core.js'

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex')

const sha256 = (value: string): string => `sha256:${sha256Hex(value)}`

const EXTERNAL_SOURCE_LOCATOR_DOMAIN = 'stopcock.receipt.external-source.v1\0'

/**
 * Project-relative when the host ID belongs to the configured root; otherwise
 * an opaque, deterministic locator. Raw external IDs must never enter a
 * receipt because they commonly contain machine-specific absolute paths.
 */
export const toReceiptSourcePath = (id: string, root: string): string => {
  const relativePath = relative(root, id)
  const portable = relativePath.split(sep).join('/').replaceAll('\\', '/')
  const isProjectRelative =
    portable.length > 0 &&
    portable !== '..' &&
    !portable.startsWith('../') &&
    !portable.startsWith('/') &&
    !/^[a-zA-Z]:\//u.test(portable)

  if (isProjectRelative) return portable

  const normalizedId = id.split(sep).join('/').replaceAll('\\', '/')
  return `external/sha256-${sha256Hex(`${EXTERNAL_SOURCE_LOCATOR_DOMAIN}${normalizedId}`)}`
}

const opByName = new Map(OPS_TABLE.map((entry) => [entry.name, entry]))

/**
 * The compiler's own identity. Any change to the operator table changes what
 * the compiler can decide, so it belongs in the hash that invalidates receipts.
 */
export const COMPILER_HASH = sha256(
  JSON.stringify({
    operators: OPS_TABLE.map((entry) => [
      entry.name,
      entry.semanticId,
      entry.semanticRevision,
      entry.semanticHash,
      entry.loweringId,
      entry.loweringRevision,
      entry.loweringAbiVersion,
      entry.loweringHash,
    ]),
    compilerLowerings: [
      FULL_ARRAY_LOWERING_ID,
      FULL_RUNNER_LOWERING_ID,
      PREFIX_RESIDUAL_RECEIVER_INSENSITIVE_LOWERING_ID,
      PREFIX_RESIDUAL_STEP_VECTOR_LOWERING_ID,
    ],
    compilerEmitterAbiHash: COMPILER_EMITTER_ABI_V1_HASH,
  }),
)

export const SEMANTIC_MANIFEST_HASH = OPERATOR_SEMANTIC_FACTS_V1_HASH

/**
 * Free-text reasons are for humans. A receipt carries a code from the frozen
 * vocabulary, and anything unrecognised is `compiler-defect` rather than a
 * guess: an unclassifiable skip is a gap in this mapping, and saying so is more
 * useful than picking the nearest-looking code.
 */
export const reasonCodeFor = (reason: string | undefined): ReceiptReasonCodeV1 => {
  if (reason === undefined) return 'compiler-defect'
  const text = reason.toLowerCase()
  if (text.includes('not an imported array op') || text.includes('unrecognized step')) {
    return 'unsupported-operator'
  }
  if (text.includes('spread arguments')) return 'unsupported-binding-form'
  if (text.includes('arg count') || text.includes('requires arguments')) {
    return 'unsupported-binding-form'
  }
  if (text.includes('must be used bare') || text.includes('must be the last step')) {
    return 'unsupported-operator'
  }
  if (text.includes('compilepure')) return 'semantic-mode-mismatch'
  if (text.includes('deferred to a later compiler wave')) return 'unsupported-operator'
  return 'compiler-defect'
}

export interface ReceiptContext {
  readonly root: string
  readonly configHash: string
  readonly emittedCode: string | null
  readonly sourceMap: string | null
}

/**
 * A discovered site always produces a receipt. When no generated operator can
 * be identified, `semanticIds` is honestly empty rather than populated with a
 * caller-derived or synthetic identity; the fallback tier and reason code
 * still make the unsupported site visible to `stopcock check`.
 */
export const buildCompilerReceipt = (
  site: DiagnosticSite,
  source: string,
  context: ReceiptContext,
): CompilerReceiptV1 => {
  const opNames = site.opNames ?? []
  const facts =
    site.operatorFacts ??
    opNames
      .map((name) => opByName.get(name))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
  const identities = facts.map((entry) => ({
    semanticId: entry.semanticId,
    semanticRevision: entry.semanticRevision,
    semanticHash: entry.semanticHash,
    mode: site.semantics,
  }))
  const sourcePath = toReceiptSourcePath(site.id, context.root)
  const sourceHash = sha256(source)
  const sourceSpan =
    site.line > 0 && site.endLine > 0
      ? {
          startLine: site.line,
          startColumn: site.column,
          endLine: site.endLine,
          endColumn: site.endColumn,
        }
      : null
  const sourceSpecifier = sourceSpan === null ? null : (site.sourceSpecifier ?? null)
  const sourceExport = sourceSpan === null ? null : (site.sourceExport ?? null)
  // Position plus shape, so moving a site in a file changes its identity but
  // reformatting an unrelated part of the file does not move every receipt.
  const siteFingerprint = sha256(
    JSON.stringify({
      sourcePath,
      sourceSpecifier,
      sourceExport,
      sourceSpan,
      semanticIds: facts.map((fact) => fact.semanticId),
    }),
  )
  const segmentKinds =
    site.segmentKinds ??
    (facts.length === 0
      ? []
      : segmentKindsForOperatorFacts(
          facts,
          site.fallbackTier === 'sequential' ? 'sequential-stages' : 'fused-streams',
        ))
  const loweringHash =
    site.transformed && site.loweringId !== undefined
      ? sha256(
          JSON.stringify({
            loweringId: site.loweringId,
            semantics: site.semantics,
            compilerEmitterAbiHash: COMPILER_EMITTER_ABI_V1_HASH,
            operatorLowerings: facts.map((entry) => [
              entry.loweringId,
              entry.loweringRevision,
              entry.loweringAbiVersion,
              entry.loweringHash,
            ]),
            segmentKinds,
          }),
        )
      : null
  const disposition: CompilerReceiptV1['disposition'] = site.transformed
    ? 'transformed'
    : site.fallbackTier !== undefined
      ? 'fallback'
      : 'skipped'
  const fallbackTier: CompilerReceiptV1['fallbackTier'] = site.transformed
    ? 'none'
    : (site.fallbackTier ?? 'compiler')
  const reasonCodes = site.reasonCodes ?? (site.transformed ? [] : [reasonCodeFor(site.reason)])
  const emittedCodeHash =
    site.transformed && context.emittedCode !== null ? sha256(context.emittedCode) : null
  const sourceMapHash =
    site.transformed && context.sourceMap !== null ? sha256(context.sourceMap) : null
  const receiptCore = {
    kind: 'stopcock.compiler-receipt' as const,
    schemaVersion: 1 as const,
    sourcePath,
    sourceHash,
    sourceSpecifier,
    sourceExport,
    sourceSpan,
    siteFingerprint,
    compilerHash: COMPILER_HASH,
    configHash: context.configHash,
    semanticManifestHash: SEMANTIC_MANIFEST_HASH,
    semanticIds: identities,
    semanticMode: site.semantics,
    segmentKinds,
    disposition,
    loweringHash,
    fallbackTier,
    reasonCodes,
    emittedCodeHash,
    sourceMapHash,
    evidenceRefs: [] as readonly string[],
  }

  return {
    ...receiptCore,
    /** Hash of the complete deterministic core, excluding only this field. */
    receiptId: compilerReceiptCoreHash(receiptCore),
  }
}

/** Stable key order, so two runs produce identical bytes. */
export const serializeReceipts = (receipts: readonly CompilerReceiptV1[]): string =>
  `${JSON.stringify(
    [...receipts].sort((left, right) => (left.receiptId < right.receiptId ? -1 : 1)),
    Object.keys({
      kind: 0,
      schemaVersion: 0,
      receiptId: 0,
      sourcePath: 0,
      sourceHash: 0,
      sourceSpecifier: 0,
      sourceExport: 0,
      sourceSpan: 0,
      startLine: 0,
      startColumn: 0,
      endLine: 0,
      endColumn: 0,
      siteFingerprint: 0,
      compilerHash: 0,
      configHash: 0,
      semanticManifestHash: 0,
      semanticIds: 0,
      semanticId: 0,
      semanticRevision: 0,
      semanticHash: 0,
      mode: 0,
      semanticMode: 0,
      segmentKinds: 0,
      disposition: 0,
      loweringHash: 0,
      fallbackTier: 0,
      reasonCodes: 0,
      emittedCodeHash: 0,
      sourceMapHash: 0,
      evidenceRefs: 0,
    }),
    2,
  )}\n`
