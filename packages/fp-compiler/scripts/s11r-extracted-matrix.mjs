#!/usr/bin/env node
/*
 * S11R is deliberately a consumer-side gate.  In particular, it must never
 * turn into another convenient in-repository compiler test: the only
 * Stopcock bytes that reach a bundler are unpacked from the selected cohort.
 * Host tools may be resolved from this checkout's node_modules because they
 * are test tools, not part of the qualified Stopcock closure.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  lstatSync,
  existsSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, '..', '..')
// This require is deliberately rooted at the compiler package.  The root
// workspace does not necessarily expose the compiler's locked dependency
// graph (Bun's isolated install is an example), and resolving from it would
// silently qualify whatever happened to be hoisted in a developer checkout.
const COMPILER_REQUIRE = createRequire(join(PACKAGE_ROOT, 'package.json'))
const BENCHMARK_REQUIRE = createRequire(join(REPOSITORY_ROOT, 'benchmarks', 'package.json'))
const TRACE_MAPPING_REQUIRE = createRequire(
  COMPILER_REQUIRE.resolve('@babel/traverse/package.json'),
)
const TRACE_MAPPING_NAMESPACE = await import(
  pathToFileURL(TRACE_MAPPING_REQUIRE.resolve('@jridgewell/trace-mapping')).href
)
// createRequire can select this dependency's CommonJS condition. Node exposes
// that build under `default`, whereas native ESM exposes the named API.
const TRACE_MAPPING = TRACE_MAPPING_NAMESPACE.default ?? TRACE_MAPPING_NAMESPACE
const SHA256 = /^sha256:[a-f0-9]{64}$/u
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u
const MISSING_LOCKED_DEPENDENCY = 'STOPCOCK_MISSING_LOCKED_DEPENDENCY'
const S11R_PUBLIC_COHORT_COUNT = 21
const COMMON_CONSUMERS = Object.freeze([
  'compiler.collect.common',
  'compiler.reduce.common',
  'compiler.deep',
  'compiler.option-terminal',
])
const HOSTS = Object.freeze(['vite', 'rollup', 'esbuild', 'webpack', 'rspack'])
const STOPCOCK = Object.freeze(['@stopcock/fp', '@stopcock/fp-compiler', '@stopcock/fp-optimizer'])
const FORBIDDEN_ENGINE_MODULES = Object.freeze([
  '@stopcock/fp/dist/index.js',
  '@stopcock/fp/dist/compile',
  '@stopcock/fp/dist/fusion',
  '@stopcock/fp/dist/internal/compact-runtime',
  '@stopcock/fp/dist/internal/compact/plan',
  '@stopcock/fp/dist/internal/plan-',
  '@stopcock/fp/dist/plan',
  '@stopcock/fp-optimizer/',
])
const CONSTRUCTION_LEAF_MODULE =
  /^@stopcock\/fp\/dist\/(?:array(?:-[A-Za-z0-9_-]+)?|number-[A-Za-z0-9_-]+|option-[A-Za-z0-9_-]+|provenance-[A-Za-z0-9_-]+|result-[A-Za-z0-9_-]+|sort-kernel-[A-Za-z0-9_-]+)\.js$/u
const ENGINE_LOGIC_CONTENT =
  /(?:compact-runtime|fusion-engine|runner-bank|vetPipeline|compilePipeline|executePipeline|createStaticPlan|fusedPipe|fusedFlow|@stopcock\/fp-optimizer)/u
const MINIFIER_OPTIONS = Object.freeze({
  ecma: 2022,
  module: true,
  toplevel: true,
  mangle: Object.freeze({ toplevel: true }),
  compress: Object.freeze({ passes: 3 }),
  format: Object.freeze({ comments: false }),
})

const fail = (message) => {
  throw new Error(`S11R extracted matrix: ${message}`)
}
const assert = (condition, message) => {
  if (!condition) fail(message)
}
class MissingLockedDependencyError extends Error {
  constructor(dependencyName) {
    super(
      `S11R extracted matrix: locked compiler dependency ${dependencyName} cannot be resolved: no matching installed manifest`,
    )
    this.name = 'MissingLockedDependencyError'
    this.code = MISSING_LOCKED_DEPENDENCY
    this.dependencyName = dependencyName
  }
}
const isMissingLockedDependency = (error, dependencyName) =>
  error instanceof MissingLockedDependencyError &&
  error.code === MISSING_LOCKED_DEPENDENCY &&
  error.dependencyName === dependencyName
const stable = (value) => JSON.stringify(value, null, 2) + '\n'
const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const posix = (value) => value.replaceAll('\\', '/').split(sep).join('/')
const compare = (left, right) => left.localeCompare(right)
const hasControlCharacters = (value) =>
  value.includes('\0') || value.includes('\r') || value.includes('\n')
const text = (value) => {
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8')
  if (value !== null && value !== undefined) return JSON.stringify(value)
  return null
}
const fileIdentity = (path) => {
  const metadata = lstatSync(path)
  assert(metadata.isFile() && !metadata.isSymbolicLink(), `${path} must be a regular file`)
  const bytes = readFileSync(path)
  return { sha256: hash(bytes), bytes: bytes.length }
}
const canonicalPath = (root, path) => {
  const result = posix(relative(root, path))
  assert(
    result !== '' && !result.startsWith('../') && !result.includes('/../'),
    'path escapes qualification root',
  )
  return result
}
const remove = (path) => rmSync(path, { recursive: true, force: true })
const regularFilesUnder = (root) => {
  if (!existsSync(root)) return []
  const files = []
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort(compare)) {
      const path = join(directory, name)
      const info = lstatSync(path)
      if (info.isDirectory()) visit(path)
      else if (info.isFile() || info.isSymbolicLink()) files.push(path)
    }
  }
  visit(root)
  return files
}
const cleanNodeEnvironment = (extra = {}) => {
  const env = { ...process.env, ...extra }
  delete env.NODE_PATH
  delete env.NODE_OPTIONS
  return env
}
const parseJsonWithTrailingCommas = (source, label) => {
  // bun.lock is deterministic JSON-with-trailing-commas. Remove only commas
  // outside strings that are immediately followed by a closing token.
  let output = ''
  let quoted = false
  let escaped = false
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (quoted) {
      output += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"') {
      quoted = true
      output += character
      continue
    }
    if (character === ',') {
      let cursor = index + 1
      while (/\s/u.test(source[cursor] ?? '')) cursor++
      if (source[cursor] === '}' || source[cursor] === ']') continue
    }
    output += character
  }
  try {
    return JSON.parse(output)
  } catch (error) {
    fail(
      `${label} is not parseable deterministic JSONC: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

const cohortProjection = (manifest) => ({
  schemaVersion: manifest.schemaVersion,
  kind: manifest.kind,
  target: manifest.target,
  publicCount: manifest.publicCount,
  privateCompatibility: manifest.privateCompatibility,
  buildInputs: manifest.buildInputs,
  buildOrder: manifest.buildOrder,
  dependencyGraph: manifest.dependencyGraph,
  packages: manifest.packages,
})

/** Exported so a small unit test can pin the fail-closed manifest boundary. */
export const validateManifest = async (manifestPath) => {
  const absolute = resolve(manifestPath)
  const manifest = JSON.parse(readFileSync(absolute, 'utf8'))
  assert(
    manifest?.schemaVersion === 1 && manifest.kind === 'stopcock-v2-cohort',
    'not a v1 cohort manifest',
  )
  assert(
    typeof manifest.mode === 'string' && typeof manifest.target === 'string',
    'manifest mode/target missing',
  )
  assert(SHA256.test(manifest.cohortContentHash), 'invalid cohort content hash')
  assert(
    hash(Buffer.from(stable(cohortProjection(manifest)))) === manifest.cohortContentHash,
    'cohort content hash does not match canonical manifest projection',
  )
  const manifestDirectory = dirname(absolute)
  assert(
    resolve(manifestDirectory) ===
      resolve(dirname(manifestDirectory), manifest.cohortContentHash.slice(7)),
    'manifest is not in its content-addressed cohort directory',
  )
  assert(Array.isArray(manifest.packages), 'manifest packages missing')
  assert(
    manifest.publicCount === S11R_PUBLIC_COHORT_COUNT &&
      manifest.packages.length === S11R_PUBLIC_COHORT_COUNT,
    `S11R requires the complete ${S11R_PUBLIC_COHORT_COUNT}-package extracted cohort`,
  )
  const records = new Map(manifest.packages.map((entry) => [entry.name, entry]))
  for (const name of STOPCOCK) {
    const record = records.get(name)
    assert(record !== undefined, `selected cohort has no ${name}`)
    assert(record.version === manifest.target, `${name} version differs from target`)
    assert(record.tarball && SHA256.test(record.tarball.sha256), `${name} tarball hash missing`)
    assert(
      Number.isSafeInteger(record.tarball.bytes) && record.tarball.bytes > 0,
      `${name} tarball byte count invalid`,
    )
    const tarball = resolve(manifestDirectory, record.tarball.path)
    assert(
      canonicalPath(manifestDirectory, tarball) === record.tarball.path,
      `${name} tarball path is not canonical`,
    )
    const actual = fileIdentity(tarball)
    assert(
      actual.sha256 === record.tarball.sha256 && actual.bytes === record.tarball.bytes,
      `${name} tarball identity mismatch`,
    )
  }
  const { checkPackedCohort } = await import(
    pathToFileURL(join(REPOSITORY_ROOT, 'tooling', 'v2-cohort.mjs')).href
  )
  const checked = await checkPackedCohort({
    root: REPOSITORY_ROOT,
    manifest: absolute,
    verifyWorkspace: true,
  })
  assert(
    checked.publicCount === S11R_PUBLIC_COHORT_COUNT,
    'canonical packed-cohort check returned the wrong public package count',
  )
  return { manifest, manifestDirectory, records }
}

const extract = (tarball, destination) => {
  mkdirSync(destination, { recursive: true })
  const result = spawnSync('tar', ['-xzf', tarball, '-C', destination, '--strip-components=1'], {
    encoding: 'utf8',
  })
  assert(
    result.status === 0,
    `cannot extract ${tarball}: ${(result.stderr || result.stdout || '').trim()}`,
  )
}
const link = (target, destination) => {
  mkdirSync(dirname(destination), { recursive: true })
  remove(destination)
  symlinkSync(target, destination, 'dir')
}
const rootModule = (specifier) => {
  try {
    return dirname(COMPILER_REQUIRE.resolve(`${specifier}/package.json`))
  } catch {
    let cursor = dirname(COMPILER_REQUIRE.resolve(specifier))
    while (cursor !== dirname(cursor)) {
      if (existsSync(join(cursor, 'package.json'))) return cursor
      cursor = dirname(cursor)
    }
    fail(`cannot locate package root for host dependency ${specifier}`)
  }
}
const toolIdentity = (specifier, resolver = COMPILER_REQUIRE) => {
  let manifestPath
  try {
    manifestPath = resolver.resolve(`${specifier}/package.json`)
  } catch {
    const entry = resolver.resolve(specifier)
    let cursor = dirname(entry)
    while (cursor !== dirname(cursor) && !existsSync(join(cursor, 'package.json')))
      cursor = dirname(cursor)
    assert(
      existsSync(join(cursor, 'package.json')),
      `qualification tool ${specifier} has no package manifest`,
    )
    manifestPath = join(cursor, 'package.json')
  }
  const manifestBytes = readFileSync(manifestPath)
  const manifest = JSON.parse(manifestBytes)
  const entry = resolver.resolve(specifier)
  return {
    specifier,
    package: manifest.name,
    version: manifest.version,
    manifest: { sha256: hash(manifestBytes), bytes: manifestBytes.length },
    entry: fileIdentity(entry),
  }
}

const packageTarget = (parent, name) => join(parent, 'node_modules', ...name.split('/'))
const packageClosureIdentity = (root) => {
  const entries = []
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort(compare)) {
      const path = join(directory, name)
      const info = lstatSync(path)
      assert(!info.isSymbolicLink(), `copied compiler dependency closure retains symlink ${path}`)
      if (info.isDirectory()) visit(path)
      else if (info.isFile())
        entries.push({ path: canonicalPath(root, path), ...fileIdentity(path) })
      else fail(`copied compiler dependency closure contains non-file entry ${path}`)
    }
  }
  visit(root)
  return { sha256: hash(Buffer.from(stable(entries))), files: entries.length, entries }
}

/**
 * Locate the physical manifest selected from a specific dependency's require
 * context. Modern packages may deliberately hide `./package.json` behind
 * `exports`, so package-json resolution cannot be the only path. Resolving the
 * executable entry first preserves Node's version choice; searching that
 * entry's ancestors (then the same ordered node_modules search paths for
 * packages without a root entry) recovers only the matching package manifest.
 */
export const resolveLockedDependencyManifest = (name, parentRequire) => {
  assert(PACKAGE_NAME.test(name), `locked compiler dependency has invalid package name ${name}`)
  const readManifest = (candidate) => {
    const physical = realpathSync(candidate)
    const info = statSync(physical)
    assert(info.isFile(), `locked compiler dependency ${name} manifest is not a file`)
    let manifest
    try {
      manifest = JSON.parse(readFileSync(physical, 'utf8'))
    } catch (error) {
      fail(
        `locked compiler dependency ${name} has an invalid manifest at ${physical}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
    return { physical, manifest }
  }
  const expectedResolutionFailure = (error) => {
    const code =
      error !== null && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    return code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' || code === 'MODULE_NOT_FOUND'
  }
  const resolveOrAbsent = (specifier) => {
    try {
      return parentRequire.resolve(specifier)
    } catch (error) {
      if (expectedResolutionFailure(error)) return undefined
      fail(
        `locked compiler dependency ${name} resolution failed for ${specifier}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  const direct = resolveOrAbsent(`${name}/package.json`)
  if (direct !== undefined) {
    const selected = readManifest(direct)
    assert(
      selected.manifest.name === name,
      `resolved ${name} package manifest has unexpected name ${selected.manifest.name}`,
    )
    return selected.physical
  }

  const entry = resolveOrAbsent(name)
  if (entry !== undefined) {
    let cursor = dirname(realpathSync(entry))
    while (cursor !== dirname(cursor)) {
      const candidate = join(cursor, 'package.json')
      if (existsSync(candidate)) {
        const selected = readManifest(candidate)
        if (selected.manifest.name === name) return selected.physical
      }
      cursor = dirname(cursor)
    }
    fail(`resolved ${name} entry has no matching package manifest`)
  }

  for (const searchRoot of parentRequire.resolve.paths(name) ?? []) {
    const packageRoot = join(searchRoot, ...name.split('/'))
    if (!existsSync(packageRoot)) continue
    const manifestPath = join(packageRoot, 'package.json')
    assert(existsSync(manifestPath), `selected compiler dependency ${name} has no package manifest`)
    const selected = readManifest(manifestPath)
    assert(
      selected.manifest.name === name,
      `resolved ${name} package manifest has unexpected name ${selected.manifest.name}`,
    )
    return selected.physical
  }
  throw new MissingLockedDependencyError(name)
}

/**
 * Recreate the compiler's runtime closure under the extraction as real files.
 * The host bundlers remain workspace tooling, but an extracted compiler must
 * never load Babel/unplugin through a workspace symlink or parent lookup.
 */
export const copyCompilerDependencyClosure = (compilerRoot, cohortManifest) => {
  const lockfilePath = join(REPOSITORY_ROOT, 'bun.lock')
  const lockfileBytes = readFileSync(lockfilePath)
  const lockfileIdentity = fileIdentity(lockfilePath)
  const frozenLockfile = cohortManifest.buildInputs?.find((entry) => entry.path === 'bun.lock')
  assert(
    frozenLockfile?.sha256 === lockfileIdentity.sha256 &&
      frozenLockfile?.bytes === lockfileIdentity.bytes,
    'workspace dependency resolution lockfile differs from the packed cohort input',
  )
  const lockfile = parseJsonWithTrailingCommas(lockfileBytes.toString('utf8'), 'bun.lock')
  const lockedWorkspace = lockfile.workspaces?.['packages/fp-compiler']
  assert(
    lockedWorkspace?.name === '@stopcock/fp-compiler',
    'bun.lock has no fp-compiler workspace resolution',
  )
  const copied = new Map()
  const install = (name, parentRequire, destinationParent, ancestry = new Set()) => {
    let manifestPath
    try {
      manifestPath = resolveLockedDependencyManifest(name, parentRequire)
    } catch (error) {
      if (isMissingLockedDependency(error, name)) throw error
      fail(
        `locked compiler dependency ${name} failed integrity validation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
    const source = dirname(manifestPath)
    if (ancestry.has(source)) return
    const target = packageTarget(destinationParent, name)
    const identity = `${source}\0${target}`
    if (copied.has(identity)) return
    copied.set(identity, source)
    remove(target)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(source, target, {
      recursive: true,
      dereference: true,
      verbatimSymlinks: false,
      filter: (path) => {
        const nested = posix(relative(source, path))
        return nested === '' || (nested !== 'node_modules' && !nested.startsWith('node_modules/'))
      },
    })
    const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
    assert(
      manifest.name === name,
      `resolved ${name} package manifest has unexpected name ${manifest.name}`,
    )
    const nestedRequire = createRequire(join(source, 'package.json'))
    const descendants = new Set([...ancestry, source])
    const dependencies = Object.keys({
      ...(manifest.dependencies ?? {}),
      ...(manifest.optionalDependencies ?? {}),
    }).sort(compare)
    for (const dependency of dependencies) {
      try {
        install(dependency, nestedRequire, target, descendants)
      } catch (error) {
        // Optional native helpers can legitimately be absent on this host;
        // declared runtime dependencies cannot.
        const missingOptional =
          manifest.optionalDependencies &&
          dependency in manifest.optionalDependencies &&
          isMissingLockedDependency(error, dependency)
        if (!missingOptional) throw error
      }
    }
  }
  const compilerManifestBytes = readFileSync(join(compilerRoot, 'package.json'))
  const compilerManifest = JSON.parse(compilerManifestBytes)
  const workspaceManifestBytes = readFileSync(join(PACKAGE_ROOT, 'package.json'))
  const workspaceManifest = JSON.parse(workspaceManifestBytes)
  assert(
    JSON.stringify(compilerManifest.dependencies ?? {}) ===
      JSON.stringify(workspaceManifest.dependencies ?? {}) &&
      JSON.stringify(compilerManifest.dependencies ?? {}) ===
        JSON.stringify(lockedWorkspace.dependencies ?? {}),
    'packed compiler production dependencies differ from workspace manifest or bun.lock',
  )
  for (const dependency of Object.keys(compilerManifest.dependencies ?? {}).sort(compare)) {
    install(dependency, COMPILER_REQUIRE, compilerRoot)
  }
  const directResolutions = Object.keys(compilerManifest.dependencies ?? {})
    .sort(compare)
    .map((name) => {
      const manifestPath = resolveLockedDependencyManifest(name, COMPILER_REQUIRE)
      const installed = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const resolution = `${installed.name}@${installed.version}`
      assert(
        lockfile.packages?.[name]?.[0] === resolution,
        `direct compiler dependency ${name} does not match bun.lock resolution`,
      )
      return { name, requested: compilerManifest.dependencies[name], resolution }
    })
  const identity = packageClosureIdentity(join(compilerRoot, 'node_modules'))
  const packageRecords = new Map()
  for (const path of copied.values()) {
    const bytes = readFileSync(join(path, 'package.json'))
    const manifest = JSON.parse(bytes)
    const resolution = `${manifest.name}@${manifest.version}`
    const lockEntries = Object.entries(lockfile.packages ?? {})
      .filter(([, value]) => Array.isArray(value) && value[0] === resolution)
      .map(([key, value]) => ({ key, integrity: value[3] ?? null }))
      .sort((left, right) => compare(left.key, right.key))
    assert(
      lockEntries.length > 0,
      `${resolution} copied into compiler closure is absent from bun.lock`,
    )
    packageRecords.set(resolution, {
      name: manifest.name,
      version: manifest.version,
      manifestSha256: hash(bytes),
      lockEntries,
    })
  }
  return {
    sha256: identity.sha256,
    files: identity.files,
    packages: [...packageRecords.values()].sort((left, right) =>
      `${left.name}\0${left.version}`.localeCompare(`${right.name}\0${right.version}`),
    ),
    inputs: {
      lockfile: lockfileIdentity,
      packedManifest: { sha256: hash(compilerManifestBytes), bytes: compilerManifestBytes.length },
      workspaceManifest: {
        sha256: hash(workspaceManifestBytes),
        bytes: workspaceManifestBytes.length,
      },
      declaredDependencies: compilerManifest.dependencies ?? {},
      directResolutions,
    },
  }
}

const extractedTopology = ({ manifest, manifestDirectory, records, scratch }) => {
  const packages = new Map()
  for (const name of STOPCOCK) {
    const record = records.get(name)
    const destination = join(scratch, 'extracted', name.replace('@stopcock/', ''))
    extract(resolve(manifestDirectory, record.tarball.path), destination)
    const extractedPackage = JSON.parse(readFileSync(join(destination, 'package.json'), 'utf8'))
    assert(
      extractedPackage.name === name && extractedPackage.version === record.version,
      `${name} packed manifest mismatch`,
    )
    packages.set(name, destination)
  }
  const compilerDependencyClosure = copyCompilerDependencyClosure(
    packages.get('@stopcock/fp-compiler'),
    manifest,
  )
  // Node resolves a symlinked package from its real extraction path.  Model a
  // real peer installation beside the unpacked optimizer, never by falling
  // back through this workspace's FP package.
  link(
    packages.get('@stopcock/fp'),
    join(packages.get('@stopcock/fp-optimizer'), 'node_modules', '@stopcock', 'fp'),
  )
  const consumer = join(scratch, 'consumer')
  mkdirSync(consumer, { recursive: true })
  writeFileSync(
    join(consumer, 'package.json'),
    stable({ name: 'stopcock-s11r-extracted-consumer', private: true, type: 'module' }),
  )
  for (const name of STOPCOCK) link(packages.get(name), join(consumer, 'node_modules', name))
  // These links are tooling only.  The package roots above are verified tarball
  // extractions and all generated source imports resolve through them.
  for (const name of ['vite', 'rollup', 'esbuild', 'webpack'])
    link(rootModule(name), join(consumer, 'node_modules', name))
  link(rootModule('@rspack/core'), join(consumer, 'node_modules', '@rspack', 'core'))
  const compilerRoot = packages.get('@stopcock/fp-compiler')
  const compilerManifest = JSON.parse(readFileSync(join(compilerRoot, 'package.json'), 'utf8'))
  assert(
    compilerManifest.bin &&
      Object.keys(compilerManifest.bin).length === 1 &&
      compilerManifest.bin.stopcock === './dist/cli.js',
    'packed compiler must declare exactly bin.stopcock -> ./dist/cli.js',
  )
  const binTarget = resolve(compilerRoot, compilerManifest.bin.stopcock)
  assert(
    canonicalPath(compilerRoot, binTarget) === 'dist/cli.js',
    'packed bin.stopcock escapes compiler package',
  )
  const binInfo = lstatSync(binTarget)
  assert(
    binInfo.isFile() && !binInfo.isSymbolicLink(),
    'packed bin.stopcock target is not a regular file',
  )
  assert((binInfo.mode & 0o111) !== 0, 'packed bin.stopcock target is not executable')
  assert(
    readFileSync(binTarget, 'utf8').startsWith('#!/usr/bin/env node\n'),
    'packed bin.stopcock has no Node shebang',
  )
  const cliConsumer = join(scratch, 'cli-consumer')
  mkdirSync(cliConsumer, { recursive: true })
  writeFileSync(
    join(cliConsumer, 'package.json'),
    stable({ name: 'stopcock-s11r-cli-consumer', private: true, type: 'module' }),
  )
  link(compilerRoot, join(cliConsumer, 'node_modules', '@stopcock', 'fp-compiler'))
  const cliBin = join(cliConsumer, 'node_modules', '.bin', 'stopcock')
  mkdirSync(dirname(cliBin), { recursive: true })
  symlinkSync('../@stopcock/fp-compiler/dist/cli.js', cliBin)
  assert(
    realpathSync(cliBin) === realpathSync(binTarget),
    'consumer .bin/stopcock does not resolve to packed manifest target',
  )
  const dependencySmoke = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      [
        "const module = await import('@stopcock/fp-compiler')",
        'const plugin = module.stopcockFp',
        "for (const adapter of ['raw', 'vite', 'rollup', 'webpack', 'rspack', 'esbuild']) {",
        "  if (typeof plugin?.[adapter] !== 'function') throw new Error(`missing stopcockFp.${adapter}`)",
        '}',
        "process.stdout.write('ok')",
      ].join('\n'),
    ],
    { cwd: cliConsumer, encoding: 'utf8', env: cleanNodeEnvironment() },
  )
  const dependencySmokeDiagnostic = [
    dependencySmoke.error?.message,
    dependencySmoke.stderr,
    dependencySmoke.stdout,
    dependencySmoke.signal ? `signal ${dependencySmoke.signal}` : undefined,
    `status ${dependencySmoke.status ?? 'none'}`,
  ]
    .filter((value) => typeof value === 'string' && value.trim() !== '')
    .map((value) => value.trim())
    .join(' | ')
  assert(
    dependencySmoke.status === 0 && dependencySmoke.stdout === 'ok',
    `extracted compiler dependency closure cannot load without parent/NODE_PATH fallback: ${dependencySmokeDiagnostic}`,
  )
  const qualificationTools = [
    ...['vite', 'rollup', 'esbuild', 'webpack', '@rspack/core'].map((name) => toolIdentity(name)),
    toolIdentity('terser', BENCHMARK_REQUIRE),
    toolIdentity('rolldown', BENCHMARK_REQUIRE),
    toolIdentity('@jridgewell/trace-mapping', TRACE_MAPPING_REQUIRE),
  ].sort((left, right) => compare(left.specifier, right.specifier))
  return {
    consumer,
    packages,
    compilerDependencyClosure,
    qualificationTools,
    cliConsumer,
    cliBin,
    cliBinIdentity: {
      manifestTarget: compilerManifest.bin.stopcock,
      target: fileIdentity(binTarget),
    },
  }
}

const canonicalFixtures = () => {
  const selected = [...COMMON_CONSUMERS, 'helpers.two-unrelated']
  const program = `import { FP_CONSUMER_FIXTURES } from './benchmarks/src/bundle-size/fixtures.ts';
const selected = new Set(${JSON.stringify(selected)});
const rows = FP_CONSUMER_FIXTURES.filter((fixture) => selected.has(fixture.id)).map((fixture) => ({ id: fixture.id, entryKind: fixture.entryKind, sourceKind: fixture.sourceKind, source: fixture.source, expected: fixture.expected, applicability: fixture.applicability }));
process.stdout.write(JSON.stringify(rows));`
  const result = spawnSync('bun', ['-e', program], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  })
  assert(
    result.status === 0,
    `cannot project canonical benchmark fixtures: ${(result.stderr || result.stdout || '').trim()}`,
  )
  const rows = JSON.parse(result.stdout)
  assert(
    Array.isArray(rows) && rows.length === selected.length,
    'canonical benchmark fixture projection is incomplete',
  )
  const byId = new Map(rows.map((row) => [row.id, row]))
  for (const id of selected) {
    const row = byId.get(id)
    assert(
      row?.entryKind === 'single' &&
        row?.sourceKind === (id.startsWith('compiler.') ? 'compiler-transformed' : 'consumer'),
      `canonical fixture ${id} has unexpected identity`,
    )
    assert(
      row?.applicability?.status === 'active' && typeof row.source === 'string',
      `canonical fixture ${id} is not an active source fixture`,
    )
  }
  const projection = selected.map((id) => byId.get(id))
  return Object.freeze({
    common: byId,
    helpers: byId.get('helpers.two-unrelated'),
    corpus: {
      ids: [...selected],
      count: projection.length,
      sha256: hash(Buffer.from(stable(projection))),
    },
  })
}

const assertCompiled = (code, label) => {
  assert(/\bfor\s*\(/u.test(code), `${label} did not emit a lowered loop`)
}
const normalizeModule = (topology, id) => {
  const clean = posix(String(id))
    .replaceAll('\0', '')
    .replace(/^.*[|!]/u, '')
    .split('?')[0]
  let pathIdentity = clean
  if (clean.startsWith('file:')) {
    try {
      pathIdentity = posix(fileURLToPath(clean))
    } catch (error) {
      fail(
        `invalid file module identity ${clean}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
  const absolute = resolve(pathIdentity)
  const physicalAbsolute = existsSync(absolute) ? realpathSync(absolute) : absolute
  for (const name of STOPCOCK) {
    const marker = `/node_modules/${name}/`
    const offset = pathIdentity.indexOf(marker)
    if (offset !== -1) {
      const expectedRoot = realpathSync(topology.packages.get(name))
      assert(
        physicalAbsolute === expectedRoot || physicalAbsolute.startsWith(`${expectedRoot}${sep}`),
        `Stopcock module resolved outside selected extraction: ${clean}`,
      )
      return `${name}/${posix(relative(expectedRoot, physicalAbsolute))}`
    }
  }
  const consumerRoot = realpathSync(topology.consumer)
  if (physicalAbsolute === consumerRoot || physicalAbsolute.startsWith(`${consumerRoot}${sep}`)) {
    return `consumer/${posix(relative(consumerRoot, physicalAbsolute))}`
  }
  for (const [name, packageRoot] of topology.packages) {
    const physicalRoot = realpathSync(packageRoot)
    if (physicalAbsolute === physicalRoot || physicalAbsolute.startsWith(`${physicalRoot}${sep}`)) {
      return `${name}/${posix(relative(physicalRoot, physicalAbsolute))}`
    }
  }
  // An unresolved Stopcock-looking identifier is never benign: normalising it
  // would hide a compiler/FP escape from the graph evidence.  Likewise a
  // workspace path cannot be relabelled as an external host virtual module.
  assert(!/stopcock/iu.test(pathIdentity), `unknown Stopcock module identity ${clean}`)
  if (pathIdentity.startsWith('/') || /^[A-Za-z]:\//u.test(pathIdentity)) {
    const repositoryRoot = realpathSync(REPOSITORY_ROOT)
    assert(
      !physicalAbsolute.startsWith(`${repositoryRoot}${sep}`) &&
        physicalAbsolute !== repositoryRoot,
      `unknown module identity points into repository ${clean}`,
    )
  }
  // Preserve an unknown host virtual module without retaining a machine path
  // (or a scratch-directory-specific hash).  The basename is intentionally
  // bounded and Stopcock has already been rejected above.
  const label =
    basename(posix(pathIdentity))
      .replace(/[^A-Za-z0-9._-]/gu, '_')
      .slice(0, 96) || 'virtual'
  return `external/${label}`
}

export const canonicalGraph = (topology, moduleIds) =>
  [...new Set(moduleIds.map((id) => normalizeModule(topology, id)))].sort(compare)

export const validateConstructionLeafSource = (source, label = 'construction leaf') => {
  assert(!ENGINE_LOGIC_CONTENT.test(source), `${label} contains execution-engine logic`)
  assert(
    !/\b(?:pipe|flow|compile|compilePure|interpret|execute)\b/u.test(source),
    `${label} exposes composition/execution vocabulary`,
  )
  const imports = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/gu)].map((match) => match[1])
  assert(
    imports.every(
      (specifier) => !/(?:compact|fusion|plan|compile|interpret|optimizer)/u.test(specifier),
    ),
    `${label} imports an execution-engine module`,
  )
  return {
    imports: imports.sort(compare),
    sha256: hash(Buffer.from(source)),
    bytes: Buffer.byteLength(source),
  }
}

const assertCompiledGraph = (topology, moduleGraph, label) => {
  const forbidden = moduleGraph.filter((id) =>
    FORBIDDEN_ENGINE_MODULES.some((fragment) => id.includes(fragment)),
  )
  assert(
    forbidden.length === 0,
    `${label} retains runtime composition/execution modules: ${forbidden.join(', ')}`,
  )
  const unaudited = moduleGraph.filter(
    (id) => id.startsWith('@stopcock/fp/dist/') && !CONSTRUCTION_LEAF_MODULE.test(id),
  )
  assert(
    unaudited.length === 0,
    `${label} retains unaudited FP construction modules: ${unaudited.join(', ')}`,
  )
  const constructionLeaves = moduleGraph
    .filter((id) => CONSTRUCTION_LEAF_MODULE.test(id))
    .map((id) => {
      const path = join(topology.packages.get('@stopcock/fp'), id.slice('@stopcock/fp/'.length))
      const bytes = readFileSync(path)
      const source = bytes.toString('utf8')
      validateConstructionLeafSource(source, `${label} construction leaf ${id}`)
      return { id, sha256: hash(bytes), bytes: bytes.length }
    })
    .sort((left, right) => compare(left.id, right.id))
  return { constructionLeaves }
}

const parsedSourceMap = (map, label) => {
  const parsed = JSON.parse(map)
  assert(
    Array.isArray(parsed.sources) && parsed.sources.length > 0,
    `${label} source map has no sources`,
  )
  for (const source of parsed.sources) {
    assert(typeof source === 'string', `${label} source map has a non-string source`)
  }
  assert(
    typeof parsed.mappings === 'string' && parsed.mappings.length > 0,
    `${label} source map has no mappings`,
  )
  if (parsed.sourcesContent !== undefined) {
    assert(
      Array.isArray(parsed.sourcesContent) &&
        parsed.sourcesContent.length === parsed.sources.length &&
        parsed.sourcesContent.every((source) => source === null || typeof source === 'string'),
      `${label} source map has invalid sourcesContent`,
    )
  }
  return parsed
}

const virtualSourceMapId = (value, label) => {
  const portable = posix(value)
  const segments = portable.split('/')
  assert(
    !/stopcock/iu.test(portable) &&
      segments.every(
        (segment) =>
          segment !== '' &&
          segment !== '.' &&
          segment !== '..' &&
          /^[A-Za-z0-9 _().-]+$/u.test(segment),
      ),
    `${label} has an unsafe virtual source ${value}`,
  )
  assert(
    /^webpack\/(?:bootstrap|runtime(?:\/.*)?|before-startup|startup|after-startup)$/u.test(
      portable,
    ),
    `${label} has an unknown virtual source ${value}`,
  )
  return `virtual/${portable
    .split('/')
    .map((segment) => segment.replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 96) || 'virtual')
    .join('/')}`
}

const decodeSourceMapPath = (value, label) => {
  try {
    return decodeURIComponent(value)
  } catch (error) {
    fail(
      `${label} has an invalid encoded source path ${value}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

const scratchSourcePath = (topology, value, candidates, label) => {
  const portable = posix(value)
  const scratchName = basename(dirname(topology.consumer))
  assert(
    /^stopcock-s11r-extracted-[A-Za-z0-9_-]+$/u.test(scratchName),
    `${label} topology has an invalid scratch identity`,
  )
  const marker = `${scratchName}/`
  const offset = portable.lastIndexOf(marker)
  if (offset === -1 || (offset > 0 && portable[offset - 1] !== '/')) return null
  const suffix = portable.slice(offset + marker.length)
  const roots = [
    ['consumer/', topology.consumer],
    ...[...topology.packages].map(([name, root]) => [
      `extracted/${name.replace('@stopcock/', '')}/`,
      root,
    ]),
  ]
  const selected = roots.find(([prefix]) => suffix.startsWith(prefix))
  assert(selected !== undefined, `${label} scratch source is outside the selected topology: ${value}`)
  const relativeSource = suffix.slice(selected[0].length)
  const segments = relativeSource.split('/')
  assert(
    relativeSource.length > 0 &&
      segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    `${label} scratch source has an unsafe relative path: ${value}`,
  )
  const selectedPath = join(selected[1], ...segments)
  assert(
    existsSync(selectedPath) && statSync(selectedPath).isFile(),
    `${label} selected scratch source is not a regular file: ${value}`,
  )
  const selectedPhysicalPath = realpathSync(selectedPath)
  const matchingCandidate = candidates.find(
    (candidate) =>
      existsSync(candidate) &&
      statSync(candidate).isFile() &&
      realpathSync(candidate) === selectedPhysicalPath,
  )
  assert(
    matchingCandidate !== undefined,
    `${label} scratch spelling does not resolve to the selected physical source: ${value}`,
  )
  return selectedPath
}

const canonicalPhysicalSource = (topology, path, label, source) => {
  assert(existsSync(path), `${label} source does not exist: ${source}`)
  assert(statSync(path).isFile(), `${label} source is not a regular file: ${source}`)
  const canonical = normalizeModule(topology, path)
  assert(
    !canonical.startsWith('external/'),
    `${label} physical source escapes the selected topology: ${source}`,
  )
  return canonical
}

const canonicalPhysicalSourceCandidates = (topology, value, candidates, label) => {
  const selectedScratchPath = scratchSourcePath(topology, value, candidates, label)
  if (selectedScratchPath !== null) {
    return canonicalPhysicalSource(topology, selectedScratchPath, label, value)
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return canonicalPhysicalSource(topology, candidate, label, value)
  }
  fail(`${label} source does not exist in an allowed resolution base: ${value}`)
}

const canonicalSourceMapSource = ({
  source,
  sourceRoot,
  output,
  topology,
  label,
}) => {
  assert(!hasControlCharacters(source), `${label} has a source path containing control characters`)
  let rooted = source
  if (typeof sourceRoot === 'string' && sourceRoot.length > 0) {
    rooted = sourceRoot.endsWith('/') ? `${sourceRoot}${source}` : `${sourceRoot}/${source}`
  }
  if (rooted.startsWith('webpack://')) {
    const match = /^webpack:\/\/([^/]*)\/(.*)$/u.exec(rooted)
    assert(match !== null, `${label} has an invalid Webpack source ${rooted}`)
    const resource = decodeSourceMapPath(match[2], label)
    if (resource.startsWith('./') || resource.startsWith('../')) {
      return canonicalPhysicalSourceCandidates(
        topology,
        resource,
        [
          resolve(topology.consumer, resource),
          resolve(REPOSITORY_ROOT, resource),
          resolve(dirname(output), resource),
        ],
        label,
      )
    }
    return virtualSourceMapId(resource, label)
  }
  if (rooted.startsWith('file:')) {
    let path
    try {
      path = fileURLToPath(rooted)
    } catch (error) {
      fail(
        `${label} has an invalid file source ${rooted}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
    return canonicalPhysicalSource(topology, path, label, rooted)
  }
  const decoded = decodeSourceMapPath(rooted, label)
  assert(!hasControlCharacters(decoded), `${label} has a decoded path containing control characters`)
  const windowsAbsolute = /^[A-Za-z]:[\\/]/u.test(decoded)
  if (windowsAbsolute && process.platform !== 'win32') {
    fail(`${label} has an unresolvable Windows absolute source ${decoded}`)
  }
  if (decoded.startsWith('/') || windowsAbsolute) {
    return canonicalPhysicalSource(topology, decoded, label, decoded)
  }
  assert(
    !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(decoded),
    `${label} has an unsupported source-map scheme ${decoded}`,
  )
  const path = decoded.split(/[?#]/u, 1)[0]
  return canonicalPhysicalSourceCandidates(
    topology,
    decoded,
    [resolve(REPOSITORY_ROOT, path), resolve(dirname(output), path)],
    label,
  )
}

export const sanitizeSourceMap = (map, topology, output, label = 'source map') => {
  const parsed = parsedSourceMap(map, label)
  const sourceRoot = typeof parsed.sourceRoot === 'string' ? parsed.sourceRoot : ''
  assert(
    parsed.sourceRoot === undefined || typeof parsed.sourceRoot === 'string',
    `${label} source map has a non-string sourceRoot`,
  )
  assert(
    parsed.file === undefined || typeof parsed.file === 'string',
    `${label} source map has a non-string file`,
  )
  assert(
    Array.isArray(parsed.sourcesContent) &&
      parsed.sourcesContent.length === parsed.sources.length &&
      parsed.sourcesContent.every((source) => typeof source === 'string'),
    `${label} source map must embed every source`,
  )
  parsed.sources = parsed.sources.map((source) =>
    canonicalSourceMapSource({ source, sourceRoot, output, topology, label }),
  )
  parsed.sourceRoot = 'stopcock:///'
  parsed.file = basename(output)
  const sanitized = JSON.stringify(parsed)
  rawSourceMap(sanitized, label)
  return sanitized
}

const rawSourceMap = (map, label) => {
  const parsed = parsedSourceMap(map, label)
  const rawFields = [
    ...parsed.sources,
    ...(typeof parsed.sourceRoot === 'string' ? [parsed.sourceRoot] : []),
    ...(typeof parsed.file === 'string' ? [parsed.file] : []),
  ]
  for (const value of rawFields) {
    assert(typeof value === 'string', `${label} source map has a non-string path field`)
    const portable = posix(value)
    assert(
      !portable.startsWith('/') && !/^[A-Za-z]:\//u.test(portable),
      `${label} raw source map leaks absolute path ${value}`,
    )
    assert(
      !portable.includes(posix(REPOSITORY_ROOT)),
      `${label} raw source map leaks workspace path ${value}`,
    )
    assert(
      !/stopcock-s11r-extracted-[^/]+/u.test(portable),
      `${label} raw source map leaks scratch path ${value}`,
    )
  }
  return parsed
}

const normalizeSourceMap = (map, topology, label = 'source map') => {
  const parsed = rawSourceMap(map, label)
  parsed.sources = (parsed.sources ?? []).map((source) => {
    if (typeof source !== 'string') fail('source map contains a non-string source')
    const scratchConsumer = /(?:^|\/)stopcock-s11r-extracted-[^/]+\/consumer\/(.*)$/u.exec(
      posix(source),
    )
    if (scratchConsumer) return `consumer/${scratchConsumer[1]}`
    if (source.startsWith('webpack://')) {
      const marker = source.indexOf('/src/')
      return marker === -1 ? `virtual/${basename(source)}` : `consumer${source.slice(marker)}`
    }
    if (!source.startsWith('/') && !/^[A-Za-z]:[\\/]/u.test(source)) return posix(source)
    return normalizeModule(topology, source)
  })
  if (typeof parsed.sourceRoot === 'string' && parsed.sourceRoot.length > 0) {
    parsed.sourceRoot = parsed.sourceRoot.startsWith('/') ? 'consumer/' : posix(parsed.sourceRoot)
  }
  return JSON.stringify(parsed)
}

const codeIdentity = async (code, map, topology) => {
  const { minify } = await import(pathToFileURL(BENCHMARK_REQUIRE.resolve('terser')).href)
  const minified = await minify(code, structuredClone(MINIFIER_OPTIONS))
  assert(typeof minified.code === 'string' && minified.code.length > 0, 'Terser produced no code')
  const canonicalMap = map === null ? null : normalizeSourceMap(map, topology)
  return {
    code: hash(Buffer.from(code)),
    minifiedCode: hash(Buffer.from(minified.code)),
    sourceMap: canonicalMap === null ? null : hash(Buffer.from(canonicalMap)),
    gzipBytes: gzipSync(Buffer.from(minified.code), { level: 9 }).byteLength,
  }
}

const stopcockExport = (topology, source) => {
  const match = /^(@stopcock\/(?:fp|fp-optimizer|fp-compiler))(\/.*)?$/u.exec(source)
  if (!match) return null
  const root = topology.packages.get(match[1])
  if (!root) return null
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const key = match[2] === undefined ? '.' : `.${match[2]}`
  const target = manifest.exports?.[key]
  const path = typeof target === 'string' ? target : (target?.import ?? target?.default)
  assert(typeof path === 'string', `${source} is not exported by its extracted package`)
  return join(root, path)
}

const stopcockResolver = (topology) => ({
  name: 'stopcock-s11r-extracted-resolver',
  resolveId(source) {
    return stopcockExport(topology, source)
  },
})

export const emittedRollupModuleIds = (bundle, label = 'Rollup-family output') => {
  const ids = new Set()
  let chunkCount = 0
  for (const item of Object.values(bundle)) {
    if (item?.type !== 'chunk') continue
    chunkCount++
    assert(
      item.modules !== null && typeof item.modules === 'object',
      `${label} chunk has no rendered-module metadata`,
    )
    for (const [id, module] of Object.entries(item.modules)) {
      assert(
        Number.isSafeInteger(module?.renderedLength) && module.renderedLength >= 0,
        `${label} module ${id} has an invalid rendered length`,
      )
      if (module.renderedLength > 0) ids.add(id)
    }
  }
  assert(chunkCount > 0, `${label} emitted no JavaScript chunks`)
  assert(ids.size > 0, `${label} emitted no module contributors`)
  return [...ids]
}

export const emittedEsbuildModuleIds = (metafile, output, label = 'esbuild output') => {
  assert(
    metafile?.outputs !== null && typeof metafile?.outputs === 'object',
    `${label} has no output metadata`,
  )
  const physicalOutput = realpathSync(output)
  const matches = Object.entries(metafile.outputs).filter(([path]) => {
    const absolute = resolve(path)
    return existsSync(absolute) && realpathSync(absolute) === physicalOutput
  })
  assert(
    matches.length === 1,
    `${label} has ${matches.length} metadata records for ${basename(output)}`,
  )
  const inputs = matches[0][1]?.inputs
  assert(inputs !== null && typeof inputs === 'object', `${label} has no input contribution map`)
  const ids = []
  for (const [id, contribution] of Object.entries(inputs)) {
    assert(
      Number.isSafeInteger(contribution?.bytesInOutput) && contribution.bytesInOutput >= 0,
      `${label} input ${id} has an invalid emitted-byte contribution`,
    )
    if (contribution.bytesInOutput > 0) ids.push(id)
  }
  assert(ids.length > 0, `${label} has no emitted input contributors`)
  return ids
}

export const emittedWebpackModuleIds = (compilation, label = 'Webpack-family output') => {
  const chunks = compilation?.chunks
  const chunkGraph = compilation?.chunkGraph
  assert(chunks?.[Symbol.iterator] !== undefined, `${label} has no emitted chunk graph`)
  assert(
    typeof chunkGraph?.getChunkModulesIterableBySourceType === 'function',
    `${label} has no JavaScript chunk-module API`,
  )
  const ids = new Set()
  const visited = new Set()
  let chunkCount = 0
  let javascriptModuleCount = 0
  const visit = (module) => {
    assert(module !== null && typeof module === 'object', `${label} contains an invalid module`)
    if (visited.has(module)) return
    visited.add(module)
    if (module.modules !== undefined) {
      assert(
        module.modules?.[Symbol.iterator] !== undefined,
        `${label} aggregate module has non-iterable members`,
      )
      const members = [...module.modules]
      assert(members.length > 0, `${label} aggregate module has no members`)
      for (const member of members) visit(member)
      return
    }
    const id =
      typeof module.resource === 'string'
        ? module.resource
        : typeof module.identifier === 'function'
          ? module.identifier()
          : null
    assert(typeof id === 'string' && id.length > 0, `${label} module has no stable identity`)
    ids.add(id)
  }
  for (const chunk of chunks) {
    chunkCount++
    const modules = chunkGraph.getChunkModulesIterableBySourceType(chunk, 'javascript')
    assert(
      modules?.[Symbol.iterator] !== undefined,
      `${label} chunk has no JavaScript module iterable`,
    )
    for (const module of modules) {
      javascriptModuleCount++
      visit(module)
    }
  }
  assert(chunkCount > 0, `${label} emitted no chunks`)
  assert(
    javascriptModuleCount > 0 && ids.size > 0,
    `${label} emitted no JavaScript contributors`,
  )
  return [...ids]
}

const graphAuditPlugin = (ids) => ({
  name: 'stopcock-s11r-module-graph-audit',
  generateBundle(_options, bundle) {
    for (const id of emittedRollupModuleIds(bundle)) ids.add(id)
  },
})

const pluginOptions = (topology, receiptDirectory, strict = false, compilerOptions = {}) => ({
  ...compilerOptions,
  diagnostics: strict ? 'error' : 'summary',
  receipts: {
    dir: receiptDirectory,
    root: topology.consumer,
    // Populated once the extracted FP/optimizer identities have been loaded.
    // It is deliberately absent for an ordinary plugin invocation.
    ...(topology.artifactContext === undefined
      ? {}
      : { artifactContext: topology.artifactContext }),
  },
})
const executeEsm = async (file, expected, label) => {
  const loaded = await import(`${pathToFileURL(file).href}?s11r=${encodeURIComponent(label)}`)
  assert(JSON.stringify(loaded.result) === JSON.stringify(expected), `${label} oracle failed`)
}

export const webpackQualificationOutput = (path) => ({
  experiments: { outputModule: true },
  output: {
    path,
    filename: 'out.mjs',
    module: true,
    library: { type: 'module' },
    environment: {
      arrowFunction: true,
      const: true,
      destructuring: true,
      dynamicImport: true,
      module: true,
    },
  },
})

const adapter = (packages, host) =>
  pathToFileURL(join(packages.get('@stopcock/fp-compiler'), 'dist', `${host}.js`)).href
const writeExternalSourceMapOutput = (output, code, map) => {
  const withoutDirective = code.replace(/\n?\/\/[#@]\s*sourceMappingURL=.*?(?:\n|$)/gu, '\n')
  const mappedCode = `${withoutDirective.replace(/\s*$/u, '')}\n//# sourceMappingURL=${basename(output)}.map\n`
  const directives = [
    ...mappedCode.matchAll(
      /(?:\/\/[#@]\s*sourceMappingURL=([^\s]+)|\/\*[#@]\s*sourceMappingURL=([^\s*]+)\s*\*\/)/gu,
    ),
  ]
  assert(
    directives.length === 1 &&
      (directives[0][1] ?? directives[0][2]) === `${basename(output)}.map`,
    `${output} does not link exactly one colocated external source map`,
  )
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, mappedCode)
  writeFileSync(`${output}.map`, map)
  return mappedCode
}
const runRollup = async ({
  topology,
  entry,
  out,
  receipts,
  expected,
  strict = false,
  execute = true,
  compilerOptions = {},
}) => {
  const { rollup } = await import('rollup')
  const { stopcockFp } = await import(adapter(topology.packages, 'rollup'))
  const audited = new Set()
  const bundle = await rollup({
    input: entry,
    plugins: [
      stopcockResolver(topology),
      stopcockFp(pluginOptions(topology, receipts, strict, compilerOptions)),
      graphAuditPlugin(audited),
    ],
  })
  const generated = await bundle.generate({ format: 'es', sourcemap: true })
  await bundle.close()
  const chunk = generated.output.find((item) => item.type === 'chunk' && item.isEntry)
  assert(chunk, 'rollup did not emit an entry chunk')
  const mapAsset = generated.output.find(
    (item) => item.type === 'asset' && item.fileName.endsWith('.map'),
  )
  const rawMap = text(chunk.map) ?? text(mapAsset?.source)
  assert(rawMap !== null, 'rollup did not emit a source map')
  const output = join(out, 'out.mjs')
  const map = sanitizeSourceMap(rawMap, topology, output, 'rollup source map')
  const code = writeExternalSourceMapOutput(output, chunk.code, map)
  if (execute) await executeEsm(output, expected, 'rollup')
  return { code, map, moduleGraph: canonicalGraph(topology, [...audited]), outputPath: output }
}
const runEsbuild = async ({
  topology,
  entry,
  out,
  receipts,
  expected,
  strict = false,
  execute = true,
  compilerOptions = {},
}) => {
  const esbuild = await import('esbuild')
  const { stopcockFp } = await import(adapter(topology.packages, 'esbuild'))
  const output = join(out, 'out.mjs')
  mkdirSync(out, { recursive: true })
  const result = await esbuild.build({
    entryPoints: [entry],
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'node',
    sourcemap: 'external',
    metafile: true,
    plugins: [stopcockFp(pluginOptions(topology, receipts, strict, compilerOptions))],
  })
  const rawCode = readFileSync(output, 'utf8')
  const map = sanitizeSourceMap(
    readFileSync(`${output}.map`, 'utf8'),
    topology,
    output,
    'esbuild source map',
  )
  const code = writeExternalSourceMapOutput(output, rawCode, map)
  if (execute) await executeEsm(output, expected, 'esbuild')
  return {
    code,
    map,
    moduleGraph: canonicalGraph(
      topology,
      emittedEsbuildModuleIds(result.metafile, output, 'esbuild output'),
    ),
    outputPath: output,
  }
}

const compileWebpackLike = (compile, configuration, label) =>
  new Promise((resolveCompilation, reject) => {
    const compiler = compile(configuration)
    compiler.run((error, result) => {
      let failure = error ?? null
      let moduleIds
      if (failure === null) {
        try {
          assert(result !== undefined, `${label} returned no compilation`)
          if (result.hasErrors()) {
            failure = new Error(result.toString({ errorDetails: true }))
          } else {
            moduleIds = emittedWebpackModuleIds(result.compilation, label)
          }
        } catch (caught) {
          failure = caught
        }
      }
      compiler.close((closeError) => {
        if (failure !== null) return reject(failure)
        if (closeError) return reject(closeError)
        resolveCompilation({ moduleIds })
      })
    })
  })

const runWebpackLike = async ({
  topology,
  entry,
  out,
  receipts,
  expected,
  host,
  strict = false,
  execute = true,
  compilerOptions = {},
}) => {
  const library = host === 'webpack' ? await import('webpack') : await import('@rspack/core')
  const compile = host === 'webpack' ? library.default : library.rspack
  const { stopcockFp } = await import(adapter(topology.packages, host))
  mkdirSync(out, { recursive: true })
  const output = join(out, 'out.mjs')
  const compilation = await compileWebpackLike(
    compile,
    {
      mode: 'production',
      context: topology.consumer,
      entry,
      target: 'node',
      devtool: 'source-map',
      optimization: { minimize: false },
      ...webpackQualificationOutput(out),
      plugins: [stopcockFp(pluginOptions(topology, receipts, strict, compilerOptions))],
    },
    `${host} output`,
  )
  const rawCode = readFileSync(output, 'utf8')
  const map = sanitizeSourceMap(
    readFileSync(`${output}.map`, 'utf8'),
    topology,
    output,
    `${host} source map`,
  )
  const code = writeExternalSourceMapOutput(output, rawCode, map)
  if (execute) await executeEsm(output, expected, host)
  return {
    code,
    map,
    moduleGraph: canonicalGraph(topology, compilation.moduleIds),
    outputPath: output,
  }
}
const runVite = async ({
  topology,
  entry,
  out,
  receipts,
  expected,
  strict = false,
  execute = true,
  compilerOptions = {},
}) => {
  const { build } = await import('vite')
  const { stopcockFp } = await import(adapter(topology.packages, 'vite'))
  const audited = new Set()
  mkdirSync(out, { recursive: true })
  await build({
    root: topology.consumer,
    logLevel: 'silent',
    plugins: [
      stopcockFp(pluginOptions(topology, receipts, strict, compilerOptions)),
      graphAuditPlugin(audited),
    ],
    build: {
      sourcemap: true,
      minify: false,
      outDir: out,
      emptyOutDir: true,
      lib: { entry, formats: ['es'], fileName: () => 'out.mjs' },
    },
  })
  const output = join(out, 'out.mjs')
  const rawCode = readFileSync(output, 'utf8')
  const map = sanitizeSourceMap(
    readFileSync(`${output}.map`, 'utf8'),
    topology,
    output,
    'vite source map',
  )
  const code = writeExternalSourceMapOutput(output, rawCode, map)
  if (execute) await executeEsm(output, expected, 'vite')
  return { code, map, moduleGraph: canonicalGraph(topology, [...audited]), outputPath: output }
}
const runHost = async ({ host, ...input }) => {
  if (host === 'rollup') return runRollup(input)
  if (host === 'esbuild') return runEsbuild(input)
  if (host === 'vite') return runVite(input)
  return runWebpackLike({ ...input, host })
}

const receiptIdentity = (path, validateReceiptV1) => {
  const bytes = readFileSync(path)
  const parsed = JSON.parse(bytes)
  assert(Array.isArray(parsed), 'receipt file is not an array')
  for (const entry of parsed) {
    const validated = validateReceiptV1(entry)
    assert(
      validated.ok,
      `extracted receipt schema rejected a receipt: ${validated.errors?.join('; ')}`,
    )
    assert(
      typeof entry.sourcePath === 'string' && !entry.sourcePath.startsWith('/'),
      'receipt source path is not project-relative',
    )
    assert(
      !entry.sourcePath.includes('stopcock-s11r-extracted-'),
      'receipt source path contains a scratch identity',
    )
    assert(typeof entry.semanticManifestHash === 'string', 'receipt semantic binding missing')
    if (entry.disposition === 'transformed') {
      assert(typeof entry.loweringHash === 'string', 'transformed receipt lowering binding missing')
    } else {
      assert(entry.loweringHash === null, 'fallback/skipped receipt claims a lowering')
    }
  }
  const ids = parsed.map((entry) => entry.receiptId)
  assert(JSON.stringify(ids) === JSON.stringify([...ids].sort(compare)), 'receipts are not sorted')
  return { sha256: hash(bytes), bytes: bytes.length, count: parsed.length }
}
const recomputeReceiptArtifacts = ({
  compiler,
  entry,
  receiptPath,
  topology,
  compilerOptions = {},
}) => {
  const source = readFileSync(entry, 'utf8')
  const result = compiler.transformStopcockPipelines(source, entry, {
    ...compilerOptions,
    diagnostics: 'summary',
  })
  const codeHash = result.code === source ? null : hash(Buffer.from(result.code))
  const mapHash = result.map === null ? null : hash(Buffer.from(JSON.stringify(result.map)))
  const records = JSON.parse(readFileSync(receiptPath, 'utf8'))
  const expectedPath = canonicalPath(topology.consumer, entry)
  for (const record of records) {
    assert(
      record.sourcePath === expectedPath,
      `${expectedPath} receipt is bound to a different source path`,
    )
    assert(
      record.sourceHash === hash(Buffer.from(source)),
      `${expectedPath} receipt source hash does not match emitted source`,
    )
    if (topology.artifactContext !== undefined) {
      assert(
        JSON.stringify(record.artifactContext) === JSON.stringify(topology.artifactContext),
        `${expectedPath} receipt artifact context does not bind the extracted cohort`,
      )
    }
    if (record.disposition === 'transformed') {
      assert(
        record.emittedCodeHash === codeHash,
        `${expectedPath} receipt emittedCodeHash does not match direct extracted transform`,
      )
      assert(
        record.sourceMapHash === mapHash,
        `${expectedPath} receipt sourceMapHash does not match direct extracted transform`,
      )
    } else {
      assert(
        record.emittedCodeHash === null && record.sourceMapHash === null,
        `${expectedPath} non-transformed receipt claims emitted artifacts`,
      )
    }
  }
  return {
    sourceHash: hash(Buffer.from(source)),
    transformCodeHash: codeHash,
    transformSourceMapHash: mapHash,
    receiptIds: records.map((record) => record.receiptId).sort(compare),
  }
}
const runCommonMatrix = async (topology, root, validateReceiptV1, canonical, compiler) => {
  const rows = []
  for (const consumerName of COMMON_CONSUMERS) {
    const fixture = canonical.common.get(consumerName)
    assert(fixture !== undefined, `canonical fixture ${consumerName} disappeared`)
    const entry = join(topology.consumer, 'src', `${consumerName}.mjs`)
    mkdirSync(dirname(entry), { recursive: true })
    writeFileSync(entry, fixture.source)
    for (const host of HOSTS) {
      const rowRoot = join(root, 'rows', host, consumerName)
      const receipts = join(rowRoot, 'receipts')
      const output = await runHost({
        host,
        topology,
        entry,
        out: join(rowRoot, 'out'),
        receipts,
        expected: fixture.expected,
      })
      assertCompiled(output.code, `${host}/${consumerName}`)
      const graphContract = assertCompiledGraph(
        topology,
        output.moduleGraph,
        `${host}/${consumerName}`,
      )
      const sourceMapAudit = assertSourceMapEnvelope(
        output.map,
        topology,
        `${host}/${consumerName}`,
      )
      const identity = await codeIdentity(output.code, output.map, topology)
      assert(
        identity.gzipBytes <= 1024,
        `${host}/${consumerName} gzip ${identity.gzipBytes} exceeds 1024`,
      )
      const receipt = receiptIdentity(join(receipts, 'stopcock-receipts.json'), validateReceiptV1)
      assert(receipt.count === 1, `${host}/${consumerName} expected one transformed receipt`)
      const receiptBinding = recomputeReceiptArtifacts({
        compiler,
        entry,
        receiptPath: join(receipts, 'stopcock-receipts.json'),
        topology,
      })
      rows.push({
        host,
        consumer: consumerName,
        ...identity,
        sourceMapAudit,
        receipt,
        receiptBinding,
        graphContract,
        moduleGraph: output.moduleGraph,
      })
    }
  }
  return rows.sort((left, right) =>
    `${left.host}\0${left.consumer}`.localeCompare(`${right.host}\0${right.consumer}`),
  )
}

const assertSourceMapEnvelope = (map, topology, label) => {
  const raw = rawSourceMap(map, label)
  const canonical = normalizeSourceMap(map, topology, label)
  const parsed = JSON.parse(canonical)
  assert(
    Array.isArray(parsed.sources) && parsed.sources.length > 0,
    `${label} canonical source map has no sources`,
  )
  return {
    raw: {
      sha256: hash(Buffer.from(map)),
      sources: [...raw.sources],
      sourceRoot: raw.sourceRoot ?? null,
      file: raw.file ?? null,
    },
    canonical: { sha256: hash(Buffer.from(canonical)), sources: [...parsed.sources] },
  }
}

const originalPositionFor = (map, generatedLine, generatedColumn) => {
  const trace = new TRACE_MAPPING.TraceMap(map)
  const position = TRACE_MAPPING.originalPositionFor(trace, {
    line: generatedLine + 1,
    column: generatedColumn,
    bias: TRACE_MAPPING.GREATEST_LOWER_BOUND,
  })
  return position.source === null || position.line === null || position.column === null
    ? undefined
    : { source: position.source, line: position.line, column: position.column }
}

const assertMappedMarker = (code, map, marker, expected, label) => {
  const lines = code.split('\n')
  const line = lines.findIndex((value) => value.includes(marker))
  assert(line >= 0, `${label} output does not contain ${marker}`)
  const column = lines[line].indexOf(marker)
  const actual = originalPositionFor(map, line, column)
  assert(
    actual?.source?.endsWith(expected.source) &&
      actual?.line === expected.line &&
      actual?.column === expected.column,
    `${label} ${marker} maps to ${JSON.stringify(actual)} instead of ${JSON.stringify(expected)}`,
  )
  return { generatedLine: line + 1, generatedColumn: column, original: actual }
}

const assertExactSourceMap = (output, topology, testCase, label) => {
  const envelope = assertSourceMapEnvelope(output.map, topology, label)
  const map = JSON.parse(normalizeSourceMap(output.map, topology, label))
  return {
    envelope,
    throwSite: assertMappedMarker(output.code, map, testCase.marker, testCase.original, label),
  }
}

const SOURCE_MAP_CASES = Object.freeze([
  {
    id: 'callback',
    source: `import { pipe } from '@stopcock/fp'
import { map, filter } from '@stopcock/fp/array'
const boom = (value) => {
  if (value === 2) throw new Error('s11r callback boom')
  return value * 2
}
export const result = pipe([1, 2, 3], map(boom), filter((value) => value > 2))
`,
    marker: 'throw new Error',
    error: 's11r callback boom',
    original: { source: 'source-map-callback.mjs', line: 4, column: 19 },
    runtime: { line: 4, column: 26 },
  },
  {
    id: 'pipeline',
    source: `import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
const source = null
export const result = pipe(source, map((value) => value * 2))
`,
    marker: '_src.length',
    error: 'Cannot read properties of null',
    original: { source: 'source-map-pipeline.mjs', line: 4, column: 22 },
    runtime: { line: 4, column: 23 },
  },
])

const regexEscape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
const assertRuntimeMappedThrow = (output, topology, testCase, label) => {
  const result = spawnSync(process.execPath, ['--enable-source-maps', output], {
    cwd: topology.cliConsumer,
    encoding: 'utf8',
    env: cleanNodeEnvironment(),
  })
  assert(
    result.status !== 0 && result.stderr.includes(testCase.error),
    `${label} did not execute the expected throw`,
  )
  const source = basename(testCase.original.source)
  const match = new RegExp(`${regexEscape(source)}:${testCase.runtime.line}:(\\d+)`, 'u').exec(
    result.stderr,
  )
  assert(
    match !== null,
    `${label} runtime stack did not map to ${source}:${testCase.runtime.line}: ${result.stderr}`,
  )
  assert(
    Number(match[1]) === testCase.runtime.column,
    `${label} runtime stack column ${match[1]} differs from ${testCase.runtime.column}`,
  )
  assert(
    new RegExp(
      `stopcock:\\/{1,3}consumer/src/${regexEscape(source)}:${testCase.runtime.line}:`,
      'u',
    ).test(result.stderr),
    `${label} runtime stack does not use the canonical source identity: ${result.stderr}`,
  )
  assert(
    !/stopcock-s11r-extracted-[^/\s]+/u.test(result.stderr),
    `${label} runtime stack leaks its extracted scratch identity: ${result.stderr}`,
  )
  const materializationRoot = dirname(topology.consumer)
  const normalized = result.stderr
    .replaceAll(posix(materializationRoot), '<materialization>')
    .replaceAll(materializationRoot, '<materialization>')
  return {
    status: result.status,
    error: testCase.error,
    original: { source, line: testCase.runtime.line, column: Number(match[1]) },
    stack: hash(Buffer.from(normalized)),
  }
}

const runSourceMapMatrix = async (topology, root, validateReceiptV1, compiler) => {
  const rows = []
  for (const testCase of SOURCE_MAP_CASES) {
    const entry = join(topology.consumer, 'src', `source-map-${testCase.id}.mjs`)
    writeFileSync(entry, testCase.source)
    for (const host of HOSTS) {
      const rowRoot = join(root, 'source-maps', testCase.id, host)
      const out = join(rowRoot, 'out')
      const output = await runHost({
        host,
        topology,
        entry,
        out,
        receipts: join(rowRoot, 'receipts'),
        expected: undefined,
        execute: false,
      })
      const label = `${host}/source-map-${testCase.id}`
      assertCompiled(output.code, label)
      const graphContract = assertCompiledGraph(topology, output.moduleGraph, label)
      const receiptPath = join(rowRoot, 'receipts', 'stopcock-receipts.json')
      const receipt = receiptIdentity(receiptPath, validateReceiptV1)
      const receiptBinding = recomputeReceiptArtifacts({ compiler, entry, receiptPath, topology })
      rows.push({
        host,
        case: testCase.id,
        positions: assertExactSourceMap(output, topology, testCase, label),
        runtimeThrow: assertRuntimeMappedThrow(output.outputPath, topology, testCase, label),
        sourceMap: hash(Buffer.from(normalizeSourceMap(output.map, topology, label))),
        receipt,
        receiptBinding,
        graphContract,
      })
    }
  }
  return rows.sort((left, right) =>
    `${left.host}\0${left.case}`.localeCompare(`${right.host}\0${right.case}`),
  )
}

const OBSERVABLE_CONSTRUCTION_FIXTURE = `import { pipe } from '@stopcock/fp'
import { constructionTrace, filter, map, take } from './instrumented-construction.mjs'
export { constructionTrace }
export const result = pipe(
  [1, 2, 3, 4, 5, 6],
  filter((value) => value % 2 === 0),
  map((value) => value * 3),
  take(2),
)
`
const INSTRUMENTED_CONSTRUCTION_LEAF = `export const constructionTrace = []
const build = (name, value) => {
  constructionTrace.push('construct:' + name)
  return () => {
    constructionTrace.push('execute:' + name)
    throw new Error('instrumented construction leaf executed transformed pipeline: ' + name)
  }
}
export const filter = (callback) => build('filter', callback)
export const map = (callback) => build('map', callback)
export const take = (count) => build('take', count)
`
const OBSERVABLE_COMPILER_OPTIONS = Object.freeze({
  arrayImportSources: ['./instrumented-construction.mjs'],
})

const assertObservableEsm = async (output, label) => {
  const loaded = await import(
    `${pathToFileURL(output).href}?s11r-observable=${encodeURIComponent(label)}`
  )
  assert(
    JSON.stringify(loaded.result) === JSON.stringify([6, 12]),
    `${label} observable fixture result failed`,
  )
  assert(
    JSON.stringify(loaded.constructionTrace) ===
      JSON.stringify(['construct:filter', 'construct:map', 'construct:take']),
    `${label} construction factories were not evaluated exactly once in source order or an operator executed`,
  )
}
const runObservableConstructionMatrix = async (topology, root, validateReceiptV1, compiler) => {
  const entry = join(topology.consumer, 'src', 'observable-construction.mjs')
  writeFileSync(entry, OBSERVABLE_CONSTRUCTION_FIXTURE)
  writeFileSync(
    join(topology.consumer, 'src', 'instrumented-construction.mjs'),
    INSTRUMENTED_CONSTRUCTION_LEAF,
  )
  const rows = []
  for (const host of HOSTS) {
    const rowRoot = join(root, 'observable-construction', host)
    const receipts = join(rowRoot, 'receipts')
    const output = await runHost({
      host,
      topology,
      entry,
      out: join(rowRoot, 'out'),
      receipts,
      expected: undefined,
      execute: false,
      compilerOptions: OBSERVABLE_COMPILER_OPTIONS,
    })
    assertCompiled(output.code, `${host}/observable-construction`)
    const graphContract = assertCompiledGraph(
      topology,
      output.moduleGraph,
      `${host}/observable-construction`,
    )
    await assertObservableEsm(output.outputPath, `${host}/observable-construction`)
    const receiptPath = join(receipts, 'stopcock-receipts.json')
    const receipt = receiptIdentity(receiptPath, validateReceiptV1)
    assert(receipt.count === 1, `${host}/observable-construction expected one transformed receipt`)
    rows.push({
      host,
      sourceMapAudit: assertSourceMapEnvelope(
        output.map,
        topology,
        `${host}/observable-construction`,
      ),
      receipt,
      receiptBinding: recomputeReceiptArtifacts({
        compiler,
        entry,
        receiptPath,
        topology,
        compilerOptions: OBSERVABLE_COMPILER_OPTIONS,
      }),
      graphContract,
      moduleGraph: output.moduleGraph,
    })
  }
  return rows.sort((left, right) => compare(left.host, right.host))
}

const MIXED_GRAPH_EVIDENCE = Object.freeze({
  vite: 'emitted-bytes',
  rollup: 'emitted-bytes',
  esbuild: 'emitted-bytes',
  webpack: 'final-chunk-reachability',
  rspack: 'final-chunk-reachability',
})
const exactModule = (value) => Object.freeze({ match: 'exact', value })
const modulePrefix = (value) => Object.freeze({ match: 'prefix', value })
const SEQUENTIAL_TRACE = Object.freeze([
  'map:1',
  'map:2',
  'map:3',
  'some:2',
  'some:3',
])
const FUSED_TRACE = Object.freeze(['map:1', 'some:2', 'map:2', 'some:3'])
const MIXED_TIERS = Object.freeze([
  {
    id: 'sequential-root',
    supportSource: '@stopcock/fp/fusion',
    fallbackSource: '@stopcock/fp',
    fallbackExport: 'pipe',
    fallbackTier: 'sequential',
    expectedTrace: SEQUENTIAL_TRACE,
    requiredExecution: Object.freeze([exactModule('@stopcock/fp/dist/index.js')]),
    forbiddenExecution: Object.freeze([
      modulePrefix('@stopcock/fp/dist/compact-runtime-'),
      exactModule('@stopcock/fp/dist/compile.js'),
      modulePrefix('@stopcock/fp-optimizer/dist/'),
    ]),
    optionalFacades: Object.freeze([exactModule('@stopcock/fp/dist/fusion.js')]),
  },
  {
    id: 'compact-fusion',
    supportSource: '@stopcock/fp',
    fallbackSource: '@stopcock/fp/fusion',
    fallbackExport: 'pipe',
    fallbackTier: 'compact',
    expectedTrace: FUSED_TRACE,
    requiredExecution: Object.freeze([modulePrefix('@stopcock/fp/dist/compact-runtime-')]),
    forbiddenExecution: Object.freeze([
      exactModule('@stopcock/fp/dist/index.js'),
      exactModule('@stopcock/fp/dist/compile.js'),
      modulePrefix('@stopcock/fp-optimizer/dist/'),
    ]),
    optionalFacades: Object.freeze([exactModule('@stopcock/fp/dist/fusion.js')]),
  },
  {
    id: 'compact-compile',
    supportSource: '@stopcock/fp',
    fallbackSource: '@stopcock/fp/compile',
    fallbackExport: 'compile',
    fallbackTier: 'compact',
    expectedTrace: FUSED_TRACE,
    requiredExecution: Object.freeze([modulePrefix('@stopcock/fp/dist/compact-runtime-')]),
    forbiddenExecution: Object.freeze([
      exactModule('@stopcock/fp/dist/index.js'),
      modulePrefix('@stopcock/fp-optimizer/dist/'),
    ]),
    optionalFacades: Object.freeze([exactModule('@stopcock/fp/dist/compile.js')]),
  },
  {
    id: 'optimized',
    supportSource: '@stopcock/fp',
    fallbackSource: '@stopcock/fp-optimizer',
    fallbackExport: 'pipe',
    fallbackTier: 'optimized',
    expectedTrace: FUSED_TRACE,
    requiredExecution: Object.freeze([exactModule('@stopcock/fp-optimizer/dist/index.js')]),
    forbiddenExecution: Object.freeze([exactModule('@stopcock/fp/dist/index.js')]),
    optionalFacades: Object.freeze([]),
  },
])

const matchesModulePattern = (id, pattern) =>
  pattern.match === 'exact' ? id === pattern.value : id.startsWith(pattern.value)
const patternLabel = (pattern) =>
  pattern.match === 'exact' ? pattern.value : `${pattern.value}*.js`
const modulesMatching = (moduleGraph, patterns) =>
  moduleGraph.filter((id) => patterns.some((pattern) => matchesModulePattern(id, pattern)))
const mixedStrictDiagnostic = (tier) => ({
  site: tier.fallbackExport === 'compile' ? 'compile' : 'pipe',
  line: 11,
  reason:
    tier.fallbackExport === 'compile'
      ? 'spread arguments in flow()/compile() call'
      : 'spread arguments in pipe() call',
})

export const mixedTierGraphContractsForTest = () =>
  MIXED_TIERS.map((tier) => ({
    id: tier.id,
    requiredExecution: tier.requiredExecution.map(patternLabel),
    forbiddenExecution: tier.forbiddenExecution.map(patternLabel),
    optionalFacades: tier.optionalFacades.map(patternLabel),
    expectedTrace: [...tier.expectedTrace],
    strictDiagnostic: mixedStrictDiagnostic(tier),
  }))

export const assertMixedTierGraph = ({ host, moduleGraph, tier }) => {
  assert(HOSTS.includes(host), `unknown mixed-tier host ${host}`)
  assert(Array.isArray(moduleGraph), `${host}/${tier} module graph is not an array`)
  const contract = MIXED_TIERS.find((candidate) => candidate.id === tier)
  assert(contract !== undefined, `unknown mixed-tier contract ${tier}`)
  const requiredExecution = contract.requiredExecution.map((pattern) => {
    const matches = modulesMatching(moduleGraph, [pattern])
    assert(
      matches.length > 0,
      `${host}/${tier} pruned required execution engine ${patternLabel(pattern)}`,
    )
    return { pattern: patternLabel(pattern), modules: matches }
  })
  const observedForbidden = modulesMatching(moduleGraph, contract.forbiddenExecution)
  const evidence = MIXED_GRAPH_EVIDENCE[host]
  const enforcesNegativeExclusions = evidence === 'emitted-bytes'
  if (enforcesNegativeExclusions) {
    assert(
      observedForbidden.length === 0,
      `${host}/${tier} retained incompatible execution modules: ${observedForbidden.join(', ')}`,
    )
  }
  return {
    evidence,
    requiredExecution,
    optionalFacades: modulesMatching(moduleGraph, contract.optionalFacades),
    negativeExclusions: {
      enforced: enforcesNegativeExclusions,
      observedIncompatible: observedForbidden,
    },
  }
}

const mixedSource = (tier) => {
  const fallback =
    tier.fallbackExport === 'compile'
      ? 'fallbackCompile(...deferred)([1, 2, 3])'
      : 'fallbackPipe([1, 2, 3], ...deferred)'
  const fallbackImport =
    tier.fallbackExport === 'compile'
      ? `import { compile as fallbackCompile } from '${tier.fallbackSource}'`
      : `import { pipe as fallbackPipe } from '${tier.fallbackSource}'`
  return `import { pipe as compiledPipe } from '${tier.supportSource}'
${fallbackImport}
import { filter, map, some, take } from '@stopcock/fp/array'
const trace = [], deferred = [map((value) => { trace.push('map:' + value); return value + 1 }), some((value) => { trace.push('some:' + value); return value === 3 })]
const compiled = compiledPipe(
  [1, 2, 3, 4, 5, 6],
  filter((value) => value % 2 === 0),
  map((value) => value * 3),
  take(2),
)
const fallback = ${fallback}
export const result = [compiled, fallback, trace]
`
}

const mixedExpected = (tier) => [[6, 12], true, [...tier.expectedTrace]]

export const assertStrictDiagnostic = ({ message, topology, entry, site, line, reason }) => {
  assert(typeof message === 'string', 'strict build error is not text')
  assert(site === 'pipe' || site === 'compile', 'strict diagnostic site is invalid')
  assert(Number.isSafeInteger(line) && line > 0, 'strict diagnostic line is invalid')
  assert(
    typeof reason === 'string' && reason.length > 0 && !hasControlCharacters(reason),
    'strict diagnostic reason is invalid',
  )
  const marker = 'fp-compiler: skipped '
  const diagnostics = []
  for (const errorLine of message.split(/\r?\n/u)) {
    let offset = 0
    while (offset < errorLine.length) {
      const index = errorLine.indexOf(marker, offset)
      if (index === -1) break
      offset = index + marker.length
      if (index > 0 && !/\s/u.test(errorLine[index - 1])) continue
      const parsed =
        /^fp-compiler: skipped (pipe|compile)\(\) at (.+):([1-9][0-9]*): (.+)$/u.exec(
          errorLine.slice(index),
        )
      if (parsed !== null) {
        diagnostics.push({
          site: parsed[1],
          source: parsed[2],
          line: Number(parsed[3]),
          reason: parsed[4],
        })
      }
    }
  }
  assert(
    diagnostics.length === 1,
    `strict build emitted ${diagnostics.length} complete compiler diagnostics instead of one: ${message}`,
  )
  const diagnostic = diagnostics[0]
  assert(diagnostic.site === site, `strict diagnostic site ${diagnostic.site} differs from ${site}`)
  assert(diagnostic.line === line, `strict diagnostic line ${diagnostic.line} differs from ${line}`)
  assert(
    diagnostic.reason === reason,
    `strict diagnostic reason ${diagnostic.reason} differs from ${reason}`,
  )
  assert(
    isAbsolute(diagnostic.source) && !hasControlCharacters(diagnostic.source),
    `strict diagnostic source is not an absolute native path: ${diagnostic.source}`,
  )
  const expectedSource = canonicalPhysicalSource(
    topology,
    entry,
    'strict diagnostic expected source',
    entry,
  )
  const actualSource = canonicalPhysicalSource(
    topology,
    diagnostic.source,
    'strict diagnostic source',
    diagnostic.source,
  )
  assert(
    actualSource === expectedSource,
    `strict diagnostic source ${actualSource} differs from ${expectedSource}`,
  )
  return { site, source: actualSource, line, reason }
}

const strictHostRejects = async ({ host, topology, entry, rowRoot, tier }) => {
  const strictOut = join(rowRoot, 'strict-out')
  const strictReceipts = join(rowRoot, 'strict-receipts')
  remove(strictOut)
  remove(strictReceipts)
  const { site, line, reason } = mixedStrictDiagnostic(tier)
  try {
    await runHost({
      host,
      topology,
      entry,
      out: strictOut,
      receipts: strictReceipts,
      expected: undefined,
      strict: true,
      execute: false,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    assertStrictDiagnostic({ message, topology, entry, site, line, reason })
    assert(
      regularFilesUnder(strictOut).length === 0,
      `${host} strict rejection emitted build output`,
    )
    assert(
      regularFilesUnder(strictReceipts).length === 0,
      `${host} strict rejection emitted receipts`,
    )
    return { rejected: true, site, line, reason, outputFiles: 0, receiptFiles: 0 }
  }
  fail(`${host} strict build accepted an intentionally unsupported site`)
}

const runMixedRows = async (topology, root, validateReceiptV1, compiler) => {
  const rows = []
  for (const tier of MIXED_TIERS) {
    const entry = join(topology.consumer, 'src', `mixed-${tier.id}.mjs`)
    writeFileSync(entry, mixedSource(tier))
    for (const host of HOSTS) {
      const rowRoot = join(root, 'mixed', tier.id, host)
      const receipts = join(rowRoot, 'receipts')
      const output = await runHost({
        host,
        topology,
        entry,
        out: join(rowRoot, 'out'),
        receipts,
        expected: mixedExpected(tier),
      })
      const sourceMapAudit = assertSourceMapEnvelope(output.map, topology, `${host}/${tier.id}`)
      const graphContract = assertMixedTierGraph({
        host,
        moduleGraph: output.moduleGraph,
        tier: tier.id,
      })
      const receiptPath = join(receipts, 'stopcock-receipts.json')
      const receipt = receiptIdentity(receiptPath, validateReceiptV1)
      const receiptBinding = recomputeReceiptArtifacts({ compiler, entry, receiptPath, topology })
      const parsed = JSON.parse(readFileSync(receiptPath, 'utf8'))
      const transformed = parsed.filter((entry) => entry.disposition === 'transformed')
      const fallback = parsed.filter((entry) => entry.disposition === 'fallback')
      assert(parsed.length === 2, `${host}/${tier.id} did not discover both sites`)
      assert(transformed.length === 1, `${host}/${tier.id} transformed count mismatch`)
      assert(fallback.length === 1, `${host}/${tier.id} fallback count mismatch`)
      assert(
        fallback[0].fallbackTier === tier.fallbackTier &&
          fallback[0].sourceSpecifier === tier.fallbackSource,
        `${host}/${tier.id} fallback source/tier mismatch`,
      )
      assert(
        transformed[0].sourceSpecifier === tier.supportSource,
        `${host}/${tier.id} transformed source identity mismatch`,
      )
      const strict = await strictHostRejects({ host, topology, entry, rowRoot, tier })
      rows.push({
        host,
        tier: tier.id,
        receipt,
        receiptBinding,
        sourceMap: hash(
          Buffer.from(normalizeSourceMap(output.map, topology, `${host}/${tier.id}`)),
        ),
        sourceMapAudit,
        graphContract,
        moduleGraph: output.moduleGraph,
        coverage: { discovered: 2, transformed: 1, fallback: 1 },
        strict,
      })
    }
  }
  return rows.sort((left, right) =>
    `${left.host}\0${left.tier}`.localeCompare(`${right.host}\0${right.tier}`),
  )
}

const IMPORT_PRUNING_FIXTURE = `import { pipe, some } from '@stopcock/fp'
import { compile as fallbackCompile } from '@stopcock/fp/compile'
import { filter, map, take } from '@stopcock/fp/array'
const deferred = [map((value) => value + 1)]
const compiled = pipe(
  [1, 2, 3, 4, 5, 6],
  filter((value) => value % 2 === 0),
  map((value) => value * 3),
  take(2),
)
const fallback = fallbackCompile(...deferred)([1, 2, 3])
export const result = { compiled, fallback, sibling: some(7) }
`
const IMPORT_PRUNING_EXPECTED = Object.freeze({
  compiled: [6, 12],
  fallback: [2, 3, 4],
  sibling: { _tag: 1, value: 7 },
})
const harnessCorpusIdentity = () => {
  const entries = [
    ...MIXED_TIERS.map((tier) => ({
      id: `mixed.${tier.id}`,
      source: mixedSource(tier),
      expected: mixedExpected(tier),
      strict: {
        ...mixedStrictDiagnostic(tier),
      },
    })),
    ...SOURCE_MAP_CASES.map((testCase) => ({
      id: `source-map.${testCase.id}`,
      source: testCase.source,
      error: testCase.error,
      original: testCase.original,
      runtime: testCase.runtime,
    })),
    {
      id: 'observable-construction',
      source: OBSERVABLE_CONSTRUCTION_FIXTURE,
      constructionLeaf: INSTRUMENTED_CONSTRUCTION_LEAF,
      compilerOptions: OBSERVABLE_COMPILER_OPTIONS,
      expected: { result: [6, 12], trace: ['construct:filter', 'construct:map', 'construct:take'] },
    },
    { id: 'import-pruning', source: IMPORT_PRUNING_FIXTURE, expected: IMPORT_PRUNING_EXPECTED },
  ]
  return {
    ids: entries.map((entry) => entry.id),
    count: entries.length,
    sha256: hash(Buffer.from(stable(entries))),
  }
}
export const corpusIdentitiesForTest = () => ({
  canonical: canonicalFixtures().corpus,
  harness: harnessCorpusIdentity(),
})
const assertImportPruning = (compiler, entry) => {
  const source = readFileSync(entry, 'utf8')
  const result = compiler.transformStopcockPipelines(source, entry, { diagnostics: 'summary' })
  const rootImport = /import\s*\{([^}]*)\}\s*from\s*['"]@stopcock\/fp['"]/u.exec(result.code)
  assert(rootImport !== null, 'import-pruning transform removed needed @stopcock/fp sibling import')
  const names = rootImport[1].split(',').map((name) => name.trim().split(/\s+as\s+/u)[0])
  assert(
    names.includes('some') && !names.includes('pipe'),
    'import-pruning transform did not remove only the transformed pipe specifier',
  )
  assert(
    /import\s*\{\s*compile\s+as\s+fallbackCompile\s*\}\s*from\s*['"]@stopcock\/fp\/compile['"]/u.test(
      result.code,
    ),
    'import-pruning transform removed needed fallback import',
  )
  assert(
    result.diagnostics.filter((site) => site.transformed).length === 1,
    'import-pruning row transformed-site count mismatch',
  )
  assert(
    result.diagnostics.filter((site) => !site.transformed).length === 1,
    'import-pruning row fallback-site count mismatch',
  )
  return {
    source: hash(Buffer.from(source)),
    transformed: hash(Buffer.from(result.code)),
    retained: ['some', 'fallbackCompile'],
    removed: ['pipe'],
  }
}

export const assertImportPruningGraph = (moduleGraph, host) => {
  assert(HOSTS.includes(host), `import-pruning received unknown host ${host}`)
  const rootFacades = moduleGraph.filter(
    (id) => id === '@stopcock/fp/dist/index.js',
  )
  const siblingEngines = moduleGraph.filter((id) =>
    /^@stopcock\/fp\/dist\/option-[A-Za-z0-9_-]+\.js$/u.test(id),
  )
  const fallbackEngines = moduleGraph.filter(
    (id) => id === '@stopcock/fp/dist/compile.js',
  )
  assert(
    siblingEngines.length > 0,
    `${host}/import-pruning lost needed root sibling execution module`,
  )
  assert(
    fallbackEngines.length > 0,
    `${host}/import-pruning lost needed fallback module`,
  )
  const emittedByteHost = host === 'vite' || host === 'rollup' || host === 'esbuild'
  if (emittedByteHost) {
    assert(
      rootFacades.length === 0,
      `${host}/import-pruning retained the pruned root facade in emitted bytes`,
    )
  }
  assert(
    !moduleGraph.some((id) => id.startsWith('@stopcock/fp-optimizer/')),
    `${host}/import-pruning introduced optimizer runtime`,
  )
  return {
    siblingEngines,
    fallbackEngines,
    rootFacade: {
      observed: rootFacades,
      evidence: emittedByteHost ? 'emitted-bytes' : 'final-chunk-reachability',
    },
  }
}

const runImportPruningMatrix = async (topology, root, validateReceiptV1, compiler) => {
  const entry = join(topology.consumer, 'src', 'import-pruning.mjs')
  writeFileSync(entry, IMPORT_PRUNING_FIXTURE)
  const transform = assertImportPruning(compiler, entry)
  const rows = []
  for (const host of HOSTS) {
    const rowRoot = join(root, 'import-pruning', host)
    const receipts = join(rowRoot, 'receipts')
    const output = await runHost({
      host,
      topology,
      entry,
      out: join(rowRoot, 'out'),
      receipts,
      expected: IMPORT_PRUNING_EXPECTED,
    })
    assertCompiled(output.code, `${host}/import-pruning`)
    const graphContract = assertImportPruningGraph(output.moduleGraph, host)
    const receiptPath = join(receipts, 'stopcock-receipts.json')
    const receipt = receiptIdentity(receiptPath, validateReceiptV1)
    assert(receipt.count === 2, `${host}/import-pruning expected transformed and fallback receipts`)
    rows.push({
      host,
      transform,
      sourceMapAudit: assertSourceMapEnvelope(output.map, topology, `${host}/import-pruning`),
      receipt,
      receiptBinding: recomputeReceiptArtifacts({ compiler, entry, receiptPath, topology }),
      graphContract,
      moduleGraph: output.moduleGraph,
    })
  }
  return rows.sort((left, right) => compare(left.host, right.host))
}

// NODE_DEBUG=esm writes to the same stderr as the CLI's own explanation, and that
// explanation legitimately names semantic capability ids such as
// @stopcock/fp/array/map@1/exact. Judge the import closure by the specifiers Node
// recorded as loaded, never by the surrounding prose.
export const cliEsmClosureSpecifiers = (stderr) => {
  const specifiers = [
    ...new Set([...stderr.matchAll(/^ESM \d+: Storing (\S+) \(/gmu)].map((match) => match[1])),
  ].sort(compare)
  assert(specifiers.length > 0, 'NODE_DEBUG=esm did not expose a CLI import closure')
  for (const specifier of specifiers) {
    assert(
      !/@stopcock\/fp(?:\/|$)|@stopcock\/fp-optimizer|(?:^|[/\\])fusion(?:[./\\]|$)/iu.test(
        specifier,
      ),
      `packed CLI ESM closure imports FP/optimizer/fusion runtime: ${specifier}`,
    )
  }
  return specifiers
}

const runCli = (topology, qualificationRoot, receiptPaths) => {
  assert(receiptPaths.length > 0, 'packed CLI has no emitted receipt files to inspect')
  const invoke = (args, debugEsm = false) =>
    spawnSync('stopcock', args, {
      cwd: topology.cliConsumer,
      encoding: 'utf8',
      env: cleanNodeEnvironment({
        PATH: `${dirname(topology.cliBin)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
        ...(debugEsm ? { NODE_DEBUG: 'esm' } : {}),
      }),
    })
  const expectStatus = (result, status, label) => {
    assert(result.status === status, `${label} exit must be ${status}, received ${result.status}`)
    return result
  }

  const receiptPath = receiptPaths.find((path) =>
    JSON.parse(readFileSync(path, 'utf8')).every((record) => record.disposition === 'transformed'),
  )
  assert(
    receiptPath !== undefined,
    'packed CLI has no all-transformed receipt document for pass/tamper checks',
  )
  const passArgs = ['check', '--receipts', receiptPath, '--policy', 'unsupported', '--json']
  const pass = expectStatus(invoke(passArgs), 0, 'packed CLI pass')
  const passReplay = expectStatus(invoke(passArgs), 0, 'packed CLI pass replay')
  assert(pass.stdout === passReplay.stdout, 'packed stopcock check pass JSON is not deterministic')
  const parseSemanticReport = (stdout, label, expectedSites, expectedStatus = 'passed') => {
    const report = JSON.parse(stdout)
    assert(
      report?.tool === 'stopcock-check' && report?.status === expectedStatus,
      `${label} did not emit the expected ${expectedStatus} semantic report`,
    )
    assert(
      report?.summary?.sites === expectedSites && report?.summary?.transformed >= 0,
      `${label} report summary does not cover its receipt document`,
    )
    assert(
      Array.isArray(report?.policies) &&
        report.policies.length === 1 &&
        report.policies[0].status === expectedStatus,
      `${label} semantic policy report is incomplete`,
    )
    return report
  }
  parseSemanticReport(
    pass.stdout,
    'packed CLI pass',
    JSON.parse(readFileSync(receiptPath, 'utf8')).length,
  )
  const allReports = []
  for (const path of [...receiptPaths].sort(compare)) {
    const records = JSON.parse(readFileSync(path, 'utf8'))
    const expectedStatus = records.every((record) => record.disposition === 'transformed') ? 0 : 1
    const result = expectStatus(
      invoke(['check', '--receipts', path, '--policy', 'unsupported', '--json']),
      expectedStatus,
      `packed CLI semantic receipt ${canonicalPath(qualificationRoot, path)}`,
    )
    const reportStatus = expectedStatus === 0 ? 'passed' : 'failed'
    const report = parseSemanticReport(
      result.stdout,
      `packed CLI semantic receipt ${canonicalPath(qualificationRoot, path)}`,
      records.length,
      reportStatus,
    )
    allReports.push({
      receipt: canonicalPath(qualificationRoot, path),
      status: report.status,
      report: hash(Buffer.from(result.stdout)),
    })
  }
  const debug = expectStatus(invoke(passArgs, true), 0, 'packed CLI ESM import closure')
  const compilerRoot = topology.packages.get('@stopcock/fp-compiler')
  const closureSpecifiers = cliEsmClosureSpecifiers(debug.stderr)
  const closureModules = closureSpecifiers
    .filter((specifier) => specifier.startsWith('file://'))
    .map((specifier) => fileURLToPath(specifier))
    .sort(compare)
  assert(closureModules.length > 0, 'NODE_DEBUG=esm did not expose a CLI file module closure')
  for (const path of closureModules) {
    assert(
      path === compilerRoot || path.startsWith(`${compilerRoot}${sep}`),
      `packed CLI ESM closure escapes extracted compiler: ${path}`,
    )
  }
  const normalizedClosure = closureSpecifiers.map((specifier) =>
    specifier.startsWith('file://')
      ? `file://<compiler>/${canonicalPath(compilerRoot, fileURLToPath(specifier))}`
      : specifier,
  )

  const [receipt] = JSON.parse(readFileSync(receiptPath, 'utf8'))
  const duplicatePath = join(qualificationRoot, 'cli-duplicate.json')
  writeFileSync(duplicatePath, stable([receipt, receipt]))
  const forgedPath = join(qualificationRoot, 'cli-forged-core.json')
  writeFileSync(forgedPath, stable([{ ...receipt, sourceHash: `sha256:${'0'.repeat(64)}` }]))
  const invalidPath = join(qualificationRoot, 'cli-invalid.json')
  writeFileSync(invalidPath, stable([{ ...receipt, schemaVersion: 99 }]))
  const stalePath = join(qualificationRoot, 'cli-stale-expectations.json')
  writeFileSync(
    stalePath,
    stable({
      kind: 'stopcock.check-expectations',
      schemaVersion: 1,
      compilerHash: receipt.compilerHash,
      configHash: receipt.configHash,
      semanticManifestHash: receipt.semanticManifestHash,
      sites: [
        {
          receiptId: receipt.receiptId,
          sourceHash: `sha256:${'0'.repeat(64)}`,
          emittedCodeHash: receipt.emittedCodeHash,
        },
      ],
    }),
  )

  const duplicate = expectStatus(
    invoke(['check', '--receipts', duplicatePath, '--policy', 'unsupported', '--json']),
    2,
    'packed CLI duplicate receipt',
  )
  const forged = expectStatus(
    invoke(['check', '--receipts', forgedPath, '--policy', 'unsupported', '--json']),
    2,
    'packed CLI forged receipt core',
  )
  const invalid = expectStatus(
    invoke(['check', '--receipts', invalidPath, '--policy', 'unsupported', '--json']),
    2,
    'packed CLI invalid receipt',
  )
  const missing = expectStatus(
    invoke([
      'check',
      '--receipts',
      join(qualificationRoot, 'cli-missing.json'),
      '--policy',
      'unsupported',
      '--json',
    ]),
    2,
    'packed CLI missing receipt',
  )
  const staleArgs = [
    'check',
    '--receipts',
    receiptPath,
    '--expectations',
    stalePath,
    '--policy',
    'stale-evidence',
    '--json',
  ]
  const stale = expectStatus(invoke(staleArgs), 1, 'packed CLI stale expectations')
  const staleReplay = expectStatus(invoke(staleArgs), 1, 'packed CLI stale replay')
  assert(
    stale.stdout === staleReplay.stdout,
    'packed stopcock check stale JSON is not deterministic',
  )
  JSON.parse(stale.stdout)

  return {
    pass: { status: pass.status, json: hash(Buffer.from(pass.stdout)) },
    duplicate: { status: duplicate.status },
    forgedCore: { status: forged.status },
    invalid: { status: invalid.status },
    missing: { status: missing.status },
    stale: { status: stale.status, json: hash(Buffer.from(stale.stdout)) },
    semanticReports: allReports,
    esmClosure: {
      specifiers: normalizedClosure,
      digest: hash(Buffer.from(stable(normalizedClosure))),
      modules: closureModules.map((path) => canonicalPath(compilerRoot, path)),
      fpRuntimeExcluded: true,
    },
    executable: topology.cliBinIdentity,
  }
}

const compatibilityFailures = (topology) => {
  const fp = topology.packages.get('@stopcock/fp')
  const optimizer = topology.packages.get('@stopcock/fp-optimizer')
  return Promise.all([
    import(pathToFileURL(join(fp, 'dist', 'abi.js')).href),
    import(pathToFileURL(join(optimizer, 'dist', 'index.js')).href),
  ]).then(([abi, optimizerApi]) => {
    const vetted = abi.vetPipeline([])
    const base = {
      fpIdentity: abi.OPTIMIZER_ABI_IDENTITY,
      fpInstanceToken: vetted.instanceToken,
      optimizerBank: optimizerApi.bankIdentity,
      requestedMode: 'exact',
      planMode: 'exact',
      layout: 'dense-array',
      fullyTrusted: true,
      shape: { codes: [], segments: [], bindingCount: 0 },
    }
    assert(
      optimizerApi.evaluateCompatibility(base).eligible,
      'matching extracted ABI is unexpectedly ineligible',
    )
    const mutations = {
      instance: { fpInstanceToken: {} },
      abi: { fpIdentity: { ...base.fpIdentity, abiVersion: base.fpIdentity.abiVersion + 1 } },
      protocol: {
        fpIdentity: { ...base.fpIdentity, protocolVersion: base.fpIdentity.protocolVersion + 1 },
      },
      semantic: {
        fpIdentity: { ...base.fpIdentity, semanticManifestHash: 'sha256:' + '0'.repeat(64) },
      },
      bank: { optimizerBank: { ...base.optimizerBank, bankHash: 'sha256:' + '0'.repeat(64) } },
      mode: { requestedMode: 'pure' },
      layout: { layout: 'foreign-layout' },
    }
    const failures = Object.entries(mutations).map(([kind, override]) => {
      const result = optimizerApi.evaluateCompatibility({ ...base, ...override })
      assert(!result.eligible, `${kind} mismatch remained optimizer-eligible`)
      return { kind, reason: result.reason }
    })
    return failures.sort((left, right) => compare(left.kind, right.kind))
  })
}

const assertNoHelperEngine = (graph, label) => {
  const forbidden = graph.filter((id) =>
    FORBIDDEN_ENGINE_MODULES.some((fragment) => id.includes(fragment)),
  )
  assert(
    forbidden.length === 0,
    `${label} helper graph retains an execution engine: ${forbidden.join(', ')}`,
  )
}

const runPlainRollupLike = async ({ topology, entry, out, host, helper }) => {
  const library =
    host === 'rollup'
      ? await import('rollup')
      : await import(pathToFileURL(BENCHMARK_REQUIRE.resolve('rolldown')).href)
  const makeBundle = host === 'rollup' ? library.rollup : library.rolldown
  const audited = new Set()
  const bundle = await makeBundle({
    input: entry,
    plugins: [stopcockResolver(topology), graphAuditPlugin(audited)],
  })
  const generated = await bundle.generate({ format: 'es' })
  await bundle.close()
  const chunk = generated.output.find((item) => item.type === 'chunk' && item.isEntry)
  assert(chunk, `${host} did not emit helpers.two-unrelated`)
  mkdirSync(out, { recursive: true })
  const output = join(out, 'out.mjs')
  writeFileSync(output, chunk.code)
  await executeEsm(output, helper.expected, `${host}/helpers.two-unrelated`)
  return { code: chunk.code, moduleGraph: canonicalGraph(topology, [...audited]) }
}

const runPlainEsbuild = async ({ topology, entry, out, helper }) => {
  const esbuild = await import('esbuild')
  mkdirSync(out, { recursive: true })
  const output = join(out, 'out.mjs')
  const result = await esbuild.build({
    entryPoints: [entry],
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'node',
    metafile: true,
  })
  const code = readFileSync(output, 'utf8')
  await executeEsm(output, helper.expected, 'esbuild/helpers.two-unrelated')
  return {
    code,
    moduleGraph: canonicalGraph(
      topology,
      emittedEsbuildModuleIds(result.metafile, output, 'esbuild helper output'),
    ),
  }
}

const runPlainWebpack = async ({ topology, entry, out, helper }) => {
  const { default: webpack } = await import('webpack')
  mkdirSync(out, { recursive: true })
  const compilation = await compileWebpackLike(
    webpack,
    {
      mode: 'production',
      context: topology.consumer,
      entry,
      target: 'node',
      optimization: { minimize: false },
      ...webpackQualificationOutput(out),
    },
    'webpack helper output',
  )
  const output = join(out, 'out.mjs')
  const code = readFileSync(output, 'utf8')
  await executeEsm(output, helper.expected, 'webpack/helpers.two-unrelated')
  return { code, moduleGraph: canonicalGraph(topology, compilation.moduleIds) }
}

const runHelpersMatrix = async (topology, root, canonical) => {
  const helper = canonical.helpers
  assert(helper !== undefined, 'canonical helpers.two-unrelated fixture disappeared')
  const entry = join(topology.consumer, 'src', 'helpers.two-unrelated.mjs')
  writeFileSync(entry, helper.source)
  const rows = []
  for (const host of ['esbuild', 'rollup', 'webpack', 'rolldown']) {
    const out = join(root, 'helpers', host)
    const output =
      host === 'esbuild'
        ? await runPlainEsbuild({ topology, entry, out, helper })
        : host === 'webpack'
          ? await runPlainWebpack({ topology, entry, out, helper })
          : await runPlainRollupLike({ topology, entry, out, host, helper })
    assertNoHelperEngine(output.moduleGraph, `${host}/helpers.two-unrelated`)
    const identity = await codeIdentity(output.code, null, topology)
    assert(
      identity.gzipBytes <= 512,
      `${host}/helpers.two-unrelated gzip ${identity.gzipBytes} exceeds 512`,
    )
    rows.push({ host, ...identity, moduleGraph: output.moduleGraph })
  }
  return rows.sort((left, right) => compare(left.host, right.host))
}

const collectedReceiptPaths = (root) => {
  const paths = []
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort(compare)) {
      const path = join(directory, name)
      const info = statSync(path)
      if (info.isDirectory()) visit(path)
      else if (info.isFile() && name === 'stopcock-receipts.json') paths.push(path)
    }
  }
  visit(root)
  return paths.sort(compare)
}

const buildMaterialization = async ({ manifest, manifestDirectory, records, scratch }) => {
  const topology = extractedTopology({ manifest, manifestDirectory, records, scratch })
  const qualificationRoot = join(scratch, 'qualification')
  mkdirSync(join(topology.consumer, 'src'), { recursive: true })
  const receiptSchema = await import(
    pathToFileURL(
      join(topology.packages.get('@stopcock/fp-compiler'), 'dist', 'receipt-schema.generated.js'),
    ).href
  )
  assert(
    typeof receiptSchema.validateReceiptV1 === 'function',
    'extracted receipt validator is absent',
  )
  const compilerProtocol = await import(
    pathToFileURL(join(topology.packages.get('@stopcock/fp-compiler'), 'dist', 'index.js')).href
  )
  assert(
    typeof compilerProtocol.transformStopcockPipelines === 'function',
    'extracted compiler transform is absent',
  )
  assert(
    SHA256.test(compilerProtocol.OPERATOR_MANIFEST_V1_HASH),
    'extracted compiler full operator-manifest identity is absent',
  )
  assert(
    SHA256.test(compilerProtocol.OPERATOR_SEMANTIC_FACTS_V1_HASH),
    'extracted compiler semantic-facts identity is absent',
  )
  assert(
    compilerProtocol.OPERATOR_MANIFEST_V1_HASH !== compilerProtocol.OPERATOR_SEMANTIC_FACTS_V1_HASH,
    'compiler full manifest and semantic-facts identities are accidentally conflated',
  )
  const fpAbi = await import(
    pathToFileURL(join(topology.packages.get('@stopcock/fp'), 'dist', 'abi.js')).href
  )
  const optimizer = await import(
    pathToFileURL(join(topology.packages.get('@stopcock/fp-optimizer'), 'dist', 'index.js')).href
  )
  assert(
    fpAbi.OPTIMIZER_ABI_IDENTITY && typeof optimizer.bankIdentity?.bankHash === 'string',
    'extracted ABI identities are absent',
  )
  topology.artifactContext = Object.freeze({
    fpArtifactHash: records.get('@stopcock/fp').tarball.sha256,
    compilerArtifactHash: records.get('@stopcock/fp-compiler').tarball.sha256,
    optimizerArtifactHash: records.get('@stopcock/fp-optimizer').tarball.sha256,
    fpAbiHash: hash(Buffer.from(JSON.stringify(fpAbi.OPTIMIZER_ABI_IDENTITY))),
    optimizerBankHash: optimizer.bankIdentity.bankHash,
  })

  const canonical = canonicalFixtures()
  const common = await runCommonMatrix(
    topology,
    qualificationRoot,
    receiptSchema.validateReceiptV1,
    canonical,
    compilerProtocol,
  )
  const mixed = await runMixedRows(
    topology,
    qualificationRoot,
    receiptSchema.validateReceiptV1,
    compilerProtocol,
  )
  const sourceMaps = await runSourceMapMatrix(
    topology,
    qualificationRoot,
    receiptSchema.validateReceiptV1,
    compilerProtocol,
  )
  const observableConstruction = await runObservableConstructionMatrix(
    topology,
    qualificationRoot,
    receiptSchema.validateReceiptV1,
    compilerProtocol,
  )
  const importPruning = await runImportPruningMatrix(
    topology,
    qualificationRoot,
    receiptSchema.validateReceiptV1,
    compilerProtocol,
  )
  const helpers = await runHelpersMatrix(topology, qualificationRoot, canonical)
  const receiptPaths = collectedReceiptPaths(qualificationRoot)
  const expectedReceiptFiles =
    HOSTS.length * (COMMON_CONSUMERS.length + MIXED_TIERS.length + SOURCE_MAP_CASES.length + 2)
  assert(
    receiptPaths.length === expectedReceiptFiles,
    `expected ${expectedReceiptFiles} extracted host receipt files, received ${receiptPaths.length}`,
  )
  const cli = runCli(topology, qualificationRoot, receiptPaths)
  const mismatches = await compatibilityFailures(topology)
  const emittedReceipt = receiptPaths
    .flatMap((path) => JSON.parse(readFileSync(path, 'utf8')))
    .find((receipt) => receipt.disposition === 'transformed')
  assert(emittedReceipt !== undefined, 'extracted host matrix emitted no transformed receipt')
  for (const path of receiptPaths) {
    for (const receipt of JSON.parse(readFileSync(path, 'utf8'))) {
      assert(
        receipt.semanticManifestHash === compilerProtocol.OPERATOR_MANIFEST_V1_HASH,
        'receipt full semantic-manifest hash differs from extracted compiler',
      )
    }
  }
  assert(
    emittedReceipt.semanticManifestHash === compilerProtocol.OPERATOR_MANIFEST_V1_HASH,
    'receipt semantic hash does not match extracted compiler full manifest',
  )
  assert(
    fpAbi.OPTIMIZER_ABI_IDENTITY.semanticManifestHash === emittedReceipt.semanticManifestHash,
    'extracted FP ABI semantic hash differs from compiler receipt',
  )
  assert(
    optimizer.bankIdentity?.semanticManifestHash === emittedReceipt.semanticManifestHash,
    'extracted optimizer bank semantic hash differs from compiler receipt',
  )
  return {
    schemaVersion: 1,
    kind: 'stopcock-s11r-extracted-qualification',
    cohort: { contentHash: manifest.cohortContentHash, target: manifest.target },
    artifacts: Object.fromEntries(STOPCOCK.map((name) => [name, records.get(name).tarball])),
    compilerDependencyClosure: topology.compilerDependencyClosure,
    qualificationTools: topology.qualificationTools,
    corpus: {
      canonicalFixtures: canonical.corpus,
      harness: harnessCorpusIdentity(),
      harnessImplementation: fileIdentity(fileURLToPath(import.meta.url)),
    },
    bindings: {
      operatorManifestHash: emittedReceipt.semanticManifestHash,
      compilerSemanticFactsHash: compilerProtocol.OPERATOR_SEMANTIC_FACTS_V1_HASH,
      loweringHash: emittedReceipt.loweringHash,
      compilerEmitterAbiHash: compilerProtocol.COMPILER_EMITTER_ABI_V1_HASH,
      fpAbi: fpAbi.OPTIMIZER_ABI_IDENTITY,
      optimizerBank: optimizer.bankIdentity,
      artifactContext: topology.artifactContext,
    },
    common,
    mixed,
    sourceMaps,
    observableConstruction,
    importPruning,
    helpers,
    cli,
    compatibilityMismatches: mismatches,
  }
}

export const buildQualification = async ({ manifestPath, outputPath }) => {
  const context = await validateManifest(manifestPath)
  const output = resolve(outputPath)
  mkdirSync(dirname(output), { recursive: true })
  const scratches = [
    mkdtempSync(join(tmpdir(), 'stopcock-s11r-extracted-a-')),
    mkdtempSync(join(tmpdir(), 'stopcock-s11r-extracted-b-')),
  ]
  try {
    const first = await buildMaterialization({ ...context, scratch: scratches[0] })
    const second = await buildMaterialization({ ...context, scratch: scratches[1] })
    const bytes = Buffer.from(stable(first))
    const replayBytes = Buffer.from(stable(second))
    assert(
      bytes.equals(replayBytes),
      'two independent extracted materialisations produced different qualification bytes',
    )
    assert(!bytes.includes(Buffer.from(tmpdir())), 'qualification output leaks a temporary path')
    writeFileSync(output, bytes)
    assert(readFileSync(output).equals(bytes), 'qualification output was not byte stable')
    return first
  } finally {
    for (const scratch of scratches) remove(scratch)
  }
}

const parseArguments = (argv) => {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    assert(
      (key === '--manifest' || key === '--out') && typeof value === 'string',
      'usage: --manifest <cohort-manifest.json> --out <qualification.json>',
    )
    assert(!values.has(key), `duplicate ${key}`)
    values.set(key, value)
  }
  assert(values.size === 2, 'usage: --manifest <cohort-manifest.json> --out <qualification.json>')
  return { manifestPath: values.get('--manifest'), outputPath: values.get('--out') }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await buildQualification(parseArguments(process.argv.slice(2)))
    process.stdout.write(
      stable({ status: 'passed', qualification: hash(Buffer.from(stable(result))) }),
    )
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
