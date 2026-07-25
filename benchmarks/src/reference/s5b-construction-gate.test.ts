import { describe, expect, test } from 'vite-plus/test'
import {
  evaluateDispositions,
  MINIMUM_CONSTRUCTION_IMPROVEMENT,
  S5B_CANDIDATES,
  S5B_DISPOSITIONS,
  type CandidateRow,
} from './s5b-construction-gate'

const rowOf = (id: string, qualifies: boolean): CandidateRow => ({
  id,
  repeatNs: 30,
  freshNs: 30,
  cachedRepeatNs: qualifies ? 6 : 30,
  cachedFreshNs: qualifies ? 32 : 60,
  improvement: qualifies ? 0.8 : 0,
  churnCost: qualifies ? 0.07 : 1,
  netNs: qualifies ? 22 : -30,
  qualifies,
})

describe('S5B optional candidates', () => {
  test('every candidate has a recorded decision and reason', () => {
    expect(evaluateDispositions(S5B_CANDIDATES.map((c) => rowOf(c.id, true)))).toEqual([])
    expect(S5B_DISPOSITIONS.map((row) => row.id).sort()).toEqual(
      S5B_CANDIDATES.map((row) => row.id).sort(),
    )
  })

  test('all seven optional caches are stopped, not silently dropped', () => {
    expect(S5B_DISPOSITIONS.every((row) => row.decision === 'stopped')).toBe(true)
    expect(S5B_DISPOSITIONS.every((row) => row.reason.length > 0)).toBe(true)
  })

  test('rejects a missing disposition', () => {
    const failures = evaluateDispositions(
      S5B_CANDIDATES.map((c) => rowOf(c.id, true)),
      S5B_DISPOSITIONS.filter((row) => row.id !== 'filter'),
    )
    expect(failures).toContain('candidate filter has no recorded disposition')
  })

  test('rejects enabling a candidate that did not qualify', () => {
    const failures = evaluateDispositions(
      S5B_CANDIDATES.map((c) => rowOf(c.id, false)),
      S5B_DISPOSITIONS.map((row) =>
        row.id === 'filter' ? { ...row, decision: 'enabled' as const } : row,
      ),
    )
    expect(failures).toContain('candidate filter is enabled without qualifying')
  })

  test('keeps the 5% construction bar', () => {
    expect(MINIMUM_CONSTRUCTION_IMPROVEMENT).toBe(0.05)
  })
})
