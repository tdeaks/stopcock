// Proves the `stopcock` bin works from a real tarball in a clean consumer:
// no workspace resolution, no build step, no fusion runtime on disk.
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pkg from '../../package.json' with { type: 'json' }

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const FIXTURES = fileURLToPath(new URL('./fixtures/check', import.meta.url))
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

  await cp(FIXTURES, join(consumerDir, 'artifacts'), { recursive: true })
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

  it('renders reports without importing a fusion runtime', async () => {
    const cli = await readFile(join(installedRoot, 'dist/cli.js'), 'utf8')
    const specifiers = [...cli.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/gu)].map(
      ([, specifier]) => specifier,
    )
    expect(specifiers.every((specifier) => specifier.startsWith('node:'))).toBe(true)
    expect(cli).not.toMatch(/@stopcock\/fp(?!-compiler)/u)
    expect(cli).not.toMatch(/@babel/u)
  })

  it('exits 0 when every requested policy passes', () => {
    const result = check([
      'check',
      '--receipts',
      'artifacts/receipts/transformed.json',
      '--evidence',
      'artifacts/evidence',
      '--expectations',
      'artifacts/expectations/fresh.json',
      '--policy',
      'unsupported',
      '--policy',
      'stale-evidence',
      '--json',
    ])
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('stopcock check')
    const report = JSON.parse(result.stdout) as { status: string }
    expect(report.status).toBe('passed')
  })

  it('emits byte-identical JSON across runs', () => {
    const args = [
      'check',
      '--receipts',
      'artifacts/receipts',
      '--evidence',
      'artifacts/evidence',
      '--expectations',
      'artifacts/expectations/fresh.json',
      '--policy',
      'unsupported',
      '--json',
    ]
    const first = check(args)
    const second = check(args)
    expect(first.status).toBe(1)
    expect(second.stdout).toBe(first.stdout)
  })

  it('exits 1 on a failed policy and 2 on invalid artifacts', () => {
    const failed = check(['check', '--receipts', 'artifacts/receipts', '--policy', 'unsupported'])
    expect(failed.status).toBe(1)
    expect(failed.stdout).toContain('static decision')

    const invalid = check([
      'check',
      '--receipts',
      'artifacts/invalid/duplicate-site-id.json',
      '--policy',
      'unsupported',
    ])
    expect(invalid.status).toBe(2)
    expect(invalid.stdout).toBe('')
    expect(invalid.stderr).toContain('duplicate')

    expect(check(['check', '--receipts', 'artifacts/receipts']).status).toBe(2)
  })
})
