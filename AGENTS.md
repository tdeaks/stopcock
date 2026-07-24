# Repository agent guidance

## Stopcock 2.0 execution

Stopcock controller trust marker: `STOPCOCK_V2_PROJECT_CONFIG_ACTIVE_V1`.

This repository is configured for a staged, resumable Stopcock 2.0
implementation. Configuration alone does not authorize execution. Do not begin
the programme unless the user explicitly asks to start it and the execution
ledger records that authorization.

The sole canonical architecture, scope, ordering, and release authority is:

`docs/superpowers/plans/2026-07-24-stopcock-v2-performance-density-superplan.md`

Its preserved, hash-pinned evidence and task catalogues are:

- `docs/superpowers/plans/2026-07-24-stopcock-fp-performance-frontier-implementation.md`
- `docs/superpowers/plans/2026-07-24-fp-maximum-bundle-size-reduction.md`

Durable execution state lives in:

`STOPCOCK_V2_PROGRESS.md`

The semantic-operator, receipt, Compute, Incremental, worker, State, HTTP,
reference-application, and Domain plans are subordinate or post-2.0 material.
When they conflict with the canonical superplan, the superplan wins. Do not
start post-S14 package work during the 2.0 release train unless the canonical
superplan is deliberately amended.

When the user explicitly authorizes the Stopcock 2.0 controller:

1. Read this file, the entire canonical superplan, and the execution ledger
   before editing.
2. Confirm the worktree is isolated, clean, and based on the frozen release
   reference recorded in the ledger. Confirm that Codex treats that exact
   worktree path as trusted so project config and custom agents are active.
3. Work on the first incomplete canonical stage or slice. Do not skip entry
   gates, validations, stop decisions, or exit gates.
4. Keep one primary writer. Use subagents for bounded exploration, test
   execution, log analysis, and independent exit-gate review. Do not let
   multiple agents edit overlapping source.
5. Preserve unrelated user changes. Never absorb a dirty baseline into a stage
   checkpoint.
6. Run focused validation while implementing, followed by every validation
   required by the current stage. Never weaken a threshold or substitute
   source tests for required built, packed, or consumer evidence.
7. Update the execution ledger at every stopping point. Record progress,
   evidence, decisions, surprises, blockers, the verified commit, and the exact
   next action.
8. After an independently valid slice, hand a schema-validated checkpoint
   request to the outer launcher and stop. The sandboxed controller must not
   run `git add`, `git commit`, `git reset`, or `git checkout`; the launcher
   verifies and applies the exact scoped local checkpoint before starting a
   fresh clean iteration.
9. Before the handoff, run
   `node tooling/apply-stopcock-v2-checkpoint.mjs --describe-dirty` and copy its
   exact path list and content digest into the checkpoint result. The outer
   launcher rejects any byte or path drift.
10. Continue without asking for routine next-step confirmation. Stop only for a
    genuine architectural conflict, an irreducible gate failure, missing
    authority, or an external/destructive action.
11. Never push, publish, accept a release, move registry tags, mutate npm or
    GitHub release state, or perform stable S14 publication without explicit
    user authorization. Private `@stopcock/synth` must never be published.

The ledger's generic execution authorization covers local implementation only.
RC and stable mutation use separate action-and-artifact-specific ledger fields
and a protected external release workflow. This local controller must record a
durable blocker at either boundary; it may only reconcile already-completed
external evidence and may not perform the external mutation itself.

For critical S2, S7, S10, S13, and S14 boundaries, request an independent
`v2_verifier` audit before claiming the gate has passed. The verifier reports
evidence; the primary agent remains responsible for the final decision and
ledger update.
