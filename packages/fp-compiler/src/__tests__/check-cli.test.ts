import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runCheck } from '../cli'
import type { CheckReportV1, EvidenceClassV1, RenderedSiteV1 } from '../receipt-report'

const fixture = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/check/${name}`, import.meta.url))

const TRANSFORMED = fixture('receipts/transformed.json')
const FALLBACK = fixture('receipts/fallback.json')
const EVIDENCE = fixture('evidence')
const FRESH = fixture('expectations/fresh.json')

const parse = (stdout: string): CheckReportV1 => JSON.parse(stdout) as CheckReportV1

const site = (report: CheckReportV1, sourcePath: string): RenderedSiteV1 => {
  const found = report.sites.find((entry) => entry.sourcePath === sourcePath)
  if (!found) throw new Error(`no rendered site for ${sourcePath}`)
  return found
}

const statusOf = (rendered: RenderedSiteV1, id: EvidenceClassV1): string =>
  rendered.classes.find((entry) => entry.class === id)?.status ?? 'missing'

const statements = (rendered: RenderedSiteV1, id: EvidenceClassV1): string =>
  (rendered.classes.find((entry) => entry.class === id)?.statements ?? []).join('\n')

describe('stopcock check arguments', () => {
  it('requires the check subcommand', async () => {
    await expect(runCheck([])).resolves.toMatchObject({ exitCode: 2 })
    const unknown = await runCheck(['report'])
    expect(unknown.exitCode).toBe(2)
    expect(unknown.stderr).toContain('unknown subcommand')
    expect(unknown.stdout).toBe('')
  })

  it('rejects unknown options, missing values, and missing policies', async () => {
    for (const argv of [
      ['check', '--receipts', TRANSFORMED, '--policy', 'unsupported', '--wat'],
      ['check', '--receipts', '--policy', 'unsupported'],
      ['check', '--receipts', TRANSFORMED],
      ['check', '--receipts', TRANSFORMED, '--policy', 'made-up'],
      ['check', '--receipts', TRANSFORMED, '--policy', 'coverage-threshold'],
      ['check', '--policy', 'unsupported'],
    ]) {
      const result = await runCheck(argv)
      expect(result.exitCode, argv.join(' ')).toBe(2)
      expect(result.stdout).toBe('')
    }
  })

  it('prints usage for --help', async () => {
    const result = await runCheck(['--help'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('stopcock check')
  })
})

describe('stopcock check artifacts', () => {
  const invalid = async (name: string): Promise<string> => {
    const result = await runCheck([
      'check',
      '--receipts',
      fixture(`invalid/${name}`),
      '--policy',
      'unsupported',
    ])
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe('')
    return result.stderr
  }

  it('rejects a receipt with no site id', async () => {
    expect(await invalid('missing-site-id.json')).toContain('receiptId')
  })

  it('rejects duplicate site ids', async () => {
    const stderr = await invalid('duplicate-site-id.json')
    expect(stderr).toMatch(/duplicate stopcock\.compiler-receipt id/u)
  })

  it('rejects an unknown schema version', async () => {
    expect(await invalid('bad-schema-version.json')).toContain('unknown receipt schema version')
  })

  it('rejects unknown fields', async () => {
    expect(await invalid('unknown-field.json')).toContain('unknown or missing fields')
  })

  it('rejects malformed packed artifact context', async () => {
    expect(await invalid('artifact-context.json')).toContain('artifactContext')
  })

  it('rejects an empty receipt set and unreadable paths', async () => {
    const missing = await runCheck([
      'check',
      '--receipts',
      fixture('receipts/nope.json'),
      '--policy',
      'unsupported',
    ])
    expect(missing.exitCode).toBe(2)
    expect(missing.stderr).toContain('cannot read')
  })
})

describe('stopcock check output', () => {
  const passing = [
    'check',
    '--receipts',
    TRANSFORMED,
    '--evidence',
    EVIDENCE,
    '--expectations',
    FRESH,
    '--policy',
    'unsupported',
    '--policy',
    'stale-evidence',
    '--policy-file',
    fixture('policies/require-corpus.json'),
    '--json',
  ]

  it('exits 0 when every requested policy passes', async () => {
    const result = await runCheck(passing)
    expect(result.exitCode).toBe(0)
    expect(parse(result.stdout).status).toBe('passed')
  })

  it('sends human prose to stderr when deterministic JSON is requested', async () => {
    const result = await runCheck(passing)
    expect(result.stdout.startsWith('{')).toBe(true)
    expect(result.stderr).toContain('stopcock check')
    expect(result.stderr).toContain('declared capability')

    const prose = await runCheck(passing.filter((arg) => arg !== '--json'))
    expect(prose.stdout).toContain('declared capability')
    expect(prose.stderr).toBe('')
  })

  it('produces byte-identical JSON for identical inputs regardless of input order', async () => {
    const first = await runCheck(passing)
    const second = await runCheck(passing)
    const reordered = await runCheck([
      'check',
      '--policy',
      'stale-evidence',
      '--json',
      '--evidence',
      fixture('evidence/release.json'),
      '--evidence',
      fixture('evidence/corpus.json'),
      '--evidence',
      fixture('evidence/profile.json'),
      '--evidence',
      fixture('evidence/plan.json'),
      '--policy',
      'unsupported',
      '--receipts',
      TRANSFORMED,
      '--expectations',
      FRESH,
      '--policy-file',
      fixture('policies/require-corpus.json'),
    ])
    expect(second.stdout).toBe(first.stdout)
    expect(reordered.stdout).toBe(first.stdout)
    expect(first.stdout.endsWith('}\n')).toBe(true)
  })
})

describe('stopcock check rendering', () => {
  const render = async (extra: readonly string[] = []): Promise<CheckReportV1> => {
    const result = await runCheck([
      'check',
      '--receipts',
      TRANSFORMED,
      '--receipts',
      FALLBACK,
      '--evidence',
      EVIDENCE,
      '--policy',
      'stale-evidence',
      '--json',
      ...extra,
    ])
    return parse(result.stdout)
  }

  it('separates every evidence class for every site', async () => {
    const report = await render()
    for (const rendered of report.sites) {
      expect(rendered.classes.map((entry) => entry.class)).toEqual([
        'declared-capability',
        'static-decision',
        'corpus-evidence',
        'runtime-observation',
        'qualified-benchmark',
        'release-evidence',
      ])
    }
  })

  it('never renders an actual fallback as transformed', async () => {
    const rendered = site(await render(), 'src/opaque.ts')
    expect(rendered.disposition).toBe('fallback')
    expect(statements(rendered, 'static-decision')).toContain('was NOT transformed')
    expect(statements(rendered, 'static-decision')).not.toMatch(/selected lowering/u)
    expect(statements(rendered, 'static-decision')).not.toMatch(/allocation claim limited/u)
  })

  it('renders a statically selected lowering as selected, never as executed', async () => {
    const rendered = site(await render(), 'src/report.ts')
    expect(statusOf(rendered, 'static-decision')).toBe('statically-selected')
    expect(statements(rendered, 'static-decision')).toContain('selection is not execution')
  })

  it('makes an unobserved site say so instead of claiming an early exit', async () => {
    const report = await render()
    const rendered = site(report, 'src/opaque.ts')
    expect(statusOf(rendered, 'runtime-observation')).toBe('unavailable')
    expect(statements(rendered, 'runtime-observation')).toContain(
      'nothing was executed or observed',
    )
    expect(statements(rendered, 'runtime-observation')).not.toMatch(/consuming \d/u)
  })

  it('only claims execution and allocations with a joined runtime profile', async () => {
    const rendered = site(await render(), 'src/report.ts')
    expect(statusOf(rendered, 'runtime-observation')).toBe('runtime-observed')
    expect(statements(rendered, 'runtime-observation')).toMatch(/executed runner/u)
    expect(statements(rendered, 'runtime-observation')).toContain(
      'compiler-emitted-result count=512',
    )
  })

  it('states the limits of a corpus pass', async () => {
    const rendered = site(await render(), 'src/report.ts')
    expect(statusOf(rendered, 'corpus-evidence')).toBe('corpus-verified')
    expect(statements(rendered, 'corpus-evidence')).toContain(
      'not proof that an arbitrary user callback is equivalent',
    )
  })

  it('treats absent evidence as unavailable, never as a pass', async () => {
    const rendered = site(await render(), 'src/opaque.ts')
    expect(statusOf(rendered, 'corpus-evidence')).toBe('unavailable')
    expect(statements(rendered, 'corpus-evidence')).toContain('absence is not a pass')
    expect(statusOf(rendered, 'qualified-benchmark')).toBe('unavailable')
  })
})

describe('stopcock check stale hash classes', () => {
  const staleClasses = async (
    name: string,
  ): Promise<{ report: CheckReportV1; rendered: RenderedSiteV1 }> => {
    const result = await runCheck([
      'check',
      '--receipts',
      TRANSFORMED,
      '--evidence',
      EVIDENCE,
      '--expectations',
      fixture(`expectations/${name}.json`),
      '--policy',
      'stale-evidence',
      '--json',
    ])
    expect(result.exitCode).toBe(1)
    const report = parse(result.stdout)
    return { report, rendered: site(report, 'src/report.ts') }
  }

  const invalidated = (rendered: RenderedSiteV1): EvidenceClassV1[] =>
    rendered.classes.filter((entry) => entry.status === 'stale').map((entry) => entry.class)

  it('keeps fresh hashes out of the stale set', async () => {
    const result = await runCheck([
      'check',
      '--receipts',
      TRANSFORMED,
      '--evidence',
      EVIDENCE,
      '--expectations',
      FRESH,
      '--policy',
      'stale-evidence',
      '--json',
    ])
    expect(result.exitCode).toBe(0)
    expect(site(parse(result.stdout), 'src/report.ts').staleHashClasses).toEqual([])
  })

  it('invalidates every class on a stale source hash', async () => {
    const { rendered } = await staleClasses('stale-source')
    expect(rendered.staleHashClasses).toEqual(['source'])
    expect(invalidated(rendered)).toEqual([
      'declared-capability',
      'static-decision',
      'corpus-evidence',
      'runtime-observation',
      'qualified-benchmark',
      'release-evidence',
    ])
  })

  it('invalidates decision and downstream evidence on a stale config hash', async () => {
    const { rendered } = await staleClasses('stale-config')
    expect(rendered.staleHashClasses).toEqual(['config'])
    expect(invalidated(rendered)).not.toContain('declared-capability')
    expect(invalidated(rendered)).toContain('static-decision')
    expect(invalidated(rendered)).toContain('corpus-evidence')
  })

  it('invalidates corpus evidence on a stale semantic-manifest hash', async () => {
    const { rendered } = await staleClasses('stale-semantic-manifest')
    expect(rendered.staleHashClasses).toEqual(['semantic-manifest'])
    expect(invalidated(rendered)).toEqual(['corpus-evidence'])
  })

  it('invalidates output-derived evidence on a stale emitted-code hash', async () => {
    const { rendered } = await staleClasses('stale-output')
    expect(rendered.staleHashClasses).toEqual(['output'])
    expect(invalidated(rendered)).toEqual([
      'runtime-observation',
      'qualified-benchmark',
      'release-evidence',
    ])
  })

  it('invalidates compiler-scoped evidence on a stale package hash', async () => {
    const { rendered } = await staleClasses('stale-package')
    expect(rendered.staleHashClasses).toEqual(['package'])
    expect(invalidated(rendered)).toEqual([
      'static-decision',
      'corpus-evidence',
      'runtime-observation',
      'qualified-benchmark',
      'release-evidence',
    ])
  })

  it('invalidates runtime observation, and its allocation claim, on a stale runtime hash', async () => {
    const { rendered } = await staleClasses('stale-runtime')
    expect(rendered.staleHashClasses).toEqual(['runtime'])
    expect(invalidated(rendered)).toEqual(['runtime-observation'])
    expect(statements(rendered, 'runtime-observation')).not.toContain(
      'compiler-emitted-result count=',
    )
    expect(statements(rendered, 'runtime-observation')).toContain(
      'every claim in this class is withdrawn',
    )
  })
})

describe('stopcock check policies', () => {
  const run = async (
    argv: readonly string[],
  ): Promise<{ exitCode: number; report: CheckReportV1 }> => {
    const result = await runCheck(['check', '--json', ...argv])
    return { exitCode: result.exitCode, report: parse(result.stdout) }
  }

  it('fails the unsupported policy on any untransformed site', async () => {
    const { exitCode, report } = await run([
      '--receipts',
      TRANSFORMED,
      '--receipts',
      FALLBACK,
      '--policy',
      'unsupported',
    ])
    expect(exitCode).toBe(1)
    expect(report.policies).toEqual([
      {
        policyId: 'unsupported',
        status: 'failed',
        findings: [expect.stringContaining('is fallback')],
      },
    ])
  })

  it('fails the stale-evidence policy when no expectations were supplied', async () => {
    const { exitCode, report } = await run([
      '--receipts',
      TRANSFORMED,
      '--policy',
      'stale-evidence',
    ])
    expect(exitCode).toBe(1)
    expect(report.policies[0]?.findings.join('\n')).toContain('missing evidence is not a pass')
  })

  it('fails the stale-evidence policy on unsupplied evidence references', async () => {
    const { exitCode, report } = await run([
      '--receipts',
      TRANSFORMED,
      '--expectations',
      FRESH,
      '--policy',
      'stale-evidence',
    ])
    expect(exitCode).toBe(1)
    expect(report.policies[0]?.findings.join('\n')).toContain('that was not supplied')
  })

  it('applies the coverage threshold as an exact ratio', async () => {
    const failed = await run([
      '--receipts',
      TRANSFORMED,
      '--receipts',
      FALLBACK,
      '--policy',
      'coverage-threshold',
      '--coverage',
      '1/1',
    ])
    expect(failed.exitCode).toBe(1)
    expect(failed.report.policies[0]?.findings.join('')).toContain('coverage 1/2')

    const passed = await run([
      '--receipts',
      TRANSFORMED,
      '--receipts',
      FALLBACK,
      '--policy',
      'coverage-threshold',
      '--coverage',
      '1/2',
    ])
    expect(passed.exitCode).toBe(0)
  })

  it('applies a supplied project policy', async () => {
    const { exitCode, report } = await run([
      '--receipts',
      TRANSFORMED,
      '--receipts',
      FALLBACK,
      '--evidence',
      EVIDENCE,
      '--policy-file',
      fixture('policies/require-corpus.json'),
    ])
    expect(exitCode).toBe(1)
    const findings = report.policies[0]?.findings.join('\n') ?? ''
    expect(report.policies[0]?.policyId).toBe('project/require-corpus')
    expect(findings).toContain('forbidden reason opaque-callback')
    expect(findings).toContain('corpus-evidence status unavailable')
  })

  it('rejects a malformed project policy as an invalid artifact', async () => {
    const result = await runCheck([
      'check',
      '--receipts',
      TRANSFORMED,
      '--policy-file',
      fixture('receipts/transformed.json'),
    ])
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('unknown policy kind')
  })
})
