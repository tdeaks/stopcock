import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FP_PACKAGE_ALLOWED_DUPLICATE_RUNTIME_PATH_GROUPS,
  FP_PACKAGE_LEGACY_TARBALL_MAXIMUM_BYTES,
  FP_PACKAGE_SHARED_RUNTIME_GZIP_MAXIMUM_BYTES,
  FP_PACKAGE_NAME,
  FP_PACKAGE_PROJECTION_ASSUMPTIONS,
  FP_PACKAGE_STABLE_TARBALL_MAXIMUM_BYTES,
  createFpPackageFileEvidence,
  createFpPackageFileSetIdentity,
  createFpPackageProjectionEvidence,
  createFpPackageSizeReport,
  deriveFpPackageTopology,
  evaluateFpPackageSizeReport,
  type FpPackageArtifactReceipts,
  type FpPackageFileEvidence,
  type FpPackageRawFile,
  type FpPackageSizeEvaluation,
  type FpPackageSizeReport,
  type FpPackageTarballEvidence,
  type FpPackageTopologyEvidence,
} from './fp-package-topology'

export {
  FP_PACKAGE_ALLOWED_DUPLICATE_RUNTIME_PATH_GROUPS,
  FP_PACKAGE_LEGACY_TARBALL_MAXIMUM_BYTES,
  FP_PACKAGE_SHARED_RUNTIME_GZIP_MAXIMUM_BYTES,
  FP_PACKAGE_STABLE_TARBALL_MAXIMUM_BYTES,
  createFpPackageFileEvidence,
  createFpPackageFileSetIdentity,
  createFpPackageProjectionEvidence,
  createFpPackageSizeReport,
  deriveFpPackageTopology,
  evaluateFpPackageSizeReport,
} from './fp-package-topology'
export type {
  FpPackageArtifactReceipts,
  FpPackageFileEvidence,
  FpPackageProjectionEvidence,
  FpPackageRawFile,
  FpPackageSizeEvaluation,
  FpPackageSizeReport,
  FpPackageTarballEvidence,
  FpPackageTopologyEvidence,
} from './fp-package-topology'

export const FP_PACKAGE_SIZE_POLICY = Object.freeze({
  sharedRuntime: Object.freeze({
    description:
      'per-artifact ceiling on runtime the root and optimized entries both reach, gzip level 9',
    maximumBytesPerArtifact: FP_PACKAGE_SHARED_RUNTIME_GZIP_MAXIMUM_BYTES,
  }),
  legacyPackedTarball: Object.freeze({
    description: 'legacy-layout published @stopcock/fp tarball',
    maximumBytes: FP_PACKAGE_LEGACY_TARBALL_MAXIMUM_BYTES,
  }),
  allowedDuplicateRuntimePathGroups: FP_PACKAGE_ALLOWED_DUPLICATE_RUNTIME_PATH_GROUPS,
  samePackageProjection: Object.freeze({
    description: 'publish-style lower-bound feasibility signal, not release evidence',
    stableMaximumBytes: FP_PACKAGE_STABLE_TARBALL_MAXIMUM_BYTES,
    assumptions: FP_PACKAGE_PROJECTION_ASSUMPTIONS,
  }),
})

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const packageDirectory = join(repositoryRoot, 'packages', 'fp')
const packedTextDecoder = new TextDecoder('utf-8', {
  fatal: true,
  ignoreBOM: true,
})

const sha256 = (value: Uint8Array): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

const artifactDirectory = (): string =>
  resolve(process.env.PERF_ARTIFACT_DIR ?? join(tmpdir(), 'stopcock-fp-performance'))

const runPack = async (sourceDirectory: string, destination: string): Promise<string> => {
  await mkdir(destination, { recursive: true })
  const packed = spawnSync(
    'bun',
    ['pm', 'pack', '--destination', destination, '--ignore-scripts', '--quiet'],
    { cwd: sourceDirectory, encoding: 'utf8' },
  )
  if (packed.error) throw packed.error
  if (packed.status !== 0 || packed.signal !== null) {
    throw new Error(
      `bun pm pack failed with status ${String(packed.status)}: ${packed.stderr.trim()}`,
    )
  }
  const tarballs = (await readdir(destination)).filter((entry) => entry.endsWith('.tgz')).sort()
  if (tarballs.length !== 1) {
    throw new Error(`expected exactly one packed tarball; found ${tarballs.length}`)
  }
  return join(destination, tarballs[0] as string)
}

const extractTarball = async (tarballPath: string, destination: string): Promise<string> => {
  await mkdir(destination, { recursive: true })
  const extracted = spawnSync('tar', ['-xzf', tarballPath, '-C', destination], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
  if (extracted.error) throw extracted.error
  if (extracted.status !== 0 || extracted.signal !== null) {
    throw new Error(
      `cannot extract packed @stopcock/fp: ${extracted.stderr.trim() || extracted.stdout.trim()}`,
    )
  }
  const roots = await readdir(destination, { withFileTypes: true })
  if (roots.length !== 1 || roots[0]?.name !== 'package' || !roots[0].isDirectory()) {
    throw new Error('packed tarball must contain exactly one package/ root')
  }
  return join(destination, 'package')
}

const readPackedFiles = async (root: string): Promise<readonly FpPackageRawFile[]> => {
  const files: FpPackageRawFile[] = []
  const walk = async (directory: string, prefix: string): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    )
    for (const entry of entries) {
      const path = join(directory, entry.name)
      const packagePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`
      if (entry.isSymbolicLink()) {
        throw new Error(`packed package contains forbidden symbolic link ${packagePath}`)
      }
      if (entry.isDirectory()) await walk(path, packagePath)
      else if (entry.isFile()) {
        try {
          files.push({
            path: packagePath,
            content: packedTextDecoder.decode(await readFile(path)),
          })
        } catch {
          throw new Error(`packed package contains non-UTF-8 file ${packagePath}`)
        }
      } else throw new Error(`packed package contains unsupported entry ${packagePath}`)
    }
  }
  await walk(root, '')
  return Object.freeze(files)
}

const writeProjectionFile = async (root: string, path: string, content: string): Promise<void> => {
  const absolutePath = join(root, ...path.split('/'))
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content)
}

const projectionExports = (
  topology: FpPackageTopologyEvidence,
): Readonly<Record<string, unknown>> => {
  const projected: Record<string, unknown> = {}
  for (const entry of topology.entries) {
    projected[entry.specifier] =
      entry.types === null
        ? Object.freeze({ import: `./${entry.javascript}` })
        : Object.freeze({
            types: `./${entry.types}`,
            import: `./${entry.javascript}`,
          })
  }
  projected['./package.json'] = './package.json'
  const optimized =
    topology.entries.find(({ specifier }) =>
      topology.mode === 'legacy' ? specifier === './compile' : specifier === './fusion/optimized',
    ) ?? topology.entries[0]
  if (optimized === undefined) throw new Error('projection has no optimized source entry')
  const types =
    optimized.types ??
    topology.entries.find(({ specifier }) => specifier === './compile')?.types ??
    topology.entries.find(({ specifier }) => specifier === '.')?.types
  if (types === undefined || types === null) {
    throw new Error('projection has no public declaration target for fusion entries')
  }
  projected['./fusion'] = Object.freeze({
    types: `./${types}`,
    import: './dist/__projection-fusion-compact.js',
  })
  projected['./fusion/optimized'] = Object.freeze({
    types: `./${types}`,
    import: `./${optimized.javascript}`,
  })
  projected['./fusion/debug'] = Object.freeze({
    types: `./${types}`,
    import: './dist/__projection-fusion-debug.js',
  })
  return Object.freeze(projected)
}

const buildProjectionPackage = async (
  sourceFiles: readonly FpPackageFileEvidence[],
  topology: FpPackageTopologyEvidence,
  root: string,
): Promise<void> => {
  const fileByPath = new Map(sourceFiles.map((file) => [file.path, file]))
  const sourceManifest = fileByPath.get('package.json')
  if (sourceManifest === undefined) throw new Error('projection source manifest is missing')
  const manifest = JSON.parse(sourceManifest.content) as Readonly<Record<string, unknown>>
  const optimizedSpecifier = topology.mode === 'legacy' ? './compile' : './fusion/optimized'
  const optimized = topology.entries.find(({ specifier }) => specifier === optimizedSpecifier)
  if (optimized === undefined) throw new Error(`projection has no ${optimizedSpecifier} entry`)

  const retained = new Set<string>()
  for (const path of [...optimized.closure, ...topology.declarations.reachable]) {
    const source = fileByPath.get(path)
    if (source === undefined) throw new Error(`projection source file ${path} is missing`)
    await writeProjectionFile(root, path, source.content)
    retained.add(path)
  }
  for (const entry of topology.entries) {
    if (retained.has(entry.javascript)) continue
    await writeProjectionFile(root, entry.javascript, 'export {}\n')
    retained.add(entry.javascript)
  }
  await writeProjectionFile(root, 'dist/__projection-fusion-compact.js', 'export {}\n')
  await writeProjectionFile(root, 'dist/__projection-fusion-debug.js', 'export {}\n')

  for (const requiredDocument of ['README.md', 'LICENSE'] as const) {
    const source = fileByPath.get(requiredDocument)
    if (source === undefined) throw new Error(`projection source is missing ${requiredDocument}`)
    await writeProjectionFile(root, requiredDocument, source.content)
  }

  const projectedManifest = {
    ...manifest,
    name: FP_PACKAGE_NAME,
    files: ['dist', 'README.md', 'LICENSE'],
    exports: projectionExports(topology),
  }
  await writeProjectionFile(root, 'package.json', `${JSON.stringify(projectedManifest, null, 2)}\n`)
}

const readPackedArtifactEvidence = async (
  path: string,
  extractionDirectory: string,
): Promise<
  Readonly<{
    evidence: FpPackageTarballEvidence
    rawFiles: readonly FpPackageRawFile[]
  }>
> => {
  const bytes = await readFile(path)
  const extractedRoot = await extractTarball(path, extractionDirectory)
  const rawFiles = await readPackedFiles(extractedRoot)
  return Object.freeze({
    evidence: Object.freeze({
      path,
      sha256: sha256(bytes),
      bytes: bytes.byteLength,
      ...createFpPackageFileSetIdentity(rawFiles),
    }),
    rawFiles,
  })
}

const stablePackedArtifactEvidence = async (
  temporaryPath: string,
  stablePath: string,
  extractionDirectory: string,
): ReturnType<typeof readPackedArtifactEvidence> => {
  await copyFile(temporaryPath, stablePath)
  return readPackedArtifactEvidence(stablePath, extractionDirectory)
}

const main = async (): Promise<void> => {
  const outputDirectory = artifactDirectory()
  const reportPath = join(outputDirectory, 'fp-package-size.json')
  const gatePath = join(outputDirectory, 'fp-package-size-gate.json')
  const sourceTarballPath = join(outputDirectory, 'fp-package-size-source.tgz')
  const projectionTarballPath = join(outputDirectory, 'fp-package-size-lower-bound.tgz')
  const workDirectory = await mkdtemp(join(tmpdir(), 'stopcock-fp-package-size-'))
  let report: FpPackageSizeReport | undefined
  let artifactReceipts: FpPackageArtifactReceipts | undefined
  let evaluation: FpPackageSizeEvaluation = Object.freeze({
    passed: false,
    failures: Object.freeze(['@stopcock/fp package-size evidence was not produced']),
  })

  await mkdir(outputDirectory, { recursive: true })
  try {
    const packed = await runPack(packageDirectory, join(workDirectory, 'source-pack'))
    const sourceArtifact = await stablePackedArtifactEvidence(
      packed,
      sourceTarballPath,
      join(workDirectory, 'source-extracted'),
    )
    const files = createFpPackageFileEvidence(sourceArtifact.rawFiles)
    const topology = deriveFpPackageTopology(files)

    const projectionRoot = join(workDirectory, 'projection-package')
    await mkdir(projectionRoot, { recursive: true })
    await buildProjectionPackage(files, topology, projectionRoot)
    const projected = await runPack(projectionRoot, join(workDirectory, 'projection-pack'))
    const projectionArtifact = await stablePackedArtifactEvidence(
      projected,
      projectionTarballPath,
      join(workDirectory, 'projection-extracted'),
    )
    const projectionSourceFiles = await readPackedFiles(projectionRoot)
    if (JSON.stringify(projectionSourceFiles) !== JSON.stringify(projectionArtifact.rawFiles)) {
      throw new Error('packed lower-bound projection does not match its planned file set')
    }
    const projection = createFpPackageProjectionEvidence(
      topology,
      files,
      sourceArtifact.evidence.sha256,
      projectionArtifact.evidence,
    )
    report = createFpPackageSizeReport({
      generatedAt: new Date().toISOString(),
      files,
      tarball: sourceArtifact.evidence,
      topology,
      projection,
    })
    artifactReceipts = Object.freeze({
      sourceTarball: (
        await readPackedArtifactEvidence(
          sourceArtifact.evidence.path,
          join(workDirectory, 'source-receipt-extracted'),
        )
      ).evidence,
      projectionTarball: (
        await readPackedArtifactEvidence(
          projectionArtifact.evidence.path,
          join(workDirectory, 'projection-receipt-extracted'),
        )
      ).evidence,
    })
    evaluation = evaluateFpPackageSizeReport(report, artifactReceipts)
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  } catch (error) {
    evaluation = Object.freeze({
      passed: false,
      failures: Object.freeze([
        `@stopcock/fp package-size measurement failed: ${(error as Error).message}`,
      ]),
    })
  } finally {
    await rm(workDirectory, { recursive: true, force: true })
  }

  await writeFile(
    gatePath,
    `${JSON.stringify(
      {
        version: 4,
        generatedAt: new Date().toISOString(),
        policy: FP_PACKAGE_SIZE_POLICY,
        report,
        artifactReceipts,
        evaluation,
        passed: evaluation.passed,
      },
      null,
      2,
    )}\n`,
  )

  console.log('\n@stopcock/fp topology-neutral package-size gate\n')
  if (report !== undefined) {
    console.log(`topology: ${report.topology.mode}`)
    console.log(
      `source tarball: ${report.tarball.bytes} bytes` +
        (report.topology.mode === 'legacy'
          ? ` / ${FP_PACKAGE_LEGACY_TARBALL_MAXIMUM_BYTES} legacy bytes`
          : ' (tiered migration evidence)'),
    )
    const shared = report.topology.sharedRuntime
    console.log(
      `shared runtime (${shared.rootEntry} and ${shared.optimizedSpecifier}): ${shared.artifacts.length} artifacts, ` +
        `${shared.gzipBytes} gzip bytes total, largest ${shared.largestGzipBytes} / ${FP_PACKAGE_SHARED_RUNTIME_GZIP_MAXIMUM_BYTES} per artifact`,
    )
    console.log(
      `same-package lower-bound projection: ${report.projection.packedTarball.bytes} / <${FP_PACKAGE_STABLE_TARBALL_MAXIMUM_BYTES} bytes`,
    )
    console.log(
      `reachable declarations: ${report.topology.declarations.reachable.length} files, ${report.topology.declarations.rawBytes} raw bytes`,
    )
  }
  for (const failure of evaluation.failures) console.error(`FAIL\t${failure}`)
  console.log(`raw report: ${reportPath}`)
  console.log(`gate report: ${gatePath}`)
  if (!evaluation.passed) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
