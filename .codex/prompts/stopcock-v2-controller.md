Implement Stopcock 2.0 from
`docs/superpowers/plans/2026-07-24-stopcock-v2-performance-density-superplan.md`.

Operate as the execution controller. Before editing, read `AGENTS.md`, the
entire canonical superplan, and
`STOPCOCK_V2_PROGRESS.md`.

Fail closed without editing if any start-gate item is incomplete, if
`Execution authorization` is not exactly `AUTHORIZED`, if the worktree is
dirty at startup, or if the recorded base/branch/worktree does not match the
live checkout. Also fail closed if project-scoped Codex configuration or custom
agents are inactive, either source plan is unavailable, or either source-plan
SHA-256 differs from the hash recorded in the canonical superplan.

Start at the first incomplete canonical stage. Work autonomously through its
ordered slices. For each slice:

1. Inspect the live implementation and the exact canonical requirements.
2. Resolve only in-scope ambiguity, recording material decisions in the ledger.
3. Implement the smallest coherent slice that preserves a working product.
4. Run focused validation.
5. Use `v2_explorer` for bounded read-only tracing when useful.
6. Pause writes and use `v2_test_runner` for independent bounded validation
   when parallel test execution is safe.
7. Remediate failures without weakening gates or changing unrelated behavior.
8. Run every required stage validation against the exact required source,
   built, packed, consumer, or release artifact.
9. For S2, S7, S10, S13, and S14, request a `v2_verifier` audit and wait for its
   result before claiming the exit gate.
10. Update the execution ledger with progress, evidence, decisions, discoveries,
    blockers, the verified commit, and the exact next action.
11. Create a scoped local checkpoint commit after each independently valid
    slice. Include no unrelated user changes.
12. Continue to the next incomplete slice without asking for routine
    confirmation.

Use one writer. Subagents may explore, execute assigned tests, or review
evidence; they must not independently implement overlapping changes.

The canonical superplan overrides every child or adjacent plan. Do not start
Compute, worker-offload, public Incremental, patch-native State, validated HTTP,
creative-application, or Domain package work unless the canonical plan places
it in the active release train or the user deliberately amends that authority.

Stop and report a blocker only when:

- canonical requirements materially conflict;
- an entry or exit gate remains unsatisfied after reasonable in-scope
  remediation;
- the next action needs missing external authority, credentials, hardware, or
  environmental state;
- a destructive or materially scope-expanding action would be required; or
- execution reaches an RC acceptance, registry publication, dist-tag movement,
  GitHub release mutation, push, or stable S14 publication boundary.

Never push, publish, accept a release, move registry tags, mutate npm or GitHub
release state, publish private `@stopcock/synth`, or perform stable S14
publication without a new explicit user authorization naming that action.
