import { describe, expect, test } from 'vite-plus/test'
import {
  LANE_CASE_IDS,
  S7_LANE_BLOCKERS,
  S7_PERF_LANES,
  evaluateLaneReport,
  type LaneReport,
  type LaneRow,
  type PerfLane,
  type PerfLaneId,
} from './s7-optimized-sequential-lanes'
import { PIPE_DISPATCH_POLICIES, type PipeDispatchCaseId } from './pipe-dispatch-gate'

const POLICY = PIPE_DISPATCH_POLICIES['bun-jsc']

const row = (
  lane: PerfLaneId,
  id: PipeDispatchCaseId,
  overrides: Partial<LaneRow> = {},
): LaneRow => ({
  lane,
  case: id,
  blockedReason: null,
  correctnessOk: true,
  rounds: POLICY.minimumRounds,
  batchIterations: POLICY.minimumBatchIterations,
  medianRatio: 1.2,
  ciLow: 1.19,
  ciHigh: 1.21,
  relativeMarginOfError: 0.5,
  subjectNsPerOperation: 120,
  denominatorNsPerOperation: 144,
  ...overrides,
})

const blockedRow = (id: PipeDispatchCaseId): LaneRow =>
  row('optimized-fusion', id, {
    blockedReason: "f0 is not a function. (In 'f0(x)', 'f0' is undefined)",
    correctnessOk: false,
    rounds: 0,
    medianRatio: Number.NaN,
    ciLow: Number.NaN,
    ciHigh: Number.NaN,
    relativeMarginOfError: Number.NaN,
    subjectNsPerOperation: Number.NaN,
    denominatorNsPerOperation: Number.NaN,
  })

const isBlocked = (lane: PerfLaneId, id: PipeDispatchCaseId): boolean =>
  S7_LANE_BLOCKERS.some((blocker) => blocker.lane === lane && blocker.case === id)

const goodRows = (): LaneRow[] => {
  const rows: LaneRow[] = []
  for (const lane of S7_PERF_LANES) {
    if (lane.status !== 'active') continue
    for (const id of LANE_CASE_IDS) {
      rows.push(isBlocked(lane.id, id) ? blockedRow(id) : row(lane.id, id))
    }
  }
  return rows
}

const report = (overrides: Partial<LaneReport> = {}): LaneReport => ({
  generatedAt: '2026-07-25T12:00:00.000Z',
  engineId: 'bun-jsc',
  lanes: S7_PERF_LANES,
  rows: goodRows(),
  ...overrides,
})

describe('S7 performance lanes', () => {
  test('declares four distinguishable lanes and only compact is inactive', () => {
    expect(S7_PERF_LANES.map((lane) => lane.id)).toEqual([
      'sequential',
      'compact',
      'optimized-fusion',
      'compiler',
    ])
    const inactive = S7_PERF_LANES.filter((lane) => lane.status === 'inactive')
    expect(inactive.map((lane) => lane.id)).toEqual(['compact'])
    expect(inactive[0]?.inactiveReason).toMatch(/S9/u)
    expect(S7_PERF_LANES.find((lane) => lane.id === 'optimized-fusion')?.denominator).toContain(
      'pre-hot-identity-front-cache-v1',
    )
  })

  test('accepts a complete report', () => {
    expect(evaluateLaneReport(report())).toEqual([])
  })

  test('rejects a missing, duplicated, or undeclared lane', () => {
    const missing = evaluateLaneReport(
      report({ lanes: S7_PERF_LANES.filter((lane) => lane.id !== 'compact') }),
    )
    expect(missing).toContain('lane compact appears 0 times; expected once')

    const duplicated = evaluateLaneReport(report({ lanes: [...S7_PERF_LANES, S7_PERF_LANES[1]] }))
    expect(duplicated).toContain('lane compact appears 2 times; expected once')

    const undeclared: PerfLane = {
      id: 'tiered-mystery' as PerfLaneId,
      status: 'active',
      subject: 'x',
      denominator: 'y',
      floorOwner: 'z',
      description: 'w',
    }
    expect(evaluateLaneReport(report({ lanes: [...S7_PERF_LANES, undeclared] }))).toContain(
      'undeclared lane tiered-mystery',
    )
  })

  test('keeps the compact lane inactive rather than absent or faked', () => {
    const faked = evaluateLaneReport(
      report({ rows: [...goodRows(), row('compact', 'stable-2-step')] }),
    )
    expect(faked).toContain('inactive lane compact reported 1 rows')

    const promoted = evaluateLaneReport(
      report({
        lanes: S7_PERF_LANES.map((lane) =>
          lane.id === 'compact' ? { ...lane, status: 'active' as const } : lane,
        ),
      }),
    )
    expect(promoted).toContain('lane compact reports status active')

    const vagueReason = evaluateLaneReport(
      report({
        lanes: S7_PERF_LANES.map((lane) =>
          lane.id === 'compact' ? { ...lane, inactiveReason: 'later' } : lane,
        ),
      }),
    )
    expect(vagueReason).toContain('inactive lane compact does not name the stage that activates it')
  })

  test('applies the frozen baseline floors to the optimized lane only', () => {
    const belowFloor = evaluateLaneReport(
      report({
        rows: goodRows().map((candidate) =>
          candidate.lane === 'optimized-fusion' && candidate.case === 'stable-2-step'
            ? { ...candidate, medianRatio: 0.9 }
            : candidate,
        ),
      }),
    )
    expect(belowFloor).toContain('optimized-fusion/stable-2-step: ratio 0.900 is below 1.000')

    const belowGeomean = evaluateLaneReport(
      report({
        rows: goodRows().map((candidate) =>
          candidate.lane === 'optimized-fusion' ? { ...candidate, medianRatio: 0.5 } : candidate,
        ),
      }),
    )
    expect(
      belowGeomean.some((failure) => failure.startsWith('optimized-fusion geomean 0.500 is below')),
    ).toBe(true)

    const noisyOptimized = evaluateLaneReport(
      report({
        rows: goodRows().map((candidate) =>
          candidate.lane === 'optimized-fusion' && candidate.case === 'stable-6-step'
            ? { ...candidate, relativeMarginOfError: POLICY.maximumRme + 1 }
            : candidate,
        ),
      }),
    )
    expect(
      noisyOptimized.some((failure) => failure.startsWith('optimized-fusion/stable-6-step')),
    ).toBe(true)

    // The reported-only lanes carry neither the ratio floor nor the precision
    // limit that comes with it.
    expect(
      evaluateLaneReport(
        report({
          rows: goodRows().map((candidate) =>
            candidate.lane === 'compiler'
              ? { ...candidate, medianRatio: 0.18, relativeMarginOfError: 14 }
              : candidate,
          ),
        }),
      ),
    ).toEqual([])
  })

  test('rejects incorrect, short, and missing rows', () => {
    expect(
      evaluateLaneReport(
        report({
          rows: goodRows().map((candidate) =>
            candidate.lane === 'sequential' && candidate.case === 'fresh-2-step'
              ? { ...candidate, correctnessOk: false }
              : candidate,
          ),
        }),
      ),
    ).toContain('sequential/fresh-2-step: lane output differs from the sequential reference')

    expect(
      evaluateLaneReport(
        report({ rows: goodRows().filter((candidate) => candidate.case !== 'stable-6-step') }),
      ),
    ).toContain('lane sequential is missing case stable-6-step')

    expect(
      evaluateLaneReport(
        report({
          rows: goodRows().map((candidate) =>
            candidate.lane === 'compiler' && candidate.case === 'stable-2-step'
              ? { ...candidate, rounds: 4 }
              : candidate,
          ),
        }),
      ),
    ).toContain(`compiler/stable-2-step: used 4 rounds, minimum is ${POLICY.minimumRounds}`)
  })

  test('a blocked case must be declared, and a declared blocker must still block', () => {
    const undeclaredBlock = evaluateLaneReport(
      report({
        rows: goodRows().map((candidate) =>
          candidate.lane === 'sequential' && candidate.case === 'stable-2-step'
            ? { ...candidate, blockedReason: 'engine exploded' }
            : candidate,
        ),
      }),
    )
    expect(undeclaredBlock).toContain(
      'sequential/stable-2-step is blocked without a declaration: engine exploded',
    )

    const differentSymptom = evaluateLaneReport(
      report({
        rows: goodRows().map((candidate) =>
          candidate.lane === 'optimized-fusion' && candidate.case === 'fresh-2-step'
            ? { ...candidate, blockedReason: 'something else entirely' }
            : candidate,
        ),
      }),
    )
    expect(
      differentSymptom.some((failure) =>
        failure.startsWith('optimized-fusion/fresh-2-step is blocked by'),
      ),
    ).toBe(true)

    const resolved = evaluateLaneReport(
      report({
        rows: goodRows().map((candidate) =>
          candidate.lane === 'optimized-fusion' && candidate.case === 'fresh-3-step'
            ? row('optimized-fusion', 'fresh-3-step')
            : candidate,
        ),
      }),
    )
    expect(
      resolved.some(
        (failure) =>
          failure.includes('is declared blocked by') && failure.includes('remove the declaration'),
      ),
    ).toBe(true)
  })
})
