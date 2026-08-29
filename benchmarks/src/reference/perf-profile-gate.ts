import { cpus, release } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { currentPerfEngine } from './perf-engine'
import { runInterleavedPaired } from './perf-runner'
import {
  PERF_PROFILE_ENV,
  PERF_PROFILES,
  type PerfProfile,
  type PerfProfileRuntime,
} from './perf-profile-contract'

export interface PerfHost {
  readonly platform: NodeJS.Platform
  readonly architecture: string
  readonly cpuBrand: string
  readonly logicalCpus: number
  readonly osRelease: string
  readonly runtime: 'bun' | 'node'
  readonly runtimeVersion: string
}

export interface ProfileResolution {
  readonly ok: boolean
  readonly profile?: PerfProfile
  readonly runtime?: PerfProfileRuntime
  /** True only on a dedicated profile running a non-canary runtime. */
  readonly releaseEvidenceEligible: boolean
  readonly failures: readonly string[]
}

export interface QualificationSession {
  readonly index: number
  /** Paired ratios of the identical no-change subject against itself. */
  readonly pairedRatios: readonly number[]
  readonly medianRatio: number
  readonly relativeSpread: number
}

export interface ProfileQualificationReport {
  readonly generatedAt: string
  readonly profileId: string
  readonly host: PerfHost
  readonly workloadId: string
  readonly sessions: readonly QualificationSession[]
}

export interface QualificationVerdict {
  readonly ok: boolean
  readonly failures: readonly string[]
  readonly sessionMedianSpread: number
  readonly noChangeBias: number
}

export const NO_CHANGE_WORKLOAD_ID = 'stopcock-perf-profile-no-change-v1'
export const MINIMUM_SESSION_SAMPLES = 16

export const describeHost = (): PerfHost => {
  const engine = currentPerfEngine()
  const cores = cpus()
  return {
    platform: process.platform,
    architecture: process.arch,
    cpuBrand: cores[0]?.model ?? 'UNKNOWN',
    logicalCpus: cores.length,
    osRelease: release(),
    runtime: engine.runtime,
    runtimeVersion: engine.runtimeVersion,
  }
}

const majorOf = (version: string): string => version.split('.')[0] ?? version

/**
 * Fail-closed host qualification. Everything an unqualified machine could
 * silently get away with (unknown id, wrong CPU, extra cores, drifted OS or
 * runtime) is an explicit failure, and a hosted or otherwise unrecorded
 * machine matches nothing at all.
 */
export const resolveProfile = (
  host: PerfHost,
  requestedId?: string,
  profiles: readonly PerfProfile[] = PERF_PROFILES,
): ProfileResolution => {
  const failures: string[] = []
  let profile: PerfProfile | undefined

  if (requestedId !== undefined) {
    profile = profiles.find((candidate) => candidate.id === requestedId)
    if (profile === undefined) {
      return {
        ok: false,
        releaseEvidenceEligible: false,
        failures: [`unknown performance profile ${JSON.stringify(requestedId)}`],
      }
    }
  } else {
    const matches = profiles.filter(
      (candidate) =>
        candidate.platform === host.platform && candidate.architecture === host.architecture,
    )
    if (matches.length !== 1) {
      return {
        ok: false,
        releaseEvidenceEligible: false,
        failures: [
          `expected exactly one profile for ${host.platform}-${host.architecture}, found ${matches.length}`,
        ],
      }
    }
    profile = matches[0]
  }

  if (profile.tier === 'unprovisioned') {
    return {
      ok: false,
      profile,
      releaseEvidenceEligible: false,
      failures: [`profile ${profile.id} is unprovisioned: ${profile.notes}`],
    }
  }

  if (profile.platform !== host.platform) {
    failures.push(`platform ${host.platform} does not match profile ${profile.platform}`)
  }
  if (profile.architecture !== host.architecture) {
    failures.push(
      `architecture ${host.architecture} does not match profile ${profile.architecture}`,
    )
  }
  if (profile.cpuBrand !== host.cpuBrand) {
    failures.push(
      `cpu ${JSON.stringify(host.cpuBrand)} does not match profile ${JSON.stringify(profile.cpuBrand)}`,
    )
  }
  if (profile.logicalCpus !== host.logicalCpus) {
    failures.push(`logical cpus ${host.logicalCpus} does not match profile ${profile.logicalCpus}`)
  }
  if (!profile.osReleaseMajors.includes(majorOf(host.osRelease))) {
    failures.push(`os release ${host.osRelease} is not an accepted profile release`)
  }

  // Runtime versions are identified but never rejected. The exact-match
  // whitelist broke every gate each time the managed toolchain auto-updated
  // (four times on 2026-08-24 alone) and never caught anything else; retired
  // by owner decision 2026-08-29 along with the gate surface cut.
  const runtime = profile.runtimes.find((candidate) => candidate.runtime === host.runtime)

  const ok = failures.length === 0
  return {
    ok,
    profile,
    runtime,
    releaseEvidenceEligible: ok && profile.tier === 'dedicated' && runtime?.canary !== true,
    failures,
  }
}

const median = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((l, r) => l - r)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Relative interdecile range. A median absolute deviation is too forgiving
 * here: it reports zero for a cleanly bimodal series, which is exactly the
 * shape a machine switching between two clock states produces.
 */
export const relativeSpread = (xs: readonly number[]): number => {
  if (xs.length === 0) return Number.POSITIVE_INFINITY
  const centre = median(xs)
  if (centre === 0) return Number.POSITIVE_INFINITY
  const sorted = [...xs].sort((l, r) => l - r)
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]
  return (at(0.9) - at(0.1)) / Math.abs(centre)
}

export const evaluateProfileQualification = (
  report: ProfileQualificationReport,
  profile: PerfProfile,
): QualificationVerdict => {
  const failures: string[] = []

  if (report.profileId !== profile.id) {
    failures.push(`report profile ${report.profileId} does not match ${profile.id}`)
  }
  if (report.workloadId !== NO_CHANGE_WORKLOAD_ID) {
    failures.push(`report workload ${report.workloadId} is not the frozen no-change workload`)
  }
  if (report.sessions.length < profile.variance.requiredSessions) {
    failures.push(
      `${report.sessions.length} sessions is fewer than the required ${profile.variance.requiredSessions}`,
    )
  }

  for (const session of report.sessions) {
    if (session.pairedRatios.length < MINIMUM_SESSION_SAMPLES) {
      failures.push(
        `session ${session.index} produced ${session.pairedRatios.length} samples, below ${MINIMUM_SESSION_SAMPLES}`,
      )
    }
    if (session.medianRatio !== median(session.pairedRatios)) {
      failures.push(`session ${session.index} median does not reproduce from its raw samples`)
    }
    if (session.relativeSpread !== relativeSpread(session.pairedRatios)) {
      failures.push(`session ${session.index} deviation does not reproduce from its raw samples`)
    }
    if (session.relativeSpread > profile.variance.maxWithinSessionSpread) {
      failures.push(
        `session ${session.index} spread ${session.relativeSpread.toFixed(4)} exceeds ${profile.variance.maxWithinSessionSpread}`,
      )
    }
  }

  const medians = report.sessions.map((session) => session.medianRatio)
  const spread = relativeSpread(medians)
  if (spread > profile.variance.maxSessionMedianSpread) {
    failures.push(
      `session median spread ${spread.toFixed(4)} exceeds ${profile.variance.maxSessionMedianSpread}`,
    )
  }

  const bias = medians.length === 0 ? Number.POSITIVE_INFINITY : Math.abs(median(medians) - 1)
  if (bias > profile.variance.maxNoChangeBias) {
    failures.push(
      `pooled no-change ratio is off by ${bias.toFixed(4)}, beyond ${profile.variance.maxNoChangeBias}`,
    )
  }

  return { ok: failures.length === 0, failures, sessionMedianSpread: spread, noChangeBias: bias }
}

/**
 * The subject is deliberately identical on both sides. A machine that cannot
 * measure the same code as the same code is too noisy to carry any comparative
 * claim.
 */
const noChangeSubject = (input: readonly number[]): number => {
  let total = 0
  for (let i = 0; i < input.length; i++) total += input[i] * 2 + 1
  return total
}

export const runQualificationSessions = (count: number): QualificationSession[] => {
  const input = Array.from({ length: 4096 }, (_, i) => i % 97)
  // Both sides are the same closure, so a paired ratio can only reflect the
  // machine: two distinct closures would let V8 tier each call site up
  // independently and report that as noise.
  const subject = () => noChangeSubject(input)
  // rounds 24 -> 96, bun 1.4.0 requalification 2026-08-24. At 24 ratios the
  // p90 in relativeSpread is the third-highest sample, so a two-round
  // scheduler burst counted as a session's spread and the ceremony failed
  // one session most runs (position moving run to run -- the ledger's
  // recorded distributions). At 96 a burst has to span ~10 rounds to reach
  // p90, while a genuinely bimodal clock state still shows at any round
  // count, which is what this statistic exists to catch. Whole ceremony
  // still runs in under a second.
  const session = () =>
    runInterleavedPaired(subject, subject, {
      rounds: 96,
      batchIterations: 64,
      microBatchIterations: 8,
      warmupRounds: 64,
    })

  // The opening paired sessions in a fresh process measure tier-up and the CPU
  // ramping, not steady-state throughput. Discard a fixed prelude rather than
  // widen the variance limits to hide it.
  session()
  session()

  const sessions: QualificationSession[] = []
  for (let index = 0; index < count; index++) {
    const run = session()
    sessions.push({
      index,
      pairedRatios: run.pairedRatios,
      medianRatio: median(run.pairedRatios),
      relativeSpread: relativeSpread(run.pairedRatios),
    })
  }
  return sessions
}

const main = (): void => {
  const host = describeHost()
  const requested = process.env[PERF_PROFILE_ENV]
  const resolution = resolveProfile(host, requested)
  if (!resolution.ok || resolution.profile === undefined) {
    console.error(`performance profile rejected for ${host.platform}-${host.architecture}:`)
    for (const failure of resolution.failures) console.error(`  - ${failure}`)
    process.exit(1)
  }

  const profile = resolution.profile
  const report: ProfileQualificationReport = {
    generatedAt: new Date().toISOString(),
    profileId: profile.id,
    host,
    workloadId: NO_CHANGE_WORKLOAD_ID,
    sessions: runQualificationSessions(profile.variance.requiredSessions),
  }
  const verdict = evaluateProfileQualification(report, profile)

  console.log(
    JSON.stringify(
      {
        profileId: profile.id,
        host,
        releaseEvidenceEligible: resolution.releaseEvidenceEligible,
        sessionMedians: report.sessions.map((session) => session.medianRatio),
        sessionSpreads: report.sessions.map((session) => session.relativeSpread),
        sessionMedianSpread: verdict.sessionMedianSpread,
        noChangeBias: verdict.noChangeBias,
        ok: verdict.ok,
      },
      null,
      2,
    ),
  )

  if (!verdict.ok) {
    for (const failure of verdict.failures) console.error(`  - ${failure}`)
    process.exit(1)
  }
  if (!resolution.releaseEvidenceEligible) {
    console.error(
      `note: ${host.runtime} ${host.runtimeVersion} on ${profile.id} is a canary lane; its numbers cannot become baseline or release evidence`,
    )
  }
}

// No self-invocation: this file left the gate manifest in the 2026-08-29
// gate-surface cut and survives only as the host-identity library
// (describeHost/resolveProfile/relativeSpread) the remaining gates import.
// Run main() by hand if you ever want the variance ceremony again.
void main
