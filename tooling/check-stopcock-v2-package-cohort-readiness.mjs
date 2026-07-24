#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const INVENTORY_PATH = 'docs/superpowers/contracts/stopcock-v2-package-cohort-readiness.json'
const DYNAMIC_SCOPES_PATH = 'docs/superpowers/contracts/stopcock-v2-dynamic-scopes.json'
const CANONICAL_PLAN =
  'docs/superpowers/plans/2026-07-24-stopcock-v2-performance-density-superplan.md'

const PUBLIC_COHORT = Object.freeze([
  '@stopcock/async',
  '@stopcock/autodiff',
  '@stopcock/color',
  '@stopcock/date',
  '@stopcock/diff',
  '@stopcock/eslint-plugin-fp',
  '@stopcock/fp',
  '@stopcock/fp-codemod',
  '@stopcock/fp-compiler',
  '@stopcock/fp-interop',
  '@stopcock/fp-testing',
  '@stopcock/http',
  '@stopcock/img',
  '@stopcock/la',
  '@stopcock/parser',
  '@stopcock/pattern',
  '@stopcock/persistent',
  '@stopcock/signal',
  '@stopcock/state',
  '@stopcock/svg',
])

const PRIVATE_COMPATIBILITY_COHORT = Object.freeze(['@stopcock/synth'])
const INTERNAL_SECTIONS = Object.freeze(['dependencies', 'peerDependencies', 'devDependencies'])
const REQUIRED_INCONSISTENCY_ASSERTIONS = Object.freeze([
  {
    package: '@stopcock/fp',
    section: 'manifest',
    field: 'version',
    target: '2.0.0-next.0',
  },
  {
    package: '@stopcock/fp-compiler',
    section: 'peerDependencies',
    field: '@stopcock/fp',
    target: '2.0.0-next.0',
  },
  {
    package: '@stopcock/fp-interop',
    section: 'peerDependencies',
    field: '@stopcock/fp',
    target: '2.0.0-next.0',
  },
  {
    package: '@stopcock/parser',
    section: 'peerDependencies',
    field: '@stopcock/fp',
    target: '2.0.0-next.0',
  },
])

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const fail = (message) => {
  throw new Error(message)
}

const assert = (condition, message) => {
  if (!condition) fail(message)
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const assertExactKeys = (value, expected, label) => {
  assert(isObject(value), `${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  assert(
    JSON.stringify(actual) === JSON.stringify(wanted),
    `${label} has unexpected keys: expected ${wanted.join(', ')}, received ${actual.join(', ')}`,
  )
}

const assertJsonEqual = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} is stale or out of order`)
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const listFiles = (root) => {
  if (!existsSync(root)) return []
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  visit(root)
  return files.sort()
}

const parsePendingChangesets = (root) => {
  const result = new Map()
  const changesetRoot = join(root, '.changeset')
  if (!existsSync(changesetRoot)) return result

  for (const file of readdirSync(changesetRoot)
    .filter((name) => name.endsWith('.md'))
    .sort()) {
    const contents = readFileSync(join(changesetRoot, file), 'utf8')
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(contents)?.[1]
    if (frontmatter === undefined) continue
    for (const line of frontmatter.split(/\r?\n/u)) {
      const match = /^\s*['"]?(@stopcock\/[^'":\s]+)['"]?\s*:\s*(?:patch|minor|major)\s*$/u.exec(
        line,
      )
      if (match === null) continue
      const entries = result.get(match[1]) ?? []
      entries.push(file)
      result.set(match[1], entries)
    }
  }
  return result
}

const listPackageStates = (root) => {
  const packagesRoot = join(root, 'packages')
  const states = readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const path = join(packagesRoot, entry.name)
      const manifestPath = join(path, 'package.json')
      if (!existsSync(manifestPath)) return undefined
      const manifestBytes = readFileSync(manifestPath)
      const manifest = JSON.parse(manifestBytes.toString('utf8'))
      return {
        directory: entry.name,
        path,
        manifestPath,
        relativeManifestPath: relative(root, manifestPath),
        manifestBytes,
        manifest,
      }
    })
    .filter((state) => state !== undefined)
    .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name))

  const names = states.map((state) => state.manifest.name)
  assert(new Set(names).size === names.length, 'packages/* contains duplicate package names')
  return states
}

const manifestSetSha256 = (states) => {
  const hash = createHash('sha256')
  for (const state of [...states].sort((left, right) =>
    left.relativeManifestPath.localeCompare(right.relativeManifestPath),
  )) {
    hash.update(state.relativeManifestPath)
    hash.update('\0')
    hash.update(state.manifestBytes)
    hash.update('\0')
  }
  return `sha256:${hash.digest('hex')}`
}

const packedState = (state, filename) => {
  const present = existsSync(join(state.path, filename))
  const packed = Array.isArray(state.manifest.files) && state.manifest.files.includes(filename)
  if (!present) return 'missing'
  return packed ? 'present-packed' : 'present-unpacked'
}

const deriveMetadata = (state, pendingChangesets) => {
  const pending = [...(pendingChangesets.get(state.manifest.name) ?? [])].sort()
  const changelogPath = join(state.path, 'CHANGELOG.md')
  let changelogState = packedState(state, 'CHANGELOG.md')
  if (changelogState === 'missing' && state.manifest.version === '0.0.0' && pending.length > 0) {
    changelogState = 'pending-first-release'
  }

  const licenseFileState = packedState(state, 'LICENSE')
  return {
    description: typeof state.manifest.description === 'string' ? 'present' : 'missing',
    readme: {
      path: existsSync(join(state.path, 'README.md')) ? 'README.md' : null,
      state: packedState(state, 'README.md'),
    },
    license: {
      field: state.manifest.license ?? null,
      path: existsSync(join(state.path, 'LICENSE')) ? 'LICENSE' : null,
      state:
        licenseFileState === 'missing' && typeof state.manifest.license === 'string'
          ? 'manifest-only'
          : licenseFileState,
    },
    changelog: {
      path: existsSync(changelogPath) ? 'CHANGELOG.md' : null,
      state: changelogState,
      pendingChangesets: pending,
    },
  }
}

const deriveCommands = (state) => ({
  cwd: `packages/${state.directory}`,
  build: 'vp run build',
  sourceTypes: 'vp exec tsc -p tsconfig.json --noEmit',
  typeContracts: existsSync(join(state.path, 'tsconfig.type-tests.json'))
    ? 'vp exec tsc -p tsconfig.type-tests.json'
    : null,
  test: typeof state.manifest.scripts?.test === 'string' ? 'bun run test' : 'vp test run',
  pack: 'bun pm pack --destination <temporary-directory>',
})

const deriveInternalRequirements = (state) => {
  const requirements = []
  for (const section of INTERNAL_SECTIONS) {
    for (const [name, range] of Object.entries(state.manifest[section] ?? {}).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      if (!name.startsWith('@stopcock/')) continue
      requirements.push({
        section,
        name,
        range,
        optional:
          section === 'peerDependencies' &&
          state.manifest.peerDependenciesMeta?.[name]?.optional === true,
      })
    }
  }
  return requirements
}

const validateExportTargets = (state) => {
  const exports = state.manifest.exports
  assert(isObject(exports), `${state.manifest.name} must declare an exports object`)
  assert(Object.keys(exports).length > 0, `${state.manifest.name} exports cannot be empty`)

  for (const [specifier, target] of Object.entries(exports)) {
    if (specifier === './package.json') {
      assert(
        target === './package.json',
        `${state.manifest.name} ./package.json export must be literal`,
      )
      continue
    }
    assertExactKeys(target, ['types', 'import'], `${state.manifest.name} export ${specifier}`)
    assert(
      typeof target.types === 'string' && target.types.startsWith('./dist/'),
      `${state.manifest.name} export ${specifier} has an invalid types target`,
    )
    assert(
      typeof target.import === 'string' && target.import.startsWith('./dist/'),
      `${state.manifest.name} export ${specifier} has an invalid import target`,
    )
  }
}

const deriveRecord = (state, pendingChangesets) => ({
  name: state.manifest.name,
  path: `packages/${state.directory}/package.json`,
  currentVersion: state.manifest.version,
  visibility: state.manifest.private === true ? 'private-compatibility' : 'public',
  exports: Object.keys(state.manifest.exports ?? {}).sort(),
  commands: deriveCommands(state),
  internalStopcockRequirements: deriveInternalRequirements(state),
  metadata: deriveMetadata(state, pendingChangesets),
})

const staticReadinessIssues = (state, record) => {
  const issues = []
  const isPublic = record.visibility === 'public'
  const manifest = state.manifest

  if (manifest.type !== 'module') issues.push('manifest type is not module')
  if (!existsSync(join(state.path, 'vite.config.ts'))) issues.push('vite.config.ts is missing')
  if (!existsSync(join(state.path, 'tsconfig.json'))) issues.push('tsconfig.json is missing')
  if (!existsSync(join(state.path, 'src')) || !statSync(join(state.path, 'src')).isDirectory()) {
    issues.push('src directory is missing')
  }

  const testFiles = listFiles(join(state.path, 'src')).filter((path) =>
    /\.(?:test|spec)\.(?:[cm]?[jt]sx?|d\.ts)$/u.test(path),
  )
  if (testFiles.length === 0) issues.push('no package test surface is present')

  if (isPublic) {
    if (manifest.private === true) issues.push('public package is marked private')
    if (record.metadata.description !== 'present') issues.push('description is missing')
    if (manifest.engines?.node === undefined) issues.push('Node engine policy is missing')
    if (manifest.repository === undefined) issues.push('repository metadata is missing')
    if (!Array.isArray(manifest.files) || !manifest.files.includes('dist')) {
      issues.push('dist is absent from packed files')
    }
    if (record.metadata.readme.state !== 'present-packed') {
      issues.push('README.md is not present and packed')
    }
    if (
      record.metadata.license.field !== 'MIT' ||
      record.metadata.license.state !== 'present-packed'
    ) {
      issues.push('MIT LICENSE is not present and packed')
    }
    if (!['present-packed', 'pending-first-release'].includes(record.metadata.changelog.state)) {
      issues.push('changelog is neither packed nor backed by a first-release changeset')
    }
  } else {
    if (manifest.name !== '@stopcock/synth' || manifest.private !== true) {
      issues.push('unexpected private compatibility package')
    }
    if (record.metadata.readme.path !== 'README.md') issues.push('private README is missing')
    if (record.metadata.license.field !== 'MIT') issues.push('private license field is missing')
  }

  return issues
}

const validateDisposition = (record, issues) => {
  const disposition = record.disposition
  assertExactKeys(
    disposition,
    ['status', 'scopeTarget', 'blockers', 'evidence', 'transitionRequirements'],
    `${record.name} disposition`,
  )
  assert(
    typeof disposition.status === 'string' &&
      (disposition.status === 'ready' || /^blocked:[a-z0-9][a-z0-9-]*$/u.test(disposition.status)),
    `${record.name} disposition must be ready or blocked:<reason>`,
  )
  assert(
    disposition.scopeTarget === null ||
      (typeof disposition.scopeTarget === 'string' &&
        /^[a-z0-9][a-z0-9._-]*$/u.test(disposition.scopeTarget)),
    `${record.name} has an invalid S0R scope target`,
  )
  for (const [field, value] of [
    ['blockers', disposition.blockers],
    ['evidence', disposition.evidence],
    ['transitionRequirements', disposition.transitionRequirements],
  ]) {
    assert(
      Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0),
      `${record.name} disposition ${field} must contain non-empty strings`,
    )
  }

  const blocked = disposition.status.startsWith('blocked:')
  if (blocked) {
    assert(disposition.blockers.length > 0, `${record.name} blocker has no explanation`)
    assert(
      disposition.scopeTarget !== null,
      `${record.name} blocker has no recorded S0R scope target`,
    )
  } else {
    assert(disposition.blockers.length === 0, `${record.name} is ready but lists blockers`)
    assert(issues.length === 0, `${record.name} cannot be ready: ${issues.join('; ')}`)
  }
  assert(disposition.evidence.length > 0, `${record.name} has no readiness evidence`)
}

const resolveAssertion = (statesByName, assertion) => {
  const state = statesByName.get(assertion.package)
  assert(state !== undefined, `inconsistency assertion names unknown ${assertion.package}`)
  if (assertion.section === 'manifest') return state.manifest[assertion.field]
  return state.manifest[assertion.section]?.[assertion.field]
}

const validateCurrentState = (currentState, statesByName) => {
  assertExactKeys(
    currentState,
    ['intentionallyInconsistent', 'promotionOwner', 'assertions'],
    'currentState',
  )
  assert(
    currentState.intentionallyInconsistent === true,
    'current package versions must remain explicitly inconsistent during S0',
  )
  assert(currentState.promotionOwner === 'S0B', 'S0B must own cohort normalization')
  assert(Array.isArray(currentState.assertions), 'currentState.assertions must be an array')
  assertJsonEqual(
    currentState.assertions.map(({ package: packageName, section, field, target }) => ({
      package: packageName,
      section,
      field,
      target,
    })),
    REQUIRED_INCONSISTENCY_ASSERTIONS,
    'current inconsistency assertion identities',
  )

  for (const assertion of currentState.assertions) {
    assertExactKeys(
      assertion,
      ['package', 'section', 'field', 'actual', 'target'],
      `current-state assertion for ${assertion.package}`,
    )
    assert(
      resolveAssertion(statesByName, assertion) === assertion.actual,
      `current-state assertion drifted for ${assertion.package} ${assertion.section}.${assertion.field}`,
    )
  }
}

const validateDynamicScopes = (dynamicScopes, records) => {
  assertExactKeys(dynamicScopes, ['schemaVersion', 'stages'], 'dynamic scope contract')
  assert(dynamicScopes.schemaVersion === 1, 'dynamic scope contract must use schemaVersion 1')
  assert(isObject(dynamicScopes.stages), 'dynamic scope stages must be an object')
  const targets = dynamicScopes.stages.S0R
  assert(Array.isArray(targets) && targets.length > 0, 'S0R dynamic targets are missing')

  const targetById = new Map()
  for (const target of targets) {
    assertExactKeys(target, ['id', 'allowedPatterns'], `S0R target ${target.id}`)
    assert(
      typeof target.id === 'string' && !targetById.has(target.id),
      'S0R target IDs must be unique strings',
    )
    assert(
      Array.isArray(target.allowedPatterns) &&
        target.allowedPatterns.every(
          (pattern) => typeof pattern === 'string' && pattern.length > 0,
        ),
      `S0R target ${target.id} has invalid allowedPatterns`,
    )
    targetById.set(target.id, target)
  }

  const recordsByTarget = new Map(
    records
      .filter((record) => record.disposition.scopeTarget !== null)
      .map((record) => [record.disposition.scopeTarget, record]),
  )
  assert(
    recordsByTarget.size ===
      records.filter((record) => record.disposition.scopeTarget !== null).length,
    'multiple packages share one S0R scope target',
  )

  for (const record of records.filter((entry) => entry.disposition.status.startsWith('blocked:'))) {
    assert(
      targetById.has(record.disposition.scopeTarget),
      `${record.name} blocker has no start-HEAD S0R target`,
    )
  }

  for (const [targetId, target] of targetById) {
    if (targetId === 'no-op' || targetId.startsWith('no-op-')) continue
    const record = recordsByTarget.get(targetId)
    assert(record !== undefined, `S0R target ${targetId} has no package disposition`)
    const packageDirectory = record.path.split('/')[1]
    assert(
      target.allowedPatterns.includes(`packages/${packageDirectory}/**`),
      `S0R target ${targetId} must bind literal package ${packageDirectory}`,
    )
    assert(
      target.allowedPatterns.includes(INVENTORY_PATH),
      `S0R target ${targetId} must permit the refreshed readiness inventory`,
    )
    assert(
      target.allowedPatterns.every(
        (pattern) =>
          !pattern.startsWith('packages/') || pattern.startsWith(`packages/${packageDirectory}/`),
      ),
      `S0R target ${targetId} spans more than one package`,
    )
  }
}

export const deriveWorkspaceSnapshot = (root = repositoryRoot) => {
  const states = listPackageStates(root)
  const pendingChangesets = parsePendingChangesets(root)
  const records = states.map((state) => deriveRecord(state, pendingChangesets))
  const fpDependants = {
    public: records
      .filter(
        (record) =>
          record.visibility === 'public' &&
          record.name !== '@stopcock/fp' &&
          record.internalStopcockRequirements.some(
            (requirement) => requirement.name === '@stopcock/fp',
          ),
      )
      .map((record) => record.name)
      .sort(),
    privateCompatibility: records
      .filter(
        (record) =>
          record.visibility === 'private-compatibility' &&
          record.internalStopcockRequirements.some(
            (requirement) => requirement.name === '@stopcock/fp',
          ),
      )
      .map((record) => record.name)
      .sort(),
  }
  return {
    states,
    manifestSetSha256: manifestSetSha256(states),
    records,
    fpDependants,
  }
}

export const validateReadinessInventoryData = ({
  root = repositoryRoot,
  inventory,
  dynamicScopes,
  requireReady = false,
}) => {
  assertExactKeys(
    inventory,
    [
      'schemaVersion',
      'canonicalStage',
      'canonicalPlan',
      'manifestSetSha256',
      'dispositionPolicy',
      'cohort',
      'currentState',
      'fpDependants',
      'packages',
    ],
    'readiness inventory',
  )
  assert(inventory.schemaVersion === 1, 'readiness inventory must use schemaVersion 1')
  assert(inventory.canonicalStage === 'S0', 'readiness inventory must be owned by S0')
  assert(inventory.canonicalPlan === CANONICAL_PLAN, 'canonical plan reference drifted')
  assert(
    typeof inventory.dispositionPolicy === 'string' && inventory.dispositionPolicy.includes('S0R'),
    'disposition policy must preserve the S0R validation boundary',
  )
  assertExactKeys(inventory.cohort, ['public', 'privateCompatibility'], 'cohort')
  assertJsonEqual(inventory.cohort.public, PUBLIC_COHORT, 'public cohort')
  assertJsonEqual(
    inventory.cohort.privateCompatibility,
    PRIVATE_COMPATIBILITY_COHORT,
    'private compatibility cohort',
  )

  const snapshot = deriveWorkspaceSnapshot(root)
  assert(
    inventory.manifestSetSha256 === snapshot.manifestSetSha256,
    'package manifest-set SHA-256 drifted',
  )

  const statesByName = new Map(snapshot.states.map((state) => [state.manifest.name, state]))
  const inventoryNames = inventory.packages.map((record) => record.name)
  const liveNames = snapshot.records.map((record) => record.name)
  assertJsonEqual(inventoryNames, liveNames, 'packages/* inventory')
  assert(new Set(inventoryNames).size === inventoryNames.length, 'inventory duplicates a package')

  assertJsonEqual(inventory.fpDependants, snapshot.fpDependants, 'FP dependant register')
  validateCurrentState(inventory.currentState, statesByName)

  let ready = 0
  const blocked = []
  for (let index = 0; index < inventory.packages.length; index += 1) {
    const record = inventory.packages[index]
    const expected = snapshot.records[index]
    assertExactKeys(
      record,
      [
        'name',
        'path',
        'currentVersion',
        'visibility',
        'exports',
        'commands',
        'internalStopcockRequirements',
        'metadata',
        'disposition',
      ],
      `package record ${record.name}`,
    )
    const { disposition, ...derivedFields } = record
    assertJsonEqual(derivedFields, expected, `${record.name} derived readiness fields`)

    const state = statesByName.get(record.name)
    validateExportTargets(state)
    const issues = staticReadinessIssues(state, record)
    validateDisposition(record, issues)
    if (disposition.status === 'ready') ready += 1
    else blocked.push(record.name)
  }

  for (const record of inventory.packages.filter(
    (entry) => entry.visibility === 'public' && entry.currentVersion === '0.0.0',
  )) {
    assert(
      record.disposition.status === 'ready' || record.disposition.status.startsWith('blocked:'),
      `${record.name} 0.0.0 disposition is not explicit`,
    )
  }

  validateDynamicScopes(dynamicScopes, inventory.packages)
  if (requireReady && blocked.length > 0) {
    fail(`public cohort remains blocked: ${blocked.join(', ')}`)
  }

  return {
    total: inventory.packages.length,
    public: inventory.cohort.public.length,
    privateCompatibility: inventory.cohort.privateCompatibility.length,
    ready,
    blocked,
  }
}

export const validateReadinessInventory = ({ root = repositoryRoot, requireReady = false } = {}) =>
  validateReadinessInventoryData({
    root,
    inventory: readJson(join(root, INVENTORY_PATH)),
    dynamicScopes: readJson(join(root, DYNAMIC_SCOPES_PATH)),
    requireReady,
  })

const main = () => {
  const args = process.argv.slice(2)
  if (
    args.some((argument) => !['--check', '--require-ready'].includes(argument)) ||
    (args.includes('--check') && args.includes('--require-ready'))
  ) {
    console.error(
      'usage: node tooling/check-stopcock-v2-package-cohort-readiness.mjs [--check | --require-ready]',
    )
    process.exitCode = 2
    return
  }

  try {
    const result = validateReadinessInventory({
      requireReady: args.includes('--require-ready'),
    })
    const blockerSummary = result.blocked.length === 0 ? 'none' : result.blocked.join(', ')
    console.log(
      `Stopcock 2.0 readiness inventory valid: ${result.total} packages (${result.public} public, ${result.privateCompatibility} private compatibility); blockers: ${blockerSummary}`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
