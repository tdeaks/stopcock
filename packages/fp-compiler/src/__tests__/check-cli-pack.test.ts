// Proves the `stopcock` bin works from a real tarball in a clean consumer:
// no workspace resolution, no build step, no fusion runtime on disk.
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pkg from '../../package.json' with { type: 'json' }

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const TARBALL = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`

let scratchDir: string
let consumerDir: string
let installedRoot: string
let bin: string

const check = (args: readonly string[]): { stdout: string; stderr: string; status: number } => {
  const result = spawnSync(bin, [...args], { cwd: consumerDir, encoding: 'utf8' })
  if (result.error) throw result.error
  return { stdout: result.stdout, stderr: result.stderr, status: result.status ?? -1 }
}

beforeAll(async () => {
  execFileSync('bunx', ['vp', 'run', 'build'], { cwd: PACKAGE_ROOT, stdio: 'inherit' })
  scratchDir = await mkdtemp(join(tmpdir(), 'stopcock-check-pack-'))
  execFileSync('bun', ['pm', 'pack', '--destination', scratchDir], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
  })

  consumerDir = join(scratchDir, 'consumer')
  installedRoot = join(consumerDir, 'node_modules/@stopcock/fp-compiler')
  await mkdir(installedRoot, { recursive: true })
  execFileSync(
    'tar',
    ['-xzf', join(scratchDir, TARBALL), '-C', installedRoot, '--strip-components=1'],
    { stdio: 'inherit' },
  )

  // Stand in for the bin shim an installer would create, so the shebang and
  // the executable bit are exercised rather than assumed.
  const binDir = join(consumerDir, 'node_modules/.bin')
  await mkdir(binDir, { recursive: true })
  bin = join(binDir, 'stopcock')
  await symlink(join(installedRoot, 'dist/cli.js'), bin)
  chmodSync(join(installedRoot, 'dist/cli.js'), 0o755)

  // `check` runs the real transform, which needs its declared dependencies
  // (@babel/*, magic-string) resolvable. A real install would pull these in
  // transitively; stand in with the workspace's already-installed copies
  // instead of hitting the network.
  for (const dependency of ['@babel', 'magic-string']) {
    await symlink(
      join(PACKAGE_ROOT, 'node_modules', dependency),
      join(consumerDir, 'node_modules', dependency),
    )
  }

  const src = join(consumerDir, 'src')
  await mkdir(src, { recursive: true })
  await writeFile(
    join(src, 'good.ts'),
    `import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
export const result = pipe([1, 2, 3], map((x) => x + 1))
`,
  )
  await writeFile(
    join(src, 'bad.ts'),
    `import { pipe } from '@stopcock/fp'
const steps = [(x) => x]
export const result = pipe([1, 2, 3], ...steps)
`,
  )
}, 120_000)

afterAll(async () => {
  if (scratchDir) await rm(scratchDir, { recursive: true, force: true })
})

describe('packed stopcock check', () => {
  it('declares the bin and ships an executable entry with a shebang', async () => {
    const manifest = JSON.parse(await readFile(join(installedRoot, 'package.json'), 'utf8')) as {
      bin?: Record<string, string>
    }
    expect(manifest.bin).toEqual({ stopcock: './dist/cli.js' })
    const cli = await readFile(join(installedRoot, 'dist/cli.js'), 'utf8')
    expect(cli.startsWith('#!/usr/bin/env node\n')).toBe(true)
  })

  it('runs the check without importing the @stopcock/fp engine or a fusion runtime', async () => {
    const compilerPrefix = `${resolve(installedRoot)}${sep}`
    // The transform's own declared dependencies; nothing else bare is allowed.
    const allowedExternal = /^(?:@babel\/(?:parser|traverse|types)|magic-string)$/u
    const visited = new Set<string>()
    const visit = async (file: string): Promise<void> => {
      const physical = resolve(file)
      expect(physical.startsWith(compilerPrefix)).toBe(true)
      if (visited.has(physical)) return
      visited.add(physical)
      const source = await readFile(physical, 'utf8')
      const staticSpecifiers = [
        ...source.matchAll(
          /^\s*(?:import(?:\s+[^'"\n]*?\s+from)?|export\s+[^'"\n]*?\s+from)\s*['"]([^'"]+)['"]/gmu,
        ),
      ].map(([, specifier]) => specifier)
      const dynamicSpecifiers = [
        ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu),
      ].map(([, specifier]) => specifier)
      for (const specifier of [...staticSpecifiers, ...dynamicSpecifiers]) {
        if (specifier.startsWith('node:')) continue
        if (specifier.startsWith('.')) {
          await visit(resolve(dirname(physical), specifier))
          continue
        }
        expect(specifier).toMatch(allowedExternal)
      }
    }

    await visit(join(installedRoot, 'dist/cli.js'))
    expect(visited.size).toBeGreaterThan(1)
  })

  it('reports compiled and bailed sites with a summary line', () => {
    const result = check(['check'])
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/good\.ts:\d+:\d+\s+compiled/u)
    expect(result.stdout).toMatch(/bad\.ts:\d+:\d+\s+bailed/u)
    expect(result.stdout).toContain('1 sites compiled, 1 bailed')
  })

  it('exits 1 with --strict when a site bailed, 2 on an unknown subcommand', () => {
    expect(check(['check', '--strict']).status).toBe(1)
    expect(check(['nonsense']).status).toBe(2)
  })
})
