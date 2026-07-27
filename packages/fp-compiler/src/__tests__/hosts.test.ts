// Real-host smoke tests: build a tiny fixture through each supported
// bundler with stopcockFp applied, execute the emitted bundle, and check
// that the pipe() facade call is gone and generated code, not a retained
// runtime composition engine, executes the transformed site.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { transformSync } from 'esbuild'
import { afterAll, describe, expect, it } from 'vitest'
import { stopcockFp as stopcockEsbuild } from '../esbuild'
import { stopcockFp as stopcockRollup } from '../rollup'
import { stopcockFp as stopcockRspack } from '../rspack'
import { stopcockFp as stopcockVite } from '../vite'
import { stopcockFp as stopcockWebpack } from '../webpack'

// Fixtures build in an isolated scratch dir with no node_modules of their
// own, so both public FP entries must be pointed at the workspace build.
const FP_DIST_ENTRY = fileURLToPath(new URL('../../../fp/dist/index.js', import.meta.url))
const FP_ARRAY_DIST_ENTRY = fileURLToPath(new URL('../../../fp/dist/array.js', import.meta.url))

function resolveFpEntry(id: string): string | null {
  if (id === '@stopcock/fp') return FP_DIST_ENTRY
  if (id === '@stopcock/fp/array') return FP_ARRAY_DIST_ENTRY
  return null
}

const FIXTURE_SOURCE = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
export const result = pipe(
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  A.filterMap((x) => (x % 2 === 0 ? x * 10 : undefined)),
  A.take(2),
)
`.trimStart()

const EXPECTED = [20, 40]

const dirs: string[] = []

async function scratchDir(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `stopcock-fp-compiler-${name}-`))
  dirs.push(dir)
  return dir
}

function assertCompiledExecution(bundleText: string, host: string) {
  expect(bundleText, `${host} bundle should remove the pipe() facade invocation`).not.toMatch(
    /[^.\w]pipe\(/,
  )
  expect(bundleText, `${host} bundle should contain a generated loop`).toMatch(/for\s*\(/)
}

/**
 * S7's consumer rule: a fully transformed common consumer is at most 1 KiB and
 * retains no execution dispatcher or planner.
 *
 * Exact compilation must still evaluate official operator expressions. Their
 * construction leaves legitimately contain public `_op` metadata and operator
 * names, so string markers cannot distinguish required construction semantics
 * from an execution engine. The host module graph can: the transformed fixture
 * may retain the Array construction leaf, but never root sequential, compile,
 * fusion, or optimizer entries.
 */
const CONSUMER_CEILING_BYTES = 1024
const FORBIDDEN_COMPOSITION_ENGINE_MODULE_FRAGMENTS = [
  '/fp/dist/index.js',
  '/fp/dist/compile',
  '/fp/dist/fusion',
  '/fp/dist/internal/compact-runtime',
  '/fp/dist/internal/compact/plan',
  '/fp/dist/internal/plan-',
  '/fp/dist/plan',
  '/fp-optimizer/',
] as const

const ALLOWED_CONSTRUCTION_MODULE_FRAGMENTS = [
  '/fp/dist/array.js',
  '/fp/dist/array-',
  '/fp/dist/number-',
  '/fp/dist/option-',
  '/fp/dist/provenance-',
  '/fp/dist/result-',
  '/fp/dist/sort-kernel-',
] as const

interface StatsModuleLike {
  readonly identifier?: string
  readonly name?: string
  readonly modules?: readonly StatsModuleLike[]
}

function collectStatsModuleIds(modules: readonly StatsModuleLike[]): string[] {
  return modules.flatMap((module) => [
    ...(module.identifier === undefined ? [] : [module.identifier]),
    ...(module.name === undefined ? [] : [module.name]),
    ...collectStatsModuleIds(module.modules ?? []),
  ])
}

function assertNoRuntimeCompositionEngine(
  bundleText: string | readonly string[],
  moduleIds: readonly string[],
  host: string,
) {
  const normalizedIds = moduleIds.map((id) => id.replaceAll('\\', '/'))
  const retained = normalizedIds.filter((id) =>
    FORBIDDEN_COMPOSITION_ENGINE_MODULE_FRAGMENTS.some((fragment) => id.includes(fragment)),
  )
  expect(retained, `${host} module graph retains a composition or execution engine`).toEqual([])
  const unauditedFpModules = normalizedIds.filter(
    (id) =>
      id.includes('/fp/dist/') &&
      !ALLOWED_CONSTRUCTION_MODULE_FRAGMENTS.some((fragment) => id.includes(fragment)),
  )
  expect(
    unauditedFpModules,
    `${host} module graph retains an FP module outside the construction allowlist`,
  ).toEqual([])
  const texts = typeof bundleText === 'string' ? [bundleText] : bundleText
  const minified = texts
    .map((text) => transformSync(text, { loader: 'js', minify: true }).code)
    .join('\n')
  const gzipBytes = gzipSync(Buffer.from(minified), { level: 9 }).byteLength
  expect(gzipBytes, `${host} transformed consumer is ${gzipBytes} B gzip`).toBeLessThanOrEqual(
    CONSUMER_CEILING_BYTES,
  )
}

afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
})

describe('real-host smoke tests', () => {
  it('builds and fuses with Rollup', async () => {
    const dir = await scratchDir('rollup')
    const entry = join(dir, 'fixture.mjs')
    await writeFile(entry, FIXTURE_SOURCE)

    const { rollup } = await import('rollup')
    const bundle = await rollup({
      input: entry,
      plugins: [
        { name: 'alias-stopcock-fp', resolveId: resolveFpEntry },
        stopcockRollup({ diagnostics: 'verbose' }),
      ],
    })
    const { output } = await bundle.generate({ format: 'es' })
    await bundle.close()
    // Rollup may split the build into a facade entry plus real chunks, so
    // assert over and write out every chunk, then import the entry.
    const chunks = output.filter((o) => o.type === 'chunk')
    const rollupBundle = chunks.map((c) => c.code).join('\n')
    assertCompiledExecution(rollupBundle, 'rollup')
    assertNoRuntimeCompositionEngine(
      chunks.map((chunk) => chunk.code),
      chunks.flatMap((chunk) => Object.keys(chunk.modules)),
      'rollup',
    )

    for (const c of chunks) await writeFile(join(dir, c.fileName), c.code)
    const entryChunk = chunks.find((c) => c.isEntry) ?? chunks[0]
    const mod = await import(pathToFileURL(join(dir, entryChunk.fileName)).href)
    expect(mod.result).toEqual(EXPECTED)
  })

  it('builds and fuses with esbuild', async () => {
    const dir = await scratchDir('esbuild')
    const entry = join(dir, 'fixture.mjs')
    const outfile = join(dir, 'out.mjs')
    await writeFile(entry, FIXTURE_SOURCE)

    const esbuild = await import('esbuild')
    const buildResult = await esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      metafile: true,
      plugins: [
        stopcockEsbuild({ diagnostics: 'verbose' }),
        {
          name: 'alias-stopcock-fp',
          setup(build) {
            build.onResolve({ filter: /^@stopcock\/fp(?:\/array)?$/ }, ({ path }) => ({
              path: resolveFpEntry(path)!,
            }))
          },
        },
      ],
    })

    const code = await readFile(outfile, 'utf8')
    assertCompiledExecution(code, 'esbuild')
    assertNoRuntimeCompositionEngine(code, Object.keys(buildResult.metafile.inputs), 'esbuild')

    const mod = await import(pathToFileURL(outfile).href)
    expect(mod.result).toEqual(EXPECTED)
  })

  it('builds and fuses with webpack 5', async () => {
    const dir = await scratchDir('webpack')
    const entry = join(dir, 'fixture.mjs')
    await writeFile(entry, FIXTURE_SOURCE)

    const { default: webpack } = await import('webpack')
    const outFileName = 'out.cjs'
    let moduleIds: string[] = []

    await new Promise<void>((resolve, reject) => {
      const compiler = webpack({
        // Production, because the consumer rule is about what a consumer
        // ships. Webpack's development output carries 1,192 B of its own
        // scaffolding for an empty module, so measuring it would be measuring
        // webpack's debugger, not this compiler.
        mode: 'production',
        entry,
        target: 'node',
        output: {
          path: dir,
          filename: outFileName,
          library: { type: 'commonjs2' },
        },
        resolve: {
          alias: {
            '@stopcock/fp$': FP_DIST_ENTRY,
            '@stopcock/fp/array$': FP_ARRAY_DIST_ENTRY,
          },
        },
        plugins: [stopcockWebpack({ diagnostics: 'verbose' })],
      })
      compiler.run((err, stats) => {
        compiler.close(() => {
          if (err) return reject(err)
          if (stats?.hasErrors()) return reject(new Error(stats.toString({ errorDetails: true })))
          const statsJson = stats?.toJson({
            all: false,
            modules: true,
            nestedModules: true,
          }) as { readonly modules?: readonly StatsModuleLike[] } | undefined
          moduleIds = collectStatsModuleIds(statsJson?.modules ?? [])
          resolve()
        })
      })
    })

    const outFile = join(dir, outFileName)
    const code = await readFile(outFile, 'utf8')
    assertCompiledExecution(code, 'webpack')
    assertNoRuntimeCompositionEngine(code, moduleIds, 'webpack')

    delete require.cache[outFile]
    const mod = require(outFile)
    expect(mod.result).toEqual(EXPECTED)
  })

  it('builds and fuses with Rspack', async () => {
    const dir = await scratchDir('rspack')
    const entry = join(dir, 'fixture.mjs')
    await writeFile(entry, FIXTURE_SOURCE)

    const { rspack } = await import('@rspack/core')
    const outFileName = 'out.cjs'
    let moduleIds: string[] = []
    await new Promise<void>((resolve, reject) => {
      const compiler = rspack({
        mode: 'production',
        entry,
        target: 'node',
        output: {
          path: dir,
          filename: outFileName,
          library: { type: 'commonjs2' },
        },
        resolve: {
          alias: {
            '@stopcock/fp$': FP_DIST_ENTRY,
            '@stopcock/fp/array$': FP_ARRAY_DIST_ENTRY,
          },
        },
        plugins: [stopcockRspack({ diagnostics: 'verbose' })],
      })
      compiler.run((error, stats) => {
        compiler.close(() => {
          if (error) return reject(error)
          if (stats?.hasErrors()) {
            return reject(new Error(stats.toString({ errorDetails: true })))
          }
          const statsJson = stats?.toJson({
            all: false,
            modules: true,
            nestedModules: true,
          }) as { readonly modules?: readonly StatsModuleLike[] } | undefined
          moduleIds = collectStatsModuleIds(statsJson?.modules ?? [])
          resolve()
        })
      })
    })

    const outFile = join(dir, outFileName)
    const code = await readFile(outFile, 'utf8')
    assertCompiledExecution(code, 'rspack')
    assertNoRuntimeCompositionEngine(code, moduleIds, 'rspack')

    delete require.cache[outFile]
    const mod = require(outFile)
    expect(mod.result).toEqual(EXPECTED)
  })

  it('builds and fuses with Vite (vite-plus core)', async () => {
    const dir = await scratchDir('vite')
    const entry = join(dir, 'fixture.mjs')
    await writeFile(entry, FIXTURE_SOURCE)

    const { build } = await import('vite')
    const result = await build({
      root: dir,
      logLevel: 'silent',
      resolve: {
        alias: [
          { find: /^@stopcock\/fp$/, replacement: FP_DIST_ENTRY },
          { find: /^@stopcock\/fp\/array$/, replacement: FP_ARRAY_DIST_ENTRY },
        ],
      },
      plugins: [stopcockVite({ diagnostics: 'verbose' })],
      build: {
        outDir: join(dir, 'dist'),
        lib: {
          entry,
          formats: ['es'],
          fileName: () => 'out.mjs',
        },
        minify: false,
        write: true,
      },
    })
    void result

    const outFile = join(dir, 'dist', 'out.mjs')
    const code = await readFile(outFile, 'utf8')
    assertCompiledExecution(code, 'vite')
    const viteOutputs = Array.isArray(result) ? result : [result]
    assertNoRuntimeCompositionEngine(
      code,
      viteOutputs.flatMap(({ output }) =>
        output.flatMap((item) => (item.type === 'chunk' ? Object.keys(item.modules) : [])),
      ),
      'vite',
    )

    const mod = await import(pathToFileURL(outFile).href)
    expect(mod.result).toEqual(EXPECTED)
  })
})

describe('the consumer rule discriminates', () => {
  it('detects the engine in an untransformed bundle', async () => {
    const dir = await scratchDir('untransformed')
    const entry = join(dir, 'fixture.js')
    await writeFile(entry, FIXTURE_SOURCE)

    const { build } = await import('esbuild')
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      write: false,
      logLevel: 'silent',
      metafile: true,
      plugins: [
        {
          name: 'alias',
          setup(builder) {
            builder.onResolve({ filter: /^@stopcock\/fp$/ }, () => ({ path: FP_DIST_ENTRY }))
            builder.onResolve({ filter: /^@stopcock\/fp\/array$/ }, () => ({
              path: FP_ARRAY_DIST_ENTRY,
            }))
          },
        },
      ],
    })
    const code = result.outputFiles[0].text
    // Without the compiler the engine is present and the bundle is far over
    // the ceiling, so both halves of the rule are doing work.
    expect(() =>
      assertNoRuntimeCompositionEngine(code, Object.keys(result.metafile.inputs), 'untransformed'),
    ).toThrow()
  })
})
