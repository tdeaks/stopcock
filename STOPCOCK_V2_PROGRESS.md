# Stopcock 2.0 execution ledger

This is the durable resumability record for the canonical Stopcock 2.0
superplan. It is deliberately separate from the architecture plan: the
superplan defines what must happen, while this file records what has actually
happened.

Execution authorization: NOT_AUTHORIZED
Programme status: NOT_STARTED
Base release ref: UNSET
Execution branch: UNSET
Execution worktree: UNSET
Current canonical stage: S0
Current slice: NOT_STARTED
Last verified commit: UNSET
Last controller run: NEVER

Do not change `Execution authorization` to `AUTHORIZED` merely because the
workflow has been installed. It changes only after the user explicitly asks to
start execution from a named, frozen base.

## Start gate

- [ ] The current 1.x release decision is complete.
- [ ] The exact base release ref is recorded above.
- [ ] The workflow scaffold and canonical superplan are committed and available
      from that base or an explicitly identified setup commit.
- [ ] A dedicated non-protected execution branch and isolated worktree exist.
- [ ] The exact execution worktree is trusted by Codex, so its project config
      and custom agents are active.
- [ ] The execution worktree is clean.
- [ ] Both preserved source-plan SHA-256 values match the hashes recorded in the
      canonical superplan.
- [ ] The user has explicitly authorized implementation to begin.
- [ ] `Execution authorization` is `AUTHORIZED`.

## Canonical stage status

Allowed status values are `NOT_STARTED`, `IN_PROGRESS`, `GATE_PASSED`,
`STOPPED_BY_PLAN`, and `BLOCKED`.

| Stage | Status | Verified commit or evidence |
|---|---|---|
| S0 | NOT_STARTED | — |
| S0R | NOT_STARTED | Conditional stage |
| S0B | NOT_STARTED | — |
| S1 | NOT_STARTED | Includes its independently complete evidence slices |
| S2 | NOT_STARTED | Requires independent `v2_verifier` audit |
| S3 | NOT_STARTED | — |
| S4 | NOT_STARTED | — |
| S5 | NOT_STARTED | — |
| S6 | NOT_STARTED | — |
| S7 | NOT_STARTED | Requires independent `v2_verifier` audit |
| S8 | NOT_STARTED | — |
| S9 | NOT_STARTED | — |
| S10 | NOT_STARTED | Includes conditional specialist decisions and requires independent audit |
| S11 | NOT_STARTED | — |
| S12P | NOT_STARTED | — |
| S12 | NOT_STARTED | — |
| S13 | NOT_STARTED | External RC publication remains user-authorized |
| S14 | NOT_STARTED | Stable acceptance and publication remain user-authorized |

## Progress

- [x] (2026-07-24) Installed the dormant project-scoped Codex workflow.
- [ ] Freeze and record the release baseline.
- [ ] Authorize execution.
- [ ] Begin S0.

## Evidence log

No implementation or release evidence has been produced by this workflow.

## Surprises and discoveries

- The canonical plan originally lived under an ignored `/docs/` directory.
  The repository ignore rules now expose it and its two hash-pinned source plans
  so all three can be committed and made available to isolated worktrees.

## Decision log

- Decision: Use the primary Sol/max agent as the only writer.
  Rationale: The superplan is sequential and cross-package; parallel writers
  would create coordination and artifact-provenance risk.
  Date: 2026-07-24.

- Decision: Use Terra/high subagents for bounded exploration and test execution,
  and Sol/ultra for independent critical-gate audits.
  Rationale: This preserves frontier judgment at architectural boundaries while
  keeping supporting work fast and isolated.
  Date: 2026-07-24.

- Decision: Keep registry, GitHub release, dist-tag, RC acceptance, and stable
  publication actions outside unattended authority.
  Rationale: These are external, difficult-to-reverse release mutations.
  Date: 2026-07-24.

## Current blockers

- Execution has not been authorized.
- The 1.x release baseline has not been frozen or recorded.
- No isolated execution branch or worktree exists yet.
- The future execution worktree has not yet been marked and verified as trusted.

## Exact next action

After the current release decision is complete, create an isolated worktree from
the chosen frozen ref, ensure this scaffold and the canonical plan are present,
record the base/branch/worktree above, obtain explicit user authorization, and
only then change `Execution authorization` to `AUTHORIZED`.

## Outcomes and retrospective

The execution controller is installed but dormant. No superplan stage has
started, no implementation file has been changed by the controller, and no
external action has been taken.
