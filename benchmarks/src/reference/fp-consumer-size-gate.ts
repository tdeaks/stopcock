import { createHash } from 'node:crypto'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import {
  FP_CONSUMER_ARTIFACT_ORIGIN_KIND,
  FP_CONSUMER_ARTIFACT_ORIGIN_SCHEMA_VERSION,
  FP_CONSUMER_BUNDLERS,
  FP_CONSUMER_COMPRESSION,
  FP_CONSUMER_FIXTURE_BUDGETS,
  FP_CONSUMER_FIXTURE_MANIFEST_ID,
  FP_CONSUMER_FIXTURE_MANIFEST_PROJECTION,
  FP_CONSUMER_FIXTURE_MANIFEST_SHA256,
  FP_CONSUMER_FROZEN_ARTIFACT_ORIGIN_SHA256_BY_BUNDLER,
  FP_CONSUMER_MINIFIER,
  FP_CONSUMER_REQUIRED_DISTINCT_FIXTURE_IDS,
  FP_CONSUMER_SIZE_SCHEMA_VERSION,
  computeFpConsumerFixtureManifestSha256,
  type FpConsumerBundlerId,
  type FpConsumerSizeProfile,
} from './fp-consumer-size-contract'
import type { FpConsumerFixtureId } from '../bundle-size/fixtures'
import type { JsonValue } from '../bundle-size/types'

const SHA256 = /^sha256:[0-9a-f]{64}$/u

const sha256 = (value: string | Uint8Array): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

const canonicalJson = (value: unknown): string => JSON.stringify(value)

export interface FpConsumerSizeIdentity {
  readonly environment: {
    readonly platform: NodeJS.Platform
    readonly architecture: string
    readonly runtime: {
      readonly name: 'bun' | 'node'
      readonly version: string
    }
    readonly zlibVersion: string
  }
  readonly source: {
    readonly commit: string
    readonly sha256: string
  }
  readonly distribution: {
    readonly sha256: string
  }
  readonly package: {
    readonly name: '@stopcock/fp'
    readonly version: string
    readonly tarballSha256: string
  }
  readonly consumer: {
    readonly manifestSha256: string
  }
  readonly compiler: {
    readonly sourceSha256: string
    readonly metadataSha256: string
    readonly emitted: readonly {
      readonly fixtureId: FpConsumerFixtureId
      readonly sha256: string
    }[]
  }
}

export interface FpConsumerSizeArtifact {
  readonly id: string
  readonly bundler: FpConsumerBundlerId
  readonly buildId: string
  readonly file: string
  readonly isEntry: boolean
  readonly entryFixtureId: FpConsumerFixtureId | null
  readonly imports: readonly string[]
  readonly rawCode: string
  readonly minifiedCode: string
  readonly rawSha256: string
  readonly minifiedSha256: string
  readonly rawBytes: number
  readonly minifiedBytes: number
  readonly gzipBytes: number
  readonly brotliBytes: number
  readonly modules: readonly {
    readonly id: string
    readonly rawBytesInOutput: number
  }[]
}

export interface FpConsumerSizeMeasuredRow {
  readonly fixtureId: FpConsumerFixtureId
  readonly bundler: FpConsumerBundlerId
  readonly status: 'measured'
  readonly fixtureSourceSha256: string
  readonly compiledSourceSha256: string | null
  readonly behavior: {
    readonly executed: true
    readonly passed: boolean
    readonly expectedSha256: string
    readonly actualSha256: string
    readonly actual: JsonValue
  }
  readonly closure: {
    readonly entryArtifactId: string
    readonly artifactIds: readonly string[]
    readonly sha256: string
  }
  readonly measurements: {
    readonly rawBytes: number
    readonly minifiedBytes: number
    readonly gzipBytes: number
    readonly brotliBytes: number
  }
}

export interface FpConsumerSizeNotApplicableRow {
  readonly fixtureId: FpConsumerFixtureId
  readonly bundler: FpConsumerBundlerId
  readonly status: 'not-applicable'
  readonly reason: 'expected-export-absent'
  readonly expectedSpecifier: string
  readonly observedExportAbsent: true
}

export type FpConsumerSizeRow = FpConsumerSizeMeasuredRow | FpConsumerSizeNotApplicableRow

export interface FpConsumerArtifactOrigin {
  readonly schemaVersion: typeof FP_CONSUMER_ARTIFACT_ORIGIN_SCHEMA_VERSION
  readonly kind: typeof FP_CONSUMER_ARTIFACT_ORIGIN_KIND
  readonly bundlers: readonly {
    readonly bundler: FpConsumerBundlerId
    readonly sha256: string
  }[]
}

export interface FpConsumerArtifactOriginInput {
  readonly schemaVersion: typeof FP_CONSUMER_SIZE_SCHEMA_VERSION
  readonly fixtureManifest: {
    readonly id: string
    readonly sha256: string
  }
  readonly identity: FpConsumerSizeIdentity
  readonly tools: {
    readonly bundlers: readonly unknown[]
    readonly minifier: unknown
    readonly compression: unknown
  }
  readonly artifacts: readonly FpConsumerSizeArtifact[]
}

export interface FpConsumerSizeReport extends FpConsumerArtifactOriginInput {
  readonly generatedAt: string
  readonly artifactOrigin: FpConsumerArtifactOrigin
  readonly rows: readonly FpConsumerSizeRow[]
}

export interface FpConsumerSizeEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
}

export interface EvaluateFpConsumerSizeOptions {
  readonly profile: FpConsumerSizeProfile
  readonly expectedIdentity: FpConsumerSizeIdentity
  readonly fixtureIds?: readonly FpConsumerFixtureId[]
  readonly bundlerIds?: readonly FpConsumerBundlerId[]
}

const recordFailure = (failures: string[], condition: boolean, message: string): void => {
  if (!condition) failures.push(message)
}

const positiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0

const sameJson = (left: unknown, right: unknown): boolean =>
  canonicalJson(left) === canonicalJson(right)

const requiredBundlers = (profile: FpConsumerSizeProfile): readonly FpConsumerBundlerId[] =>
  profile === 'pr' ? (['esbuild', 'rolldown'] as const) : FP_CONSUMER_BUNDLERS.map(({ id }) => id)

const manifestFixtureById = new Map(
  FP_CONSUMER_FIXTURE_MANIFEST_PROJECTION.fixtures.map((fixture) => [fixture.id, fixture]),
)

const budgetByFixtureId = new Map(
  FP_CONSUMER_FIXTURE_BUDGETS.map((budget) => [budget.fixtureId, budget]),
)

const rowKey = (fixtureId: string, bundler: string): string => `${fixtureId}\0${bundler}`

const portableIdentity = (identity: FpConsumerSizeIdentity): unknown =>
  Object.freeze({
    source: identity.source,
    distribution: identity.distribution,
    package: identity.package,
    consumer: identity.consumer,
    compiler: identity.compiler,
  })

const artifactOriginProjection = (
  input: FpConsumerArtifactOriginInput,
  bundler: FpConsumerBundlerId,
): unknown =>
  Object.freeze({
    schemaVersion: FP_CONSUMER_ARTIFACT_ORIGIN_SCHEMA_VERSION,
    kind: FP_CONSUMER_ARTIFACT_ORIGIN_KIND,
    fixtureManifest: input.fixtureManifest,
    identity: portableIdentity(input.identity),
    tools: input.tools,
    artifacts: input.artifacts
      .filter((artifact) => artifact.bundler === bundler)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((artifact) =>
        Object.freeze({
          id: artifact.id,
          bundler: artifact.bundler,
          buildId: artifact.buildId,
          file: artifact.file,
          isEntry: artifact.isEntry,
          entryFixtureId: artifact.entryFixtureId,
          imports: [...artifact.imports].sort(),
          rawSha256: artifact.rawSha256,
          minifiedSha256: artifact.minifiedSha256,
          modules: [...artifact.modules]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((module) => Object.freeze(module)),
        }),
      ),
  })

export const computeFpConsumerArtifactOrigin = (
  input: FpConsumerArtifactOriginInput,
  bundlers: readonly FpConsumerBundlerId[],
): FpConsumerArtifactOrigin =>
  Object.freeze({
    schemaVersion: FP_CONSUMER_ARTIFACT_ORIGIN_SCHEMA_VERSION,
    kind: FP_CONSUMER_ARTIFACT_ORIGIN_KIND,
    bundlers: Object.freeze(
      [...bundlers].sort().map((bundler) =>
        Object.freeze({
          bundler,
          sha256: sha256(canonicalJson(artifactOriginProjection(input, bundler))),
        }),
      ),
    ),
  })

const closureProjection = (
  entryArtifactId: string,
  artifactIds: readonly string[],
  artifactById: ReadonlyMap<string, FpConsumerSizeArtifact>,
): unknown =>
  Object.freeze({
    entryArtifactId,
    artifacts: [...artifactIds].sort().map((id) => {
      const artifact = artifactById.get(id)
      return artifact === undefined
        ? Object.freeze({ id, missing: true })
        : Object.freeze({
            id,
            minifiedSha256: artifact.minifiedSha256,
            imports: [...artifact.imports].sort(),
          })
    }),
  })

export const computeFpConsumerClosureSha256 = (
  entryArtifactId: string,
  artifactIds: readonly string[],
  artifacts: readonly FpConsumerSizeArtifact[],
): string => {
  const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]))
  return sha256(canonicalJson(closureProjection(entryArtifactId, artifactIds, artifactById)))
}

const traverseClosure = (
  entryArtifactId: string,
  artifactById: ReadonlyMap<string, FpConsumerSizeArtifact>,
): ReadonlySet<string> => {
  const visited = new Set<string>()
  const pending = [entryArtifactId]
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined || visited.has(current)) continue
    visited.add(current)
    const artifact = artifactById.get(current)
    if (artifact !== undefined) pending.push(...artifact.imports)
  }
  return visited
}

const validateArtifact = (artifact: FpConsumerSizeArtifact, failures: string[]): void => {
  const prefix = `artifact ${artifact.id}`
  recordFailure(failures, artifact.id.length > 0, 'artifact has an empty id')
  recordFailure(
    failures,
    artifact.file.endsWith('.js') && !artifact.file.endsWith('.js.map'),
    `${prefix} is not executable JavaScript`,
  )
  recordFailure(
    failures,
    SHA256.test(artifact.rawSha256) && artifact.rawSha256 === sha256(artifact.rawCode),
    `${prefix} raw identity is invalid`,
  )
  recordFailure(
    failures,
    SHA256.test(artifact.minifiedSha256) &&
      artifact.minifiedSha256 === sha256(artifact.minifiedCode),
    `${prefix} minified identity is invalid`,
  )
  const rawBytes = Buffer.byteLength(artifact.rawCode)
  const minifiedBytes = Buffer.byteLength(artifact.minifiedCode)
  const gzipBytes = gzipSync(artifact.minifiedCode, {
    level: FP_CONSUMER_COMPRESSION.gzip.level,
  }).byteLength
  const brotliBytes = brotliCompressSync(artifact.minifiedCode, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: FP_CONSUMER_COMPRESSION.brotli.quality,
    },
  }).byteLength
  recordFailure(
    failures,
    artifact.rawBytes === rawBytes && positiveSafeInteger(artifact.rawBytes),
    `${prefix} raw byte count is invalid`,
  )
  recordFailure(
    failures,
    artifact.minifiedBytes === minifiedBytes && positiveSafeInteger(artifact.minifiedBytes),
    `${prefix} minified byte count is invalid`,
  )
  recordFailure(
    failures,
    artifact.gzipBytes === gzipBytes && positiveSafeInteger(artifact.gzipBytes),
    `${prefix} gzip-9 byte count is invalid`,
  )
  recordFailure(
    failures,
    artifact.brotliBytes === brotliBytes && positiveSafeInteger(artifact.brotliBytes),
    `${prefix} Brotli-11 byte count is invalid`,
  )
  recordFailure(
    failures,
    Array.isArray(artifact.modules) &&
      artifact.modules.length > 0 &&
      artifact.modules.every(
        (module) =>
          typeof module.id === 'string' &&
          module.id.length > 0 &&
          Number.isSafeInteger(module.rawBytesInOutput) &&
          module.rawBytesInOutput >= 0,
      ),
    `${prefix} has no valid module attribution`,
  )
  recordFailure(
    failures,
    new Set(artifact.imports).size === artifact.imports.length,
    `${prefix} has duplicate chunk imports`,
  )
}

const expectedFixtureIds = (
  requested: readonly FpConsumerFixtureId[] | undefined,
): readonly FpConsumerFixtureId[] => {
  if (requested === undefined) {
    return FP_CONSUMER_FIXTURE_MANIFEST_PROJECTION.fixtures.map(
      ({ id }) => id as FpConsumerFixtureId,
    )
  }
  return requested
}

export const evaluateFpConsumerSizeReport = (
  report: FpConsumerSizeReport,
  options: EvaluateFpConsumerSizeOptions,
): FpConsumerSizeEvaluation => {
  const failures: string[] = []
  try {
    recordFailure(
      failures,
      report.schemaVersion === FP_CONSUMER_SIZE_SCHEMA_VERSION,
      `report schema must be ${FP_CONSUMER_SIZE_SCHEMA_VERSION}`,
    )
    recordFailure(
      failures,
      Number.isFinite(Date.parse(report.generatedAt)),
      'report has no valid generatedAt timestamp',
    )
    recordFailure(
      failures,
      computeFpConsumerFixtureManifestSha256() === FP_CONSUMER_FIXTURE_MANIFEST_SHA256,
      'checked-in fixture manifest pin does not match its canonical projection',
    )
    recordFailure(
      failures,
      report.fixtureManifest.id === FP_CONSUMER_FIXTURE_MANIFEST_ID &&
        report.fixtureManifest.sha256 === FP_CONSUMER_FIXTURE_MANIFEST_SHA256,
      'report fixture manifest identity is wrong',
    )
    recordFailure(
      failures,
      sameJson(report.identity, options.expectedIdentity),
      'report source/dist/packed/consumer/compiler identity envelope is wrong',
    )
    for (const [label, value] of [
      ['source', report.identity.source.sha256],
      ['distribution', report.identity.distribution.sha256],
      ['packed tarball', report.identity.package.tarballSha256],
      ['consumer manifest', report.identity.consumer.manifestSha256],
      ['compiler source', report.identity.compiler.sourceSha256],
      ['compiler metadata', report.identity.compiler.metadataSha256],
    ] as const) {
      recordFailure(failures, SHA256.test(value), `${label} identity is not sha256`)
    }
    recordFailure(
      failures,
      report.identity.source.commit.length > 0,
      'source commit identity is empty',
    )
    recordFailure(
      failures,
      report.identity.package.name === '@stopcock/fp' && report.identity.package.version.length > 0,
      'packed package identity is not a versioned @stopcock/fp',
    )
    recordFailure(
      failures,
      sameJson(report.tools.bundlers, FP_CONSUMER_BUNDLERS) &&
        sameJson(report.tools.minifier, FP_CONSUMER_MINIFIER) &&
        sameJson(report.tools.compression, FP_CONSUMER_COMPRESSION),
      'bundler, minifier, or compression identity is wrong',
    )

    const fixtureIds = expectedFixtureIds(options.fixtureIds)
    recordFailure(
      failures,
      new Set(fixtureIds).size === fixtureIds.length &&
        fixtureIds.every((id) => manifestFixtureById.has(id)),
      'requested fixture selection contains duplicates or unknown ids',
    )
    if (options.fixtureIds === undefined) {
      recordFailure(
        failures,
        FP_CONSUMER_REQUIRED_DISTINCT_FIXTURE_IDS.every((id) => fixtureIds.includes(id)),
        'required non-substitutable compiler/helper fixtures are missing',
      )
    }

    const bundlers = options.bundlerIds ?? requiredBundlers(options.profile)
    recordFailure(
      failures,
      bundlers.length > 0 &&
        new Set(bundlers).size === bundlers.length &&
        bundlers.every((id) => FP_CONSUMER_BUNDLERS.some((bundler) => bundler.id === id)),
      'requested bundler selection contains duplicates or unknown ids',
    )
    if (options.profile !== 'characterization') {
      recordFailure(
        failures,
        sameJson([...bundlers].sort(), [...requiredBundlers(options.profile)].sort()),
        `${options.profile} profile must use its complete canonical bundler set`,
      )
      recordFailure(
        failures,
        sameJson(
          [...fixtureIds].sort(),
          FP_CONSUMER_FIXTURE_MANIFEST_PROJECTION.fixtures.map(({ id }) => id).sort(),
        ),
        `${options.profile} profile must use the complete canonical fixture set`,
      )
    }
    const computedArtifactOrigin = computeFpConsumerArtifactOrigin(report, bundlers)
    recordFailure(
      failures,
      sameJson(report.artifactOrigin, computedArtifactOrigin),
      'report artifact-origin receipt is internally inconsistent',
    )
    if (options.profile !== 'characterization') {
      for (const receipt of computedArtifactOrigin.bundlers) {
        recordFailure(
          failures,
          receipt.sha256 === FP_CONSUMER_FROZEN_ARTIFACT_ORIGIN_SHA256_BY_BUNDLER[receipt.bundler],
          `artifact origin is not frozen for ${receipt.bundler}`,
        )
      }
    }
    const expectedKeys = new Set(
      fixtureIds.flatMap((fixtureId) => bundlers.map((bundler) => rowKey(fixtureId, bundler))),
    )
    const rowsByKey = new Map<string, FpConsumerSizeRow>()
    for (const row of report.rows) {
      const key = rowKey(row.fixtureId, row.bundler)
      recordFailure(failures, expectedKeys.has(key), `unexpected row ${key}`)
      recordFailure(failures, !rowsByKey.has(key), `duplicate row ${key}`)
      if (!rowsByKey.has(key)) rowsByKey.set(key, row)
    }
    for (const key of expectedKeys) {
      recordFailure(failures, rowsByKey.has(key), `missing row ${key}`)
    }

    const artifactById = new Map<string, FpConsumerSizeArtifact>()
    for (const artifact of report.artifacts) {
      recordFailure(failures, !artifactById.has(artifact.id), `duplicate artifact ${artifact.id}`)
      if (!artifactById.has(artifact.id)) artifactById.set(artifact.id, artifact)
      validateArtifact(artifact, failures)
    }
    for (const artifact of report.artifacts) {
      for (const importedId of artifact.imports) {
        recordFailure(
          failures,
          artifactById.has(importedId),
          `artifact ${artifact.id} imports missing chunk ${importedId}`,
        )
      }
    }

    const referencedArtifacts = new Set<string>()
    const compilerEmitted = new Map(
      report.identity.compiler.emitted.map((entry) => [entry.fixtureId, entry.sha256]),
    )
    recordFailure(
      failures,
      compilerEmitted.size === report.identity.compiler.emitted.length,
      'compiler emitted-source identities contain duplicate fixture ids',
    )

    for (const [key, row] of rowsByKey) {
      if (!expectedKeys.has(key)) continue
      const fixture = manifestFixtureById.get(row.fixtureId)
      if (fixture === undefined) continue
      recordFailure(
        failures,
        bundlers.includes(row.bundler),
        `row ${key} uses a bundler outside profile ${options.profile}`,
      )
      if (fixture.applicability.status === 'not-applicable') {
        recordFailure(
          failures,
          row.status === 'not-applicable',
          `future fixture ${key} must be explicitly not-applicable`,
        )
        if (row.status === 'not-applicable') {
          recordFailure(
            failures,
            row.reason === 'expected-export-absent' &&
              row.expectedSpecifier === fixture.applicability.expectedSpecifier &&
              row.observedExportAbsent === true,
            `future fixture ${key} has invalid export-absence evidence`,
          )
        }
        continue
      }

      recordFailure(failures, row.status === 'measured', `active fixture ${key} must be measured`)
      if (row.status !== 'measured') continue
      recordFailure(
        failures,
        row.fixtureSourceSha256 === fixture.sourceSha256,
        `fixture source identity is wrong for ${key}`,
      )
      if (fixture.sourceKind === 'compiler-transformed') {
        recordFailure(
          failures,
          row.compiledSourceSha256 !== null &&
            SHA256.test(row.compiledSourceSha256) &&
            compilerEmitted.get(row.fixtureId) === row.compiledSourceSha256,
          `compiler-emitted source identity is wrong for ${key}`,
        )
      } else {
        recordFailure(
          failures,
          row.compiledSourceSha256 === null,
          `non-compiler fixture ${key} claims a compiler-emitted identity`,
        )
      }
      recordFailure(
        failures,
        row.behavior.executed === true &&
          row.behavior.passed === true &&
          row.behavior.expectedSha256 === fixture.oracleSha256 &&
          row.behavior.actualSha256 === sha256(canonicalJson(row.behavior.actual)) &&
          row.behavior.actualSha256 === row.behavior.expectedSha256,
        `final minified artifact behavior failed for ${key}`,
      )

      const entry = artifactById.get(row.closure.entryArtifactId)
      recordFailure(
        failures,
        entry !== undefined &&
          entry.isEntry &&
          entry.entryFixtureId === row.fixtureId &&
          entry.bundler === row.bundler,
        `closure entry identity is wrong for ${key}`,
      )
      const traversed = traverseClosure(row.closure.entryArtifactId, artifactById)
      const declared = new Set(row.closure.artifactIds)
      recordFailure(
        failures,
        declared.size === row.closure.artifactIds.length &&
          declared.size === traversed.size &&
          [...declared].every((id) => traversed.has(id)),
        `transitive chunk closure is wrong for ${key}`,
      )
      recordFailure(
        failures,
        row.closure.sha256 ===
          computeFpConsumerClosureSha256(
            row.closure.entryArtifactId,
            row.closure.artifactIds,
            report.artifacts,
          ),
        `transitive chunk closure identity is wrong for ${key}`,
      )
      const closureArtifacts = row.closure.artifactIds
        .map((id) => artifactById.get(id))
        .filter((artifact): artifact is FpConsumerSizeArtifact => artifact !== undefined)
      for (const artifact of closureArtifacts) referencedArtifacts.add(artifact.id)
      for (const [label, field] of [
        ['raw', 'rawBytes'],
        ['minified', 'minifiedBytes'],
        ['gzip-9', 'gzipBytes'],
        ['Brotli-11', 'brotliBytes'],
      ] as const) {
        const total = closureArtifacts.reduce((sum, artifact) => sum + artifact[field], 0)
        recordFailure(
          failures,
          row.measurements[field] === total && positiveSafeInteger(total),
          `${label} closure measurement is invalid for ${key}`,
        )
      }

      const budget = budgetByFixtureId.get(row.fixtureId)
      recordFailure(failures, budget !== undefined, `fixture ${row.fixtureId} has no budget row`)
      if (
        options.profile !== 'characterization' &&
        budget?.baselineMaximumGzipBytesByBundler === null
      ) {
        recordFailure(failures, false, `fixture ${row.fixtureId} has no frozen S1A baseline budget`)
      } else if (
        options.profile !== 'characterization' &&
        budget?.baselineMaximumGzipBytesByBundler !== null &&
        budget !== undefined
      ) {
        const maximum = budget.baselineMaximumGzipBytesByBundler[row.bundler]
        recordFailure(
          failures,
          row.measurements.gzipBytes <= maximum,
          `${key} gzip is ${row.measurements.gzipBytes}; baseline budget is ${maximum}`,
        )
      }
      if (
        options.profile === 'final' &&
        budget?.finalMaximumGzipBytesByBundler !== null &&
        budget !== undefined
      ) {
        const maximum = budget.finalMaximumGzipBytesByBundler[row.bundler]
        recordFailure(
          failures,
          row.measurements.gzipBytes <= maximum,
          `${key} gzip is ${row.measurements.gzipBytes}; final budget is ${maximum}`,
        )
      }
      if (
        options.profile === 'final' &&
        budget?.finalIncrementalMaximumGzipBytesByBundler !== null &&
        budget !== undefined
      ) {
        const parentFixtureId = row.fixtureId === 'fusion.debug' ? 'fusion.compact' : undefined
        const parent =
          parentFixtureId === undefined
            ? undefined
            : rowsByKey.get(rowKey(parentFixtureId, row.bundler))
        const maximum = budget.finalIncrementalMaximumGzipBytesByBundler[row.bundler]
        recordFailure(
          failures,
          parent?.status === 'measured' &&
            row.measurements.gzipBytes - parent.measurements.gzipBytes <= maximum,
          `${key} has no valid parent closure for its ${maximum}-byte incremental budget`,
        )
      }
    }

    for (const artifact of report.artifacts) {
      recordFailure(
        failures,
        referencedArtifacts.has(artifact.id),
        `unreferenced emitted artifact ${artifact.id}`,
      )
    }
    const measuredCompilerFixtures = new Set(
      [...rowsByKey.values()]
        .filter(
          (row): row is FpConsumerSizeMeasuredRow =>
            row.status === 'measured' &&
            manifestFixtureById.get(row.fixtureId)?.sourceKind === 'compiler-transformed',
        )
        .map((row) => row.fixtureId),
    )
    recordFailure(
      failures,
      compilerEmitted.size === measuredCompilerFixtures.size &&
        [...compilerEmitted.keys()].every((id) => measuredCompilerFixtures.has(id)),
      'compiler emitted-source identity set does not match measured compiler fixtures',
    )
  } catch (error) {
    failures.push(`malformed consumer-size report: ${(error as Error).message}`)
  }

  return {
    passed: failures.length === 0,
    failures: Object.freeze(failures),
  }
}
