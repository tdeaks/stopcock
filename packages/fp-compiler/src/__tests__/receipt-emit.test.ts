import { describe, expect, it } from 'vite-plus/test'
import {
  buildCompilerReceipt,
  COMPILER_HASH,
  reasonCodeFor,
  SEMANTIC_MANIFEST_HASH,
  serializeReceipts,
  toPortablePath,
  type ReceiptContext,
} from '../receipt-emit'
import { validateReceiptV1 } from '../receipt-schema.generated'
import { transformStopcockPipelines } from '../transform'
import type { DiagnosticSite } from '../types'

const CONTEXT: ReceiptContext = {
  root: '/repo',
  configHash: `sha256:${'0'.repeat(64)}`,
  semantics: 'exact',
  emittedCode: 'emitted',
  sourceMap: '{"version":3}',
}

const siteOf = (overrides: Partial<DiagnosticSite> = {}): DiagnosticSite => ({
  id: '/repo/src/app.ts',
  line: 12,
  column: 4,
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

  it('orders receipts stably regardless of discovery order', () => {
    const a = buildCompilerReceipt(siteOf({ line: 1 }), 'source', CONTEXT)!
    const b = buildCompilerReceipt(siteOf({ line: 2 }), 'source', CONTEXT)!
    expect(serializeReceipts([a, b])).toBe(serializeReceipts([b, a]))
  })

  it.each([
    ['source', { source: 'other' }],
    ['config', { context: { configHash: `sha256:${'1'.repeat(64)}` } }],
    ['semantics', { context: { semantics: 'pure' as const } }],
  ])('changes when the %s changes', (_label, patch: Record<string, unknown>) => {
    const base = buildCompilerReceipt(siteOf(), 'source', CONTEXT)!
    const changed = buildCompilerReceipt(siteOf(), (patch.source as string) ?? 'source', {
      ...CONTEXT,
      ...((patch.context as Partial<ReceiptContext>) ?? {}),
    })!
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

  it('never claims emitted code for a site it did not transform', () => {
    const receipt = buildCompilerReceipt(siteOf({ transformed: false }), 'source', CONTEXT)
    expect(receipt?.emittedCodeHash).toBeNull()
    expect(receipt?.sourceMapHash).toBeNull()
    expect(receipt?.fallbackTier).toBe('compiler')
  })

  it('emits nothing for a site with no identifiable operators', () => {
    // Inventing an identity for an unrecognised call is exactly the
    // caller-supplied descriptor the provenance rules forbid.
    expect(buildCompilerReceipt(siteOf({ opNames: [] }), 'source', CONTEXT)).toBeUndefined()
    expect(buildCompilerReceipt(siteOf({ opNames: undefined }), 'source', CONTEXT)).toBeUndefined()
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

  it('keeps a path outside the root absolute rather than escaping upward', () => {
    expect(toPortablePath('/elsewhere/x.ts', '/repo')).toBe('/elsewhere/x.ts')
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
})
