import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vite-plus/test'
import { INTERLEAVED_PAIRED_SAMPLER_ID, INTERLEAVED_PAIRED_SAMPLER_ORDER } from './perf-runner'
import {
  computeSourceIdentity,
  validateBaselineManifest,
  type BaselineExpectations,
  type BaselineManifest,
  type TimingRow,
} from './s1c-baseline-gate'
import {
  COMPACT_SIZE_FIRST_FLOOR,
  MEMORY_METRIC_CAPABILITIES,
  S1C_BASELINE_KIND,
  S1C_BASELINE_SCHEMA_VERSION,
  S1C_LANES,
  S1C_PACKAGE_CONTRACT,
  S1C_RUN_BUDGET,
} from './s1c-baseline-contract'

const EXPECTED: BaselineExpectations = {
  identity: { source: 'sha256:source', dist: 'sha256:dist', packed: 'sha256:packed' },
  engineId: 'bun-jsc',
  profileId: 'local-macos-arm64',
}

const timingRow = (caseId: string, sessionIndex: number): TimingRow => {
  const subjectSamplesNs = [100, 102, 98, 101]
  const referenceSamplesNs = [100, 100, 100, 100]
  const pairedRatios = subjectSamplesNs.map((subject, i) => referenceSamplesNs[i] / subject)
  const sorted = [...pairedRatios].sort((l, r) => l - r)
  return {
    caseId,
    sessionIndex,
    samplerId: INTERLEAVED_PAIRED_SAMPLER_ID,
    samplerOrder: INTERLEAVED_PAIRED_SAMPLER_ORDER,
    subjectSamplesNs,
    referenceSamplesNs,
    pairedRatios,
    medianRatio: (sorted[1] + sorted[2]) / 2,
  }
}

const manifestOf = (budget: 'quick' | 'release' = 'quick'): BaselineManifest => ({
  kind: S1C_BASELINE_KIND,
  schemaVersion: S1C_BASELINE_SCHEMA_VERSION,
  generatedAt: '2026-07-25T00:00:00.000Z',
  profileId: EXPECTED.profileId,
  budget,
  engine: {
    id: 'bun-jsc',
    name: 'Bun/JavaScriptCore',
    runtime: 'bun',
    runtimeVersion: '1.3.14',
    platform: 'darwin',
    architecture: 'arm64',
  },
  workerId: 'bun-1.3.14-1',
  identity: EXPECTED.identity,
  lanes: S1C_LANES.map((lane) => {
    if (lane.status === 'inactive') {
      return { laneId: lane.id, status: lane.status, timingRows: [], scalarRows: [] }
    }
    const sessions = Array.from({ length: S1C_RUN_BUDGET[budget].sessions }, (_, i) => i)
    if (lane.kind === 'timing') {
      return {
        laneId: lane.id,
        status: lane.status,
        timingRows: sessions.map((session) => timingRow(`${lane.id}.case`, session)),
        scalarRows: [],
      }
    }
    return {
      laneId: lane.id,
      status: lane.status,
      timingRows: [],
      scalarRows: sessions.map((session) => ({
        caseId: `${lane.id}.case`,
        sessionIndex: session,
        samples: [10, 12, 11],
        median: 11,
        unit: lane.kind === 'startup' ? ('nanoseconds' as const) : ('bytes' as const),
      })),
    }
  }),
  memoryCapabilities: MEMORY_METRIC_CAPABILITIES.map((capability) => ({
    metric: capability.metric,
    supported: capability.collection['bun-jsc'] !== null,
    detail: 'test',
  })),
  packageContract: { ...S1C_PACKAGE_CONTRACT },
})

const failuresFor = (mutate: (manifest: BaselineManifest) => BaselineManifest): readonly string[] =>
  validateBaselineManifest(mutate(manifestOf()), EXPECTED)

describe('baseline manifest validation', () => {
  test('accepts a complete manifest', () => {
    expect(validateBaselineManifest(manifestOf(), EXPECTED)).toEqual([])
    expect(validateBaselineManifest(manifestOf('release'), EXPECTED)).toEqual([])
  })

  test.each([
    ['kind', (m: BaselineManifest) => ({ ...m, kind: 'something-else' })],
    ['schema version', (m: BaselineManifest) => ({ ...m, schemaVersion: 99 })],
    ['profile', (m: BaselineManifest) => ({ ...m, profileId: 'perf-linux-x64' })],
    ['worker identity', (m: BaselineManifest) => ({ ...m, workerId: '' })],
    [
      'engine',
      (m: BaselineManifest) => ({ ...m, engine: { ...m.engine, id: 'node-v8' as const } }),
    ],
    [
      'source identity',
      (m: BaselineManifest) => ({ ...m, identity: { ...m.identity, source: 'sha256:other' } }),
    ],
    [
      'dist identity',
      (m: BaselineManifest) => ({ ...m, identity: { ...m.identity, dist: 'sha256:other' } }),
    ],
    [
      'packed identity',
      (m: BaselineManifest) => ({ ...m, identity: { ...m.identity, packed: 'sha256:other' } }),
    ],
    [
      'weakened sideEffects',
      (m: BaselineManifest) => ({
        ...m,
        packageContract: { ...m.packageContract, sideEffects: true },
      }),
    ],
  ])('rejects a wrong %s', (_label, mutate) => {
    expect(failuresFor(mutate).length).toBeGreaterThan(0)
  })

  test('rejects a release manifest without a packed identity', () => {
    const manifest = manifestOf('release')
    const failures = validateBaselineManifest(
      { ...manifest, identity: { ...manifest.identity, packed: null } },
      { ...EXPECTED, identity: { ...EXPECTED.identity, packed: null } },
    )
    expect(failures.some((failure) => failure.includes('release manifest requires'))).toBe(true)
  })

  test('rejects an omitted lane', () => {
    expect(
      failuresFor((m) => ({ ...m, lanes: m.lanes.filter((lane) => lane.laneId !== 'iter') })),
    ).toContain('manifest omits lane iter')
  })

  test('rejects rows on an inactive lane', () => {
    const failures = failuresFor((m) => ({
      ...m,
      lanes: m.lanes.map((lane) =>
        lane.laneId === 'compact-fusion' ? { ...lane, timingRows: [timingRow('sneaky', 0)] } : lane,
      ),
    }))
    expect(failures.some((failure) => failure.includes('inactive lane compact-fusion'))).toBe(true)
  })

  test('rejects a frozen lane with no rows', () => {
    const failures = failuresFor((m) => ({
      ...m,
      lanes: m.lanes.map((lane) => (lane.laneId === 'direct' ? { ...lane, timingRows: [] } : lane)),
    }))
    expect(failures.some((failure) => failure.includes('carries no rows'))).toBe(true)
  })

  test('rejects a duplicate row', () => {
    const failures = failuresFor((m) => ({
      ...m,
      lanes: m.lanes.map((lane) =>
        lane.laneId === 'direct'
          ? { ...lane, timingRows: [...lane.timingRows, timingRow('direct.case', 0)] }
          : lane,
      ),
    }))
    expect(failures.some((failure) => failure.startsWith('duplicate row'))).toBe(true)
  })

  test.each([
    ['sampler', { samplerId: 'other-sampler' }],
    ['orientation', { samplerOrder: 'A,A,A,A' }],
  ] as const)('rejects a foreign %s', (_label, patch) => {
    const failures = failuresFor((m) => ({
      ...m,
      lanes: m.lanes.map((lane) =>
        lane.laneId === 'direct'
          ? { ...lane, timingRows: lane.timingRows.map((row) => ({ ...row, ...patch })) }
          : lane,
      ),
    }))
    expect(failures.length).toBeGreaterThan(0)
  })

  test('rejects statistics that do not reproduce from raw samples', () => {
    const failures = failuresFor((m) => ({
      ...m,
      lanes: m.lanes.map((lane) =>
        lane.laneId === 'direct'
          ? { ...lane, timingRows: lane.timingRows.map((row) => ({ ...row, medianRatio: 42 })) }
          : lane,
      ),
    }))
    expect(failures.some((failure) => failure.includes('median does not reproduce'))).toBe(true)
  })

  test('rejects unpaired raw samples', () => {
    const failures = failuresFor((m) => ({
      ...m,
      lanes: m.lanes.map((lane) =>
        lane.laneId === 'direct'
          ? {
              ...lane,
              timingRows: lane.timingRows.map((row) => ({
                ...row,
                referenceSamplesNs: row.referenceSamplesNs.slice(1),
              })),
            }
          : lane,
      ),
    }))
    expect(failures.some((failure) => failure.includes('unpaired raw samples'))).toBe(true)
  })

  test('rejects too few sessions for the budget', () => {
    const manifest = manifestOf('release')
    const trimmed = {
      ...manifest,
      lanes: manifest.lanes.map((lane) => ({
        ...lane,
        timingRows: lane.timingRows.slice(0, 1),
        scalarRows: lane.scalarRows.slice(0, 1),
      })),
    }
    const failures = validateBaselineManifest(trimmed, EXPECTED)
    expect(failures.some((failure) => failure.includes('sessions, below'))).toBe(true)
  })

  test.each([
    [
      'an omitted memory metric',
      (m: BaselineManifest) => ({
        ...m,
        memoryCapabilities: m.memoryCapabilities.filter((row) => row.metric !== 'retainedHeap'),
      }),
    ],
    [
      'an unavailable required metric',
      (m: BaselineManifest) => ({
        ...m,
        memoryCapabilities: m.memoryCapabilities.map((row) =>
          row.metric === 'retainedHeap' ? { ...row, supported: false } : row,
        ),
      }),
    ],
    [
      'a metric claimed on an engine that cannot collect it',
      (m: BaselineManifest) => ({
        ...m,
        memoryCapabilities: m.memoryCapabilities.map((row) =>
          row.metric === 'gcCount' ? { ...row, supported: true } : row,
        ),
      }),
    ],
  ])('rejects %s', (_label, mutate) => {
    expect(failuresFor(mutate).length).toBeGreaterThan(0)
  })
})

describe('frozen contract', () => {
  test('the compact size-first floor is recorded before any compact implementation', () => {
    expect(COMPACT_SIZE_FIRST_FLOOR).toEqual({
      geomean: 0.75,
      perRow: 0.6,
      recordedAtStage: 'S1C',
    })
  })

  test('the candidate source identity is computable', () => {
    expect(computeSourceIdentity()).toMatch(/^sha256:[a-f0-9]{64}$/u)
  })
})

describe('checked-in baselines', () => {
  const reports = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'reports')

  // Identity is taken from the manifest itself: a frozen baseline records the
  // tree it was measured on, and later stages re-measure rather than silently
  // reusing it against a different tree.
  test.each(['bun-jsc', 'node-v8'] as const)('%s release manifest is complete', (engineId) => {
    const manifest = JSON.parse(
      readFileSync(join(reports, `s1c-baseline-${engineId}-release.json`), 'utf8'),
    ) as BaselineManifest
    expect(manifest.budget).toBe('release')
    expect(
      validateBaselineManifest(manifest, {
        identity: manifest.identity,
        engineId,
        profileId: manifest.profileId,
      }),
    ).toEqual([])
  })
})
