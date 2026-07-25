import { createHash } from 'node:crypto'
import { FP_CONSUMER_FIXTURES } from '../bundle-size/fixtures'
import type { JsonValue } from '../bundle-size/types'
import {
  FP_CONSUMER_BUNDLERS,
  FP_CONSUMER_COMPRESSION,
  FP_CONSUMER_FIXTURE_MANIFEST_SHA256,
  FP_CONSUMER_MINIFIER,
  type FpConsumerBundlerId,
} from './fp-consumer-size-contract'

export const FP_CONSUMER_SIZE_S3A_SCHEMA_VERSION = 1 as const
export const FP_CONSUMER_SIZE_S3A_KIND = 'stopcock-fp-consumer-size-s3a'

const SHA256 = /^sha256:[a-f0-9]{64}$/u

const sha256 = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

function requiredFrozenFixture(
  id: 'array.map.direct',
): Readonly<{ source: string; expected: JsonValue }> {
  const fixture = FP_CONSUMER_FIXTURES.find((candidate) => candidate.id === id)
  if (
    fixture === undefined ||
    fixture.applicability.status !== 'active' ||
    fixture.source === null ||
    fixture.expected === null
  ) {
    throw new Error(`S3A requires active frozen consumer fixture ${id}`)
  }
  return Object.freeze({ source: fixture.source, expected: fixture.expected })
}

const directMapFixture = requiredFrozenFixture('array.map.direct')

export const FP_CONSUMER_SIZE_S3A_FIXTURE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'array.map.direct',
    source: directMapFixture.source,
    expected: directMapFixture.expected,
  }),
  Object.freeze({
    id: 'option.specialist-flow',
    source: `import { getOrElse, map, some } from '@stopcock/fp/option'
export const result = getOrElse(map(some(5), (value) => value * 3), () => -1)
`,
    expected: 15,
  }),
] as const)

export const FP_CONSUMER_SIZE_S3A_FIXTURES = Object.freeze(
  FP_CONSUMER_SIZE_S3A_FIXTURE_DEFINITIONS.map(({ id }) => id),
)
export const FP_CONSUMER_SIZE_S3A_ORIGINS = Object.freeze(['local-dist', 'packed'] as const)
export const FP_CONSUMER_SIZE_S3A_MAXIMUM_GZIP_BYTES = Object.freeze({
  'array.map.direct': 512,
  'option.specialist-flow': 922,
} as const)
export const FP_CONSUMER_SIZE_S3A_MAXIMUM_ORIGIN_DELTA = 0.02

export type FpConsumerSizeS3aFixtureId =
  (typeof FP_CONSUMER_SIZE_S3A_FIXTURE_DEFINITIONS)[number]['id']
export type FpConsumerSizeS3aOrigin = (typeof FP_CONSUMER_SIZE_S3A_ORIGINS)[number]

export function fpConsumerSizeS3aFixture(
  id: FpConsumerSizeS3aFixtureId,
): (typeof FP_CONSUMER_SIZE_S3A_FIXTURE_DEFINITIONS)[number] {
  const fixture = FP_CONSUMER_SIZE_S3A_FIXTURE_DEFINITIONS.find((candidate) => candidate.id === id)
  if (fixture === undefined) throw new Error(`unknown S3A fixture ${id}`)
  return fixture
}

export const FP_CONSUMER_SIZE_S3A_FIXTURE_MANIFEST_PROJECTION = Object.freeze({
  schemaVersion: 1,
  id: 'stopcock-fp-consumer-size-s3a-fixtures',
  frozenConsumerFixtureManifestSha256: FP_CONSUMER_FIXTURE_MANIFEST_SHA256,
  fixtures: Object.freeze(
    FP_CONSUMER_SIZE_S3A_FIXTURE_DEFINITIONS.map((fixture) =>
      Object.freeze({
        id: fixture.id,
        sourceSha256: sha256(fixture.source),
        oracleSha256: sha256(JSON.stringify(fixture.expected)),
      }),
    ),
  ),
})

export const computeFpConsumerSizeS3aFixtureManifestSha256 = (): string =>
  sha256(JSON.stringify(FP_CONSUMER_SIZE_S3A_FIXTURE_MANIFEST_PROJECTION))

/**
 * Literal S3A pin. The specialist fixture is intentionally distinct from the
 * frozen S1A `option.flow`, whose root-pipe cost belongs to a later stage.
 */
export const FP_CONSUMER_SIZE_S3A_FIXTURE_MANIFEST_SHA256 =
  'sha256:c29186d691905282902684edb5e2b09d8e387a76b4bf1a66c8b748f220045687'

export interface FpConsumerSizeS3aRow {
  readonly origin: FpConsumerSizeS3aOrigin
  readonly fixtureId: FpConsumerSizeS3aFixtureId
  readonly bundler: FpConsumerBundlerId
  readonly fixtureSourceSha256: string
  readonly behavior: {
    readonly passed: boolean
    readonly expectedSha256: string
    readonly actualSha256: string
    readonly actual: JsonValue
  }
  readonly closure: {
    readonly sha256: string
    readonly minifiedSha256: string
    readonly artifactCount: number
  }
  readonly measurements: {
    readonly rawBytes: number
    readonly minifiedBytes: number
    readonly gzipBytes: number
    readonly brotliBytes: number
  }
}

export interface FpConsumerSizeS3aReportInput {
  readonly schemaVersion: typeof FP_CONSUMER_SIZE_S3A_SCHEMA_VERSION
  readonly kind: typeof FP_CONSUMER_SIZE_S3A_KIND
  readonly generatedAt: string
  readonly sourceCommit: string
  readonly frozenConsumerFixtureManifestSha256: string
  readonly s3aFixtureManifestSha256: string
  readonly tools: {
    readonly bundlers: typeof FP_CONSUMER_BUNDLERS
    readonly minifier: typeof FP_CONSUMER_MINIFIER
    readonly compression: typeof FP_CONSUMER_COMPRESSION
  }
  readonly identity: {
    readonly local: {
      readonly packageProjectionSha256: string
      readonly distTreeSha256: string
    }
    readonly packed: {
      readonly tarballSha256: string
      readonly packageProjectionSha256: string
      readonly distTreeSha256: string
    }
  }
  readonly rows: readonly FpConsumerSizeS3aRow[]
}

export interface FpConsumerSizeS3aReport extends FpConsumerSizeS3aReportInput {
  readonly evidenceSha256: string
}

// Raw bundles can contain bundler-emitted absolute scratch paths. The raw
// closure hash remains in the report as a validated diagnostic, while stable
// evidence is bound to the exact minified executable closure instead.
const stableProjection = (report: FpConsumerSizeS3aReportInput): object => ({
  schemaVersion: report.schemaVersion,
  kind: report.kind,
  sourceCommit: report.sourceCommit,
  frozenConsumerFixtureManifestSha256: report.frozenConsumerFixtureManifestSha256,
  s3aFixtureManifestSha256: report.s3aFixtureManifestSha256,
  tools: report.tools,
  identity: report.identity,
  rows: report.rows.map((row) => ({
    origin: row.origin,
    fixtureId: row.fixtureId,
    bundler: row.bundler,
    fixtureSourceSha256: row.fixtureSourceSha256,
    behavior: row.behavior,
    closure: {
      minifiedSha256: row.closure.minifiedSha256,
      artifactCount: row.closure.artifactCount,
    },
    measurements: row.measurements,
  })),
})

export function finalizeFpConsumerSizeS3aReport(
  input: FpConsumerSizeS3aReportInput,
): FpConsumerSizeS3aReport {
  return Object.freeze({
    ...input,
    evidenceSha256: sha256(JSON.stringify(stableProjection(input))),
  })
}

function fail(message: string): never {
  throw new Error(`S3A consumer-size gate: ${message}`)
}

function rowKey(row: Pick<FpConsumerSizeS3aRow, 'origin' | 'fixtureId' | 'bundler'>): string {
  return `${row.origin}:${row.fixtureId}:${row.bundler}`
}

export function evaluateFpConsumerSizeS3aReport(report: FpConsumerSizeS3aReport): void {
  if (
    report.schemaVersion !== FP_CONSUMER_SIZE_S3A_SCHEMA_VERSION ||
    report.kind !== FP_CONSUMER_SIZE_S3A_KIND
  ) {
    fail('schema or kind is wrong')
  }
  if (report.frozenConsumerFixtureManifestSha256 !== FP_CONSUMER_FIXTURE_MANIFEST_SHA256) {
    fail('frozen fixture manifest does not match the S1A consumer contract')
  }
  if (
    computeFpConsumerSizeS3aFixtureManifestSha256() !==
      FP_CONSUMER_SIZE_S3A_FIXTURE_MANIFEST_SHA256 ||
    report.s3aFixtureManifestSha256 !== FP_CONSUMER_SIZE_S3A_FIXTURE_MANIFEST_SHA256
  ) {
    fail('S3A fixture manifest does not match its literal pin')
  }
  if (
    JSON.stringify(report.tools) !==
    JSON.stringify({
      bundlers: FP_CONSUMER_BUNDLERS,
      minifier: FP_CONSUMER_MINIFIER,
      compression: FP_CONSUMER_COMPRESSION,
    })
  ) {
    fail('tool identity is wrong')
  }
  for (const hash of [
    report.identity.local.packageProjectionSha256,
    report.identity.local.distTreeSha256,
    report.identity.packed.tarballSha256,
    report.identity.packed.packageProjectionSha256,
    report.identity.packed.distTreeSha256,
  ]) {
    if (!SHA256.test(hash)) fail('artifact identity contains a malformed hash')
  }
  if (
    report.identity.local.packageProjectionSha256 !==
      report.identity.packed.packageProjectionSha256 ||
    report.identity.local.distTreeSha256 !== report.identity.packed.distTreeSha256
  ) {
    fail('fresh packed artifact does not match the local package projection and dist tree')
  }

  const expectedKeys = FP_CONSUMER_SIZE_S3A_ORIGINS.flatMap((origin) =>
    FP_CONSUMER_SIZE_S3A_FIXTURES.flatMap((fixtureId) =>
      FP_CONSUMER_BUNDLERS.map(({ id: bundler }) => `${origin}:${fixtureId}:${bundler}`),
    ),
  ).sort()
  const actualKeys = report.rows.map(rowKey).sort()
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    fail('row matrix is incomplete, duplicated, or contains an unknown row')
  }

  const rowsByKey = new Map(report.rows.map((row) => [rowKey(row), row]))
  for (const row of report.rows) {
    const fixture = fpConsumerSizeS3aFixture(row.fixtureId)
    const expectedSourceSha256 = sha256(fixture.source)
    const expectedOracleSha256 = sha256(JSON.stringify(fixture.expected))
    if (
      !SHA256.test(row.fixtureSourceSha256) ||
      !SHA256.test(row.behavior.expectedSha256) ||
      !SHA256.test(row.behavior.actualSha256) ||
      !SHA256.test(row.closure.sha256) ||
      !SHA256.test(row.closure.minifiedSha256)
    ) {
      fail(`row ${rowKey(row)} contains a malformed hash`)
    }
    if (
      row.fixtureSourceSha256 !== expectedSourceSha256 ||
      row.behavior.expectedSha256 !== expectedOracleSha256
    ) {
      fail(`row ${rowKey(row)} substituted its fixture source or behavior oracle`)
    }
    if (row.behavior.actualSha256 !== sha256(JSON.stringify(row.behavior.actual))) {
      fail(`row ${rowKey(row)} actual behavior hash is not reproducible`)
    }
    if (!row.behavior.passed || row.behavior.actualSha256 !== row.behavior.expectedSha256) {
      fail(`row ${rowKey(row)} failed its executable behavior oracle`)
    }
    for (const [measurement, value] of Object.entries(row.measurements)) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        fail(`row ${rowKey(row)} has invalid ${measurement}`)
      }
    }
    if (!Number.isSafeInteger(row.closure.artifactCount) || row.closure.artifactCount <= 0) {
      fail(`row ${rowKey(row)} has no executable artifact closure`)
    }
    const maximum = FP_CONSUMER_SIZE_S3A_MAXIMUM_GZIP_BYTES[row.fixtureId]
    if (row.measurements.gzipBytes > maximum) {
      fail(`row ${rowKey(row)} is ${row.measurements.gzipBytes} gzip bytes; maximum is ${maximum}`)
    }
  }

  for (const fixtureId of FP_CONSUMER_SIZE_S3A_FIXTURES) {
    for (const { id: bundler } of FP_CONSUMER_BUNDLERS) {
      const local = rowsByKey.get(`local-dist:${fixtureId}:${bundler}`)
      const packed = rowsByKey.get(`packed:${fixtureId}:${bundler}`)
      if (!local || !packed) fail(`missing origin comparison for ${fixtureId}:${bundler}`)
      const delta =
        Math.abs(packed.measurements.gzipBytes - local.measurements.gzipBytes) /
        local.measurements.gzipBytes
      if (delta > FP_CONSUMER_SIZE_S3A_MAXIMUM_ORIGIN_DELTA) {
        fail(
          `${fixtureId}:${bundler} packed/local gzip delta ${(delta * 100).toFixed(3)}% exceeds 2%`,
        )
      }
      if (local.closure.minifiedSha256 !== packed.closure.minifiedSha256) {
        fail(`${fixtureId}:${bundler} packed/local minified closures are not byte-identical`)
      }
    }
  }

  const expectedEvidenceSha256 = sha256(JSON.stringify(stableProjection(report)))
  if (report.evidenceSha256 !== expectedEvidenceSha256) {
    fail('evidence hash drift')
  }
}
