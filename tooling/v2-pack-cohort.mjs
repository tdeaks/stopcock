#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CohortError,
  assertCanonicalMutationContext,
  buildCohortDependencyGraph,
  checkPackedCohort,
  computeCohortContentHash,
  expectedCohortManifestPath,
  hashDirectoryTree,
  inspectPackedTarball,
  loadChangesetsRuntime,
  readCohortArtifactContext,
  readCohortBuildInputs,
  topologicalCohortOrder,
} from './v2-cohort.mjs'

const COHORT_MANIFEST_KIND = 'stopcock-v2-cohort'
const COHORT_MANIFEST_SCHEMA_VERSION = 1
const SYNTH_PACKAGE = '@stopcock/synth'
const INTERNAL_SECTIONS = Object.freeze([
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'devDependencies',
])

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const fail = (message) => {
  throw new CohortError(message)
}

const assert = (condition, message) => {
  if (!condition) fail(message)
}

const compareStrings = (left, right) => left.localeCompare(right)

const toPosixPath = (path) => path.split(sep).join('/')

const jsonBytes = (value) => `${JSON.stringify(value, null, 2)}\n`

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

const fileIdentity = (path) => {
  const metadata = lstatSync(path)
  assert(metadata.isFile() && !metadata.isSymbolicLink(), `${path} must be a regular file`)
  const bytes = readFileSync(path)
  return { sha256: sha256(bytes), bytes: bytes.length }
}

const sourceInternalDependencies = (manifest, selectedPublicNames) => {
  const selected = new Set(selectedPublicNames)
  const dependencies = []
  for (const section of INTERNAL_SECTIONS) {
    const values = manifest[section]
    if (values === undefined) continue
    assert(
      values !== null && typeof values === 'object' && !Array.isArray(values),
      `${manifest.name} ${section} must be an object`,
    )
    for (const [name, range] of Object.entries(values).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (!name.startsWith('@stopcock/')) continue
      assert(selected.has(name), `${manifest.name} ${section} names non-cohort package ${name}`)
      assert(typeof range === 'string', `${manifest.name} ${section}.${name} must be a string`)
      dependencies.push({ section, name, range })
    }
  }
  return dependencies.sort((left, right) =>
    `${left.section}\0${left.name}`.localeCompare(`${right.section}\0${right.name}`),
  )
}

const runCommand = ({ command, args, cwd, label, stdio = 'pipe' }) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: stdio === 'inherit' ? undefined : 'utf8',
    stdio,
  })
  assert(
    result.status === 0,
    `${label} failed (${result.status ?? 'signal'}): ${
      typeof result.stderr === 'string'
        ? result.stderr.trim() || result.stdout?.trim() || 'no output'
        : result.error?.message || 'no output'
    }`,
  )
}

export const defaultBuildPackage = async ({ root, workspace }) => {
  runCommand({
    command: process.execPath,
    args: [join(root, 'tooling', 'build-package.mjs')],
    cwd: workspace.path,
    label: `${workspace.name} build`,
  })
}

export const defaultPackPackage = async ({ workspace, outputDirectory }) => {
  const before = new Set(
    readdirSync(outputDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.tgz'))
      .map((entry) => entry.name),
  )
  runCommand({
    command: 'bun',
    args: ['pm', 'pack', '--destination', outputDirectory],
    cwd: workspace.path,
    label: `${workspace.name} pack`,
  })
  const created = readdirSync(outputDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tgz') && !before.has(entry.name))
    .map((entry) => entry.name)
    .sort(compareStrings)
  assert(
    created.length === 1,
    `${workspace.name} pack must create exactly one new tarball; received ${
      created.join(', ') || 'none'
    }`,
  )
  return join(outputDirectory, created[0])
}

const makeSourceGraph = (selectedPublic, selectedPublicNames) =>
  buildCohortDependencyGraph(
    selectedPublic.map((workspace) => ({
      name: workspace.name,
      internalDependencies: sourceInternalDependencies(workspace.manifest, selectedPublicNames),
    })),
  )

const assertIdentityEqual = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} changed while packing`)
}

const existingArtifactMatches = async ({
  root,
  stagingManifestPath,
  finalManifestPath,
  runtime,
}) => {
  assert(
    readFileSync(stagingManifestPath).equals(readFileSync(finalManifestPath)),
    `refusing to overwrite a differing immutable cohort artifact at ${toPosixPath(
      relative(root, finalManifestPath),
    )}`,
  )
  await checkPackedCohort({
    root,
    manifest: relative(root, finalManifestPath),
    runtime,
  })
}

export const packCohort = async ({
  root = repositoryRoot,
  mode,
  target,
  runtime = loadChangesetsRuntime(),
  runBuild = defaultBuildPackage,
  runPack = defaultPackPackage,
} = {}) => {
  assert(['dev', 'candidate', 'release'].includes(mode), 'mode must be dev, candidate, or release')
  assert(typeof target === 'string' && target.length > 0, 'a target version is required')
  const resolvedRoot = resolve(root)
  expectedCohortManifestPath({
    root: resolvedRoot,
    mode,
    target,
    contentHash: `sha256:${'0'.repeat(64)}`,
  })
  const context = await readCohortArtifactContext({
    root: resolvedRoot,
    target,
    runtime,
  })
  assert(context.synth.name === SYNTH_PACKAGE, `private compatibility must be ${SYNTH_PACKAGE}`)
  assert(context.synth.manifest.private === true, `${SYNTH_PACKAGE} must remain private`)
  if (mode !== 'dev') {
    assert(
      context.check.pendingPublicChangesets.length === 0,
      `${mode} packing requires every public changeset to be consumed`,
    )
  }

  const selectedPublic = [...context.selectedPublic].sort((left, right) =>
    left.name.localeCompare(right.name),
  )
  const selectedPublicNames = selectedPublic.map((workspace) => workspace.name)
  const sourceGraph = makeSourceGraph(selectedPublic, selectedPublicNames)
  const buildOrder = topologicalCohortOrder(sourceGraph)
  const workspaceByName = new Map(selectedPublic.map((workspace) => [workspace.name, workspace]))
  const buildInputs = readCohortBuildInputs(resolvedRoot)
  assert(buildInputs.length > 0, 'the cohort packer found no build inputs')

  const artifactsRoot = join(resolvedRoot, 'artifacts', 'v2')
  mkdirSync(artifactsRoot, { recursive: true })
  const stagingRoot = mkdtempSync(join(artifactsRoot, '.pack-staging-'))
  const tarballsDirectory = join(stagingRoot, 'tarballs')
  mkdirSync(tarballsDirectory, { recursive: true })
  let retainedStaging = true
  let createdFinalDirectory
  let completed = false

  try {
    const packageRecords = []
    for (const name of buildOrder) {
      const workspace = workspaceByName.get(name)
      assert(workspace !== undefined, `build order names unknown workspace ${name}`)
      const source = hashDirectoryTree(workspace.path, {
        excludeTopLevel: ['dist', 'node_modules'],
        label: `${name} source`,
      })
      const workspaceManifest = fileIdentity(join(workspace.path, 'package.json'))
      await runBuild({ root: resolvedRoot, workspace })
      const distribution = hashDirectoryTree(join(workspace.path, 'dist'), {
        label: `${name} distribution`,
      })
      const tarballPath = await runPack({
        root: resolvedRoot,
        workspace,
        outputDirectory: tarballsDirectory,
      })
      const inspected = inspectPackedTarball({
        tarballPath,
        expectedName: name,
        expectedVersion: target,
        selectedPublicNames,
        expectedWorkspaceManifest: workspace.manifest,
      })
      assertIdentityEqual(inspected.distribution, distribution, `${name} packed distribution`)
      packageRecords.push({
        name,
        version: target,
        directory: workspace.directory,
        source,
        distribution,
        workspaceManifest,
        packedManifest: inspected.packedManifest,
        exports: inspected.exports,
        internalDependencies: inspected.internalDependencies,
        tarball: {
          path: `tarballs/${inspected.tarball.filename}`,
          ...inspected.tarball,
        },
      })
    }

    packageRecords.sort((left, right) => left.name.localeCompare(right.name))
    const dependencyGraph = buildCohortDependencyGraph(packageRecords)
    assert(
      JSON.stringify(dependencyGraph) === JSON.stringify(sourceGraph),
      'packed internal dependency graph does not match the workspace dependency graph',
    )
    assert(
      JSON.stringify(topologicalCohortOrder(dependencyGraph)) === JSON.stringify(buildOrder),
      'packed dependency graph changed the deterministic build order',
    )
    for (const record of packageRecords) {
      const workspace = workspaceByName.get(record.name)
      assertIdentityEqual(
        hashDirectoryTree(workspace.path, {
          excludeTopLevel: ['dist', 'node_modules'],
          label: `${record.name} source`,
        }),
        record.source,
        `${record.name} source`,
      )
      assertIdentityEqual(
        fileIdentity(join(workspace.path, 'package.json')),
        record.workspaceManifest,
        `${record.name} workspace manifest`,
      )
      assertIdentityEqual(
        hashDirectoryTree(join(workspace.path, 'dist'), {
          label: `${record.name} distribution`,
        }),
        record.distribution,
        `${record.name} distribution`,
      )
    }
    assertIdentityEqual(readCohortBuildInputs(resolvedRoot), buildInputs, 'cohort build inputs')

    const manifest = {
      schemaVersion: COHORT_MANIFEST_SCHEMA_VERSION,
      kind: COHORT_MANIFEST_KIND,
      mode,
      target,
      cohortContentHash: '',
      publicCount: packageRecords.length,
      privateCompatibility: {
        name: SYNTH_PACKAGE,
        publication: 'excluded',
      },
      buildInputs,
      buildOrder,
      dependencyGraph,
      packages: packageRecords,
    }
    manifest.cohortContentHash = computeCohortContentHash(manifest)
    const finalManifestPath = expectedCohortManifestPath({
      root: resolvedRoot,
      mode,
      target,
      contentHash: manifest.cohortContentHash,
    })
    const finalDirectory = dirname(finalManifestPath)
    const stagingManifestPath = join(stagingRoot, 'cohort-manifest.json')
    writeFileSync(stagingManifestPath, jsonBytes(manifest))

    let changed
    if (existsSync(finalDirectory)) {
      assert(
        existsSync(finalManifestPath),
        `refusing incomplete immutable cohort artifact at ${toPosixPath(
          relative(resolvedRoot, finalDirectory),
        )}`,
      )
      await existingArtifactMatches({
        root: resolvedRoot,
        stagingManifestPath,
        finalManifestPath,
        runtime,
      })
      changed = false
    } else {
      mkdirSync(dirname(finalDirectory), { recursive: true })
      try {
        renameSync(stagingRoot, finalDirectory)
        retainedStaging = false
        createdFinalDirectory = finalDirectory
        changed = true
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'EEXIST' || error.code === 'ENOTEMPTY') &&
          existsSync(finalManifestPath)
        ) {
          await existingArtifactMatches({
            root: resolvedRoot,
            stagingManifestPath,
            finalManifestPath,
            runtime,
          })
          changed = false
        } else {
          throw error
        }
      }
    }

    const check = await checkPackedCohort({
      root: resolvedRoot,
      manifest: relative(resolvedRoot, finalManifestPath),
      runtime,
    })
    completed = true
    return {
      schemaVersion: 1,
      command: 'pack-cohort',
      changed,
      mode,
      target,
      cohortContentHash: manifest.cohortContentHash,
      manifest: toPosixPath(relative(resolvedRoot, finalManifestPath)),
      publicCount: packageRecords.length,
      buildOrder,
      check,
    }
  } finally {
    if (retainedStaging) rmSync(stagingRoot, { recursive: true, force: true })
    if (!completed && createdFinalDirectory !== undefined) {
      rmSync(createdFinalDirectory, { recursive: true, force: true })
    }
  }
}

class UsageError extends Error {}

const usage =
  'usage: node tooling/v2-pack-cohort.mjs --mode <dev|candidate|release> --target <version>'

const parseArguments = (args) => {
  const options = {}
  while (args.length > 0) {
    const flag = args.shift()
    if (!['--mode', '--target'].includes(flag) || args.length === 0) {
      throw new UsageError(usage)
    }
    const key = flag === '--mode' ? 'mode' : 'target'
    if (options[key] !== undefined) throw new UsageError(`duplicate ${flag}\n${usage}`)
    options[key] = args.shift()
  }
  if (options.mode === undefined || options.target === undefined) throw new UsageError(usage)
  return options
}

const main = async () => {
  try {
    const options = parseArguments(process.argv.slice(2))
    assertCanonicalMutationContext(repositoryRoot)
    const result = await packCohort(options)
    process.stdout.write(jsonBytes(result))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = error instanceof UsageError ? 2 : 1
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
