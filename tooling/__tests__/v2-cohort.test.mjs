import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import {
  advanceNext,
  alignNext,
  alignStable,
  joinCurrent,
  loadChangesetsRuntime,
  planCohort,
} from '../v2-cohort.mjs'

const TARGET = '2.0.0-next.0'
const PUBLIC = ['@stopcock/a', '@stopcock/b', '@stopcock/c']
const compareStrings = (left, right) => left.localeCompare(right)
const PRIVATE_PATHS = [
  'apps/private-app/package.json',
  'apps/private-app/CHANGELOG.md',
  'apps/docs/package.json',
  'apps/docs/CHANGELOG.md',
  'benchmarks/package.json',
  'benchmarks/CHANGELOG.md',
  'packages/synth/CHANGELOG.md',
]

const write = (root, path, contents) => {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, contents)
}

const writeJson = (root, path, value) => write(root, path, `${JSON.stringify(value, null, 2)}\n`)

const writeChangeset = (root, id, releases, summary) => {
  const frontmatter = Object.entries(releases)
    .map(([name, type]) => `'${name}': ${type}`)
    .join('\n')
  write(root, `.changeset/${id}.md`, `---\n${frontmatter}\n---\n\n${summary}\n`)
}

const packageManifest = (name, version, extra = {}) => ({
  name,
  version,
  type: 'module',
  ...extra,
})

const createFixture = (t) => {
  const root = mkdtempSync(join(tmpdir(), 'stopcock-v2-cohort-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  writeJson(root, 'package.json', {
    name: 'cohort-fixture',
    private: true,
    workspaces: ['packages/*', 'apps/*', 'benchmarks'],
    packageManager: 'bun@1.3.14',
  })
  writeJson(root, '.changeset/config.json', {
    changelog: ['@changesets/changelog-github', { repo: 'tdeaks/stopcock' }],
    commit: false,
    fixed: [],
    linked: [],
    access: 'public',
    baseBranch: 'main',
    updateInternalDependencies: 'patch',
    privatePackages: false,
    ignore: [],
  })
  writeJson(root, 'docs/superpowers/contracts/stopcock-v2-package-cohort-readiness.json', {
    schemaVersion: 1,
    cohort: {
      public: PUBLIC,
      privateCompatibility: ['@stopcock/synth'],
    },
    packages: [...PUBLIC, '@stopcock/synth'].map((name) => ({
      name,
      disposition: { status: 'ready' },
    })),
  })

  writeJson(
    root,
    'packages/a/package.json',
    packageManifest('@stopcock/a', '1.0.0', {
      dependencies: { '@stopcock/b': 'workspace:*' },
    }),
  )
  write(
    root,
    'packages/a/CHANGELOG.md',
    '# @stopcock/a\n\n## 2.0.0\n\n- PREEXISTING_STABLE_TEXT must survive.\n\n## 1.0.0\n\n- Existing A.\n',
  )
  writeJson(
    root,
    'packages/b/package.json',
    packageManifest('@stopcock/b', '0.0.0', {
      peerDependencies: { '@stopcock/a': '^2.0.0' },
    }),
  )
  writeJson(
    root,
    'packages/c/package.json',
    packageManifest('@stopcock/c', '1.0.0', {
      devDependencies: { '@stopcock/a': 'workspace:*' },
    }),
  )
  write(root, 'packages/c/CHANGELOG.md', '# @stopcock/c\n\n## 1.0.0\n\n- Existing C.\n')
  writeJson(
    root,
    'packages/synth/package.json',
    packageManifest('@stopcock/synth', '1.0.0', {
      private: true,
      dependencies: { '@stopcock/a': 'workspace:*' },
    }),
  )
  write(root, 'packages/synth/CHANGELOG.md', '# @stopcock/synth\n\n- Private history.\n')

  writeJson(
    root,
    'apps/private-app/package.json',
    packageManifest('private-app', '0.0.1', { private: true }),
  )
  write(root, 'apps/private-app/CHANGELOG.md', '# private-app\n\n- Must not change.\n')
  writeJson(root, 'apps/docs/package.json', {
    name: 'fixture-docs',
    private: true,
  })
  writeJson(root, 'benchmarks/package.json', {
    name: 'fixture-benchmarks',
    private: true,
  })

  writeChangeset(
    root,
    'public-mixed-bumps',
    { '@stopcock/a': 'patch', '@stopcock/b': 'major' },
    'PUBLIC_AB_SUMMARY must survive normalization.',
  )
  writeChangeset(
    root,
    'public-c',
    { '@stopcock/c': 'minor' },
    'PUBLIC_C_SUMMARY must survive normalization.',
  )
  writeChangeset(
    root,
    'private-only',
    { '@stopcock/synth': 'patch' },
    'PRIVATE_SUMMARY must remain pending and unpublished.',
  )
  return root
}

const listFiles = (root) => {
  const paths = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) paths.push(path)
    }
  }
  visit(root)
  return paths
}

const snapshotTree = (root) =>
  new Map(listFiles(root).map((path) => [path.slice(root.length + 1), readFileSync(path)]))

const assertSnapshotsEqual = (actual, expected) => {
  assert.deepEqual([...actual.keys()], [...expected.keys()])
  for (const [path, bytes] of expected) assert.ok(actual.get(path).equals(bytes), path)
}

const snapshotPaths = (root, paths) =>
  new Map(
    paths.map((path) => [
      path,
      existsSync(join(root, path)) ? readFileSync(join(root, path)) : null,
    ]),
  )

const assertPathsUnchanged = (root, snapshot) => {
  for (const [path, bytes] of snapshot) {
    if (bytes === null) assert.equal(existsSync(join(root, path)), false, path)
    else assert.ok(readFileSync(join(root, path)).equals(bytes), path)
  }
}

const readManifest = (root, directory) => JSON.parse(readFileSync(join(root, directory), 'utf8'))

const noLockfileMutation = async () => {}

test('plan is deterministic, side-effect free, and normalizes mixed versions and ranges', async (t) => {
  const root = createFixture(t)
  const before = snapshotTree(root)
  const first = await planCohort({ root, target: TARGET })
  const second = await planCohort({ root, target: TARGET })

  assert.deepEqual(second, first)
  assertSnapshotsEqual(snapshotTree(root), before)
  assert.equal(first.cohort.publicCount, 3)
  assert.equal(first.cohort.privateCompatibilityCount, 1)
  assert.deepEqual(first.publicChangesets, ['public-c', 'public-mixed-bumps'])
  assert.deepEqual(first.untouchedPrivateChangesets, ['private-only'])
  assert.deepEqual(
    first.publicPackages.map((entry) => entry.proposedVersion),
    [TARGET, TARGET, TARGET],
  )
  const b = first.publicPackages.find((entry) => entry.name === '@stopcock/b')
  assert.equal(b.currentVersion, '0.0.0')
  assert.ok(
    b.manifestChanges.some(
      (entry) =>
        entry.section === 'peerDependencies' && entry.name === '@stopcock/a' && entry.to === TARGET,
    ),
  )
  assert.deepEqual(
    first.excludedPrivateWorkspaces.map((entry) => entry.name).sort(compareStrings),
    ['fixture-benchmarks', 'fixture-docs', 'private-app'],
  )
})

test('mixed selected-public and private changesets fail closed without writes', async (t) => {
  const root = createFixture(t)
  writeChangeset(
    root,
    'invalid-mixed',
    { '@stopcock/a': 'patch', '@stopcock/synth': 'patch' },
    'This changeset must be split.',
  )
  const before = snapshotTree(root)
  await assert.rejects(
    planCohort({ root, target: TARGET }),
    /mixed public\/private changeset invalid-mixed must be split explicitly/u,
  )
  assertSnapshotsEqual(snapshotTree(root), before)
})

test('align-next filters Changesets, preserves private bytes, and is byte-stable on rerun', async (t) => {
  const root = createFixture(t)
  const privateBefore = snapshotPaths(root, PRIVATE_PATHS)
  const configPath = join(root, '.changeset/config.json')
  const configBefore = readFileSync(configPath)
  const baseRuntime = loadChangesetsRuntime()
  let appliedConfig
  const runtime = {
    ...baseRuntime,
    applyReleasePlan: async (...arguments_) => {
      appliedConfig = arguments_[2]
      return baseRuntime.applyReleasePlan(...arguments_)
    },
  }
  let lockfileCalls = 0
  const runLockfile = async () => {
    lockfileCalls += 1
  }

  const result = await alignNext({ root, target: TARGET, runLockfile, runtime })
  assert.equal(result.changed, true)
  assert.equal(lockfileCalls, 1)
  assert.deepEqual(result.consumedChangesets, ['public-c', 'public-mixed-bumps'])
  assert.deepEqual(appliedConfig.changelog, [baseRuntime.deterministicChangelogPath, null])
  assert.ok(readFileSync(configPath).equals(configBefore))

  for (const directory of [
    'packages/a/package.json',
    'packages/b/package.json',
    'packages/c/package.json',
  ]) {
    assert.equal(readManifest(root, directory).version, TARGET)
  }
  assert.equal(
    readManifest(root, 'packages/b/package.json').peerDependencies['@stopcock/a'],
    TARGET,
  )
  assert.equal(
    readManifest(root, 'packages/a/package.json').dependencies['@stopcock/b'],
    'workspace:*',
  )
  const synth = readManifest(root, 'packages/synth/package.json')
  assert.equal(synth.version, TARGET)
  assert.equal(synth.private, true)

  const preState = readManifest(root, '.changeset/pre.json')
  assert.equal(preState.mode, 'pre')
  assert.equal(preState.tag, 'next')
  assert.deepEqual(preState.changesets.sort(compareStrings), ['public-c', 'public-mixed-bumps'])
  assert.ok(!preState.changesets.includes('private-only'))
  assertPathsUnchanged(root, privateBefore)
  assert.equal(existsSync(join(root, '.changeset/private-only.md')), true)
  assert.equal(existsSync(join(root, '.changeset/public-mixed-bumps.md')), true)
  assert.match(readFileSync(join(root, 'packages/a/CHANGELOG.md'), 'utf8'), /PUBLIC_AB_SUMMARY/u)
  assert.match(readFileSync(join(root, 'packages/c/CHANGELOG.md'), 'utf8'), /PUBLIC_C_SUMMARY/u)

  const afterFirst = snapshotTree(root)
  const repeat = await alignNext({ root, target: TARGET, runLockfile, runtime })
  assert.equal(repeat.changed, false)
  assert.equal(lockfileCalls, 1)
  assertSnapshotsEqual(snapshotTree(root), afterFirst)
})

test('a failed lockfile step restores every controlled file to its starting bytes', async (t) => {
  const root = createFixture(t)
  const before = snapshotTree(root)
  await assert.rejects(
    alignNext({
      root,
      target: TARGET,
      runLockfile: async () => {
        throw new Error('synthetic lockfile failure')
      },
    }),
    /synthetic lockfile failure/u,
  )
  assertSnapshotsEqual(snapshotTree(root), before)
})

test('advance-next consumes only new public changesets and advances the whole cohort', async (t) => {
  const root = createFixture(t)
  await alignNext({ root, target: TARGET, runLockfile: noLockfileMutation })
  writeChangeset(
    root,
    'post-rc-public',
    { '@stopcock/a': 'patch' },
    'POST_RC_SUMMARY requires a complete cohort advance.',
  )
  const privateBefore = snapshotPaths(root, PRIVATE_PATHS)

  const result = await advanceNext({
    root,
    target: '2.0.0-next.1',
    runLockfile: noLockfileMutation,
  })
  assert.deepEqual(result.consumedChangesets, ['post-rc-public'])
  for (const directory of [
    'packages/a/package.json',
    'packages/b/package.json',
    'packages/c/package.json',
    'packages/synth/package.json',
  ]) {
    assert.equal(readManifest(root, directory).version, '2.0.0-next.1')
  }
  const preState = readManifest(root, '.changeset/pre.json')
  assert.ok(preState.changesets.includes('post-rc-public'))
  assert.ok(!preState.changesets.includes('private-only'))
  assert.match(readFileSync(join(root, 'packages/a/CHANGELOG.md'), 'utf8'), /POST_RC_SUMMARY/u)
  assertPathsUnchanged(root, privateBefore)
})

test('join-current aligns only the conditional optimizer and leaves its changeset pending', async (t) => {
  const root = createFixture(t)
  await alignNext({ root, target: TARGET, runLockfile: noLockfileMutation })
  writeJson(
    root,
    'packages/fp-optimizer/package.json',
    packageManifest('@stopcock/fp-optimizer', '0.0.0', {
      peerDependencies: { '@stopcock/a': 'workspace:*' },
    }),
  )
  writeChangeset(
    root,
    'add-optimizer',
    { '@stopcock/fp-optimizer': 'major' },
    'Add the direct opt-in optimizer.',
  )
  await assert.rejects(
    planCohort({ root, target: TARGET }),
    /exists but has not joined the cohort; run join-current first/u,
  )
  const unaffected = snapshotPaths(root, [
    ...PRIVATE_PATHS,
    'packages/a/package.json',
    'packages/b/package.json',
    'packages/c/package.json',
    'packages/synth/package.json',
    'packages/a/CHANGELOG.md',
    'packages/b/CHANGELOG.md',
    'packages/c/CHANGELOG.md',
  ])

  const result = await joinCurrent({
    root,
    packageName: '@stopcock/fp-optimizer',
    runLockfile: noLockfileMutation,
  })
  assert.equal(result.changed, true)
  assert.equal(result.check.publicCount, 4)
  assert.ok(result.check.pendingPublicChangesets.includes('add-optimizer'))
  const optimizer = readManifest(root, 'packages/fp-optimizer/package.json')
  assert.equal(optimizer.version, TARGET)
  assert.equal(optimizer.peerDependencies['@stopcock/a'], TARGET)
  const preState = readManifest(root, '.changeset/pre.json')
  assert.equal(preState.initialVersions['@stopcock/fp-optimizer'], '0.0.0')
  assert.ok(!preState.changesets.includes('add-optimizer'))
  assert.equal(existsSync(join(root, '.changeset/add-optimizer.md')), true)
  assertPathsUnchanged(root, unaffected)

  writeJson(root, 'artifacts/v2/optimizer-topology-decision.json', {
    schemaVersion: 1,
    topology: 'direct-opt-in-package',
    selectedPublicCohort: [...PUBLIC, '@stopcock/fp-optimizer'],
    selectedPublicCount: 4,
  })
  const postDecisionPlan = await planCohort({ root, target: '2.0.0-next.1' })
  assert.equal(postDecisionPlan.cohort.optimizerTopology, 'direct-opt-in-package')
  assert.equal(postDecisionPlan.cohort.publicCount, 4)
})

test('join-current requires a pending changeset that names the optimizer', async (t) => {
  const root = createFixture(t)
  await alignNext({ root, target: TARGET, runLockfile: noLockfileMutation })
  writeJson(
    root,
    'packages/fp-optimizer/package.json',
    packageManifest('@stopcock/fp-optimizer', '0.0.0', {
      peerDependencies: { '@stopcock/a': 'workspace:*' },
    }),
  )
  writeChangeset(
    root,
    'unrelated-after-join',
    { '@stopcock/a': 'patch' },
    'An unrelated public change cannot authorize the optimizer.',
  )
  const before = snapshotTree(root)
  await assert.rejects(
    joinCurrent({
      root,
      packageName: '@stopcock/fp-optimizer',
      runLockfile: noLockfileMutation,
    }),
    /requires its own pending changeset before join-current/u,
  )
  assertSnapshotsEqual(snapshotTree(root), before)
})

test('align-stable filters synthetic private exit releases and preserves missing private versions', async (t) => {
  const root = createFixture(t)
  await alignNext({ root, target: TARGET, runLockfile: noLockfileMutation })
  const preState = readManifest(root, '.changeset/pre.json')
  delete preState.initialVersions['private-app']
  delete preState.initialVersions['fixture-docs']
  delete preState.initialVersions['fixture-benchmarks']
  delete preState.initialVersions['@stopcock/synth']
  writeJson(root, '.changeset/pre.json', preState)
  const privateBefore = snapshotPaths(root, PRIVATE_PATHS)

  const result = await alignStable({
    root,
    target: '2.0.0',
    acceptedRc: {
      schemaVersion: 1,
      action: 'RC_PUBLISH',
      status: 'COMPLETED',
      version: TARGET,
      artifact: `sha256:${'a'.repeat(64)}`,
    },
    runLockfile: noLockfileMutation,
  })
  assert.equal(result.target, '2.0.0')
  assert.deepEqual(result.filteredExcludedReleases, [
    '@stopcock/synth',
    'fixture-benchmarks',
    'fixture-docs',
    'private-app',
  ])
  assert.equal(existsSync(join(root, '.changeset/pre.json')), false)
  assert.equal(existsSync(join(root, '.changeset/private-only.md')), true)
  assert.equal(existsSync(join(root, '.changeset/public-mixed-bumps.md')), false)
  assertPathsUnchanged(root, privateBefore)

  for (const directory of [
    'packages/a/package.json',
    'packages/b/package.json',
    'packages/c/package.json',
  ]) {
    assert.equal(readManifest(root, directory).version, '2.0.0')
  }
  assert.equal(readManifest(root, 'packages/synth/package.json').version, '2.0.0')
  assert.equal(
    readManifest(root, 'packages/b/package.json').peerDependencies['@stopcock/a'],
    '^2.0.0',
  )
  const stableChangelog = readFileSync(join(root, 'packages/a/CHANGELOG.md'), 'utf8')
  assert.equal(stableChangelog.match(/^## 2\.0\.0$/gmu)?.length, 1)
  assert.match(stableChangelog, /PREEXISTING_STABLE_TEXT must survive/u)
  assert.match(stableChangelog, /PUBLIC_AB_SUMMARY must survive normalization/u)
  assert.equal(Object.hasOwn(readManifest(root, 'apps/docs/package.json'), 'version'), false)
  assert.equal(Object.hasOwn(readManifest(root, 'benchmarks/package.json'), 'version'), false)
})
