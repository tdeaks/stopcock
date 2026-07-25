import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { PerformanceObserver } from 'node:perf_hooks'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from '../../../packages/fp/src/compile'
import * as A from '../../../packages/fp/src/array'
import * as Iter from '../../../packages/fp/src/iter'
import * as TA from '../../../packages/fp/src/typed-array'
import { pipe } from '../../../packages/fp/src/internal/fusion-engine'
import { currentPerfEngine } from './perf-engine'
import {
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
  runInterleavedPaired,
} from './perf-runner'
import { describeHost, resolveProfile } from './perf-profile-gate'
import { PERF_PROFILE_ENV } from './perf-profile-contract'
import {
  MEMORY_METRIC_CAPABILITIES,
  S1C_BASELINE_KIND,
  S1C_BASELINE_SCHEMA_VERSION,
  S1C_LANES,
  S1C_PACKAGE_CONTRACT,
  S1C_RUN_BUDGET,
} from './s1c-baseline-contract'
import {
  computeDistIdentity,
  computePackedIdentity,
  computeSourceIdentity,
  median,
  validateBaselineManifest,
  type BaselineLaneReport,
  type BaselineManifest,
  type MemoryCapabilityObservation,
  type ScalarRow,
  type TimingRow,
} from './s1c-baseline-gate'

const localDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(localDirectory, '..', '..', '..')

const SIZE = 100_000
const input = Array.from({ length: SIZE }, (_, i) => i % 1000)
const typedInput = Float64Array.from(input)

const double = (x: number) => x * 2
const isEven = (x: number) => (x & 1) === 0

interface TimingCase {
  readonly laneId: string
  readonly caseId: string
  readonly subject: () => unknown
  /** Hand-written sequential reference for the same result. */
  readonly reference: () => unknown
}

const compiledPipeline = compile(A.map(double), A.filter(isEven))

const TIMING_CASES: readonly TimingCase[] = [
  {
    laneId: 'direct',
    caseId: 'array.map',
    subject: () => A.map(input, double),
    reference: () => {
      const out = new Array<number>(input.length)
      for (let i = 0; i < input.length; i++) out[i] = input[i] * 2
      return out
    },
  },
  {
    laneId: 'direct',
    caseId: 'array.filter',
    subject: () => A.filter(input, isEven),
    reference: () => {
      const out: number[] = []
      for (let i = 0; i < input.length; i++) if ((input[i] & 1) === 0) out.push(input[i])
      return out
    },
  },
  {
    laneId: 'root-fused',
    caseId: 'pipe.map-filter',
    subject: () => pipe(input, A.map(double), A.filter(isEven)),
    reference: () => {
      const out: number[] = []
      for (let i = 0; i < input.length; i++) {
        const value = input[i] * 2
        if ((value & 1) === 0) out.push(value)
      }
      return out
    },
  },
  {
    laneId: 'compiler',
    caseId: 'compile.map-filter',
    subject: () => compiledPipeline(input),
    reference: () => {
      const out: number[] = []
      for (let i = 0; i < input.length; i++) {
        const value = input[i] * 2
        if ((value & 1) === 0) out.push(value)
      }
      return out
    },
  },
  {
    laneId: 'iter',
    caseId: 'iter.map-filter-toArray',
    subject: () => Iter.toArray(Iter.filter(Iter.map(Iter.from(input), double), isEven)),
    reference: () => {
      const out: number[] = []
      for (let i = 0; i < input.length; i++) {
        const value = input[i] * 2
        if ((value & 1) === 0) out.push(value)
      }
      return out
    },
  },
  {
    laneId: 'typed-array',
    caseId: 'typed-array.map',
    subject: () => TA.map(typedInput, double),
    reference: () => {
      const out = new Float64Array(typedInput.length)
      for (let i = 0; i < typedInput.length; i++) out[i] = typedInput[i] * 2
      return out
    },
  },
]

const timingRow = (testCase: TimingCase, sessionIndex: number, rounds: number): TimingRow => {
  const run = runInterleavedPaired(testCase.subject, testCase.reference, {
    rounds,
    batchIterations: 4,
    microBatchIterations: 1,
    warmupRounds: 16,
  })
  return {
    caseId: testCase.caseId,
    sessionIndex,
    samplerId: INTERLEAVED_PAIRED_SAMPLER_ID,
    samplerOrder: INTERLEAVED_PAIRED_SAMPLER_ORDER,
    subjectSamplesNs: run.aSamples,
    referenceSamplesNs: run.bSamples,
    pairedRatios: run.pairedRatios,
    medianRatio: median(run.pairedRatios),
  }
}

/** Cold import cost of the built entry, one fresh process per sample. */
const startupRow = (sessionIndex: number, samples: number): ScalarRow => {
  const entry = join(repositoryRoot, 'packages', 'fp', 'dist', 'index.js')
  const script = `const t=process.hrtime.bigint();await import(${JSON.stringify(entry)});console.log(String(process.hrtime.bigint()-t))`
  const observed: number[] = []
  for (let i = 0; i < samples; i++) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    })
    if (child.status !== 0) throw new Error(`startup sample failed: ${child.stderr}`)
    observed.push(Number(child.stdout.trim()))
  }
  return {
    caseId: 'cold-import.fp-root',
    sessionIndex,
    samples: observed,
    median: median(observed),
    unit: 'nanoseconds',
  }
}

/**
 * Retained heap after a forced collection. Bun's
 * `process.memoryUsage().heapUsed` does not track live allocation, so the
 * engines genuinely need different collection methods here; the capability
 * matrix records which.
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

/** Retained heap after constructing a bounded number of operators. */
const allocationRow = (sessionIndex: number, samples: number): ScalarRow => {
  const observed: number[] = []
  for (let i = 0; i < samples; i++) {
    const before = retainedHeapBytes()
    const retained: unknown[] = []
    for (let op = 0; op < 10_000; op++) retained.push(A.map((x: number) => x + op))
    observed.push(retainedHeapBytes() - before)
    retained.length = 0
  }
  return {
    caseId: 'operator-construction.10k',
    sessionIndex,
    samples: observed,
    median: median(observed),
    unit: 'bytes',
  }
}

/**
 * Capability probes only. Nothing here times throughput: an instrumented
 * process is not a baseline process.
 */
export const observeMemoryCapabilities = (): MemoryCapabilityObservation[] => {
  const bunGc = (globalThis as { Bun?: { gc?: unknown } }).Bun?.gc
  const nodeGc = (globalThis as { gc?: unknown }).gc
  const forcedGc = typeof bunGc === 'function' || typeof nodeGc === 'function'
  let gcObserverWorks = false
  try {
    const observer = new PerformanceObserver(() => {})
    observer.observe({ entryTypes: ['gc'] })
    observer.disconnect()
    gcObserverWorks = true
  } catch {
    gcObserverWorks = false
  }

  return MEMORY_METRIC_CAPABILITIES.map((capability) => {
    switch (capability.metric) {
      case 'retainedHeap':
        return {
          metric: capability.metric,
          supported: forcedGc,
          detail: forcedGc
            ? 'forced collection available'
            : 'no forced collection (run node with --expose-gc)',
        }
      case 'peakRss':
        return {
          metric: capability.metric,
          supported: typeof process.memoryUsage === 'function',
          detail: 'process.memoryUsage().rss',
        }
      default:
        return {
          metric: capability.metric,
          supported: capability.collection[currentPerfEngine().id] !== null && gcObserverWorks,
          detail: gcObserverWorks
            ? 'PerformanceObserver accepts entryType "gc"'
            : 'PerformanceObserver rejects entryType "gc"',
        }
    }
  })
}

const main = (): void => {
  const budget = process.argv.includes('--quick') ? 'quick' : 'release'
  const plan = S1C_RUN_BUDGET[budget]
  const host = describeHost()
  const resolution = resolveProfile(host, process.env[PERF_PROFILE_ENV])
  if (!resolution.ok || resolution.profile === undefined) {
    for (const failure of resolution.failures) console.error(`  - ${failure}`)
    process.exit(1)
  }

  const lanes: BaselineLaneReport[] = S1C_LANES.map((lane) => {
    if (lane.status === 'inactive') {
      return { laneId: lane.id, status: lane.status, timingRows: [], scalarRows: [] }
    }
    const timingRows: TimingRow[] = []
    const scalarRows: ScalarRow[] = []
    for (let session = 0; session < plan.sessions; session++) {
      if (lane.kind === 'timing') {
        for (const testCase of TIMING_CASES.filter((candidate) => candidate.laneId === lane.id)) {
          timingRows.push(timingRow(testCase, session, plan.rounds))
        }
      } else if (lane.kind === 'startup') {
        scalarRows.push(startupRow(session, Math.max(5, plan.rounds >> 2)))
      } else {
        scalarRows.push(allocationRow(session, Math.max(5, plan.rounds >> 2)))
      }
    }
    return { laneId: lane.id, status: lane.status, timingRows, scalarRows }
  })

  const manifest: BaselineManifest = {
    kind: S1C_BASELINE_KIND,
    schemaVersion: S1C_BASELINE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    profileId: resolution.profile.id,
    budget,
    engine: currentPerfEngine(),
    workerId: `${host.runtime}-${host.runtimeVersion}-${process.pid}`,
    identity: {
      source: computeSourceIdentity(),
      dist: computeDistIdentity(),
      packed: computePackedIdentity(),
    },
    lanes,
    memoryCapabilities: observeMemoryCapabilities(),
    packageContract: { ...S1C_PACKAGE_CONTRACT },
  }

  const failures = validateBaselineManifest(manifest, {
    identity: manifest.identity,
    engineId: manifest.engine.id,
    profileId: manifest.profileId,
  })

  const outputDirectory = join(repositoryRoot, 'benchmarks', 'reports')
  mkdirSync(outputDirectory, { recursive: true })
  const path = join(outputDirectory, `s1c-baseline-${manifest.engine.id}-${budget}.json`)
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`baseline manifest: ${path}`)
  for (const lane of lanes) {
    for (const row of lane.timingRows) {
      if (row.sessionIndex !== 0) continue
      console.log(`${lane.laneId}\t${row.caseId}\tmedian ratio ${row.medianRatio.toFixed(3)}`)
    }
    for (const row of lane.scalarRows) {
      if (row.sessionIndex !== 0) continue
      console.log(`${lane.laneId}\t${row.caseId}\tmedian ${row.median} ${row.unit}`)
    }
  }
  for (const failure of failures) console.error(`FAIL\t${failure}`)
  if (failures.length > 0) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) main()
