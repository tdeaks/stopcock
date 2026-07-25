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
import { OPS_TABLE } from './ops-table.js'
import type { CompilerReceiptV1, ReceiptReasonCodeV1 } from './receipt-schema.generated.js'
import type { CompilerSemantics, DiagnosticSite } from './types.js'

const sha256 = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

/** Repo-relative and POSIX-separated, so a receipt does not carry a machine. */
export const toPortablePath = (id: string, root: string): string => {
  const relativePath = relative(root, id)
  const portable = relativePath.split(sep).join('/')
  return portable.startsWith('..') || portable.length === 0 ? id.split(sep).join('/') : portable
}

const opByName = new Map(OPS_TABLE.map((entry) => [entry.name, entry]))

/**
 * The compiler's own identity. Any change to the operator table changes what
 * the compiler can decide, so it belongs in the hash that invalidates receipts.
 */
export const COMPILER_HASH = sha256(
  JSON.stringify(
    OPS_TABLE.map((entry) => [
      entry.name,
      entry.semanticId,
      entry.semanticRevision,
      entry.semanticHash,
    ]),
  ),
)

export const SEMANTIC_MANIFEST_HASH = sha256(
  JSON.stringify(OPS_TABLE.map((entry) => [entry.semanticId, entry.semanticHash])),
)

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
  readonly semantics: CompilerSemantics
  readonly emittedCode: string | null
  readonly sourceMap: string | null
}

/**
 * Sites whose operators could not be identified produce no semantic identities
 * and therefore no receipt: the schema requires at least one, and inventing an
 * identity for an unrecognised call would be exactly the caller-supplied
 * descriptor the provenance rules forbid. Those sites are counted, not
 * described.
 */
export const buildCompilerReceipt = (
  site: DiagnosticSite,
  source: string,
  context: ReceiptContext,
): CompilerReceiptV1 | undefined => {
  const opNames = site.opNames ?? []
  const identities = opNames
    .map((name) => opByName.get(name))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
    .map((entry) => ({
      semanticId: entry.semanticId,
      semanticRevision: entry.semanticRevision,
      semanticHash: entry.semanticHash,
      mode: context.semantics,
    }))
  if (identities.length === 0) return undefined

  const sourcePath = toPortablePath(site.id, context.root)
  const sourceHash = sha256(source)
  // Position plus shape, so moving a site in a file changes its identity but
  // reformatting an unrelated part of the file does not move every receipt.
  const siteFingerprint = sha256(`${sourcePath}:${site.line}:${site.column}:${opNames.join(',')}`)

  return {
    kind: 'stopcock.compiler-receipt',
    schemaVersion: 1,
    // The schema requires a hash. The site's readable position lives in the
    // fingerprint inputs rather than in this id.
    receiptId: sha256(
      `${sourcePath}#${site.line}:${site.column}|${context.configHash}|${COMPILER_HASH}`,
    ),
    sourcePath,
    sourceHash,
    siteFingerprint,
    compilerHash: COMPILER_HASH,
    configHash: context.configHash,
    semanticManifestHash: SEMANTIC_MANIFEST_HASH,
    semanticIds: identities,
    semanticMode: context.semantics,
    segmentKinds: identities.map(() => 'stream' as const),
    disposition: site.transformed ? 'transformed' : 'skipped',
    loweringHash: null,
    // A skipped site keeps running the runtime it always ran.
    fallbackTier: site.transformed ? 'none' : 'compiler',
    reasonCodes: site.transformed ? [] : [reasonCodeFor(site.reason)],
    emittedCodeHash:
      site.transformed && context.emittedCode !== null ? sha256(context.emittedCode) : null,
    sourceMapHash:
      site.transformed && context.sourceMap !== null ? sha256(context.sourceMap) : null,
    evidenceRefs: [],
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
