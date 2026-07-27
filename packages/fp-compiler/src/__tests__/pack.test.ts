// Packs the real tarball, installs it into an isolated scratch consumer,
// and imports it from there -- catches export-map/files-list mistakes
// that in-repo tests can't see, and proves the packed ops-table snapshot
// (not the @stopcock/fp workspace source) is what a consumer runs against.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  access,
  cp,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pkg from '../../package.json' with { type: 'json' }

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const FP_ROOT = fileURLToPath(new URL('../../../fp', import.meta.url))
const TSC = fileURLToPath(
  new URL('../../../../node_modules/typescript/lib/tsc.js', import.meta.url),
)
const TARBALL_NAME = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`

let scratchDir: string
let tarballPath: string
let consumerDir: string
let installedCompilerArtifact: string
let compilerTarballHash: string

beforeAll(async () => {
  execFileSync('bunx', ['vp', 'run', 'build'], { cwd: PACKAGE_ROOT, stdio: 'inherit' })
  scratchDir = await mkdtemp(join(tmpdir(), 'stopcock-fp-compiler-pack-'))

  execFileSync('bun', ['pm', 'pack', '--destination', scratchDir], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
  })
  tarballPath = join(scratchDir, TARBALL_NAME)
  compilerTarballHash = createHash('sha256')
    .update(await readFile(tarballPath))
    .digest('hex')

  // Exercise the v2 peer contract even while a development checkout may be
  // between its source migration and final manifest bump.
  const fpFixtureDir = join(scratchDir, 'fp-v2')
  await mkdir(fpFixtureDir, { recursive: true })
  await cp(join(FP_ROOT, 'dist'), join(fpFixtureDir, 'dist'), {
    recursive: true,
  })
  const fpPackage = JSON.parse(
    await readFile(join(FP_ROOT, 'package.json'), 'utf8'),
  ) as Record<string, unknown>
  fpPackage.version = '2.0.0'
  await writeFile(
    join(fpFixtureDir, 'package.json'),
    JSON.stringify(fpPackage, null, 2),
  )

  consumerDir = join(scratchDir, 'consumer')
  await mkdir(consumerDir, { recursive: true })
  await writeFile(
    join(consumerDir, 'package.json'),
    JSON.stringify(
      {
        name: 'stopcock-fp-compiler-pack-consumer',
        private: true,
        type: 'module',
        dependencies: {
          '@stopcock/fp': `file:${fpFixtureDir}`,
          '@stopcock/fp-compiler': `file:${tarballPath}`,
        },
      },
      null,
      2,
    ),
  )

  // Install the exact tarball contents without asking a package registry.
  // Runtime dependencies are linked from this workspace so the consumer
  // remains isolated while the pack gate stays deterministic and offline.
  const nodeModules = join(consumerDir, 'node_modules')
  const stopcockModules = join(nodeModules, '@stopcock')
  const installedCompiler = join(stopcockModules, 'fp-compiler')
  installedCompilerArtifact = join(
    scratchDir,
    'artifacts',
    `sha256-${compilerTarballHash}`,
  )
  await mkdir(installedCompilerArtifact, { recursive: true })
  execFileSync(
    'tar',
    [
      '-xzf',
      tarballPath,
      '-C',
      installedCompilerArtifact,
      '--strip-components=1',
    ],
    { stdio: 'inherit' },
  )
  await mkdir(stopcockModules, { recursive: true })
  await symlink(installedCompilerArtifact, installedCompiler, 'dir')
  await symlink(fpFixtureDir, join(stopcockModules, 'fp'), 'dir')

  const babelModules = join(nodeModules, '@babel')
  await mkdir(babelModules, { recursive: true })
  for (const name of ['parser', 'traverse', 'types']) {
    await symlink(
      join(PACKAGE_ROOT, 'node_modules/@babel', name),
      join(babelModules, name),
      'dir',
    )
  }
  for (const name of ['magic-string', 'unplugin']) {
    await symlink(
      join(PACKAGE_ROOT, 'node_modules', name),
      join(nodeModules, name),
      'dir',
    )
  }
  // Node resolves an ESM package through the real content-addressed extraction
  // path, not through the consumer-facing symlink. Model an installed package
  // by placing its runtime dependency links beside that immutable extraction.
  const artifactNodeModules = join(installedCompilerArtifact, 'node_modules')
  const artifactBabelModules = join(artifactNodeModules, '@babel')
  await mkdir(artifactBabelModules, { recursive: true })
  for (const name of ['parser', 'traverse', 'types']) {
    await symlink(
      join(PACKAGE_ROOT, 'node_modules/@babel', name),
      join(artifactBabelModules, name),
      'dir',
    )
  }
  for (const name of ['magic-string', 'unplugin']) {
    await symlink(
      join(PACKAGE_ROOT, 'node_modules', name),
      join(artifactNodeModules, name),
      'dir',
    )
  }
  for (const name of ['esbuild', 'rollup', 'vite', 'webpack']) {
    await symlink(
      join(PACKAGE_ROOT, 'node_modules', name),
      join(nodeModules, name),
      'dir',
    )
  }
  const rspackModules = join(nodeModules, '@rspack')
  await mkdir(rspackModules, { recursive: true })
  await symlink(
    join(PACKAGE_ROOT, 'node_modules/@rspack/core'),
    join(rspackModules, 'core'),
    'dir',
  )
}, 60_000)

afterAll(async () => {
  if (scratchDir) await rm(scratchDir, { recursive: true, force: true })
})

describe('packed tarball', () => {
  it('installs from its content-addressed tarball extraction', async () => {
    const installedRoot = join(
      consumerDir,
      'node_modules/@stopcock/fp-compiler',
    )
    expect(await realpath(installedRoot)).toBe(
      await realpath(installedCompilerArtifact),
    )
    expect(installedCompilerArtifact).toContain(
      `sha256-${compilerTarballHash}`,
    )
  })

  it('installs and runs a transform from a real npm pack output', async () => {
    const source = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
export const result = pipe([1, 2, 3, 4], A.map((x) => x * 2), A.sum)
`.trimStart()
    const runtimeProbe = join(consumerDir, 'runtime-probe.mjs')
    await writeFile(
      runtimeProbe,
      `
import assert from 'node:assert/strict'
import {
  callbackArity,
  stopcockFp,
  transformStopcockPipelines,
} from '@stopcock/fp-compiler'
import { stopcockFp as esbuildStopcockFp } from '@stopcock/fp-compiler/esbuild'
import { stopcockFp as rollupStopcockFp } from '@stopcock/fp-compiler/rollup'
import { stopcockFp as rspackStopcockFp } from '@stopcock/fp-compiler/rspack'
import { stopcockFp as viteStopcockFp } from '@stopcock/fp-compiler/vite'
import { stopcockFp as webpackStopcockFp } from '@stopcock/fp-compiler/webpack'

assert.equal(callbackArity('map'), 1)
assert.equal(callbackArity('not-an-op'), undefined)
assert.equal(typeof stopcockFp.rollup, 'function')
assert.equal(typeof stopcockFp.rspack, 'function')
assert.equal(typeof stopcockFp.vite, 'function')
assert.equal(typeof viteStopcockFp, 'function')
assert.equal(typeof rollupStopcockFp, 'function')
assert.equal(typeof esbuildStopcockFp, 'function')
assert.equal(typeof rspackStopcockFp, 'function')
assert.equal(typeof webpackStopcockFp, 'function')
const result = transformStopcockPipelines(
  ${JSON.stringify(source)},
  'fixture.ts',
  { diagnostics: 'verbose' },
)
assert.match(result.code, /for\\s*\\(/)
assert.ok(result.diagnostics.some((site) => site.transformed))
`.trimStart(),
    )
    execFileSync(process.execPath, [runtimeProbe], {
      cwd: consumerDir,
      stdio: 'inherit',
    })

    const mod = await import(pathToFileURL(join(consumerDir, 'node_modules/@stopcock/fp-compiler/dist/index.js')).href)
    const result = mod.transformStopcockPipelines(source, 'fixture.ts', { diagnostics: 'verbose' })
    expect(result.code).not.toBe(source)
    expect(result.code).toMatch(/for\s*\(/)
    expect(result.diagnostics.some((d: { transformed: boolean }) => d.transformed)).toBe(true)
  }, 60_000)

  it('builds and executes through all five adapters from the packed artifact', async () => {
    const probe = join(consumerDir, 'packed-hosts-probe.mjs')
    await writeFile(
      probe,
      `
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { stopcockFp as esbuildStopcockFp } from '@stopcock/fp-compiler/esbuild'
import { stopcockFp as rollupStopcockFp } from '@stopcock/fp-compiler/rollup'
import { stopcockFp as rspackStopcockFp } from '@stopcock/fp-compiler/rspack'
import { stopcockFp as viteStopcockFp } from '@stopcock/fp-compiler/vite'
import { stopcockFp as webpackStopcockFp } from '@stopcock/fp-compiler/webpack'

const require = createRequire(import.meta.url)
const fpEntry = join(process.cwd(), 'node_modules/@stopcock/fp/dist/index.js')
const fpArrayEntry = join(process.cwd(), 'node_modules/@stopcock/fp/dist/array.js')
const fixtureSource = \`
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
export const result = pipe(
  [1, 2, 3, 4, 5, 6],
  A.filterMap((value) => value % 2 === 0 ? value * 10 : undefined),
  A.take(2),
)
\`.trimStart()
const expected = [20, 40]
const roots = []

const makeFixture = async (host) => {
  const root = await mkdtemp(join(tmpdir(), \`stopcock-packed-\${host}-\`))
  roots.push(root)
  const entry = join(root, 'fixture.mjs')
  await writeFile(entry, fixtureSource)
  return { root, entry }
}

const alias = (id) => {
  if (id === '@stopcock/fp') return fpEntry
  if (id === '@stopcock/fp/array') return fpArrayEntry
  return null
}

const assertCompiled = (code, host) => {
  assert.match(code, /for\\s*\\(/, \`\${host} did not emit a compiled loop\`)
  assert.doesNotMatch(code, /[^.\\w]pipe\\(/, \`\${host} retained the source pipe call\`)
}

try {
  {
    const { root, entry } = await makeFixture('rollup')
    const { rollup } = await import('rollup')
    const bundle = await rollup({
      input: entry,
      plugins: [
        { name: 'alias-stopcock-fp', resolveId: alias },
        rollupStopcockFp({ diagnostics: 'error' }),
      ],
    })
    const { output } = await bundle.generate({ format: 'es' })
    await bundle.close()
    const chunks = output.filter((item) => item.type === 'chunk')
    assertCompiled(chunks.map((chunk) => chunk.code).join('\\n'), 'rollup')
    for (const chunk of chunks) {
      await writeFile(join(root, chunk.fileName), chunk.code)
    }
    const entryChunk = chunks.find((chunk) => chunk.isEntry) ?? chunks[0]
    const module = await import(pathToFileURL(join(root, entryChunk.fileName)).href)
    assert.deepEqual(module.result, expected)
  }

  {
    const { root, entry } = await makeFixture('esbuild')
    const outfile = join(root, 'out.mjs')
    const esbuild = await import('esbuild')
    await esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      plugins: [
        esbuildStopcockFp({ diagnostics: 'error' }),
        {
          name: 'alias-stopcock-fp',
          setup(builder) {
            builder.onResolve(
              { filter: /^@stopcock\\/fp(?:\\/array)?$/ },
              ({ path }) => ({ path: alias(path) }),
            )
          },
        },
      ],
    })
    const code = await readFile(outfile, 'utf8')
    assertCompiled(code, 'esbuild')
    const module = await import(pathToFileURL(outfile).href)
    assert.deepEqual(module.result, expected)
  }

  {
    const { root, entry } = await makeFixture('webpack')
    const { default: webpack } = await import('webpack')
    const filename = 'out.cjs'
    await new Promise((resolve, reject) => {
      const compiler = webpack({
        mode: 'production',
        entry,
        target: 'node',
        output: {
          path: root,
          filename,
          library: { type: 'commonjs2' },
        },
        resolve: {
          alias: {
            '@stopcock/fp$': fpEntry,
            '@stopcock/fp/array$': fpArrayEntry,
          },
        },
        plugins: [webpackStopcockFp({ diagnostics: 'error' })],
      })
      compiler.run((error, stats) => {
        compiler.close(() => {
          if (error) return reject(error)
          if (stats?.hasErrors()) {
            return reject(new Error(stats.toString({ errorDetails: true })))
          }
          resolve()
        })
      })
    })
    const outfile = join(root, filename)
    const code = await readFile(outfile, 'utf8')
    assertCompiled(code, 'webpack')
    delete require.cache[outfile]
    assert.deepEqual(require(outfile).result, expected)
  }

  {
    const { root, entry } = await makeFixture('rspack')
    const { rspack } = await import('@rspack/core')
    const filename = 'out.cjs'
    await new Promise((resolve, reject) => {
      const compiler = rspack({
        mode: 'production',
        entry,
        target: 'node',
        output: {
          path: root,
          filename,
          library: { type: 'commonjs2' },
        },
        resolve: {
          alias: {
            '@stopcock/fp$': fpEntry,
            '@stopcock/fp/array$': fpArrayEntry,
          },
        },
        plugins: [rspackStopcockFp({ diagnostics: 'error' })],
      })
      compiler.run((error, stats) => {
        compiler.close(() => {
          if (error) return reject(error)
          if (stats?.hasErrors()) {
            return reject(new Error(stats.toString({ errorDetails: true })))
          }
          resolve()
        })
      })
    })
    const outfile = join(root, filename)
    const code = await readFile(outfile, 'utf8')
    assertCompiled(code, 'rspack')
    delete require.cache[outfile]
    assert.deepEqual(require(outfile).result, expected)
  }

  {
    const { root, entry } = await makeFixture('vite')
    const { build } = await import('vite')
    await build({
      root,
      logLevel: 'silent',
      resolve: {
        alias: [
          { find: /^@stopcock\\/fp$/, replacement: fpEntry },
          { find: /^@stopcock\\/fp\\/array$/, replacement: fpArrayEntry },
        ],
      },
      plugins: [viteStopcockFp({ diagnostics: 'error' })],
      build: {
        outDir: join(root, 'dist'),
        lib: {
          entry,
          formats: ['es'],
          fileName: () => 'out.mjs',
        },
        minify: false,
        write: true,
      },
    })
    const outfile = join(root, 'dist/out.mjs')
    const code = await readFile(outfile, 'utf8')
    assertCompiled(code, 'vite')
    const module = await import(pathToFileURL(outfile).href)
    assert.deepEqual(module.result, expected)
  }

  console.log(JSON.stringify({
    artifact: ${JSON.stringify(`sha256-${compilerTarballHash}`)},
    hosts: ['rollup', 'esbuild', 'webpack', 'rspack', 'vite'],
  }))
} finally {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
}
`.trimStart(),
    )
    const output = execFileSync(process.execPath, [probe], {
      cwd: consumerDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    expect(JSON.parse(output.trim())).toEqual({
      artifact: `sha256-${compilerTarballHash}`,
      hosts: ['rollup', 'esbuild', 'webpack', 'rspack', 'vite'],
    })
  }, 120_000)

  it('ships a root declaration entry without test or source-root leakage', async () => {
    const installedRoot = join(
      consumerDir,
      'node_modules/@stopcock/fp-compiler',
    )
    const declaration = await readFile(join(installedRoot, 'dist/index.d.ts'), 'utf8')
    const runtime = await readFile(join(installedRoot, 'dist/index.js'), 'utf8')
    const receiptSchemaRuntime = join(installedRoot, 'dist/receipt-schema.generated.js')
    const distFiles = await readdir(join(installedRoot, 'dist'), {
      recursive: true,
    })
    const declarationFiles = distFiles.filter((file) => file.endsWith('.d.ts'))

    expect(declaration).toContain('transformStopcockPipelines')
    expect(declaration).toContain('callbackArity')
    for (const adapter of ['vite', 'rollup', 'esbuild', 'webpack', 'rspack']) {
      const adapterDeclaration = await readFile(
        join(installedRoot, `dist/${adapter}.d.ts`),
        'utf8',
      )
      expect(adapterDeclaration).toContain('stopcockFp')
    }
    expect(runtime).not.toMatch(
      /(?:from\s*|import\s*\()\s*['"]@stopcock\/fp(?:\/[^'"]*)?['"]/,
    )
    await access(receiptSchemaRuntime)
    const receiptSchema = await import(pathToFileURL(receiptSchemaRuntime).href)
    expect(typeof receiptSchema.validateReceiptV1).toBe('function')
    expect(receiptSchema.RECEIPT_SCHEMA_V1_HASH).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(distFiles).not.toContain('fp-compiler/src/index.d.ts')
    expect(distFiles.some((file) => file.includes('__tests__'))).toBe(false)
    await expect(
      access(join(installedRoot, 'dist/fp-compiler/src/index.d.ts')),
    ).rejects.toThrow()
    await access(join(installedRoot, 'README.md'))
    await access(join(installedRoot, 'LICENSE'))

    for (const file of declarationFiles) {
      const source = await readFile(join(installedRoot, 'dist', file), 'utf8')
      const relativeSpecifiers = source.matchAll(
        /(?:from\s+|import\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/gu,
      )
      for (const [, specifier] of relativeSpecifiers) {
        expect(
          specifier,
          `${file} must use a NodeNext-safe relative declaration specifier`,
        ).toMatch(/\.(?:c|m)?js$/u)
      }
    }
  })

  it('declares @stopcock/fp as a peer and typechecks from isolated Bundler and NodeNext consumers', async () => {
    const installedRoot = join(
      consumerDir,
      'node_modules/@stopcock/fp-compiler',
    )
    const installedPackage = JSON.parse(
      await readFile(join(installedRoot, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }

    expect(installedPackage.dependencies?.['@stopcock/fp']).toBeUndefined()
    expect(installedPackage.peerDependencies?.['@stopcock/fp']).toBe(
      pkg.peerDependencies['@stopcock/fp'],
    )

    await writeFile(
      join(consumerDir, 'consumer.ts'),
      `
import {
  callbackArity,
  transformStopcockPipelines,
  stopcockFp,
  type CompilerSemantics,
  type StopcockCompilerOptions,
} from '@stopcock/fp-compiler'
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'

const options = {
  assumePure: true,
  arrayImportSources: ['@stopcock/fp/array'],
  diagnostics: 'verbose',
} satisfies StopcockCompilerOptions
const result = transformStopcockPipelines(
  \`import { pipe } from '@stopcock/fp'
import { sum } from '@stopcock/fp/array'
pipe([1], sum)\`,
  'fixture.ts',
  options,
)
const direct: number = pipe([1], A.sum)
const arity: 0 | 1 | 2 | undefined = callbackArity('map')
const semantics: CompilerSemantics = result.semantics
void direct
void arity
void semantics
void stopcockFp.vite(options)
`.trimStart(),
    )
    await writeFile(
      join(consumerDir, 'tsconfig.bundler.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'bundler',
            strict: true,
            noEmit: true,
            // unplugin intentionally references optional host packages
            // (Farm, Rspack, webpack, etc.) from its own declarations. The
            // consumer only installs the host it uses, so validate this
            // package's surface without requiring every unplugin host.
            skipLibCheck: true,
          },
          include: ['consumer.ts'],
        },
        null,
        2,
      ),
    )
    await writeFile(
      join(consumerDir, 'tsconfig.nodenext.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
            noEmit: true,
            types: [],
            // Unplugin intentionally exposes adapters for optional hosts
            // (Farm, Rspack, webpack, etc.) in one declaration. A consumer
            // installs only the host it uses, so validate this package's
            // NodeNext resolution and public types without requiring every
            // optional host's declarations.
            skipLibCheck: true,
          },
          include: ['consumer.ts'],
        },
        null,
        2,
      ),
    )

    execFileSync(process.execPath, [TSC, '-p', 'tsconfig.bundler.json'], {
      cwd: consumerDir,
      stdio: 'inherit',
    })
    execFileSync(process.execPath, [TSC, '-p', 'tsconfig.nodenext.json'], {
      cwd: consumerDir,
      stdio: 'inherit',
    })
  })
})
