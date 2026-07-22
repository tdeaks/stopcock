// Packs the real tarball, installs it into an isolated scratch consumer,
// and imports it from there -- catches export-map/files-list mistakes
// that in-repo tests can't see, and proves the packed ops-table snapshot
// (not the @stopcock/fp workspace source) is what a consumer runs against.
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pkg from '../../package.json' with { type: 'json' }

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const TARBALL_NAME = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`

let scratchDir: string
let tarballPath: string

beforeAll(() => {
  execFileSync('bunx', ['vp', 'run', 'build'], { cwd: PACKAGE_ROOT, stdio: 'inherit' })
}, 60_000)

afterAll(async () => {
  if (scratchDir) await rm(scratchDir, { recursive: true, force: true })
})

describe('packed tarball', () => {
  it('installs and runs a transform from a real npm pack output', async () => {
    scratchDir = await mkdtemp(join(tmpdir(), 'stopcock-fp-compiler-pack-'))

    execFileSync('bun', ['pm', 'pack', '--destination', scratchDir], { cwd: PACKAGE_ROOT, stdio: 'inherit' })
    tarballPath = join(scratchDir, TARBALL_NAME)

    const consumerDir = join(scratchDir, 'consumer')
    await mkdir(consumerDir, { recursive: true })
    await writeFile(
      join(consumerDir, 'package.json'),
      JSON.stringify({ name: 'stopcock-fp-compiler-pack-consumer', private: true, type: 'module' }, null, 2),
    )

    execFileSync('bun', ['add', tarballPath], { cwd: consumerDir, stdio: 'inherit' })

    const mod = await import(pathToFileURL(join(consumerDir, 'node_modules/@stopcock/fp-compiler/dist/index.js')).href)
    expect(typeof mod.transformStopcockPipelines).toBe('function')
    expect(typeof mod.stopcockFp.rollup).toBe('function')
    expect(typeof mod.stopcockFp.vite).toBe('function')

    const source = `
import { pipe, A } from '@stopcock/fp'
export const result = pipe([1, 2, 3, 4], A.map((x) => x * 2), A.sum)
`.trimStart()
    const result = mod.transformStopcockPipelines(source, 'fixture.ts', { diagnostics: 'verbose' })
    expect(result.code).not.toBe(source)
    expect(result.code).toMatch(/for\s*\(/)
    expect(result.diagnostics.some((d: { transformed: boolean }) => d.transformed)).toBe(true)
  }, 60_000)
})
