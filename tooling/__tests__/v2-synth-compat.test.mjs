import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { alignNext } from '../v2-cohort.mjs'
import { packCohort } from '../v2-pack-cohort.mjs'
import { defaultTypecheckSynth, runSynthCompatibility } from '../v2-synth-compat.mjs'

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TARGET = '2.0.0-next.0'
const PUBLIC = ['@stopcock/dev-only', '@stopcock/fp', '@stopcock/signal', '@stopcock/unused']

const FP_SOURCE = `export const pipe = (value, ...operations) =>
  operations.reduce((current, operation) => operation(current), value)
`

const FP_TYPES = `export declare function pipe<A, B>(value: A, operation: (value: A) => B): B
`

const SIGNAL_SOURCE = `export const fft = {
  rfft(input) {
    return new Float64Array(input.length + 2)
  },
  irfft(_input, length) {
    return new Float32Array(length)
  },
}

export const biquad = {
  design() {
    return new Float64Array(5)
  },
  process(input, _coefficients, _state, output) {
    output.set(input)
    return output
  },
}

export const convolve = {
  direct(input, kernel) {
    return new Float32Array(input.length + kernel.length - 1)
  },
}
`

const SIGNAL_TYPES = `export declare const fft: {
  rfft(input: Float32Array): Float64Array
  irfft(input: Float64Array, length: number): Float32Array
}
export declare const biquad: {
  design(spec: {
    kind: string
    freq: number
    q: number
    gainDb?: number
    sampleRate: number
  }): Float64Array
  process(
    input: Float32Array,
    coefficients: Float64Array,
    state: Float64Array,
    output: Float32Array,
  ): Float32Array
}
export declare const convolve: {
  direct(input: Float32Array, kernel: Float32Array): Float32Array
}
`

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
  description: `${name} compatibility fixture`,
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

const createPublicPackage = (root, directory, manifest, source, types) => {
  writeJson(root, `${directory}/package.json`, manifest)
  write(root, `${directory}/README.md`, `# ${manifest.name}\n`)
  write(root, `${directory}/CHANGELOG.md`, `# ${manifest.name}\n\n## ${manifest.version}\n`)
  write(root, `${directory}/LICENSE`, 'MIT\n')
  write(root, `${directory}/src/index.js`, source)
  write(root, `${directory}/src/index.d.ts`, types)
}

const createFixture = async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'stopcock-v2-synth-compat-fixture-'))
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'stopcock-v2-synth-compat-scratch-'))
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(temporaryRoot, { recursive: true, force: true })
  })

  writeJson(root, 'package.json', {
    name: 'synth-compatibility-fixture',
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

  createPublicPackage(
    root,
    'packages/fp',
    packageManifest('@stopcock/fp', '1.0.0', {
      dependencies: { '@stopcock/unused': 'workspace:*' },
    }),
    FP_SOURCE,
    FP_TYPES,
  )
  createPublicPackage(
    root,
    'packages/signal',
    packageManifest('@stopcock/signal', '1.0.0', {
      devDependencies: { '@stopcock/dev-only': 'workspace:*' },
    }),
    SIGNAL_SOURCE,
    SIGNAL_TYPES,
  )
  createPublicPackage(
    root,
    'packages/dev-only',
    packageManifest('@stopcock/dev-only', '0.0.0'),
    'export const devOnly = true\n',
    'export declare const devOnly: true\n',
  )
  createPublicPackage(
    root,
    'packages/unused',
    packageManifest('@stopcock/unused', '0.0.0'),
    'export const unused = true\n',
    'export declare const unused: true\n',
  )
  writeJson(
    root,
    'packages/synth/package.json',
    packageManifest('@stopcock/synth', '1.0.0', {
      private: true,
      files: ['dist'],
      dependencies: {
        '@stopcock/fp': 'workspace:*',
        '@stopcock/signal': 'workspace:*',
      },
    }),
  )
  write(root, 'packages/synth/CHANGELOG.md', '# @stopcock/synth\n\n- Private history.\n')
  cpSync(join(REPOSITORY_ROOT, 'packages/synth/src'), join(root, 'packages/synth/src'), {
    recursive: true,
  })

  writeChangeset(
    root,
    'align-public',
    {
      '@stopcock/dev-only': 'major',
      '@stopcock/fp': 'major',
      '@stopcock/signal': 'major',
      '@stopcock/unused': 'major',
    },
    'Align the fixture public cohort.',
  )
  writeChangeset(
    root,
    'private-only',
    { '@stopcock/synth': 'patch' },
    'Keep the private compatibility workspace unpublished.',
  )
  await alignNext({
    root,
    target: TARGET,
    runLockfile: async () => {},
  })

  const bunTemporary = join(root, '.bun-tmp')
  const bunCache = join(root, '.bun-cache')
  mkdirSync(bunTemporary)
  mkdirSync(bunCache)
  const install = spawnSync('bun', ['install', '--lockfile-only'], {
    cwd: root,
    env: {
      ...process.env,
      BUN_INSTALL_CACHE_DIR: bunCache,
      TMPDIR: bunTemporary,
    },
    encoding: 'utf8',
    stdio: 'pipe',
  })
  assert.equal(install.status, 0, install.stderr || install.stdout)

  const builds = []
  const packed = await packCohort({
    root,
    mode: 'dev',
    target: TARGET,
    runBuild: async ({ workspace }) => {
      builds.push(workspace.name)
      const dist = join(workspace.path, 'dist')
      rmSync(dist, { recursive: true, force: true })
      mkdirSync(dist)
      writeFileSync(join(dist, 'index.js'), readFileSync(join(workspace.path, 'src/index.js')))
      writeFileSync(join(dist, 'index.d.ts'), readFileSync(join(workspace.path, 'src/index.d.ts')))
    },
  })
  assert.deepEqual(builds, [
    '@stopcock/dev-only',
    '@stopcock/unused',
    '@stopcock/fp',
    '@stopcock/signal',
  ])
  return { root, temporaryRoot, manifest: packed.manifest }
}

const runFixtureCompatibility = ({ root, temporaryRoot, manifest }, overrides = {}) =>
  runSynthCompatibility({
    root,
    temporaryRoot,
    manifest,
    runTypecheck: ({ directory }) => defaultTypecheckSynth({ directory, root: REPOSITORY_ROOT }),
    ...overrides,
  })

test('Synth compatibility installs only exact packed dependencies and is deterministic', async (t) => {
  const fixture = await createFixture(t)
  const first = await runFixtureCompatibility(fixture)

  assert.equal(first.command, 'synth-compat')
  assert.equal(first.target, TARGET)
  assert.deepEqual(first.dependencies.direct, ['@stopcock/fp', '@stopcock/signal'])
  assert.deepEqual(
    first.dependencies.installed.map((entry) => entry.name),
    ['@stopcock/fp', '@stopcock/signal', '@stopcock/unused'],
  )
  assert.equal(first.synth.private, true)
  assert.equal(first.synth.publication, 'excluded')
  assert.deepEqual(
    first.contracts.map((entry) => [entry.id, entry.status]),
    [
      ['synth-source-types', 'passed'],
      ['stopcock-v2-synth-packed-dependencies', 'passed'],
    ],
  )
  assert.deepEqual(first.contracts[1].observation, {
    schemaVersion: 1,
    contract: 'stopcock-v2-synth-packed-dependencies',
    renderedFrames: 4,
    firstSample: 0.5,
    wavetableFrames: 1,
    wavetableSize: 32,
  })
  assert.deepEqual(readdirSync(fixture.temporaryRoot), [])

  const second = await runFixtureCompatibility(fixture)
  assert.deepEqual(second, first)
  assert.deepEqual(readdirSync(fixture.temporaryRoot), [])

  await assert.rejects(
    runFixtureCompatibility(fixture, {
      runInstall: async () => {
        throw new Error('synthetic install failure')
      },
    }),
    /synthetic install failure/u,
  )
  assert.deepEqual(readdirSync(fixture.temporaryRoot), [])

  await assert.rejects(
    runFixtureCompatibility(fixture, {
      runTypecheck: async () => {
        throw new Error('synthetic type-check failure')
      },
    }),
    /synthetic type-check failure/u,
  )
  assert.deepEqual(readdirSync(fixture.temporaryRoot), [])

  await assert.rejects(
    runFixtureCompatibility(fixture, {
      runContract: async () => {
        throw new Error('synthetic contract failure')
      },
    }),
    /synthetic contract failure/u,
  )
  assert.deepEqual(readdirSync(fixture.temporaryRoot), [])
})

test('Synth compatibility fails closed on manifest, publication, workspace, and tarball drift', async (t) => {
  const fixture = await createFixture(t)
  const manifestPath = join(fixture.root, fixture.manifest)
  const manifestBefore = readFileSync(manifestPath)
  const manifest = JSON.parse(manifestBefore)

  manifest.privateCompatibility.publication = 'included'
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await assert.rejects(runFixtureCompatibility(fixture), /publication must be excluded/u)
  writeFileSync(manifestPath, manifestBefore)

  const publicSynth = JSON.parse(manifestBefore)
  publicSynth.packages[0].name = '@stopcock/synth'
  writeFileSync(manifestPath, `${JSON.stringify(publicSynth, null, 2)}\n`)
  await assert.rejects(runFixtureCompatibility(fixture), /must not be packed/u)
  writeFileSync(manifestPath, manifestBefore)

  const synthManifestPath = join(fixture.root, 'packages/synth/package.json')
  const synthManifestBefore = readFileSync(synthManifestPath)
  const synthManifest = JSON.parse(synthManifestBefore)
  synthManifest.private = false
  writeFileSync(synthManifestPath, `${JSON.stringify(synthManifest, null, 2)}\n`)
  await assert.rejects(runFixtureCompatibility(fixture), /must remain private/u)
  writeFileSync(synthManifestPath, synthManifestBefore)

  const externalDependency = JSON.parse(synthManifestBefore)
  externalDependency.dependencies['registry-only'] = '1.0.0'
  writeFileSync(synthManifestPath, `${JSON.stringify(externalDependency, null, 2)}\n`)
  await assert.rejects(
    runFixtureCompatibility(fixture),
    /registry-only is not available from the packed cohort/u,
  )
  writeFileSync(synthManifestPath, synthManifestBefore)

  const restoredManifest = JSON.parse(manifestBefore)
  const tarballPath = join(dirname(manifestPath), restoredManifest.packages[0].tarball.path)
  const tarballBefore = readFileSync(tarballPath)
  appendFileSync(tarballPath, 'tamper')
  await assert.rejects(runFixtureCompatibility(fixture), /tarball identity does not match/u)
  writeFileSync(tarballPath, tarballBefore)

  const tarballsDirectory = join(dirname(manifestPath), 'tarballs')
  const realTarballsDirectory = join(dirname(manifestPath), 'tarballs-real')
  renameSync(tarballsDirectory, realTarballsDirectory)
  symlinkSync(realTarballsDirectory, tarballsDirectory, 'dir')
  try {
    await assert.rejects(runFixtureCompatibility(fixture), /cannot traverse a symbolic link/u)
  } finally {
    unlinkSync(tarballsDirectory)
    renameSync(realTarballsDirectory, tarballsDirectory)
  }

  await assert.rejects(
    runSynthCompatibility({ root: fixture.root, manifest: '' }),
    /packed cohort manifest is required/u,
  )
  await assert.rejects(
    runSynthCompatibility({ root: fixture.root, manifest: 'artifacts/v2/missing.json' }),
    /missing packed cohort manifest/u,
  )
  assert.equal(existsSync(manifestPath), true)
  assert.deepEqual(readdirSync(fixture.temporaryRoot), [])
})

test('Synth compatibility CLI rejects an omitted manifest', () => {
  const result = spawnSync(process.execPath, ['tooling/v2-synth-compat.mjs'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /usage: node tooling\/v2-synth-compat\.mjs --manifest <path>/u)
})
