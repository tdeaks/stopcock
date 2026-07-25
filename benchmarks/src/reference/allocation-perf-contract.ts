/**
 * P3A allocation and memory evidence contract.
 *
 * S1C already froze the memory metric-capability matrix and a single
 * `allocation` lane over operator construction. That matrix is imported here
 * rather than restated: P3A widens the *corpus* (which target families are
 * observed) and the *process discipline* (throughput and memory never share a
 * process), not the definition of what a metric is or how an engine collects
 * it.
 *
 * Nothing here is a performance threshold. The only number that gates is the
 * calibration spread, which decides whether a family has a baseline stable
 * enough for P3B to be allowed to touch it at all.
 */

import type { PerfEngineId } from './perf-engine'
import { MEMORY_METRIC_CAPABILITIES } from './s1c-baseline-contract'

export const ALLOCATION_REPORT_KIND = 'stopcock-p3a-allocation'
export const ALLOCATION_SCHEMA_VERSION = 1 as const

export type AllocationFamilyId =
  | 'array-direct'
  | 'root-fusion'
  | 'compiled-pipeline'
  | 'iter-terminal'
  | 'typed-array'
  | 'collector-transducer'
  | 'writable-target'

export interface AllocationFamily {
  readonly id: AllocationFamilyId
  /** The stage that owns any P3B allocation change to this family. */
  readonly ownerStage: string
  readonly description: string
}

export const ALLOCATION_FAMILIES: readonly AllocationFamily[] = Object.freeze([
  Object.freeze({
    id: 'array-direct',
    ownerStage: 'P3B',
    description: 'Single data-first Array operations that each produce a fresh output.',
  }),
  Object.freeze({
    id: 'root-fusion',
    ownerStage: 'S10J',
    description: 'Current-root pipe() fusion over an array source.',
  }),
  Object.freeze({
    id: 'compiled-pipeline',
    ownerStage: 'P3B',
    description: 'compile() pipelines executed against an array source.',
  }),
  Object.freeze({
    id: 'iter-terminal',
    ownerStage: 'P1A/P1B',
    description: 'Iter pipelines drained through an array terminal.',
  }),
  Object.freeze({
    id: 'typed-array',
    ownerStage: 'P2',
    description: 'Typed-array operations that allocate a fresh typed output.',
  }),
  Object.freeze({
    id: 'collector-transducer',
    ownerStage: 'P3B',
    description: 'Collector and transducer terminals over an array source.',
  }),
  Object.freeze({
    id: 'writable-target',
    ownerStage: 'P3B',
    description:
      'Existing public *Into APIs writing into a caller-owned target. These are the reuse surface P3B is measured against, so they are baselined before any new strategy exists.',
  }),
])

export type WorkerKind = 'throughput' | 'memory'

export interface AllocationWorkerContract {
  readonly kind: WorkerKind
  /** Distinct entry module. Two lanes may never be produced by one process. */
  readonly entry: string
  readonly gcInstrumented: boolean
  readonly forcedCollection: boolean
  readonly description: string
}

export const ALLOCATION_WORKERS: readonly AllocationWorkerContract[] = Object.freeze([
  Object.freeze({
    kind: 'throughput',
    entry: 'allocation-perf-throughput-worker.ts',
    gcInstrumented: false,
    forcedCollection: false,
    description:
      'Bounded paired timing. No GC observer is installed and no collection is forced, because an instrumented process is not a baseline process.',
  }),
  Object.freeze({
    kind: 'memory',
    entry: 'allocation-perf-memory-worker.ts',
    gcInstrumented: true,
    forcedCollection: true,
    description: 'Instrumented retained heap, peak RSS and GC observation. Nothing here is timed.',
  }),
])

export type AllocationMetricId =
  | 'retainedHeap'
  | 'peakRss'
  | 'gcCount'
  | 'gcPauseMs'
  | 'externalBufferBytes'

/** Same shape as the S1C capability, widened to carry the P3A-local metric. */
export interface AllocationMetricCapability {
  readonly metric: AllocationMetricId
  readonly unit: 'bytes' | 'count' | 'milliseconds'
  readonly required: boolean
  readonly collection: Readonly<Record<PerfEngineId, string | null>>
}

/**
 * The S1C matrix plus one P3A-local metric.
 *
 * V8 keeps typed-array backing stores outside the heap `heapUsed` reports, so
 * on Node a 12.8 MB Float64Array corpus lands almost entirely in
 * `arrayBuffers` and `retainedHeap` reads near zero. JSC counts the same bytes
 * inside the heap size `Bun.gc(true)` returns. Recording the external bytes as
 * their own metric is what keeps the two engines honest about the typed-array
 * family instead of letting one engine's retained-heap row look like the
 * other's.
 */
export const ALLOCATION_MEMORY_METRICS: readonly AllocationMetricCapability[] = Object.freeze([
  ...MEMORY_METRIC_CAPABILITIES,
  Object.freeze({
    metric: 'externalBufferBytes' as const,
    unit: 'bytes' as const,
    required: false,
    collection: Object.freeze({
      'bun-jsc': null,
      'node-v8': 'process.memoryUsage().arrayBuffers, delta across the hold phase',
    }),
  }),
])

/**
 * V8 delivers `gc` performance entries on a later timer turn, not a
 * microtask: a `setImmediate` flush observes zero collections for a workload
 * that plainly caused them. A GC count is therefore the collections delivered
 * inside this window, and is a lower bound rather than a total.
 */
export const GC_OBSERVER_FLUSH_MS = 50

/**
 * A value an engine cannot collect. Encoded as this prefixed string so it can
 * never be confused with a measurement: a metric is a number or it says why it
 * is not, and zero is never an answer.
 */
export const UNSUPPORTED_PREFIX = 'unsupported:'
export type Unsupported = `unsupported:${string}`
export type MetricValue = number | Unsupported

export const unsupported = (reason: string): Unsupported => `${UNSUPPORTED_PREFIX}${reason}`
export const isUnsupported = (value: MetricValue): value is Unsupported =>
  typeof value === 'string' && value.startsWith(UNSUPPORTED_PREFIX)

export const ALLOCATION_RUN_BUDGET = Object.freeze({
  quick: Object.freeze({
    sessions: 1,
    memoryRepeats: 8,
    throughputRounds: 12,
    warmupRounds: 8,
    startupSamples: 3,
  }),
  release: Object.freeze({
    sessions: 3,
    memoryRepeats: 32,
    throughputRounds: 48,
    warmupRounds: 16,
    startupSamples: 7,
  }),
})

/**
 * Calibration, recorded before any target is observed so it cannot be tuned to
 * whatever a run produced. A family whose sessions disagree by more than this
 * has no usable baseline, and P3B stays out of it.
 */
export const ALLOCATION_CALIBRATION = Object.freeze({
  requiredSessions: 3,
  maxRelativeSpread: 0.15,
  /**
   * Below this magnitude a byte metric is at the collector's noise floor, and
   * a relative spread over it says nothing: a `*Into` target that retains a
   * few hundred bytes can swing to a negative delta simply because the forced
   * collection reclaimed more than the workload held. Such a row is calibrated
   * on an absolute band instead, which is the stricter test at that scale.
   * Recorded before any target was observed.
   */
  noiseFloorBytes: 65_536,
  recordedAtStage: 'P3A',
})

export type AllocationDisposition = 'calibrated' | 'uncalibrated' | 'deferred'

/** The single startup row every engine reports. */
export const STARTUP_ENTRY_ID = 'cold-import.fp-root'
