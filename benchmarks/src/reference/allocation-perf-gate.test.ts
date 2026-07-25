import { describe, expect, test } from 'vite-plus/test'
import { INTERLEAVED_PAIRED_SAMPLER_ID, INTERLEAVED_PAIRED_SAMPLER_ORDER } from './perf-runner'
import {
  ALLOCATION_MEMORY_METRICS,
  ALLOCATION_REPORT_KIND,
  ALLOCATION_RUN_BUDGET,
  ALLOCATION_SCHEMA_VERSION,
  ALLOCATION_WORKERS,
  isUnsupported,
  unsupported,
} from './allocation-perf-contract'
import { ALLOCATION_TARGETS, CORPUS_ID } from './allocation-perf-corpus'
import {
  computeDispositions,
  evaluateAllocationReport,
  summarizeMetric,
  type AllocationExpectations,
  type AllocationReport,
  type MemoryTargetSummary,
  type MetricSummary,
  type ThroughputTargetSummary,
} from './allocation-perf-gate'

const SESSIONS = ALLOCATION_RUN_BUDGET.release.sessions
const REPEATS = ALLOCATION_RUN_BUDGET.release.memoryRepeats

const EXPECTED: AllocationExpectations = {
  engineId: 'node-v8',
  profileId: 'local-macos-arm64',
  sourceIdentity: 'sha256:source',
}

const checksumOfTarget = (id: string): string => `checksum-${id}`

/** Stable per-session values, so every summary reproduces from its samples. */
const sampleFor = (metric: string, base: number): number[] =>
  Array.from({ length: SESSIONS }, (_, session) => base + session * (metric === 'gcCount' ? 0 : 1))

const metricSummary = (metric: string): MetricSummary => {
  const capability = ALLOCATION_MEMORY_METRICS.find((row) => row.metric === metric)
  if (capability === undefined) throw new Error(`unknown metric ${metric}`)
  const collection = capability.collection[EXPECTED.engineId]
  const samples =
    collection === null
      ? Array.from({ length: SESSIONS }, () => unsupported('engine cannot collect'))
      : sampleFor(metric, capability.unit === 'bytes' ? 1_000_000 : 4)
  return {
    metric: capability.metric,
    unit: capability.unit,
    required: capability.required,
    collection,
    samples,
    ...summarizeMetric(capability.metric, samples),
  }
}

const memoryRow = (target: (typeof ALLOCATION_TARGETS)[number]): MemoryTargetSummary => {
  const metrics = ALLOCATION_MEMORY_METRICS.map((capability) => metricSummary(capability.metric))
  const retained = metrics.find((row) => row.metric === 'retainedHeap')?.median as number
  return {
    targetId: target.id,
    familyId: target.familyId,
    elements: target.elements,
    repeats: REPEATS,
    reusesTarget: target.reusesTarget,
    checksum: checksumOfTarget(target.id),
    metrics,
    retainedHeapBytesPerElement: retained / (REPEATS * target.elements),
  }
}

const throughputRow = (target: (typeof ALLOCATION_TARGETS)[number]): ThroughputTargetSummary => ({
  targetId: target.id,
  familyId: target.familyId,
  samplerId: INTERLEAVED_PAIRED_SAMPLER_ID,
  samplerOrder: INTERLEAVED_PAIRED_SAMPLER_ORDER,
  checksum: checksumOfTarget(target.id),
  sessionMedianRatios: [1.0, 1.01, 1.02],
  medianRatio: 1.01,
  relativeSpread: 0.02,
})

const reportOf = (): AllocationReport => {
  const throughput = ALLOCATION_TARGETS.map(throughputRow)
  const memory = ALLOCATION_TARGETS.map(memoryRow)
  return {
    kind: ALLOCATION_REPORT_KIND,
    schemaVersion: ALLOCATION_SCHEMA_VERSION,
    generatedAt: '2026-07-25T00:00:00.000Z',
    profileId: EXPECTED.profileId,
    budget: 'release',
    engine: {
      id: 'node-v8',
      name: 'Node/V8',
      runtime: 'node',
      runtimeVersion: '24.18.0',
      platform: 'darwin',
      architecture: 'arm64',
    },
    corpusId: CORPUS_ID,
    sessions: SESSIONS,
    sourceIdentity: EXPECTED.sourceIdentity,
    workers: ALLOCATION_WORKERS.map((contract, index) => ({
      kind: contract.kind,
      entry: contract.entry,
      gcInstrumented: contract.gcInstrumented,
      forcedCollection: contract.forcedCollection,
      pids: Array.from({ length: SESSIONS }, (_, session) => 1000 + index * 100 + session),
    })),
    throughput,
    memory,
    startup: {
      entryId: 'cold-import.fp-root',
      collection: 'test fixture',
      bundleBytes: 222_786,
      importNs: 2_400_000,
      retainedHeapBytes: 4_000_000,
      samples: 7,
    },
    dispositions: computeDispositions(SESSIONS, throughput, memory),
  }
}

const evaluate = (mutate: (report: AllocationReport) => AllocationReport): string[] =>
  evaluateAllocationReport(mutate(reportOf()), EXPECTED)

describe('P3A allocation report', () => {
  test('a well-formed report passes', () => {
    expect(evaluate((report) => report)).toEqual([])
  })

  test('every corpus family gets a disposition', () => {
    const report = reportOf()
    expect(report.dispositions.map((row) => row.familyId).sort()).toEqual(
      [...new Set(ALLOCATION_TARGETS.map((target) => target.familyId))].sort(),
    )
  })

  test('an unsupported optional metric is explicit rather than absent or zero', () => {
    const report = reportOf()
    const row = report.memory[0].metrics.find((metric) => metric.metric === 'gcCount')
    expect(row).toBeDefined()
    // node-v8 can collect this one, so the fixture carries a number; the bun
    // shape is the one that must never be silently zero.
    expect(row?.collection).not.toBeNull()
    const bunStyle = unsupported('bun-jsc exposes no GC observation')
    expect(isUnsupported(bunStyle)).toBe(true)
    expect(bunStyle).not.toBe(0)
  })

  test('a lane produced by the wrong entry is rejected', () => {
    const failures = evaluate((report) => ({
      ...report,
      workers: report.workers.map((worker) =>
        worker.kind === 'memory' ? { ...worker, entry: 'allocation-perf-gate.ts' } : worker,
      ),
    }))
    expect(failures).toContain('memory lane was produced by allocation-perf-gate.ts')
  })

  test('one process producing both lanes is rejected', () => {
    const shared = 4242
    const failures = evaluate((report) => ({
      ...report,
      workers: report.workers.map((worker) => ({
        ...worker,
        pids: [shared, ...worker.pids.slice(1)],
      })),
    }))
    expect(failures).toContain(`process ${shared} produced both a throughput and a memory row`)
  })

  test('a throughput lane claiming forced collection is rejected', () => {
    const failures = evaluate((report) => ({
      ...report,
      workers: report.workers.map((worker) =>
        worker.kind === 'throughput' ? { ...worker, forcedCollection: true } : worker,
      ),
    }))
    expect(failures).toContain('throughput lane reports the wrong forced-collection status')
  })

  test('checksums that disagree across lanes are rejected', () => {
    const target = ALLOCATION_TARGETS[0]
    const failures = evaluate((report) => ({
      ...report,
      memory: report.memory.map((row) =>
        row.targetId === target.id ? { ...row, checksum: 'checksum-tampered' } : row,
      ),
    }))
    expect(failures.some((failure) => failure.includes('checksums disagree across lanes'))).toBe(
      true,
    )
  })

  test('a missing corpus target fails closed', () => {
    const dropped = ALLOCATION_TARGETS[2].id
    const failures = evaluate((report) => ({
      ...report,
      memory: report.memory.filter((row) => row.targetId !== dropped),
    }))
    expect(failures).toContain(`memory lane omits corpus target ${dropped}`)
  })

  test('a target outside the frozen corpus is rejected', () => {
    const failures = evaluate((report) => ({
      ...report,
      throughput: [...report.throughput, { ...report.throughput[0], targetId: 'array.invented' }],
    }))
    expect(failures).toContain('throughput lane carries unknown target array.invented')
  })

  test('a summary its own samples do not support is rejected', () => {
    const failures = evaluate((report) => ({
      ...report,
      memory: report.memory.map((row, index) =>
        index === 0
          ? {
              ...row,
              metrics: row.metrics.map((metric) =>
                metric.metric === 'retainedHeap' ? { ...metric, median: 1 } : metric,
              ),
            }
          : row,
      ),
    }))
    expect(
      failures.some((failure) =>
        failure.includes('median does not reproduce from its raw samples'),
      ),
    ).toBe(true)
  })

  test('a throughput median its sessions do not support is rejected', () => {
    const failures = evaluate((report) => ({
      ...report,
      throughput: report.throughput.map((row, index) =>
        index === 0 ? { ...row, medianRatio: 0.5 } : row,
      ),
    }))
    expect(
      failures.some((failure) =>
        failure.includes('throughput median does not reproduce from its sessions'),
      ),
    ).toBe(true)
  })

  test('a foreign sampler is rejected', () => {
    const failures = evaluate((report) => ({
      ...report,
      throughput: report.throughput.map((row, index) =>
        index === 0 ? { ...row, samplerId: 'hand-rolled' } : row,
      ),
    }))
    expect(failures.some((failure) => failure.includes('used sampler hand-rolled'))).toBe(true)
  })

  test('a metric the engine cannot collect may not carry a number', () => {
    const failures = evaluateAllocationReport(
      {
        ...reportOf(),
        engine: {
          id: 'bun-jsc',
          name: 'Bun/JavaScriptCore',
          runtime: 'bun',
          runtimeVersion: '1.3.14',
          platform: 'darwin',
          architecture: 'arm64',
        },
      },
      { ...EXPECTED, engineId: 'bun-jsc' },
    )
    expect(
      failures.some((failure) =>
        failure.includes('reports a value on bun-jsc, which cannot collect it'),
      ),
    ).toBe(true)
  })

  test('a required metric reported as unsupported fails closed', () => {
    const failures = evaluate((report) => ({
      ...report,
      memory: report.memory.map((row, index) => {
        if (index !== 0) return row
        const samples = Array.from({ length: SESSIONS }, () => unsupported('collector missing'))
        return {
          ...row,
          metrics: row.metrics.map((metric) =>
            metric.metric === 'retainedHeap'
              ? { ...metric, samples, ...summarizeMetric('retainedHeap', samples) }
              : metric,
          ),
        }
      }),
    }))
    expect(
      failures.some((failure) => failure.includes('required metric retainedHeap is unavailable')),
    ).toBe(true)
  })

  test('a disposition its rows do not support is rejected', () => {
    const failures = evaluate((report) => ({
      ...report,
      sessions: 1,
      workers: report.workers.map((worker) => ({ ...worker, pids: worker.pids.slice(0, 1) })),
      dispositions: report.dispositions.map((row) => ({
        ...row,
        disposition: 'calibrated' as const,
      })),
    }))
    expect(
      failures.some((failure) => failure.includes('claims calibrated where its rows support')),
    ).toBe(true)
  })

  test('a corpus other than the frozen one is rejected', () => {
    const failures = evaluate((report) => ({ ...report, corpusId: 'some-other-corpus' }))
    expect(failures).toContain(
      `report corpus some-other-corpus is not the frozen corpus ${CORPUS_ID}`,
    )
  })

  test('a source identity that does not match the live tree is rejected', () => {
    const failures = evaluate((report) => ({ ...report, sourceIdentity: 'sha256:elsewhere' }))
    expect(failures).toContain('source identity does not match the live tree')
  })
})
