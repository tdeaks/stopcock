import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const script = new URL('../../scripts/s11r-extracted-matrix.mjs', import.meta.url)
const layoutScript = new URL('../../scripts/s11r-extracted-layouts.mjs', import.meta.url)
const sha = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

describe('S11R extracted matrix manifest boundary', () => {
  it('uses the canonical ESM size denominator for Webpack-family qualification', async () => {
    const { webpackQualificationOutput } = await import(script.href)
    expect(webpackQualificationOutput('/qualification/out')).toEqual({
      experiments: { outputModule: true },
      output: {
        path: '/qualification/out',
        filename: 'out.mjs',
        module: true,
        library: { type: 'module' },
        environment: {
          arrowFunction: true,
          const: true,
          destructuring: true,
          dynamicImport: true,
          module: true,
        },
      },
    })
  })

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

  it('canonicalizes a physical extracted module across a symlinked temp-root alias', async () => {
    const { canonicalGraph } = await import(script.href)
    const scratch = await mkdtemp(join(tmpdir(), 'stopcock-s11r-module-identity-'))
    try {
      const consumer = join(scratch, 'consumer')
      const fp = join(scratch, 'extracted', 'fp')
      const module = join(fp, 'dist', 'number-generated.js')
      await mkdir(consumer, { recursive: true })
      await mkdir(join(fp, 'dist'), { recursive: true })
      await writeFile(module, 'export {}\n')
      expect(
        canonicalGraph(
          {
            consumer,
            packages: new Map([['@stopcock/fp', fp]]),
          },
          [await realpath(module)],
        ),
      ).toEqual(['@stopcock/fp/dist/number-generated.js'])
      const foreign = join(scratch, 'foreign', 'stopcock-runtime.js')
      await mkdir(join(scratch, 'foreign'), { recursive: true })
      await writeFile(foreign, 'export {}\n')
      expect(() =>
        canonicalGraph(
          {
            consumer,
            packages: new Map([['@stopcock/fp', fp]]),
          },
          [foreign],
        ),
      ).toThrow(/unknown Stopcock module identity/u)
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  })

  it('matches strict host failures by exact physical source identity and diagnostic fields', async () => {
    const { assertStrictDiagnostic } = await import(script.href)
    const scratch = await mkdtemp(join(tmpdir(), 'stopcock-s11r-strict-diagnostic-'))
    try {
      const consumer = join(scratch, 'consumer')
      const alias = join(scratch, 'consumer-alias')
      const entry = join(consumer, 'src', 'entry.mjs')
      const foreign = join(scratch, 'foreign', 'entry.mjs')
      await mkdir(dirname(entry), { recursive: true })
      await mkdir(dirname(foreign), { recursive: true })
      await writeFile(entry, 'export const result = 1\n')
      await writeFile(foreign, 'export const result = 2\n')
      await symlink(consumer, alias, 'dir')
      const aliasEntry = join(alias, 'src', 'entry.mjs')
      const physicalEntry = await realpath(entry)
      const topology = { consumer: alias, packages: new Map() }
      const diagnostic = (
        source: string,
        site = 'pipe',
        line = 11,
        reason = 'spread arguments in pipe() call',
      ) => `Build failed\nError: fp-compiler: skipped ${site}() at ${source}:${line}: ${reason}`
      const expected = {
        site: 'pipe',
        source: 'consumer/src/entry.mjs',
        line: 11,
        reason: 'spread arguments in pipe() call',
      }

      expect(
        assertStrictDiagnostic({
          message: diagnostic(aliasEntry),
          topology,
          entry: aliasEntry,
          site: 'pipe',
          line: 11,
          reason: 'spread arguments in pipe() call',
        }),
      ).toEqual(expected)
      expect(
        assertStrictDiagnostic({
          message: diagnostic(physicalEntry),
          topology,
          entry: aliasEntry,
          site: 'pipe',
          line: 11,
          reason: 'spread arguments in pipe() call',
        }),
      ).toEqual(expected)

      const assertRejected = (message: string): void => {
        expect(() =>
          assertStrictDiagnostic({
            message,
            topology,
            entry: aliasEntry,
            site: 'pipe',
            line: 11,
            reason: 'spread arguments in pipe() call',
          }),
        ).toThrow()
      }
      assertRejected(diagnostic(foreign))
      assertRejected(diagnostic(physicalEntry, 'compile'))
      assertRejected(diagnostic(physicalEntry, 'pipe', 12))
      assertRejected(diagnostic(physicalEntry, 'pipe', 11, 'different reason'))
      assertRejected(
        diagnostic(physicalEntry)
          .split('\n')[1]
          .replace('Error: fp-compiler', 'fakefp-compiler'),
      )
      assertRejected(`${diagnostic(physicalEntry)}\n${diagnostic(physicalEntry).split('\n')[1]}`)
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  })

  it('decodes file URLs before rejecting a symlink-aliased workspace module', async () => {
    const { canonicalGraph } = await import(script.href)
    const scratch = await mkdtemp(join(tmpdir(), 'graph-uri-'))
    try {
      const consumer = join(scratch, 'consumer')
      const fp = join(scratch, 'fp')
      await mkdir(consumer)
      await mkdir(fp)
      const workspaceManifest = fileURLToPath(new URL('../../../../package.json', import.meta.url))
      const alias = join(scratch, 'workspace-package.json')
      await symlink(workspaceManifest, alias)
      expect(() =>
        canonicalGraph(
          {
            consumer,
            packages: new Map([['@stopcock/fp', fp]]),
          },
          [pathToFileURL(alias).href],
        ),
      ).toThrow(/points into repository/u)
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  })

  it('canonicalizes emitted source-map paths without changing mappings or source content', async () => {
    const { sanitizeSourceMap } = await import(script.href)
    const scratch = await mkdtemp(join(tmpdir(), 'stopcock-s11r-extracted-source-map-'))
    try {
      const repositoryRoot = dirname(dirname(dirname(dirname(fileURLToPath(script)))))
      const consumer = join(scratch, 'consumer')
      const fp = join(scratch, 'extracted', 'fp')
      const entry = join(consumer, 'src', 'entry.mjs')
      const construction = join(fp, 'dist', 'array-generated.js')
      const output = join(scratch, 'qualification', 'vite', 'out.mjs')
      await mkdir(dirname(entry), { recursive: true })
      await mkdir(dirname(construction), { recursive: true })
      await mkdir(dirname(output), { recursive: true })
      await writeFile(entry, 'export const result = 1\n')
      await writeFile(construction, 'export const map = () => undefined\n')
      const mappings = 'AAAA'
      const names = ['result', 'map']
      const sourcesContent = [
        await readFile(construction, 'utf8'),
        await readFile(entry, 'utf8'),
        await readFile(construction, 'utf8'),
        await readFile(entry, 'utf8'),
        '// webpack bootstrap\n',
      ]
      const sanitized = JSON.parse(
        sanitizeSourceMap(
          JSON.stringify({
            version: 3,
            file: join(scratch, 'raw-out.mjs'),
            sources: [
              relative(dirname(output), construction),
              relative(repositoryRoot, entry),
              `webpack:///${relative(repositoryRoot, construction).replaceAll('\\', '/')}`,
              'webpack://consumer/./src/entry.mjs',
              'webpack://consumer/webpack/bootstrap',
            ],
            sourcesContent,
            mappings,
            names,
          }),
          {
            consumer,
            packages: new Map([['@stopcock/fp', fp]]),
          },
          output,
          'fixture source map',
        ),
      )

      expect(sanitized).toMatchObject({
        file: 'out.mjs',
        sources: [
          '@stopcock/fp/dist/array-generated.js',
          'consumer/src/entry.mjs',
          '@stopcock/fp/dist/array-generated.js',
          'consumer/src/entry.mjs',
          'virtual/webpack/bootstrap',
        ],
        sourceRoot: 'stopcock:///',
        sourcesContent,
        mappings,
        names,
      })
      expect(JSON.stringify(sanitized)).not.toContain(scratch)

      const foreign = join(scratch, 'foreign', 'stopcock-engine.js')
      await mkdir(dirname(foreign), { recursive: true })
      await writeFile(foreign, 'export const engine = true\n')
      expect(() =>
        sanitizeSourceMap(
          JSON.stringify({
            version: 3,
            sources: [relative(dirname(output), foreign)],
            sourcesContent: ['export const engine = true\n'],
            mappings,
          }),
          {
            consumer,
            packages: new Map([['@stopcock/fp', fp]]),
          },
          output,
          'foreign source map',
        ),
      ).toThrow(/unknown Stopcock module identity/u)

      const spoofEntry = join(
        scratch,
        'foreign',
        basename(scratch),
        'consumer',
        'src',
        'entry.mjs',
      )
      await mkdir(dirname(spoofEntry), { recursive: true })
      await writeFile(spoofEntry, 'export const result = "foreign"\n')
      expect(() =>
        sanitizeSourceMap(
          JSON.stringify({
            version: 3,
            sources: [relative(repositoryRoot, spoofEntry)],
            sourcesContent: ['export const result = "foreign"\n'],
            mappings,
          }),
          {
            consumer,
            packages: new Map([['@stopcock/fp', fp]]),
          },
          output,
          'spoofed scratch source map',
        ),
      ).toThrow(/does not resolve to the selected physical source/u)

      expect(() =>
        sanitizeSourceMap(
          JSON.stringify({
            version: 3,
            sources: ['webpack://consumer/webpack/runtime/../../@stopcock/fp/dist/index.js'],
            sourcesContent: ['hidden stopcock source'],
            mappings,
          }),
          {
            consumer,
            packages: new Map([['@stopcock/fp', fp]]),
          },
          output,
          'traversing virtual source map',
        ),
      ).toThrow(/unsafe virtual source/u)

      expect(() =>
        sanitizeSourceMap(
          JSON.stringify({
            version: 3,
            sources: [relative(dirname(output), dirname(construction))],
            sourcesContent: ['directory'],
            mappings,
          }),
          {
            consumer,
            packages: new Map([['@stopcock/fp', fp]]),
          },
          output,
          'directory source map',
        ),
      ).toThrow(/not a regular file/u)
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  })

  it('attributes Rollup and esbuild graphs only to emitted byte contributors', async () => {
    const { emittedEsbuildModuleIds, emittedRollupModuleIds } = await import(script.href)
    expect(
      emittedRollupModuleIds({
        'entry.js': {
          type: 'chunk',
          modules: {
            '/consumer/entry.js': { renderedLength: 41 },
            '/selected/fp/dist/index.js': { renderedLength: 0 },
          },
        },
        'entry.js.map': { type: 'asset' },
      }),
    ).toEqual(['/consumer/entry.js'])

    const scratch = await mkdtemp(join(tmpdir(), 'stopcock-s11r-esbuild-graph-'))
    try {
      const output = join(scratch, 'out.mjs')
      await writeFile(output, 'export const result = 1\n')
      expect(
        emittedEsbuildModuleIds(
          {
            outputs: {
              [output]: {
                inputs: {
                  '/consumer/entry.js': { bytesInOutput: 24 },
                  '/selected/fp/dist/index.js': { bytesInOutput: 0 },
                },
              },
            },
          },
          output,
        ),
      ).toEqual(['/consumer/entry.js'])
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  })

  it('flattens only final Webpack-family chunk contributors', async () => {
    const { emittedWebpackModuleIds } = await import(script.href)
    const entry = { resource: '/consumer/entry.js' }
    const construction = { resource: '/selected/fp/dist/array-generated.js' }
    const aggregate = { modules: new Set([entry, construction]) }
    const compilation = {
      chunks: new Set([{}]),
      chunkGraph: {
        getChunkModulesIterableBySourceType: () => new Set([aggregate]),
      },
    }

    expect(emittedWebpackModuleIds(compilation)).toEqual([
      '/consumer/entry.js',
      '/selected/fp/dist/array-generated.js',
    ])
  })

  it('binds mixed tiers to execution engines instead of zero-logic facades', async () => {
    const { assertMixedTierGraph, mixedTierGraphContractsForTest } = await import(script.href)
    expect(mixedTierGraphContractsForTest()).toEqual([
      {
        id: 'sequential-root',
        requiredExecution: ['@stopcock/fp/dist/index.js'],
        forbiddenExecution: [
          '@stopcock/fp/dist/compact-runtime-*.js',
          '@stopcock/fp/dist/compile.js',
          '@stopcock/fp-optimizer/dist/*.js',
        ],
        optionalFacades: ['@stopcock/fp/dist/fusion.js'],
        expectedTrace: ['map:1', 'map:2', 'map:3', 'some:2', 'some:3'],
        strictDiagnostic: {
          site: 'pipe',
          line: 11,
          reason: 'spread arguments in pipe() call',
        },
      },
      {
        id: 'compact-fusion',
        requiredExecution: ['@stopcock/fp/dist/compact-runtime-*.js'],
        forbiddenExecution: [
          '@stopcock/fp/dist/index.js',
          '@stopcock/fp/dist/compile.js',
          '@stopcock/fp-optimizer/dist/*.js',
        ],
        optionalFacades: ['@stopcock/fp/dist/fusion.js'],
        expectedTrace: ['map:1', 'some:2', 'map:2', 'some:3'],
        strictDiagnostic: {
          site: 'pipe',
          line: 11,
          reason: 'spread arguments in pipe() call',
        },
      },
      {
        id: 'compact-compile',
        requiredExecution: ['@stopcock/fp/dist/compact-runtime-*.js'],
        forbiddenExecution: [
          '@stopcock/fp/dist/index.js',
          '@stopcock/fp-optimizer/dist/*.js',
        ],
        optionalFacades: ['@stopcock/fp/dist/compile.js'],
        expectedTrace: ['map:1', 'some:2', 'map:2', 'some:3'],
        strictDiagnostic: {
          site: 'compile',
          line: 11,
          reason: 'spread arguments in flow()/compile() call',
        },
      },
      {
        id: 'optimized',
        requiredExecution: ['@stopcock/fp-optimizer/dist/index.js'],
        forbiddenExecution: ['@stopcock/fp/dist/index.js'],
        optionalFacades: [],
        expectedTrace: ['map:1', 'some:2', 'map:2', 'some:3'],
        strictDiagnostic: {
          site: 'pipe',
          line: 11,
          reason: 'spread arguments in pipe() call',
        },
      },
    ])

    expect(
      assertMixedTierGraph({
        host: 'vite',
        tier: 'compact-fusion',
        moduleGraph: ['@stopcock/fp/dist/compact-runtime-content-hash.js'],
      }),
    ).toEqual({
      evidence: 'emitted-bytes',
      requiredExecution: [
        {
          pattern: '@stopcock/fp/dist/compact-runtime-*.js',
          modules: ['@stopcock/fp/dist/compact-runtime-content-hash.js'],
        },
      ],
      optionalFacades: [],
      negativeExclusions: { enforced: true, observedIncompatible: [] },
    })
    expect(() =>
      assertMixedTierGraph({
        host: 'vite',
        tier: 'compact-fusion',
        moduleGraph: ['@stopcock/fp/dist/fusion.js'],
      }),
    ).toThrow(/pruned required execution engine/u)
    expect(() =>
      assertMixedTierGraph({
        host: 'esbuild',
        tier: 'compact-fusion',
        moduleGraph: [
          '@stopcock/fp/dist/compact-runtime-content-hash.js',
          '@stopcock/fp/dist/index.js',
        ],
      }),
    ).toThrow(/retained incompatible execution modules/u)

    expect(
      assertMixedTierGraph({
        host: 'webpack',
        tier: 'compact-fusion',
        moduleGraph: [
          '@stopcock/fp/dist/compact-runtime-content-hash.js',
          '@stopcock/fp/dist/fusion.js',
          '@stopcock/fp/dist/index.js',
        ],
      }),
    ).toMatchObject({
      evidence: 'final-chunk-reachability',
      optionalFacades: ['@stopcock/fp/dist/fusion.js'],
      negativeExclusions: {
        enforced: false,
        observedIncompatible: ['@stopcock/fp/dist/index.js'],
      },
    })
  })
})
