import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import {
  alignNext,
  checkPackedCohort,
  computeCohortContentHash,
  expectedCohortManifestPath,
  inspectPackedTarball,
} from '../v2-cohort.mjs'
import { packCohort } from '../v2-pack-cohort.mjs'

const TARGET = '2.0.0-next.0'
const PUBLIC = ['@stopcock/a', '@stopcock/b', '@stopcock/c']

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
  description: `${name} fixture`,
  license: 'MIT',
  type: 'module',
  sideEffects: false,
  files: ['dist', 'README.md', 'CHANGELOG.md', 'LICENSE'],
  exports: {
    '.': {
      types: './dist/index.d.ts',
      import: './dist/index.js',
    },
  },
  ...extra,
})

const createPackage = (root, directory, manifest) => {
  writeJson(root, `${directory}/package.json`, manifest)
  write(root, `${directory}/README.md`, `# ${manifest.name}\n`)
  write(root, `${directory}/CHANGELOG.md`, `# ${manifest.name}\n\n## ${manifest.version}\n`)
  write(root, `${directory}/LICENSE`, 'MIT\n')
  write(root, `${directory}/src/index.js`, `export const name = ${JSON.stringify(manifest.name)}\n`)
}

const createFixture = async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'stopcock-v2-pack-cohort-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  writeJson(root, 'package.json', {
    name: 'pack-cohort-fixture',
    private: true,
    workspaces: ['packages/*'],
    packageManager: 'bun@1.3.14',
  })
  writeJson(root, 'tsconfig.base.json', {
    compilerOptions: {
      declaration: true,
      module: 'ESNext',
      moduleResolution: 'bundler',
      target: 'ES2022',
    },
  })
  writeJson(root, '.changeset/config.json', {
    changelog: '@changesets/cli/changelog',
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

  createPackage(
    root,
    'packages/a',
    packageManifest('@stopcock/a', '1.0.0', {
      dependencies: { '@stopcock/b': 'workspace:*' },
    }),
  )
  createPackage(root, 'packages/b', packageManifest('@stopcock/b', '0.0.0'))
  createPackage(
    root,
    'packages/c',
    packageManifest('@stopcock/c', '1.0.0', {
      bin: { 'stopcock-c': './dist/cli.js' },
      peerDependencies: { '@stopcock/a': '^2.0.0' },
    }),
  )
  createPackage(
    root,
    'packages/synth',
    packageManifest('@stopcock/synth', '1.0.0', {
      private: true,
      dependencies: { '@stopcock/a': '^2.0.0' },
    }),
  )
  writeChangeset(
    root,
    'align-public',
    { '@stopcock/a': 'major', '@stopcock/b': 'major', '@stopcock/c': 'major' },
    'Align the fixture cohort.',
  )
  writeChangeset(
    root,
    'private-only',
    { '@stopcock/synth': 'patch' },
    'Private Synth remains unpublished.',
  )
  await alignNext({
    root,
    target: TARGET,
    runLockfile: async () => {},
  })
  const bunTemp = join(root, '.bun-tmp')
  const bunCache = join(root, '.bun-cache')
  mkdirSync(bunTemp)
  mkdirSync(bunCache)
  execFileSync('bun', ['install', '--lockfile-only'], {
    cwd: root,
    env: {
      ...process.env,
      BUN_INSTALL_CACHE_DIR: bunCache,
      TMPDIR: bunTemp,
    },
    stdio: 'pipe',
  })
  return root
}

const snapshotTree = (root) => {
  const entries = []
  const visit = (directory, local = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = join(directory, entry.name)
      const relativePath = local === '' ? entry.name : join(local, entry.name)
      if (entry.isDirectory()) visit(path, relativePath)
      else if (entry.isFile()) entries.push([relativePath, readFileSync(path)])
    }
  }
  visit(root)
  return entries
}

const assertTreeEqual = (actual, expected) => {
  assert.deepEqual(
    actual.map(([path]) => path),
    expected.map(([path]) => path),
  )
  for (let index = 0; index < expected.length; index += 1) {
    assert.ok(actual[index][1].equals(expected[index][1]), expected[index][0])
  }
}

const makeBuildRunner =
  (calls) =>
  async ({ workspace }) => {
    calls.push(workspace.name)
    const source = readFileSync(join(workspace.path, 'src/index.js'), 'utf8')
    const dist = join(workspace.path, 'dist')
    rmSync(dist, { recursive: true, force: true })
    mkdirSync(dist, { recursive: true })
    writeFileSync(join(dist, 'index.js'), source)
    writeFileSync(join(dist, 'index.d.ts'), 'export declare const name: string\n')
    if (workspace.name === '@stopcock/c') {
      writeFileSync(join(dist, 'cli.js'), '#!/usr/bin/env node\nconsole.log("c")\n')
    }
  }

test('dev packing is dependency-ordered, exact, content-addressed, and immutable', async (t) => {
  const root = await createFixture(t)
  const firstBuilds = []
  const first = await packCohort({
    root,
    mode: 'dev',
    target: TARGET,
    runBuild: makeBuildRunner(firstBuilds),
  })

  assert.equal(first.changed, true)
  assert.deepEqual(firstBuilds, ['@stopcock/b', '@stopcock/a', '@stopcock/c'])
  assert.deepEqual(first.buildOrder, firstBuilds)
  assert.match(
    first.manifest,
    /^artifacts\/v2\/dev\/2\.0\.0-next\.0\/[0-9a-f]{64}\/cohort-manifest\.json$/u,
  )
  assert.equal(first.check.command, 'check-packed')
  assert.equal(first.check.publicCount, 3)

  const manifestPath = join(root, first.manifest)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.deepEqual(
    manifest.packages.map((entry) => entry.name),
    PUBLIC,
  )
  assert.equal(
    manifest.packages
      .find((entry) => entry.name === '@stopcock/a')
      .internalDependencies.find((entry) => entry.name === '@stopcock/b').range,
    TARGET,
  )
  assert.ok(!manifest.packages.some((entry) => entry.name === '@stopcock/synth'))
  assert.equal(manifest.privateCompatibility.publication, 'excluded')
  assert.equal(
    readdirSync(join(dirname(manifestPath), 'tarballs')).filter((name) => name.endsWith('.tgz'))
      .length,
    3,
  )
  const firstPackage = manifest.packages[0]
  const firstWorkspaceManifest = JSON.parse(
    readFileSync(join(root, firstPackage.directory, 'package.json'), 'utf8'),
  )
  const changedWorkspaceSurface = structuredClone(firstWorkspaceManifest)
  changedWorkspaceSurface.exports['.'].import = './dist/not-packed.js'
  assert.throws(
    () =>
      inspectPackedTarball({
        tarballPath: join(dirname(manifestPath), firstPackage.tarball.path),
        expectedName: firstPackage.name,
        expectedVersion: TARGET,
        selectedPublicNames: PUBLIC,
        expectedWorkspaceManifest: changedWorkspaceSurface,
      }),
    /packed exports does not match the workspace manifest/u,
  )

  const checked = await checkPackedCohort({ root, manifest: first.manifest })
  assert.equal(checked.cohortContentHash, first.cohortContentHash)
  const incompleteInputsManifest = structuredClone(manifest)
  incompleteInputsManifest.buildInputs = incompleteInputsManifest.buildInputs.slice(1)
  incompleteInputsManifest.cohortContentHash = computeCohortContentHash(incompleteInputsManifest)
  const incompleteInputsPath = expectedCohortManifestPath({
    root,
    mode: 'dev',
    target: TARGET,
    contentHash: incompleteInputsManifest.cohortContentHash,
  })
  mkdirSync(dirname(incompleteInputsPath), { recursive: true })
  cpSync(join(dirname(manifestPath), 'tarballs'), join(dirname(incompleteInputsPath), 'tarballs'), {
    recursive: true,
  })
  writeFileSync(incompleteInputsPath, `${JSON.stringify(incompleteInputsManifest, null, 2)}\n`)
  await assert.rejects(
    checkPackedCohort({
      root,
      manifest: incompleteInputsPath.slice(root.length + 1),
    }),
    /complete canonical build-input set/u,
  )
  const artifactBeforeRepeat = snapshotTree(dirname(manifestPath))
  const repeatBuilds = []
  const repeat = await packCohort({
    root,
    mode: 'dev',
    target: TARGET,
    runBuild: makeBuildRunner(repeatBuilds),
  })
  assert.equal(repeat.changed, false)
  assert.equal(repeat.manifest, first.manifest)
  assert.deepEqual(repeatBuilds, firstBuilds)
  assertTreeEqual(snapshotTree(dirname(manifestPath)), artifactBeforeRepeat)

  write(root, 'packages/a/src/index.js', 'export const name = "@stopcock/a changed"\n')
  const changed = await packCohort({
    root,
    mode: 'dev',
    target: TARGET,
    runBuild: makeBuildRunner([]),
  })
  assert.equal(changed.changed, true)
  assert.notEqual(changed.manifest, first.manifest)
  assert.equal(existsSync(join(root, first.manifest)), true)
  assert.equal(existsSync(join(root, changed.manifest)), true)

  const changedManifest = JSON.parse(readFileSync(join(root, changed.manifest), 'utf8'))
  const tarballPath = join(
    dirname(join(root, changed.manifest)),
    changedManifest.packages[0].tarball.path,
  )
  appendFileSync(tarballPath, 'tamper')
  const tamperedBytes = readFileSync(tarballPath)
  await assert.rejects(
    checkPackedCohort({ root, manifest: changed.manifest }),
    /tarball identity does not match/u,
  )
  await assert.rejects(
    packCohort({
      root,
      mode: 'dev',
      target: TARGET,
      runBuild: makeBuildRunner([]),
    }),
    /tarball identity does not match|refusing to overwrite/u,
  )
  assert.ok(readFileSync(tarballPath).equals(tamperedBytes))

  const tarballsDirectory = join(dirname(manifestPath), 'tarballs')
  const movedTarballsDirectory = join(dirname(manifestPath), 'tarballs-real')
  renameSync(tarballsDirectory, movedTarballsDirectory)
  symlinkSync(movedTarballsDirectory, tarballsDirectory, 'dir')
  try {
    await assert.rejects(
      checkPackedCohort({ root, manifest: first.manifest, verifyWorkspace: false }),
      /cannot traverse a symbolic link/u,
    )
  } finally {
    unlinkSync(tarballsDirectory)
    renameSync(movedTarballsDirectory, tarballsDirectory)
  }
})

test('packed inspection rejects undeclared archive members and local-only RC paths', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'stopcock-v2-pack-inspection-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const workspaceManifest = packageManifest('@stopcock/a', TARGET)
  writeJson(root, 'archive/package/package.json', workspaceManifest)
  write(root, 'archive/package/README.md', '# A\n')
  write(root, 'archive/package/CHANGELOG.md', '# Changes\n')
  write(root, 'archive/package/LICENSE', 'MIT\n')
  write(root, 'archive/package/dist/index.js', 'export const a = 1\n')
  write(root, 'archive/package/dist/index.d.ts', 'export declare const a: number\n')
  write(root, 'archive/package/scripts/leak.js', 'export const leaked = true\n')
  const tarballPath = join(root, 'stopcock-a-2.0.0-next.0.tgz')
  execFileSync('tar', ['-czf', tarballPath, '-C', join(root, 'archive'), 'package'])

  assert.throws(
    () =>
      inspectPackedTarball({
        tarballPath,
        expectedName: '@stopcock/a',
        expectedVersion: TARGET,
        selectedPublicNames: ['@stopcock/a'],
        expectedWorkspaceManifest: workspaceManifest,
      }),
    /outside the files allowlist/u,
  )
  assert.throws(
    () =>
      expectedCohortManifestPath({
        root,
        mode: 'candidate',
        target: TARGET,
        contentHash: `sha256:${'0'.repeat(64)}`,
      }),
    /local-only 2\.0\.0-next\.0/u,
  )
})
