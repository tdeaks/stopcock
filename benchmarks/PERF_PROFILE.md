# Performance profiles

A timing lane may only run on a machine recorded in
`src/reference/perf-profile-contract.ts`. `perf:profile` resolves the live host
against that registry and fails closed on anything it does not recognise:
unknown profile id, wrong CPU, wrong core count, drifted OS release, or an
unlisted runtime version.

Qualify the machine before trusting any timing run:

```sh
bun run perf:profile:bun
bun run perf:profile:node
```

## local-macos-arm64 (dedicated)

Apple M4 Pro, 14 logical cores, macOS 26 (Darwin 25.x), Bun 1.3.14, Node
24.18.0.

- One machine, one worker, sequential. Nothing else interactive running.
- Mains power, low power mode off.
- Base and head are measured in the same session, interleaved ABBA, fresh
  process per round.
- Bun 1.3.14 is the release-evidence lane. Node 24.18.0 is a canary: it
  qualifies the profile but its numbers may not become a baseline or a release
  claim.
- Every report comes from the JSON pipeline (`report:*` scripts) so engine
  identity is asserted and failures propagate.

### Measured variance limits

Qualification runs five in-process paired sessions of an identical no-change
subject against itself, after a discarded prelude that absorbs tier-up and CPU
ramping. The recorded limits come from repeated sessions on this machine:

| Limit                 | Value | Meaning                                                    |
| --------------------- | ----- | ---------------------------------------------------------- |
| within-session spread | 0.12  | relative interdecile range of one session's paired ratios  |
| session median spread | 0.15  | relative interdecile range across the five session medians |
| no-change bias        | 0.10  | how far the pooled ratio may sit from 1.0                  |

A failing qualification means the machine is not quiet enough right now, not
that the limits are wrong. Close other work and rerun.

Session medians on a quiet machine land within ~0.5% of 1.0, which is what the
`0.97x`/`0.90x` hot-path floors are actually gated on. The limits above bound
the worst session, not the resolution of a paired comparison.

## perf-linux-x64 (unprovisioned)

No dedicated Linux x64 capacity exists and no accountable infrastructure owner
is recorded. The profile is checked in so a Linux timing lane fails closed with
that reason instead of silently resolving nothing.

## Hosted CI

Hosted runners match no profile. Their results are canaries for catching
breakage, never baselines or release evidence.
