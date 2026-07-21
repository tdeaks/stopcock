import { bench, describe } from 'vite-plus/test'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const fpRoot = path.join(repoRoot, 'packages/fp')
const coldImportBenchOptions = {
  iterations: 8,
  time: 250,
  warmupIterations: 1,
  warmupTime: 50,
}

function runBunColdImport(script: string) {
  const result = spawnSync('bun', ['--eval', script], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'ignore',
  })

  if (result.status !== 0) {
    throw new Error(`bun child process import failed with status ${result.status}`)
  }
}

const importSourceFile = (relativePath: string) => {
  const href = pathToFileURL(path.join(fpRoot, relativePath)).href
  return `await import(${JSON.stringify(href)})`
}

describe('FP cold import, child-process startup plus module import', () => {
  bench(
    'source index.ts child-process + import cold start',
    () => runBunColdImport(importSourceFile('src/index.ts')),
    coldImportBenchOptions,
  )

  bench(
    'source array.ts child-process + import cold start',
    () => runBunColdImport(importSourceFile('src/array.ts')),
    coldImportBenchOptions,
  )

  bench(
    'source stream.ts child-process + import cold start',
    () => runBunColdImport(importSourceFile('src/stream.ts')),
    coldImportBenchOptions,
  )

  if (existsSync(path.join(fpRoot, 'dist/index.js'))) {
    bench(
      'dist index.js file child-process + import cold start',
      () => runBunColdImport(importSourceFile('dist/index.js')),
      coldImportBenchOptions,
    )
  }

  if (existsSync(path.join(fpRoot, 'dist/array.js'))) {
    bench(
      'dist array.js file child-process + import cold start',
      () => runBunColdImport(importSourceFile('dist/array.js')),
      coldImportBenchOptions,
    )
  }
})
