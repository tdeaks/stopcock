import { describe, expect, test } from 'vite-plus/test'
import {
  COMPETITOR_CASES,
  COMPETITOR_FLOOR,
  evaluateCompetitors,
  type CompetitorRow,
} from './competitor-floor-gate'

const rowsAt = (ratio: number): CompetitorRow[] =>
  COMPETITOR_CASES.map((testCase) => ({
    id: testCase.id,
    competitor: testCase.competitor,
    ratio,
  }))

describe('competitor cliff floor', () => {
  test('passes when nothing has fallen off a cliff', () => {
    expect(evaluateCompetitors(rowsAt(1))).toEqual([])
  })

  test('catches a collapse like the one flow had', () => {
    // flow measured 0.06x lodash for the whole programme with every internal
    // gate green. This is the check that would have said so.
    const failures = evaluateCompetitors(rowsAt(0.06))
    expect(failures.some((failure) => failure.includes('flow/compose'))).toBe(true)
  })

  test('tolerates known deficits in the 0.5 to 0.8 band', () => {
    expect(evaluateCompetitors(rowsAt(0.6))).toEqual([])
  })

  test('reports a missing row rather than skipping it', () => {
    // Including the reported-only rows: a comparison silently disappearing is
    // exactly the failure this gate exists to catch.
    expect(evaluateCompetitors([])).toHaveLength(COMPETITOR_CASES.length)
  })

  test('does not enforce a row whose measurement is disputed', () => {
    const disputed = COMPETITOR_CASES.filter((testCase) => testCase.reportedOnly !== undefined)
    expect(disputed.length).toBeGreaterThan(0)
    for (const testCase of disputed) expect(testCase.reportedOnly).toBeTruthy()
    const failures = evaluateCompetitors(rowsAt(0.01))
    for (const testCase of disputed) {
      expect(failures.some((failure) => failure.startsWith(testCase.id))).toBe(false)
    }
  })

  test('keeps the floor where it is', () => {
    expect(COMPETITOR_FLOOR).toBe(0.5)
  })
})
