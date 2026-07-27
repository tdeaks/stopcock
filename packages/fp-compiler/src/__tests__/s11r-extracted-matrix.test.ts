import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = new URL('../../scripts/s11r-extracted-matrix.mjs', import.meta.url)
const layoutScript = new URL('../../scripts/s11r-extracted-layouts.mjs', import.meta.url)
const sha = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

describe('S11R extracted matrix manifest boundary', () => {
  it('rejects a manifest whose claimed content identity is forgeable', async () => {
    const { validateManifest } = await import(script.href)
    const scratch = await mkdtemp(join(tmpdir(), 'stopcock-s11r-manifest-'))
    try {
      const directory = join(scratch, '0'.repeat(64))
      await import('node:fs/promises').then(({ mkdir }) => mkdir(directory))
      const manifest = {
        schemaVersion: 1,
        kind: 'stopcock-v2-cohort',
        mode: 'dev',
        target: '2.0.0-next.0',
        cohortContentHash: `sha256:${'0'.repeat(64)}`,
        publicCount: 0,
        privateCompatibility: { name: '@stopcock/synth', publication: 'excluded' },
        buildInputs: [],
        buildOrder: [],
        dependencyGraph: [],
        packages: [],
      }
      const path = join(directory, 'cohort-manifest.json')
      await writeFile(path, JSON.stringify(manifest))
      await expect(validateManifest(path)).rejects.toThrow(/content hash/u)
      expect(sha(await readFile(path, 'utf8'))).toMatch(/^sha256:/u)
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  })

  it('rejects a self-consistent pre-extraction cohort before reading any tarball', async () => {
    const { validateManifest } = await import(script.href)
    const { validateLayoutManifest } = await import(layoutScript.href)
    const scratch = await mkdtemp(join(tmpdir(), 'stopcock-s11r-old-cohort-'))
    try {
      const projection = {
        schemaVersion: 1,
        kind: 'stopcock-v2-cohort',
        target: '2.0.0-next.0',
        publicCount: 20,
        privateCompatibility: { name: '@stopcock/synth', publication: 'excluded' },
        buildInputs: [],
        buildOrder: [],
        dependencyGraph: [],
        packages: [],
      }
      const cohortContentHash = sha(stable(projection))
      const directory = join(scratch, cohortContentHash.slice('sha256:'.length))
      await import('node:fs/promises').then(({ mkdir }) => mkdir(directory))
      const path = join(directory, 'cohort-manifest.json')
      await writeFile(
        path,
        stable({
          ...projection,
          mode: 'dev',
          cohortContentHash,
        }),
      )
      await expect(validateManifest(path)).rejects.toThrow(/complete 21-package/u)
      await expect(validateLayoutManifest(path)).rejects.toThrow(/complete 21-package/u)
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  })

  it('rejects execution-engine logic hidden in an allowed construction leaf', async () => {
    const { validateConstructionLeafSource } = await import(script.href)
    expect(() =>
      validateConstructionLeafSource(
        `import { runner } from './compact-runtime.js'\nexport const map = runner\n`,
        'forged array leaf',
      ),
    ).toThrow(/execution-engine logic|execution-engine module/u)
    expect(
      validateConstructionLeafSource(
        `import { dual } from './dual.js'\nexport const map = dual(2, (values, callback) => values.map(callback))\n`,
      ).sha256,
    ).toMatch(/^sha256:[a-f0-9]{64}$/u)
  })

  it('binds deterministic exact canonical and adversarial harness corpora', async () => {
    const { corpusIdentitiesForTest } = await import(script.href)
    const first = corpusIdentitiesForTest()
    const replay = corpusIdentitiesForTest()
    expect(replay).toEqual(first)
    expect(first.canonical.ids).toEqual([
      'compiler.collect.common',
      'compiler.reduce.common',
      'compiler.deep',
      'compiler.option-terminal',
      'helpers.two-unrelated',
    ])
    expect(first.canonical.count).toBe(5)
    expect(first.harness.ids).toContain('observable-construction')
    expect(first.harness.ids).toContain('import-pruning')
    expect(first.harness.count).toBe(8)
    expect(first.canonical.sha256).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(first.harness.sha256).toMatch(/^sha256:[a-f0-9]{64}$/u)
  })
})
