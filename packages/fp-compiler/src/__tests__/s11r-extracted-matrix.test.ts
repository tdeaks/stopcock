import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

  it('resolves a locked dependency whose exports hide package.json', async () => {
    const { resolveLockedDependencyManifest } = await import(script.href)
    const compilerRequire = createRequire(new URL('../../package.json', import.meta.url))
    const traverseRequire = createRequire(compilerRequire.resolve('@babel/traverse/package.json'))
    const babelRequire = createRequire(
      resolveLockedDependencyManifest('@babel/code-frame', traverseRequire),
    )
    expect(() => babelRequire.resolve('js-tokens/package.json')).toThrow()
    expect(() => resolveLockedDependencyManifest('../js-tokens', babelRequire)).toThrow(
      /invalid package name/u,
    )
    const manifestPath = resolveLockedDependencyManifest('js-tokens', babelRequire)
    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toMatchObject({
      name: 'js-tokens',
      version: expect.any(String),
    })
  })

  it('does not skip an invalid first package selected by ordered lookup paths', async () => {
    const { resolveLockedDependencyManifest } = await import(script.href)
    const scratch = await mkdtemp(join(tmpdir(), 'stopcock-s11r-dependency-resolution-'))
    try {
      const first = join(scratch, 'first')
      const second = join(scratch, 'second')
      await mkdir(join(first, 'js-tokens'), { recursive: true })
      await mkdir(join(second, 'js-tokens'), { recursive: true })
      await writeFile(
        join(first, 'js-tokens', 'package.json'),
        JSON.stringify({ name: 'wrong-package', version: '1.0.0' }),
      )
      await writeFile(
        join(second, 'js-tokens', 'package.json'),
        JSON.stringify({ name: 'js-tokens', version: '10.0.0' }),
      )
      const missing = Object.assign(
        () => {
          throw Object.assign(new Error('not exported'), {
            code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
          })
        },
        { paths: () => [first, second] },
      )
      let integrityError: unknown
      try {
        resolveLockedDependencyManifest('js-tokens', { resolve: missing })
      } catch (error) {
        integrityError = error
      }
      expect(integrityError).toBeInstanceOf(Error)
      expect((integrityError as Error).message).toMatch(/unexpected name wrong-package/u)
      expect(integrityError).not.toMatchObject({
        code: 'STOPCOCK_MISSING_LOCKED_DEPENDENCY',
      })

      const absent = Object.assign(
        () => {
          throw Object.assign(new Error('missing'), { code: 'MODULE_NOT_FOUND' })
        },
        { paths: () => [] },
      )
      expect(() =>
        resolveLockedDependencyManifest('missing-optional-helper', { resolve: absent }),
      ).toThrow(
        expect.objectContaining({
          code: 'STOPCOCK_MISSING_LOCKED_DEPENDENCY',
          dependencyName: 'missing-optional-helper',
        }),
      )
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  })
})
