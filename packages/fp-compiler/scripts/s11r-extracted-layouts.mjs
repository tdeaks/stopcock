#!/usr/bin/env node

/**
 * S11R packed-install and ABI-layout qualification.
 *
 * Every package visible to a probe is extracted directly from a tarball named
 * by the immutable cohort manifest. Standard layouts never symlink a package
 * store into multiple consumers: each installed location is a distinct
 * extraction, so Node's optimizer-to-FP peer resolution is the relationship
 * the evidence claims it is.
 *
 * Deliberate incompatibility rows clone the same selected tarballs and make
 * one recorded byte mutation in the installed FP identity or optimizer bank.
 * The public packed optimizer must then use FP's exact fallback and emit no
 * specialised-runner execution event.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { copyCompilerDependencyClosure } from './s11r-extracted-matrix.mjs'

const PACKAGE_NAMES = Object.freeze([
  '@stopcock/fp',
  '@stopcock/fp-compiler',
  '@stopcock/fp-optimizer',
])
const LAYOUT_NAMES = Object.freeze([
  'ordinary',
  'hoisted',
  'isolated',
  'duplicate-fp-shared-optimizer',
  'duplicate-fp-separate-optimizer',
])
const SHA256 = /^sha256:[0-9a-f]{64}$/u
const S11R_PUBLIC_COHORT_COUNT = 21
const OUT_KIND = 'stopcock-v2-s11r-extracted-layouts'
const OUT_SCHEMA_VERSION = 2
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const TYPESCRIPT_CLI = join(REPOSITORY_ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
const GENERATED_ABI_IDENTITY_SYMBOLS = Object.freeze({
  abiVersion: 'OPTIMIZER_ABI_VERSION',
  protocolVersion: 'OPTIMIZER_PROTOCOL_VERSION',
  semanticManifestHash: 'SEMANTIC_MANIFEST_HASH',
  runnerSchemaHash: 'OPTIMIZER_RUNNER_SCHEMA_HASH',
  bindingSchemaHash: 'OPTIMIZER_BINDING_SCHEMA_HASH',
  consumeSchemaHash: 'OPTIMIZER_CONSUME_SCHEMA_HASH',
  executionContractHash: 'OPTIMIZER_EXECUTION_CONTRACT_HASH',
})

const fail = (message) => {
  throw new Error(`S11R extracted-layout gate: ${message}`)
}

const assert = (condition, message) => {
  if (!condition) fail(message)
}

const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`
const compare = (left, right) => left.localeCompare(right)
const toPosix = (value) => value.split(sep).join('/')
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const cleanNodeEnvironment = () => {
  const env = { ...process.env }
  delete env.NODE_PATH
  delete env.NODE_OPTIONS
  return env
}

function parseArgs(argv) {
  let manifest
  let out
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument !== '--manifest' && argument !== '--out') fail(`unknown argument ${argument}`)
    const value = argv[++index]
    assert(typeof value === 'string' && value.length > 0, `${argument} requires a value`)
    if (argument === '--manifest') manifest = resolve(value)
    else out = resolve(value)
  }
  assert(manifest !== undefined, '--manifest is required')
  assert(out !== undefined, '--out is required')
  return { manifest, out }
}

function runResult(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: cleanNodeEnvironment(),
    ...options,
  })
}

function run(command, args, options = {}) {
  const result = runResult(command, args, options)
  assert(
    result.status === 0,
    `${command} ${args.join(' ')} failed (${result.status ?? 'signal'}): ${(
      result.stderr ||
      result.stdout ||
      result.error?.message ||
      'no output'
    ).trim()}`,
  )
  return result.stdout
}

export async function validateLayoutManifest(path) {
  assert(existsSync(path), `manifest does not exist: ${path}`)
  const bytes = readFileSync(path)
  let value
  try {
    value = JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    fail(`manifest is not JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  assert(value?.kind === 'stopcock-v2-cohort', 'manifest kind is not stopcock-v2-cohort')
  assert(value?.schemaVersion === 1, 'manifest schemaVersion is not 1')
  assert(
    typeof value.cohortContentHash === 'string' && SHA256.test(value.cohortContentHash),
    'manifest cohortContentHash is invalid',
  )
  assert(Array.isArray(value.packages), 'manifest packages is not an array')
  assert(
    value.publicCount === S11R_PUBLIC_COHORT_COUNT &&
      value.packages.length === S11R_PUBLIC_COHORT_COUNT,
    `S11R requires the complete ${S11R_PUBLIC_COHORT_COUNT}-package extracted cohort`,
  )
  const records = new Map()
  for (const record of value.packages) {
    assert(typeof record?.name === 'string', 'manifest contains a package without a name')
    assert(!records.has(record.name), `manifest repeats ${record.name}`)
    records.set(record.name, record)
  }
  const selected = PACKAGE_NAMES.map((name) => {
    const record = records.get(name)
    assert(record !== undefined, `manifest does not contain ${name}`)
    assert(
      typeof record.version === 'string' && record.version.length > 0,
      `${name} version is missing`,
    )
    assert(
      record.tarball !== null && typeof record.tarball === 'object',
      `${name} tarball is missing`,
    )
    assert(typeof record.tarball.path === 'string', `${name} tarball path is missing`)
    assert(
      typeof record.tarball.sha256 === 'string' && SHA256.test(record.tarball.sha256),
      `${name} tarball hash is invalid`,
    )
    assert(
      Number.isSafeInteger(record.tarball.bytes) && record.tarball.bytes > 0,
      `${name} tarball byte count is invalid`,
    )
    return record
  })
  const { checkPackedCohort, expectedCohortManifestPath } = await import(
    pathToFileURL(join(REPOSITORY_ROOT, 'tooling', 'v2-cohort.mjs')).href
  )
  const checked = await checkPackedCohort({
    root: REPOSITORY_ROOT,
    manifest: path,
    verifyWorkspace: true,
  })
  assert(
    checked.cohortContentHash === value.cohortContentHash,
    'canonical cohort check returned a different content hash',
  )
  assert(checked.target === value.target, 'canonical cohort check returned a different target')
  assert(checked.mode === value.mode, 'canonical cohort check returned a different mode')
  assert(
    checked.publicCount === S11R_PUBLIC_COHORT_COUNT,
    'canonical packed-cohort check returned the wrong public package count',
  )
  const expectedManifest = expectedCohortManifestPath({
    root: REPOSITORY_ROOT,
    mode: value.mode,
    target: value.target,
    contentHash: value.cohortContentHash,
  })
  assert(
    path === expectedManifest,
    'manifest is not at its canonical content-addressed cohort path',
  )
  const canonicalTarballs = checked.tarballs.map(({ name, sha256: hash }) => ({
    name,
    sha256: hash,
  }))
  const manifestTarballs = value.packages.map((record) => ({
    name: record.name,
    sha256: record.tarball.sha256,
  }))
  assert(
    JSON.stringify(canonicalTarballs) === JSON.stringify(manifestTarballs),
    'canonical cohort selected package/tarball set differs from the manifest',
  )
  assert(
    selected.every((record) => record.version === value.target),
    'selected layout packages do not all target the canonical cohort version',
  )
  return { value, bytes, selected, checked }
}

function resolveTarball(manifestPath, record) {
  assert(!isAbsolute(record.tarball.path), `${record.name} tarball path must be manifest-relative`)
  const manifestDirectory = dirname(manifestPath)
  const path = resolve(manifestDirectory, record.tarball.path)
  const rel = relative(manifestDirectory, path)
  assert(
    rel !== '..' && !rel.startsWith(`..${sep}`),
    `${record.name} tarball escapes manifest directory`,
  )
  assert(existsSync(path), `${record.name} tarball does not exist`)
  const bytes = readFileSync(path)
  assert(
    bytes.length === record.tarball.bytes,
    `${record.name} tarball byte count differs from manifest`,
  )
  assert(
    sha256(bytes) === record.tarball.sha256,
    `${record.name} tarball hash differs from manifest`,
  )
  return path
}

function validateArchive(path, packageName) {
  const names = run('tar', ['-tzf', path]).split(/\r?\n/u).filter(Boolean)
  assert(names.length > 0, `${packageName} tarball is empty`)
  for (const name of names) {
    assert(!isAbsolute(name), `${packageName} archive contains absolute member ${name}`)
    const segments = name.split('/').filter(Boolean)
    assert(segments[0] === 'package', `${packageName} archive member is outside package/: ${name}`)
    assert(!segments.includes('..'), `${packageName} archive member traverses upward: ${name}`)
  }
  const listing = run('tar', ['-tvzf', path]).split(/\r?\n/u).filter(Boolean)
  assert(listing.length === names.length, `${packageName} verbose archive listing differs`)
  for (const line of listing) {
    assert(
      line[0] === '-' || line[0] === 'd',
      `${packageName} archive contains a link or special member`,
    )
  }
}

function visitTree(root, visitor) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    const stat = lstatSync(path)
    assert(!stat.isSymbolicLink(), `extracted package contains symbolic link ${path}`)
    if (stat.isDirectory()) visitTree(path, visitor)
    else if (stat.isFile()) visitor(path, stat)
    else fail(`extracted package contains special file ${path}`)
  }
}

function unpackTarball(path, destination, packageName) {
  assert(!existsSync(destination), `install destination already exists: ${destination}`)
  mkdirSync(destination, { recursive: true })
  run('tar', ['-xzf', path, '-C', destination, '--strip-components=1'])
  assert(
    existsSync(join(destination, 'package.json')),
    `${packageName} extraction has no package.json`,
  )
  visitTree(destination, () => {})
}

function packageInstallPath(nodeModules, packageName) {
  return join(nodeModules, ...packageName.split('/'))
}

function installPackage(nodeModules, record, tarball, label, roots) {
  const destination = packageInstallPath(nodeModules, record.name)
  mkdirSync(dirname(destination), { recursive: true })
  unpackTarball(tarball, destination, record.name)
  roots.push({ label, root: destination })
  return destination
}

function footprint(root) {
  let bytes = 0
  let files = 0
  visitTree(root, (_path, stat) => {
    files++
    bytes += stat.size
  })
  return { bytes, files }
}

function packageTreeIdentity(root) {
  const entries = []
  visitTree(root, (path, stat) => {
    const bytes = readFileSync(path)
    entries.push({
      path: toPosix(relative(root, path)),
      bytes: stat.size,
      sha256: sha256(bytes),
    })
  })
  entries.sort((left, right) => compare(left.path, right.path))
  return {
    sha256: sha256(Buffer.from(canonicalJson(entries))),
    bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    files: entries.length,
  }
}

function sortedDependencies(value) {
  if (value === undefined) return []
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'dependency section is malformed',
  )
  return Object.entries(value)
    .map(([name, range]) => {
      assert(typeof range === 'string', `dependency range for ${name} is not a string`)
      return { name, range }
    })
    .sort((left, right) => compare(left.name, right.name))
}

function collectPackageEvidence(record, tarball, scratch) {
  const root = join(scratch, 'package-evidence', record.name.replaceAll('/', '__'))
  unpackTarball(tarball, root, record.name)
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert(manifest.name === record.name, `${record.name} extracted name differs`)
  assert(manifest.version === record.version, `${record.name} extracted version differs`)
  assert(existsSync(join(root, 'README.md')), `${record.name} omits README.md`)
  assert(existsSync(join(root, 'LICENSE')), `${record.name} omits LICENSE`)
  let declarationCount = 0
  visitTree(join(root, 'dist'), (path) => {
    if (path.endsWith('.d.ts')) declarationCount++
  })
  assert(declarationCount > 0, `${record.name} omits declarations`)
  return {
    name: manifest.name,
    version: manifest.version,
    footprint: footprint(root),
    readme: true,
    license: true,
    declarationCount,
    dependencies: sortedDependencies(manifest.dependencies),
    optionalDependencies: sortedDependencies(manifest.optionalDependencies),
    peerDependencies: sortedDependencies(manifest.peerDependencies),
  }
}

function assertPackageGraph(evidence) {
  const fp = evidence.get('@stopcock/fp')
  const compiler = evidence.get('@stopcock/fp-compiler')
  const optimizer = evidence.get('@stopcock/fp-optimizer')
  const fpEdges = [...fp.dependencies, ...fp.optionalDependencies, ...fp.peerDependencies]
  assert(
    !fpEdges.some((entry) => entry.name === '@stopcock/fp-optimizer'),
    'FP depends or peers on optimizer',
  )
  const optimizerRuntimeEdges = [...optimizer.dependencies, ...optimizer.optionalDependencies]
  assert(
    !optimizerRuntimeEdges.some((entry) => entry.name === '@stopcock/fp'),
    'optimizer declares FP as a direct or optional dependency instead of an exact peer',
  )
  const compilerRuntimeEdges = [...compiler.dependencies, ...compiler.optionalDependencies]
  const compilerEdges = [...compilerRuntimeEdges, ...compiler.peerDependencies]
  assert(
    !compilerEdges.some((entry) => entry.name === '@stopcock/fp-optimizer'),
    'compiler has a hidden optimizer dependency or peer',
  )
  assert(
    !compilerRuntimeEdges.some((entry) => entry.name === '@stopcock/fp'),
    'compiler declares FP as a direct or optional dependency instead of an exact peer',
  )
  assert(
    optimizer.peerDependencies.length === 1 &&
      optimizer.peerDependencies[0].name === '@stopcock/fp' &&
      optimizer.peerDependencies[0].range === fp.version,
    'optimizer does not declare the exact selected FP peer',
  )
  assert(
    compiler.peerDependencies.length === 1 &&
      compiler.peerDependencies[0].name === '@stopcock/fp' &&
      compiler.peerDependencies[0].range === fp.version,
    'compiler does not declare the exact selected FP peer',
  )
}

function typecheckConsumer(application, source, label, { skipLibCheck = false } = {}) {
  assert(existsSync(TYPESCRIPT_CLI), 'repository TypeScript compiler is unavailable')
  const sourcePath = join(application, 'typecheck.ts')
  const configPath = join(application, 'tsconfig.json')
  writeFileSync(sourcePath, source)
  writeFileSync(
    configPath,
    canonicalJson({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        resolveJsonModule: true,
        skipLibCheck,
      },
      files: ['./typecheck.ts'],
    }),
  )
  run(process.execPath, [TYPESCRIPT_CLI, '--project', configPath, '--pretty', 'false'])
  const version = run(process.execPath, [TYPESCRIPT_CLI, '--version']).trim()
  assert(/^Version 7\./u.test(version), `${label} did not use the required TypeScript 7 toolchain`)
  return { passed: true, compiler: version }
}

function exportConditions(value, label) {
  if (typeof value === 'string') return [{ condition: 'default', target: value }]
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${label} export is malformed`,
  )
  return Object.entries(value).flatMap(([condition, target]) => {
    if (typeof target === 'string') return [{ condition, target }]
    return exportConditions(target, `${label} ${condition}`).map((entry) => ({
      condition: `${condition}/${entry.condition}`,
      target: entry.target,
    }))
  })
}

function packageExportSpecifiers(root, packageName) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert(manifest.name === packageName, `${packageName} extracted manifest name differs`)
  assert(
    manifest.exports !== null && typeof manifest.exports === 'object',
    `${packageName} has no exports map`,
  )
  const specifiers = []
  for (const [subpath, value] of Object.entries(manifest.exports)) {
    assert(
      subpath === '.' || subpath.startsWith('./'),
      `${packageName} export key is invalid: ${subpath}`,
    )
    const targets = exportConditions(value, `${packageName} ${subpath}`)
    assert(targets.length > 0, `${packageName} ${subpath} has no export targets`)
    for (const { condition, target } of targets) {
      assert(
        target.startsWith('./'),
        `${packageName} ${subpath} ${condition} target is not package-relative`,
      )
      const path = resolve(root, target)
      const rel = relative(root, path)
      assert(
        rel !== '..' && !rel.startsWith(`..${sep}`),
        `${packageName} ${subpath} ${condition} target escapes package`,
      )
      assert(
        existsSync(path),
        `${packageName} ${subpath} ${condition} target is missing: ${target}`,
      )
      const info = lstatSync(path)
      assert(
        info.isFile() && !info.isSymbolicLink(),
        `${packageName} ${subpath} ${condition} target is not a regular file`,
      )
    }
    if (subpath !== './package.json') {
      const hasTypes = targets.some(
        ({ condition, target }) => condition === 'types' && target.endsWith('.d.ts'),
      )
      const hasRuntime = targets.some(
        ({ condition, target }) =>
          (condition === 'import' || condition === 'default') && /\.(?:c|m)?js$/u.test(target),
      )
      assert(hasTypes, `${packageName} ${subpath} has no declaration target`)
      assert(hasRuntime, `${packageName} ${subpath} has no runtime target`)
      specifiers.push(subpath === '.' ? packageName : `${packageName}/${subpath.slice(2)}`)
    }
  }
  return specifiers.sort(compare)
}

function importSurface(specifiers) {
  return specifiers
    .map(
      (specifier, index) =>
        `import * as Export${index} from ${JSON.stringify(specifier)}\nvoid Export${index}`,
    )
    .join('\n')
}

function typecheckExtractedExports(application, installed, cohortManifest) {
  const compilerDependencyClosure = copyCompilerDependencyClosure(
    installed.get('@stopcock/fp-compiler'),
    cohortManifest,
  )
  const specifiersByPackage = Object.fromEntries(
    PACKAGE_NAMES.map((name) => [name, packageExportSpecifiers(installed.get(name), name)]),
  )
  const strictSpecifiers = [
    ...specifiersByPackage['@stopcock/fp'],
    ...specifiersByPackage['@stopcock/fp-optimizer'],
  ]
  const strict = typecheckConsumer(
    application,
    importSurface(strictSpecifiers),
    'extracted FP and optimizer exports',
  )
  const compiler = typecheckConsumer(
    application,
    importSurface(specifiersByPackage['@stopcock/fp-compiler']),
    'extracted compiler exports',
    {
      // unplugin deliberately imports every optional host peer in one
      // declaration file. The five actual adapters execute under their locked
      // hosts in the extracted host matrix; this pass checks Stopcock's packed
      // declaration targets without claiming absent optional hosts are part of
      // the compiler tarball.
      skipLibCheck: true,
    },
  )
  return {
    passed: strict.passed && compiler.passed,
    compiler: strict.compiler,
    strict: {
      ...strict,
      skipLibCheck: false,
      specifiers: strictSpecifiers,
    },
    compilerHostSurface: {
      ...compiler,
      skipLibCheck: true,
      specifiers: specifiersByPackage['@stopcock/fp-compiler'],
      ownership: 'five-host-extracted-matrix',
    },
    specifiersByPackage,
    compilerDependencyClosure,
  }
}

function writeRuntimeProbe(path, expectedSpecialized, expectedNegotiationFailure) {
  writeFileSync(
    path,
    `
import assert from 'node:assert/strict'
import * as FP from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
import * as ABI from '@stopcock/fp/abi'
import * as Optimizer from '@stopcock/fp-optimizer'

const source = [1, 2, 3, 4]
const step = A.map((value) => value * 2)
assert.deepEqual(FP.pipe(source, step), [2, 4, 6, 8])
const plan = ABI.vetPipeline([step, A.length])
assert.equal(ABI.runExactFallback(plan, source), 4)
const compatibilityDecision = Optimizer.evaluateCompatibility({
  fpInstanceToken: plan.instanceToken,
  fpIdentity: plan.identity,
  optimizerBank: Optimizer.bankIdentity,
  requestedMode: plan.mode,
  planMode: plan.mode,
  layout: plan.layout,
  fullyTrusted: plan.fullyTrusted,
  shape: {
    codes: plan.codes,
    segments: plan.segments,
    bindingCount: plan.bindings.length,
  },
})
Optimizer.beginSelectionTrace()
const optimized = Optimizer.compile(step, A.length)(source)
const events = Optimizer.endSelectionTrace()
assert.equal(optimized, 4)
const executed = events.filter((event) => event.phase === 'executed')
assert.equal(compatibilityDecision.eligible, ${JSON.stringify(expectedSpecialized)}, 'public compatibility decision differs from execution disposition')
assert.equal(executed.length > 0, ${JSON.stringify(expectedSpecialized)}, 'specialized execution disposition differs')
assert.equal(Optimizer.negotiationFailure !== undefined, ${JSON.stringify(expectedNegotiationFailure)}, 'installed-pair negotiation disposition differs')
let assertion
try {
  Optimizer.assertCompatible()
  assertion = { compatible: true }
} catch (error) {
  assertion = {
    compatible: false,
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  }
}
assert.equal(assertion.compatible, ${JSON.stringify(!expectedNegotiationFailure)}, 'assertCompatible disposition differs')
process.stdout.write(JSON.stringify({
  resolved: {
    fp: import.meta.resolve('@stopcock/fp'),
    abi: import.meta.resolve('@stopcock/fp/abi'),
    optimizer: import.meta.resolve('@stopcock/fp-optimizer'),
  },
  result: optimized,
  fpIdentity: plan.identity,
  optimizerExpectedIdentity: Optimizer.abiIdentity,
  optimizerBankIdentity: Optimizer.bankIdentity,
  negotiationFailure: Optimizer.negotiationFailure ?? null,
  compatibilityDecision,
  compatibilityAssertion: assertion,
  selectedRunnerIds: events.filter((event) => event.phase === 'selected').map((event) => event.runnerId).sort(),
  executedRunnerIds: executed.map((event) => event.runnerId).sort(),
}))
`,
  )
}

function writeFpOnlyProbe(path, exportSpecifiers) {
  writeFileSync(
    path,
    `
import assert from 'node:assert/strict'
import * as FP from '@stopcock/fp'
import * as A from '@stopcock/fp/array'

const exportSpecifiers = ${JSON.stringify(exportSpecifiers)}
const resolvedExports = {}
for (const specifier of exportSpecifiers) {
  const namespace = await import(specifier)
  assert(namespace !== null && typeof namespace === 'object', specifier + ' did not import a module namespace')
  resolvedExports[specifier] = import.meta.resolve(specifier)
}
const result = FP.pipe([1, 2, 3, 4], A.map((value) => value * 2), A.length)
assert.equal(result, 4)
let optimizerMissing = false
let failureCode = null
try {
  await import('@stopcock/fp-optimizer')
} catch (error) {
  optimizerMissing = true
  failureCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'UNKNOWN'
}
assert.equal(optimizerMissing, true, 'optimizer unexpectedly resolves from the FP-only consumer')
assert.equal(failureCode, 'ERR_MODULE_NOT_FOUND', 'optimizer failed for a reason other than package absence')
process.stdout.write(JSON.stringify({
  resolved: { fp: import.meta.resolve('@stopcock/fp') },
  result,
  optimizerMissing,
  failureCode,
  resolvedExports,
}))
`,
  )
}

function parseProbe(stdout, name) {
  try {
    return JSON.parse(stdout)
  } catch (error) {
    fail(`${name} did not emit JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function runProbe(path, name) {
  return parseProbe(run(process.execPath, [path]), name)
}

function normaliseLocator(locator, roots) {
  assert(typeof locator === 'string', 'module locator is not a string')
  const path = locator.startsWith('file:') ? fileURLToPath(locator) : locator
  const real = realpathSync(path)
  const matches = roots
    .map(({ label, root }) => ({ label, root, rel: relative(root, real) }))
    .filter(({ rel }) => rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`)))
    .sort((left, right) => right.root.length - left.root.length)
  assert(matches.length > 0, `resolved module escapes extracted installs: ${locator}`)
  const selected = matches[0]
  return `file:@install/${selected.label}${selected.rel === '' ? '' : `/${toPosix(selected.rel)}`}`
}

function canonicalRuntimeProbe(probe, roots) {
  return {
    resolved: Object.fromEntries(
      Object.entries(probe.resolved)
        .map(([key, locator]) => [key, normaliseLocator(locator, roots)])
        .sort(([left], [right]) => compare(left, right)),
    ),
    result: probe.result,
    fpIdentity: probe.fpIdentity,
    optimizerExpectedIdentity: probe.optimizerExpectedIdentity,
    optimizerBankIdentity: probe.optimizerBankIdentity,
    negotiationFailure: probe.negotiationFailure,
    compatibilityDecision: probe.compatibilityDecision,
    compatibilityAssertion: probe.compatibilityAssertion,
    selectedRunnerIds: probe.selectedRunnerIds,
    executedRunnerIds: probe.executedRunnerIds,
  }
}

function installSet(nodeModules, records, tarballs, labelPrefix, roots, names = PACKAGE_NAMES) {
  const installed = new Map()
  for (const name of names) {
    const record = records.get(name)
    installed.set(
      name,
      installPackage(
        nodeModules,
        record,
        tarballs.get(name),
        `${labelPrefix}/${name.replace('@stopcock/', '')}`,
        roots,
      ),
    )
  }
  return installed
}

function installLayoutSide(root, layout, side, records, tarballs) {
  const roots = []
  assert(
    side === 'primary' || side === 'secondary',
    `unsupported ${layout} installation side ${side}`,
  )
  if (layout === 'ordinary') {
    assert(side === 'primary', `${layout} has no secondary installation side`)
    const application = join(root, 'consumer')
    const installed = installSet(
      join(application, 'node_modules'),
      records,
      tarballs,
      `${layout}/primary`,
      roots,
    )
    return { application, installed, roots }
  }
  if (layout === 'hoisted') {
    assert(side === 'primary', `${layout} has no secondary installation side`)
    const application = join(root, 'packages', 'application')
    const installed = installSet(
      join(root, 'node_modules'),
      records,
      tarballs,
      `${layout}/primary`,
      roots,
    )
    mkdirSync(application, { recursive: true })
    return { application, installed, roots }
  }
  if (layout === 'isolated') {
    assert(side === 'primary', `${layout} has no secondary installation side`)
    const context = join(
      root,
      'store',
      `optimizer-${records.get('@stopcock/fp-optimizer').version}_fp-${records.get('@stopcock/fp').version}`,
    )
    const application = join(context, 'application')
    const installed = installSet(
      join(context, 'node_modules'),
      records,
      tarballs,
      `${layout}/primary-peer-context`,
      roots,
    )
    mkdirSync(application, { recursive: true })
    return { application, installed, roots }
  }
  if (layout === 'duplicate-fp-shared-optimizer') {
    const primary = installSet(
      join(root, 'node_modules'),
      records,
      tarballs,
      `${layout}/primary`,
      roots,
    )
    const secondaryFp = installSet(
      join(root, 'apps', 'b', 'node_modules'),
      records,
      tarballs,
      `${layout}/secondary`,
      roots,
      ['@stopcock/fp'],
    )
    const application = join(root, 'apps', side === 'primary' ? 'a' : 'b')
    mkdirSync(application, { recursive: true })
    return {
      application,
      installed:
        side === 'primary'
          ? primary
          : new Map([
              ['@stopcock/fp', secondaryFp.get('@stopcock/fp')],
              ['@stopcock/fp-compiler', primary.get('@stopcock/fp-compiler')],
              ['@stopcock/fp-optimizer', primary.get('@stopcock/fp-optimizer')],
            ]),
      roots,
    }
  }
  if (layout === 'duplicate-fp-separate-optimizer') {
    const primaryApplication = join(root, 'apps', 'a')
    const secondaryApplication = join(root, 'apps', 'b')
    const primary = installSet(
      join(primaryApplication, 'node_modules'),
      records,
      tarballs,
      `${layout}/primary`,
      roots,
    )
    const secondary = installSet(
      join(secondaryApplication, 'node_modules'),
      records,
      tarballs,
      `${layout}/secondary`,
      roots,
    )
    return {
      application: side === 'primary' ? primaryApplication : secondaryApplication,
      installed: side === 'primary' ? primary : secondary,
      roots,
    }
  }
  fail(`unsupported layout ${layout}`)
}

function resolveOptimizerPeer(optimizerRoot, roots, label) {
  const path = join(optimizerRoot, '__s11r-resolve-peer.mjs')
  writeFileSync(
    path,
    "process.stdout.write(JSON.stringify({ fp: import.meta.resolve('@stopcock/fp') }))\n",
  )
  const probe = runProbe(path, `${label} optimizer peer resolution`)
  return normaliseLocator(probe.fp, roots)
}

function runStandardLayout(scratch, layout, records, tarballs, cohortManifest) {
  const root = join(scratch, 'layouts', layout)
  const isolatedContext =
    layout === 'isolated'
      ? join(
          root,
          'store',
          `optimizer-${records.get('@stopcock/fp-optimizer').version}_fp-${records.get('@stopcock/fp').version}`,
        )
      : undefined
  const application =
    layout === 'ordinary'
      ? join(root, 'consumer')
      : layout === 'isolated'
        ? join(isolatedContext, 'application')
        : join(root, 'packages', 'application')
  const roots = []
  let installed
  if (layout === 'hoisted') {
    installed = installSet(join(root, 'node_modules'), records, tarballs, layout, roots)
  } else if (layout === 'isolated') {
    // Model one package-manager peer context with real extracted files rather
    // than store symlinks. Both the application and optimizer resolve the same
    // physical FP instance; a nested second instance belongs in the explicit
    // duplicate-FP rows below, not in the healthy isolated-install row.
    installed = installSet(
      join(isolatedContext, 'node_modules'),
      records,
      tarballs,
      `${layout}/peer-context`,
      roots,
    )
  } else {
    installed = installSet(join(application, 'node_modules'), records, tarballs, layout, roots)
  }
  mkdirSync(application, { recursive: true })
  const runtimePath = join(application, 'runtime.mjs')
  writeRuntimeProbe(runtimePath, true, false)
  const primary = canonicalRuntimeProbe(runProbe(runtimePath, `${layout} runtime`), roots)
  const optimizerPeerFp = resolveOptimizerPeer(
    installed.get('@stopcock/fp-optimizer'),
    roots,
    layout,
  )
  assert(
    primary.resolved.fp === optimizerPeerFp,
    `${layout} optimizer did not resolve the consumer FP peer`,
  )
  assert(
    primary.executedRunnerIds.length > 0,
    `${layout} matching FP/optimizer pair did not execute`,
  )
  const typecheck =
    layout === 'ordinary'
      ? typecheckExtractedExports(application, installed, cohortManifest)
      : undefined
  return {
    layout,
    topology:
      layout === 'ordinary'
        ? 'consumer/node_modules'
        : layout === 'hoisted'
          ? 'root/node_modules resolved from root/packages/application'
          : 'real-file isolated peer context owns FP/compiler/optimizer and its nested application',
    primary,
    resolution: {
      consumerFp: primary.resolved.fp,
      optimizerPeerFp,
      relationship:
        primary.resolved.fp === optimizerPeerFp ? 'shared-peer' : 'physical-duplicate-peer',
    },
    typecheck,
  }
}

function runDuplicateSharedLayout(scratch, records, tarballs) {
  const layout = 'duplicate-fp-shared-optimizer'
  const root = join(scratch, 'layouts', layout)
  const roots = []
  const rootModules = join(root, 'node_modules')
  installSet(rootModules, records, tarballs, `${layout}/shared`, roots)
  const appA = join(root, 'apps', 'a')
  const appB = join(root, 'apps', 'b')
  const installed = installSet(
    join(appB, 'node_modules'),
    records,
    tarballs,
    `${layout}/b`,
    roots,
    ['@stopcock/fp'],
  )
  mkdirSync(appA, { recursive: true })
  writeRuntimeProbe(join(appA, 'runtime.mjs'), true, false)
  writeRuntimeProbe(join(appB, 'runtime.mjs'), false, false)
  const primary = canonicalRuntimeProbe(runProbe(join(appA, 'runtime.mjs'), `${layout} A`), roots)
  const secondary = canonicalRuntimeProbe(runProbe(join(appB, 'runtime.mjs'), `${layout} B`), roots)
  assert(
    primary.resolved.fp !== secondary.resolved.fp,
    `${layout} did not resolve distinct FP copies`,
  )
  assert(
    primary.resolved.optimizer === secondary.resolved.optimizer,
    `${layout} did not share optimizer`,
  )
  assert(primary.executedRunnerIds.length > 0, `${layout} A did not execute its matching optimizer`)
  assert(secondary.executedRunnerIds.length === 0, `${layout} B crossed foreign provenance`)
  return {
    layout,
    topology: 'root FP A and optimizer shared; nested application B owns FP B',
    primary,
    secondary,
  }
}

function runDuplicateSeparateLayout(scratch, records, tarballs) {
  const layout = 'duplicate-fp-separate-optimizer'
  const root = join(scratch, 'layouts', layout)
  const roots = []
  const appA = join(root, 'apps', 'a')
  const appB = join(root, 'apps', 'b')
  installSet(join(appA, 'node_modules'), records, tarballs, `${layout}/a`, roots)
  installSet(join(appB, 'node_modules'), records, tarballs, `${layout}/b`, roots)
  writeRuntimeProbe(join(appA, 'runtime.mjs'), true, false)
  writeRuntimeProbe(join(appB, 'runtime.mjs'), true, false)
  const primary = canonicalRuntimeProbe(runProbe(join(appA, 'runtime.mjs'), `${layout} A`), roots)
  const secondary = canonicalRuntimeProbe(runProbe(join(appB, 'runtime.mjs'), `${layout} B`), roots)
  assert(
    primary.resolved.fp !== secondary.resolved.fp,
    `${layout} did not resolve distinct FP copies`,
  )
  assert(
    primary.resolved.optimizer !== secondary.resolved.optimizer,
    `${layout} did not resolve distinct optimizers`,
  )
  assert(primary.executedRunnerIds.length > 0, `${layout} A did not execute`)
  assert(secondary.executedRunnerIds.length > 0, `${layout} B did not execute`)
  return {
    layout,
    topology: 'applications A and B each own an independent FP and optimizer pair',
    primary,
    secondary,
  }
}

function runFpOnlyLayout(scratch, records, tarballs) {
  const root = join(scratch, 'fp-only')
  const application = join(root, 'consumer')
  const roots = []
  const installed = installSet(
    join(application, 'node_modules'),
    records,
    tarballs,
    'fp-only',
    roots,
    ['@stopcock/fp'],
  )
  const exportSpecifiers = packageExportSpecifiers(installed.get('@stopcock/fp'), '@stopcock/fp')
  const path = join(application, 'probe.mjs')
  writeFpOnlyProbe(path, exportSpecifiers)
  const probe = runProbe(path, 'FP-only')
  const typecheck = typecheckConsumer(application, importSurface(exportSpecifiers), 'FP-only')
  return {
    topology: 'consumer/node_modules contains only the extracted FP tarball',
    resolved: { fp: normaliseLocator(probe.resolved.fp, roots) },
    runtimeExports: Object.fromEntries(
      Object.entries(probe.resolvedExports)
        .map(([specifier, locator]) => [specifier, normaliseLocator(locator, roots)])
        .sort(([left], [right]) => compare(left, right)),
    ),
    result: probe.result,
    optimizerMissing: probe.optimizerMissing,
    failureCode: probe.failureCode,
    typecheck,
  }
}

function mutateHash(value, digit) {
  const candidate = `sha256:${digit.repeat(64)}`
  return candidate === value ? `sha256:${(digit === '0' ? '1' : '0').repeat(64)}` : candidate
}

function replacementLiteral(value, digit = '0') {
  return typeof value === 'number' ? String(value + 1) : JSON.stringify(mutateHash(value, digit))
}

function sourceLiteral(value) {
  return typeof value === 'number' ? String(value) : JSON.stringify(value)
}

function replaceUniqueProperty(source, property, oldValue, newValue, label) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const literal = sourceLiteral(oldValue).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const pattern = new RegExp(`(${escaped}\\s*:\\s*)${literal}(?=\\s*[,}])`, 'gu')
  const matches = [...source.matchAll(pattern)]
  assert(
    matches.length === 1,
    `${label} must contain exactly one ${property} property occurrence, found ${matches.length}`,
  )
  const output = source.replace(pattern, (_match, prefix) => `${prefix}${newValue}`)
  assert(output !== source, `${label} ${property} mutation made no source change`)
  return output
}

function findBundledFile(root, marker) {
  const matches = []
  visitTree(join(root, 'dist'), (path) => {
    if (!path.endsWith('.js')) return
    const source = readFileSync(path, 'utf8')
    if (source.includes(marker)) matches.push(path)
  })
  assert(
    matches.length === 1,
    `expected one bundled file containing ${marker}, found ${matches.length}`,
  )
  return matches[0]
}

function mutateInstalledIdentity(fpRoot, property, oldValue, digit) {
  const path = findBundledFile(fpRoot, 'src/internal/abi-identity.generated.ts')
  const before = readFileSync(path)
  const source = before.toString('utf8')
  const generatedStart = source.indexOf('//#region src/internal/abi-identity.generated.ts')
  const generatedEnd = source.indexOf('//#endregion', generatedStart)
  assert(
    generatedStart >= 0 && generatedEnd > generatedStart,
    'FP bundle has no generated ABI identity region',
  )
  const generated = source.slice(generatedStart, generatedEnd)
  const symbol = GENERATED_ABI_IDENTITY_SYMBOLS[property]
  assert(typeof symbol === 'string', `FP ABI identity property is not generated: ${property}`)
  const generatedField = new RegExp(
    `const\\s+${symbol}\\s*=\\s*${sourceLiteral(oldValue).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?=\\s*;)`,
    'gu',
  )
  assert(
    [...generated.matchAll(generatedField)].length === 1,
    `generated FP ABI identity region must contain exactly one ${symbol} field`,
  )
  const abiStart = source.indexOf('//#region src/abi.ts', generatedEnd)
  const identityStart = source.indexOf('const OPTIMIZER_ABI_IDENTITY = Object.freeze({', abiStart)
  const identityEnd = source.indexOf('\n});', identityStart)
  assert(
    abiStart >= 0 && identityStart > abiStart && identityEnd > identityStart,
    'FP bundle has no concrete ABI identity object',
  )
  const identity = source.slice(identityStart, identityEnd + '\n});'.length)
  const output = `${source.slice(0, identityStart)}${replaceUniqueProperty(
    identity,
    property,
    oldValue,
    replacementLiteral(oldValue, digit),
    'FP concrete ABI identity object',
  )}${source.slice(identityEnd + '\n});'.length)}`
  writeFileSync(path, output)
  const after = readFileSync(path)
  assert(!before.equals(after), `${property} identity mutation made no byte change`)
  return {
    package: 'fp',
    target: 'fp-generated-abi-identity-field',
    property,
    replacements: 1,
    beforeSha256: sha256(before),
    afterSha256: sha256(after),
  }
}

function mutateInstalledBank(optimizerRoot, property, oldValue, digit) {
  const path = findBundledFile(optimizerRoot, 'src/bank-identity.generated.ts')
  const before = readFileSync(path)
  const source = before.toString('utf8')
  const start = source.indexOf('//#region src/bank-identity.generated.ts')
  const end = source.indexOf('//#endregion', start)
  assert(start >= 0 && end > start, 'optimizer bundle has no bank-identity generated region')
  const region = source.slice(start, end)
  const replacement = replaceUniqueProperty(
    region,
    property,
    oldValue,
    replacementLiteral(oldValue, digit),
    'optimizer generated bank identity region',
  )
  const output = `${source.slice(0, start)}${replacement}${source.slice(end)}`
  writeFileSync(path, output)
  const after = readFileSync(path)
  assert(!before.equals(after), `${property} bank mutation made no byte change`)
  return {
    package: 'optimizer',
    target: 'optimizer-bank-bundle',
    property,
    replacements: 1,
    beforeSha256: sha256(before),
    afterSha256: sha256(after),
  }
}

function runPhysicalMismatch(
  scratch,
  records,
  tarballs,
  layout,
  side,
  name,
  target,
  property,
  oldValue,
  digit,
) {
  const root = join(scratch, 'physical-mismatches', layout, side, name)
  const { application, installed, roots } = installLayoutSide(root, layout, side, records, tarballs)
  const mutationBase =
    target === 'fp'
      ? mutateInstalledIdentity(installed.get('@stopcock/fp'), property, oldValue, digit)
      : mutateInstalledBank(installed.get('@stopcock/fp-optimizer'), property, oldValue, digit)
  const mutation = {
    ...mutationBase,
    effectivePackage: packageTreeIdentity(
      installed.get(mutationBase.package === 'fp' ? '@stopcock/fp' : '@stopcock/fp-optimizer'),
    ),
  }
  const path = join(application, 'runtime.mjs')
  const expectedNegotiationFailure = !(
    layout === 'duplicate-fp-shared-optimizer' &&
    side === 'secondary' &&
    target === 'fp'
  )
  writeRuntimeProbe(path, false, expectedNegotiationFailure)
  const result = canonicalRuntimeProbe(
    runProbe(path, `physical mismatch ${layout}/${side}/${name}`),
    roots,
  )
  const optimizerPeerFp = resolveOptimizerPeer(
    installed.get('@stopcock/fp-optimizer'),
    roots,
    `physical mismatch ${layout}/${side}/${name}`,
  )
  const expectedSharedPeer = !(layout === 'duplicate-fp-shared-optimizer' && side === 'secondary')
  assert(
    (result.resolved.fp === optimizerPeerFp) === expectedSharedPeer,
    `${layout}/${side}/${name} physical FP relationship differs from the selected topology`,
  )
  assert(result.executedRunnerIds.length === 0, `${name} invoked a specialized runner`)
  assert(
    typeof result.negotiationFailure === 'string' && result.negotiationFailure.length > 0,
    `${name} has no mismatch reason`,
  )
  assert(result.result === 4, `${name} changed exact fallback result`)
  return {
    layout,
    side,
    fpRelationship: expectedSharedPeer ? 'shared-peer' : 'foreign-duplicate-peer',
    name,
    mutation,
    result,
  }
}

function runPhysicalMismatches(scratch, records, tarballs, fpIdentity, bankIdentity) {
  const identityCases = [
    ['abi-version', 'abiVersion', fpIdentity.abiVersion, '0'],
    ['protocol-version', 'protocolVersion', fpIdentity.protocolVersion, '0'],
    ['semantic-manifest-hash', 'semanticManifestHash', fpIdentity.semanticManifestHash, '0'],
    ['runner-schema-hash', 'runnerSchemaHash', fpIdentity.runnerSchemaHash, '1'],
    ['binding-schema-hash', 'bindingSchemaHash', fpIdentity.bindingSchemaHash, '2'],
    ['consume-schema-hash', 'consumeSchemaHash', fpIdentity.consumeSchemaHash, '3'],
    ['execution-contract-hash', 'executionContractHash', fpIdentity.executionContractHash, '4'],
  ]
  const bankCases = [
    ['bank-schema-version', 'schemaVersion', bankIdentity.schemaVersion, '0'],
    ['bank-hash', 'bankHash', bankIdentity.bankHash, '5'],
    ['bank-semantic-manifest-hash', 'semanticManifestHash', bankIdentity.semanticManifestHash, '6'],
    ['bank-runner-count', 'runnerCount', bankIdentity.runnerCount, '0'],
  ]
  return LAYOUT_NAMES.flatMap((layout) => {
    const sides = layout.startsWith('duplicate-') ? ['primary', 'secondary'] : ['primary']
    return sides.flatMap((side) => [
      ...identityCases.map(([name, property, value, digit]) =>
        runPhysicalMismatch(
          scratch,
          records,
          tarballs,
          layout,
          side,
          name,
          'fp',
          property,
          value,
          digit,
        ),
      ),
      ...bankCases.map(([name, property, value, digit]) =>
        runPhysicalMismatch(
          scratch,
          records,
          tarballs,
          layout,
          side,
          name,
          'optimizer',
          property,
          value,
          digit,
        ),
      ),
    ])
  }).sort((left, right) =>
    compare(
      `${left.layout}/${left.side}/${left.name}`,
      `${right.layout}/${right.side}/${right.name}`,
    ),
  )
}

function instrumentOptimizerExecutionGate(optimizerRoot) {
  const path = findBundledFile(optimizerRoot, 'function compileVettedPlan(')
  const before = readFileSync(path)
  const source = before.toString('utf8')
  assert(
    !source.includes('__s11rCompileVettedPlan'),
    'optimizer bundle already exposes the qualification hook',
  )
  assert(
    /function compileVettedPlan\s*\(/u.test(source),
    'optimizer bundle omits the production compileVettedPlan gate',
  )
  writeFileSync(
    path,
    `${source}\n// S11R scratch-only wrapper; the selected tarball remains unchanged.\nexport const __s11rCompileVettedPlan = (plan, mode, candidate) => compileVettedPlan(mode === 'pure', plan, undefined, candidate);\n`,
  )
  const after = readFileSync(path)
  return {
    target: 'optimizer-index-bundle',
    change: 'wrap-existing-production-compileVettedPlan',
    beforeSha256: sha256(before),
    afterSha256: sha256(after),
  }
}

function writeInstrumentedExecutionProbe(path, expectedBaselineSpecialized) {
  writeFileSync(
    path,
    `
import assert from 'node:assert/strict'
import * as ABI from '@stopcock/fp/abi'
import * as A from '@stopcock/fp/array'
import * as Optimizer from '@stopcock/fp-optimizer'

assert.equal(typeof Optimizer.__s11rCompileVettedPlan, 'function')
const source = [1, 2, 3, 4]
const vetted = ABI.vetPipeline([
  A.map((value) => value * 2),
  A.filter((value) => value > 2),
])
const plan = Object.freeze({
  ...vetted,
  shape: Object.freeze({ codes: vetted.codes, segments: vetted.segments }),
})
const baseline = Object.freeze({
  fpInstanceToken: plan.instanceToken,
  fpIdentity: plan.identity,
  optimizerBank: Optimizer.bankIdentity,
  requestedMode: plan.mode,
  planMode: plan.mode,
  layout: plan.layout,
  fullyTrusted: plan.fullyTrusted,
  shape: {
    codes: plan.codes,
    segments: plan.segments,
    bindingCount: plan.bindings.length,
  },
})
Optimizer.beginSelectionTrace()
const baselineDecision = Optimizer.evaluateCompatibility(baseline)
const accepted = Optimizer.__s11rCompileVettedPlan(plan, 'exact', baseline)(source)
const acceptedEvents = Optimizer.endSelectionTrace()
const acceptedRunnerIds = acceptedEvents
  .filter((event) => event.phase === 'executed')
  .map((event) => event.runnerId)
  .sort()
assert.deepEqual(accepted, [4, 6, 8])
assert.equal(baselineDecision.eligible, ${JSON.stringify(expectedBaselineSpecialized)}, 'baseline compatibility differs from physical layout')
assert.equal(acceptedRunnerIds.length > 0, ${JSON.stringify(expectedBaselineSpecialized)}, 'baseline production disposition differs from physical layout')
const changedHash = (value, digit) => {
  const candidate = 'sha256:' + digit.repeat(64)
  return candidate === value ? 'sha256:' + (digit === '0' ? '1' : '0').repeat(64) : candidate
}
const variants = [
  ['abi-version', { fpIdentity: { ...baseline.fpIdentity, abiVersion: baseline.fpIdentity.abiVersion + 1 } }],
  ['protocol-version', { fpIdentity: { ...baseline.fpIdentity, protocolVersion: baseline.fpIdentity.protocolVersion + 1 } }],
  ['semantic-manifest-hash', { fpIdentity: { ...baseline.fpIdentity, semanticManifestHash: changedHash(baseline.fpIdentity.semanticManifestHash, '0') } }],
  ['runner-schema-hash', { fpIdentity: { ...baseline.fpIdentity, runnerSchemaHash: changedHash(baseline.fpIdentity.runnerSchemaHash, '1') } }],
  ['binding-schema-hash', { fpIdentity: { ...baseline.fpIdentity, bindingSchemaHash: changedHash(baseline.fpIdentity.bindingSchemaHash, '2') } }],
  ['consume-schema-hash', { fpIdentity: { ...baseline.fpIdentity, consumeSchemaHash: changedHash(baseline.fpIdentity.consumeSchemaHash, '3') } }],
  ['execution-contract-hash', { fpIdentity: { ...baseline.fpIdentity, executionContractHash: changedHash(baseline.fpIdentity.executionContractHash, '4') } }],
  ['bank-schema-version', { optimizerBank: { ...baseline.optimizerBank, schemaVersion: baseline.optimizerBank.schemaVersion + 1 } }],
  ['bank-hash', { optimizerBank: { ...baseline.optimizerBank, bankHash: changedHash(baseline.optimizerBank.bankHash, '5') } }],
  ['bank-semantic-manifest-hash', { optimizerBank: { ...baseline.optimizerBank, semanticManifestHash: changedHash(baseline.optimizerBank.semanticManifestHash, '6') } }],
  ['bank-runner-count', { optimizerBank: { ...baseline.optimizerBank, runnerCount: baseline.optimizerBank.runnerCount + 1 } }],
  ['semantic-mode', { requestedMode: 'pure' }],
  ['layout', { layout: 'sparse-array' }],
  ['shape', { shape: { ...baseline.shape, bindingCount: baseline.shape.bindingCount + 1 } }],
  ['trust', { fullyTrusted: false }],
  ['duplicate-instance', { fpInstanceToken: {} }],
]
const exact = ABI.runExactFallback(plan, source)
const rejections = variants.map(([name, patch]) => {
  const candidate = { ...baseline, ...patch }
  const decision = Optimizer.evaluateCompatibility(candidate)
  assert.equal(decision.eligible, false, name + ' evaluator accepted mismatch')
  Optimizer.beginSelectionTrace()
  const result = Optimizer.__s11rCompileVettedPlan(plan, 'exact', candidate)(source)
  const events = Optimizer.endSelectionTrace()
  const executedRunnerIds = events
    .filter((event) => event.phase === 'executed')
    .map((event) => event.runnerId)
    .sort()
  assert.deepEqual(result, exact, name + ' production fallback changed result')
  assert.deepEqual(executedRunnerIds, [], name + ' production fallback executed a specialized runner')
  return {
    name,
    reason: decision.reason,
    result,
    executedRunnerIds,
  }
})
process.stdout.write(JSON.stringify({
  accepted: {
    result: accepted,
    eligible: baselineDecision.eligible,
    reason: baselineDecision.eligible ? null : baselineDecision.reason,
    executedRunnerIds: acceptedRunnerIds,
  },
  rejections,
}))
`,
  )
}

function runInstrumentedExecutionMismatches(scratch, records, tarballs) {
  return LAYOUT_NAMES.flatMap((layout) => {
    const sides = layout.startsWith('duplicate-') ? ['primary', 'secondary'] : ['primary']
    return sides.map((side) => {
      const root = join(scratch, 'instrumented-production-gate', layout, side)
      const { application, installed } = installLayoutSide(root, layout, side, records, tarballs)
      const instrumentation = instrumentOptimizerExecutionGate(
        installed.get('@stopcock/fp-optimizer'),
      )
      const path = join(application, 'probe.mjs')
      const expectedBaselineSpecialized = !(
        layout === 'duplicate-fp-shared-optimizer' && side === 'secondary'
      )
      writeInstrumentedExecutionProbe(path, expectedBaselineSpecialized)
      return {
        layout,
        side,
        expectedBaselineSpecialized,
        instrumentation,
        ...runProbe(path, `instrumented production compatibility gate ${layout}/${side}`),
      }
    })
  }).sort((left, right) => compare(`${left.layout}/${left.side}`, `${right.layout}/${right.side}`))
}

function assertCompatibilityCoverage(instrumentedLayouts) {
  const required = [
    'abi-version',
    'protocol-version',
    'semantic-manifest-hash',
    'runner-schema-hash',
    'binding-schema-hash',
    'consume-schema-hash',
    'execution-contract-hash',
    'bank-schema-version',
    'bank-hash',
    'bank-semantic-manifest-hash',
    'bank-runner-count',
    'semantic-mode',
    'layout',
    'shape',
    'trust',
    'duplicate-instance',
  ]
  for (const layout of instrumentedLayouts) {
    const label = `${layout.layout}/${layout.side}`
    assert(
      layout.accepted?.eligible === layout.expectedBaselineSpecialized &&
        layout.accepted?.executedRunnerIds.length > 0 === layout.expectedBaselineSpecialized,
      `${label} baseline production disposition differs from its physical FP relationship`,
    )
    const observed = new Map(layout.rejections.map((entry) => [entry.name, entry]))
    for (const name of required) {
      const outcome = observed.get(name)
      assert(outcome !== undefined, `${label} ${name} did not run through the production gate`)
      assert(
        Array.isArray(outcome.executedRunnerIds) && outcome.executedRunnerIds.length === 0,
        `${label} ${name} executed a specialized runner`,
      )
      assert(
        JSON.stringify(outcome.result) === JSON.stringify([4, 6, 8]),
        `${label} ${name} exact fallback changed`,
      )
      assert(
        typeof outcome.reason === 'string' && outcome.reason.length > 0,
        `${label} ${name} has no reason`,
      )
    }
  }
}

function optimizerExecutionReceipt(probe, artifacts, mutation = null) {
  const eligible = probe.compatibilityDecision?.eligible === true
  const mismatchReason = eligible
    ? null
    : typeof probe.compatibilityDecision?.reason === 'string'
      ? probe.compatibilityDecision.reason
      : probe.negotiationFailure
  const installedArtifacts = Object.fromEntries(
    ['fp', 'compiler', 'optimizer'].map((packageName) => {
      const baseTarballHash = artifacts[packageName]
      if (mutation?.package !== packageName) {
        return [
          packageName,
          {
            kind: 'selected-tarball',
            baseTarballHash,
          },
        ]
      }
      const derivedCore = {
        kind: 'deterministic-qualification-mutation',
        baseTarballHash,
        target: mutation.target,
        property: mutation.property,
        beforeBundleSha256: mutation.beforeSha256,
        afterBundleSha256: mutation.afterSha256,
        effectivePackage: mutation.effectivePackage,
      }
      return [
        packageName,
        {
          ...derivedCore,
          effectiveArtifactHash: sha256(Buffer.from(JSON.stringify(derivedCore))),
        },
      ]
    }),
  )
  const core = {
    kind: 'stopcock.optimizer-execution-receipt',
    schemaVersion: 1,
    fpArtifactHash: artifacts.fp,
    compilerArtifactHash: artifacts.compiler,
    optimizerArtifactHash: artifacts.optimizer,
    installedArtifacts,
    qualificationMutation:
      mutation === null
        ? null
        : {
            target: mutation.target,
            package: mutation.package,
            property: mutation.property,
            beforeSha256: mutation.beforeSha256,
            afterSha256: mutation.afterSha256,
            effectivePackage: mutation.effectivePackage,
          },
    fpAbiHash: sha256(Buffer.from(JSON.stringify(probe.fpIdentity))),
    fpAbiIdentity: probe.fpIdentity,
    semanticManifestHash: probe.fpIdentity.semanticManifestHash,
    optimizerBankHash: probe.optimizerBankIdentity.bankHash,
    optimizerBankIdentity: probe.optimizerBankIdentity,
    selectedRunnerIds: probe.selectedRunnerIds,
    executedRunnerIds: probe.executedRunnerIds,
    disposition: probe.executedRunnerIds.length > 0 ? 'executed' : 'exact-fallback',
    fallbackRunnerId: probe.executedRunnerIds.length > 0 ? null : 'fp/compact-exact',
    negotiationMismatchReason: mismatchReason,
    resultHash: sha256(Buffer.from(JSON.stringify(probe.result))),
  }
  assert(
    (core.disposition === 'executed') === eligible,
    'optimizer execution receipt disagrees with compatibility decision',
  )
  return {
    receiptId: sha256(Buffer.from(JSON.stringify(core))),
    ...core,
  }
}

function bindExecutionReceipts(layouts, physicalMismatches, artifacts) {
  const boundLayouts = layouts.map((layout) => ({
    ...layout,
    primary: {
      ...layout.primary,
      executionReceipt: optimizerExecutionReceipt(layout.primary, artifacts),
    },
    secondary:
      layout.secondary === undefined
        ? undefined
        : {
            ...layout.secondary,
            executionReceipt: optimizerExecutionReceipt(layout.secondary, artifacts),
          },
  }))
  const boundPhysical = physicalMismatches.map((entry) => ({
    ...entry,
    result: {
      ...entry.result,
      executionReceipt: optimizerExecutionReceipt(entry.result, artifacts, entry.mutation),
    },
  }))
  return { layouts: boundLayouts, physicalMismatches: boundPhysical }
}

function materialiseAndProbe(manifestPath, selected, cohortManifest) {
  const scratch = mkdtempSync(join(tmpdir(), 'stopcock-s11r-extracted-layouts-'))
  try {
    const records = new Map(selected.map((record) => [record.name, record]))
    const tarballs = new Map(
      selected.map((record) => {
        const path = resolveTarball(manifestPath, record)
        validateArchive(path, record.name)
        return [record.name, path]
      }),
    )
    const packageEvidence = selected
      .map((record) => collectPackageEvidence(record, tarballs.get(record.name), scratch))
      .sort((left, right) => compare(left.name, right.name))
    const evidence = new Map(packageEvidence.map((entry) => [entry.name, entry]))
    assertPackageGraph(evidence)

    const layouts = [
      runStandardLayout(scratch, 'ordinary', records, tarballs, cohortManifest),
      runStandardLayout(scratch, 'hoisted', records, tarballs, cohortManifest),
      runStandardLayout(scratch, 'isolated', records, tarballs, cohortManifest),
      runDuplicateSharedLayout(scratch, records, tarballs),
      runDuplicateSeparateLayout(scratch, records, tarballs),
    ].sort((left, right) => compare(left.layout, right.layout))
    assert(
      JSON.stringify(layouts.map((entry) => entry.layout)) ===
        JSON.stringify([...LAYOUT_NAMES].sort(compare)),
      'layout set is incomplete',
    )
    const baseline = layouts.find((entry) => entry.layout === 'ordinary').primary
    assert(
      JSON.stringify(baseline.fpIdentity) === JSON.stringify(baseline.optimizerExpectedIdentity),
      'matching extracted FP/optimizer identity differs',
    )
    const physicalMismatches = runPhysicalMismatches(
      scratch,
      records,
      tarballs,
      baseline.fpIdentity,
      baseline.optimizerBankIdentity,
    )
    const instrumentedExecutionMismatches = runInstrumentedExecutionMismatches(
      scratch,
      records,
      tarballs,
    )
    assertCompatibilityCoverage(instrumentedExecutionMismatches)
    const fpOnly = runFpOnlyLayout(scratch, records, tarballs)
    const artifactHashes = {
      fp: records.get('@stopcock/fp').tarball.sha256,
      compiler: records.get('@stopcock/fp-compiler').tarball.sha256,
      optimizer: records.get('@stopcock/fp-optimizer').tarball.sha256,
    }
    const bound = bindExecutionReceipts(layouts, physicalMismatches, artifactHashes)
    const fp = evidence.get('@stopcock/fp').footprint
    const compiler = evidence.get('@stopcock/fp-compiler').footprint
    const optimizer = evidence.get('@stopcock/fp-optimizer').footprint
    return {
      packageEvidence,
      packageGraph: {
        fpHasNoOptimizerEdge: true,
        optimizerExactFpPeer: evidence.get('@stopcock/fp').version,
        compilerExactFpPeer: evidence.get('@stopcock/fp').version,
      },
      installedFootprints: {
        fpOnly: fp,
        fpPlusOptimizer: {
          bytes: fp.bytes + optimizer.bytes,
          files: fp.files + optimizer.files,
        },
        fpPlusCompiler: {
          bytes: fp.bytes + compiler.bytes,
          files: fp.files + compiler.files,
        },
        combined: {
          bytes: fp.bytes + compiler.bytes + optimizer.bytes,
          files: fp.files + compiler.files + optimizer.files,
        },
      },
      fpOnly,
      layouts: bound.layouts,
      physicalMismatches: bound.physicalMismatches,
      instrumentedExecutionMismatches,
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

async function main() {
  const { manifest: manifestPath, out } = parseArgs(process.argv.slice(2))
  const {
    value: manifest,
    bytes: manifestBytes,
    selected,
  } = await validateLayoutManifest(manifestPath)
  const first = materialiseAndProbe(manifestPath, selected, manifest)
  const second = materialiseAndProbe(manifestPath, selected, manifest)
  const tarballs = selected
    .map((record) => ({
      name: record.name,
      version: record.version,
      sha256: record.tarball.sha256,
      bytes: record.tarball.bytes,
    }))
    .sort((left, right) => compare(left.name, right.name))
  const envelope = (evidence) => ({
    schemaVersion: OUT_SCHEMA_VERSION,
    kind: OUT_KIND,
    cohort: {
      contentHash: manifest.cohortContentHash,
      manifestSha256: sha256(manifestBytes),
      mode: manifest.mode,
      target: manifest.target,
    },
    tarballs,
    ...evidence,
  })
  const bytes = canonicalJson(envelope(first))
  const secondBytes = canonicalJson(envelope(second))
  assert(bytes === secondBytes, 'two independent extracted materialisations differ')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, bytes)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
