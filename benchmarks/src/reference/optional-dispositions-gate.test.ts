import { describe, expect, test } from 'vite-plus/test'
import {
  EXPECTED_OWNER_SLICES,
  evaluateDispositions,
  loadDispositions,
  type DispositionCandidate,
  type DispositionManifest,
} from './optional-dispositions-gate'

const candidate = (over: Partial<DispositionCandidate> = {}): DispositionCandidate => ({
  candidateId: 'x/y',
  ownerSlice: 'P4',
  status: 'stopped',
  surface: 'internal',
  reason: 'measured and lost against the shipped implementation',
  ...over,
})

const manifestOf = (candidates: readonly DispositionCandidate[]): DispositionManifest => ({
  protocol: 'stopcock.fp-v2-optional-dispositions',
  protocolVersion: 1,
  candidates: [
    ...EXPECTED_OWNER_SLICES.map((slice) => candidate({ candidateId: `seed/${slice}`, ownerSlice: slice })),
    ...candidates,
  ],
})

describe('optional disposition policy', () => {
  test('accepts a complete manifest', () => {
    expect(evaluateDispositions(manifestOf([]))).toEqual([])
  })

  test('rejects an unresolved candidate', () => {
    const failures = evaluateDispositions(
      manifestOf([candidate({ candidateId: 'a/b', status: 'unresolved' })]),
    )
    expect(failures.some((failure) => failure.includes('is unresolved'))).toBe(true)
  })

  test('rejects a stop with no recorded reason', () => {
    const failures = evaluateDispositions(
      manifestOf([candidate({ candidateId: 'a/b', reason: 'no' })]),
    )
    expect(failures).toContain('a/b is stopped without a recorded reason')
  })

  test('rejects a ship with no recorded evidence', () => {
    const failures = evaluateDispositions(
      manifestOf([candidate({ candidateId: 'a/b', status: 'shipped', evidence: undefined })]),
    )
    expect(failures).toContain('a/b is shipped without recorded evidence')
  })

  test('rejects a stopped public candidate that does not assert its own absence', () => {
    const failures = evaluateDispositions(
      manifestOf([candidate({ candidateId: 'a/b', surface: 'public' })]),
    )
    expect(failures.some((failure) => failure.includes('no absence assertion'))).toBe(true)
  })

  test('rejects a duplicate candidate', () => {
    const failures = evaluateDispositions(
      manifestOf([candidate({ candidateId: 'a/b' }), candidate({ candidateId: 'a/b' })]),
    )
    expect(failures).toContain('duplicate candidate: a/b')
  })

  test('rejects a missing owner slice', () => {
    const partial: DispositionManifest = {
      protocol: 'stopcock.fp-v2-optional-dispositions',
      protocolVersion: 1,
      candidates: [candidate({ ownerSlice: 'P4' })],
    }
    const failures = evaluateDispositions(partial)
    expect(failures.some((failure) => failure.includes('no candidate record for owner slice'))).toBe(
      true,
    )
  })
})

describe('the checked-in disposition manifest', () => {
  test('covers every owner slice exactly once per candidate', () => {
    const manifest = loadDispositions()
    const ids = manifest.candidates.map((entry) => entry.candidateId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const slice of EXPECTED_OWNER_SLICES) {
      expect(manifest.candidates.some((entry) => entry.ownerSlice === slice)).toBe(true)
    }
  })

  test('is blocked only by P3B, and says so', () => {
    // Records the actual state rather than asserting green. When P3B resolves,
    // this expectation is what has to change, which is the reminder.
    const failures = evaluateDispositions(loadDispositions())
    expect(failures).toEqual([
      'p3b/array-exact-indexed-allocation is unresolved (blocked on host requalification via perf-profile-gate, then portable-perf-gate)',
    ])
  })
})
