import { describe, expect, test } from 'vite-plus/test'
import {
  describeHost,
  evaluateProfileQualification,
  MINIMUM_SESSION_SAMPLES,
  NO_CHANGE_WORKLOAD_ID,
  relativeSpread,
  resolveProfile,
  type PerfHost,
  type ProfileQualificationReport,
} from './perf-profile-gate'
import { PERF_PROFILES, type PerfProfile } from './perf-profile-contract'

const LOCAL = PERF_PROFILES.find((profile) => profile.id === 'local-macos-arm64') as PerfProfile

const QUALIFIED_HOST: PerfHost = {
  platform: 'darwin',
  architecture: 'arm64',
  cpuBrand: 'Apple M4 Pro',
  logicalCpus: 14,
  osRelease: '25.2.0',
  runtime: 'bun',
  runtimeVersion: '1.3.14',
}

const sessionOf = (index: number, ratios: readonly number[]) => ({
  index,
  pairedRatios: ratios,
  medianRatio: [...ratios].sort((l, r) => l - r)[ratios.length >> 1],
  relativeSpread: relativeSpread(ratios),
})

const steadyRatios = (centre: number): number[] =>
  Array.from({ length: MINIMUM_SESSION_SAMPLES + 1 }, (_, i) =>
    i % 2 === 0 ? centre : centre + 0.001,
  )

const reportOf = (
  sessions: ProfileQualificationReport['sessions'],
): ProfileQualificationReport => ({
  generatedAt: '2026-07-25T00:00:00.000Z',
  profileId: LOCAL.id,
  host: QUALIFIED_HOST,
  workloadId: NO_CHANGE_WORKLOAD_ID,
  sessions,
})

describe('profile resolution', () => {
  test('accepts the recorded dedicated host', () => {
    const resolution = resolveProfile(QUALIFIED_HOST)
    expect(resolution.ok).toBe(true)
    expect(resolution.profile?.id).toBe('local-macos-arm64')
    expect(resolution.releaseEvidenceEligible).toBe(true)
  })

  test('marks the canary runtime as ineligible for release evidence', () => {
    const resolution = resolveProfile({
      ...QUALIFIED_HOST,
      runtime: 'node',
      runtimeVersion: '24.18.0',
    })
    expect(resolution.ok).toBe(true)
    expect(resolution.releaseEvidenceEligible).toBe(false)
  })

  test.each([
    ['cpu', { cpuBrand: 'Apple M1' }],
    ['core count', { logicalCpus: 8 }],
    ['os release', { osRelease: '23.6.0' }],
    ['runtime version', { runtimeVersion: '1.2.0' }],
  ] as const)('rejects %s drift', (_label, drift) => {
    const resolution = resolveProfile({ ...QUALIFIED_HOST, ...drift })
    expect(resolution.ok).toBe(false)
    expect(resolution.failures.length).toBeGreaterThan(0)
  })

  test('rejects an unknown profile id', () => {
    expect(resolveProfile(QUALIFIED_HOST, 'perf-macos-arm64').ok).toBe(false)
  })

  test('rejects the unprovisioned linux profile', () => {
    const resolution = resolveProfile(QUALIFIED_HOST, 'perf-linux-x64')
    expect(resolution.ok).toBe(false)
    expect(resolution.failures[0]).toContain('unprovisioned')
  })

  test('rejects a host that matches no recorded profile', () => {
    const resolution = resolveProfile({
      ...QUALIFIED_HOST,
      platform: 'win32',
      architecture: 'x64',
    })
    expect(resolution.ok).toBe(false)
  })
})

describe('qualification', () => {
  const steadySessions = (count = LOCAL.variance.requiredSessions) =>
    Array.from({ length: count }, (_, i) => sessionOf(i, steadyRatios(1 + (i % 3) * 0.001)))

  test('accepts steady repeated no-change sessions', () => {
    expect(evaluateProfileQualification(reportOf(steadySessions()), LOCAL).failures).toEqual([])
  })

  test('rejects too few sessions', () => {
    const report = reportOf(steadySessions(LOCAL.variance.requiredSessions - 1))
    expect(evaluateProfileQualification(report, LOCAL).ok).toBe(false)
  })

  test('rejects a noisy session', () => {
    const noisy = Array.from({ length: MINIMUM_SESSION_SAMPLES + 1 }, (_, i) =>
      i % 2 === 0 ? 0.7 : 1.3,
    )
    const report = reportOf([sessionOf(0, noisy), ...steadySessions().slice(1)])
    expect(evaluateProfileQualification(report, LOCAL).ok).toBe(false)
  })

  test('rejects drift between session medians', () => {
    const report = reportOf(
      Array.from({ length: LOCAL.variance.requiredSessions }, (_, i) =>
        sessionOf(i, steadyRatios(0.9 + i * 0.15)),
      ),
    )
    const verdict = evaluateProfileQualification(report, LOCAL)
    expect(verdict.ok).toBe(false)
    expect(verdict.sessionMedianSpread).toBeGreaterThan(LOCAL.variance.maxSessionMedianSpread)
  })

  test('rejects a bias every session shares', () => {
    const report = reportOf(
      Array.from({ length: LOCAL.variance.requiredSessions }, (_, i) =>
        sessionOf(i, steadyRatios(1.2)),
      ),
    )
    const verdict = evaluateProfileQualification(report, LOCAL)
    expect(verdict.ok).toBe(false)
    expect(verdict.noChangeBias).toBeGreaterThan(LOCAL.variance.maxNoChangeBias)
  })

  test('rejects statistics that do not reproduce from raw samples', () => {
    const session = sessionOf(0, steadyRatios(1.0))
    const report = reportOf([{ ...session, medianRatio: 1.02 }, ...steadySessions().slice(1)])
    expect(evaluateProfileQualification(report, LOCAL).ok).toBe(false)
  })

  test('rejects a foreign workload', () => {
    const report = { ...reportOf(steadySessions()), workloadId: 'something-else' }
    expect(evaluateProfileQualification(report, LOCAL).ok).toBe(false)
  })

  test('rejects short sessions', () => {
    const short = Array.from({ length: 4 }, () => 1.0)
    const report = reportOf(
      Array.from({ length: LOCAL.variance.requiredSessions }, (_, i) => sessionOf(i, short)),
    )
    expect(evaluateProfileQualification(report, LOCAL).ok).toBe(false)
  })
})

describe('live host', () => {
  // Timed qualification lives in the gate script: a vitest worker pool is not a
  // qualified session and would make this suite flaky by construction.
  test('this machine matches its recorded profile', () => {
    expect(resolveProfile(describeHost()).failures).toEqual([])
  })
})
