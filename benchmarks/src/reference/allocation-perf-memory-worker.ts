/**
 * P3A instrumented memory worker.
 *
 * Nothing in this process is timed. It forces collections, installs a GC
 * observer where the engine has one, and holds every output it produces, all
 * of which make it useless as a throughput baseline. That is deliberate: the
 * throughput lane lives in its own entry module so the two can never be
 * produced by one process.
 *
 * One session per process. GC state is not undoable inside a process, so a
 * second session in the same one would be measuring the first.
 */

import { PerformanceObserver } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { currentPerfEngine } from './perf-engine'
import {
  ALLOCATION_MEMORY_METRICS,
  GC_OBSERVER_FLUSH_MS,
  unsupported,
  type AllocationMetricId,
  type MetricValue,
} from './allocation-perf-contract'
import { ALLOCATION_TARGETS, CORPUS_ID, checksumOf } from './allocation-perf-corpus'

export const MEMORY_WORKER_ENTRY = 'allocation-perf-memory-worker.ts'
const SESSION_ENV = 'STOPCOCK_P3A_MEMORY_SESSION'
const REPEATS_ENV = 'STOPCOCK_P3A_MEMORY_REPEATS'

export interface MemoryRow {
  readonly targetId: string
  readonly sessionIndex: number
  readonly elements: number
  readonly repeats: number
  readonly checksum: string
  readonly metrics: Readonly<Record<AllocationMetricId, MetricValue>>
}

export interface MemoryWorkerResult {
  readonly corpusId: string
  readonly workerKind: 'memory'
  readonly entry: string
  readonly pid: number
  readonly engineId: string
  readonly sessionIndex: number
  readonly rows: readonly MemoryRow[]
}

/**
 * Bun's `process.memoryUsage().heapUsed` does not track live allocation on
 * JSC, so the two engines genuinely need different collection: `Bun.gc(true)`
 * returns the post-collection heap size, Node needs `--expose-gc` first.
 */
const retainedHeapBytes = (): number => {
  const bunGc = (globalThis as { Bun?: { gc?: (force: boolean) => number } }).Bun?.gc
  if (typeof bunGc === 'function') return bunGc(true)
  const nodeGc = (globalThis as { gc?: () => void }).gc
  if (typeof nodeGc !== 'function') {
    throw new Error('retained heap needs Bun.gc or node --expose-gc')
  }
  nodeGc()
  return process.memoryUsage().heapUsed
}

interface GcEntry {
  readonly duration: number
}

interface GcWindow {
  readonly count: MetricValue
  readonly pauseMs: MetricValue
}

const gcCollectionFor = (metric: AllocationMetricId): string | null => {
  const capability = ALLOCATION_MEMORY_METRICS.find((row) => row.metric === metric)
  if (capability === undefined) throw new Error(`unknown memory metric ${metric}`)
  return capability.collection[currentPerfEngine().id]
}

/**
 * Observes the collections the workload itself provoked. The forced collection
 * that closes a measurement is deliberately outside the window, otherwise
 * every row would report the instrumentation rather than the target.
 */
const openGcWindow = (): (() => Promise<GcWindow>) => {
  const declared = gcCollectionFor('gcCount')
  if (declared === null) {
    const reason = unsupported(`${currentPerfEngine().id} exposes no GC observation`)
    return async () => ({ count: reason, pauseMs: reason })
  }

  let count = 0
  let pauseMs = 0
  let observer: PerformanceObserver
  try {
    observer = new PerformanceObserver((list: { getEntries: () => readonly GcEntry[] }) => {
      for (const entry of list.getEntries()) {
        count++
        pauseMs += entry.duration
      }
    })
    observer.observe({ entryTypes: ['gc'] })
  } catch {
    const reason = unsupported('PerformanceObserver rejected entryType "gc"')
    return async () => ({ count: reason, pauseMs: reason })
  }

  return async () => {
    // V8 delivers gc entries on a later timer turn. A microtask or setImmediate
    // flush observes zero for a workload that plainly collected.
    await new Promise((done) => setTimeout(done, GC_OBSERVER_FLUSH_MS))
    observer.disconnect()
    return { count, pauseMs }
  }
}

/**
 * Typed-array backing stores are external to the V8 heap and internal to the
 * JSC one, so this is the metric that stops the two engines from disagreeing
 * silently about the typed-array family.
 */
const externalBufferBytes = (): MetricValue => {
  const declared = ALLOCATION_MEMORY_METRICS.find((row) => row.metric === 'externalBufferBytes')
    ?.collection[currentPerfEngine().id]
  if (declared === null || declared === undefined) {
    return unsupported(
      `${currentPerfEngine().id} reports no separate array-buffer accounting; backing stores are counted in retained heap`,
    )
  }
  return process.memoryUsage().arrayBuffers
}

const measureTarget = async (
  target: (typeof ALLOCATION_TARGETS)[number],
  sessionIndex: number,
  repeats: number,
): Promise<MemoryRow> => {
  // One discarded pass so the row measures steady-state retention rather than
  // first-call lazy initialisation inside the engine or the package.
  const warm = target.subject()
  const checksum = checksumOf(warm)

  const held = new Array<unknown>(repeats).fill(null)
  // The baseline collection is forced before the window opens, so a GC count
  // reports what the workload provoked rather than what the instrumentation did.
  const beforeHeap = retainedHeapBytes()
  const beforeExternal = externalBufferBytes()
  const closeGcWindow = openGcWindow()
  let peakRss = process.memoryUsage().rss

  for (let i = 0; i < repeats; i++) {
    held[i] = target.subject()
    if ((i & 7) === 7) {
      const rss = process.memoryUsage().rss
      if (rss > peakRss) peakRss = rss
    }
  }

  const gc = await closeGcWindow()
  const afterHeap = retainedHeapBytes()
  const afterExternal = externalBufferBytes()
  const rss = process.memoryUsage().rss
  if (rss > peakRss) peakRss = rss

  // Keep the outputs alive across both heap reads.
  if (held.length !== repeats) throw new Error('held outputs were released early')
  held.fill(null)

  return {
    targetId: target.id,
    sessionIndex,
    elements: target.elements,
    repeats,
    checksum,
    metrics: {
      retainedHeap: afterHeap - beforeHeap,
      peakRss,
      gcCount: gc.count,
      gcPauseMs: gc.pauseMs,
      externalBufferBytes:
        typeof beforeExternal === 'number' && typeof afterExternal === 'number'
          ? afterExternal - beforeExternal
          : beforeExternal,
    },
  }
}

export const runMemorySession = async (
  sessionIndex: number,
  repeats: number,
): Promise<MemoryWorkerResult> => {
  const rows: MemoryRow[] = []
  for (const target of ALLOCATION_TARGETS) {
    rows.push(await measureTarget(target, sessionIndex, repeats))
  }
  return {
    corpusId: CORPUS_ID,
    workerKind: 'memory',
    entry: MEMORY_WORKER_ENTRY,
    pid: process.pid,
    engineId: currentPerfEngine().id,
    sessionIndex,
    rows,
  }
}

const main = async (): Promise<void> => {
  const sessionIndex = Number(process.env[SESSION_ENV] ?? '0')
  const repeats = Number(process.env[REPEATS_ENV] ?? '8')
  console.log(JSON.stringify(await runMemorySession(sessionIndex, repeats)))
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) await main()
