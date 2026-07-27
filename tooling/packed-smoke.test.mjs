// Sole survivor of the packed-consumer idea (see docs/superpowers/plans).
//
// Packs the real @stopcock/fp and @stopcock/fp-compiler tarballs, installs
// them into an isolated scratch project, compiles a three-op pipeline with
// the Vite plugin, runs the emitted bundle, and asserts both the output
// value and that the compiled bundle carries no @stopcock/fp runtime import
// -- the pipeline fused away at build time, not just at test time.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const FP_ROOT = join(REPO_ROOT, 'packages', 'fp')
const COMPILER_ROOT = join(REPO_ROOT, 'packages', 'fp-compiler')
const BUILD_SCRIPT = join(REPO_ROOT, 'tooling', 'build-package.mjs')

const build = (cwd) => execFileSync('node', [BUILD_SCRIPT], { cwd, stdio: 'inherit' })

const tarballName = async (packageRoot) => {
  const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  return `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`
}

const extractTarball = (tarballPath, destination) => {
  execFileSync('tar', ['-xzf', tarballPath, '-C', destination, '--strip-components=1'], {
    stdio: 'inherit',
  })
}

const FIXTURE = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
export const result = pipe(
  [1, 2, 3, 4, 5],
  A.map((x) => x * 2),
  A.filter((x) => x > 4),
  A.reduce((acc, x) => acc + x, 0),
)
`.trimStart()

void test('a packed fp + fp-compiler pipeline compiles away the runtime engine', async (t) => {
  build(FP_ROOT)
  build(COMPILER_ROOT)

  const scratch = await mkdtemp(join(tmpdir(), 'stopcock-packed-smoke-'))
  t.after(() => rm(scratch, { recursive: true, force: true }))

  execFileSync('bun', ['pm', 'pack', '--destination', scratch], { cwd: FP_ROOT, stdio: 'inherit' })
  execFileSync('bun', ['pm', 'pack', '--destination', scratch], {
    cwd: COMPILER_ROOT,
    stdio: 'inherit',
  })

  const consumer = join(scratch, 'consumer')
  const nodeModules = join(consumer, 'node_modules')
  const stopcockModules = join(nodeModules, '@stopcock')
  await mkdir(stopcockModules, { recursive: true })

  const fpDir = join(stopcockModules, 'fp')
  const compilerDir = join(stopcockModules, 'fp-compiler')
  await mkdir(fpDir, { recursive: true })
  await mkdir(compilerDir, { recursive: true })
  extractTarball(join(scratch, await tarballName(FP_ROOT)), fpDir)
  extractTarball(join(scratch, await tarballName(COMPILER_ROOT)), compilerDir)

  // Runtime dependencies the packed compiler needs to actually run, linked
  // from the compiler package's own resolution (where they are actually
  // hoisted to) rather than fetched over a network.
  const compilerNodeModules = join(COMPILER_ROOT, 'node_modules')
  for (const name of ['magic-string', 'unplugin', 'vite']) {
    await symlink(join(compilerNodeModules, name), join(nodeModules, name), 'dir')
  }
  const babelModules = join(nodeModules, '@babel')
  await mkdir(babelModules, { recursive: true })
  for (const name of ['parser', 'traverse', 'types']) {
    await symlink(join(compilerNodeModules, '@babel', name), join(babelModules, name), 'dir')
  }

  const entry = join(consumer, 'fixture.mjs')
  await writeFile(entry, FIXTURE)

  const { build: viteBuild } = await import('vite')
  const outDir = join(consumer, 'dist')
  await viteBuild({
    root: consumer,
    logLevel: 'silent',
    plugins: [(await import(pathToFileURL(join(compilerDir, 'dist', 'vite.js')).href)).stopcockFp()],
    build: {
      outDir,
      lib: { entry, formats: ['es'], fileName: () => 'out.mjs' },
      minify: false,
      write: true,
    },
  })

  const outFile = join(outDir, 'out.mjs')
  const code = await readFile(outFile, 'utf8')

  // A compiled site may still retain the tiny operator-construction leaf
  // (array.js, option, provenance...): building `A.map(f)` still constructs a
  // real tagged object as an observable side effect. What must be gone is the
  // runtime composition engine -- the dispatcher that would otherwise have
  // run this pipeline -- since the fused loop below replaces it entirely.
  const FORBIDDEN_ENGINE_FRAGMENTS = [
    '/fp/dist/index.js',
    '/fp/dist/compile',
    '/fp/dist/fusion',
    '/fp/dist/internal/compact-runtime',
    '/fp/dist/internal/plan-',
    '/fp/dist/plan',
  ]
  for (const fragment of FORBIDDEN_ENGINE_FRAGMENTS) {
    assert.ok(!code.includes(fragment), `compiled bundle must not retain the engine module ${fragment}`)
  }
  assert.doesNotMatch(code, /[^.\w]pipe\(/, 'compiled bundle must not retain the pipe() facade call')
  assert.match(code, /for\s*\(/, 'compiled bundle should contain a generated loop')

  const mod = await import(pathToFileURL(outFile).href)
  assert.equal(mod.result, 24)
})
