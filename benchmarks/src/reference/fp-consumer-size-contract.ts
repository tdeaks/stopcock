import { createHash } from 'node:crypto'
import { FP_CONSUMER_FIXTURES, type FpConsumerFixtureId } from '../bundle-size/fixtures'
import type { ConsumerBundlerId } from '../bundle-size/types'

export const FP_CONSUMER_SIZE_SCHEMA_VERSION = 1 as const
export const FP_CONSUMER_FIXTURE_MANIFEST_ID = 'stopcock-fp-consumer-size-fixtures-v1'
export const FP_CONSUMER_ARTIFACT_ORIGIN_SCHEMA_VERSION = 1 as const
export const FP_CONSUMER_ARTIFACT_ORIGIN_KIND = 'stopcock-fp-consumer-artifact-origin-v1'

export const FP_CONSUMER_BUNDLERS = Object.freeze([
  Object.freeze({
    id: 'esbuild',
    version: '0.28.1',
    options: Object.freeze({
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      treeShaking: true,
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[name]-[hash].js',
    }),
  }),
  Object.freeze({
    id: 'rollup',
    version: '4.62.2',
    options: Object.freeze({
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      moduleSideEffects: false,
      propertyReadSideEffects: false,
      tryCatchDeoptimization: false,
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[name].js',
    }),
  }),
  Object.freeze({
    id: 'rolldown',
    version: '1.0.1',
    options: Object.freeze({
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      moduleSideEffects: false,
      cwd: 'deterministic-consumer-root',
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[name].js',
    }),
  }),
  Object.freeze({
    id: 'webpack',
    version: '5.108.4',
    options: Object.freeze({
      mode: 'production',
      target: 'web-es2022',
      outputModule: true,
      libraryType: 'module',
      minimize: false,
      sideEffects: true,
      usedExports: true,
      moduleIds: 'deterministic',
      chunkIds: 'deterministic',
      sharedChunkName: false,
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[id].js',
      moduleAttribution: 'consumer-root-relative',
    }),
  }),
] as const)

export type FpConsumerBundlerId = (typeof FP_CONSUMER_BUNDLERS)[number]['id']

/**
 * Promoted only from reviewed characterization evidence. Characterization
 * recomputes candidate receipts; every gating profile must match these pins.
 */
export const FP_CONSUMER_FROZEN_ARTIFACT_ORIGIN_SHA256_BY_BUNDLER = Object.freeze({
  esbuild: 'sha256:8e861fa95f114a72edc87d25d0e355c00aa49010d46ed112021070e2fcc23270',
  rollup: 'sha256:d520fd65207ce95639dfc562d08c8a02d837cfa60b155f50caa236d0dbdffd1e',
  rolldown: 'sha256:353a3fdf511b60690c3bec0cb4b443816ab2eadb6867689f0f567d0d5850b86d',
  webpack: 'sha256:0d14dc5c72b8364c106ff8aac50db68878d0f8d7bac98f94a0cf4b74b955e556',
} as const satisfies Readonly<Record<FpConsumerBundlerId, string>>)

export const FP_CONSUMER_MINIFIER = Object.freeze({
  id: 'terser',
  version: '5.49.0',
  options: Object.freeze({
    ecma: 2022,
    module: true,
    toplevel: true,
    mangle: Object.freeze({ toplevel: true }),
    compress: Object.freeze({ passes: 3 }),
    format: Object.freeze({ comments: false }),
  }),
})

export const FP_CONSUMER_COMPRESSION = Object.freeze({
  gzip: Object.freeze({
    id: 'node-zlib-gzip',
    level: 9,
  }),
  brotli: Object.freeze({
    id: 'node-zlib-brotli',
    quality: 11,
  }),
})

type PerBundlerBudget = Readonly<Record<ConsumerBundlerId, number>>

const allBundlers = (maximumBytes: number): PerBundlerBudget =>
  Object.freeze({
    esbuild: maximumBytes,
    rollup: maximumBytes,
    rolldown: maximumBytes,
    webpack: maximumBytes,
  })

export interface FpConsumerFixtureBudget {
  readonly fixtureId: FpConsumerFixtureId
  readonly baselineMaximumGzipBytesByBundler: PerBundlerBudget | null
  readonly finalMaximumGzipBytesByBundler: PerBundlerBudget | null
  readonly finalIncrementalMaximumGzipBytesByBundler: PerBundlerBudget | null
}

/**
 * S1A populates every active baseline ceiling from the reproduced aligned
 * cohort at `ceil(gzip * 1.03)`. Final 2.0 targets are deliberately separate:
 * the current topology must pass its frozen baseline before reduction work.
 */
const pendingBudget = (
  fixtureId: FpConsumerFixtureId,
  finalMaximumGzipBytesByBundler: PerBundlerBudget | null = null,
  finalIncrementalMaximumGzipBytesByBundler: PerBundlerBudget | null = null,
): FpConsumerFixtureBudget =>
  Object.freeze({
    fixtureId,
    baselineMaximumGzipBytesByBundler: null,
    finalMaximumGzipBytesByBundler,
    finalIncrementalMaximumGzipBytesByBundler,
  })

const frozenBudget = (
  fixtureId: FpConsumerFixtureId,
  baselineMaximumGzipBytesByBundler: PerBundlerBudget,
  finalMaximumGzipBytesByBundler: PerBundlerBudget | null = null,
  finalIncrementalMaximumGzipBytesByBundler: PerBundlerBudget | null = null,
): FpConsumerFixtureBudget =>
  Object.freeze({
    fixtureId,
    baselineMaximumGzipBytesByBundler: Object.freeze(baselineMaximumGzipBytesByBundler),
    finalMaximumGzipBytesByBundler,
    finalIncrementalMaximumGzipBytesByBundler,
  })

export const FP_CONSUMER_FIXTURE_BUDGETS = Object.freeze([
  frozenBudget(
    'root.pipe',
    { esbuild: 12_173, rollup: 11_326, rolldown: 12_165, webpack: 12_852 },
    allBundlers(512),
  ),
  frozenBudget(
    'root.flow',
    { esbuild: 10_751, rollup: 9_924, rolldown: 10_744, webpack: 11_438 },
    allBundlers(512),
  ),
  frozenBudget(
    'array.map.direct',
    { esbuild: 2_083, rollup: 229, rolldown: 2_075, webpack: 2_081 },
    allBundlers(512),
  ),
  frozenBudget(
    'array.map.data-last',
    { esbuild: 2_086, rollup: 229, rolldown: 2_074, webpack: 2_081 },
    allBundlers(512),
  ),
  frozenBudget('pipeline.collect.common', {
    esbuild: 13_329,
    rollup: 11_542,
    rolldown: 13_321,
    webpack: 13_993,
  }),
  frozenBudget('pipeline.reduce.common', {
    esbuild: 13_376,
    rollup: 11_595,
    rolldown: 13_369,
    webpack: 14_036,
  }),
  frozenBudget('pipeline.deep', {
    esbuild: 13_371,
    rollup: 11_578,
    rolldown: 13_362,
    webpack: 14_033,
  }),
  frozenBudget('option.flow', {
    esbuild: 12_190,
    rollup: 12_171,
    rolldown: 12_184,
    webpack: 12_867,
  }),
  frozenBudget('result.flow', {
    esbuild: 12_589,
    rollup: 12_575,
    rolldown: 12_585,
    webpack: 13_273,
  }),
  frozenBudget('helpers.object-pick', {
    esbuild: 2_499,
    rollup: 2_495,
    rolldown: 2_495,
    webpack: 2_498,
  }),
  frozenBudget('helpers.string-trim', {
    esbuild: 1_338,
    rollup: 1_337,
    rolldown: 1_337,
    webpack: 1_341,
  }),
  frozenBudget(
    'helpers.two-unrelated',
    { esbuild: 2_308, rollup: 2_298, rolldown: 2_298, webpack: 2_307 },
    allBundlers(512),
  ),
  frozenBudget('root.named', {
    esbuild: 12_190,
    rollup: 11_352,
    rolldown: 12_182,
    webpack: 12_868,
  }),
  frozenBudget('root.namespace.static', {
    esbuild: 12_190,
    rollup: 11_352,
    rolldown: 12_182,
    webpack: 12_868,
  }),
  frozenBudget('root.namespace.enumerated', {
    esbuild: 13_657,
    rollup: 13_589,
    rolldown: 13_696,
    webpack: 13_821,
  }),
  frozenBudget('compat.compile', {
    esbuild: 11_873,
    rollup: 10_117,
    rolldown: 11_867,
    webpack: 12_558,
  }),
  frozenBudget(
    'compiler.collect.common',
    { esbuild: 170, rollup: 174, rolldown: 174, webpack: 359 },
    allBundlers(1024),
  ),
  frozenBudget(
    'compiler.reduce.common',
    { esbuild: 137, rollup: 140, rolldown: 140, webpack: 323 },
    allBundlers(1024),
  ),
  frozenBudget(
    'compiler.deep',
    { esbuild: 190, rollup: 191, rolldown: 191, webpack: 379 },
    allBundlers(1024),
  ),
  frozenBudget(
    'compiler.option-terminal',
    { esbuild: 1_190, rollup: 183, rolldown: 1_186, webpack: 1_192 },
    allBundlers(1024),
  ),
  frozenBudget('multi.fused-a', {
    esbuild: 12_309,
    rollup: 10_458,
    rolldown: 12_294,
    webpack: 13_595,
  }),
  frozenBudget('multi.fused-b', {
    esbuild: 12_319,
    rollup: 10_464,
    rolldown: 12_300,
    webpack: 13_635,
  }),
  frozenBudget('multi.direct', {
    esbuild: 2_842,
    rollup: 511,
    rolldown: 2_814,
    webpack: 2_992,
  }),
  pendingBudget('fusion.compact', allBundlers(5632)),
  pendingBudget('fusion.optimized', allBundlers(12 * 1024)),
  pendingBudget('fusion.debug', null, allBundlers(3 * 1024)),
] as const satisfies readonly FpConsumerFixtureBudget[])

const sha256 = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

const fixtureProjection = FP_CONSUMER_FIXTURES.map((fixture) =>
  Object.freeze({
    id: fixture.id,
    entryKind: fixture.entryKind,
    sourceKind: fixture.sourceKind,
    applicability: fixture.applicability,
    sourceSha256: fixture.source === null ? null : sha256(fixture.source),
    oracleSha256: fixture.expected === null ? null : sha256(JSON.stringify(fixture.expected)),
  }),
)

export const FP_CONSUMER_FIXTURE_MANIFEST_PROJECTION = Object.freeze({
  schemaVersion: FP_CONSUMER_SIZE_SCHEMA_VERSION,
  id: FP_CONSUMER_FIXTURE_MANIFEST_ID,
  environment: Object.freeze({
    format: 'browser-esm',
    target: 'es2022',
    consumerRoot: 'realpath-canonicalized-tarball-keyed-workspace',
  }),
  bundlers: FP_CONSUMER_BUNDLERS,
  minifier: FP_CONSUMER_MINIFIER,
  compression: FP_CONSUMER_COMPRESSION,
  fixtures: Object.freeze(fixtureProjection),
})

export const computeFpConsumerFixtureManifestSha256 = (): string =>
  sha256(JSON.stringify(FP_CONSUMER_FIXTURE_MANIFEST_PROJECTION))

/**
 * This pin is deliberately literal. A source, oracle, fixture, applicability,
 * or tool-configuration change requires a reviewed update.
 */
export const FP_CONSUMER_FIXTURE_MANIFEST_SHA256 =
  'sha256:4c3000b341055c604f4c8b672657e9e5498ac812a625b8bc03407dfbf490b8e1'

export const FP_CONSUMER_REQUIRED_DISTINCT_FIXTURE_IDS = Object.freeze([
  'compiler.collect.common',
  'compiler.reduce.common',
  'compiler.deep',
  'compiler.option-terminal',
  'helpers.two-unrelated',
] as const satisfies readonly FpConsumerFixtureId[])

export const FP_CONSUMER_SIZE_CONTRACT = Object.freeze({
  schemaVersion: FP_CONSUMER_SIZE_SCHEMA_VERSION,
  fixtureManifest: Object.freeze({
    id: FP_CONSUMER_FIXTURE_MANIFEST_ID,
    sha256: FP_CONSUMER_FIXTURE_MANIFEST_SHA256,
  }),
  bundlers: FP_CONSUMER_BUNDLERS,
  minifier: FP_CONSUMER_MINIFIER,
  compression: FP_CONSUMER_COMPRESSION,
  fixtures: FP_CONSUMER_FIXTURES,
  budgets: FP_CONSUMER_FIXTURE_BUDGETS,
  profiles: Object.freeze({
    characterization: Object.freeze({
      gatesBaselineGzip: false,
      gatesFinalGzip: false,
      purpose: 'Reproduce and pin the aligned pre-implementation consumer baseline.',
    }),
    pr: Object.freeze({
      gatesBaselineGzip: true,
      gatesFinalGzip: false,
      bundlers: Object.freeze(['esbuild', 'rolldown'] as const),
      purpose: 'Bounded packed-consumer sentinels against frozen per-bundler baselines.',
    }),
    release: Object.freeze({
      gatesBaselineGzip: true,
      gatesFinalGzip: false,
      bundlers: Object.freeze(FP_CONSUMER_BUNDLERS.map(({ id }) => id)),
      purpose: 'Complete required consumer matrix with no cross-row compensation.',
    }),
    final: Object.freeze({
      gatesBaselineGzip: true,
      gatesFinalGzip: true,
      bundlers: Object.freeze(FP_CONSUMER_BUNDLERS.map(({ id }) => id)),
      purpose: 'Final 2.0 product targets after each owning stage activates its rows.',
    }),
  }),
})

export type FpConsumerSizeProfile = keyof typeof FP_CONSUMER_SIZE_CONTRACT.profiles
