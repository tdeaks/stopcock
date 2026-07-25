import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vite-plus/test'
import {
  FP_CONSUMER_BUNDLERS,
  FP_CONSUMER_COMPRESSION,
  FP_CONSUMER_FIXTURE_MANIFEST_SHA256,
  FP_CONSUMER_MINIFIER,
} from './fp-consumer-size-contract'
import {
  FP_CONSUMER_SIZE_S3A_FIXTURES,
  FP_CONSUMER_SIZE_S3A_FIXTURE_MANIFEST_SHA256,
  FP_CONSUMER_SIZE_S3A_KIND,
  FP_CONSUMER_SIZE_S3A_ORIGINS,
  FP_CONSUMER_SIZE_S3A_SCHEMA_VERSION,
  evaluateFpConsumerSizeS3aReport,
  finalizeFpConsumerSizeS3aReport,
  fpConsumerSizeS3aFixture,
  type FpConsumerSizeS3aReportInput,
} from './fp-consumer-size-s3a-contract'

const hash = (character: string): string => `sha256:${character.repeat(64)}`
const sha256 = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

function validInput(): FpConsumerSizeS3aReportInput {
  return {
    schemaVersion: FP_CONSUMER_SIZE_S3A_SCHEMA_VERSION,
    kind: FP_CONSUMER_SIZE_S3A_KIND,
    generatedAt: '2026-07-24T00:00:00.000Z',
    sourceCommit: 'f'.repeat(40),
    frozenConsumerFixtureManifestSha256: FP_CONSUMER_FIXTURE_MANIFEST_SHA256,
    s3aFixtureManifestSha256: FP_CONSUMER_SIZE_S3A_FIXTURE_MANIFEST_SHA256,
    tools: {
      bundlers: FP_CONSUMER_BUNDLERS,
      minifier: FP_CONSUMER_MINIFIER,
      compression: FP_CONSUMER_COMPRESSION,
    },
    identity: {
      local: {
        packageProjectionSha256: hash('1'),
        distTreeSha256: hash('2'),
      },
      packed: {
        tarballSha256: hash('3'),
        packageProjectionSha256: hash('1'),
        distTreeSha256: hash('2'),
      },
    },
    rows: FP_CONSUMER_SIZE_S3A_ORIGINS.flatMap((origin) =>
      FP_CONSUMER_SIZE_S3A_FIXTURES.flatMap((fixtureId) =>
        FP_CONSUMER_BUNDLERS.map(({ id: bundler }) => {
          const fixture = fpConsumerSizeS3aFixture(fixtureId)
          const gzipBytes = fixtureId === 'array.map.direct' ? 400 : 800
          const closureHash = fixtureId === 'array.map.direct' ? hash('4') : hash('5')
          return {
            origin,
            fixtureId,
            bundler,
            fixtureSourceSha256: sha256(fixture.source),
            behavior: {
              passed: true,
              expectedSha256: sha256(JSON.stringify(fixture.expected)),
              actualSha256: sha256(JSON.stringify(fixture.expected)),
              actual: fixture.expected,
            },
            closure: {
              sha256: closureHash,
              minifiedSha256: closureHash,
              artifactCount: 1,
            },
            measurements: {
              rawBytes: gzipBytes * 4,
              minifiedBytes: gzipBytes * 2,
              gzipBytes,
              brotliBytes: gzipBytes - 50,
            },
          }
        }),
      ),
    ),
  }
}

function mutated(
  mutate: (input: FpConsumerSizeS3aReportInput) => void,
): ReturnType<typeof finalizeFpConsumerSizeS3aReport> {
  const input = structuredClone(validInput())
  mutate(input)
  return finalizeFpConsumerSizeS3aReport(input)
}

describe('S3A fresh consumer-size contract', () => {
  it('accepts the exact two-origin, two-fixture, four-bundler matrix', () => {
    expect(() =>
      evaluateFpConsumerSizeS3aReport(finalizeFpConsumerSizeS3aReport(validInput())),
    ).not.toThrow()
  })

  it('rejects direct-map and Option-flow ceiling breaches independently', () => {
    expect(() =>
      evaluateFpConsumerSizeS3aReport(
        mutated((input) => {
          const row = input.rows.find(
            ({ origin, fixtureId }) => origin === 'local-dist' && fixtureId === 'array.map.direct',
          )!
          ;(row.measurements as { gzipBytes: number }).gzipBytes = 513
        }),
      ),
    ).toThrow(/maximum is 512/u)

    expect(() =>
      evaluateFpConsumerSizeS3aReport(
        mutated((input) => {
          const row = input.rows.find(
            ({ origin, fixtureId }) =>
              origin === 'packed' && fixtureId === 'option.specialist-flow',
          )!
          ;(row.measurements as { gzipBytes: number }).gzipBytes = 923
        }),
      ),
    ).toThrow(/maximum is 922/u)
  })

  it('rejects per-row packed/local drift without cross-row compensation', () => {
    expect(() =>
      evaluateFpConsumerSizeS3aReport(
        mutated((input) => {
          const row = input.rows.find(
            ({ origin, fixtureId, bundler }) =>
              origin === 'packed' && fixtureId === 'array.map.direct' && bundler === 'esbuild',
          )!
          ;(row.measurements as { gzipBytes: number }).gzipBytes = 409
        }),
      ),
    ).toThrow(/exceeds 2%/u)
  })

  it('rejects missing, duplicate, behavior-invalid, and substituted evidence', () => {
    expect(() =>
      evaluateFpConsumerSizeS3aReport(
        mutated((input) => {
          ;(input.rows as unknown[]).pop()
        }),
      ),
    ).toThrow(/row matrix is incomplete/u)

    expect(() =>
      evaluateFpConsumerSizeS3aReport(
        mutated((input) => {
          ;(input.rows as unknown[]).push(structuredClone(input.rows[0]))
        }),
      ),
    ).toThrow(/row matrix is incomplete/u)

    expect(() =>
      evaluateFpConsumerSizeS3aReport(
        mutated((input) => {
          const row = input.rows[0]
          ;(row.behavior as { passed: boolean }).passed = false
        }),
      ),
    ).toThrow(/failed its executable behavior oracle/u)

    expect(() =>
      evaluateFpConsumerSizeS3aReport(
        mutated((input) => {
          ;(input.identity.packed as { distTreeSha256: string }).distTreeSha256 = hash('8')
        }),
      ),
    ).toThrow(/does not match the local package projection and dist tree/u)

    expect(() =>
      evaluateFpConsumerSizeS3aReport(
        mutated((input) => {
          ;(input.rows[0] as { fixtureSourceSha256: string }).fixtureSourceSha256 = hash('8')
        }),
      ),
    ).toThrow(/substituted its fixture source or behavior oracle/u)

    expect(() =>
      evaluateFpConsumerSizeS3aReport(
        mutated((input) => {
          ;(input as { s3aFixtureManifestSha256: string }).s3aFixtureManifestSha256 = hash('8')
        }),
      ),
    ).toThrow(/fixture manifest does not match its literal pin/u)
  })

  it('rejects a packed closure with different minified bytes and report hash drift', () => {
    expect(() =>
      evaluateFpConsumerSizeS3aReport(
        mutated((input) => {
          const row = input.rows.find(
            ({ origin, fixtureId, bundler }) =>
              origin === 'packed' && fixtureId === 'option.specialist-flow' && bundler === 'rollup',
          )!
          ;(row.closure as { minifiedSha256: string }).minifiedSha256 = hash('9')
        }),
      ),
    ).toThrow(/minified closures are not byte-identical/u)

    const report = finalizeFpConsumerSizeS3aReport(validInput())
    const drifted = {
      ...report,
      evidenceSha256: hash('a'),
    }
    expect(() => evaluateFpConsumerSizeS3aReport(drifted)).toThrow(/evidence hash drift/u)
  })

  it('retains raw closure hashes as validated diagnostics outside stable evidence', () => {
    const baseline = finalizeFpConsumerSizeS3aReport(validInput())
    const diagnosticDrift = structuredClone(validInput())
    ;(diagnosticDrift.rows[0].closure as { sha256: string }).sha256 = hash('9')
    const drifted = finalizeFpConsumerSizeS3aReport(diagnosticDrift)

    expect(drifted.evidenceSha256).toBe(baseline.evidenceSha256)
    expect(() => evaluateFpConsumerSizeS3aReport(drifted)).not.toThrow()

    expect(() =>
      evaluateFpConsumerSizeS3aReport(
        mutated((input) => {
          ;(input.rows[0].closure as { sha256: string }).sha256 = 'not-a-sha256'
        }),
      ),
    ).toThrow(/contains a malformed hash/u)
  })
})
