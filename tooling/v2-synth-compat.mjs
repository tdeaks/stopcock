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
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CohortError,
  assertCanonicalMutationContext,
  checkPackedCohort,
  hashDirectoryTree,
  loadChangesetsRuntime,
  readCohortArtifactContext,
} from './v2-cohort.mjs'

const SYNTH_PACKAGE = '@stopcock/synth'
const REQUIRED_DIRECT_DEPENDENCIES = Object.freeze(['@stopcock/fp', '@stopcock/signal'])
const RUNTIME_DEPENDENCY_SECTIONS = Object.freeze([
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
])
const CONTRACT_ID = 'stopcock-v2-synth-packed-dependencies'
const CONTRACT_OBSERVATION = Object.freeze({
  schemaVersion: 1,
  contract: CONTRACT_ID,
  renderedFrames: 4,
  firstSample: 0.5,
  wavetableFrames: 1,
  wavetableSize: 32,
})

const CONTRACT_SOURCE = `import { pipe } from '@stopcock/fp'
import { constant, createWavetable, gain, render } from './synth/src/index.ts'

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message)
}

const graph = pipe(constant(2), gain(0.25))
const rendered = render(graph, { duration: 4 / 48_000, sampleRate: 48_000 })
assert(!Array.isArray(rendered), 'the bounded compatibility graph must render mono output')
assert(rendered instanceof Float32Array, 'the bounded compatibility graph must render Float32Array')
assert(rendered.length === 4, 'the bounded compatibility graph must render four frames')
for (const sample of rendered) {
  assert(Math.abs(sample - 0.5) <= 1e-6, 'the bounded compatibility graph output drifted')
}

const bank = createWavetable({ partials: [1, 0.5] }, { size: 32 })
assert(bank.kind === 'wavetable-bank', 'the packed Signal-backed wavetable kind drifted')
assert(bank.frameCount === 1, 'the packed Signal-backed wavetable frame count drifted')
assert(bank.size === 32, 'the packed Signal-backed wavetable size drifted')

console.log(
  JSON.stringify({
    schemaVersion: 1,
    contract: '${CONTRACT_ID}',
    renderedFrames: rendered.length,
    firstSample: rendered[0],
    wavetableFrames: bank.frameCount,
    wavetableSize: bank.size,
  }),
)
`

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const fail = (message) => {
  throw new CohortError(message)
}

const assert = (condition, message) => {
  if (!condition) fail(message)
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const compareStrings = (left, right) => left.localeCompare(right)

const toPosixPath = (path) => path.split(sep).join('/')

const jsonBytes = (value) => `${JSON.stringify(value, null, 2)}\n`

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

const fileIdentity = (path, label) => {
  assert(existsSync(path), `${label} is missing`)
  const metadata = lstatSync(path)
  assert(metadata.isFile() && !metadata.isSymbolicLink(), `${label} must be a regular file`)
  const bytes = readFileSync(path)
  return { sha256: sha256(bytes), bytes: bytes.length }
}

const readJson = (path, label) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const assertRealContainedPath = ({ root, path, terminal, label }) => {
  const resolvedRoot = resolve(root)
  const resolvedPath = resolve(path)
  const local = relative(resolvedRoot, resolvedPath)
  assert(
    local !== '' && local !== '..' && !local.startsWith(`..${sep}`) && !local.startsWith(sep),
    `${label} must be contained by ${resolvedRoot}`,
  )
  const rootMetadata = lstatSync(resolvedRoot)
  assert(
    rootMetadata.isDirectory() && !rootMetadata.isSymbolicLink(),
    `${resolvedRoot} must be a real directory`,
  )
  let current = resolvedRoot
  const parts = local.split(sep)
  for (const [index, part] of parts.entries()) {
    current = join(current, part)
    assert(existsSync(current), `${label} is missing: ${current}`)
    const metadata = lstatSync(current)
    assert(!metadata.isSymbolicLink(), `${label} cannot traverse a symbolic link: ${current}`)
    if (index === parts.length - 1) {
      assert(
        terminal === 'file' ? metadata.isFile() : metadata.isDirectory(),
        `${label} must be a ${terminal}`,
      )
    } else {
      assert(metadata.isDirectory(), `${label} parent must be a directory: ${current}`)
    }
  }
}

const copyRegularTree = (sourceRoot, destinationRoot, label) => {
  assert(existsSync(sourceRoot), `${label} is missing`)
  const sourceMetadata = lstatSync(sourceRoot)
  assert(
    sourceMetadata.isDirectory() && !sourceMetadata.isSymbolicLink(),
    `${label} must be a real directory`,
  )
  mkdirSync(destinationRoot, { recursive: true })

  const visit = (source, destination, local = '') => {
    for (const entry of readdirSync(source, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const sourcePath = join(source, entry.name)
      const destinationPath = join(destination, entry.name)
      const localPath = local === '' ? entry.name : join(local, entry.name)
      const metadata = lstatSync(sourcePath)
      assert(
        !metadata.isSymbolicLink(),
        `${label} contains a symbolic link: ${toPosixPath(localPath)}`,
      )
      if (metadata.isDirectory()) {
        mkdirSync(destinationPath)
        visit(sourcePath, destinationPath, localPath)
      } else {
        assert(metadata.isFile(), `${label} contains a non-file entry: ${toPosixPath(localPath)}`)
        writeFileSync(destinationPath, readFileSync(sourcePath))
      }
    }
  }

  visit(sourceRoot, destinationRoot)
}

const commandFailure = (result) => {
  if (result.error instanceof Error) return result.error.message
  if (typeof result.stderr === 'string' && result.stderr.trim() !== '') return result.stderr.trim()
  if (typeof result.stdout === 'string' && result.stdout.trim() !== '') return result.stdout.trim()
  return 'no output'
}

const runCommand = ({ command, args, cwd, env, label }) => {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 16 * 1024 * 1024,
  })
  assert(
    result.status === 0,
    `${label} failed (${result.status ?? 'signal'}): ${commandFailure(result)}`,
  )
  return result.stdout.trim()
}

export const defaultInstallPackedDependencies = async ({ directory }) => {
  const cacheDirectory = join(directory, '.bun-cache')
  const temporaryDirectory = join(directory, '.bun-tmp')
  mkdirSync(cacheDirectory)
  mkdirSync(temporaryDirectory)
  writeFileSync(join(directory, 'bunfig.toml'), '[install]\nregistry = "http://127.0.0.1:9"\n')
  runCommand({
    command: 'bun',
    args: [
      'install',
      '--production',
      '--no-save',
      '--no-cache',
      '--ignore-scripts',
      '--no-progress',
      '--no-summary',
      '--backend=copyfile',
      '--linker=hoisted',
      '--registry=http://127.0.0.1:9',
    ],
    cwd: directory,
    env: {
      BUN_INSTALL_CACHE_DIR: cacheDirectory,
      TMPDIR: temporaryDirectory,
    },
    label: 'packed Synth dependency install',
  })
}

export const defaultTypecheckSynth = async ({ directory, root }) => {
  const tscPath = join(root, 'node_modules', 'typescript', 'lib', 'tsc.js')
  fileIdentity(tscPath, 'the repository TypeScript compiler')
  runCommand({
    command: process.execPath,
    args: [tscPath, '-p', join(directory, 'tsconfig.json'), '--pretty', 'false'],
    cwd: directory,
    label: 'Synth source compatibility type-check',
  })
}

export const defaultRunSynthContract = async ({ directory }) => {
  const output = runCommand({
    command: 'bun',
    args: [join(directory, 'compatibility-contract.ts')],
    cwd: directory,
    label: 'Synth packed-dependency runtime contract',
  })
  let observation
  try {
    observation = JSON.parse(output)
  } catch (error) {
    fail(
      `Synth runtime contract returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  assert(
    JSON.stringify(observation) === JSON.stringify(CONTRACT_OBSERVATION),
    'Synth runtime contract observation does not match the bounded compatibility contract',
  )
  return observation
}

const synthDirectDependencies = (manifest, selectedPublicNames) => {
  const selected = new Set(selectedPublicNames)
  const dependencies = new Set()
  for (const section of RUNTIME_DEPENDENCY_SECTIONS) {
    const values = manifest[section]
    if (values === undefined) continue
    assert(isObject(values), `${SYNTH_PACKAGE} ${section} must be an object`)
    for (const [name, range] of Object.entries(values).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      assert(
        name.startsWith('@stopcock/'),
        `${SYNTH_PACKAGE} ${section}.${name} is not available from the packed cohort`,
      )
      assert(selected.has(name), `${SYNTH_PACKAGE} ${section} names non-cohort package ${name}`)
      assert(typeof range === 'string' && range.length > 0, `${section}.${name} must be a string`)
      dependencies.add(name)
    }
  }
  const direct = [...dependencies].sort(compareStrings)
  assert(
    JSON.stringify(direct) === JSON.stringify(REQUIRED_DIRECT_DEPENDENCIES),
    `${SYNTH_PACKAGE} packed compatibility requires exactly ${REQUIRED_DIRECT_DEPENDENCIES.join(
      ', ',
    )}; received ${direct.join(', ') || 'none'}`,
  )
  return direct
}

const dependencyClosure = (recordsByName, direct) => {
  const selected = new Set()
  const visit = (name) => {
    if (selected.has(name)) return
    const record = recordsByName.get(name)
    assert(record !== undefined, `packed cohort is missing Synth dependency ${name}`)
    selected.add(name)
    for (const dependency of record.internalDependencies) {
      if (dependency.section !== 'devDependencies') visit(dependency.name)
    }
  }
  direct.forEach(visit)
  return [...selected].sort(compareStrings)
}

const copyPackedTarballs = ({ manifestDirectory, recordsByName, names, directory }) => {
  const tarballsDirectory = join(directory, 'tarballs')
  mkdirSync(tarballsDirectory)
  const packages = []
  for (const name of names) {
    const record = recordsByName.get(name)
    assert(record !== undefined, `packed cohort is missing ${name}`)
    const source = join(manifestDirectory, record.tarball.path)
    assertRealContainedPath({
      root: manifestDirectory,
      path: source,
      terminal: 'file',
      label: `${name} packed tarball`,
    })
    assert(
      basename(source) === record.tarball.filename,
      `${name} packed tarball filename does not match`,
    )
    const bytes = readFileSync(source)
    assert(
      bytes.length === record.tarball.bytes && sha256(bytes) === record.tarball.sha256,
      `${name} packed tarball identity changed before Synth installation`,
    )
    const destination = join(tarballsDirectory, record.tarball.filename)
    writeFileSync(destination, bytes)
    assert(
      JSON.stringify(fileIdentity(destination, `${name} copied tarball`)) ===
        JSON.stringify({ sha256: record.tarball.sha256, bytes: record.tarball.bytes }),
      `${name} copied tarball identity does not match`,
    )
    packages.push({
      name,
      filename: record.tarball.filename,
      sha256: record.tarball.sha256,
    })
  }
  return packages
}

const assertInstalledPackages = ({ directory, recordsByName, names }) => {
  const nodeModules = join(directory, 'node_modules')
  const scopeDirectory = join(nodeModules, '@stopcock')
  assertRealContainedPath({
    root: directory,
    path: nodeModules,
    terminal: 'directory',
    label: 'the compatibility node_modules directory',
  })
  assertRealContainedPath({
    root: nodeModules,
    path: scopeDirectory,
    terminal: 'directory',
    label: 'the installed @stopcock scope',
  })
  const expectedDirectories = names
    .map((name) => name.slice('@stopcock/'.length))
    .sort(compareStrings)
  const actualDirectories = readdirSync(scopeDirectory, { withFileTypes: true })
    .map((entry) => {
      assert(
        entry.isDirectory() && !entry.isSymbolicLink(),
        `installed @stopcock/${entry.name} must be a real directory`,
      )
      return entry.name
    })
    .sort(compareStrings)
  assert(
    JSON.stringify(actualDirectories) === JSON.stringify(expectedDirectories),
    `installed @stopcock packages must be exactly ${expectedDirectories.join(', ')}`,
  )

  for (const name of names) {
    const record = recordsByName.get(name)
    const installedRoot = join(nodeModules, ...name.split('/'))
    assertRealContainedPath({
      root: nodeModules,
      path: installedRoot,
      terminal: 'directory',
      label: `${name} installed package`,
    })
    const installedManifest = join(installedRoot, 'package.json')
    assert(
      JSON.stringify(fileIdentity(installedManifest, `${name} installed manifest`)) ===
        JSON.stringify(record.packedManifest),
      `${name} installed manifest does not match the packed artifact`,
    )
    const value = readJson(installedManifest, `${name} installed manifest`)
    assert(value.name === name, `${name} installed manifest name does not match`)
    assert(value.version === record.version, `${name} installed manifest version does not match`)
    assert(value.private !== true, `${name} installed package must remain public`)
  }
}

const prepareCompatibilityDirectory = ({
  directory,
  synth,
  manifestDirectory,
  recordsByName,
  directDependencies,
  installedNames,
}) => {
  const installedPackages = copyPackedTarballs({
    manifestDirectory,
    recordsByName,
    names: installedNames,
    directory,
  })
  const dependencySpecifiers = Object.fromEntries(
    installedNames.map((name) => {
      const record = recordsByName.get(name)
      return [name, `file:./tarballs/${record.tarball.filename}`]
    }),
  )
  writeFileSync(
    join(directory, 'package.json'),
    jsonBytes({
      name: 'stopcock-v2-synth-compatibility',
      private: true,
      type: 'module',
      dependencies: dependencySpecifiers,
      overrides: dependencySpecifiers,
    }),
  )

  const copiedSource = join(directory, 'synth', 'src')
  copyRegularTree(join(synth.path, 'src'), copiedSource, `${SYNTH_PACKAGE} source`)
  const sourceIdentity = hashDirectoryTree(join(synth.path, 'src'), {
    label: `${SYNTH_PACKAGE} source`,
  })
  assert(
    JSON.stringify(hashDirectoryTree(copiedSource, { label: 'copied Synth source' })) ===
      JSON.stringify(sourceIdentity),
    'copied Synth source identity does not match the live private workspace',
  )

  writeFileSync(join(directory, 'compatibility-contract.ts'), CONTRACT_SOURCE)
  writeFileSync(
    join(directory, 'tsconfig.json'),
    jsonBytes({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        noImplicitAny: false,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        isolatedModules: true,
        verbatimModuleSyntax: true,
        esModuleInterop: true,
        allowImportingTsExtensions: true,
        noEmit: true,
      },
      include: ['synth/src/**/*.ts', 'compatibility-contract.ts'],
      exclude: ['synth/src/**/__tests__/**', 'synth/src/**/*.test.ts', 'synth/src/**/*.test-d.ts'],
    }),
  )

  return {
    directDependencies,
    installedPackages,
    sourceIdentity,
    synthManifest: fileIdentity(join(synth.path, 'package.json'), `${SYNTH_PACKAGE} manifest`),
    contractSource: {
      sha256: sha256(CONTRACT_SOURCE),
      bytes: Buffer.byteLength(CONTRACT_SOURCE),
    },
  }
}

export const runSynthCompatibility = async ({
  root = repositoryRoot,
  manifest,
  runtime = loadChangesetsRuntime(),
  temporaryRoot = tmpdir(),
  runInstall = defaultInstallPackedDependencies,
  runTypecheck = defaultTypecheckSynth,
  runContract = defaultRunSynthContract,
} = {}) => {
  assert(
    typeof manifest === 'string' && manifest.length > 0,
    'a packed cohort manifest is required',
  )
  const resolvedRoot = resolve(root)
  const initialCheck = await checkPackedCohort({
    root: resolvedRoot,
    manifest,
    runtime,
  })
  const manifestPath = resolve(resolvedRoot, manifest)
  const cohortManifest = readJson(manifestPath, 'the packed cohort manifest')
  assert(
    cohortManifest.privateCompatibility?.name === SYNTH_PACKAGE &&
      cohortManifest.privateCompatibility?.publication === 'excluded',
    `${SYNTH_PACKAGE} must remain excluded from publication`,
  )
  assert(
    !cohortManifest.packages.some((entry) => entry.name === SYNTH_PACKAGE),
    `${SYNTH_PACKAGE} must be absent from the packed public cohort`,
  )

  const context = await readCohortArtifactContext({
    root: resolvedRoot,
    target: cohortManifest.target,
    runtime,
  })
  assert(context.synth.name === SYNTH_PACKAGE, `private compatibility must be ${SYNTH_PACKAGE}`)
  assert(context.synth.directory === 'packages/synth', `${SYNTH_PACKAGE} workspace path drifted`)
  assert(context.synth.manifest.private === true, `${SYNTH_PACKAGE} must remain private`)
  assert(
    context.synth.manifest.version === cohortManifest.target,
    `${SYNTH_PACKAGE} must match packed cohort version ${cohortManifest.target}`,
  )

  const selectedPublicNames = cohortManifest.packages.map((entry) => entry.name)
  const recordsByName = new Map(cohortManifest.packages.map((entry) => [entry.name, entry]))
  const directDependencies = synthDirectDependencies(context.synth.manifest, selectedPublicNames)
  const installedNames = dependencyClosure(recordsByName, directDependencies)
  const manifestDirectory = dirname(manifestPath)
  const resolvedTemporaryRoot = resolve(temporaryRoot)
  assert(existsSync(resolvedTemporaryRoot), 'the compatibility temporary root is missing')
  const temporaryMetadata = lstatSync(resolvedTemporaryRoot)
  assert(
    temporaryMetadata.isDirectory() && !temporaryMetadata.isSymbolicLink(),
    'the compatibility temporary root must be a real directory',
  )
  const directory = mkdtempSync(join(resolvedTemporaryRoot, 'stopcock-v2-synth-compat-'))

  let prepared
  let observation
  try {
    prepared = prepareCompatibilityDirectory({
      directory,
      synth: context.synth,
      manifestDirectory,
      recordsByName,
      directDependencies,
      installedNames,
    })
    await runInstall({ directory, root: resolvedRoot })
    assertInstalledPackages({ directory, recordsByName, names: installedNames })
    await runTypecheck({ directory, root: resolvedRoot })
    observation = await runContract({ directory, root: resolvedRoot })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }

  assert(
    prepared !== undefined && observation !== undefined,
    'Synth compatibility did not complete',
  )
  const finalCheck = await checkPackedCohort({
    root: resolvedRoot,
    manifest,
    runtime,
  })
  assert(
    JSON.stringify(finalCheck) === JSON.stringify(initialCheck),
    'packed cohort identity changed during Synth compatibility',
  )
  assert(
    JSON.stringify(
      fileIdentity(join(context.synth.path, 'package.json'), `${SYNTH_PACKAGE} manifest`),
    ) === JSON.stringify(prepared.synthManifest),
    `${SYNTH_PACKAGE} manifest changed during compatibility`,
  )
  assert(
    JSON.stringify(
      hashDirectoryTree(join(context.synth.path, 'src'), { label: `${SYNTH_PACKAGE} source` }),
    ) === JSON.stringify(prepared.sourceIdentity),
    `${SYNTH_PACKAGE} source changed during compatibility`,
  )

  return {
    schemaVersion: 1,
    command: 'synth-compat',
    tool: {
      path: 'tooling/v2-synth-compat.mjs',
      ...fileIdentity(fileURLToPath(import.meta.url), 'the Synth compatibility runner'),
    },
    manifest: toPosixPath(relative(resolvedRoot, manifestPath)),
    target: cohortManifest.target,
    cohortContentHash: cohortManifest.cohortContentHash,
    synth: {
      name: SYNTH_PACKAGE,
      directory: context.synth.directory,
      version: context.synth.manifest.version,
      private: true,
      publication: 'excluded',
      manifest: prepared.synthManifest,
      source: prepared.sourceIdentity,
    },
    dependencies: {
      direct: prepared.directDependencies,
      installed: prepared.installedPackages,
    },
    contracts: [
      {
        id: 'synth-source-types',
        status: 'passed',
      },
      {
        id: CONTRACT_ID,
        status: 'passed',
        source: prepared.contractSource,
        observation,
      },
    ],
  }
}

class UsageError extends Error {}

const usage = 'usage: node tooling/v2-synth-compat.mjs --manifest <path>'

const parseArguments = (args) => {
  if (args.length !== 2 || args[0] !== '--manifest' || args[1].length === 0) {
    throw new UsageError(usage)
  }
  return { manifest: args[1] }
}

const main = async () => {
  try {
    const options = parseArguments(process.argv.slice(2))
    assertCanonicalMutationContext(repositoryRoot)
    const result = await runSynthCompatibility(options)
    process.stdout.write(jsonBytes(result))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = error instanceof UsageError ? 2 : 1
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
