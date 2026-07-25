/**
 * S1C frozen baseline contract.
 *
 * Every later hot-path candidate is measured against these rows, so the shape
 * of a baseline manifest, the lanes it must contain, and the identities it is
 * bound to are declared here rather than derived from whatever a run happened
 * to produce. A lane that does not exist yet is declared inactive instead of
 * omitted: S6/S7/S8/S9 activate those rows without replacing the frozen
 * current-root denominator.
 */

export const S1C_BASELINE_KIND = 'stopcock-s1c-baseline'
export const S1C_BASELINE_SCHEMA_VERSION = 1 as const

export type BaselineLaneKind = 'timing' | 'startup' | 'allocation'
export type BaselineLaneStatus = 'frozen' | 'inactive'

export interface BaselineLane {
  readonly id: string
  readonly kind: BaselineLaneKind
  readonly status: BaselineLaneStatus
  /** Why an inactive lane has no rows, and which stage activates it. */
  readonly inactiveReason?: string
  readonly description: string
}

export const S1C_LANES: readonly BaselineLane[] = Object.freeze([
  Object.freeze({
    id: 'direct',
    kind: 'timing',
    status: 'frozen',
    description: 'Single data-first Array operations against a hand-written sequential reference.',
  }),
  Object.freeze({
    id: 'root-fused',
    kind: 'timing',
    status: 'frozen',
    description: 'Current-root pipe() fusion against a hand-written sequential reference.',
  }),
  Object.freeze({
    id: 'compiler',
    kind: 'timing',
    status: 'frozen',
    description: 'compile() construction and execution against a hand-written reference.',
  }),
  Object.freeze({
    id: 'iter',
    kind: 'timing',
    status: 'frozen',
    description: 'Iter pipelines over an array source against a hand-written loop.',
  }),
  Object.freeze({
    id: 'typed-array',
    kind: 'timing',
    status: 'frozen',
    description: 'Typed-array operations against a hand-written typed-array loop.',
  }),
  Object.freeze({
    id: 'startup',
    kind: 'startup',
    status: 'frozen',
    description: 'Cold import cost of the built package entries in a fresh process.',
  }),
  Object.freeze({
    id: 'allocation',
    kind: 'allocation',
    status: 'frozen',
    description: 'Retained heap after constructing a bounded number of operators.',
  }),
  Object.freeze({
    id: 'compact-fusion',
    kind: 'timing',
    status: 'inactive',
    inactiveReason: 'No compact fusion facade exists before S9.',
    description: 'Compact fusion runner rows.',
  }),
  Object.freeze({
    id: 'optimized-fusion',
    kind: 'timing',
    status: 'inactive',
    inactiveReason: 'No optimized fusion runner exists before S10.',
    description: 'Optimized fusion runner rows.',
  }),
])

/**
 * Pre-approved compact size-first floor. Recorded before any compact
 * implementation is observed so S9 cannot tune it after the fact.
 */
export const COMPACT_SIZE_FIRST_FLOOR = Object.freeze({
  geomean: 0.75,
  perRow: 0.6,
  recordedAtStage: 'S1C',
})

/** Hot-path floors every later candidate row is judged against. */
export const HOT_PATH_FLOORS = Object.freeze({
  geomean: 0.97,
  perRow: 0.9,
  noRegression: 1.0,
})

/**
 * Memory metrics, keyed by what an engine can actually report. A metric an
 * engine cannot collect is represented as `null` in a manifest, never as a
 * zero, and never quietly dropped.
 */
export interface MemoryMetricCapability {
  readonly metric: 'retainedHeap' | 'peakRss' | 'gcCount' | 'gcPauseMs'
  readonly unit: 'bytes' | 'count' | 'milliseconds'
  readonly required: boolean
  /** How the value is collected on each engine, or null where unsupported. */
  readonly collection: Readonly<Record<'bun-jsc' | 'node-v8', string | null>>
}

export const MEMORY_METRIC_CAPABILITIES: readonly MemoryMetricCapability[] = Object.freeze([
  Object.freeze({
    metric: 'retainedHeap',
    unit: 'bytes',
    required: true,
    collection: Object.freeze({
      'bun-jsc': 'Bun.gc(true) return value; heapUsed does not track live allocation on JSC',
      'node-v8': 'global.gc() under --expose-gc then process.memoryUsage().heapUsed',
    }),
  }),
  Object.freeze({
    metric: 'peakRss',
    unit: 'bytes',
    required: true,
    collection: Object.freeze({
      'bun-jsc': 'process.memoryUsage().rss',
      'node-v8': 'process.memoryUsage().rss',
    }),
  }),
  Object.freeze({
    metric: 'gcCount',
    unit: 'count',
    required: false,
    collection: Object.freeze({
      'bun-jsc': null,
      'node-v8': 'PerformanceObserver on entryType "gc"',
    }),
  }),
  Object.freeze({
    metric: 'gcPauseMs',
    unit: 'milliseconds',
    required: false,
    collection: Object.freeze({
      'bun-jsc': null,
      'node-v8': 'PerformanceObserver on entryType "gc", summed durations',
    }),
  }),
])

/** Bounded run budget. A baseline session may not silently grow. */
export const S1C_RUN_BUDGET = Object.freeze({
  quick: Object.freeze({ sessions: 1, rounds: 8, workers: 1, retries: 0, wallClockMs: 120_000 }),
  release: Object.freeze({
    sessions: 3,
    rounds: 128,
    workers: 1,
    retries: 0,
    wallClockMs: 900_000,
  }),
})

/** Frozen package-contract facts no later size slice may weaken for a win. */
export const S1C_PACKAGE_CONTRACT = Object.freeze({
  package: '@stopcock/fp',
  sideEffects: false,
})
