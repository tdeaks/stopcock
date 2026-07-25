/**
 * S8 root-cutover size evidence.
 *
 * The point of making root sequential is that importing `pipe` should not cost
 * you the optimizer. These are the numbers that say whether that is true, and
 * the engine check says whether the planner came along anyway.
 */
import { gzipSync } from 'node:zlib'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { minify } from 'terser'
import { FP_CONSUMER_MINIFIER } from './fp-consumer-size-contract'

const benchmarksRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const KIB = 1024

export interface RootSizeCase {
  readonly id: string
  readonly source: string
  readonly maximumBytes: number
}

export const S8_ROOT_SIZE_CASES: readonly RootSizeCase[] = Object.freeze([
  Object.freeze({
    id: 'root.pipe',
    source: `import { pipe } from '@stopcock/fp'\nexport const r = pipe(5, (x) => x + 1)\n`,
    maximumBytes: 512,
  }),
  Object.freeze({
    id: 'root.flow',
    source: `import { flow } from '@stopcock/fp'\nexport const r = flow((x) => x + 1)(5)\n`,
    maximumBytes: 512,
  }),
  Object.freeze({
    id: 'sequential.common-pipeline',
    source: `import { pipe } from '@stopcock/fp'
import { filter, map } from '@stopcock/fp/array'
export const r = pipe([1,2,3], map((x) => x * 2), filter((x) => x > 2))
`,
    maximumBytes: Math.round(1.5 * KIB),
  }),
  Object.freeze({
    id: 'root.named-fixture',
    source: `import { pipe, some, isSome } from '@stopcock/fp'\nexport const r = isSome(some(pipe(1, (x) => x + 1)))\n`,
    maximumBytes: Math.round(0.5 * KIB),
  }),
  Object.freeze({
    id: 'root.enumerated',
    source: `import * as F from '@stopcock/fp'\nexport const r = Object.keys(F).length\n`,
    maximumBytes: 8 * KIB,
  }),
])

/**
 * Markers that survive minification. `_op` is deliberately absent: S8 permits
 * the minimal operator-identity machinery a reachable data-last wrapper needs,
 * and only forbids the planner, lowerer, registry, caches, and templates.
 */
export const ROOT_FORBIDDEN_MARKERS = [
  'planAndLowerFast',
  'takeWhile',
  'sortBy',
  'segments',
  'shapeCache',
]

export interface RootSizeRow {
  readonly id: string
  readonly gzipBytes: number
  readonly forbidden: readonly string[]
}

export const measureRootSizes = async (
  cases: readonly RootSizeCase[] = S8_ROOT_SIZE_CASES,
): Promise<RootSizeRow[]> => {
  const directory = mkdtempSync(join(benchmarksRoot, 'node_modules', '.stopcock-s8-'))
  try {
    const rows: RootSizeRow[] = []
    for (const testCase of cases) {
      const entry = join(directory, `${testCase.id.replace(/\W+/gu, '-')}.js`)
      writeFileSync(entry, testCase.source)
      const bundled = await build({
        absWorkingDir: benchmarksRoot,
        entryPoints: [entry],
        bundle: true,
        format: 'esm',
        target: 'es2022',
        treeShaking: true,
        write: false,
        logLevel: 'silent',
      })
      const code = bundled.outputFiles[0].text
      const minified = await minify(code, structuredClone(FP_CONSUMER_MINIFIER.options))
      rows.push({
        id: testCase.id,
        gzipBytes: gzipSync(Buffer.from(minified.code ?? ''), { level: 9 }).byteLength,
        forbidden: ROOT_FORBIDDEN_MARKERS.filter((marker) => code.includes(marker)),
      })
    }
    return rows
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export const evaluateRootSizes = (rows: readonly RootSizeRow[]): string[] => {
  const failures: string[] = []
  for (const testCase of S8_ROOT_SIZE_CASES) {
    const row = rows.find((candidate) => candidate.id === testCase.id)
    if (row === undefined) {
      failures.push(`missing root size row for ${testCase.id}`)
      continue
    }
    if (row.gzipBytes > testCase.maximumBytes) {
      failures.push(`${row.id} is ${row.gzipBytes} B, over its ${testCase.maximumBytes} B ceiling`)
    }
    if (row.forbidden.length > 0) {
      failures.push(`${row.id} retains ${row.forbidden.join(', ')}`)
    }
  }
  return failures
}

const main = async (): Promise<void> => {
  const rows = await measureRootSizes()
  for (const row of rows) {
    const testCase = S8_ROOT_SIZE_CASES.find((candidate) => candidate.id === row.id)
    console.log(
      `${row.id}\t${row.gzipBytes} B gzip\tceiling ${testCase?.maximumBytes} B\t${
        row.forbidden.length > 0 ? row.forbidden.join(',') : 'no engine'
      }`,
    )
  }
  const failures = evaluateRootSizes(rows)
  for (const failure of failures) console.error(`FAIL\t${failure}`)
  if (failures.length > 0) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
