import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transformStopcockPipelines } from '../../../packages/fp-compiler/src/transform'
import { FP_CONSUMER_FIXTURES, type FpConsumerFixture, type FpConsumerFixtureId } from './fixtures'
import type { ConsumerBundleAdapter, ConsumerBundleEntry, JsonValue } from './types'
import { bundleWithEsbuild } from './bundlers/esbuild'
import { bundleWithRollup } from './bundlers/rollup'
import { bundleWithRolldown } from './bundlers/rolldown'
import { bundleWithWebpack } from './bundlers/webpack'
import { compressConsumerArtifact, sha256 } from './compress'
import {
  FP_CONSUMER_BUNDLERS,
  FP_CONSUMER_COMPRESSION,
  FP_CONSUMER_FIXTURE_MANIFEST_ID,
  FP_CONSUMER_FIXTURE_MANIFEST_PROJECTION,
  FP_CONSUMER_FIXTURE_MANIFEST_SHA256,
  FP_CONSUMER_MINIFIER,
  FP_CONSUMER_SIZE_SCHEMA_VERSION,
  type FpConsumerBundlerId,
  type FpConsumerSizeProfile,
} from '../reference/fp-consumer-size-contract'
import {
  computeFpConsumerClosureSha256,
  computeFpConsumerArtifactOrigin,
  evaluateFpConsumerSizeReport,
  type FpConsumerArtifactOriginInput,
  type FpConsumerSizeArtifact,
  type FpConsumerSizeIdentity,
  type FpConsumerSizeMeasuredRow,
  type FpConsumerSizeReport,
  type FpConsumerSizeRow,
} from '../reference/fp-consumer-size-gate'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(import.meta.url)

const adapters: Readonly<Record<FpConsumerBundlerId, ConsumerBundleAdapter>> = {
  esbuild: bundleWithEsbuild,
  rollup: bundleWithRollup,
  rolldown: bundleWithRolldown,
  webpack: bundleWithWebpack,
}

interface CohortPackage {
  readonly name: string
  readonly version: string
  readonly source: { readonly sha256: string }
  readonly distribution: { readonly sha256: string }
  readonly tarball: {
    readonly path: string
    readonly sha256: string
  }
}

interface CohortManifest {
  readonly schemaVersion: number
  readonly kind: string
  readonly packages: readonly CohortPackage[]
}

interface CliOptions {
  readonly profile: FpConsumerSizeProfile
  readonly bundlers: readonly FpConsumerBundlerId[]
  readonly fixtureIds: readonly FpConsumerFixtureId[]
  readonly cohortManifestPath: string
  readonly outputPath: string
}

const parseList = (value: string): readonly string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const manifestCandidates = async (directory: string): Promise<readonly string[]> => {
  const candidates: string[] = []
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.name === 'cohort-manifest.json') candidates.push(path)
    }
  }
  try {
    await walk(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return candidates.sort()
}

const defaultCohortManifest = async (): Promise<string> => {
  const candidates = await manifestCandidates(join(repositoryRoot, 'artifacts', 'v2', 'dev'))
  if (candidates.length !== 1) {
    throw new Error(`expected exactly one frozen dev cohort manifest; found ${candidates.length}`)
  }
  return candidates[0] as string
}

const parseCli = async (): Promise<CliOptions> => {
  const args = process.argv.slice(2)
  let profile: FpConsumerSizeProfile = 'release'
  let selectedBundlers: FpConsumerBundlerId[] | undefined
  let selectedFixtures: FpConsumerFixtureId[] | undefined
  let cohortManifestPath: string | undefined
  let outputPath: string | undefined
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    const value = args[index + 1]
    if (argument === '--profile' && value !== undefined) {
      if (!['characterization', 'pr', 'release', 'final'].includes(value)) {
        throw new Error(`unknown consumer-size profile ${value}`)
      }
      profile = value as FpConsumerSizeProfile
      index += 1
    } else if (argument === '--bundler' && value !== undefined) {
      selectedBundlers ??= []
      selectedBundlers.push(value as FpConsumerBundlerId)
      index += 1
    } else if (argument === '--fixtures' && value !== undefined) {
      selectedFixtures = parseList(value) as FpConsumerFixtureId[]
      index += 1
    } else if (argument === '--cohort-manifest' && value !== undefined) {
      cohortManifestPath = resolve(value)
      index += 1
    } else if (argument === '--out' && value !== undefined) {
      outputPath = resolve(value)
      index += 1
    } else {
      throw new Error(`unknown or incomplete argument ${String(argument)}`)
    }
  }
  const knownBundlers = new Set(FP_CONSUMER_BUNDLERS.map(({ id }) => id))
  const bundlers =
    selectedBundlers ??
    (profile === 'pr'
      ? (['esbuild', 'rolldown'] as const)
      : FP_CONSUMER_BUNDLERS.map(({ id }) => id))
  if (
    bundlers.length === 0 ||
    new Set(bundlers).size !== bundlers.length ||
    !bundlers.every((id) => knownBundlers.has(id))
  ) {
    throw new Error('bundler selection is empty, duplicated, or unknown')
  }
  const knownFixtures = new Set(FP_CONSUMER_FIXTURES.map(({ id }) => id))
  const fixtureIds = selectedFixtures ?? FP_CONSUMER_FIXTURES.map(({ id }) => id)
  if (
    fixtureIds.length === 0 ||
    new Set(fixtureIds).size !== fixtureIds.length ||
    !fixtureIds.every((id) => knownFixtures.has(id))
  ) {
    throw new Error('fixture selection is empty, duplicated, or unknown')
  }
  const resolvedManifest = cohortManifestPath ?? (await defaultCohortManifest())
  const artifactDirectory = resolve(
    process.env.PERF_ARTIFACT_DIR ?? join(tmpdir(), 'stopcock-fp-performance'),
  )
  return {
    profile,
    bundlers: Object.freeze(bundlers),
    fixtureIds: Object.freeze(fixtureIds),
    cohortManifestPath: resolvedManifest,
    outputPath: outputPath ?? join(artifactDirectory, `fp-consumer-size-${profile}.json`),
  }
}

const readCohort = async (
  manifestPath: string,
): Promise<{
  readonly manifest: CohortManifest
  readonly fp: CohortPackage
  readonly compiler: CohortPackage
  readonly tarballPath: string
  readonly sourceCommit: string
}> => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as CohortManifest
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'stopcock-v2-cohort') {
    throw new Error(`${manifestPath} is not a Stopcock 2.0 cohort manifest`)
  }
  const fp = manifest.packages.find(({ name }) => name === '@stopcock/fp')
  const compiler = manifest.packages.find(({ name }) => name === '@stopcock/fp-compiler')
  if (fp === undefined || compiler === undefined) {
    throw new Error('cohort manifest has no FP/compiler pair')
  }
  const tarballPath = resolve(dirname(manifestPath), fp.tarball.path)
  const tarballBytes = await readFile(tarballPath)
  if (sha256(tarballBytes) !== fp.tarball.sha256) {
    throw new Error('frozen @stopcock/fp tarball checksum is wrong')
  }
  const committed = spawnSync(
    'git',
    ['log', '-1', '--format=%H', '--', relative(repositoryRoot, manifestPath)],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )
  if (committed.status !== 0 || committed.signal !== null) {
    throw new Error(`cannot identify frozen cohort commit: ${committed.stderr.trim()}`)
  }
  const sourceCommit = committed.stdout.trim()
  if (sourceCommit.length === 0) throw new Error('frozen cohort manifest is uncommitted')
  const productDiff = spawnSync(
    'git',
    ['diff', '--quiet', sourceCommit, '--', 'packages/fp', 'packages/fp-compiler'],
    { cwd: repositoryRoot },
  )
  if (productDiff.status !== 0 || productDiff.signal !== null) {
    throw new Error(
      'current FP/compiler source differs from the frozen cohort; rebuild the cohort deliberately',
    )
  }
  const productStatus = spawnSync(
    'git',
    [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--',
      'packages/fp',
      'packages/fp-compiler',
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )
  if (
    productStatus.status !== 0 ||
    productStatus.signal !== null ||
    productStatus.stdout.trim().length > 0
  ) {
    throw new Error('current FP/compiler paths contain uncommitted product inputs')
  }
  return { manifest, fp, compiler, tarballPath, sourceCommit }
}

const verifyToolVersions = (): void => {
  for (const tool of [...FP_CONSUMER_BUNDLERS, FP_CONSUMER_MINIFIER]) {
    const manifest = require(`${tool.id}/package.json`) as { readonly version?: string }
    if (manifest.version !== tool.version) {
      throw new Error(
        `${tool.id} resolved to ${String(manifest.version)}; contract requires ${tool.version}`,
      )
    }
  }
}

const processIsRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return false
    if (code === 'EPERM') return true
    throw error
  }
}

const acquireConsumerWorkspace = async (
  tarballSha256: string,
): Promise<{
  readonly directory: string
  readonly release: () => Promise<void>
}> => {
  const token = tarballSha256.replace(/^sha256:/u, '').slice(0, 16)
  if (!/^[0-9a-f]{16}$/u.test(token)) {
    throw new Error('cannot derive deterministic consumer workspace from tarball identity')
  }
  const directory = join(tmpdir(), `stopcock-fp-size-consumer-${token}`)
  const lockPath = `${directory}.lock`
  const owner = String(process.pid)

  const acquire = async (mayRecoverStaleLock: boolean): Promise<void> => {
    try {
      await symlink(owner, lockPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      let existingOwner: string
      try {
        existingOwner = await readlink(lockPath)
      } catch (readError) {
        throw new Error(
          `consumer workspace lock ${lockPath} is not a valid process-owned symbolic link`,
          { cause: readError },
        )
      }
      const existingPid = Number(existingOwner)
      if (!Number.isSafeInteger(existingPid) || existingPid <= 0) {
        throw new Error(`consumer workspace lock ${lockPath} has invalid owner ${existingOwner}`)
      }
      if (processIsRunning(existingPid)) {
        throw new Error(`consumer workspace is already owned by live process ${existingPid}`)
      }
      if (!mayRecoverStaleLock) {
        throw new Error(`consumer workspace lock ${lockPath} changed while recovering it`)
      }
      await unlink(lockPath)
      await acquire(false)
    }
  }

  await acquire(true)
  let canonicalDirectory: string
  try {
    await rm(directory, { recursive: true, force: true })
    await mkdir(directory)
    canonicalDirectory = await realpath(directory)
  } catch (error) {
    await unlink(lockPath)
    throw error
  }

  return {
    directory: canonicalDirectory,
    release: async () => {
      await rm(canonicalDirectory, { recursive: true, force: true })
      const currentOwner = await readlink(lockPath)
      if (currentOwner !== owner) {
        throw new Error(`consumer workspace lock owner changed from ${owner} to ${currentOwner}`)
      }
      await unlink(lockPath)
    },
  }
}

const hashFiles = async (paths: readonly string[]): Promise<string> => {
  const hash = createHash('sha256')
  for (const path of [...paths].sort()) {
    const relativePath = relative(repositoryRoot, path)
    const bytes = await readFile(path)
    hash.update(`${relativePath}\0${bytes.byteLength}\0`)
    hash.update(bytes)
  }
  return `sha256:${hash.digest('hex')}`
}

const prepareConsumer = async (
  directory: string,
  tarballPath: string,
): Promise<{ readonly manifestSha256: string; readonly packageExports: ReadonlySet<string> }> => {
  const packageDirectory = join(directory, 'node_modules', '@stopcock', 'fp')
  await mkdir(packageDirectory, { recursive: true })
  const extracted = spawnSync(
    'tar',
    ['-xzf', tarballPath, '--strip-components=1', '-C', packageDirectory],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )
  if (extracted.status !== 0 || extracted.signal !== null) {
    throw new Error(`cannot extract frozen @stopcock/fp: ${extracted.stderr.trim()}`)
  }
  const consumerManifest = `${JSON.stringify(
    {
      name: 'stopcock-fp-size-consumer',
      private: true,
      type: 'module',
      dependencies: {
        '@stopcock/fp': 'file:./stopcock-fp.tgz',
      },
    },
    null,
    2,
  )}\n`
  await writeFile(join(directory, 'package.json'), consumerManifest)
  const packedManifest = JSON.parse(
    await readFile(join(packageDirectory, 'package.json'), 'utf8'),
  ) as { readonly exports?: Readonly<Record<string, unknown>> }
  return {
    manifestSha256: sha256(consumerManifest),
    packageExports: new Set(Object.keys(packedManifest.exports ?? {})),
  }
}

const projectionByFixtureId = new Map(
  FP_CONSUMER_FIXTURE_MANIFEST_PROJECTION.fixtures.map((fixture) => [fixture.id, fixture]),
)

const normalizedJson = (value: unknown): JsonValue => {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error('fixture result is not JSON-serializable')
  return JSON.parse(serialized) as JsonValue
}

const emittedFixtureSources = async (
  fixtures: readonly FpConsumerFixture[],
  consumerDirectory: string,
): Promise<{
  readonly entries: ReadonlyMap<FpConsumerFixtureId, ConsumerBundleEntry>
  readonly compilerEmitted: readonly {
    readonly fixtureId: FpConsumerFixtureId
    readonly sha256: string
  }[]
}> => {
  const fixtureDirectory = join(consumerDirectory, 'fixtures')
  await mkdir(fixtureDirectory, { recursive: true })
  const entries = new Map<FpConsumerFixtureId, ConsumerBundleEntry>()
  const compilerEmitted = new Map<FpConsumerFixtureId, string>()
  for (const fixture of fixtures) {
    if (fixture.applicability.status !== 'active' || fixture.source === null) continue
    let emitted = fixture.source
    if (fixture.sourceKind === 'compiler-transformed') {
      const transformed = transformStopcockPipelines(fixture.source, `${fixture.id}.js`, {
        diagnostics: 'error',
      })
      if (!transformed.diagnostics.some(({ transformed: didTransform }) => didTransform)) {
        throw new Error(`${fixture.id} did not produce compiler output`)
      }
      emitted = transformed.code
      compilerEmitted.set(fixture.id, sha256(emitted))
    }
    const path = join(fixtureDirectory, `${fixture.id.replaceAll('.', '-')}.js`)
    await writeFile(path, emitted)
    entries.set(fixture.id, { fixtureId: fixture.id, path })
  }
  return {
    entries,
    compilerEmitted: Object.freeze(
      [...compilerEmitted].map(([fixtureId, emittedSha256]) => ({
        fixtureId,
        sha256: emittedSha256,
      })),
    ),
  }
}

const buildGroups = (
  fixtures: readonly FpConsumerFixture[],
  entryByFixtureId: ReadonlyMap<FpConsumerFixtureId, ConsumerBundleEntry>,
): readonly { readonly id: string; readonly entries: readonly ConsumerBundleEntry[] }[] => {
  const groups: Array<{
    readonly id: string
    readonly entries: readonly ConsumerBundleEntry[]
  }> = fixtures
    .filter(
      (fixture) => fixture.applicability.status === 'active' && fixture.entryKind === 'single',
    )
    .map((fixture) => ({
      id: fixture.id,
      entries: [entryByFixtureId.get(fixture.id) as ConsumerBundleEntry],
    }))
  const multi = fixtures
    .filter(
      (fixture) =>
        fixture.applicability.status === 'active' && fixture.entryKind === 'multi-entry-closure',
    )
    .map((fixture) => entryByFixtureId.get(fixture.id) as ConsumerBundleEntry)
  if (multi.length > 0) groups.push({ id: 'multi.routes', entries: multi })
  return groups
}

const artifactClosure = (
  entryId: string,
  artifactById: ReadonlyMap<string, FpConsumerSizeArtifact>,
): readonly string[] => {
  const visited = new Set<string>()
  const pending = [entryId]
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined || visited.has(current)) continue
    const artifact = artifactById.get(current)
    if (artifact === undefined) throw new Error(`closure references missing ${current}`)
    visited.add(current)
    pending.push(...artifact.imports)
  }
  return Object.freeze([...visited].sort())
}

const measureBundler = async (
  bundler: FpConsumerBundlerId,
  fixtures: readonly FpConsumerFixture[],
  groups: ReturnType<typeof buildGroups>,
  workDirectory: string,
): Promise<{
  readonly artifacts: readonly FpConsumerSizeArtifact[]
  readonly rows: readonly FpConsumerSizeMeasuredRow[]
}> => {
  const adapter = adapters[bundler]
  const artifacts: FpConsumerSizeArtifact[] = []
  const rows: FpConsumerSizeMeasuredRow[] = []
  for (const group of groups) {
    const outputDirectory = join(workDirectory, 'bundles', bundler, group.id)
    const minifiedDirectory = join(outputDirectory, 'minified')
    await mkdir(minifiedDirectory, { recursive: true })
    const output = await adapter({
      buildId: group.id,
      entries: group.entries,
      consumerRoot: workDirectory,
      outputDirectory,
    })
    const idByFile = new Map(
      output.chunks.map((chunk) => [chunk.file, `${bundler}:${group.id}:${chunk.file}`]),
    )
    const buildArtifacts = await Promise.all(
      output.chunks.map(async (chunk): Promise<FpConsumerSizeArtifact> => {
        const compressed = await compressConsumerArtifact(chunk.code)
        const id = idByFile.get(chunk.file)
        if (id === undefined) throw new Error(`missing artifact id for ${chunk.file}`)
        const imports = chunk.imports.map((file) => {
          const importedId = idByFile.get(file)
          if (importedId === undefined) {
            throw new Error(`${bundler} ${chunk.file} imports unknown ${file}`)
          }
          return importedId
        })
        const minifiedPath = join(minifiedDirectory, chunk.file)
        await mkdir(dirname(minifiedPath), { recursive: true })
        await writeFile(minifiedPath, compressed.minifiedCode)
        return {
          id,
          bundler,
          buildId: group.id,
          file: chunk.file,
          isEntry: chunk.isEntry,
          entryFixtureId: chunk.entryId as FpConsumerFixtureId | null,
          imports: Object.freeze(imports),
          ...compressed,
          modules: Object.freeze(
            Object.entries(chunk.modules)
              .map(([moduleId, rawBytesInOutput]) => ({
                id: moduleId,
                rawBytesInOutput,
              }))
              .sort((left, right) => left.id.localeCompare(right.id)),
          ),
        }
      }),
    )
    artifacts.push(...buildArtifacts)
    const artifactById = new Map(buildArtifacts.map((artifact) => [artifact.id, artifact]))
    for (const entry of group.entries) {
      const fixtureId = entry.fixtureId as FpConsumerFixtureId
      const entryArtifact = buildArtifacts.find(
        (artifact) => artifact.isEntry && artifact.entryFixtureId === fixtureId,
      )
      if (entryArtifact === undefined) {
        throw new Error(`${bundler} emitted no entry for ${fixtureId}`)
      }
      const imported = (await import(
        `${pathToFileURL(join(minifiedDirectory, entryArtifact.file)).href}?${Date.now()}`
      )) as { readonly result?: unknown }
      if (!Object.hasOwn(imported, 'result')) {
        throw new Error(`${bundler} ${fixtureId} final artifact exports no result`)
      }
      const actual = normalizedJson(imported.result)
      const fixture = fixtures.find(({ id }) => id === fixtureId)
      const projection = projectionByFixtureId.get(fixtureId)
      if (
        fixture === undefined ||
        fixture.expected === null ||
        projection === undefined ||
        projection.sourceSha256 === null ||
        projection.oracleSha256 === null
      ) {
        throw new Error(`missing active contract for ${fixtureId}`)
      }
      const actualSha256 = sha256(JSON.stringify(actual))
      const closureIds = artifactClosure(entryArtifact.id, artifactById)
      const closureArtifacts = closureIds.map(
        (id) => artifactById.get(id) as FpConsumerSizeArtifact,
      )
      rows.push({
        fixtureId,
        bundler,
        status: 'measured',
        fixtureSourceSha256: projection.sourceSha256,
        compiledSourceSha256:
          fixture.sourceKind === 'compiler-transformed'
            ? sha256(
                transformStopcockPipelines(fixture.source as string, `${fixture.id}.js`, {
                  diagnostics: 'error',
                }).code,
              )
            : null,
        behavior: {
          executed: true,
          passed: actualSha256 === projection.oracleSha256,
          expectedSha256: projection.oracleSha256,
          actualSha256,
          actual,
        },
        closure: {
          entryArtifactId: entryArtifact.id,
          artifactIds: closureIds,
          sha256: computeFpConsumerClosureSha256(entryArtifact.id, closureIds, buildArtifacts),
        },
        measurements: {
          rawBytes: closureArtifacts.reduce((sum, artifact) => sum + artifact.rawBytes, 0),
          minifiedBytes: closureArtifacts.reduce(
            (sum, artifact) => sum + artifact.minifiedBytes,
            0,
          ),
          gzipBytes: closureArtifacts.reduce((sum, artifact) => sum + artifact.gzipBytes, 0),
          brotliBytes: closureArtifacts.reduce((sum, artifact) => sum + artifact.brotliBytes, 0),
        },
      })
    }
  }
  return { artifacts: Object.freeze(artifacts), rows: Object.freeze(rows) }
}

const main = async (): Promise<void> => {
  const options = await parseCli()
  verifyToolVersions()
  const cohort = await readCohort(options.cohortManifestPath)
  const workspace = await acquireConsumerWorkspace(cohort.fp.tarball.sha256)
  const workDirectory = workspace.directory
  try {
    const consumer = await prepareConsumer(workDirectory, cohort.tarballPath)
    const fixtures = options.fixtureIds.map(
      (id) => FP_CONSUMER_FIXTURES.find((fixture) => fixture.id === id) as FpConsumerFixture,
    )
    for (const fixture of fixtures) {
      if (fixture.applicability.status !== 'not-applicable') continue
      const exportKey = `.${fixture.applicability.expectedSpecifier.slice('@stopcock/fp'.length)}`
      if (consumer.packageExports.has(exportKey)) {
        throw new Error(
          `${fixture.id} export now exists; activate its contract row before measuring`,
        )
      }
    }
    const emitted = await emittedFixtureSources(fixtures, workDirectory)
    const groups = buildGroups(fixtures, emitted.entries)
    const compilerMetadataSha256 = await hashFiles([
      join(repositoryRoot, 'packages', 'fp', 'module-manifest.ts'),
      join(repositoryRoot, 'packages', 'fp', 'src', 'registry.ts'),
      join(repositoryRoot, 'packages', 'fp-compiler', 'src', 'ops-table.ts'),
    ])
    const identity: FpConsumerSizeIdentity = {
      environment: {
        platform: process.platform,
        architecture: process.arch,
        runtime: {
          name:
            (process.versions as Readonly<Record<string, string | undefined>>).bun === undefined
              ? 'node'
              : 'bun',
          version:
            (process.versions as Readonly<Record<string, string | undefined>>).bun ??
            process.versions.node,
        },
        zlibVersion: process.versions.zlib,
      },
      source: {
        commit: cohort.sourceCommit,
        sha256: cohort.fp.source.sha256,
      },
      distribution: {
        sha256: cohort.fp.distribution.sha256,
      },
      package: {
        name: '@stopcock/fp',
        version: cohort.fp.version,
        tarballSha256: cohort.fp.tarball.sha256,
      },
      consumer: {
        manifestSha256: consumer.manifestSha256,
      },
      compiler: {
        sourceSha256: cohort.compiler.source.sha256,
        metadataSha256: compilerMetadataSha256,
        emitted: emitted.compilerEmitted,
      },
    }
    const artifacts: FpConsumerSizeArtifact[] = []
    const rows: FpConsumerSizeRow[] = []
    for (const bundler of options.bundlers) {
      const measured = await measureBundler(bundler, fixtures, groups, workDirectory)
      artifacts.push(...measured.artifacts)
      rows.push(...measured.rows)
      for (const fixture of fixtures) {
        if (fixture.applicability.status !== 'not-applicable') continue
        rows.push({
          fixtureId: fixture.id,
          bundler,
          status: 'not-applicable',
          reason: 'expected-export-absent',
          expectedSpecifier: fixture.applicability.expectedSpecifier,
          observedExportAbsent: true,
        })
      }
    }
    const reportInput: FpConsumerArtifactOriginInput = {
      schemaVersion: FP_CONSUMER_SIZE_SCHEMA_VERSION,
      fixtureManifest: {
        id: FP_CONSUMER_FIXTURE_MANIFEST_ID,
        sha256: FP_CONSUMER_FIXTURE_MANIFEST_SHA256,
      },
      identity,
      tools: {
        bundlers: FP_CONSUMER_BUNDLERS,
        minifier: FP_CONSUMER_MINIFIER,
        compression: FP_CONSUMER_COMPRESSION,
      },
      artifacts: Object.freeze(artifacts),
    }
    const report: FpConsumerSizeReport = {
      ...reportInput,
      generatedAt: new Date().toISOString(),
      artifactOrigin: computeFpConsumerArtifactOrigin(reportInput, options.bundlers),
      rows: Object.freeze(rows),
    }
    const evaluation = evaluateFpConsumerSizeReport(report, {
      profile: options.profile,
      expectedIdentity: identity,
      fixtureIds: options.fixtureIds,
      bundlerIds: options.bundlers,
    })
    await mkdir(dirname(options.outputPath), { recursive: true })
    await writeFile(
      options.outputPath,
      `${JSON.stringify(
        {
          profile: options.profile,
          report,
          evaluation,
          passed: evaluation.passed,
        },
        null,
        2,
      )}\n`,
    )
    console.log('\n@stopcock/fp packed consumer-size evidence\n')
    for (const row of rows) {
      if (row.status === 'not-applicable') {
        console.log(`${row.bundler}\t${row.fixtureId}\tN/A expected export absent`)
      } else {
        console.log(
          `${row.bundler}\t${row.fixtureId}\t${row.measurements.gzipBytes} gzip\t${row.measurements.brotliBytes} br`,
        )
      }
    }
    for (const failure of evaluation.failures) console.error(`FAIL\t${failure}`)
    console.log(`report: ${options.outputPath}`)
    if (!evaluation.passed) process.exitCode = 1
  } finally {
    await workspace.release()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
