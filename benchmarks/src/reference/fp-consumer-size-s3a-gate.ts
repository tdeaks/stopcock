import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { bundleWithEsbuild } from '../bundle-size/bundlers/esbuild'
import { bundleWithRolldown } from '../bundle-size/bundlers/rolldown'
import { bundleWithRollup } from '../bundle-size/bundlers/rollup'
import { bundleWithWebpack } from '../bundle-size/bundlers/webpack'
import { compressConsumerArtifact, sha256 } from '../bundle-size/compress'
import type { ConsumerBundleAdapter, ConsumerEmittedChunk, JsonValue } from '../bundle-size/types'
import {
  FP_CONSUMER_BUNDLERS,
  FP_CONSUMER_COMPRESSION,
  FP_CONSUMER_FIXTURE_MANIFEST_SHA256,
  FP_CONSUMER_MINIFIER,
  computeFpConsumerFixtureManifestSha256,
  type FpConsumerBundlerId,
} from './fp-consumer-size-contract'
import {
  FP_CONSUMER_SIZE_S3A_FIXTURES,
  FP_CONSUMER_SIZE_S3A_FIXTURE_MANIFEST_SHA256,
  FP_CONSUMER_SIZE_S3A_KIND,
  FP_CONSUMER_SIZE_S3A_ORIGINS,
  FP_CONSUMER_SIZE_S3A_SCHEMA_VERSION,
  computeFpConsumerSizeS3aFixtureManifestSha256,
  evaluateFpConsumerSizeS3aReport,
  finalizeFpConsumerSizeS3aReport,
  fpConsumerSizeS3aFixture,
  type FpConsumerSizeS3aFixtureId,
  type FpConsumerSizeS3aOrigin,
  type FpConsumerSizeS3aRow,
} from './fp-consumer-size-s3a-contract'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const fpRoot = join(repositoryRoot, 'packages', 'fp')
const require = createRequire(import.meta.url)

const adapters: Readonly<Record<FpConsumerBundlerId, ConsumerBundleAdapter>> = {
  esbuild: bundleWithEsbuild,
  rollup: bundleWithRollup,
  rolldown: bundleWithRolldown,
  webpack: bundleWithWebpack,
}

function run(command: string, arguments_: readonly string[], cwd: string): string {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  if (result.status !== 0 || result.signal !== null) {
    throw new Error(
      `${command} ${arguments_.join(' ')} failed: ${result.stderr.trim() || result.stdout.trim()}`,
    )
  }
  return result.stdout
}

function verifyToolVersions(): void {
  for (const tool of [...FP_CONSUMER_BUNDLERS, FP_CONSUMER_MINIFIER]) {
    const manifest = require(`${tool.id}/package.json`) as { readonly version?: string }
    if (manifest.version !== tool.version) {
      throw new Error(
        `${tool.id} resolved to ${String(manifest.version)}; S3A requires ${tool.version}`,
      )
    }
  }
  if (computeFpConsumerFixtureManifestSha256() !== FP_CONSUMER_FIXTURE_MANIFEST_SHA256) {
    throw new Error('frozen consumer fixture manifest drifted before S3A measurement')
  }
  if (
    computeFpConsumerSizeS3aFixtureManifestSha256() !== FP_CONSUMER_SIZE_S3A_FIXTURE_MANIFEST_SHA256
  ) {
    throw new Error('S3A fixture manifest drifted before measurement')
  }
}

async function treeSha256(directory: string): Promise<string> {
  const files: string[] = []
  const visit = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) files.push(path)
      else throw new Error(`S3A artifact tree contains unsupported entry ${path}`)
    }
  }
  await visit(directory)
  files.sort((left, right) => left.localeCompare(right))
  const hash = createHash('sha256')
  for (const file of files) {
    const status = await lstat(file)
    if (!status.isFile()) throw new Error(`S3A artifact tree changed while hashing ${file}`)
    const path = relative(directory, file).split(sep).join('/')
    const bytes = await readFile(file)
    hash.update(path)
    hash.update('\0')
    hash.update(String(bytes.byteLength))
    hash.update('\0')
    hash.update(bytes)
    hash.update('\0')
  }
  return `sha256:${hash.digest('hex')}`
}

async function packageProjectionSha256(packageDirectory: string): Promise<string> {
  const manifest = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8')) as {
    readonly name?: unknown
    readonly version?: unknown
    readonly type?: unknown
    readonly sideEffects?: unknown
    readonly exports?: unknown
  }
  const projection = {
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    sideEffects: manifest.sideEffects,
    exports: manifest.exports,
  }
  if (
    projection.name !== '@stopcock/fp' ||
    typeof projection.version !== 'string' ||
    projection.type !== 'module' ||
    projection.sideEffects !== false ||
    typeof projection.exports !== 'object' ||
    projection.exports === null
  ) {
    throw new Error('S3A package projection is not a versioned side-effect-free ESM FP package')
  }
  return sha256(JSON.stringify(projection))
}

async function prepareConsumer(
  directory: string,
  packageDirectory: string,
): Promise<ReadonlyMap<FpConsumerSizeS3aFixtureId, string>> {
  const installed = join(directory, 'node_modules', '@stopcock', 'fp')
  await mkdir(installed, { recursive: true })
  await cp(join(packageDirectory, 'dist'), join(installed, 'dist'), {
    recursive: true,
    force: false,
  })
  await cp(join(packageDirectory, 'package.json'), join(installed, 'package.json'), {
    force: false,
  })
  await writeFile(
    join(directory, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`,
  )
  const fixtureDirectory = join(directory, 'fixtures')
  await mkdir(fixtureDirectory, { recursive: true })
  const entries = new Map<FpConsumerSizeS3aFixtureId, string>()
  for (const fixtureId of FP_CONSUMER_SIZE_S3A_FIXTURES) {
    const fixture = fpConsumerSizeS3aFixture(fixtureId)
    const path = join(fixtureDirectory, `${fixtureId.replaceAll('.', '-')}.js`)
    await writeFile(path, fixture.source)
    entries.set(fixtureId, path)
  }
  return entries
}

interface MeasuredArtifact {
  readonly chunk: ConsumerEmittedChunk
  readonly rawSha256: string
  readonly minifiedSha256: string
  readonly minifiedCode: string
  readonly rawBytes: number
  readonly minifiedBytes: number
  readonly gzipBytes: number
  readonly brotliBytes: number
}

function artifactClosure(
  entryFile: string,
  artifacts: ReadonlyMap<string, MeasuredArtifact>,
): readonly MeasuredArtifact[] {
  const visited = new Set<string>()
  const pending = [entryFile]
  while (pending.length > 0) {
    const file = pending.pop()
    if (!file || visited.has(file)) continue
    const artifact = artifacts.get(file)
    if (!artifact) throw new Error(`S3A closure references missing artifact ${file}`)
    visited.add(file)
    pending.push(...artifact.chunk.imports)
  }
  return Object.freeze(
    [...visited]
      .sort((left, right) => left.localeCompare(right))
      .map((file) => artifacts.get(file) as MeasuredArtifact),
  )
}

async function measureRow(
  origin: FpConsumerSizeS3aOrigin,
  fixtureId: FpConsumerSizeS3aFixtureId,
  bundler: FpConsumerBundlerId,
  consumerRoot: string,
  entryPath: string,
): Promise<FpConsumerSizeS3aRow> {
  const outputDirectory = join(consumerRoot, 'bundles', bundler, fixtureId)
  const minifiedDirectory = join(outputDirectory, 'minified')
  await mkdir(minifiedDirectory, { recursive: true })
  const output = await adapters[bundler]({
    buildId: fixtureId,
    entries: [{ fixtureId, path: entryPath }],
    consumerRoot,
    outputDirectory,
  })
  const measured = await Promise.all(
    output.chunks.map(async (chunk): Promise<MeasuredArtifact> => {
      const compressed = await compressConsumerArtifact(chunk.code)
      const path = join(minifiedDirectory, chunk.file)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, compressed.minifiedCode)
      return {
        chunk,
        rawSha256: compressed.rawSha256,
        minifiedSha256: compressed.minifiedSha256,
        minifiedCode: compressed.minifiedCode,
        rawBytes: compressed.rawBytes,
        minifiedBytes: compressed.minifiedBytes,
        gzipBytes: compressed.gzipBytes,
        brotliBytes: compressed.brotliBytes,
      }
    }),
  )
  const artifacts = new Map(measured.map((artifact) => [artifact.chunk.file, artifact]))
  const entry = measured.find(({ chunk }) => chunk.isEntry && chunk.entryId === fixtureId)
  if (!entry) throw new Error(`${origin}:${fixtureId}:${bundler} emitted no entry artifact`)
  const imported = (await import(
    `${pathToFileURL(join(minifiedDirectory, entry.chunk.file)).href}?origin=${origin}`
  )) as { readonly result?: unknown }
  if (!Object.hasOwn(imported, 'result')) {
    throw new Error(`${origin}:${fixtureId}:${bundler} exported no result`)
  }
  const fixture = fpConsumerSizeS3aFixture(fixtureId)
  const actual = JSON.parse(JSON.stringify(imported.result)) as JsonValue
  const actualSha256 = sha256(JSON.stringify(actual))
  const expectedSha256 = sha256(JSON.stringify(fixture.expected))
  const closure = artifactClosure(entry.chunk.file, artifacts)
  const closureProjection = closure.map((artifact) => ({
    file: artifact.chunk.file,
    imports: artifact.chunk.imports,
    rawSha256: artifact.rawSha256,
    minifiedSha256: artifact.minifiedSha256,
  }))
  const minifiedProjection = closure.map((artifact) => ({
    file: artifact.chunk.file,
    code: artifact.minifiedCode,
  }))
  return {
    origin,
    fixtureId,
    bundler,
    fixtureSourceSha256: sha256(fixture.source),
    behavior: {
      passed: actualSha256 === expectedSha256,
      expectedSha256,
      actualSha256,
      actual,
    },
    closure: {
      sha256: sha256(JSON.stringify(closureProjection)),
      minifiedSha256: sha256(JSON.stringify(minifiedProjection)),
      artifactCount: closure.length,
    },
    measurements: {
      rawBytes: closure.reduce((total, artifact) => total + artifact.rawBytes, 0),
      minifiedBytes: closure.reduce((total, artifact) => total + artifact.minifiedBytes, 0),
      gzipBytes: closure.reduce((total, artifact) => total + artifact.gzipBytes, 0),
      brotliBytes: closure.reduce((total, artifact) => total + artifact.brotliBytes, 0),
    },
  }
}

async function main(): Promise<void> {
  verifyToolVersions()
  run(process.execPath, [join(repositoryRoot, 'tooling', 'build-package.mjs')], fpRoot)
  const scratch = await mkdtemp(join(tmpdir(), 'stopcock-fp-s3a-consumer-'))
  try {
    const packDirectory = join(scratch, 'tarball')
    await mkdir(packDirectory)
    run('bun', ['pm', 'pack', '--destination', packDirectory], fpRoot)
    const tarballs = (await readdir(packDirectory)).filter((file) => file.endsWith('.tgz'))
    if (tarballs.length !== 1) {
      throw new Error(`S3A pack produced ${tarballs.length} tarballs; expected one`)
    }
    const tarballPath = join(packDirectory, tarballs[0])
    const packedPackage = join(scratch, 'packed-package')
    await mkdir(packedPackage)
    run('tar', ['-xzf', tarballPath, '--strip-components=1', '-C', packedPackage], repositoryRoot)

    const localIdentity = {
      packageProjectionSha256: await packageProjectionSha256(fpRoot),
      distTreeSha256: await treeSha256(join(fpRoot, 'dist')),
    }
    const packedIdentity = {
      tarballSha256: sha256(await readFile(tarballPath)),
      packageProjectionSha256: await packageProjectionSha256(packedPackage),
      distTreeSha256: await treeSha256(join(packedPackage, 'dist')),
    }
    const packageByOrigin = {
      'local-dist': fpRoot,
      packed: packedPackage,
    } as const
    const rows: FpConsumerSizeS3aRow[] = []
    for (const origin of FP_CONSUMER_SIZE_S3A_ORIGINS) {
      const consumerRoot = join(scratch, `consumer-${origin}`)
      await mkdir(consumerRoot)
      const entries = await prepareConsumer(consumerRoot, packageByOrigin[origin])
      for (const fixtureId of FP_CONSUMER_SIZE_S3A_FIXTURES) {
        for (const { id: bundler } of FP_CONSUMER_BUNDLERS) {
          rows.push(
            await measureRow(
              origin,
              fixtureId,
              bundler,
              consumerRoot,
              entries.get(fixtureId) as string,
            ),
          )
        }
      }
    }

    const sourceCommit = run('git', ['rev-parse', 'HEAD'], repositoryRoot).trim()
    const report = finalizeFpConsumerSizeS3aReport({
      schemaVersion: FP_CONSUMER_SIZE_S3A_SCHEMA_VERSION,
      kind: FP_CONSUMER_SIZE_S3A_KIND,
      generatedAt: new Date().toISOString(),
      sourceCommit,
      frozenConsumerFixtureManifestSha256: FP_CONSUMER_FIXTURE_MANIFEST_SHA256,
      s3aFixtureManifestSha256: FP_CONSUMER_SIZE_S3A_FIXTURE_MANIFEST_SHA256,
      tools: {
        bundlers: FP_CONSUMER_BUNDLERS,
        minifier: FP_CONSUMER_MINIFIER,
        compression: FP_CONSUMER_COMPRESSION,
      },
      identity: {
        local: localIdentity,
        packed: packedIdentity,
      },
      rows: Object.freeze(rows),
    })
    console.log('\n@stopcock/fp S3A fresh consumer-size gate\n')
    for (const row of report.rows) {
      console.log(
        `${row.origin.padEnd(10)} ${row.fixtureId.padEnd(18)} ${row.bundler.padEnd(8)} ${String(row.measurements.gzipBytes).padStart(4)} gzip bytes`,
      )
    }
    evaluateFpConsumerSizeS3aReport(report)

    const artifactDirectory = resolve(
      process.env.PERF_ARTIFACT_DIR ?? join(tmpdir(), 'stopcock-fp-performance'),
    )
    await mkdir(artifactDirectory, { recursive: true })
    const reportPath = join(artifactDirectory, 'fp-consumer-size-s3a-gate.json')
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)

    console.log(`\nevidence ${report.evidenceSha256}`)
    console.log(`report ${reportPath}`)
  } finally {
    if (process.env.STOPCOCK_S3A_KEEP_WORKDIR === '1') {
      console.log(`S3A diagnostic work directory retained at ${scratch}`)
    } else {
      await rm(scratch, { recursive: true, force: true })
    }
  }
}

await main()
