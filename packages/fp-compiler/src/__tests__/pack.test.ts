// Packs the real tarball, installs it into an isolated scratch consumer,
// and imports it from there -- catches export-map/files-list mistakes
// that in-repo tests can't see, and proves the packed ops-table snapshot
// (not the @stopcock/fp workspace source) is what a consumer runs against.
import { execFileSync } from 'node:child_process'
import {
  access,
  cp,
  mkdtemp,
  mkdir,
  readFile,
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

beforeAll(async () => {
  execFileSync('bunx', ['vp', 'run', 'build'], { cwd: PACKAGE_ROOT, stdio: 'inherit' })
  scratchDir = await mkdtemp(join(tmpdir(), 'stopcock-fp-compiler-pack-'))

  execFileSync('bun', ['pm', 'pack', '--destination', scratchDir], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
  })
  tarballPath = join(scratchDir, TARBALL_NAME)

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
  await mkdir(installedCompiler, { recursive: true })
  execFileSync(
    'tar',
    ['-xzf', tarballPath, '-C', installedCompiler, '--strip-components=1'],
    { stdio: 'inherit' },
  )
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
}, 60_000)

afterAll(async () => {
  if (scratchDir) await rm(scratchDir, { recursive: true, force: true })
})

describe('packed tarball', () => {
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
import { stopcockFp as viteStopcockFp } from '@stopcock/fp-compiler/vite'
import { stopcockFp as webpackStopcockFp } from '@stopcock/fp-compiler/webpack'

assert.equal(callbackArity('map'), 1)
assert.equal(callbackArity('not-an-op'), undefined)
assert.equal(typeof stopcockFp.rollup, 'function')
assert.equal(typeof stopcockFp.vite, 'function')
assert.equal(typeof viteStopcockFp, 'function')
assert.equal(typeof rollupStopcockFp, 'function')
assert.equal(typeof esbuildStopcockFp, 'function')
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

  it('ships a root declaration entry without test or source-root leakage', async () => {
    const installedRoot = join(
      consumerDir,
      'node_modules/@stopcock/fp-compiler',
    )
    const declaration = await readFile(join(installedRoot, 'dist/index.d.ts'), 'utf8')
    const runtime = await readFile(join(installedRoot, 'dist/index.js'), 'utf8')
    const distFiles = await readdir(join(installedRoot, 'dist'), {
      recursive: true,
    })
    const declarationFiles = distFiles.filter((file) => file.endsWith('.d.ts'))

    expect(declaration).toContain('transformStopcockPipelines')
    expect(declaration).toContain('callbackArity')
    for (const adapter of ['vite', 'rollup', 'esbuild', 'webpack']) {
      const adapterDeclaration = await readFile(
        join(installedRoot, `dist/${adapter}.d.ts`),
        'utf8',
      )
      expect(adapterDeclaration).toContain('stopcockFp')
    }
    expect(runtime).not.toMatch(
      /(?:from\s*|import\s*\()\s*['"]@stopcock\/fp(?:\/[^'"]*)?['"]/,
    )
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
      '^2.0.0',
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
