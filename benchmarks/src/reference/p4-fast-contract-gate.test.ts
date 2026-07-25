import { describe, expect, test } from 'vite-plus/test'
import {
  evaluateP4,
  MAXIMUM_NATIVE_MAP_OVERHEAD,
  MINIMUM_COMPILED_PATH_IMPROVEMENT,
  MINIMUM_PLAIN_WRITE_SPEEDUP,
  P4_CANDIDATE_IDS,
  P4_DEFERRALS,
  P4_DISPOSITIONS,
  P4_ROW_IDS,
  type P4CandidateId,
  type P4Row,
} from './p4-fast-contract-gate'

const rowOf = (id: string, candidate: P4CandidateId, meetsBar: boolean): P4Row => ({
  id,
  candidate,
  subjectNs: meetsBar ? 10 : 200,
  referenceNs: 100,
  normalized: meetsBar ? 0.1 : 2,
  gated: true,
  meetsBar,
})

const rowsFor = (meetsBar: boolean): P4Row[] =>
  P4_CANDIDATE_IDS.map((candidate) => rowOf(`${candidate}/row`, candidate, meetsBar))

describe('P4 optional candidates', () => {
  test('every candidate has a recorded decision and reason', () => {
    expect(evaluateP4(rowsFor(true))).toEqual([])
    expect([...P4_DISPOSITIONS.map((row) => row.id)].sort()).toEqual([...P4_CANDIDATE_IDS].sort())
    expect(P4_DISPOSITIONS.every((row) => row.reason.length > 0)).toBe(true)
  })

  test('three candidates shipped and the Record candidate stopped', () => {
    const decisions = new Map(P4_DISPOSITIONS.map((row) => [row.id, row.decision]))
    expect(decisions.get('compiled-path')).toBe('shipped')
    expect(decisions.get('plain-data-write')).toBe('shipped')
    expect(decisions.get('map-get-or-else')).toBe('shipped')
    expect(decisions.get('record-narrow-path')).toBe('stopped')
  })

  test('rejects a missing disposition', () => {
    expect(
      evaluateP4(
        rowsFor(true),
        P4_DISPOSITIONS.filter((row) => row.id !== 'compiled-path'),
      ),
    ).toContain('candidate compiled-path has no recorded disposition')
  })

  test('rejects shipping a candidate whose gated row missed', () => {
    const failures = evaluateP4(rowsFor(false))
    expect(failures).toContain('compiled-path/row is 2.000 of its reference, over its bar')
    expect(failures).toContain('plain-data-write/row is 2.000 of its reference, over its bar')
    // The stopped candidate is not judged against a bar it never claimed.
    expect(failures.some((failure) => failure.startsWith('record-narrow-path'))).toBe(false)
  })

  test('rejects shipping a candidate with no gated row at all', () => {
    expect(evaluateP4([])).toContain('candidate compiled-path is shipped with no gated row')
  })

  test('a deferral excuses its row only with an owner and a measured reason', () => {
    const deferred = [{ rowId: 'compiled-path/row', owner: 'S4', reason: 'measured elsewhere' }]
    const failures = evaluateP4(rowsFor(false), P4_DISPOSITIONS, deferred)
    expect(failures.some((failure) => failure.startsWith('compiled-path/row'))).toBe(false)

    expect(
      evaluateP4(rowsFor(true), P4_DISPOSITIONS, [
        { rowId: 'compiled-path/row', owner: '', reason: '' },
      ]),
    ).toContain('deferral for compiled-path/row has no owner or no reason')
  })

  test('every deferral names a row the gate actually measures', () => {
    for (const deferral of P4_DEFERRALS) {
      expect(P4_ROW_IDS).toContain(deferral.rowId)
      expect(deferral.owner.length).toBeGreaterThan(0)
      expect(deferral.reason.length).toBeGreaterThan(0)
    }
  })

  test('keeps the published bars', () => {
    expect(MINIMUM_COMPILED_PATH_IMPROVEMENT).toBe(0.15)
    expect(MINIMUM_PLAIN_WRITE_SPEEDUP).toBe(1.25)
    expect(MAXIMUM_NATIVE_MAP_OVERHEAD).toBe(0.1)
  })
})
