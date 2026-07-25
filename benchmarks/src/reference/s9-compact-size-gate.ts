/**
 * S9 compact fusion size gate.
 *
 * The 5.5 KiB compact closure is a hard slice gate, not an aspiration: compact
 * exists to be small, and a compact tier that is not small is just a slower
 * optimized tier. The debug check matters as much as the byte count — the
 * saving comes from leaving names, descriptions, and statistics out of
 * production, and those creep back the moment something imports the registry.
 */
import { gzipSync } from 'node:zlib'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { minify } from 'terser'
import { FP_CONSUMER_MINIFIER } from './fp-consumer-size-contract'

const benchmarksRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Hard gate. S10, S12, and S13 may not consume S9 above it. */
export const COMPACT_CEILING_BYTES = Math.round(5.5 * 1024)

/**
 * Strings that only exist for diagnostics. Property keys and literals survive
 * minification, so these discriminate; local identifiers would not.
 */
export const DEBUG_MARKERS = [
  'materializationBoundaries',
  'runtimeCodeGeneration',
  'aotRecommended',
  'shapeCacheHits',
  'plansBuilt',
]

export interface CompactSizeReport {
  readonly gzipBytes: number
  readonly debugMarkers: readonly string[]
  readonly operationNames: readonly string[]
}

/**
 * Operation names appear only in the registry, which compact must not carry.
 * Matched as quoted string literals: a bare substring search reports
 * `dropWhileActive`, an ordinary local in the executor's stream state, as
 * though the registry had come back.
 */
const OPERATION_NAME_MARKERS = ['filterMap', 'takeWhile', 'dropWhile', 'sortBy', 'findMap']

const carriesQuotedName = (code: string, name: string): boolean =>
  code.includes(`"${name}"`) || code.includes(`'${name}'`)

export const measureCompactClosure = async (): Promise<CompactSizeReport> => {
  const directory = mkdtempSync(join(benchmarksRoot, 'node_modules', '.stopcock-s9-'))
  try {
    const entry = join(directory, 'compact.js')
    writeFileSync(
      entry,
      `import { pipe } from '@stopcock/fp/fusion'
import { filter, map } from '@stopcock/fp/array'
export const r = pipe([1, 2, 3], map((x) => x * 2), filter((x) => x > 2))
`,
    )
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
    return {
      gzipBytes: gzipSync(Buffer.from(minified.code ?? ''), { level: 9 }).byteLength,
      debugMarkers: DEBUG_MARKERS.filter((marker) => code.includes(marker)),
      operationNames: OPERATION_NAME_MARKERS.filter((marker) => carriesQuotedName(code, marker)),
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export const evaluateCompactSize = (report: CompactSizeReport): string[] => {
  const failures: string[] = []
  if (report.gzipBytes > COMPACT_CEILING_BYTES) {
    failures.push(
      `compact closure is ${report.gzipBytes} B, over its hard ${COMPACT_CEILING_BYTES} B gate`,
    )
  }
  if (report.debugMarkers.length > 0) {
    failures.push(`compact production carries debug surface: ${report.debugMarkers.join(', ')}`)
  }
  if (report.operationNames.length > 0) {
    failures.push(
      `compact production carries the name registry: ${report.operationNames.join(', ')}`,
    )
  }
  return failures
}

const main = async (): Promise<void> => {
  const report = await measureCompactClosure()
  console.log(
    `compact closure\t${report.gzipBytes} B gzip\tgate ${COMPACT_CEILING_BYTES} B\t${
      report.debugMarkers.length === 0 ? 'no debug' : report.debugMarkers.join(',')
    }\t${report.operationNames.length === 0 ? 'no registry' : report.operationNames.join(',')}`,
  )
  const failures = evaluateCompactSize(report)
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
