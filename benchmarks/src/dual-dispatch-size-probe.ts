/**
 * Dual-dispatch size probe. Phase 0 of
 * docs/superpowers/plans/2026-08-24-dual-performance-first.md.
 *
 * The bench half (dual-dispatch.bench.ts) showed the candidates are speed-
 * equivalent on the invariant rows, so bytes decide. This measures the
 * shipped cost of a 3-op consumer (map, filter, reduce; the 71351e4
 * comparison shape) against each candidate emission, through the same
 * esbuild -> terser -> gzip -9 contract the s3b size gate uses. The consumer
 * calls curried only: with one dual export both branches ship regardless of
 * which shape the consumer uses, and that untree-shakeable overhead is
 * exactly the number D3 budgets.
 *
 * Not a gate. Run: `bun run src/dual-dispatch-size-probe.ts`. The anchor row
 * bundles the real @stopcock/fp/array ops for scale.
 */
import { gzipSync } from 'node:zlib'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { minify } from 'terser'
import { FP_CONSUMER_MINIFIER } from './reference/fp-consumer-size-contract'

const benchmarksRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const MAP_LOOP = `const len = arr.length, out = new Array(len)
    for (let i = 0; i < len; i++) out[i] = f(arr[i])
    return out`
const FILTER_LOOP = `const out = []
    for (let i = 0, len = arr.length; i < len; i++) {
      const v = arr[i]
      if (f(v)) out.push(v)
    }
    return out`
const REDUCE_LOOP = `let acc = init
    for (let i = 0, len = arr.length; i < len; i++) acc = f(acc, arr[i])
    return acc`

const loop = (body: string, arr: string, f: string, init?: string): string =>
  body
    .replaceAll('arr', arr)
    .replaceAll('f(', `${f}(`)
    .replace('init', init ?? 'init')

const single = `export const map = function map(f) {
  return function (arr) {
    ${MAP_LOOP}
  }
}
export const filter = function filter(f) {
  return function (arr) {
    ${FILTER_LOOP}
  }
}
export const reduce = function reduce(f, init) {
  return function (arr) {
    ${REDUCE_LOOP}
  }
}
`

const delegate = `export const map = function map(a0, a1) {
  if (arguments.length >= 2) return map(a1)(a0)
  const f = a0
  return function (arr) {
    ${MAP_LOOP}
  }
}
export const filter = function filter(a0, a1) {
  if (arguments.length >= 2) return filter(a1)(a0)
  const f = a0
  return function (arr) {
    ${FILTER_LOOP}
  }
}
export const reduce = function reduce(a0, a1, a2) {
  if (arguments.length >= 3) return reduce(a1, a2)(a0)
  const f = a0, init = a1
  return function (arr) {
    ${REDUCE_LOOP}
  }
}
`

const inline = `export const map = function map(a0, a1) {
  if (arguments.length >= 2) {
    ${loop(MAP_LOOP, 'a0', 'a1')}
  }
  const f = a0
  return function (arr) {
    ${MAP_LOOP}
  }
}
export const filter = function filter(a0, a1) {
  if (arguments.length >= 2) {
    ${loop(FILTER_LOOP, 'a0', 'a1')}
  }
  const f = a0
  return function (arr) {
    ${FILTER_LOOP}
  }
}
export const reduce = function reduce(a0, a1, a2) {
  if (arguments.length >= 3) {
    ${loop(REDUCE_LOOP, 'a0', 'a1').replace('init', 'a2')}
  }
  const f = a0, init = a1
  return function (arr) {
    ${REDUCE_LOOP}
  }
}
`

const shared = `function mapImpl(arr, f) {
  ${MAP_LOOP}
}
function filterImpl(arr, f) {
  ${FILTER_LOOP}
}
function reduceImpl(arr, f, init) {
  ${REDUCE_LOOP}
}
export const map = function map(a0, a1) {
  if (arguments.length >= 2) return mapImpl(a0, a1)
  return function (arr) {
    return mapImpl(arr, a0)
  }
}
export const filter = function filter(a0, a1) {
  if (arguments.length >= 2) return filterImpl(a0, a1)
  return function (arr) {
    return filterImpl(arr, a0)
  }
}
export const reduce = function reduce(a0, a1, a2) {
  if (arguments.length >= 3) return reduceImpl(a0, a1, a2)
  return function (arr) {
    return reduceImpl(arr, a0, a1)
  }
}
`

const consumer = (specifier: string): string => `import { map, filter, reduce } from '${specifier}'
export const result = reduce((acc, x) => acc + x, 0)(filter((x) => x > 1)(map((x) => x * 2)([1, 2, 3])))
`

interface Row {
  readonly id: string
  readonly minifiedBytes: number
  readonly gzipBytes: number
}

async function measure(id: string, directory: string, moduleSource: string | null): Promise<Row> {
  const specifier = moduleSource === null ? '@stopcock/fp/array' : `./${id}-ops.js`
  if (moduleSource !== null) writeFileSync(join(directory, `${id}-ops.js`), moduleSource)
  const entry = join(directory, `${id}.js`)
  writeFileSync(entry, consumer(specifier))
  const bundled = await build({
    absWorkingDir: benchmarksRoot,
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    treeShaking: true,
    write: false,
    logLevel: 'silent',
  })
  const minified = await minify(
    bundled.outputFiles[0].text,
    structuredClone(FP_CONSUMER_MINIFIER.options),
  )
  const output = minified.code ?? ''
  return {
    id,
    minifiedBytes: Buffer.byteLength(output),
    gzipBytes: gzipSync(Buffer.from(output), { level: 9 }).byteLength,
  }
}

const directory = mkdtempSync(join(benchmarksRoot, 'node_modules', '.stopcock-dual-size-'))
try {
  const rows: Row[] = []
  rows.push(await measure('single', directory, single))
  rows.push(await measure('delegate', directory, delegate))
  rows.push(await measure('inline', directory, inline))
  rows.push(await measure('shared', directory, shared))
  rows.push(await measure('anchor-real-fp-array', directory, null))

  const base = rows[0]
  console.log('candidate            minified  gzip  gzip delta vs single')
  for (const row of rows) {
    const delta = row.id === base.id ? '' : `${row.gzipBytes - base.gzipBytes >= 0 ? '+' : ''}${row.gzipBytes - base.gzipBytes}`
    console.log(
      `${row.id.padEnd(20)} ${String(row.minifiedBytes).padStart(8)} ${String(row.gzipBytes).padStart(5)}  ${delta}`,
    )
  }
} finally {
  rmSync(directory, { recursive: true, force: true })
}
