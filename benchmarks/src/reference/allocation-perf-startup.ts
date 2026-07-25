/**
 * P3A startup lane.
 *
 * Cold import cost and post-import retained heap, one fresh process per
 * sample. The repository does not always carry a built `packages/fp/dist`, so
 * the entry is bundled from source with esbuild instead of measured against
 * shipped bytes. The collection method is recorded alongside every number for
 * that reason: this is source-entry startup, and it is not interchangeable
 * with a dist-entry measurement.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { STARTUP_ENTRY_ID, unsupported, type MetricValue } from './allocation-perf-contract'

const localDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(localDirectory, '..', '..', '..')

export const STARTUP_COLLECTION =
  'esbuild-bundled packages/fp/src/index.ts imported in a fresh process; retained heap via Bun.gc(true) or --expose-gc + heapUsed'

export interface StartupRow {
  readonly entryId: string
  readonly collection: string
  readonly bundleBytes: MetricValue
  readonly importNs: MetricValue
  readonly retainedHeapBytes: MetricValue
  readonly samples: number
}

const median = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((l, r) => l - r)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const childScript = (entry: string): string =>
  `const t=process.hrtime.bigint();await import(${JSON.stringify(entry)});const ns=Number(process.hrtime.bigint()-t);` +
  `const bunGc=globalThis.Bun&&globalThis.Bun.gc;let heap=null;` +
  `if(typeof bunGc==='function')heap=bunGc(true);` +
  `else if(typeof globalThis.gc==='function'){globalThis.gc();heap=process.memoryUsage().heapUsed}` +
  `console.log(JSON.stringify({ns,heap}))`

const childArgv = (entry: string): string[] =>
  typeof process.versions.bun === 'string'
    ? ['-e', childScript(entry)]
    : ['--expose-gc', '--input-type=module', '-e', childScript(entry)]

export const measureStartup = (samples: number): StartupRow => {
  const failed = (reason: string): StartupRow => ({
    entryId: STARTUP_ENTRY_ID,
    collection: STARTUP_COLLECTION,
    bundleBytes: unsupported(reason),
    importNs: unsupported(reason),
    retainedHeapBytes: unsupported(reason),
    samples: 0,
  })

  const workspace = mkdtempSync(join(tmpdir(), 'stopcock-p3a-startup-'))
  try {
    const outfile = join(workspace, 'fp-entry.mjs')
    const built = buildSync({
      entryPoints: [join(repositoryRoot, 'packages', 'fp', 'src', 'index.ts')],
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      outfile,
      metafile: true,
      logLevel: 'silent',
    })
    const bundleBytes = built.metafile.outputs[Object.keys(built.metafile.outputs)[0]]?.bytes
    if (bundleBytes === undefined) return failed('esbuild produced no metafile output')

    const importNs: number[] = []
    const heaps: number[] = []
    for (let i = 0; i < samples; i++) {
      const child = spawnSync(process.execPath, childArgv(outfile), { encoding: 'utf8' })
      if (child.status !== 0) return failed(`startup child failed: ${child.stderr.trim()}`)
      const observed = JSON.parse(child.stdout) as { ns: number; heap: number | null }
      importNs.push(observed.ns)
      if (observed.heap !== null) heaps.push(observed.heap)
    }

    return {
      entryId: STARTUP_ENTRY_ID,
      collection: STARTUP_COLLECTION,
      bundleBytes,
      importNs: median(importNs),
      retainedHeapBytes:
        heaps.length === samples
          ? median(heaps)
          : unsupported('no forced collection in the startup child'),
      samples,
    }
  } catch (error) {
    return failed(`startup bundle failed: ${(error as Error).message}`)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}
