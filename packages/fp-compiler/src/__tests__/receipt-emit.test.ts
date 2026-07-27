import { describe, expect, it } from 'vite-plus/test'
import {
  buildCompilerReceipt,
  COMPILER_HASH,
  reasonCodeFor,
  SEMANTIC_MANIFEST_HASH,
  serializeReceipts,
  toReceiptSourcePath,
  type ReceiptContext,
} from '../receipt-emit'
import { validateReceiptV1 } from '../receipt-schema.generated'
import { transformStopcockPipelines } from '../transform'
import type { DiagnosticSite } from '../types'

const CONTEXT: ReceiptContext = {
  root: '/repo',
  configHash: `sha256:${'0'.repeat(64)}`,
  emittedCode: 'emitted',
  sourceMap: '{"version":3}',
}

const ARTIFACT_CONTEXT = {
  fpArtifactHash: `sha256:${'1'.repeat(64)}`,
  compilerArtifactHash: `sha256:${'2'.repeat(64)}`,
  optimizerArtifactHash: `sha256:${'3'.repeat(64)}`,
  fpAbiHash: `sha256:${'4'.repeat(64)}`,
  optimizerBankHash: `sha256:${'5'.repeat(64)}`,
} as const

const siteOf = (overrides: Partial<DiagnosticSite> = {}): DiagnosticSite => ({
  id: '/repo/src/app.ts',
  line: 12,
  column: 4,
  endLine: 12,
  endColumn: 42,
  sourceSpecifier: '@stopcock/fp',
  sourceExport: 'pipe',
  transformed: true,
  steps: 2,
  semantics: 'exact',
  opNames: ['map', 'filter'],
  ...overrides,
})

describe('receipt emission', () => {
  it('produces a schema-valid receipt', () => {
    const receipt = buildCompilerReceipt(siteOf(), 'source', CONTEXT)
    expect(receipt).toBeDefined()
    const validation = validateReceiptV1(receipt)
    expect(validation.ok ? [] : validation.errors).toEqual([])
  })

  it('carries no absolute path', () => {
    const receipt = buildCompilerReceipt(siteOf(), 'source', CONTEXT)
    expect(receipt?.sourcePath).toBe('src/app.ts')
    expect(JSON.stringify(receipt)).not.toContain('/repo')
  })

  it('is byte-identical across runs for identical inputs', () => {
    const first = buildCompilerReceipt(siteOf(), 'source', CONTEXT)
    const second = buildCompilerReceipt(siteOf(), 'source', CONTEXT)
    expect(serializeReceipts([first!])).toBe(serializeReceipts([second!]))
  })

  it('changes receipt identity whenever the deterministic receipt core changes', () => {
    const transformed = buildCompilerReceipt(siteOf(), 'source', CONTEXT)
    const fallback = buildCompilerReceipt(
      siteOf({
        transformed: false,
        fallbackTier: 'sequential',
        reasonCodes: ['strict-scope-exclusion'],
      }),
      'source',
      CONTEXT,
    )
    const changedSource = buildCompilerReceipt(siteOf(), 'different source', CONTEXT)

    expect(fallback.receiptId).not.toBe(transformed.receiptId)
    expect(changedSource.receiptId).not.toBe(transformed.receiptId)
  })

  it('binds a complete packed artifact context into the receipt identity', () => {
    const ordinary = buildCompilerReceipt(siteOf(), 'source', CONTEXT)
    const packed = buildCompilerReceipt(siteOf(), 'source', {
      ...CONTEXT,
      artifactContext: ARTIFACT_CONTEXT,
    })
    const changedArtifact = buildCompilerReceipt(siteOf(), 'source', {
      ...CONTEXT,
      artifactContext: { ...ARTIFACT_CONTEXT, fpArtifactHash: `sha256:${'6'.repeat(64)}` },
    })

    expect(ordinary.artifactContext).toBeNull()
    expect(packed.artifactContext).toEqual(ARTIFACT_CONTEXT)
    expect(packed.receiptId).not.toBe(ordinary.receiptId)
    expect(changedArtifact.receiptId).not.toBe(packed.receiptId)
    expect(validateReceiptV1(packed)).toEqual({ ok: true, value: packed })
  })

  it('rejects malformed or unknown artifact context fields without relaxing record keys', () => {
    const receipt = buildCompilerReceipt(siteOf(), 'source', {
      ...CONTEXT,
      artifactContext: ARTIFACT_CONTEXT,
    })
    const malformed = validateReceiptV1({
      ...receipt,
      artifactContext: { ...ARTIFACT_CONTEXT, optimizerBankHash: null },
    })
    const unknown = validateReceiptV1({
      ...receipt,
      artifactContext: { ...ARTIFACT_CONTEXT, unexpected: true },
    })

    expect(malformed.ok).toBe(false)
    expect(malformed.ok ? [] : malformed.errors).toContain(
      'artifactContext optimizerArtifactHash and optimizerBankHash must both be sha256 hashes or both be null',
    )
    expect(unknown.ok).toBe(false)
    expect(unknown.ok ? [] : unknown.errors).toContain(
      'artifactContext has unknown or missing fields',
    )
  })

  it('orders receipts stably regardless of discovery order', () => {
    const a = buildCompilerReceipt(siteOf({ line: 1 }), 'source', CONTEXT)!
    const b = buildCompilerReceipt(siteOf({ line: 2 }), 'source', CONTEXT)!
    expect(serializeReceipts([a, b])).toBe(serializeReceipts([b, a]))
  })

  it.each([
    ['source', { source: 'other' }],
    ['config', { context: { configHash: `sha256:${'1'.repeat(64)}` } }],
    ['semantics', { site: { semantics: 'pure' as const } }],
  ])('changes when the %s changes', (_label, patch: Record<string, unknown>) => {
    const base = buildCompilerReceipt(siteOf(), 'source', CONTEXT)!
    const changed = buildCompilerReceipt(
      siteOf((patch.site as Partial<DiagnosticSite>) ?? {}),
      (patch.source as string) ?? 'source',
      {
        ...CONTEXT,
        ...((patch.context as Partial<ReceiptContext>) ?? {}),
      },
    )!
    expect(serializeReceipts([changed])).not.toBe(serializeReceipts([base]))
  })

  it('records a skip with a code from the frozen vocabulary, not free text', () => {
    const receipt = buildCompilerReceipt(
      siteOf({ transformed: false, reason: 'map: spread arguments' }),
      'source',
      CONTEXT,
    )
    expect(receipt?.disposition).toBe('skipped')
    expect(receipt?.reasonCodes).toEqual(['unsupported-binding-form'])
    expect(JSON.stringify(receipt)).not.toContain('spread arguments')
  })

  it('classifies a coercible fused quota as a materialization fallback', () => {
    const receipt = buildCompilerReceipt(
      siteOf({
        transformed: false,
        fallbackTier: 'compact',
        reason:
          'take: a fused stream requires a statically primitive-number count; coercible counts retain the source-selected runtime fallback',
      }),
      'source',
      CONTEXT,
    )
    expect(receipt).toMatchObject({
      disposition: 'fallback',
      fallbackTier: 'compact',
      reasonCodes: ['materialization-boundary'],
    })
  })

  it('never claims emitted code for a site it did not transform', () => {
    const receipt = buildCompilerReceipt(siteOf({ transformed: false }), 'source', CONTEXT)
    expect(receipt?.emittedCodeHash).toBeNull()
    expect(receipt?.sourceMapHash).toBeNull()
    expect(receipt?.fallbackTier).toBe('compiler')
  })

  it('emits an honest visible fallback for a site with no identifiable operators', () => {
    // Empty is authoritative here; inventing an identity for an unrecognised
    // call would be the caller-supplied descriptor the provenance rules forbid.
    for (const opNames of [[], undefined] as const) {
      const receipt = buildCompilerReceipt(
        siteOf({
          transformed: false,
          opNames,
          fallbackTier: 'sequential',
          reasonCodes: ['opaque-callback'],
          segmentKinds: ['opaque'],
        }),
        'source',
        CONTEXT,
      )
      expect(receipt).toMatchObject({
        semanticIds: [],
        disposition: 'fallback',
        fallbackTier: 'sequential',
        segmentKinds: ['opaque'],
        reasonCodes: ['opaque-callback'],
      })
      const validation = validateReceiptV1(receipt)
      expect(validation.ok ? [] : validation.errors).toEqual([])
    }
  })

  it('drops operator names the table does not know rather than inventing them', () => {
    const receipt = buildCompilerReceipt(siteOf({ opNames: ['map', 'notAnOp'] }), 'source', CONTEXT)
    expect(receipt?.semanticIds).toHaveLength(1)
    expect(receipt?.semanticIds[0].semanticId).toContain('map')
  })

  it('binds the compiler and manifest identities into every receipt', () => {
    const receipt = buildCompilerReceipt(siteOf(), 'source', CONTEXT)
    expect(receipt?.compilerHash).toBe(COMPILER_HASH)
    expect(receipt?.semanticManifestHash).toBe(SEMANTIC_MANIFEST_HASH)
  })

  it('maps an unclassifiable reason to compiler-defect rather than guessing', () => {
    expect(reasonCodeFor('something nobody anticipated')).toBe('compiler-defect')
    expect(reasonCodeFor(undefined)).toBe('compiler-defect')
  })

  it('hashes an external host ID without leaking its path', () => {
    const externalId = '/private/build-machine/vendor/x.ts'
    const receipt = buildCompilerReceipt(siteOf({ id: externalId }), 'source', CONTEXT)

    expect(receipt.sourcePath).toMatch(/^external\/sha256-[0-9a-f]{64}$/u)
    expect(JSON.stringify(receipt)).not.toContain(externalId)
    expect(JSON.stringify(receipt)).not.toContain('build-machine')
    expect(validateReceiptV1(receipt)).toEqual({ ok: true, value: receipt })
  })

  it('gives the same external ID a stable locator and distinct IDs different locators', () => {
    const first = buildCompilerReceipt(siteOf({ id: '/outside/a.ts' }), 'source', CONTEXT)
    const repeated = buildCompilerReceipt(siteOf({ id: '/outside/a.ts' }), 'source', CONTEXT)
    const second = buildCompilerReceipt(siteOf({ id: '/outside/b.ts' }), 'source', CONTEXT)

    expect(repeated.sourcePath).toBe(first.sourcePath)
    expect(repeated.receiptId).toBe(first.receiptId)
    expect(second.sourcePath).not.toBe(first.sourcePath)
    expect(second.siteFingerprint).not.toBe(first.siteFingerprint)
    expect(second.receiptId).not.toBe(first.receiptId)
  })

  it('normalizes platform separators before hashing an external ID', () => {
    expect(toReceiptSourcePath('C:\\outside\\x.ts', '/repo')).toMatch(
      /^external\/sha256-[0-9a-f]{64}$/u,
    )
  })

  it.each([
    '/absolute/x.ts',
    '../escape.ts',
    'external/foo.ts',
    'external/sha256-nope',
    `external/sha256-${'A'.repeat(64)}`,
  ])('rejects a malformed source locator: %s', (sourcePath) => {
    const receipt = buildCompilerReceipt(siteOf(), 'source', CONTEXT)
    const validation = validateReceiptV1({ ...receipt, sourcePath })

    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      expect(validation.errors).toContain(
        'sourcePath must be normalized project-relative or an exact hashed external locator',
      )
    }
  })
})

describe('receipts from a real transform', () => {
  const source = `import { pipe } from '@stopcock/fp'
import { filter, map } from '@stopcock/fp/array'
export const result = pipe([1, 2, 3], map((x) => x * 2), filter((x) => x > 2))
`

  it('names the operators the site actually used', () => {
    const result = transformStopcockPipelines(source, '/repo/src/app.ts', {
      diagnostics: 'summary',
    })
    const [site] = result.diagnostics
    expect(site.opNames).toEqual(['map', 'filter'])
    const receipt = buildCompilerReceipt(site, source, CONTEXT)
    expect(receipt?.semanticIds.map((identity) => identity.semanticId)).toEqual([
      '@stopcock/fp/array/map',
      '@stopcock/fp/array/filter',
    ])
    const validation = validateReceiptV1(receipt)
    expect(validation.ok ? [] : validation.errors).toEqual([])
  })

  it('derives boundary segments from generated facts for a fallback site', () => {
    const boundarySource = `import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
eval('typeof _src')
export const result = pipe([1, 2, 3], A.reverse)
`
    const result = transformStopcockPipelines(boundarySource, '/repo/src/boundary.ts', {
      diagnostics: 'summary',
    })
    const receipt = buildCompilerReceipt(result.diagnostics[0], boundarySource, CONTEXT)

    expect(receipt).toMatchObject({
      disposition: 'fallback',
      segmentKinds: ['boundary'],
      reasonCodes: ['strict-scope-exclusion'],
    })
    const validation = validateReceiptV1(receipt)
    expect(validation.ok ? [] : validation.errors).toEqual([])
  })

  it('preserves tier-specific fallback topology instead of emitting one segment per fact', () => {
    const rootSource = `import { pipe } from '@stopcock/fp'
import { filter, map } from '@stopcock/fp/array'
eval('root')
export const result = pipe([1, 2, 3], map((x) => x + 1), filter((x) => x > 1))
`
    const fusedSource = `import { pipe } from '@stopcock/fp/fusion'
import { filter, map } from '@stopcock/fp/array'
eval('fused')
export const result = pipe([1, 2, 3], map((x) => x + 1), filter((x) => x > 1))
`
    const root = transformStopcockPipelines(rootSource, '/repo/src/root.ts', {
      diagnostics: 'summary',
    })
    const fused = transformStopcockPipelines(fusedSource, '/repo/src/fused.ts', {
      diagnostics: 'summary',
    })

    expect(buildCompilerReceipt(root.diagnostics[0], rootSource, CONTEXT)?.segmentKinds).toEqual([
      'stream',
      'stream',
    ])
    expect(buildCompilerReceipt(fused.diagnostics[0], fusedSource, CONTEXT)?.segmentKinds).toEqual([
      'stream',
    ])
  })

  it('keeps a malformed recognized operator visible to receipt coverage', () => {
    const malformedSource = `import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
export const result = pipe([1, 2, 3], A.map())
`
    const result = transformStopcockPipelines(malformedSource, '/repo/src/malformed.ts', {
      diagnostics: 'summary',
    })
    expect(result.diagnostics[0].opNames).toEqual(['map'])

    const receipt = buildCompilerReceipt(result.diagnostics[0], malformedSource, CONTEXT)
    expect(receipt).toMatchObject({
      disposition: 'fallback',
      reasonCodes: ['unsupported-binding-form'],
    })
    const validation = validateReceiptV1(receipt)
    expect(validation.ok ? [] : validation.errors).toEqual([])
  })
})
