import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const PACKAGES_ROOT = join(REPO_ROOT, 'packages')
const INSTALL_REQUIREMENT_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
]
const LOCAL_PROTOCOL = /^(?:workspace|catalog):/

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

const assertRegistryResolvable = (manifest, source) => {
  for (const field of INSTALL_REQUIREMENT_FIELDS) {
    for (const [dependency, requirement] of Object.entries(manifest[field] ?? {})) {
      assert.equal(
        LOCAL_PROTOCOL.test(requirement),
        false,
        `${source}: ${field}.${dependency} must not use ${requirement}`,
      )
    }
  }
}

void test('npm-packed public manifests contain registry-resolvable install requirements', async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), 'stopcock-publish-manifests-'))
  t.after(() => rm(scratch, { recursive: true, force: true }))

  const directories = (await readdir(PACKAGES_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  let checked = 0
  for (const directory of directories) {
    const packageRoot = join(PACKAGES_ROOT, directory)
    const sourceManifest = await readJson(join(packageRoot, 'package.json'))
    if (sourceManifest.private === true) continue

    assertRegistryResolvable(sourceManifest, `${sourceManifest.name} source manifest`)

    const packOutput = execFileSync(
      'npm',
      ['pack', '--json', '--pack-destination', scratch],
      {
        cwd: packageRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          npm_config_cache: join(scratch, 'npm-cache'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    const [packed] = JSON.parse(packOutput)
    assert.ok(packed?.filename, `${sourceManifest.name}: npm pack returned no filename`)

    const tarballPath = join(scratch, packed.filename)
    const packedManifest = JSON.parse(
      execFileSync('tar', ['-xOf', tarballPath, 'package/package.json'], {
        encoding: 'utf8',
      }),
    )
    assertRegistryResolvable(packedManifest, `${sourceManifest.name} packed manifest`)
    checked += 1
  }

  assert.ok(checked > 0, 'expected at least one public package manifest')
})
