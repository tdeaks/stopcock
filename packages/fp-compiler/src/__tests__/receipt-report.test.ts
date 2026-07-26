import { describe, expect, it } from 'vite-plus/test'
import { buildCompilerReceipt, type ReceiptContext } from '../receipt-emit'
import { collectRecordsV1, renderCheckReportV1 } from '../receipt-report'
import { transformStopcockPipelines } from '../transform'

describe('receipt report policies', () => {
  it('rejects a tampered compiler receipt whose core no longer matches its id', () => {
    const source = `import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
export const result = pipe([1, 2], map((x) => x + 1))
`
    const result = transformStopcockPipelines(source, '/repo/src/tampered.ts', {
      diagnostics: 'summary',
    })
    const receipt = buildCompilerReceipt(result.diagnostics[0], source, {
      root: '/repo',
      configHash: `sha256:${'0'.repeat(64)}`,
      emittedCode: result.code,
      sourceMap: JSON.stringify(result.map),
    })
    const tampered = { ...receipt, disposition: 'fallback' as const }

    const collected = collectRecordsV1([{ path: 'receipts.json', value: [tampered] }])
    expect(collected.ok).toBe(false)
    expect(collected.ok ? [] : collected.errors).toEqual([
      expect.stringContaining('receiptId does not match the deterministic compiler receipt core'),
    ])
  })

  it('excludes opaque-callback partial sites from full coverage and rejects them as unsupported', () => {
    const source = `import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
const tail = (xs) => xs
export const full = pipe([1, 2, 3], map((x) => x * 2))
export const partial = pipe([1, 2, 3], map((x) => x + 1), tail)
`
    const result = transformStopcockPipelines(source, '/repo/src/coverage.ts', {
      diagnostics: 'summary',
    })
    const context: ReceiptContext = {
      root: '/repo',
      configHash: `sha256:${'0'.repeat(64)}`,
      emittedCode: result.code,
      sourceMap: JSON.stringify(result.map),
    }
    const receipts = result.diagnostics.map((site) => buildCompilerReceipt(site, source, context)!)

    const report = renderCheckReportV1({
      receipts,
      plans: [],
      profiles: [],
      evidence: [],
      policies: ['coverage-threshold', 'unsupported'],
      coverage: { numerator: 1, denominator: 1 },
    })

    expect(report.policies).toEqual([
      {
        policyId: 'coverage-threshold',
        status: 'failed',
        findings: ['coverage 1/2 is below the required 1/1'],
      },
      {
        policyId: 'unsupported',
        status: 'failed',
        findings: [expect.stringContaining('is partially transformed with an opaque callback')],
      },
    ])
  })

  it('counts a malformed recognized operator as fallback coverage', () => {
    const source = `import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
export const full = pipe([1, 2, 3], map((x) => x * 2))
export const malformed = pipe([1, 2, 3], map())
`
    const result = transformStopcockPipelines(source, '/repo/src/malformed-coverage.ts', {
      diagnostics: 'summary',
    })
    const context: ReceiptContext = {
      root: '/repo',
      configHash: `sha256:${'0'.repeat(64)}`,
      emittedCode: result.code,
      sourceMap: JSON.stringify(result.map),
    }
    const receipts = result.diagnostics.map(
      (site) => buildCompilerReceipt(site, source, context)!,
    )
    expect(receipts).toHaveLength(2)

    const report = renderCheckReportV1({
      receipts,
      plans: [],
      profiles: [],
      evidence: [],
      policies: ['coverage-threshold'],
      coverage: { numerator: 1, denominator: 1 },
    })

    expect(report.policies).toEqual([
      {
        policyId: 'coverage-threshold',
        status: 'failed',
        findings: ['coverage 1/2 is below the required 1/1'],
      },
    ])
  })
})
