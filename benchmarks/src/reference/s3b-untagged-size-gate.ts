/**
 * S3B size evidence.
 *
 * Option and Result are non-fusible: no opcode exists for them and none ever
 * will. After S3B they use the independent untagged duals, so a consumer that
 * imports only those flows must not carry the opcode table at all. This gate
 * measures the shipped cost of each migrated flow and fails closed if the table
 * comes back.
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

export interface UntaggedSizeCase {
  readonly id: string
  readonly source: string
  /** Hard ceiling in bytes of terser-minified, gzip -9 output. */
  readonly maximumBytes: number
  /** Expected band, recorded so a surprise in either direction is visible. */
  readonly expectedBytes: readonly [number, number]
  /** Whether the bundle is allowed to retain the fusion opcode table. */
  readonly opcodeTableAllowed: boolean
  /**
   * `deferred` rows are measured and reported but do not fail S3B, because
   * meeting them needs a change S3B is not allowed to make. The reason names
   * the owning stage.
   */
  readonly enforcement: 'enforced' | { readonly deferredTo: string; readonly reason: string }
}

const KIB = 1024

export const S3B_SIZE_CASES: readonly UntaggedSizeCase[] = Object.freeze([
  Object.freeze({
    id: 'option.flow',
    source: `import { getOrElse, map, some } from '@stopcock/fp/option'
export const result = getOrElse(map(some(5), (value) => value * 3), () => -1)
`,
    maximumBytes: Math.round(0.9 * KIB),
    expectedBytes: [Math.round(0.25 * KIB), Math.round(0.45 * KIB)] as const,
    opcodeTableAllowed: false,
    enforcement: 'enforced',
  }),
  Object.freeze({
    id: 'result.flow',
    source: `import { getOrElse, map, ok } from '@stopcock/fp/result'
export const result = getOrElse(map(ok(5), (value) => value * 3), () => -1)
`,
    maximumBytes: Math.round(0.9 * KIB),
    expectedBytes: [Math.round(0.3 * KIB), Math.round(0.55 * KIB)] as const,
    opcodeTableAllowed: false,
    enforcement: 'enforced',
  }),
  Object.freeze({
    id: 'string.trim',
    source: `import { trim } from '@stopcock/fp/string'
export const result = trim('  padded  ')
`,
    maximumBytes: Math.round(0.7 * KIB),
    expectedBytes: [0, Math.round(0.7 * KIB)] as const,
    // The fixed-numeric unary path preserves the public tag and private
    // provenance without retaining the generic dual or the whole opcode table.
    opcodeTableAllowed: false,
    enforcement: 'enforced',
  }),
  Object.freeze({
    id: 'object.pick',
    source: `import { pick } from '@stopcock/fp/object'
export const result = pick({ a: 1, b: 2 }, ['a'])
`,
    maximumBytes: Math.round(0.7 * KIB),
    expectedBytes: [0, Math.round(0.7 * KIB)] as const,
    opcodeTableAllowed: false,
    enforcement: 'enforced',
  }),
])

/** A distinctive opcode-table key. Its presence means the table survived. */
export const OPCODE_TABLE_MARKER = 'filterMap'

export interface UntaggedSizeRow {
  readonly id: string
  readonly minifiedBytes: number
  readonly gzipBytes: number
  readonly retainsOpcodeTable: boolean
}

export const measureUntaggedSizes = async (
  cases: readonly UntaggedSizeCase[] = S3B_SIZE_CASES,
): Promise<UntaggedSizeRow[]> => {
  // Inside node_modules so bare specifiers resolve exactly the way a consumer
  // of the workspace package would resolve them.
  const directory = mkdtempSync(join(benchmarksRoot, 'node_modules', '.stopcock-s3b-'))
  try {
    const rows: UntaggedSizeRow[] = []
    for (const testCase of cases) {
      const entry = join(directory, `${testCase.id}.js`)
      writeFileSync(entry, testCase.source)
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
        id: testCase.id,
        minifiedBytes: Buffer.byteLength(output),
        gzipBytes: gzipSync(Buffer.from(output), { level: 9 }).byteLength,
        // The marker survives mangling because it is a property key on the
        // opcode table, not a local binding.
        retainsOpcodeTable: code.includes(OPCODE_TABLE_MARKER),
      })
    }
    return rows
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export const evaluateUntaggedSizes = (
  rows: readonly UntaggedSizeRow[],
  cases: readonly UntaggedSizeCase[] = S3B_SIZE_CASES,
): string[] => {
  const failures: string[] = []
  for (const testCase of cases) {
    const row = rows.find((candidate) => candidate.id === testCase.id)
    if (row === undefined) {
      failures.push(`missing size row for ${testCase.id}`)
      continue
    }
    if (testCase.enforcement !== 'enforced') continue
    if (row.gzipBytes > testCase.maximumBytes) {
      failures.push(
        `${testCase.id} is ${row.gzipBytes} B, over its ${testCase.maximumBytes} B ceiling`,
      )
    }
    if (!testCase.opcodeTableAllowed && row.retainsOpcodeTable) {
      failures.push(`${testCase.id} still retains the opcode table`)
    }
  }
  return failures
}

const main = async (): Promise<void> => {
  const rows = await measureUntaggedSizes()
  for (const row of rows) {
    const testCase = S3B_SIZE_CASES.find((candidate) => candidate.id === row.id)
    console.log(
      [
        row.id,
        `${row.gzipBytes} B gzip`,
        `${row.minifiedBytes} B min`,
        `ceiling ${testCase?.maximumBytes} B`,
        `expected ${testCase?.expectedBytes.join('-')} B`,
        row.retainsOpcodeTable ? 'opcode table retained' : 'no opcode table',
        testCase?.enforcement === 'enforced'
          ? 'enforced'
          : `deferred to ${testCase?.enforcement.deferredTo}`,
      ].join('\t'),
    )
  }
  const failures = evaluateUntaggedSizes(rows)
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
