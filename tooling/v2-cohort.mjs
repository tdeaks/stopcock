#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const READINESS_INVENTORY = 'docs/superpowers/contracts/stopcock-v2-package-cohort-readiness.json'
const OPTIMIZER_TOPOLOGY_DECISION = 'artifacts/v2/optimizer-topology-decision.json'
const LEDGER_PATH = 'STOPCOCK_V2_PROGRESS.md'
const SYNTH_PACKAGE = '@stopcock/synth'
const CONDITIONAL_OPTIMIZER_PACKAGE = '@stopcock/fp-optimizer'
const NEXT_TARGET = /^2\.0\.0-next\.(0|[1-9]\d*)$/u
const STABLE_TARGET = '2.0.0'
const COHORT_MANIFEST_KIND = 'stopcock-v2-cohort'
const COHORT_MANIFEST_SCHEMA_VERSION = 1
const SHA256_ID = /^sha256:[0-9a-f]{64}$/u
const PACKED_SECTIONS = Object.freeze([
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'devDependencies',
])
const COHORT_BUILD_INPUT_PATHS = Object.freeze([
  '.changeset/config.json',
  '.changeset/pre.json',
  'artifacts/v2/optimizer-topology-decision.json',
  'bun.lock',
  'docs/superpowers/contracts/stopcock-v2-package-cohort-readiness.json',
  'package.json',
  'tsconfig.base.json',
  'tooling/build-package.mjs',
  'tooling/fix-declaration-specifiers.mjs',
  'tooling/pack.config.ts',
  'tooling/v2-cohort.mjs',
  'tooling/v2-pack-cohort.mjs',
])
const INTERNAL_SECTIONS = Object.freeze([
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'devDependencies',
])

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const moduleRequire = createRequire(import.meta.url)
let changesetsRuntime

export class CohortError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CohortError'
  }
}

const fail = (message) => {
  throw new CohortError(message)
}

const assert = (condition, message) => {
  if (!condition) fail(message)
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const jsonBytes = (value) => `${JSON.stringify(value, null, 2)}\n`

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

const toPosixPath = (path) => path.split(sep).join('/')

const summarizeFileEntries = (entries) => {
  const sorted = [...entries].sort((left, right) => left.path.localeCompare(right.path))
  return {
    sha256: sha256(jsonBytes(sorted)),
    fileCount: sorted.length,
    bytes: sorted.reduce((total, entry) => total + entry.bytes, 0),
  }
}

const canonicalJsonValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJsonValue)
  if (!isObject(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalJsonValue(entry)]),
  )
}

const jsonValuesEqual = (left, right) =>
  JSON.stringify(canonicalJsonValue(left)) === JSON.stringify(canonicalJsonValue(right))

const assertRegularContainedPath = ({ root, path, terminal, label }) => {
  const resolvedRoot = resolve(root)
  const resolvedPath = resolve(path)
  const local = relative(resolvedRoot, resolvedPath)
  assert(
    local !== '' && !local.startsWith(`..${sep}`) && local !== '..' && !local.startsWith(sep),
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

export const hashDirectoryTree = (
  root,
  { excludeTopLevel = [], requireFiles = true, label = relative(repositoryRoot, root) } = {},
) => {
  const resolvedRoot = resolve(root)
  assert(existsSync(resolvedRoot), `${label} does not exist`)
  assert(lstatSync(resolvedRoot).isDirectory(), `${label} must be a directory`)
  const excluded = new Set(excludeTopLevel)
  const entries = []

  const visit = (directory, localDirectory = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const localPath = localDirectory === '' ? entry.name : join(localDirectory, entry.name)
      if (localDirectory === '' && excluded.has(entry.name)) continue
      const path = join(directory, entry.name)
      const metadata = lstatSync(path)
      assert(
        !metadata.isSymbolicLink(),
        `${label} contains a symbolic link: ${toPosixPath(localPath)}`,
      )
      if (metadata.isDirectory()) {
        visit(path, localPath)
      } else {
        assert(metadata.isFile(), `${label} contains a non-file entry: ${toPosixPath(localPath)}`)
        const bytes = readFileSync(path)
        entries.push({
          path: toPosixPath(localPath),
          bytes: bytes.length,
          sha256: sha256(bytes),
        })
      }
    }
  }

  visit(resolvedRoot)
  assert(!requireFiles || entries.length > 0, `${label} contains no files`)
  return summarizeFileEntries(entries)
}

export const readCohortBuildInputs = (root = repositoryRoot) => {
  const resolvedRoot = resolve(root)
  return COHORT_BUILD_INPUT_PATHS.filter((path) => existsSync(join(resolvedRoot, path)))
    .map((path) => {
      const absolutePath = join(resolvedRoot, path)
      const metadata = lstatSync(absolutePath)
      assert(
        metadata.isFile() && !metadata.isSymbolicLink(),
        `cohort build input must be a regular file: ${path}`,
      )
      const bytes = readFileSync(absolutePath)
      return {
        path,
        sha256: sha256(bytes),
        bytes: bytes.length,
      }
    })
    .sort((left, right) => left.path.localeCompare(right.path))
}

const writeBytesIfChanged = (path, bytes) => {
  const next = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (existsSync(path) && readFileSync(path).equals(next)) return false
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, next)
  return true
}

const writeJsonIfChanged = (path, value) => writeBytesIfChanged(path, jsonBytes(value))

const parseTarget = (target, expectedKind = 'any') => {
  assert(typeof target === 'string' && target.length > 0, 'a target version is required')
  if (target === STABLE_TARGET) {
    assert(expectedKind !== 'next', `target must match 2.0.0-next.N, received ${target}`)
    return { kind: 'stable', version: target, number: null }
  }
  const match = NEXT_TARGET.exec(target)
  assert(match !== null, `target must be 2.0.0 or 2.0.0-next.N, received ${target}`)
  assert(expectedKind !== 'stable', `target must be 2.0.0, received ${target}`)
  return { kind: 'next', version: target, number: Number(match[1]) }
}

const clone = (value) => structuredClone(value)

const compareStrings = (left, right) => left.localeCompare(right)

const listFiles = (root) => {
  if (!existsSync(root)) return []
  const result = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) result.push(path)
    }
  }
  visit(root)
  return result
}

const isDirectChildOf = (path, parent) => {
  const local = relative(parent, path)
  return local !== '' && !local.startsWith(`..${sep}`) && !local.includes(sep)
}

const getDefaultExport = (value) => value?.default ?? value

const withCapturedConsole = async (operation) => {
  const captured = []
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  }
  const capture = (...values) => {
    captured.push(values.map((value) => String(value)).join(' '))
  }
  console.log = capture
  console.warn = capture
  console.error = capture
  try {
    return { value: await operation(), captured }
  } finally {
    console.log = original.log
    console.warn = original.warn
    console.error = original.error
  }
}

const withCapturedConsoleSync = (operation) => {
  const captured = []
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  }
  const capture = (...values) => {
    captured.push(values.map((value) => String(value)).join(' '))
  }
  console.log = capture
  console.warn = capture
  console.error = capture
  try {
    return { value: operation(), captured }
  } finally {
    console.log = original.log
    console.warn = original.warn
    console.error = original.error
  }
}

export const loadChangesetsRuntime = () => {
  if (changesetsRuntime !== undefined) return changesetsRuntime

  const cliPackagePath = moduleRequire.resolve('@changesets/cli/package.json')
  const changesetsRequire = createRequire(cliPackagePath)
  changesetsRuntime = Object.freeze({
    getPackages: changesetsRequire('@manypkg/get-packages').getPackages,
    readConfig: changesetsRequire('@changesets/config').read,
    readChangesets: getDefaultExport(changesetsRequire('@changesets/read')),
    assembleReleasePlan: getDefaultExport(changesetsRequire('@changesets/assemble-release-plan')),
    applyReleasePlan: getDefaultExport(changesetsRequire('@changesets/apply-release-plan')),
    deterministicChangelogPath: changesetsRequire.resolve('@changesets/cli/changelog'),
    enterPre: changesetsRequire('@changesets/pre').enterPre,
    exitPre: changesetsRequire('@changesets/pre').exitPre,
    readPreState: changesetsRequire('@changesets/pre').readPreState,
  })
  return changesetsRuntime
}

const validateInventory = (inventory) => {
  assert(isObject(inventory), 'the S0 readiness inventory must be an object')
  assert(inventory.schemaVersion === 1, 'the S0 readiness inventory must use schemaVersion 1')
  assert(isObject(inventory.cohort), 'the S0 readiness inventory has no cohort')
  assert(
    Array.isArray(inventory.cohort.public) &&
      inventory.cohort.public.every((name) => typeof name === 'string'),
    'the S0 readiness inventory has an invalid public cohort',
  )
  assert(
    JSON.stringify(inventory.cohort.privateCompatibility) === JSON.stringify([SYNTH_PACKAGE]),
    `the private compatibility cohort must contain only ${SYNTH_PACKAGE}`,
  )
  assert(Array.isArray(inventory.packages), 'the S0 readiness inventory has no package records')

  const records = new Map()
  for (const record of inventory.packages) {
    assert(
      isObject(record) && typeof record.name === 'string' && isObject(record.disposition),
      'the S0 readiness inventory contains an invalid package record',
    )
    assert(!records.has(record.name), `the S0 readiness inventory duplicates ${record.name}`)
    records.set(record.name, record)
  }
  for (const name of [...inventory.cohort.public, SYNTH_PACKAGE]) {
    assert(records.has(name), `the S0 readiness inventory has no record for ${name}`)
  }
  return records
}

const workspaceName = (workspace) => workspace.packageJson.name

const sortWorkspaces = (workspaces) =>
  [...workspaces].sort((left, right) => workspaceName(left).localeCompare(workspaceName(right)))

const readOptionalJson = (path) => (existsSync(path) ? readJson(path) : undefined)

const readOptimizerTopologyDecision = (root, basePublic) => {
  const path = join(root, OPTIMIZER_TOPOLOGY_DECISION)
  if (!existsSync(path)) return undefined
  const decision = readJson(path)
  assert(isObject(decision), 'the S10J optimizer topology decision must be an object')
  assert(
    decision.schemaVersion === 1,
    'the S10J optimizer topology decision must use schemaVersion 1',
  )
  assert(
    ['same-package', 'direct-opt-in-package'].includes(decision.topology),
    'the S10J optimizer topology must be same-package or direct-opt-in-package',
  )
  const expected =
    decision.topology === 'direct-opt-in-package'
      ? [...basePublic, CONDITIONAL_OPTIMIZER_PACKAGE]
      : [...basePublic]
  assert(
    Array.isArray(decision.selectedPublicCohort) &&
      new Set(decision.selectedPublicCohort).size === decision.selectedPublicCohort.length &&
      JSON.stringify([...decision.selectedPublicCohort].sort(compareStrings)) ===
        JSON.stringify(expected.sort(compareStrings)),
    'the S10J optimizer topology selectedPublicCohort does not match its topology',
  )
  assert(
    decision.selectedPublicCount === expected.length,
    'the S10J optimizer topology selectedPublicCount is stale',
  )
  return decision
}

const readCohortContext = async ({
  root,
  runtime,
  allowConditionalOptimizer = true,
  requiredJoinPackage,
}) => {
  const inventoryPath = join(root, READINESS_INVENTORY)
  assert(existsSync(inventoryPath), `missing S0 readiness inventory: ${READINESS_INVENTORY}`)
  const inventory = readJson(inventoryPath)
  const readinessRecords = validateInventory(inventory)
  const packages = await runtime.getPackages(root)
  const workspaceByName = new Map()

  for (const workspace of packages.packages) {
    const name = workspaceName(workspace)
    assert(typeof name === 'string' && name.length > 0, `workspace ${workspace.dir} has no name`)
    assert(!workspaceByName.has(name), `workspace name is duplicated: ${name}`)
    workspaceByName.set(name, workspace)
  }

  const packagesRoot = join(root, 'packages')
  const libraryWorkspaces = sortWorkspaces(
    packages.packages.filter((workspace) => isDirectChildOf(resolve(workspace.dir), packagesRoot)),
  )
  const libraryNames = new Set(libraryWorkspaces.map(workspaceName))
  const basePublic = [...inventory.cohort.public]
  assert(
    new Set(basePublic).size === basePublic.length,
    'the S0 readiness public cohort contains duplicates',
  )

  for (const name of basePublic) {
    const workspace = workspaceByName.get(name)
    assert(workspace !== undefined, `selected public package is missing: ${name}`)
    assert(workspace.packageJson.private !== true, `selected public package is private: ${name}`)
    assert(libraryNames.has(name), `selected public package is outside packages/*: ${name}`)
  }

  const synth = workspaceByName.get(SYNTH_PACKAGE)
  assert(synth !== undefined, `private compatibility package is missing: ${SYNTH_PACKAGE}`)
  assert(synth.packageJson.private === true, `${SYNTH_PACKAGE} must remain private`)
  assert(libraryNames.has(SYNTH_PACKAGE), `${SYNTH_PACKAGE} must remain under packages/*`)

  const preState = readOptionalJson(join(root, '.changeset', 'pre.json'))
  const optimizerDecision = readOptimizerTopologyDecision(root, basePublic)
  const livePublicLibraries = libraryWorkspaces.filter(
    (workspace) => workspace.packageJson.private !== true,
  )
  const extras = livePublicLibraries
    .map(workspaceName)
    .filter((name) => !basePublic.includes(name))
    .sort(compareStrings)
  let allowedExtras = []
  if (
    allowConditionalOptimizer &&
    extras.length === 1 &&
    extras[0] === CONDITIONAL_OPTIMIZER_PACKAGE
  ) {
    const baseVersions = [
      ...new Set(basePublic.map((name) => workspaceByName.get(name).packageJson.version)),
    ]
    const optimizer = workspaceByName.get(CONDITIONAL_OPTIMIZER_PACKAGE)
    const joinedInActiveTrain =
      preState?.mode === 'pre' &&
      preState.tag === 'next' &&
      Object.hasOwn(preState.initialVersions ?? {}, CONDITIONAL_OPTIMIZER_PACKAGE) &&
      baseVersions.length === 1 &&
      NEXT_TARGET.test(baseVersions[0]) &&
      optimizer.packageJson.version === baseVersions[0]
    const decisionSelectsOptimizer = optimizerDecision?.topology === 'direct-opt-in-package'
    if (requiredJoinPackage === CONDITIONAL_OPTIMIZER_PACKAGE) {
      allowedExtras = extras
    } else {
      assert(
        joinedInActiveTrain || decisionSelectsOptimizer,
        `${CONDITIONAL_OPTIMIZER_PACKAGE} exists but has not joined the cohort; run join-current first`,
      )
      allowedExtras = extras
    }
  }
  assert(
    JSON.stringify(extras) === JSON.stringify(allowedExtras),
    `unexpected public packages/* outside the frozen S0 cohort: ${extras.join(', ') || 'none'}`,
  )
  if (optimizerDecision?.topology === 'direct-opt-in-package') {
    assert(
      extras.includes(CONDITIONAL_OPTIMIZER_PACKAGE),
      'the S10J direct-opt-in-package decision requires @stopcock/fp-optimizer',
    )
  } else if (optimizerDecision?.topology === 'same-package') {
    assert(
      !extras.includes(CONDITIONAL_OPTIMIZER_PACKAGE),
      'the S10J same-package decision forbids @stopcock/fp-optimizer',
    )
  }

  const privateLibraries = libraryWorkspaces.filter(
    (workspace) => workspace.packageJson.private === true,
  )
  assert(
    privateLibraries.length === 1 && workspaceName(privateLibraries[0]) === SYNTH_PACKAGE,
    `packages/* may contain no private workspace other than ${SYNTH_PACKAGE}`,
  )

  if (requiredJoinPackage !== undefined) {
    assert(
      requiredJoinPackage === CONDITIONAL_OPTIMIZER_PACKAGE,
      `join-current may add only ${CONDITIONAL_OPTIMIZER_PACKAGE}`,
    )
    assert(
      extras.includes(requiredJoinPackage),
      `${requiredJoinPackage} must exist outside the frozen S0 inventory before join-current`,
    )
  }

  const selectedPublicNames = [...basePublic, ...allowedExtras]
  const selectedPublicSet = new Set(selectedPublicNames)
  const selectedPublic = sortWorkspaces(
    selectedPublicNames.map((name) => workspaceByName.get(name)),
  )
  const excludedPrivate = sortWorkspaces(
    packages.packages.filter(
      (workspace) =>
        !selectedPublicSet.has(workspaceName(workspace)) &&
        workspaceName(workspace) !== SYNTH_PACKAGE,
    ),
  )
  for (const workspace of excludedPrivate) {
    assert(
      workspace.packageJson.private === true,
      `non-cohort workspace must remain private: ${workspaceName(workspace)}`,
    )
  }

  const blocked = basePublic.filter((name) => {
    const status = readinessRecords.get(name)?.disposition?.status
    return status !== 'ready'
  })

  return {
    root,
    inventory,
    readinessRecords,
    packages,
    workspaceByName,
    selectedPublic,
    selectedPublicNames: selectedPublic.map(workspaceName),
    selectedPublicSet,
    synth,
    excludedPrivate,
    blocked,
    conditionalOptimizerJoined: allowedExtras.length === 1,
    optimizerTopology: optimizerDecision?.topology ?? null,
  }
}

const classifyChangesets = (changesets, context) => {
  const publicChangesets = []
  const privateChangesets = []
  const ids = new Set()

  for (const changeset of [...changesets].sort((left, right) => left.id.localeCompare(right.id))) {
    assert(
      typeof changeset.id === 'string' && /^[a-z0-9][a-z0-9._-]*$/u.test(changeset.id),
      'changeset IDs must be stable lowercase identifiers',
    )
    assert(!ids.has(changeset.id), `changeset ID is duplicated: ${changeset.id}`)
    ids.add(changeset.id)
    assert(
      Array.isArray(changeset.releases) && changeset.releases.length > 0,
      `changeset ${changeset.id} has no releases`,
    )

    const releaseNames = [...new Set(changeset.releases.map((release) => release.name))]
    for (const name of releaseNames) {
      assert(context.workspaceByName.has(name), `changeset ${changeset.id} names unknown ${name}`)
    }
    const selected = releaseNames.filter((name) => context.selectedPublicSet.has(name))
    const excluded = releaseNames.filter((name) => !context.selectedPublicSet.has(name))
    if (selected.length > 0 && excluded.length > 0) {
      fail(
        `mixed public/private changeset ${changeset.id} must be split explicitly: public ${selected.join(
          ', ',
        )}; excluded ${excluded.join(', ')}`,
      )
    }
    if (selected.length > 0) publicChangesets.push(changeset)
    else privateChangesets.push(changeset)
  }

  return { publicChangesets, privateChangesets }
}

const expectedInternalRange = ({ section, currentRange, target }) => {
  const targetInfo = parseTarget(target)
  if (section === 'peerDependencies') {
    return targetInfo.kind === 'next' ? target : '^2.0.0'
  }
  if (section === 'devDependencies') return 'workspace:*'
  if (typeof currentRange === 'string' && currentRange.startsWith('workspace:')) {
    return 'workspace:*'
  }
  return targetInfo.kind === 'next' ? target : '^2.0.0'
}

const normalizeManifest = ({ manifest, target, selectedPublicSet, isSynth = false }) => {
  const normalized = clone(manifest)
  normalized.version = target
  if (isSynth) normalized.private = true

  for (const section of INTERNAL_SECTIONS) {
    if (!isObject(normalized[section])) continue
    for (const name of Object.keys(normalized[section]).sort(compareStrings)) {
      if (!name.startsWith('@stopcock/')) continue
      assert(
        selectedPublicSet.has(name),
        `${normalized.name} ${section} names non-cohort Stopcock package ${name}`,
      )
      normalized[section][name] = expectedInternalRange({
        section,
        currentRange: normalized[section][name],
        target,
      })
    }
  }
  return normalized
}

const manifestChanges = (before, after) => {
  const changes = []
  if (before.version !== after.version) {
    changes.push({
      section: 'manifest',
      name: 'version',
      from: before.version ?? null,
      to: after.version,
    })
  }
  for (const section of INTERNAL_SECTIONS) {
    const beforeSection = before[section] ?? {}
    const afterSection = after[section] ?? {}
    for (const name of [...new Set([...Object.keys(beforeSection), ...Object.keys(afterSection)])]
      .filter((entry) => entry.startsWith('@stopcock/'))
      .sort(compareStrings)) {
      if (beforeSection[name] !== afterSection[name]) {
        changes.push({
          section,
          name,
          from: beforeSection[name] ?? null,
          to: afterSection[name] ?? null,
        })
      }
    }
  }
  return changes
}

const simulatedPreState = (context, mode = 'pre') => ({
  mode,
  tag: 'next',
  initialVersions: Object.fromEntries(
    sortWorkspaces(context.packages.packages)
      .filter((workspace) => typeof workspace.packageJson.version === 'string')
      .map((workspace) => [workspaceName(workspace), workspace.packageJson.version]),
  ),
  changesets: [],
})

const makeNormalizedReleasePlan = ({ context, changesets, config, preState, target, runtime }) => {
  const assembledResult = withCapturedConsoleSync(() =>
    runtime.assembleReleasePlan(changesets, context.packages, config, preState),
  )
  const assembled = assembledResult.value
  const assembledByName = new Map(
    assembled.releases
      .filter((release) => context.selectedPublicSet.has(release.name))
      .map((release) => [release.name, release]),
  )
  const filteredExcludedReleases = assembled.releases
    .filter((release) => !context.selectedPublicSet.has(release.name))
    .map((release) => release.name)
    .sort(compareStrings)
  const releases = context.selectedPublic.map((workspace) => {
    const name = workspaceName(workspace)
    const assembledRelease = assembledByName.get(name)
    return {
      name,
      type: assembledRelease?.type ?? 'patch',
      oldVersion: workspace.packageJson.version,
      changesets: [...(assembledRelease?.changesets ?? [])].sort(compareStrings),
      newVersion: target,
    }
  })
  return {
    changesets: assembled.changesets,
    releases,
    preState: assembled.preState,
    diagnostics: assembledResult.captured,
    filteredExcludedReleases,
  }
}

const snapshotEntry = (path) => ({
  exists: existsSync(path),
  bytes: existsSync(path) ? readFileSync(path) : null,
})

const snapshotPrivateWorkspaceState = (context) => {
  const entries = []
  for (const workspace of [...context.excludedPrivate, context.synth]) {
    const includeManifest = workspaceName(workspace) !== SYNTH_PACKAGE
    for (const filename of includeManifest ? ['package.json', 'CHANGELOG.md'] : ['CHANGELOG.md']) {
      const path = join(workspace.dir, filename)
      entries.push({
        package: workspaceName(workspace),
        path,
        relativePath: relative(context.root, path),
        ...snapshotEntry(path),
      })
    }
  }
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

const assertSnapshotUnchanged = (snapshot, label) => {
  for (const entry of snapshot) {
    const current = snapshotEntry(entry.path)
    assert(
      current.exists === entry.exists &&
        (current.bytes === null || current.bytes.equals(entry.bytes)),
      `${label} mutated excluded private state: ${entry.relativePath}`,
    )
  }
}

const snapshotControlledState = (context) => {
  const paths = new Set([
    join(context.root, 'bun.lock'),
    join(context.root, '.changeset', 'pre.json'),
  ])
  for (const path of listFiles(join(context.root, '.changeset'))) paths.add(path)
  for (const workspace of context.packages.packages) {
    paths.add(join(workspace.dir, 'package.json'))
    paths.add(join(workspace.dir, 'CHANGELOG.md'))
  }
  return new Map([...paths].sort(compareStrings).map((path) => [path, snapshotEntry(path)]))
}

const currentControlledPaths = (context) => {
  const paths = new Set([
    join(context.root, 'bun.lock'),
    join(context.root, '.changeset', 'pre.json'),
  ])
  for (const path of listFiles(join(context.root, '.changeset'))) paths.add(path)
  for (const workspace of context.packages.packages) {
    paths.add(join(workspace.dir, 'package.json'))
    paths.add(join(workspace.dir, 'CHANGELOG.md'))
  }
  return paths
}

const restoreControlledState = (context, snapshot) => {
  for (const path of currentControlledPaths(context)) {
    if (!snapshot.has(path) && existsSync(path) && statSync(path).isFile()) unlinkSync(path)
  }
  for (const [path, entry] of snapshot) {
    if (entry.exists) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, entry.bytes)
    } else if (existsSync(path) && statSync(path).isFile()) {
      unlinkSync(path)
    }
  }
}

const runTransaction = async (context, operation) => {
  const snapshot = snapshotControlledState(context)
  try {
    return await operation()
  } catch (error) {
    restoreControlledState(context, snapshot)
    throw error
  }
}

const normalizeChangelogHeading = (workspace, target) => {
  const path = join(workspace.dir, 'CHANGELOG.md')
  const heading = `## ${target}`
  const current = existsSync(path) ? readFileSync(path, 'utf8') : `# ${workspaceName(workspace)}\n`
  const versionHeading = /^## ([^\r\n]+)\r?$/gmu
  const headings = [...current.matchAll(versionHeading)]
  const matching = headings.filter((match) => match[1].trim() === target)

  if (matching.length > 1) {
    const targetBodies = matching
      .map((match) => {
        const index = headings.indexOf(match)
        const end = headings[index + 1]?.index ?? current.length
        return current.slice(match.index + match[0].length, end).trim()
      })
      .filter((body) => body.length > 0)
    const sections = []
    let emittedTarget = false
    for (let index = 0; index < headings.length; index += 1) {
      const match = headings[index]
      const end = headings[index + 1]?.index ?? current.length
      if (match[1].trim() === target) {
        if (!emittedTarget) {
          sections.push(
            `${heading}${targetBodies.length > 0 ? `\n\n${targetBodies.join('\n\n')}` : ''}`,
          )
          emittedTarget = true
        }
      } else {
        sections.push(current.slice(match.index, end).trim())
      }
    }
    const preamble = current.slice(0, headings[0].index).trimEnd()
    return writeBytesIfChanged(path, `${[preamble, ...sections].join('\n\n')}\n`)
  }
  if (matching.length === 1) return false

  const titleMatch = /^# [^\r\n]+\r?\n/u.exec(current)
  const title = titleMatch?.[0] ?? `# ${workspaceName(workspace)}\n`
  const rest = titleMatch === null ? current : current.slice(title.length).replace(/^\r?\n/u, '')
  const targetInfo = parseTarget(target)
  const label = targetInfo.kind === 'next' ? 'prerelease' : 'stable'
  const section = `${heading}\n\n### Patch Changes\n\n- Align this package with the coordinated Stopcock 2.0 ${label} cohort.\n`
  const next = `${title}\n${section}${rest.length > 0 ? `\n${rest}` : ''}`
  return writeBytesIfChanged(path, next)
}

const applyNormalizedReleasePlan = async ({
  root,
  context,
  publicChangesets,
  config,
  preState,
  target,
  runtime,
  changelogContext,
}) => {
  const plan = makeNormalizedReleasePlan({
    context,
    changesets: publicChangesets,
    config,
    preState,
    target,
    runtime,
  })
  assert(
    typeof runtime.deterministicChangelogPath === 'string' &&
      runtime.deterministicChangelogPath.length > 0,
    'the Changesets runtime must provide a deterministic local changelog renderer',
  )
  await runtime.applyReleasePlan(
    plan,
    context.packages,
    {
      ...config,
      changelog: [runtime.deterministicChangelogPath, null],
    },
    undefined,
    changelogContext,
  )

  const changed = []
  for (const workspace of context.selectedPublic) {
    const manifestPath = join(workspace.dir, 'package.json')
    const normalized = normalizeManifest({
      manifest: readJson(manifestPath),
      target,
      selectedPublicSet: context.selectedPublicSet,
    })
    if (writeJsonIfChanged(manifestPath, normalized)) changed.push(relative(root, manifestPath))
    if (normalizeChangelogHeading(workspace, target)) {
      changed.push(relative(root, join(workspace.dir, 'CHANGELOG.md')))
    }
  }

  const synthManifestPath = join(context.synth.dir, 'package.json')
  const normalizedSynth = normalizeManifest({
    manifest: readJson(synthManifestPath),
    target,
    selectedPublicSet: context.selectedPublicSet,
    isSynth: true,
  })
  if (writeJsonIfChanged(synthManifestPath, normalizedSynth)) {
    changed.push(relative(root, synthManifestPath))
  }
  return { plan, changed: [...new Set(changed)].sort(compareStrings) }
}

const defaultLockfileUpdate = async (root) => {
  const result = spawnSync('bun', ['install', '--lockfile-only'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  assert(
    result.status === 0,
    `bun install --lockfile-only failed (${result.status ?? 'signal'}): ${
      result.stderr?.trim() || result.stdout?.trim() || 'no output'
    }`,
  )
}

const readOperationState = async ({ root, runtime, requiredJoinPackage }) => {
  const context = await readCohortContext({
    root,
    runtime,
    requiredJoinPackage,
  })
  const configResult = await withCapturedConsole(() => runtime.readConfig(root, context.packages))
  const [changesets, preState] = await Promise.all([
    runtime.readChangesets(root),
    runtime.readPreState(root),
  ])
  const classified = classifyChangesets(changesets, context)
  return {
    context,
    config: configResult.value,
    configDiagnostics: configResult.captured,
    changesets,
    preState,
    ...classified,
  }
}

const currentCohortVersion = (context) => {
  const versions = [
    ...new Set(context.selectedPublic.map((workspace) => workspace.packageJson.version)),
  ]
  assert(
    versions.length === 1,
    `public cohort versions are not aligned: ${versions.sort(compareStrings).join(', ')}`,
  )
  return versions[0]
}

const unconsumedPublicChangesets = (publicChangesets, preState) => {
  const consumed = new Set(preState?.changesets ?? [])
  return publicChangesets.filter((changeset) => !consumed.has(changeset.id))
}

export const planCohort = async ({
  root = repositoryRoot,
  target,
  runtime = loadChangesetsRuntime(),
} = {}) => {
  const targetInfo = parseTarget(target)
  const state = await readOperationState({ root: resolve(root), runtime })
  const planPreState =
    state.preState === undefined
      ? simulatedPreState(state.context, targetInfo.kind === 'stable' ? 'exit' : 'pre')
      : {
          ...clone(state.preState),
          mode: targetInfo.kind === 'stable' ? 'exit' : state.preState.mode,
        }
  const releasePlan = makeNormalizedReleasePlan({
    context: state.context,
    changesets: state.publicChangesets,
    config: state.config,
    preState: planPreState,
    target,
    runtime,
  })

  const publicPackages = state.context.selectedPublic.map((workspace) => {
    const proposed = normalizeManifest({
      manifest: workspace.packageJson,
      target,
      selectedPublicSet: state.context.selectedPublicSet,
    })
    const release = releasePlan.releases.find((entry) => entry.name === workspaceName(workspace))
    return {
      name: workspaceName(workspace),
      currentVersion: workspace.packageJson.version,
      proposedVersion: target,
      releaseType: release.type,
      changesets: release.changesets,
      manifestChanges: manifestChanges(workspace.packageJson, proposed),
    }
  })
  const synthProposed = normalizeManifest({
    manifest: state.context.synth.packageJson,
    target,
    selectedPublicSet: state.context.selectedPublicSet,
    isSynth: true,
  })
  const privateSnapshot = snapshotPrivateWorkspaceState(state.context)

  return {
    schemaVersion: 1,
    command: 'plan',
    target,
    targetKind: targetInfo.kind,
    cohort: {
      publicCount: publicPackages.length,
      privateCompatibilityCount: 1,
      conditionalOptimizerJoined: state.context.conditionalOptimizerJoined,
      optimizerTopology: state.context.optimizerTopology,
    },
    blockers: [...state.context.blocked].sort(compareStrings),
    changesetsDiagnostics: [...state.configDiagnostics, ...releasePlan.diagnostics],
    filteredExcludedReleases: releasePlan.filteredExcludedReleases,
    publicChangesets: state.publicChangesets.map((changeset) => changeset.id).sort(compareStrings),
    untouchedPrivateChangesets: state.privateChangesets
      .map((changeset) => changeset.id)
      .sort(compareStrings),
    publicPackages,
    privateCompatibility: {
      name: SYNTH_PACKAGE,
      currentVersion: state.context.synth.packageJson.version,
      proposedVersion: target,
      manifestChanges: manifestChanges(state.context.synth.packageJson, synthProposed),
      publication: 'excluded',
    },
    excludedPrivateWorkspaces: privateSnapshot
      .filter((entry) => entry.path.endsWith(`${sep}package.json`))
      .map((entry) => ({
        name: entry.package,
        manifest: entry.relativePath,
        sha256: entry.exists ? sha256(entry.bytes) : null,
        handling: 'byte-identical',
      })),
  }
}

const assertNoReadinessBlockers = (context) => {
  assert(
    context.blocked.length === 0,
    `the selected public cohort is not release-ready: ${context.blocked.join(', ')}`,
  )
}

const assertInternalRanges = (workspace, target, selectedPublicSet) => {
  const manifest = workspace.packageJson
  for (const section of INTERNAL_SECTIONS) {
    if (!isObject(manifest[section])) continue
    for (const [name, range] of Object.entries(manifest[section]).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (!name.startsWith('@stopcock/')) continue
      assert(
        selectedPublicSet.has(name),
        `${manifest.name} ${section} names non-cohort Stopcock package ${name}`,
      )
      const expected = expectedInternalRange({ section, currentRange: range, target })
      if (section === 'peerDependencies' && target === STABLE_TARGET) {
        assert(
          range === expected || range === STABLE_TARGET,
          `${manifest.name} ${section}.${name} must be ^2.0.0 or an exact 2.0.0 range; received ${range}`,
        )
      } else {
        assert(
          range === expected,
          `${manifest.name} ${section}.${name} must be ${expected}; received ${range}`,
        )
      }
    }
  }
}

export const checkCohort = async ({
  root = repositoryRoot,
  target,
  runtime = loadChangesetsRuntime(),
} = {}) => {
  const resolvedRoot = resolve(root)
  const state = await readOperationState({ root: resolvedRoot, runtime })
  assertNoReadinessBlockers(state.context)
  const selectedVersion = target ?? currentCohortVersion(state.context)
  const targetInfo = parseTarget(selectedVersion)

  for (const workspace of state.context.selectedPublic) {
    assert(
      workspace.packageJson.version === selectedVersion,
      `${workspaceName(workspace)} must be ${selectedVersion}; received ${workspace.packageJson.version}`,
    )
    assert(workspace.packageJson.private !== true, `${workspaceName(workspace)} must remain public`)
    assertInternalRanges(workspace, selectedVersion, state.context.selectedPublicSet)
  }
  assert(
    state.context.synth.packageJson.version === selectedVersion,
    `${SYNTH_PACKAGE} must be ${selectedVersion}; received ${state.context.synth.packageJson.version}`,
  )
  assert(state.context.synth.packageJson.private === true, `${SYNTH_PACKAGE} must remain private`)
  assertInternalRanges(state.context.synth, selectedVersion, state.context.selectedPublicSet)

  assert(
    Array.isArray(state.config.fixed) && state.config.fixed.length === 0,
    'the coordinated 2.0 train must not create a permanent Changesets fixed group',
  )
  assert(
    Array.isArray(state.config.linked) && state.config.linked.length === 0,
    'the coordinated 2.0 train must not create a permanent Changesets linked group',
  )
  assert(
    state.config.privatePackages?.version === false && state.config.privatePackages?.tag === false,
    'Changesets private package versioning/tagging must remain disabled',
  )

  if (targetInfo.kind === 'next') {
    assert(
      state.preState !== undefined,
      'an aligned prerelease cohort requires .changeset/pre.json',
    )
    assert(state.preState.mode === 'pre', 'the prerelease state must be in pre mode')
    assert(state.preState.tag === 'next', 'the prerelease state tag must be next')
  } else {
    assert(
      state.preState === undefined,
      'the stable cohort requires Changesets prerelease state to be exited',
    )
  }

  return {
    schemaVersion: 1,
    command: 'check',
    target: selectedVersion,
    targetKind: targetInfo.kind,
    publicCount: state.context.selectedPublic.length,
    privateCompatibilityCount: 1,
    conditionalOptimizerJoined: state.context.conditionalOptimizerJoined,
    optimizerTopology: state.context.optimizerTopology,
    pendingPublicChangesets: unconsumedPublicChangesets(state.publicChangesets, state.preState)
      .map((changeset) => changeset.id)
      .sort(compareStrings),
    untouchedPrivateChangesets: state.privateChangesets
      .map((changeset) => changeset.id)
      .sort(compareStrings),
  }
}

export const readCohortArtifactContext = async ({
  root = repositoryRoot,
  target,
  runtime = loadChangesetsRuntime(),
} = {}) => {
  parseTarget(target)
  const resolvedRoot = resolve(root)
  const check = await checkCohort({ root: resolvedRoot, target, runtime })
  const context = await readCohortContext({ root: resolvedRoot, runtime })
  return {
    root: resolvedRoot,
    target,
    check,
    selectedPublicNames: [...context.selectedPublicNames],
    selectedPublic: context.selectedPublic.map((workspace) => ({
      name: workspaceName(workspace),
      directory: toPosixPath(relative(resolvedRoot, workspace.dir)),
      path: resolve(workspace.dir),
      manifest: clone(workspace.packageJson),
    })),
    synth: {
      name: workspaceName(context.synth),
      directory: toPosixPath(relative(resolvedRoot, context.synth.dir)),
      path: resolve(context.synth.dir),
      manifest: clone(context.synth.packageJson),
    },
  }
}

const assertExactKeys = (value, expected, label) => {
  assert(isObject(value), `${label} must be an object`)
  const actual = Object.keys(value).sort(compareStrings)
  const wanted = [...expected].sort(compareStrings)
  assert(
    JSON.stringify(actual) === JSON.stringify(wanted),
    `${label} fields must be exactly ${wanted.join(', ')}; received ${actual.join(', ')}`,
  )
}

const assertSha256 = (value, label) => {
  assert(
    typeof value === 'string' && SHA256_ID.test(value),
    `${label} must be sha256:<64 lowercase hex>`,
  )
}

const assertByteIdentity = (value, label) => {
  assertExactKeys(value, ['bytes', 'sha256'], label)
  assert(
    Number.isSafeInteger(value.bytes) && value.bytes >= 0,
    `${label}.bytes must be non-negative`,
  )
  assertSha256(value.sha256, `${label}.sha256`)
}

const assertTreeIdentity = (value, label) => {
  assertExactKeys(value, ['bytes', 'fileCount', 'sha256'], label)
  assert(
    Number.isSafeInteger(value.bytes) && value.bytes >= 0,
    `${label}.bytes must be non-negative`,
  )
  assert(
    Number.isSafeInteger(value.fileCount) && value.fileCount > 0,
    `${label}.fileCount must be positive`,
  )
  assertSha256(value.sha256, `${label}.sha256`)
}

const runTar = (tarballPath, args, members, encoding) => {
  const result = spawnSync('tar', [...args, tarballPath, ...members], {
    encoding,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  assert(
    result.status === 0,
    `tar ${args.join(' ')} failed for ${tarballPath}: ${
      Buffer.isBuffer(result.stderr)
        ? result.stderr.toString('utf8').trim()
        : result.stderr?.trim() || 'no output'
    }`,
  )
  return result.stdout
}

const listTarballEntries = (tarballPath) => {
  const output = runTar(tarballPath, ['-tzf'], [], 'utf8').trimEnd()
  assert(output.length > 0, `${tarballPath} contains no archive entries`)
  const rawEntries = output.split(/\r?\n/u)
  const verboseOutput = runTar(tarballPath, ['-tvzf'], [], 'utf8').trimEnd()
  const verboseEntries = verboseOutput.split(/\r?\n/u)
  assert(
    verboseEntries.length === rawEntries.length,
    `${tarballPath} archive listings disagree about member count`,
  )
  const entries = []
  const seen = new Set()
  for (const [index, rawEntry] of rawEntries.entries()) {
    const entry = rawEntry.endsWith('/') ? rawEntry.slice(0, -1) : rawEntry
    assert(entry.length > 0, `${tarballPath} contains an empty archive path`)
    assert(!entry.includes('\\'), `${tarballPath} contains a backslash path: ${entry}`)
    assert(!entry.startsWith('/'), `${tarballPath} contains an absolute archive path: ${entry}`)
    const parts = entry.split('/')
    assert(
      parts[0] === 'package' && parts.every((part) => part !== '' && part !== '.' && part !== '..'),
      `${tarballPath} contains an unsafe archive path: ${entry}`,
    )
    assert(!seen.has(entry), `${tarballPath} contains duplicate archive path ${entry}`)
    seen.add(entry)
    const type = verboseEntries[index]?.[0]
    assert(
      type === '-' || type === 'd',
      `${tarballPath} contains a non-regular archive member: ${entry}`,
    )
    entries.push({ path: entry, type })
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path))
}

const readPackedManifestBytes = (tarballPath, entries) => {
  assert(
    entries.filter((entry) => entry.path === 'package/package.json' && entry.type === '-')
      .length === 1,
    `${tarballPath} must contain exactly one package/package.json`,
  )
  const bytes = runTar(tarballPath, ['-xOzf'], ['package/package.json'], null)
  assert(Buffer.isBuffer(bytes) && bytes.length > 0, `${tarballPath} has an empty package manifest`)
  return bytes
}

const validatePackedRelativeTarget = (target, label) => {
  assert(typeof target === 'string' && target.startsWith('./'), `${label} must start with ./`)
  assert(!target.includes('\\'), `${label} must use POSIX separators`)
  assert(!/[*?[\]]/u.test(target), `${label} cannot contain a wildcard`)
  const local = target.slice(2)
  assert(
    local.length > 0 &&
      local.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    `${label} is not a safe package-relative path`,
  )
  return `package/${local}`
}

const collectPackedTargets = (value, label, targets) => {
  if (value === null || value === undefined) return
  if (typeof value === 'string') {
    targets.add(validatePackedRelativeTarget(value, label))
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectPackedTargets(entry, `${label}[${index}]`, targets))
    return
  }
  assert(isObject(value), `${label} must contain only objects, arrays, strings, or null`)
  for (const [key, entry] of Object.entries(value)) {
    collectPackedTargets(entry, `${label}.${key}`, targets)
  }
}

const expectedTarballFilename = (name, version) => {
  assert(
    /^@stopcock\/[a-z0-9][a-z0-9._-]*$/u.test(name),
    `unsupported public package name: ${name}`,
  )
  return `${name.slice(1).replace('/', '-')}-${version}.tgz`
}

const PACKED_MANIFEST_SURFACE_FIELDS = Object.freeze([
  'bin',
  'dependencies',
  'exports',
  'files',
  'main',
  'module',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'sideEffects',
  'type',
  'types',
])

const normalizeWorkspaceSurfaceForPacking = ({
  field,
  value,
  selectedPublicNames,
  expectedVersion,
}) => {
  if (!PACKED_SECTIONS.includes(field) || !isObject(value)) return value
  const selected = new Set(selectedPublicNames)
  return Object.fromEntries(
    Object.entries(value).map(([name, range]) => [
      name,
      selected.has(name) && range === 'workspace:*' ? expectedVersion : range,
    ]),
  )
}

const assertPackedManifestSurface = ({
  packedManifest,
  workspaceManifest,
  name,
  selectedPublicNames,
  expectedVersion,
}) => {
  assert(isObject(workspaceManifest), `${name} workspace manifest must be an object`)
  assert(workspaceManifest.name === name, `${name} workspace manifest name does not match`)
  for (const field of PACKED_MANIFEST_SURFACE_FIELDS) {
    const expected = normalizeWorkspaceSurfaceForPacking({
      field,
      value: workspaceManifest[field],
      selectedPublicNames,
      expectedVersion,
    })
    assert(
      jsonValuesEqual(packedManifest[field], expected),
      `${name} packed ${field} does not match the workspace manifest`,
    )
  }
}

const packedDistributionIdentity = (tarballPath, entries, expectedName) => {
  const files = entries
    .filter((entry) => entry.type === '-' && entry.path.startsWith('package/dist/'))
    .map((entry) => {
      const bytes = runTar(tarballPath, ['-xOzf'], [entry.path], null)
      assert(Buffer.isBuffer(bytes), `${expectedName} packed ${entry.path} is unreadable`)
      return {
        path: entry.path.slice('package/dist/'.length),
        bytes: bytes.length,
        sha256: sha256(bytes),
      }
    })
  assert(files.length > 0, `${expectedName} packed distribution contains no files`)
  return summarizeFileEntries(files)
}

const packedInternalDependencies = (manifest, selectedPublicNames, target) => {
  const selected = new Set(selectedPublicNames)
  const targetInfo = parseTarget(target)
  const dependencies = []
  for (const section of PACKED_SECTIONS) {
    const values = manifest[section]
    if (values === undefined) continue
    assert(isObject(values), `${manifest.name} ${section} must be an object`)
    for (const [name, range] of Object.entries(values).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (!name.startsWith('@stopcock/')) continue
      assert(selected.has(name), `${manifest.name} ${section} names non-cohort package ${name}`)
      assert(typeof range === 'string', `${manifest.name} ${section}.${name} must be a string`)
      if (targetInfo.kind === 'next') {
        assert(
          range === target,
          `${manifest.name} ${section}.${name} must be exact ${target} after packing; received ${range}`,
        )
      } else {
        assert(
          range === STABLE_TARGET || range === '^2.0.0',
          `${manifest.name} ${section}.${name} must resolve to stable 2.0.0; received ${range}`,
        )
      }
      dependencies.push({ section, name, range })
    }
  }
  return dependencies.sort((left, right) =>
    `${left.section}\0${left.name}`.localeCompare(`${right.section}\0${right.name}`),
  )
}

export const inspectPackedTarball = ({
  tarballPath,
  expectedName,
  expectedVersion,
  selectedPublicNames,
  expectedWorkspaceManifest,
}) => {
  const resolvedTarball = resolve(tarballPath)
  assert(existsSync(resolvedTarball), `missing packed tarball: ${resolvedTarball}`)
  const metadata = lstatSync(resolvedTarball)
  assert(
    metadata.isFile() && !metadata.isSymbolicLink(),
    `${resolvedTarball} must be a regular file`,
  )
  const expectedFilename = expectedTarballFilename(expectedName, expectedVersion)
  assert(
    basename(resolvedTarball) === expectedFilename,
    `${expectedName} tarball must be named ${expectedFilename}; received ${basename(resolvedTarball)}`,
  )

  const tarballBytes = readFileSync(resolvedTarball)
  const entries = listTarballEntries(resolvedTarball)
  const packedManifestBytes = readPackedManifestBytes(resolvedTarball, entries)
  let packedManifest
  try {
    packedManifest = JSON.parse(packedManifestBytes.toString('utf8'))
  } catch (error) {
    fail(
      `${expectedName} packed package.json is invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  assert(isObject(packedManifest), `${expectedName} packed package.json must be an object`)
  assert(packedManifest.name === expectedName, `${expectedName} packed name does not match`)
  assert(
    packedManifest.version === expectedVersion,
    `${expectedName} packed version must be ${expectedVersion}; received ${packedManifest.version}`,
  )
  assert(packedManifest.private !== true, `${expectedName} packed manifest must remain public`)
  assert(isObject(packedManifest.exports), `${expectedName} packed exports must be an object`)
  assert(
    Object.keys(packedManifest.exports).length > 0,
    `${expectedName} packed exports cannot be empty`,
  )
  if (expectedWorkspaceManifest !== undefined) {
    assertPackedManifestSurface({
      packedManifest,
      workspaceManifest: expectedWorkspaceManifest,
      name: expectedName,
      selectedPublicNames,
      expectedVersion,
    })
  }

  const targets = new Set()
  collectPackedTargets(packedManifest.exports, `${expectedName} exports`, targets)
  if (typeof packedManifest.types === 'string') {
    targets.add(validatePackedRelativeTarget(packedManifest.types, `${expectedName} types`))
  }
  if (typeof packedManifest.main === 'string') {
    targets.add(validatePackedRelativeTarget(packedManifest.main, `${expectedName} main`))
  }
  if (typeof packedManifest.module === 'string') {
    targets.add(validatePackedRelativeTarget(packedManifest.module, `${expectedName} module`))
  }
  if (typeof packedManifest.bin === 'string') {
    targets.add(validatePackedRelativeTarget(packedManifest.bin, `${expectedName} bin`))
  } else if (isObject(packedManifest.bin)) {
    for (const [name, target] of Object.entries(packedManifest.bin)) {
      targets.add(validatePackedRelativeTarget(target, `${expectedName} bin.${name}`))
    }
  }
  const archiveSet = new Set(entries.map((entry) => entry.path))
  const regularFileSet = new Set(
    entries.filter((entry) => entry.type === '-').map((entry) => entry.path),
  )
  for (const target of [...targets].sort(compareStrings)) {
    assert(regularFileSet.has(target), `${expectedName} packed target is missing: ${target}`)
  }

  assert(Array.isArray(packedManifest.files), `${expectedName} packed files must be an array`)
  const packedFileRoots = []
  for (const entry of packedManifest.files) {
    assert(typeof entry === 'string', `${expectedName} packed files entries must be strings`)
    const target = validatePackedRelativeTarget(
      `./${entry.replace(/^\.\//u, '')}`,
      `${expectedName} files`,
    )
    packedFileRoots.push(target)
    assert(
      archiveSet.has(target) ||
        entries.some((archiveEntry) => archiveEntry.path.startsWith(`${target}/`)),
      `${expectedName} packed files entry is missing: ${entry}`,
    )
  }
  for (const required of ['README.md', 'CHANGELOG.md', 'LICENSE']) {
    assert(archiveSet.has(`package/${required}`), `${expectedName} packed ${required} is missing`)
  }
  const automaticallyPacked = new Set([
    'package',
    'package/package.json',
    'package/README.md',
    'package/CHANGELOG.md',
    'package/LICENSE',
  ])
  for (const { path } of entries) {
    assert(
      automaticallyPacked.has(path) ||
        packedFileRoots.some((root) => path === root || path.startsWith(`${root}/`)),
      `${expectedName} packed archive member is outside the files allowlist: ${path}`,
    )
  }
  assert(
    !entries.some(
      (entry) =>
        entry.path.startsWith('package/src/') ||
        entry.path.includes('/__tests__/') ||
        /(?:^|\/)(?:test|tests|fixtures)(?:\/|$)/u.test(entry.path.slice('package/'.length)),
    ),
    `${expectedName} packed archive contains source, test, or fixture files`,
  )

  return {
    tarball: {
      filename: expectedFilename,
      sha256: sha256(tarballBytes),
      bytes: tarballBytes.length,
    },
    packedManifest: {
      sha256: sha256(packedManifestBytes),
      bytes: packedManifestBytes.length,
    },
    distribution: packedDistributionIdentity(resolvedTarball, entries, expectedName),
    exports: Object.keys(packedManifest.exports).sort(compareStrings),
    internalDependencies: packedInternalDependencies(
      packedManifest,
      selectedPublicNames,
      expectedVersion,
    ),
  }
}

export const buildCohortDependencyGraph = (packages) => {
  const names = packages.map((entry) => entry.name)
  assert(new Set(names).size === names.length, 'the packed cohort contains duplicate package names')
  const selected = new Set(names)
  return [...packages]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      assert(
        Array.isArray(entry.internalDependencies),
        `${entry.name} internalDependencies must be an array`,
      )
      const dependsOn = [
        ...new Set(
          entry.internalDependencies.map((dependency) => {
            assertExactKeys(
              dependency,
              ['name', 'range', 'section'],
              `${entry.name} internal dependency`,
            )
            assert(
              PACKED_SECTIONS.includes(dependency.section),
              `${entry.name} has invalid internal dependency section ${dependency.section}`,
            )
            assert(
              selected.has(dependency.name),
              `${entry.name} depends on missing ${dependency.name}`,
            )
            assert(dependency.name !== entry.name, `${entry.name} cannot depend on itself`)
            return dependency.name
          }),
        ),
      ].sort(compareStrings)
      return { name: entry.name, dependsOn }
    })
}

export const topologicalCohortOrder = (dependencyGraph) => {
  const remaining = new Map(dependencyGraph.map((entry) => [entry.name, new Set(entry.dependsOn)]))
  assert(
    remaining.size === dependencyGraph.length,
    'the cohort dependency graph contains duplicate package names',
  )
  const completed = new Set()
  const order = []
  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, dependencies]) => [...dependencies].every((name) => completed.has(name)))
      .map(([name]) => name)
      .sort(compareStrings)
    assert(
      ready.length > 0,
      `the cohort dependency graph contains a cycle: ${[...remaining.keys()]
        .sort(compareStrings)
        .join(', ')}`,
    )
    for (const name of ready) {
      order.push(name)
      completed.add(name)
      remaining.delete(name)
    }
  }
  return order
}

const cohortContentProjection = (manifest) => ({
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

export const computeCohortContentHash = (manifest) =>
  sha256(jsonBytes(cohortContentProjection(manifest)))

export const expectedCohortManifestPath = ({ root, mode, target, contentHash }) => {
  const targetInfo = parseTarget(target)
  assert(['dev', 'candidate', 'release'].includes(mode), `unsupported pack mode: ${mode}`)
  assertSha256(contentHash, 'cohort content hash')
  const hash = contentHash.slice('sha256:'.length)
  if (mode === 'release') {
    assert(targetInfo.kind === 'stable', 'release mode requires target 2.0.0')
    return join(resolve(root), 'artifacts', 'v2', 'release', target, hash, 'cohort-manifest.json')
  }
  assert(targetInfo.kind === 'next', `${mode} mode requires a 2.0.0-next.N target`)
  if (mode === 'candidate') {
    assert(target !== '2.0.0-next.0', 'candidate mode cannot use the local-only 2.0.0-next.0')
    return join(resolve(root), 'artifacts', 'v2', target, 'cohort-manifest.json')
  }
  return join(resolve(root), 'artifacts', 'v2', 'dev', target, hash, 'cohort-manifest.json')
}

const validateBuildInput = (entry, index) => {
  assertExactKeys(entry, ['bytes', 'path', 'sha256'], `buildInputs[${index}]`)
  assert(
    typeof entry.path === 'string' &&
      entry.path.length > 0 &&
      entry.path === toPosixPath(entry.path) &&
      !entry.path.startsWith('/') &&
      entry.path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    `buildInputs[${index}].path must be a safe repo-relative path`,
  )
  assertByteIdentity({ bytes: entry.bytes, sha256: entry.sha256 }, `buildInputs[${index}] identity`)
}

const validatePackageRecord = (record, index, selectedPublicNames, target) => {
  const label = `packages[${index}]`
  assertExactKeys(
    record,
    [
      'directory',
      'distribution',
      'exports',
      'internalDependencies',
      'name',
      'packedManifest',
      'source',
      'tarball',
      'version',
      'workspaceManifest',
    ],
    label,
  )
  assert(selectedPublicNames.includes(record.name), `${label}.name is outside the selected cohort`)
  assert(record.version === target, `${record.name} version must be ${target}`)
  assert(
    typeof record.directory === 'string' &&
      /^packages\/[^/]+$/u.test(record.directory) &&
      record.directory === toPosixPath(record.directory),
    `${record.name} directory must name one literal packages/* workspace`,
  )
  assertTreeIdentity(record.source, `${record.name} source`)
  assertTreeIdentity(record.distribution, `${record.name} distribution`)
  assertByteIdentity(record.workspaceManifest, `${record.name} workspaceManifest`)
  assertByteIdentity(record.packedManifest, `${record.name} packedManifest`)
  assert(
    Array.isArray(record.exports) &&
      record.exports.length > 0 &&
      record.exports.every((entry) => typeof entry === 'string') &&
      JSON.stringify(record.exports) === JSON.stringify([...record.exports].sort(compareStrings)),
    `${record.name} exports must be a non-empty sorted string array`,
  )
  assert(Array.isArray(record.internalDependencies), `${record.name} dependencies must be an array`)
  assertExactKeys(record.tarball, ['bytes', 'filename', 'path', 'sha256'], `${record.name} tarball`)
  assert(
    record.tarball.filename === expectedTarballFilename(record.name, target),
    `${record.name} tarball filename does not match`,
  )
  assert(
    record.tarball.path === `tarballs/${record.tarball.filename}`,
    `${record.name} tarball path must be tarballs/${record.tarball.filename}`,
  )
  assertByteIdentity(
    { bytes: record.tarball.bytes, sha256: record.tarball.sha256 },
    `${record.name} tarball identity`,
  )
}

export const checkPackedCohort = async ({
  root = repositoryRoot,
  manifest,
  runtime = loadChangesetsRuntime(),
  verifyWorkspace = true,
} = {}) => {
  assert(
    typeof manifest === 'string' && manifest.length > 0,
    'a packed cohort manifest is required',
  )
  const resolvedRoot = resolve(root)
  const manifestPath = resolve(resolvedRoot, manifest)
  const artifactsRoot = resolve(resolvedRoot, 'artifacts', 'v2')
  assert(
    manifestPath.startsWith(`${artifactsRoot}${sep}`),
    'the packed cohort manifest must be under artifacts/v2',
  )
  assert(
    existsSync(manifestPath),
    `missing packed cohort manifest: ${relative(resolvedRoot, manifestPath)}`,
  )
  assertRegularContainedPath({
    root: resolvedRoot,
    path: manifestPath,
    terminal: 'file',
    label: 'the packed cohort manifest',
  })
  const value = readJson(manifestPath)
  assertExactKeys(
    value,
    [
      'buildInputs',
      'buildOrder',
      'cohortContentHash',
      'dependencyGraph',
      'kind',
      'mode',
      'packages',
      'privateCompatibility',
      'publicCount',
      'schemaVersion',
      'target',
    ],
    'packed cohort manifest',
  )
  assert(
    value.schemaVersion === COHORT_MANIFEST_SCHEMA_VERSION,
    `packed cohort manifest must use schemaVersion ${COHORT_MANIFEST_SCHEMA_VERSION}`,
  )
  assert(
    value.kind === COHORT_MANIFEST_KIND,
    `packed cohort manifest kind must be ${COHORT_MANIFEST_KIND}`,
  )
  parseTarget(value.target)
  assert(['dev', 'candidate', 'release'].includes(value.mode), 'packed cohort mode is invalid')
  assertSha256(value.cohortContentHash, 'packed cohort content hash')
  assertExactKeys(value.privateCompatibility, ['name', 'publication'], 'privateCompatibility')
  assert(
    value.privateCompatibility.name === SYNTH_PACKAGE,
    `privateCompatibility must name ${SYNTH_PACKAGE}`,
  )
  assert(
    value.privateCompatibility.publication === 'excluded',
    `${SYNTH_PACKAGE} publication must be excluded`,
  )
  assert(Array.isArray(value.packages), 'packed cohort packages must be an array')
  assert(
    Number.isSafeInteger(value.publicCount) &&
      value.publicCount > 0 &&
      value.publicCount === value.packages.length,
    'packed cohort publicCount must match packages.length',
  )
  const selectedPublicNames = value.packages.map((entry) => entry.name)
  assert(!selectedPublicNames.includes(SYNTH_PACKAGE), `${SYNTH_PACKAGE} must not be packed`)
  assert(
    new Set(selectedPublicNames).size === selectedPublicNames.length,
    'packed package names must be unique',
  )
  assert(
    JSON.stringify(selectedPublicNames) ===
      JSON.stringify([...selectedPublicNames].sort(compareStrings)),
    'packed packages must be sorted by name',
  )
  value.packages.forEach((record, index) =>
    validatePackageRecord(record, index, selectedPublicNames, value.target),
  )

  assert(
    Array.isArray(value.buildInputs) && value.buildInputs.length > 0,
    'buildInputs cannot be empty',
  )
  value.buildInputs.forEach(validateBuildInput)
  assert(
    new Set(value.buildInputs.map((entry) => entry.path)).size === value.buildInputs.length,
    'buildInputs contains duplicate paths',
  )
  assert(
    JSON.stringify(value.buildInputs.map((entry) => entry.path)) ===
      JSON.stringify(value.buildInputs.map((entry) => entry.path).sort(compareStrings)),
    'buildInputs must be sorted by path',
  )

  const derivedGraph = buildCohortDependencyGraph(value.packages)
  assert(
    JSON.stringify(value.dependencyGraph) === JSON.stringify(derivedGraph),
    'packed cohort dependencyGraph does not match packed manifests',
  )
  const derivedOrder = topologicalCohortOrder(derivedGraph)
  assert(
    JSON.stringify(value.buildOrder) === JSON.stringify(derivedOrder),
    'packed cohort buildOrder is not the deterministic dependency order',
  )
  assert(
    computeCohortContentHash(value) === value.cohortContentHash,
    'packed cohort content hash does not match the canonical manifest projection',
  )
  const expectedManifestPath = expectedCohortManifestPath({
    root: resolvedRoot,
    mode: value.mode,
    target: value.target,
    contentHash: value.cohortContentHash,
  })
  assert(
    manifestPath === expectedManifestPath,
    `packed cohort manifest path must be ${toPosixPath(relative(resolvedRoot, expectedManifestPath))}`,
  )

  let artifactContext
  if (verifyWorkspace) {
    artifactContext = await readCohortArtifactContext({
      root: resolvedRoot,
      target: value.target,
      runtime,
    })
    assert(
      JSON.stringify(artifactContext.selectedPublicNames) === JSON.stringify(selectedPublicNames),
      'packed cohort inventory does not match the live selected public cohort',
    )
    const expectedBuildInputs = readCohortBuildInputs(resolvedRoot)
    assert(
      JSON.stringify(expectedBuildInputs) === JSON.stringify(value.buildInputs),
      'packed cohort buildInputs do not match the complete canonical build-input set',
    )
    const workspaceByName = new Map(
      artifactContext.selectedPublic.map((entry) => [entry.name, entry]),
    )
    for (const record of value.packages) {
      const workspace = workspaceByName.get(record.name)
      assert(workspace !== undefined, `live workspace is missing ${record.name}`)
      assert(workspace.directory === record.directory, `${record.name} workspace directory drifted`)
      const workspaceManifestBytes = readFileSync(join(workspace.path, 'package.json'))
      assert(
        workspaceManifestBytes.length === record.workspaceManifest.bytes &&
          sha256(workspaceManifestBytes) === record.workspaceManifest.sha256,
        `${record.name} workspace manifest drifted after packing`,
      )
      const source = hashDirectoryTree(workspace.path, {
        excludeTopLevel: ['dist', 'node_modules'],
        label: `${record.name} source`,
      })
      assert(
        JSON.stringify(source) === JSON.stringify(record.source),
        `${record.name} source drifted`,
      )
      const distribution = hashDirectoryTree(join(workspace.path, 'dist'), {
        label: `${record.name} distribution`,
      })
      assert(
        JSON.stringify(distribution) === JSON.stringify(record.distribution),
        `${record.name} distribution drifted`,
      )
    }
  }

  const manifestDirectory = dirname(manifestPath)
  const tarballsDirectory = join(manifestDirectory, 'tarballs')
  assert(existsSync(tarballsDirectory), 'packed cohort tarballs directory is missing')
  assertRegularContainedPath({
    root: resolvedRoot,
    path: tarballsDirectory,
    terminal: 'directory',
    label: 'the packed cohort tarballs directory',
  })
  const actualTarballs = readdirSync(tarballsDirectory, { withFileTypes: true })
    .map((entry) => {
      assert(
        entry.isFile() && !entry.isSymbolicLink(),
        `tarballs/${entry.name} must be a regular file`,
      )
      return entry.name
    })
    .sort(compareStrings)
  const expectedTarballs = value.packages
    .map((entry) => entry.tarball.filename)
    .sort(compareStrings)
  assert(
    JSON.stringify(actualTarballs) === JSON.stringify(expectedTarballs),
    'packed cohort tarball set does not match the manifest',
  )

  for (const record of value.packages) {
    const workspaceManifest = artifactContext?.selectedPublic.find(
      (entry) => entry.name === record.name,
    )?.manifest
    const inspected = inspectPackedTarball({
      tarballPath: join(manifestDirectory, record.tarball.path),
      expectedName: record.name,
      expectedVersion: value.target,
      selectedPublicNames,
      expectedWorkspaceManifest: workspaceManifest,
    })
    assert(
      JSON.stringify(inspected.tarball) ===
        JSON.stringify({
          filename: record.tarball.filename,
          sha256: record.tarball.sha256,
          bytes: record.tarball.bytes,
        }),
      `${record.name} tarball identity does not match`,
    )
    assert(
      JSON.stringify(inspected.packedManifest) === JSON.stringify(record.packedManifest),
      `${record.name} packed manifest identity does not match`,
    )
    assert(
      JSON.stringify(inspected.distribution) === JSON.stringify(record.distribution),
      `${record.name} packed distribution does not match`,
    )
    assert(
      JSON.stringify(inspected.exports) === JSON.stringify(record.exports),
      `${record.name} packed exports do not match`,
    )
    assert(
      JSON.stringify(inspected.internalDependencies) ===
        JSON.stringify(record.internalDependencies),
      `${record.name} packed internal dependencies do not match`,
    )
  }

  return {
    schemaVersion: 1,
    command: 'check-packed',
    manifest: toPosixPath(relative(resolvedRoot, manifestPath)),
    mode: value.mode,
    target: value.target,
    cohortContentHash: value.cohortContentHash,
    publicCount: value.publicCount,
    tarballs: value.packages.map((entry) => ({
      name: entry.name,
      filename: entry.tarball.filename,
      sha256: entry.tarball.sha256,
    })),
  }
}

const runCohortMutation = async ({
  state,
  target,
  preState,
  runtime,
  runLockfile,
  changelogContext,
}) => {
  const privateSnapshot = snapshotPrivateWorkspaceState(state.context)
  const result = await applyNormalizedReleasePlan({
    root: state.context.root,
    context: state.context,
    publicChangesets: state.publicChangesets,
    config: state.config,
    preState,
    target,
    runtime,
    changelogContext,
  })
  assertSnapshotUnchanged(privateSnapshot, 'filtered Changesets plan')
  await runLockfile(state.context.root)
  assertSnapshotUnchanged(privateSnapshot, 'cohort lockfile update')
  const check = await checkCohort({
    root: state.context.root,
    target,
    runtime,
  })
  return { result, check }
}

export const alignNext = async ({
  root = repositoryRoot,
  target,
  runtime = loadChangesetsRuntime(),
  runLockfile = defaultLockfileUpdate,
  changelogContext = repositoryRoot,
} = {}) => {
  const targetInfo = parseTarget(target, 'next')
  assert(
    targetInfo.number === 0,
    `align-next owns only the initial 2.0.0-next.0 cohort; use advance-next for ${target}`,
  )
  const resolvedRoot = resolve(root)
  const state = await readOperationState({ root: resolvedRoot, runtime })
  assertNoReadinessBlockers(state.context)

  if (state.preState !== undefined) {
    assert(state.preState.mode === 'pre', 'align-next cannot run while prerelease exit is pending')
    assert(state.preState.tag === 'next', 'align-next requires the next prerelease tag')
    const pending = unconsumedPublicChangesets(state.publicChangesets, state.preState)
    let current
    try {
      current = currentCohortVersion(state.context)
    } catch {
      fail('align-next found a partial or different prerelease train')
    }
    assert(
      current === target,
      `align-next found ${current}; use advance-next for a different active train`,
    )
    assert(
      pending.length === 0,
      `align-next found new pending changesets (${pending
        .map((changeset) => changeset.id)
        .join(', ')}); use advance-next`,
    )
    const check = await checkCohort({ root: resolvedRoot, target, runtime })
    return {
      schemaVersion: 1,
      command: 'align-next',
      target,
      changed: false,
      consumedChangesets: [],
      filteredExcludedReleases: [],
      check,
    }
  }

  return runTransaction(state.context, async () => {
    await runtime.enterPre(resolvedRoot, 'next')
    const enteredPreState = await runtime.readPreState(resolvedRoot)
    assert(enteredPreState?.mode === 'pre', 'Changesets did not enter prerelease mode')
    const { result, check } = await runCohortMutation({
      state,
      target,
      preState: enteredPreState,
      runtime,
      runLockfile,
      changelogContext,
    })
    return {
      schemaVersion: 1,
      command: 'align-next',
      target,
      changed: true,
      consumedChangesets: state.publicChangesets
        .map((changeset) => changeset.id)
        .sort(compareStrings),
      filteredExcludedReleases: result.plan.filteredExcludedReleases,
      check,
    }
  })
}

export const advanceNext = async ({
  root = repositoryRoot,
  target,
  runtime = loadChangesetsRuntime(),
  runLockfile = defaultLockfileUpdate,
  changelogContext = repositoryRoot,
} = {}) => {
  const targetInfo = parseTarget(target, 'next')
  const resolvedRoot = resolve(root)
  const state = await readOperationState({ root: resolvedRoot, runtime })
  assertNoReadinessBlockers(state.context)
  assert(state.preState?.mode === 'pre', 'advance-next requires an active prerelease train')
  assert(state.preState.tag === 'next', 'advance-next requires the next prerelease tag')

  const current = currentCohortVersion(state.context)
  const currentInfo = parseTarget(current, 'next')
  assert(
    targetInfo.number > currentInfo.number,
    `advance-next target ${target} must be higher than ${current}`,
  )
  assert(
    !existsSync(join(resolvedRoot, 'artifacts', 'v2', target)),
    `advance-next target already has candidate artifacts: ${target}`,
  )
  const pending = unconsumedPublicChangesets(state.publicChangesets, state.preState)

  return runTransaction(state.context, async () => {
    const { result, check } = await runCohortMutation({
      state,
      target,
      preState: state.preState,
      runtime,
      runLockfile,
      changelogContext,
    })
    return {
      schemaVersion: 1,
      command: 'advance-next',
      previousTarget: current,
      target,
      changed: true,
      consumedChangesets: pending.map((changeset) => changeset.id).sort(compareStrings),
      filteredExcludedReleases: result.plan.filteredExcludedReleases,
      check,
    }
  })
}

const snapshotUnaffectedJoinState = (context, joinPackage) => {
  const entries = []
  for (const workspace of context.packages.packages) {
    for (const filename of ['package.json', 'CHANGELOG.md']) {
      if (workspaceName(workspace) === joinPackage && filename === 'package.json') continue
      const path = join(workspace.dir, filename)
      entries.push({
        path,
        relativePath: relative(context.root, path),
        ...snapshotEntry(path),
      })
    }
  }
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

export const joinCurrent = async ({
  root = repositoryRoot,
  packageName,
  runtime = loadChangesetsRuntime(),
  runLockfile = defaultLockfileUpdate,
} = {}) => {
  assert(
    packageName === CONDITIONAL_OPTIMIZER_PACKAGE,
    `join-current may add only ${CONDITIONAL_OPTIMIZER_PACKAGE}`,
  )
  const resolvedRoot = resolve(root)
  const state = await readOperationState({
    root: resolvedRoot,
    runtime,
    requiredJoinPackage: packageName,
  })
  assertNoReadinessBlockers(state.context)
  assert(state.preState?.mode === 'pre', 'join-current requires an active prerelease train')
  assert(state.preState.tag === 'next', 'join-current requires the next prerelease tag')
  const optimizerChangesets = unconsumedPublicChangesets(
    state.publicChangesets,
    state.preState,
  ).filter((changeset) =>
    changeset.releases.some((release) => release.name === CONDITIONAL_OPTIMIZER_PACKAGE),
  )
  assert(
    optimizerChangesets.length > 0,
    `${CONDITIONAL_OPTIMIZER_PACKAGE} requires its own pending changeset before join-current`,
  )

  const joinWorkspace = state.context.workspaceByName.get(packageName)
  const existingPublic = state.context.selectedPublic.filter(
    (workspace) => workspaceName(workspace) !== packageName,
  )
  const existingVersions = [
    ...new Set(existingPublic.map((workspace) => workspace.packageJson.version)),
  ]
  assert(
    existingVersions.length === 1,
    `the existing public cohort is not aligned: ${existingVersions
      .sort(compareStrings)
      .join(', ')}`,
  )
  const current = existingVersions[0]
  parseTarget(current, 'next')
  const alreadyJoined =
    joinWorkspace.packageJson.version === current &&
    state.preState.initialVersions?.[packageName] !== undefined
  if (alreadyJoined) {
    const check = await checkCohort({ root: resolvedRoot, target: current, runtime })
    return {
      schemaVersion: 1,
      command: 'join-current',
      package: packageName,
      target: current,
      changed: false,
      check,
    }
  }

  const unaffected = snapshotUnaffectedJoinState(state.context, packageName)
  const originalVersion = joinWorkspace.packageJson.version
  return runTransaction(state.context, async () => {
    const manifestPath = join(joinWorkspace.dir, 'package.json')
    const normalized = normalizeManifest({
      manifest: readJson(manifestPath),
      target: current,
      selectedPublicSet: state.context.selectedPublicSet,
    })
    writeJsonIfChanged(manifestPath, normalized)

    const nextPreState = clone(state.preState)
    nextPreState.initialVersions ??= {}
    nextPreState.initialVersions[packageName] = originalVersion
    writeJsonIfChanged(join(resolvedRoot, '.changeset', 'pre.json'), nextPreState)
    await runLockfile(resolvedRoot)
    assertSnapshotUnchanged(unaffected, 'join-current')
    const check = await checkCohort({ root: resolvedRoot, target: current, runtime })
    assert(
      optimizerChangesets.every((changeset) =>
        check.pendingPublicChangesets.includes(changeset.id),
      ),
      `${packageName} must retain its own pending changeset after join-current`,
    )
    return {
      schemaVersion: 1,
      command: 'join-current',
      package: packageName,
      target: current,
      changed: true,
      check,
    }
  })
}

const readAcceptedRc = (root, acceptedRc) => {
  const record =
    typeof acceptedRc === 'string'
      ? readJson(resolve(root, acceptedRc))
      : (acceptedRc ?? readJson(join(root, 'artifacts', 'v2', 'accepted-rc.json')))
  assert(isObject(record), 'the accepted RC evidence record must be an object')
  assert(record.schemaVersion === 1, 'the accepted RC evidence must use schemaVersion 1')
  assert(record.action === 'RC_PUBLISH', 'the accepted RC action must be RC_PUBLISH')
  assert(record.status === 'COMPLETED', 'the accepted RC status must be COMPLETED')
  assert(
    typeof record.version === 'string' && NEXT_TARGET.test(record.version),
    'the accepted RC version must be 2.0.0-next.N',
  )
  assert(
    typeof record.artifact === 'string' && /^sha256:[0-9a-f]{64}$/u.test(record.artifact),
    'the accepted RC artifact must be sha256:<64 lowercase hex>',
  )
  return record
}

export const alignStable = async ({
  root = repositoryRoot,
  target,
  acceptedRc,
  runtime = loadChangesetsRuntime(),
  runLockfile = defaultLockfileUpdate,
  changelogContext = repositoryRoot,
} = {}) => {
  parseTarget(target, 'stable')
  const resolvedRoot = resolve(root)
  const state = await readOperationState({ root: resolvedRoot, runtime })
  assertNoReadinessBlockers(state.context)
  assert(state.preState?.mode === 'pre', 'align-stable requires an active accepted RC train')
  assert(state.preState.tag === 'next', 'align-stable requires the next prerelease tag')
  const current = currentCohortVersion(state.context)
  parseTarget(current, 'next')
  const accepted = readAcceptedRc(resolvedRoot, acceptedRc)
  assert(
    accepted.version === current,
    `accepted RC ${accepted.version} does not match the current cohort ${current}`,
  )

  return runTransaction(state.context, async () => {
    await runtime.exitPre(resolvedRoot)
    const exitState = await runtime.readPreState(resolvedRoot)
    assert(exitState?.mode === 'exit', 'Changesets did not enter prerelease exit mode')
    const { result, check } = await runCohortMutation({
      state,
      target,
      preState: exitState,
      runtime,
      runLockfile,
      changelogContext,
    })
    return {
      schemaVersion: 1,
      command: 'align-stable',
      previousTarget: current,
      target,
      changed: true,
      acceptedArtifact: accepted.artifact,
      consumedChangesets: state.publicChangesets
        .map((changeset) => changeset.id)
        .sort(compareStrings),
      filteredExcludedReleases: result.plan.filteredExcludedReleases,
      check,
    }
  })
}

const readLedgerFields = (root) => {
  const ledger = readFileSync(join(root, LEDGER_PATH), 'utf8')
  const field = (name) => {
    const match = new RegExp(`^${name}: (.+)$`, 'mu').exec(ledger)
    assert(match !== null, `execution ledger is missing ${name}`)
    return match[1]
  }
  return {
    authorization: field('Execution authorization'),
    externalAuthorization: field('External mutation authorization'),
    externalAction: field('External authorized action'),
    externalArtifact: field('External authorized artifact'),
    base: field('Base release ref'),
    branch: field('Execution branch'),
    worktree: field('Execution worktree'),
  }
}

const runGit = (root, args) => {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  assert(
    result.status === 0,
    `git ${args.join(' ')} failed: ${result.stderr?.trim() || result.stdout?.trim() || 'no output'}`,
  )
  return result.stdout.trim()
}

export const assertCanonicalMutationContext = (root, { requireClean = true } = {}) => {
  const identity = readLedgerFields(root)
  assert(identity.authorization === 'AUTHORIZED', 'Execution authorization must be AUTHORIZED')
  assert(
    resolve(identity.worktree) === resolve(root),
    `live worktree does not match the execution ledger: ${identity.worktree}`,
  )
  assert(
    runGit(root, ['rev-parse', '--show-toplevel']) === resolve(root),
    'the cohort authority must run at the canonical worktree root',
  )
  assert(
    runGit(root, ['branch', '--show-current']) === identity.branch,
    `live branch does not match the execution ledger: ${identity.branch}`,
  )
  runGit(root, ['merge-base', '--is-ancestor', identity.base, 'HEAD'])
  if (requireClean) {
    assert(
      runGit(root, ['status', '--porcelain=v1', '--untracked-files=all']) === '',
      'the canonical worktree must be clean before this cohort mutation',
    )
  }
  return identity
}

class UsageError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UsageError'
  }
}

const usage =
  'usage: node tooling/v2-cohort.mjs <plan|align-next|advance-next|join-current|check|check-packed|align-stable> [--target <version>] [--package <name>] [--manifest <path>] [--accepted-rc <path>]'

const parseArguments = (args) => {
  const command = args.shift()
  if (
    ![
      'plan',
      'align-next',
      'advance-next',
      'join-current',
      'check',
      'check-packed',
      'align-stable',
    ].includes(command)
  ) {
    throw new UsageError(usage)
  }
  const options = {}
  while (args.length > 0) {
    const flag = args.shift()
    if (
      !['--target', '--package', '--manifest', '--accepted-rc'].includes(flag) ||
      args.length === 0
    ) {
      throw new UsageError(usage)
    }
    const key =
      flag === '--target'
        ? 'target'
        : flag === '--package'
          ? 'packageName'
          : flag === '--manifest'
            ? 'manifest'
            : 'acceptedRc'
    if (options[key] !== undefined) throw new UsageError(`duplicate ${flag}\n${usage}`)
    options[key] = args.shift()
  }

  if (['plan', 'align-next', 'advance-next', 'align-stable'].includes(command)) {
    if (options.target === undefined) throw new UsageError(`--target is required\n${usage}`)
  }
  if (command === 'join-current' && options.packageName === undefined) {
    throw new UsageError(`--package is required\n${usage}`)
  }
  if (command === 'check-packed' && options.manifest === undefined) {
    throw new UsageError(`--manifest is required\n${usage}`)
  }
  if (command !== 'join-current' && options.packageName !== undefined) throw new UsageError(usage)
  if (command !== 'check-packed' && options.manifest !== undefined) throw new UsageError(usage)
  if (command !== 'align-stable' && options.acceptedRc !== undefined) throw new UsageError(usage)
  return { command, options }
}

const main = async () => {
  try {
    const { command, options } = parseArguments(process.argv.slice(2))
    let result
    if (command === 'plan') {
      result = await planCohort(options)
    } else if (command === 'check') {
      result = await checkCohort(options)
    } else if (command === 'check-packed') {
      result = await checkPackedCohort(options)
    } else if (command === 'align-next') {
      assertCanonicalMutationContext(repositoryRoot)
      result = await alignNext(options)
    } else if (command === 'advance-next') {
      assertCanonicalMutationContext(repositoryRoot)
      result = await advanceNext(options)
    } else if (command === 'join-current') {
      assertCanonicalMutationContext(repositoryRoot)
      result = await joinCurrent(options)
    } else {
      const identity = assertCanonicalMutationContext(repositoryRoot)
      const accepted = readAcceptedRc(repositoryRoot, options.acceptedRc)
      assert(
        identity.externalAuthorization === 'COMPLETED' &&
          identity.externalAction === 'RC_PUBLISH' &&
          identity.externalArtifact === accepted.artifact,
        'align-stable requires reconciled COMPLETED RC_PUBLISH ledger evidence for the accepted artifact',
      )
      result = await alignStable(options)
    }
    process.stdout.write(jsonBytes(result))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = error instanceof UsageError ? 2 : 1
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
