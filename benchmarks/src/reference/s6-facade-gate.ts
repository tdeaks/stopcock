/**
 * S6 facade evidence.
 *
 * Two things have to stay true once explicit fusion exists: a consumer that
 * only imports a direct operation must not start carrying the fusion engine,
 * and the debug facade must be absent unless it is imported. Both are size
 * questions, so both are measured rather than asserted.
 */
import { gzipSync } from 'node:zlib'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { minify } from 'terser'
import { FP_CONSUMER_MINIFIER } from './fp-consumer-size-contract'

const localDirectory = dirname(fileURLToPath(import.meta.url))
const benchmarksRoot = resolve(localDirectory, '..', '..')

const KIB = 1024

/** The debug facade may add at most this much over the same pipeline without it. */
export const DEBUG_FACADE_CEILING_BYTES = 3 * KIB

export interface FacadeFixture {
  readonly id: string
  readonly source: string
}

export const S6_FIXTURES: readonly FacadeFixture[] = Object.freeze([
  Object.freeze({
    id: 'direct.map',
    source: `import { map } from '@stopcock/fp/array'
export const result = map([1, 2, 3], (x) => x * 2)
`,
  }),
  Object.freeze({
    id: 'fusion.pipeline',
    source: `import { pipe } from '@stopcock/fp/fusion'
import { filter, map } from '@stopcock/fp/array'
export const result = pipe([1, 2, 3], map((x) => x * 2), filter((x) => x > 2))
`,
  }),
  Object.freeze({
    id: 'optimized.pipeline',
    source: `import { pipe } from '@stopcock/fp-optimizer'
import { filter, map } from '@stopcock/fp/array'
export const result = pipe([1, 2, 3], map((x) => x * 2), filter((x) => x > 2))
`,
  }),
  Object.freeze({
    id: 'fusion.pipeline.debug',
    source: `import { pipe } from '@stopcock/fp-optimizer'
import { explain } from '@stopcock/fp/fusion/debug'
import { filter, map } from '@stopcock/fp/array'
const steps = [map((x) => x * 2), filter((x) => x > 2)]
export const result = pipe([1, 2, 3], steps[0], steps[1])
export const explanation = explain(steps[0], steps[1])
`,
  }),
  // The case S10 owns. The fixture above pairs debug with the *optimized*
  // pipe, so its "increment over compact" was always going to contain the
  // whole engine and could never show whether explain drags it in. This one
  // pairs debug with the compact pipe, which is the question.
  Object.freeze({
    id: 'compact.pipeline.debug',
    source: `import { pipe } from '@stopcock/fp/fusion'
import { explain } from '@stopcock/fp/fusion/debug'
import { filter, map } from '@stopcock/fp/array'
const steps = [map((x) => x * 2), filter((x) => x > 2)]
export const result = pipe([1, 2, 3], steps[0], steps[1])
export const explanation = explain(steps[0], steps[1])
`,
  }),
])

export interface FacadeRow {
  readonly id: string
  readonly gzipBytes: number
  readonly code: string
}

export const measureFacades = async (
  fixtures: readonly FacadeFixture[] = S6_FIXTURES,
): Promise<FacadeRow[]> => {
  const directory = mkdtempSync(join(benchmarksRoot, 'node_modules', '.stopcock-s6-'))
  try {
    const rows: FacadeRow[] = []
    for (const fixture of fixtures) {
      const entry = join(directory, `${fixture.id}.js`)
      writeFileSync(entry, fixture.source)
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
      const code = bundled.outputFiles[0].text
      const minified = await minify(code, structuredClone(FP_CONSUMER_MINIFIER.options))
      const output = minified.code ?? ''
      rows.push({
        id: fixture.id,
        gzipBytes: gzipSync(Buffer.from(output), { level: 9 }).byteLength,
        code,
      })
    }
    return rows
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

/** Markers that only appear when the fusion engine or its diagnostics are present. */
export const ENGINE_MARKER = 'planAndLowerFast'
export const DEBUG_MARKER = 'aotRecommended'

export const evaluateFacades = (rows: readonly FacadeRow[]): string[] => {
  const failures: string[] = []
  const byId = new Map(rows.map((row) => [row.id, row]))

  const direct = byId.get('direct.map')
  if (direct === undefined) failures.push('missing direct.map row')
  else {
    if (direct.code.includes(ENGINE_MARKER)) {
      failures.push('a direct-only consumer retains the fusion engine')
    }
    if (direct.code.includes(DEBUG_MARKER)) {
      failures.push('a direct-only consumer retains the debug surface')
    }
  }

  const fused = byId.get('fusion.pipeline')
  if (fused === undefined) failures.push('missing fusion.pipeline row')
  else if (fused.code.includes(DEBUG_MARKER)) {
    failures.push('the debug facade is present without being imported')
  }

  const optimizedBase = byId.get('optimized.pipeline')
  const debug = byId.get('fusion.pipeline.debug')
  if (debug === undefined || optimizedBase === undefined) {
    failures.push('missing debug comparison rows')
  } else {
    if (!debug.code.includes(DEBUG_MARKER)) {
      failures.push('the debug fixture does not actually reach the debug surface')
    }
    const incremental = debug.gzipBytes - optimizedBase.gzipBytes
    if (incremental > DEBUG_FACADE_CEILING_BYTES) {
      failures.push(
        `the debug facade adds ${incremental} B over an optimized base, over its ${DEBUG_FACADE_CEILING_BYTES} B ceiling`,
      )
    }
  }

  // S10 made `explain` static, so a compact consumer that explains a pipeline
  // must not acquire the optimized engine. This is the enforcement, not the
  // reported number: a regression here means explain grew an engine dependency
  // again, which no byte ceiling on the optimized base would catch.
  const compactBase = byId.get('fusion.pipeline')
  const compactDebug = byId.get('compact.pipeline.debug')
  if (compactBase === undefined || compactDebug === undefined) {
    failures.push('missing compact debug comparison rows')
  } else {
    if (compactDebug.code.includes(ENGINE_MARKER)) {
      failures.push('explaining a compact pipeline pulls in the optimized engine')
    }
    if (!compactDebug.code.includes(DEBUG_MARKER)) {
      failures.push('the compact debug fixture does not actually reach the debug surface')
    }
    const incremental = compactDebug.gzipBytes - compactBase.gzipBytes
    if (incremental > DEBUG_FACADE_CEILING_BYTES) {
      failures.push(
        `the debug facade adds ${incremental} B over a compact base, over its ${DEBUG_FACADE_CEILING_BYTES} B ceiling`,
      )
    }
  }

  return failures
}

const main = async (): Promise<void> => {
  const rows = await measureFacades()
  const byId = new Map(rows.map((row) => [row.id, row]))
  for (const row of rows) {
    console.log(
      [
        row.id,
        `${row.gzipBytes} B gzip`,
        row.code.includes(ENGINE_MARKER) ? 'engine present' : 'no engine',
        row.code.includes(DEBUG_MARKER) ? 'debug present' : 'no debug',
      ].join('\t'),
    )
  }
  const compactBase = byId.get('fusion.pipeline')
  const optimizedBase = byId.get('optimized.pipeline')
  const debug = byId.get('fusion.pipeline.debug')
  if (optimizedBase !== undefined && debug !== undefined) {
    console.log(
      `debug increment over optimized\t${debug.gzipBytes - optimizedBase.gzipBytes} B\tceiling ${DEBUG_FACADE_CEILING_BYTES} B`,
    )
  }
  const compactDebug = byId.get('compact.pipeline.debug')
  if (compactBase !== undefined && compactDebug !== undefined) {
    console.log(
      `debug increment over compact\t${compactDebug.gzipBytes - compactBase.gzipBytes} B\tceiling ${DEBUG_FACADE_CEILING_BYTES} B`,
    )
  }
  const failures = evaluateFacades(rows)
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
