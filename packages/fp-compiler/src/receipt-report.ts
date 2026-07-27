// Deterministic renderer/aggregator over ReceiptSchemaV1 records. Pure: no fs,
// no clock, no compilation, and no import of a fusion runtime.
//
// The `.js` specifier is deliberate: the generated module's dotted basename
// looks like it already carries an extension, so the declaration-specifier
// rewriter leaves it alone and NodeNext consumers need it spelled out here.
import { createHash } from 'node:crypto'
import {
  RECEIPT_SCHEMA_V1,
  RECEIPT_SCHEMA_V1_HASH,
  validateReceiptJoinV1,
  validateReceiptV1,
  type CompilerReceiptV1,
  type PlanReceiptV1,
  type ReceiptRecordV1,
  type ReceiptRenderStatusV1,
  type ReleaseEvidenceRefV1,
  type RuntimeProfileV1,
} from './receipt-schema.generated.js'

/*
 * Keep `stopcock check` a standalone packed executable: importing the
 * transform-side receipt emitter would pull Babel and the compiler into the
 * CLI, while importing its shared helper would force a relative runtime
 * chunk. This verifier projection intentionally mirrors receipt-core.ts and
 * is guarded by the tamper corpus plus packed-CLI no-relative-import test.
 */
function checkedCompilerReceiptCoreHash(receipt: CompilerReceiptV1): string {
  const core: Omit<CompilerReceiptV1, 'receiptId'> = {
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
    artifactContext: receipt.artifactContext,
    evidenceRefs: receipt.evidenceRefs,
  }
  return `sha256:${createHash('sha256').update(JSON.stringify(core)).digest('hex')}`
}

export type EvidenceClassV1 =
  | 'declared-capability'
  | 'static-decision'
  | 'corpus-evidence'
  | 'runtime-observation'
  | 'qualified-benchmark'
  | 'release-evidence'

export const EVIDENCE_CLASSES_V1 = [
  'declared-capability',
  'static-decision',
  'corpus-evidence',
  'runtime-observation',
  'qualified-benchmark',
  'release-evidence',
] as const satisfies readonly EvidenceClassV1[]

/** Hash families whose staleness invalidates a distinct set of evidence classes. */
export type StaleHashClassV1 =
  | 'source'
  | 'config'
  | 'semantic-manifest'
  | 'output'
  | 'package'
  | 'runtime'

const INVALIDATED_BY: Readonly<Record<EvidenceClassV1, readonly StaleHashClassV1[]>> = {
  'declared-capability': ['source'],
  'static-decision': ['source', 'config', 'package'],
  'corpus-evidence': ['source', 'config', 'package', 'semantic-manifest'],
  'runtime-observation': ['source', 'config', 'package', 'output', 'runtime'],
  'qualified-benchmark': ['source', 'config', 'package', 'output'],
  'release-evidence': ['source', 'config', 'package', 'output'],
}

const CLASS_LABEL: Readonly<Record<EvidenceClassV1, string>> = {
  'declared-capability': 'declared capability',
  'static-decision': 'static decision',
  'corpus-evidence': 'corpus evidence',
  'runtime-observation': 'runtime observation',
  'qualified-benchmark': 'qualified benchmark',
  'release-evidence': 'packed release evidence',
}

const EVIDENCE_KIND_CLASS: Readonly<Record<string, EvidenceClassV1 | undefined>> = {
  'declared-capability': 'declared-capability',
  'static-decision': 'static-decision',
  'semantic-differential': 'corpus-evidence',
  'runtime-observation': 'runtime-observation',
  'qualified-benchmark': 'qualified-benchmark',
  'release-artifact': 'release-evidence',
}

export interface CheckSiteExpectationV1 {
  readonly receiptId: string
  readonly sourceHash?: string
  readonly emittedCodeHash?: string | null
  readonly artifactHash?: string
}

/**
 * The check envelope. It joins external expectations to receipts; it never
 * becomes part of a receipt and never re-states the receipt schema.
 */
export interface CheckExpectationsV1 {
  readonly kind: 'stopcock.check-expectations'
  readonly schemaVersion: 1
  readonly compilerHash?: string
  readonly configHash?: string
  readonly semanticManifestHash?: string
  readonly runtimeHash?: string
  readonly sites?: readonly CheckSiteExpectationV1[]
}

export type BuiltinPolicyIdV1 = 'unsupported' | 'stale-evidence' | 'coverage-threshold'

export interface ProjectPolicyV1 {
  readonly kind: 'stopcock.check-policy'
  readonly schemaVersion: 1
  readonly policyId: string
  readonly requireTransformed?: boolean
  readonly forbidReasonCodes?: readonly string[]
  readonly minCoverageNumerator?: number
  readonly minCoverageDenominator?: number
  readonly requireEvidence?: readonly EvidenceClassV1[]
}

export interface RenderedEvidenceClassV1 {
  readonly class: EvidenceClassV1
  readonly status: ReceiptRenderStatusV1
  readonly invalidatedBy: readonly StaleHashClassV1[]
  readonly refs: readonly string[]
  readonly statements: readonly string[]
}

export interface RenderedSiteV1 {
  readonly receiptId: string
  readonly sourcePath: string
  readonly siteFingerprint: string
  readonly disposition: CompilerReceiptV1['disposition']
  readonly fallbackTier: CompilerReceiptV1['fallbackTier']
  readonly reasonCodes: readonly string[]
  readonly staleHashClasses: readonly StaleHashClassV1[]
  readonly unresolvedEvidenceRefs: readonly string[]
  readonly classes: readonly RenderedEvidenceClassV1[]
}

export interface PolicyResultV1 {
  readonly policyId: string
  readonly status: 'passed' | 'failed'
  readonly findings: readonly string[]
}

export interface CheckReportV1 {
  readonly tool: 'stopcock-check'
  readonly reportVersion: 1
  readonly receiptSchemaHash: string
  readonly status: 'passed' | 'failed'
  readonly summary: {
    readonly sites: number
    readonly transformed: number
    readonly fallback: number
    readonly skipped: number
    readonly error: number
    readonly staleSites: number
  }
  readonly policies: readonly PolicyResultV1[]
  readonly sites: readonly RenderedSiteV1[]
}

export interface RenderInputV1 {
  readonly receipts: readonly CompilerReceiptV1[]
  readonly plans: readonly PlanReceiptV1[]
  readonly profiles: readonly RuntimeProfileV1[]
  readonly evidence: readonly ReleaseEvidenceRefV1[]
  readonly expectations?: CheckExpectationsV1
  readonly policies: readonly (BuiltinPolicyIdV1 | ProjectPolicyV1)[]
  readonly coverage?: { readonly numerator: number; readonly denominator: number }
}

const short = (hash: string): string => hash.slice(0, 'sha256:'.length + 12)

const STATUS_RANK: Readonly<Record<ReceiptRenderStatusV1, number>> = {
  unavailable: 0,
  declared: 1,
  'statically-selected': 2,
  'corpus-verified': 3,
  'runtime-observed': 4,
  'release-qualified': 5,
  stale: 6,
  rejected: 7,
}

const POSITIVE_STATUSES: readonly ReceiptRenderStatusV1[] = [
  'declared',
  'statically-selected',
  'corpus-verified',
  'runtime-observed',
  'release-qualified',
]

export const isPositiveStatusV1 = (status: ReceiptRenderStatusV1): boolean =>
  POSITIVE_STATUSES.includes(status)

function staleHashClasses(
  receipt: CompilerReceiptV1,
  expectations: CheckExpectationsV1 | undefined,
  profiles: readonly RuntimeProfileV1[],
): StaleHashClassV1[] {
  if (!expectations) return []
  const stale: StaleHashClassV1[] = []
  const site = expectations.sites?.find((entry) => entry.receiptId === receipt.receiptId)
  if (site?.sourceHash !== undefined && site.sourceHash !== receipt.sourceHash) stale.push('source')
  if (expectations.configHash !== undefined && expectations.configHash !== receipt.configHash) {
    stale.push('config')
  }
  if (
    expectations.semanticManifestHash !== undefined &&
    expectations.semanticManifestHash !== receipt.semanticManifestHash
  ) {
    stale.push('semantic-manifest')
  }
  if (site?.emittedCodeHash !== undefined && site.emittedCodeHash !== receipt.emittedCodeHash) {
    stale.push('output')
  }
  if (
    expectations.compilerHash !== undefined &&
    expectations.compilerHash !== receipt.compilerHash
  ) {
    stale.push('package')
  }
  const runtimeMismatch = profiles.some(
    (profile) =>
      (expectations.runtimeHash !== undefined &&
        profile.runtimeHash !== expectations.runtimeHash) ||
      (site?.artifactHash !== undefined && profile.artifactHash !== site.artifactHash),
  )
  if (runtimeMismatch) stale.push('runtime')
  return stale.sort()
}

function renderDeclaredCapability(receipt: CompilerReceiptV1): readonly string[] {
  const semantics =
    receipt.semanticIds.length === 0
      ? 'no generated operator semantic identities'
      : receipt.semanticIds
          .map((identity) => `${identity.semanticId}@${identity.semanticRevision}/${identity.mode}`)
          .join(', ')
  const segments = receipt.segmentKinds.length === 0 ? 'none' : receipt.segmentKinds.join(', ')
  return [
    `the site declares ${semantics} in ${receipt.semanticMode} mode`,
    `declared segment kinds: ${segments}`,
    'a declaration states what the compiler was asked to preserve, not what it produced',
  ]
}

function renderStaticDecision(receipt: CompilerReceiptV1): readonly string[] {
  const reasons =
    receipt.reasonCodes.length === 0
      ? 'no reason codes'
      : `reason codes: ${receipt.reasonCodes.join(', ')}`
  switch (receipt.disposition) {
    case 'transformed':
      return [
        `the compiler selected lowering ${receipt.loweringHash === null ? 'unrecorded' : short(receipt.loweringHash)} at build time; selection is not execution`,
        'allocation claim limited to the compiler-emitted-result contract of the emitted code',
        reasons,
      ]
    case 'fallback':
      return [
        `the site was NOT transformed; it fell back to the ${receipt.fallbackTier} tier`,
        'no lowering claim, no allocation claim, and no execution claim applies to a fallback site',
        reasons,
      ]
    case 'skipped':
      return [`the site was NOT transformed; the compiler skipped it`, reasons]
    default:
      return [`the site was NOT transformed; the compiler reported an error`, reasons]
  }
}

function renderProfile(profile: RuntimeProfileV1): readonly string[] {
  const allocations =
    profile.allocations.length === 0
      ? 'no allocation scopes observed'
      : `observed allocation scopes: ${profile.allocations
          .map(
            (allocation) =>
              `${allocation.scope} count=${allocation.count} bytes=${allocation.bytes}`,
          )
          .join('; ')}`
  return [
    `runtime profile ${short(profile.profileId)} observed ${profile.executions} executions consuming ${profile.consumedItems} items (bucket ${profile.inputSizeBucket})`,
    `selected runner ${profile.selectedRunnerId}, executed runner ${profile.executedRunnerId}`,
    allocations,
  ]
}

function renderCorpusRef(receipt: CompilerReceiptV1, ref: ReleaseEvidenceRefV1): readonly string[] {
  return [
    `corpus ${short(ref.corpusHash)} passed for compiler ${short(receipt.compilerHash)}, descriptor ${short(ref.semanticHash)}, emitted artifact ${short(ref.artifactHash)}`,
    'a corpus pass is evidence for that named compiler, descriptor, and emitted artifact only; it is not proof that an arbitrary user callback is equivalent',
  ]
}

function classStatus(
  base: ReceiptRenderStatusV1,
  refStatuses: readonly ReceiptRenderStatusV1[],
  stale: boolean,
): ReceiptRenderStatusV1 {
  if (stale) return 'stale'
  if (refStatuses.includes('rejected')) return 'rejected'
  if (refStatuses.includes('stale')) return 'stale'
  if (refStatuses.length === 0) return base
  return refStatuses.reduce((best, next) => (STATUS_RANK[next] > STATUS_RANK[best] ? next : best))
}

function renderSite(receipt: CompilerReceiptV1, input: RenderInputV1): RenderedSiteV1 {
  const plan = input.plans.find((entry) => entry.receiptId === receipt.receiptId)
  const profiles = input.profiles
    .filter((profile) => profile.receiptId === receipt.receiptId)
    .sort((a, b) => (a.profileId < b.profileId ? -1 : 1))
  const stale = staleHashClasses(receipt, input.expectations, profiles)
  const staleSet = new Set(stale)

  const refs = receipt.evidenceRefs
  const resolved = refs.flatMap((refId) => {
    const record = input.evidence.find((entry) => entry.evidenceRefId === refId)
    return record ? [record] : []
  })
  const unresolved = refs
    .filter((refId) => !input.evidence.some((entry) => entry.evidenceRefId === refId))
    .sort()

  const byClass = new Map<EvidenceClassV1, ReleaseEvidenceRefV1[]>()
  for (const ref of [...resolved].sort((a, b) => (a.evidenceRefId < b.evidenceRefId ? -1 : 1))) {
    const target = EVIDENCE_KIND_CLASS[ref.evidenceKind]
    if (!target) continue
    const bucket = byClass.get(target) ?? []
    bucket.push(ref)
    byClass.set(target, bucket)
  }

  const joinRejected = (ref: ReleaseEvidenceRefV1): boolean => {
    const expected: Record<string, string> = { semanticHash: ref.semanticHash }
    if (receipt.loweringHash !== null) expected.loweringHash = ref.loweringHash
    return !validateReceiptJoinV1(receipt, expected).ok
  }

  const classes = EVIDENCE_CLASSES_V1.map((id): RenderedEvidenceClassV1 => {
    const invalidatedBy = INVALIDATED_BY[id].filter((hashClass) => staleSet.has(hashClass))
    const isStale = invalidatedBy.length > 0
    const statements: string[] = []
    const refIds: string[] = []
    let refStatuses: ReceiptRenderStatusV1[] = []
    let base: ReceiptRenderStatusV1 = 'unavailable'

    if (id === 'declared-capability') {
      base = 'declared'
      statements.push(...renderDeclaredCapability(receipt))
    } else if (id === 'static-decision') {
      base = 'statically-selected'
      statements.push(...renderStaticDecision(receipt))
      if (plan) {
        statements.push(
          `plan ${short(plan.planHash)} selected ${plan.selectedLoweringHashes.length} lowering(s) at tier ${plan.fallbackTier}`,
        )
      }
    } else if (id === 'runtime-observation') {
      if (profiles.length === 0) {
        statements.push(
          'no runtime profile joins this receipt; nothing was executed or observed, so no early-exit, consumed-item, or runner-execution claim is available',
        )
      } else {
        base = 'runtime-observed'
        for (const profile of profiles) {
          refIds.push(profile.profileId)
          if (plan && profile.planHash !== plan.planHash) {
            refStatuses.push('stale')
            statements.push(
              `runtime profile ${short(profile.profileId)} does not join plan ${short(plan.planHash)} and is rejected as evidence`,
            )
            continue
          }
          refStatuses.push('runtime-observed')
          statements.push(...renderProfile(profile))
        }
      }
    } else {
      const found = byClass.get(id) ?? []
      for (const ref of found) {
        refIds.push(ref.evidenceRefId)
        if (joinRejected(ref)) {
          refStatuses.push('rejected')
          statements.push(
            `evidence ${short(ref.evidenceRefId)} does not join this receipt's semantic or lowering hashes and is rejected`,
          )
          continue
        }
        refStatuses.push(ref.status)
        statements.push(
          ...(id === 'corpus-evidence'
            ? renderCorpusRef(receipt, ref)
            : [
                `evidence ${short(ref.evidenceRefId)} (${ref.evidenceKind}) reports ${ref.status} for artifact ${short(ref.artifactHash)}`,
              ]),
        )
      }
      if (found.length === 0) {
        statements.push(`no ${CLASS_LABEL[id]} was supplied for this site; absence is not a pass`)
      }
    }

    // A stale hash withdraws the claims outright; leaving them in the render
    // next to a status would let a reader keep the sentence and drop the label.
    if (isStale) {
      refStatuses = []
      statements.length = 0
      statements.push(
        `${CLASS_LABEL[id]} is invalidated by stale ${invalidatedBy.join(', ')} hash(es); every claim in this class is withdrawn`,
      )
    }

    return {
      class: id,
      status: classStatus(base, refStatuses, isStale),
      invalidatedBy,
      refs: refIds,
      statements,
    }
  })

  return {
    receiptId: receipt.receiptId,
    sourcePath: receipt.sourcePath,
    siteFingerprint: receipt.siteFingerprint,
    disposition: receipt.disposition,
    fallbackTier: receipt.fallbackTier,
    reasonCodes: receipt.reasonCodes,
    staleHashClasses: stale,
    unresolvedEvidenceRefs: unresolved,
    classes,
  }
}

function evaluatePolicy(
  policy: BuiltinPolicyIdV1 | ProjectPolicyV1,
  sites: readonly RenderedSiteV1[],
  input: RenderInputV1,
): PolicyResultV1 {
  const findings: string[] = []
  const isFullyStatic = (site: RenderedSiteV1): boolean =>
    site.disposition === 'transformed' && !site.reasonCodes.includes('opaque-callback')

  if (policy === 'unsupported') {
    for (const site of sites) {
      if (!isFullyStatic(site)) {
        findings.push(
          site.disposition === 'transformed' &&
            site.reasonCodes.includes('opaque-callback')
            ? `${site.sourcePath} (${short(site.receiptId)}) is partially transformed with an opaque callback`
            : `${site.sourcePath} (${short(site.receiptId)}) is ${site.disposition} at tier ${site.fallbackTier}`,
        )
      }
    }
    return {
      policyId: 'unsupported',
      status: findings.length === 0 ? 'passed' : 'failed',
      findings,
    }
  }

  if (policy === 'stale-evidence') {
    if (!input.expectations) {
      findings.push(
        'no check expectations were supplied, so no hash class can be proven fresh; missing evidence is not a pass',
      )
    }
    for (const site of sites) {
      if (site.staleHashClasses.length > 0) {
        findings.push(
          `${site.sourcePath} (${short(site.receiptId)}) has stale ${site.staleHashClasses.join(', ')} hash(es)`,
        )
      }
      for (const rendered of site.classes) {
        if (rendered.status === 'rejected') {
          findings.push(
            `${site.sourcePath} (${short(site.receiptId)}) ${rendered.class} is rejected`,
          )
        }
      }
      for (const refId of site.unresolvedEvidenceRefs) {
        findings.push(
          `${site.sourcePath} (${short(site.receiptId)}) references evidence ${short(refId)} that was not supplied`,
        )
      }
    }
    return {
      policyId: 'stale-evidence',
      status: findings.length === 0 ? 'passed' : 'failed',
      findings,
    }
  }

  if (policy === 'coverage-threshold') {
    const threshold = input.coverage
    if (!threshold) {
      return {
        policyId: 'coverage-threshold',
        status: 'failed',
        findings: ['no coverage threshold was supplied'],
      }
    }
    const transformed = sites.filter(isFullyStatic).length
    if (transformed * threshold.denominator < threshold.numerator * sites.length) {
      findings.push(
        `coverage ${transformed}/${sites.length} is below the required ${threshold.numerator}/${threshold.denominator}`,
      )
    }
    return {
      policyId: 'coverage-threshold',
      status: findings.length === 0 ? 'passed' : 'failed',
      findings,
    }
  }

  if (policy.requireTransformed === true) {
    for (const site of sites) {
      if (site.disposition !== 'transformed') {
        findings.push(`${site.sourcePath} (${short(site.receiptId)}) is ${site.disposition}`)
      }
    }
  }
  for (const forbidden of policy.forbidReasonCodes ?? []) {
    for (const site of sites) {
      if (site.reasonCodes.includes(forbidden)) {
        findings.push(
          `${site.sourcePath} (${short(site.receiptId)}) reports forbidden reason ${forbidden}`,
        )
      }
    }
  }
  if (policy.minCoverageNumerator !== undefined && policy.minCoverageDenominator !== undefined) {
    const transformed = sites.filter(isFullyStatic).length
    if (transformed * policy.minCoverageDenominator < policy.minCoverageNumerator * sites.length) {
      findings.push(
        `coverage ${transformed}/${sites.length} is below the required ${policy.minCoverageNumerator}/${policy.minCoverageDenominator}`,
      )
    }
  }
  for (const required of policy.requireEvidence ?? []) {
    for (const site of sites) {
      const rendered = site.classes.find((entry) => entry.class === required)
      if (!rendered || !isPositiveStatusV1(rendered.status)) {
        findings.push(
          `${site.sourcePath} (${short(site.receiptId)}) has ${required} status ${rendered?.status ?? 'unavailable'}`,
        )
      }
    }
  }
  return {
    policyId: policy.policyId,
    status: findings.length === 0 ? 'passed' : 'failed',
    findings,
  }
}

export function renderCheckReportV1(input: RenderInputV1): CheckReportV1 {
  const sites = [...input.receipts]
    .sort((a, b) => (a.receiptId < b.receiptId ? -1 : 1))
    .map((receipt) => renderSite(receipt, input))
  const policies = [...input.policies]
    .map((policy) => evaluatePolicy(policy, sites, input))
    .sort((a, b) => (a.policyId < b.policyId ? -1 : 1))
  const count = (disposition: CompilerReceiptV1['disposition']): number =>
    sites.filter((site) => site.disposition === disposition).length

  return {
    tool: 'stopcock-check',
    reportVersion: 1,
    receiptSchemaHash: RECEIPT_SCHEMA_V1_HASH,
    status: policies.every((policy) => policy.status === 'passed') ? 'passed' : 'failed',
    summary: {
      sites: sites.length,
      transformed: count('transformed'),
      fallback: count('fallback'),
      skipped: count('skipped'),
      error: count('error'),
      staleSites: sites.filter((site) => site.staleHashClasses.length > 0).length,
    },
    policies,
    sites,
  }
}

/** Key-sorted JSON so identical inputs are byte-identical. */
export function canonicalJsonV1(value: unknown): string {
  const write = (node: unknown, indent: string): string => {
    if (node === null || typeof node !== 'object') return JSON.stringify(node) ?? 'null'
    const inner = `${indent}  `
    if (Array.isArray(node)) {
      if (node.length === 0) return '[]'
      return `[\n${node.map((item) => `${inner}${write(item, inner)}`).join(',\n')}\n${indent}]`
    }
    const entries = Object.entries(node as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
    if (entries.length === 0) return '{}'
    return `{\n${entries
      .map(([key, item]) => `${inner}${JSON.stringify(key)}: ${write(item, inner)}`)
      .join(',\n')}\n${indent}}`
  }
  return `${write(value, '')}\n`
}

export function formatCheckReportTextV1(report: CheckReportV1): string {
  const lines: string[] = []
  lines.push(`stopcock check — ${report.status}`)
  lines.push(
    `sites ${report.summary.sites}, transformed ${report.summary.transformed}, fallback ${report.summary.fallback}, skipped ${report.summary.skipped}, error ${report.summary.error}, stale ${report.summary.staleSites}`,
  )
  lines.push(`receipt schema ${report.receiptSchemaHash}`)
  for (const site of report.sites) {
    lines.push('')
    lines.push(`site ${short(site.receiptId)} ${site.sourcePath}`)
    for (const rendered of site.classes) {
      lines.push(`  ${CLASS_LABEL[rendered.class].padEnd(24)} ${rendered.status}`)
      for (const statement of rendered.statements) lines.push(`    - ${statement}`)
    }
  }
  lines.push('')
  for (const policy of report.policies) {
    lines.push(`policy ${policy.policyId}: ${policy.status}`)
    for (const finding of policy.findings) lines.push(`  - ${finding}`)
  }
  return `${lines.join('\n')}\n`
}

export type ParsedRecordsV1 = {
  readonly receipts: CompilerReceiptV1[]
  readonly plans: PlanReceiptV1[]
  readonly profiles: RuntimeProfileV1[]
  readonly evidence: ReleaseEvidenceRefV1[]
}

export function emptyRecordsV1(): ParsedRecordsV1 {
  return { receipts: [], plans: [], profiles: [], evidence: [] }
}

/** Validates one parsed JSON document (record or array of records) into buckets. */
export function collectRecordsV1(
  documents: readonly { readonly path: string; readonly value: unknown }[],
):
  | { readonly ok: true; readonly records: ParsedRecordsV1 }
  | { readonly ok: false; readonly errors: string[] } {
  const errors: string[] = []
  const records = emptyRecordsV1()
  const seen = new Set<string>()

  for (const document of documents) {
    const items = Array.isArray(document.value) ? document.value : [document.value]
    for (const [index, item] of items.entries()) {
      const where = `${document.path}[${index}]`
      const result = validateReceiptV1(item)
      if (!result.ok) {
        errors.push(`${where}: ${result.errors.join('; ')}`)
        continue
      }
      const record: ReceiptRecordV1 = result.value
      if (
        record.kind === 'stopcock.compiler-receipt' &&
        checkedCompilerReceiptCoreHash(record) !== record.receiptId
      ) {
        errors.push(`${where}: receiptId does not match the deterministic compiler receipt core`)
        continue
      }
      const id =
        record.kind === 'stopcock.runtime-profile'
          ? record.profileId
          : record.kind === 'stopcock.release-evidence-ref'
            ? record.evidenceRefId
            : record.receiptId
      const key = `${record.kind}:${id}`
      if (seen.has(key)) {
        errors.push(`${where}: duplicate ${record.kind} id ${id}`)
        continue
      }
      seen.add(key)
      switch (record.kind) {
        case 'stopcock.compiler-receipt':
          records.receipts.push(record)
          break
        case 'stopcock.plan-receipt':
          records.plans.push(record)
          break
        case 'stopcock.runtime-profile':
          records.profiles.push(record)
          break
        default:
          records.evidence.push(record)
      }
    }
  }

  for (const receipt of records.receipts) {
    if (
      records.receipts.filter((other) => other.siteFingerprint === receipt.siteFingerprint).length >
      1
    ) {
      errors.push(`duplicate site fingerprint ${receipt.siteFingerprint}`)
      break
    }
  }
  for (const profile of records.profiles) {
    if (!records.receipts.some((receipt) => receipt.receiptId === profile.receiptId)) {
      errors.push(
        `runtime profile ${profile.profileId} references unknown receipt ${profile.receiptId}`,
      )
    }
  }
  for (const plan of records.plans) {
    if (!records.receipts.some((receipt) => receipt.receiptId === plan.receiptId)) {
      errors.push(`plan receipt references unknown receipt ${plan.receiptId}`)
    }
  }

  return errors.length === 0 ? { ok: true, records } : { ok: false, errors }
}

export function validateExpectationsV1(value: unknown): string[] {
  const errors: string[] = []
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return ['check expectations must be an object']
  }
  const record = value as Record<string, unknown>
  if (record.kind !== 'stopcock.check-expectations') errors.push('unknown expectations kind')
  if (record.schemaVersion !== 1) errors.push('unknown expectations schema version')
  const hash = /^sha256:[a-f0-9]{64}$/u
  for (const key of ['compilerHash', 'configHash', 'semanticManifestHash', 'runtimeHash']) {
    const item = record[key]
    if (item !== undefined && (typeof item !== 'string' || !hash.test(item))) {
      errors.push(`expectations.${key} must be a sha256 hash`)
    }
  }
  const allowed = [
    'kind',
    'schemaVersion',
    'compilerHash',
    'configHash',
    'semanticManifestHash',
    'runtimeHash',
    'sites',
  ]
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) errors.push(`expectations has unknown field ${key}`)
  }
  const sites = record.sites
  if (sites !== undefined) {
    if (!Array.isArray(sites)) {
      errors.push('expectations.sites must be an array')
    } else {
      sites.forEach((site, index) => {
        if (site === null || typeof site !== 'object' || Array.isArray(site)) {
          errors.push(`expectations.sites[${index}] must be an object`)
          return
        }
        const entry = site as Record<string, unknown>
        if (typeof entry.receiptId !== 'string' || !hash.test(entry.receiptId)) {
          errors.push(`expectations.sites[${index}].receiptId must be a sha256 hash`)
        }
        for (const key of Object.keys(entry)) {
          if (!['receiptId', 'sourceHash', 'emittedCodeHash', 'artifactHash'].includes(key)) {
            errors.push(`expectations.sites[${index}] has unknown field ${key}`)
          }
        }
        for (const key of ['sourceHash', 'artifactHash']) {
          const item = entry[key]
          if (item !== undefined && (typeof item !== 'string' || !hash.test(item))) {
            errors.push(`expectations.sites[${index}].${key} must be a sha256 hash`)
          }
        }
        const emitted = entry.emittedCodeHash
        if (
          emitted !== undefined &&
          emitted !== null &&
          (typeof emitted !== 'string' || !hash.test(emitted))
        ) {
          errors.push(`expectations.sites[${index}].emittedCodeHash must be null or a sha256 hash`)
        }
      })
    }
  }
  return errors
}

export function validateProjectPolicyV1(value: unknown): string[] {
  const errors: string[] = []
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return ['check policy must be an object']
  }
  const record = value as Record<string, unknown>
  if (record.kind !== 'stopcock.check-policy') errors.push('unknown policy kind')
  if (record.schemaVersion !== 1) errors.push('unknown policy schema version')
  if (typeof record.policyId !== 'string' || record.policyId.length === 0) {
    errors.push('policy.policyId is required')
  }
  const allowed = [
    'kind',
    'schemaVersion',
    'policyId',
    'requireTransformed',
    'forbidReasonCodes',
    'minCoverageNumerator',
    'minCoverageDenominator',
    'requireEvidence',
  ]
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) errors.push(`policy has unknown field ${key}`)
  }
  if (record.requireTransformed !== undefined && typeof record.requireTransformed !== 'boolean') {
    errors.push('policy.requireTransformed must be a boolean')
  }
  if (record.forbidReasonCodes !== undefined) {
    if (
      !Array.isArray(record.forbidReasonCodes) ||
      record.forbidReasonCodes.some(
        (code) => !RECEIPT_SCHEMA_V1.reasonCodes.includes(code as never),
      )
    ) {
      errors.push('policy.forbidReasonCodes contains an unknown reason code')
    }
  }
  for (const key of ['minCoverageNumerator', 'minCoverageDenominator'] as const) {
    const item = record[key]
    if (item !== undefined && (!Number.isSafeInteger(item) || (item as number) < 0)) {
      errors.push(`policy.${key} must be a non-negative integer`)
    }
  }
  if (
    (record.minCoverageNumerator === undefined) !== (record.minCoverageDenominator === undefined) ||
    record.minCoverageDenominator === 0
  ) {
    if (record.minCoverageNumerator !== undefined || record.minCoverageDenominator !== undefined) {
      errors.push('policy coverage requires a numerator and a non-zero denominator')
    }
  }
  if (record.requireEvidence !== undefined) {
    if (
      !Array.isArray(record.requireEvidence) ||
      record.requireEvidence.some((entry) => !EVIDENCE_CLASSES_V1.includes(entry as never))
    ) {
      errors.push('policy.requireEvidence contains an unknown evidence class')
    }
  }
  return errors
}
