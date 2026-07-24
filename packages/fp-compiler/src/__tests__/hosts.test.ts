// Real-host smoke tests: build a tiny fixture through each supported
// bundler with stopcockFp applied, execute the emitted bundle, and check
// that the pipe() call site got fused into a loop (no runtime `pipe(`
// call left at that site).
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { stopcockFp as stopcockEsbuild } from '../esbuild'
import { stopcockFp as stopcockRollup } from '../rollup'
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

function assertFused(bundleText: string, host: string) {
  expect(bundleText, `${host} bundle should not call pipe( at runtime`).not.toMatch(/[^.\w]pipe\(/)
  expect(bundleText, `${host} bundle should contain a fused loop`).toMatch(/for\s*\(/)
}

afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
})

describe('real-host smoke tests', () => {
  it('builds and fuses with Rollup', async () => {
    const dir = await scratchDir('rollup')
    const entry = join(dir, 'fixture.js')
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
    assertFused(chunks.map((c) => c.code).join('\n'), 'rollup')

    for (const c of chunks) await writeFile(join(dir, c.fileName), c.code)
    const entryChunk = chunks.find((c) => c.isEntry) ?? chunks[0]
    const mod = await import(pathToFileURL(join(dir, entryChunk.fileName)).href)
    expect(mod.result).toEqual(EXPECTED)
  })

  it('builds and fuses with esbuild', async () => {
    const dir = await scratchDir('esbuild')
    const entry = join(dir, 'fixture.js')
    const outfile = join(dir, 'out.mjs')
    await writeFile(entry, FIXTURE_SOURCE)

    const esbuild = await import('esbuild')
    await esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      plugins: [
        stopcockEsbuild({ diagnostics: 'verbose' }),
        {
          name: 'alias-stopcock-fp',
          setup(build) {
            build.onResolve(
              { filter: /^@stopcock\/fp(?:\/array)?$/ },
              ({ path }) => ({ path: resolveFpEntry(path)! }),
            )
          },
        },
      ],
    })

    const code = await readFile(outfile, 'utf8')
    assertFused(code, 'esbuild')

    const mod = await import(pathToFileURL(outfile).href)
    expect(mod.result).toEqual(EXPECTED)
  })

  it('builds and fuses with webpack 5', async () => {
    const dir = await scratchDir('webpack')
    const entry = join(dir, 'fixture.js')
    await writeFile(entry, FIXTURE_SOURCE)

    const { default: webpack } = await import('webpack')
    const outFileName = 'out.cjs'

    await new Promise<void>((resolve, reject) => {
      const compiler = webpack({
        mode: 'development',
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
          resolve()
        })
      })
    })

    const outFile = join(dir, outFileName)
    const code = await readFile(outFile, 'utf8')
    assertFused(code, 'webpack')

    delete require.cache[outFile]
    const mod = require(outFile)
    expect(mod.result).toEqual(EXPECTED)
  })

  it('builds and fuses with Vite (vite-plus core)', async () => {
    const dir = await scratchDir('vite')
    const entry = join(dir, 'fixture.js')
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
    assertFused(code, 'vite')

    const mod = await import(pathToFileURL(outFile).href)
    expect(mod.result).toEqual(EXPECTED)
  })
})
