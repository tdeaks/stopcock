/**
 * P3A allocation and memory evidence gate.
 *
 * Spawns the two workers in their own processes, folds their sessions into one
 * report, and refuses anything that would let a later allocation candidate
 * compare itself against evidence it did not actually produce: a substituted
 * row, a metric an engine cannot collect reported as a number, a lane produced
 * by the wrong kind of process, or a summary its own raw samples do not
 * support.
 *
 * P3A sets no memory threshold. What it emits is a per-family disposition, and
 * P3B may only touch a family whose disposition is `calibrated`.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { currentPerfEngine, type PerfEngine, type PerfEngineId } from './perf-engine'
import { INTERLEAVED_PAIRED_SAMPLER_ID, INTERLEAVED_PAIRED_SAMPLER_ORDER } from './perf-runner'
import { PERF_PROFILE_ENV } from './perf-profile-contract'
import { describeHost, relativeSpread, resolveProfile } from './perf-profile-gate'
import { computeSourceIdentity } from './s1c-baseline-gate'
import {
  ALLOCATION_CALIBRATION,
  ALLOCATION_FAMILIES,
  ALLOCATION_MEMORY_METRICS,
  ALLOCATION_REPORT_KIND,
  ALLOCATION_RUN_BUDGET,
  ALLOCATION_SCHEMA_VERSION,
  ALLOCATION_WORKERS,
  isUnsupported,
  unsupported,
  type AllocationDisposition,
  type AllocationFamilyId,
  type AllocationMetricId,
  type MetricValue,
  type WorkerKind,
} from './allocation-perf-contract'
import { ALLOCATION_TARGETS, CORPUS_ID } from './allocation-perf-corpus'
import { measureStartup, type StartupRow } from './allocation-perf-startup'
import type { MemoryWorkerResult } from './allocation-perf-memory-worker'
import type { ThroughputWorkerResult } from './allocation-perf-throughput-worker'

const localDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(localDirectory, '..', '..', '..')

export interface WorkerIdentity {
  readonly kind: WorkerKind
  readonly entry: string
  readonly gcInstrumented: boolean
  readonly forcedCollection: boolean
  /** One process id per session. Two lanes may never share one. */
  readonly pids: readonly number[]
}

export interface MetricSummary {
  readonly metric: AllocationMetricId
  readonly unit: 'bytes' | 'count' | 'milliseconds'
  readonly required: boolean
  /** How this engine collects the metric, or null where it cannot. */
  readonly collection: string | null
  readonly samples: readonly MetricValue[]
  readonly median: MetricValue
  readonly relativeSpread: MetricValue
}

export interface MemoryTargetSummary {
  readonly targetId: string
  readonly familyId: AllocationFamilyId
  readonly elements: number
  readonly repeats: number
  readonly reusesTarget: boolean
  readonly checksum: string
  readonly metrics: readonly MetricSummary[]
  /** Retained heap divided by the elements the held outputs represent. */
  readonly retainedHeapBytesPerElement: MetricValue
}

export interface ThroughputTargetSummary {
  readonly targetId: string
  readonly familyId: AllocationFamilyId
  readonly samplerId: string
  readonly samplerOrder: string
  readonly checksum: string
  readonly sessionMedianRatios: readonly number[]
  readonly medianRatio: number
  readonly relativeSpread: number
}

export interface DispositionRow {
  readonly familyId: AllocationFamilyId
  readonly ownerStage: string
  readonly disposition: AllocationDisposition
  readonly reason: string
}

export interface AllocationReport {
  readonly kind: string
  readonly schemaVersion: number
  readonly generatedAt: string
  readonly profileId: string
  readonly budget: 'quick' | 'release'
  readonly engine: PerfEngine
  readonly corpusId: string
  readonly sessions: number
  readonly sourceIdentity: string
  readonly workers: readonly WorkerIdentity[]
  readonly throughput: readonly ThroughputTargetSummary[]
  readonly memory: readonly MemoryTargetSummary[]
  readonly startup: StartupRow
  readonly dispositions: readonly DispositionRow[]
}

export interface AllocationExpectations {
  readonly engineId: PerfEngineId
  readonly profileId: string
  readonly sourceIdentity: string
}

const median = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((l, r) => l - r)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Folds a per-session metric series. One unsupported sample makes the whole
 * series unsupported: silently averaging the sessions that happened to work
 * would report a number the engine never produced.
 */
export const summarizeMetric = (
  metric: AllocationMetricId,
  samples: readonly MetricValue[],
): Pick<MetricSummary, 'median' | 'relativeSpread'> => {
  const reason = samples.find(isUnsupported)
  if (reason !== undefined) return { median: reason, relativeSpread: reason }
  if (samples.length === 0) {
    const missing = unsupported(`no samples for ${metric}`)
    return { median: missing, relativeSpread: missing }
  }
  const numbers = samples as readonly number[]
  return { median: median(numbers), relativeSpread: relativeSpread(numbers) }
}

/**
 * Returns null when a required metric is calibrated, or the reason it is not.
 * A byte metric sitting under the declared noise floor is judged on an
 * absolute band: at a few hundred bytes a relative spread is meaningless, and
 * the band is the tighter test there.
 */
const metricCalibration = (metric: MetricSummary): string | null => {
  if (isUnsupported(metric.median) || isUnsupported(metric.relativeSpread)) {
    return String(metric.median)
  }
  const floor = ALLOCATION_CALIBRATION.noiseFloorBytes
  if (metric.unit === 'bytes' && Math.abs(metric.median) <= floor) {
    const samples = metric.samples as readonly number[]
    const range = Math.max(...samples) - Math.min(...samples)
    return range <= floor
      ? null
      : `range ${Math.round(range)} B over the ${floor} B noise-floor band`
  }
  const limit = ALLOCATION_CALIBRATION.maxRelativeSpread
  return metric.relativeSpread <= limit
    ? null
    : `spread ${metric.relativeSpread.toFixed(3)} over ${limit}`
}

const calibrationOf = (
  sessions: number,
  throughput: readonly ThroughputTargetSummary[],
  memory: readonly MemoryTargetSummary[],
  familyId: AllocationFamilyId,
): DispositionRow => {
  const family = ALLOCATION_FAMILIES.find((candidate) => candidate.id === familyId)
  const ownerStage = family?.ownerStage ?? 'unknown'
  const limit = ALLOCATION_CALIBRATION.maxRelativeSpread

  if (sessions < ALLOCATION_CALIBRATION.requiredSessions) {
    return {
      familyId,
      ownerStage,
      disposition: 'uncalibrated',
      reason: `${sessions} sessions, below the required ${ALLOCATION_CALIBRATION.requiredSessions}`,
    }
  }

  const reasons: string[] = []
  for (const row of throughput.filter((candidate) => candidate.familyId === familyId)) {
    if (row.relativeSpread > limit) {
      reasons.push(
        `throughput ${row.targetId} spread ${row.relativeSpread.toFixed(3)} over ${limit}`,
      )
    }
  }
  for (const row of memory.filter((candidate) => candidate.familyId === familyId)) {
    for (const metric of row.metrics) {
      if (!metric.required) continue
      const verdict = metricCalibration(metric)
      if (verdict !== null) reasons.push(`memory ${row.targetId}/${metric.metric} ${verdict}`)
    }
  }

  return reasons.length === 0
    ? {
        familyId,
        ownerStage,
        disposition: 'calibrated',
        reason: `${sessions} sessions within ${limit} relative spread on every required metric`,
      }
    : { familyId, ownerStage, disposition: 'uncalibrated', reason: reasons.join('; ') }
}

export const computeDispositions = (
  sessions: number,
  throughput: readonly ThroughputTargetSummary[],
  memory: readonly MemoryTargetSummary[],
): DispositionRow[] =>
  ALLOCATION_FAMILIES.map((family) => calibrationOf(sessions, throughput, memory, family.id))

/**
 * Fail-closed report validation. Everything a tampered or mis-assembled report
 * could otherwise get away with is an explicit failure.
 */
export const evaluateAllocationReport = (
  report: AllocationReport,
  expected: AllocationExpectations,
): string[] => {
  const failures: string[] = []

  if (report.kind !== ALLOCATION_REPORT_KIND) failures.push(`unexpected report kind ${report.kind}`)
  if (report.schemaVersion !== ALLOCATION_SCHEMA_VERSION) {
    failures.push(`unexpected schema version ${report.schemaVersion}`)
  }
  if (report.corpusId !== CORPUS_ID) {
    failures.push(`report corpus ${report.corpusId} is not the frozen corpus ${CORPUS_ID}`)
  }
  if (report.engine.id !== expected.engineId) {
    failures.push(`report engine ${report.engine.id} does not match ${expected.engineId}`)
  }
  if (report.profileId !== expected.profileId) {
    failures.push(`report profile ${report.profileId} does not match ${expected.profileId}`)
  }
  if (report.sourceIdentity !== expected.sourceIdentity) {
    failures.push('source identity does not match the live tree')
  }
  const plannedSessions = ALLOCATION_RUN_BUDGET[report.budget]?.sessions
  if (plannedSessions === undefined) failures.push(`unknown budget ${report.budget}`)
  else if (report.sessions !== plannedSessions) {
    failures.push(`report claims ${report.sessions} sessions, budget plans ${plannedSessions}`)
  }

  const pidsByKind = new Map<WorkerKind, readonly number[]>()
  for (const contract of ALLOCATION_WORKERS) {
    const identity = report.workers.find((candidate) => candidate.kind === contract.kind)
    if (identity === undefined) {
      failures.push(`report omits the ${contract.kind} worker identity`)
      continue
    }
    pidsByKind.set(contract.kind, identity.pids)
    if (identity.entry !== contract.entry) {
      failures.push(`${contract.kind} lane was produced by ${identity.entry}`)
    }
    if (identity.gcInstrumented !== contract.gcInstrumented) {
      failures.push(`${contract.kind} lane reports the wrong GC instrumentation`)
    }
    if (identity.forcedCollection !== contract.forcedCollection) {
      failures.push(`${contract.kind} lane reports the wrong forced-collection status`)
    }
    if (identity.pids.length !== report.sessions) {
      failures.push(
        `${contract.kind} lane has ${identity.pids.length} processes for ${report.sessions} sessions`,
      )
    }
  }
  const throughputPids = new Set(pidsByKind.get('throughput') ?? [])
  for (const pid of pidsByKind.get('memory') ?? []) {
    if (throughputPids.has(pid)) {
      failures.push(`process ${pid} produced both a throughput and a memory row`)
    }
  }

  const corpusIds = new Set(ALLOCATION_TARGETS.map((target) => target.id))
  for (const [lane, ids] of [
    ['throughput', report.throughput.map((row) => row.targetId)],
    ['memory', report.memory.map((row) => row.targetId)],
  ] as const) {
    for (const id of corpusIds) {
      if (!ids.includes(id)) failures.push(`${lane} lane omits corpus target ${id}`)
    }
    for (const id of ids) {
      if (!corpusIds.has(id)) failures.push(`${lane} lane carries unknown target ${id}`)
    }
    if (new Set(ids).size !== ids.length) failures.push(`${lane} lane has duplicate target rows`)
  }

  for (const target of ALLOCATION_TARGETS) {
    const timing = report.throughput.find((row) => row.targetId === target.id)
    const memory = report.memory.find((row) => row.targetId === target.id)
    if (timing === undefined || memory === undefined) continue

    if (timing.checksum !== memory.checksum) {
      failures.push(
        `${target.id} checksums disagree across lanes (${timing.checksum} vs ${memory.checksum})`,
      )
    }
    if (timing.familyId !== target.familyId || memory.familyId !== target.familyId) {
      failures.push(`${target.id} is attributed to the wrong family`)
    }
    if (memory.elements !== target.elements) {
      failures.push(`${target.id} memory row claims ${memory.elements} elements`)
    }
    if (memory.reusesTarget !== target.reusesTarget) {
      failures.push(`${target.id} memory row misreports its writable-target status`)
    }

    if (timing.samplerId !== INTERLEAVED_PAIRED_SAMPLER_ID) {
      failures.push(`${target.id} used sampler ${timing.samplerId}`)
    }
    if (timing.samplerOrder !== INTERLEAVED_PAIRED_SAMPLER_ORDER) {
      failures.push(`${target.id} used orientation ${timing.samplerOrder}`)
    }
    if (timing.sessionMedianRatios.length !== report.sessions) {
      failures.push(`${target.id} throughput has ${timing.sessionMedianRatios.length} sessions`)
    } else if (timing.medianRatio !== median(timing.sessionMedianRatios)) {
      failures.push(`${target.id} throughput median does not reproduce from its sessions`)
    }

    for (const capability of ALLOCATION_MEMORY_METRICS) {
      const summary = memory.metrics.find((row) => row.metric === capability.metric)
      if (summary === undefined) {
        failures.push(`${target.id} omits memory metric ${capability.metric}`)
        continue
      }
      const declared = capability.collection[report.engine.id]
      if (summary.collection !== declared) {
        failures.push(
          `${target.id}/${capability.metric} claims a collection method the contract does not declare for ${report.engine.id}`,
        )
      }
      if (summary.unit !== capability.unit || summary.required !== capability.required) {
        failures.push(`${target.id}/${capability.metric} restates the metric contract`)
      }
      if (declared === null && !isUnsupported(summary.median)) {
        failures.push(
          `${target.id}/${capability.metric} reports a value on ${report.engine.id}, which cannot collect it`,
        )
      }
      if (declared !== null && capability.required && isUnsupported(summary.median)) {
        failures.push(
          `required metric ${capability.metric} is unavailable for ${target.id}: ${summary.median}`,
        )
      }
      if (summary.samples.length !== report.sessions && !isUnsupported(summary.median)) {
        failures.push(`${target.id}/${capability.metric} has ${summary.samples.length} samples`)
      }
      const recomputed = summarizeMetric(capability.metric, summary.samples)
      if (recomputed.median !== summary.median) {
        failures.push(
          `${target.id}/${capability.metric} median does not reproduce from its raw samples`,
        )
      }
      if (recomputed.relativeSpread !== summary.relativeSpread) {
        failures.push(
          `${target.id}/${capability.metric} dispersion does not reproduce from its raw samples`,
        )
      }
    }
  }

  const recomputedDispositions = computeDispositions(
    report.sessions,
    report.throughput,
    report.memory,
  )
  for (const expectedRow of recomputedDispositions) {
    const observed = report.dispositions.find((row) => row.familyId === expectedRow.familyId)
    if (observed === undefined) {
      failures.push(`report omits a disposition for ${expectedRow.familyId}`)
    } else if (observed.disposition !== expectedRow.disposition) {
      failures.push(
        `${expectedRow.familyId} claims ${observed.disposition} where its rows support ${expectedRow.disposition}`,
      )
    }
  }

  return failures
}

const workerArgv = (kind: WorkerKind, entry: string): string[] => {
  const path = join(localDirectory, entry)
  if (typeof process.versions.bun === 'string') return [path]
  // Only the memory worker is handed --expose-gc. The throughput worker cannot
  // force a collection because it is not given the ability to.
  return kind === 'memory' ? ['--expose-gc', '--import=tsx', path] : ['--import=tsx', path]
}

const runWorker = <Result>(kind: WorkerKind, entry: string, env: NodeJS.ProcessEnv): Result => {
  const child = spawnSync(process.execPath, workerArgv(kind, entry), {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  })
  if (child.status !== 0) throw new Error(`${kind} worker failed: ${child.stderr}`)
  return JSON.parse(child.stdout) as Result
}

const main = (): void => {
  const budget = process.argv.includes('--quick') ? 'quick' : 'release'
  const plan = ALLOCATION_RUN_BUDGET[budget]
  const host = describeHost()
  const resolution = resolveProfile(host, process.env[PERF_PROFILE_ENV])
  if (!resolution.ok || resolution.profile === undefined) {
    for (const failure of resolution.failures) console.error(`  - ${failure}`)
    process.exit(1)
  }

  const throughputSessions: ThroughputWorkerResult[] = []
  const memorySessions: MemoryWorkerResult[] = []
  for (let session = 0; session < plan.sessions; session++) {
    throughputSessions.push(
      runWorker<ThroughputWorkerResult>('throughput', 'allocation-perf-throughput-worker.ts', {
        STOPCOCK_P3A_THROUGHPUT_SESSION: String(session),
        STOPCOCK_P3A_THROUGHPUT_ROUNDS: String(plan.throughputRounds),
        STOPCOCK_P3A_THROUGHPUT_WARMUP: String(plan.warmupRounds),
      }),
    )
    memorySessions.push(
      runWorker<MemoryWorkerResult>('memory', 'allocation-perf-memory-worker.ts', {
        STOPCOCK_P3A_MEMORY_SESSION: String(session),
        STOPCOCK_P3A_MEMORY_REPEATS: String(plan.memoryRepeats),
      }),
    )
  }

  const engine = currentPerfEngine()
  const throughput: ThroughputTargetSummary[] = ALLOCATION_TARGETS.map((target) => {
    const rows = throughputSessions.map((session) => {
      const row = session.rows.find((candidate) => candidate.targetId === target.id)
      if (row === undefined) throw new Error(`throughput session omitted ${target.id}`)
      return row
    })
    const sessionMedianRatios = rows.map((row) => row.medianRatio)
    return {
      targetId: target.id,
      familyId: target.familyId,
      samplerId: rows[0].samplerId,
      samplerOrder: rows[0].samplerOrder,
      checksum: rows[0].checksum,
      sessionMedianRatios,
      medianRatio: median(sessionMedianRatios),
      relativeSpread: relativeSpread(sessionMedianRatios),
    }
  })

  const memory: MemoryTargetSummary[] = ALLOCATION_TARGETS.map((target) => {
    const rows = memorySessions.map((session) => {
      const row = session.rows.find((candidate) => candidate.targetId === target.id)
      if (row === undefined) throw new Error(`memory session omitted ${target.id}`)
      return row
    })
    const metrics: MetricSummary[] = ALLOCATION_MEMORY_METRICS.map((capability) => {
      const samples = rows.map((row) => row.metrics[capability.metric])
      return {
        metric: capability.metric,
        unit: capability.unit,
        required: capability.required,
        collection: capability.collection[engine.id],
        samples,
        ...summarizeMetric(capability.metric, samples),
      }
    })
    const retained = metrics.find((row) => row.metric === 'retainedHeap')?.median
    const held = rows[0].repeats * target.elements
    return {
      targetId: target.id,
      familyId: target.familyId,
      elements: target.elements,
      repeats: rows[0].repeats,
      reusesTarget: target.reusesTarget,
      checksum: rows[0].checksum,
      metrics,
      retainedHeapBytesPerElement:
        retained === undefined || isUnsupported(retained)
          ? unsupported('retained heap')
          : retained / held,
    }
  })

  const report: AllocationReport = {
    kind: ALLOCATION_REPORT_KIND,
    schemaVersion: ALLOCATION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    profileId: resolution.profile.id,
    budget,
    engine,
    corpusId: CORPUS_ID,
    sessions: plan.sessions,
    sourceIdentity: computeSourceIdentity(),
    workers: ALLOCATION_WORKERS.map((contract) => ({
      kind: contract.kind,
      entry: contract.entry,
      gcInstrumented: contract.gcInstrumented,
      forcedCollection: contract.forcedCollection,
      pids: (contract.kind === 'throughput' ? throughputSessions : memorySessions).map(
        (session) => session.pid,
      ),
    })),
    throughput,
    memory,
    startup: measureStartup(plan.startupSamples),
    dispositions: computeDispositions(plan.sessions, throughput, memory),
  }

  const failures = evaluateAllocationReport(report, {
    engineId: engine.id,
    profileId: report.profileId,
    sourceIdentity: report.sourceIdentity,
  })

  const outputDirectory = join(repositoryRoot, 'benchmarks', 'reports')
  mkdirSync(outputDirectory, { recursive: true })
  const path = join(outputDirectory, `p3a-allocation-${engine.id}-${budget}.json`)
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`allocation report: ${path}`)

  const show = (value: MetricValue): string =>
    isUnsupported(value) ? value : `${Math.round(value as number)}`
  for (const row of report.memory) {
    const metric = (id: AllocationMetricId): MetricValue =>
      row.metrics.find((candidate) => candidate.metric === id)?.median ??
      unsupported('metric missing')
    console.log(
      `memory\t${row.familyId}\t${row.targetId}\tretained ${show(metric('retainedHeap'))} B` +
        `\tper-element ${isUnsupported(row.retainedHeapBytesPerElement) ? row.retainedHeapBytesPerElement : (row.retainedHeapBytesPerElement as number).toFixed(2)} B` +
        `\texternal ${show(metric('externalBufferBytes'))} B` +
        `\tpeakRss ${show(metric('peakRss'))} B\tgcCount ${show(metric('gcCount'))}\tgcPauseMs ${show(metric('gcPauseMs'))}`,
    )
  }
  for (const row of report.throughput) {
    console.log(
      `throughput\t${row.familyId}\t${row.targetId}\tmedian ratio ${row.medianRatio.toFixed(3)}\tspread ${row.relativeSpread.toFixed(3)}`,
    )
  }
  console.log(
    `startup\t${report.startup.entryId}\timport ${show(report.startup.importNs)} ns\tretained ${show(report.startup.retainedHeapBytes)} B\tbundle ${show(report.startup.bundleBytes)} B`,
  )
  for (const row of report.dispositions) {
    console.log(
      `disposition\t${row.familyId}\t${row.disposition}\t${row.ownerStage}\t${row.reason}`,
    )
  }

  for (const failure of failures) console.error(`FAIL\t${failure}`)
  if (failures.length > 0) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) main()
