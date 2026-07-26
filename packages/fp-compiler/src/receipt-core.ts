import { createHash } from 'node:crypto'
import type { CompilerReceiptV1 } from './receipt-schema.generated.js'

export type CompilerReceiptCoreV1 = Omit<CompilerReceiptV1, 'receiptId'>

const sha256 = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

/** Exact deterministic projection used by both emission and `stopcock check`. */
export const compilerReceiptCore = (
  receipt: CompilerReceiptV1 | CompilerReceiptCoreV1,
): CompilerReceiptCoreV1 => ({
  kind: receipt.kind,
  schemaVersion: receipt.schemaVersion,
  sourcePath: receipt.sourcePath,
  sourceHash: receipt.sourceHash,
  sourceSpecifier: receipt.sourceSpecifier,
  sourceExport: receipt.sourceExport,
  sourceSpan: receipt.sourceSpan,
  siteFingerprint: receipt.siteFingerprint,
  compilerHash: receipt.compilerHash,
  configHash: receipt.configHash,
  semanticManifestHash: receipt.semanticManifestHash,
  semanticIds: receipt.semanticIds,
  semanticMode: receipt.semanticMode,
  segmentKinds: receipt.segmentKinds,
  disposition: receipt.disposition,
  loweringHash: receipt.loweringHash,
  fallbackTier: receipt.fallbackTier,
  reasonCodes: receipt.reasonCodes,
  emittedCodeHash: receipt.emittedCodeHash,
  sourceMapHash: receipt.sourceMapHash,
  evidenceRefs: receipt.evidenceRefs,
})

export const compilerReceiptCoreHash = (
  receipt: CompilerReceiptV1 | CompilerReceiptCoreV1,
): string => sha256(JSON.stringify(compilerReceiptCore(receipt)))
