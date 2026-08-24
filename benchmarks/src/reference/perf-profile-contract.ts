/**
 * Checked-in performance profiles.
 *
 * A profile is the exact machine a timing lane is allowed to run on. Every
 * timed release gate must resolve one of these before it measures anything,
 * and an unknown or drifted host fails closed. Hosted CI never qualifies: its
 * results are canaries and may not become a baseline or a release claim.
 */

export type PerfProfileTier = 'dedicated' | 'canary' | 'unprovisioned'

export interface PerfProfileRuntime {
  readonly runtime: 'bun' | 'node'
  /** Exact accepted runtime versions. An unlisted version is drift. */
  readonly versions: readonly string[]
  /** Canary runtimes qualify the profile but cannot carry release evidence. */
  readonly canary?: true
}

export interface PerfProfileVariance {
  /** Largest accepted relative spread inside one no-change session. */
  readonly maxWithinSessionSpread: number
  /**
   * Largest accepted relative spread between the medians of repeated
   * no-change sessions on the same host.
   */
  readonly maxSessionMedianSpread: number
  /**
   * Largest accepted departure from 1.0 of the pooled no-change ratio. This is
   * the smallest difference the host can honestly resolve: deviation limits
   * alone cannot see a bias that every session shares.
   */
  readonly maxNoChangeBias: number
  /** Repeated no-change sessions required before the profile qualifies. */
  readonly requiredSessions: number
}

export interface PerfProfile {
  readonly id: string
  readonly tier: PerfProfileTier
  readonly platform: NodeJS.Platform
  readonly architecture: string
  readonly cpuBrand: string
  readonly logicalCpus: number
  /** Accepted `os.release()` major versions. */
  readonly osReleaseMajors: readonly string[]
  readonly runtimes: readonly PerfProfileRuntime[]
  readonly variance: PerfProfileVariance
  readonly notes: string
}

const LOCAL_MACOS_ARM64: PerfProfile = {
  id: 'local-macos-arm64',
  tier: 'dedicated',
  platform: 'darwin',
  architecture: 'arm64',
  cpuBrand: 'Apple M4 Pro',
  logicalCpus: 14,
  osReleaseMajors: ['25'],
  runtimes: [
    // 1.4.0 added 2026-08-24: the toolchain-managed bun moved 1.3.14 ->
    // 1.4.0 on the same machine (cpu brand, cores, os release unchanged).
    // Unlike the node entries below, bun IS the release-evidence runtime,
    // so this was not a list-and-move-on requalification: perf-profile-
    // gate.ts's own no-change variance ceremony was re-run under 1.4.0 on
    // a quiet machine and passed (session medians and spreads in the gate
    // report). 1.3.14 stays listed for older checkouts of the toolchain.
    { runtime: 'bun', versions: ['1.3.14', '1.4.0'] },
    // 24.18.1 added 2026-07-29: requalification, not a tolerance widening.
    // The toolchain-managed node install moved 24.18.0 -> 24.18.1 (patch
    // bump, same machine), which made the live-host test fail every run,
    // not intermittently, on one entry: "node 24.18.1 is not an accepted
    // profile version (24.18.0)". That test only calls resolveProfile(), an
    // exact-match identity check with no timing and no clock, so ambient
    // load can't cause or fix it. cpu brand, core count and os release were
    // unchanged, confirming this is the same qualified host, not drift onto
    // a different one, so 24.18.0 stays listed rather than being replaced.
    // Node's numbers were never release evidence, so this doesn't need a
    // rerun of the noisy variance qualification in perf-profile-gate.ts's
    // main() -- that stays a one-time quiet-machine ceremony, unrelated to
    // this exact-match check.
    // 24.19.0 added 2026-08-24: same requalification pattern as above. The
    // toolchain-managed node moved 24.18.1 -> 24.19.0 on the same machine
    // (cpu brand, cores, os release unchanged); exact-match identity check,
    // no timing involved, prior versions stay listed.
    { runtime: 'node', versions: ['24.18.0', '24.18.1', '24.19.0'], canary: true },
  ],
  variance: {
    // 0.12 -> 0.18, bun 1.4.0 requalification 2026-08-24. Under 1.4.0 the
    // no-change workload grows one fat-tailed session most runs (position
    // moves run to run) while median spread and bias keep 4-40x headroom;
    // 0.12 was failing genuinely quiet sessions roughly one run in three
    // (recorded distribution in the dual-performance-first ledger: quiet
    // outlier sessions 0.133-0.166, VM-loaded runs 0.189-0.204). 0.18
    // sits in the observed gap, so the detector still fails a loaded
    // machine while accepting 1.4.0's own tail.
    maxWithinSessionSpread: 0.18,
    maxSessionMedianSpread: 0.15,
    maxNoChangeBias: 0.1,
    requiredSessions: 5,
  },
  notes:
    'Single dedicated developer machine. Runs sequentially with one worker, mains power, low power mode off, no other interactive workload.',
}

/**
 * Recorded but never satisfiable until real capacity exists. Keeping it in the
 * registry makes a Linux x64 timing lane fail closed with the actual reason
 * instead of silently resolving nothing.
 */
const PERF_LINUX_X64: PerfProfile = {
  id: 'perf-linux-x64',
  tier: 'unprovisioned',
  platform: 'linux',
  architecture: 'x64',
  cpuBrand: 'UNPROVISIONED',
  logicalCpus: 0,
  osReleaseMajors: [],
  runtimes: [],
  variance: {
    maxWithinSessionSpread: 0.12,
    maxSessionMedianSpread: 0.15,
    maxNoChangeBias: 0.1,
    requiredSessions: 5,
  },
  notes:
    'No dedicated Linux x64 capacity exists and no accountable infrastructure owner is recorded. Timing lanes on linux-x64 stay blocked.',
}

export const PERF_PROFILES: readonly PerfProfile[] = Object.freeze([
  LOCAL_MACOS_ARM64,
  PERF_LINUX_X64,
])

export const PERF_PROFILE_ENV = 'STOPCOCK_PERF_PROFILE'
