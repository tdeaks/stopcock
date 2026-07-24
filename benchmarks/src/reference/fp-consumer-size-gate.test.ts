import { createHash } from 'node:crypto'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  FP_CONSUMER_ARTIFACT_ORIGIN_KIND,
  FP_CONSUMER_ARTIFACT_ORIGIN_SCHEMA_VERSION,
  FP_CONSUMER_BUNDLERS,
  FP_CONSUMER_COMPRESSION,
  FP_CONSUMER_FIXTURE_MANIFEST_ID,
  FP_CONSUMER_FIXTURE_MANIFEST_PROJECTION,
  FP_CONSUMER_FIXTURE_MANIFEST_SHA256,
  FP_CONSUMER_MINIFIER,
  FP_CONSUMER_SIZE_SCHEMA_VERSION,
  computeFpConsumerFixtureManifestSha256,
} from './fp-consumer-size-contract'
import {
  computeFpConsumerArtifactOrigin,
  computeFpConsumerClosureSha256,
  evaluateFpConsumerSizeReport,
  type FpConsumerSizeArtifact,
  type FpConsumerSizeIdentity,
  type FpConsumerSizeMeasuredRow,
  type FpConsumerSizeReport,
  type FpConsumerSizeRow,
} from './fp-consumer-size-gate'
import { FP_CONSUMER_FIXTURES } from '../bundle-size/fixtures'

const sha256 = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

const HASH = `sha256:${'a'.repeat(64)}`

const expectedIdentity = (): FpConsumerSizeIdentity => ({
  environment: {
    platform: 'darwin',
    architecture: 'arm64',
    runtime: { name: 'bun', version: '1.3.14' },
    zlibVersion: '1.3.1',
  },
  source: { commit: 'fixture-commit', sha256: HASH },
  distribution: { sha256: `sha256:${'b'.repeat(64)}` },
  package: {
    name: '@stopcock/fp',
    version: '2.0.0-next.0',
    tarballSha256: `sha256:${'c'.repeat(64)}`,
  },
  consumer: { manifestSha256: `sha256:${'d'.repeat(64)}` },
  compiler: {
    sourceSha256: `sha256:${'e'.repeat(64)}`,
    metadataSha256: `sha256:${'f'.repeat(64)}`,
    emitted: FP_CONSUMER_FIXTURES.filter(
      ({ sourceKind, applicability }) =>
        sourceKind === 'compiler-transformed' && applicability.status === 'active',
    ).map(({ id }) => ({ fixtureId: id, sha256: sha256(`compiled:${id}`) })),
  },
})

const makeArtifact = (
  fixtureId: (typeof FP_CONSUMER_FIXTURES)[number]['id'],
  bundler: (typeof FP_CONSUMER_BUNDLERS)[number]['id'],
): FpConsumerSizeArtifact => {
  const id = `${bundler}:${fixtureId}:entry.js`
  const rawCode = `export const result = ${JSON.stringify(fixtureId)}\n`
  const minifiedCode = `export const result=${JSON.stringify(fixtureId)};`
  return {
    id,
    bundler,
    buildId: fixtureId,
    file: 'entry.js',
    isEntry: true,
    entryFixtureId: fixtureId,
    imports: [],
    rawCode,
    minifiedCode,
    rawSha256: sha256(rawCode),
    minifiedSha256: sha256(minifiedCode),
    rawBytes: Buffer.byteLength(rawCode),
    minifiedBytes: Buffer.byteLength(minifiedCode),
    gzipBytes: gzipSync(minifiedCode, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(minifiedCode, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
    modules: [{ id: `fixtures/${fixtureId}.js`, rawBytesInOutput: rawCode.length }],
  }
}

const makeReport = (): FpConsumerSizeReport => {
  const artifacts: FpConsumerSizeArtifact[] = []
  const rows: FpConsumerSizeRow[] = []
  for (const fixture of FP_CONSUMER_FIXTURES) {
    const projection = FP_CONSUMER_FIXTURE_MANIFEST_PROJECTION.fixtures.find(
      ({ id }) => id === fixture.id,
    )
    if (projection === undefined) throw new Error(`missing projection for ${fixture.id}`)
    for (const { id: bundler } of FP_CONSUMER_BUNDLERS) {
      if (fixture.applicability.status === 'not-applicable') {
        rows.push({
          fixtureId: fixture.id,
          bundler,
          status: 'not-applicable',
          reason: 'expected-export-absent',
          expectedSpecifier: fixture.applicability.expectedSpecifier,
          observedExportAbsent: true,
        })
        continue
      }
      const artifact = makeArtifact(fixture.id, bundler)
      artifacts.push(artifact)
      const row: FpConsumerSizeMeasuredRow = {
        fixtureId: fixture.id,
        bundler,
        status: 'measured',
        fixtureSourceSha256: projection.sourceSha256 as string,
        compiledSourceSha256:
          fixture.sourceKind === 'compiler-transformed' ? sha256(`compiled:${fixture.id}`) : null,
        behavior: {
          executed: true,
          passed: true,
          expectedSha256: projection.oracleSha256 as string,
          actualSha256: projection.oracleSha256 as string,
          actual: fixture.expected,
        },
        closure: {
          entryArtifactId: artifact.id,
          artifactIds: [artifact.id],
          sha256: computeFpConsumerClosureSha256(artifact.id, [artifact.id], [artifact]),
        },
        measurements: {
          rawBytes: artifact.rawBytes,
          minifiedBytes: artifact.minifiedBytes,
          gzipBytes: artifact.gzipBytes,
          brotliBytes: artifact.brotliBytes,
        },
      }
      rows.push(row)
    }
  }
  const reportInput = {
    schemaVersion: FP_CONSUMER_SIZE_SCHEMA_VERSION,
    fixtureManifest: {
      id: FP_CONSUMER_FIXTURE_MANIFEST_ID,
      sha256: FP_CONSUMER_FIXTURE_MANIFEST_SHA256,
    },
    identity: expectedIdentity(),
    tools: {
      bundlers: FP_CONSUMER_BUNDLERS,
      minifier: FP_CONSUMER_MINIFIER,
      compression: FP_CONSUMER_COMPRESSION,
    },
    artifacts,
  } as const
  return {
    ...reportInput,
    generatedAt: '2026-07-24T12:00:00.000Z',
    artifactOrigin: computeFpConsumerArtifactOrigin(
      reportInput,
      FP_CONSUMER_BUNDLERS.map(({ id }) => id),
    ),
    rows,
  }
}

const evaluate = (report: FpConsumerSizeReport) =>
  evaluateFpConsumerSizeReport(report, {
    profile: 'characterization',
    expectedIdentity: expectedIdentity(),
  })

describe('@stopcock/fp behavior-valid consumer-size evidence gate', () => {
  it('pins the complete executable fixture projection', () => {
    expect(computeFpConsumerFixtureManifestSha256()).toBe(FP_CONSUMER_FIXTURE_MANIFEST_SHA256)
  })

  it('accepts the exact characterization matrix', () => {
    expect(evaluate(makeReport())).toEqual({ passed: true, failures: [] })
  })

  it('rejects missing, duplicate, and unexpected rows', () => {
    const missing = structuredClone(makeReport())
    missing.rows = missing.rows.slice(1)
    expect(evaluate(missing).failures).toContain(
      `missing row ${FP_CONSUMER_FIXTURES[0].id}\0${FP_CONSUMER_BUNDLERS[0].id}`,
    )

    const duplicate = structuredClone(makeReport())
    duplicate.rows = [...duplicate.rows, duplicate.rows[0]]
    expect(
      evaluate(duplicate).failures.some((failure) => failure.startsWith('duplicate row')),
    ).toBe(true)

    const unexpected = structuredClone(makeReport())
    unexpected.rows[0].fixtureId = 'unknown.fixture'
    expect(
      evaluate(unexpected).failures.some((failure) => failure.startsWith('unexpected row')),
    ).toBe(true)
  })

  it('rejects changed tool and artifact identities', () => {
    const tools = structuredClone(makeReport())
    ;(tools.tools.bundlers[0] as { version: string }).version = '0.0.0'
    expect(evaluate(tools).failures).toContain(
      'bundler, minifier, or compression identity is wrong',
    )

    const identity = structuredClone(makeReport())
    identity.identity.distribution.sha256 = `sha256:${'0'.repeat(64)}`
    expect(evaluate(identity).failures).toContain(
      'report source/dist/packed/consumer/compiler identity envelope is wrong',
    )
  })

  it('recomputes compression and rejects behavior failure', () => {
    const compression = structuredClone(makeReport())
    compression.artifacts[0].gzipBytes += 1
    expect(
      evaluate(compression).failures.some((failure) =>
        failure.includes('gzip-9 byte count is invalid'),
      ),
    ).toBe(true)

    const behavior = structuredClone(makeReport())
    const measured = behavior.rows.find(
      (row): row is FpConsumerSizeMeasuredRow => row.status === 'measured',
    )
    if (measured === undefined) throw new Error('missing measured row')
    measured.behavior.passed = false
    expect(
      evaluate(behavior).failures.some((failure) =>
        failure.includes('final minified artifact behavior failed'),
      ),
    ).toBe(true)
  })

  it('rejects an incorrect transitive closure', () => {
    const report = structuredClone(makeReport())
    const measured = report.rows.find(
      (row): row is FpConsumerSizeMeasuredRow => row.status === 'measured',
    )
    if (measured === undefined) throw new Error('missing measured row')
    measured.closure.artifactIds = []
    expect(
      evaluate(report).failures.some((failure) =>
        failure.includes('transitive chunk closure is wrong'),
      ),
    ).toBe(true)
  })

  it('rejects invalid future export-absence evidence', () => {
    const report = structuredClone(makeReport())
    const future = report.rows.find((row) => row.status === 'not-applicable')
    if (future === undefined) throw new Error('missing future row')
    future.expectedSpecifier = '@stopcock/fp/not-the-contract'
    expect(
      evaluate(report).failures.some((failure) =>
        failure.includes('invalid export-absence evidence'),
      ),
    ).toBe(true)
  })

  it('requires the frozen origin receipt and still rejects an independent row over budget', () => {
    const report = makeReport()
    const release = evaluateFpConsumerSizeReport(report, {
      profile: 'release',
      expectedIdentity: expectedIdentity(),
    })
    expect(release.passed).toBe(false)
    expect(
      release.failures.filter((failure) => failure.startsWith('artifact origin is not frozen')),
    ).toHaveLength(FP_CONSUMER_BUNDLERS.length)
    const measured = report.rows.find(
      (row): row is FpConsumerSizeMeasuredRow =>
        row.status === 'measured' && row.fixtureId === 'root.pipe',
    )
    if (measured === undefined) throw new Error('missing root pipe row')
    measured.measurements.gzipBytes = 100_000
    const evaluation = evaluateFpConsumerSizeReport(report, {
      profile: 'release',
      expectedIdentity: expectedIdentity(),
    })
    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.some((failure) => failure.includes('baseline budget is'))).toBe(true)
  })

  it('rejects internally consistent substituted artifact bytes outside characterization', () => {
    const report = structuredClone(makeReport())
    const row = report.rows.find(
      (candidate): candidate is FpConsumerSizeMeasuredRow =>
        candidate.status === 'measured' &&
        candidate.fixtureId === 'compiler.collect.common' &&
        candidate.bundler === 'esbuild',
    )
    if (row === undefined) throw new Error('missing compiler collect row')
    const artifact = report.artifacts.find(({ id }) => id === row.closure.entryArtifactId)
    if (artifact === undefined) throw new Error('missing compiler collect artifact')
    artifact.rawCode = 'export const result = [6, 12]\n'
    artifact.minifiedCode = 'export const result=[6,12];'
    artifact.rawSha256 = sha256(artifact.rawCode)
    artifact.minifiedSha256 = sha256(artifact.minifiedCode)
    artifact.rawBytes = Buffer.byteLength(artifact.rawCode)
    artifact.minifiedBytes = Buffer.byteLength(artifact.minifiedCode)
    artifact.gzipBytes = gzipSync(artifact.minifiedCode, { level: 9 }).byteLength
    artifact.brotliBytes = brotliCompressSync(artifact.minifiedCode, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength
    artifact.modules = [
      { id: 'fixtures/substituted-compiler-output.js', rawBytesInOutput: artifact.rawBytes },
    ]
    row.closure.sha256 = computeFpConsumerClosureSha256(
      row.closure.entryArtifactId,
      row.closure.artifactIds,
      report.artifacts,
    )
    row.measurements = {
      rawBytes: artifact.rawBytes,
      minifiedBytes: artifact.minifiedBytes,
      gzipBytes: artifact.gzipBytes,
      brotliBytes: artifact.brotliBytes,
    }
    report.artifactOrigin = computeFpConsumerArtifactOrigin(
      report,
      FP_CONSUMER_BUNDLERS.map(({ id }) => id),
    )

    expect(evaluate(report)).toEqual({ passed: true, failures: [] })
    const release = evaluateFpConsumerSizeReport(report, {
      profile: 'release',
      expectedIdentity: expectedIdentity(),
    })
    expect(release.passed).toBe(false)
    expect(release.failures).toContain('artifact origin is not frozen for esbuild')
  })

  it('pins the artifact-origin receipt schema', () => {
    const report = makeReport()
    expect(report.artifactOrigin.schemaVersion).toBe(FP_CONSUMER_ARTIFACT_ORIGIN_SCHEMA_VERSION)
    expect(report.artifactOrigin.kind).toBe(FP_CONSUMER_ARTIFACT_ORIGIN_KIND)
  })

  it('rejects substituted compiler evidence', () => {
    const report = structuredClone(makeReport())
    const compiler = report.rows.find(
      (row): row is FpConsumerSizeMeasuredRow =>
        row.status === 'measured' && row.fixtureId === 'compiler.collect.common',
    )
    if (compiler === undefined) throw new Error('missing compiler row')
    compiler.compiledSourceSha256 = sha256('substituted-output')
    expect(
      evaluate(report).failures.some((failure) =>
        failure.includes('compiler-emitted source identity is wrong'),
      ),
    ).toBe(true)
  })
})
