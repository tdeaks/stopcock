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
ordered slices, but complete at most one independently valid slice in this
controller iteration. The outer launcher starts a fresh iteration after the
checkpoint. For the active slice:

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
    blockers, and the exact next action.
11. After each independently valid slice:
    - set `Programme status: CHECKPOINT_PENDING`;
    - set `Last verified commit: CHECKPOINT_PENDING`;
    - leave `Current canonical stage` on the stage that produced the slice;
    - set `Current slice: CHECKPOINT_PENDING`;
    - set only the active stage-table row to `CHECKPOINT_PENDING`;
    - retain the active row's prior evidence text when appending new evidence;
    - leave the start gate, every other stage row, and all prior progress,
      evidence, discovery, and decision history intact;
    - choose a scope from
      `.codex/policies/stopcock-v2-stage-scopes.json` that belongs to the
      active stage, and keep every dirty path inside that maximum scope;
    - use an empty `scopeTarget` for static scopes. For S0R, P3B, or P4, choose
      a target ID already present at the iteration's starting HEAD in
      `docs/superpowers/contracts/stopcock-v2-dynamic-scopes.json`; every dirty
      non-ledger path must also match that target's `allowedPatterns`. The
      predecessor checkpoint must create or update this schema-version-1
      contract before entering a dynamic stage, with objects shaped exactly as
      `{ "id": "<stable-id>", "allowedPatterns": ["<glob>", "..."] }`. Record
      an explicit target whose ID is `no-op` or starts with `no-op-` when a
      dynamic stage has no implementation candidate. Dynamic patterns must be
      rooted and narrow: S0R names exactly one literal package, P3B names
      exactly one literal `packages/fp/src/<module>.ts`, and P4 names exactly
      one of `object.ts`, `record.ts`, or `map.ts`. Shared helper/test patterns
      may accompany that literal target, but repository-wide `**`, wildcard
      package roots, whole FP source trees, whole tooling/artifact trees, and
      the plans directory are forbidden. Never edit the dynamic-scope contract
      from S0R, P3B, or P4 or widen the current target during its own iteration;
    - choose the post-checkpoint programme status, active-stage status, next
      eligible stage, and exact next slice. A partial slice keeps the same stage
      `IN_PROGRESS`; a completed stage selects a dependency-eligible next
      stage; a blocker keeps the same stage and uses `BLOCKED`; S14 completion
      alone may use `PROGRAMME_COMPLETE` with no next stage or next slice. Use whole-stage
      `STOPPED_BY_PLAN` only for the conditional S10X no-extraction branch;
      candidate-level stop dispositions in P1–P4 still complete their owning
      stage as `GATE_PASSED`;
    - run
      `node tooling/apply-stopcock-v2-checkpoint.mjs --describe-dirty` only
      after final validation and ledger edits, then copy its exact sorted paths
      and content digest without alteration;
    - return `outcome: checkpoint_ready` with the unchanged 40-character HEAD,
      a single-line scoped commit message, the active stage and scope,
      transition fields, content digest, and exact repo-relative dirty paths
      including `STOPCOCK_V2_PROGRESS.md`;
    - stop immediately so the outer launcher can verify and apply the local
      checkpoint.
12. Never run `git add`, `git commit`, `git reset`, `git checkout`, or mutate
    Git metadata. Do not leave a background process running across the
    checkpoint handoff. A fresh controller iteration continues after the outer
    launcher has checkpointed the slice and restored a clean worktree.
13. Never edit `AGENTS.md`, `AGENTS.override.md`, `.agents/**`, `.codex/**`,
    `.gitignore`, `.gitattributes`, `.lfsconfig`, either preserved source plan,
    the canonical superplan, this launcher, or the checkpoint helper. Never
    create an ignored source, fixture, document, configuration, or evidence
    file; generated dependencies and ordinary ignored build outputs are the
    only permitted ignored workspace state.

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
publication from this local controller. Generic `Execution authorization:
AUTHORIZED` covers local implementation only. At the S13 RC or S14 stable
mutation boundary, record a durable blocker unless the ledger already contains
an action-and-artifact-specific external authorization and reconciled
`COMPLETED` evidence produced by the separate protected release workflow.
S13 may pass only with `RC_PUBLISH`; S14 may complete only with
`STABLE_PUBLISH`; both require the exact `sha256:<64 lowercase hex>` artifact.
Never edit those external-authorization fields during a controller iteration.

Your final response must match the supplied JSON schema. Always return:

- `version: 1`;
- `outcome: checkpoint_ready`;
- a concise non-empty `summary`;
- every field in `checkpoint`.

Populate all checkpoint fields exactly as described above. Use a ledger-only
checkpoint with programme and stage status `BLOCKED` when a blocker can be
durably recorded without checkpointing invalid work. S14 completion is also a
normal checkpoint: use `PROGRAMME_COMPLETE`, `GATE_PASSED`, and empty
`nextStage`/`nextSlice`. There are no clean, non-durable stop outcomes. If
invalid partial work cannot be remediated safely, restore only files changed in
this iteration to their starting bytes without using Git metadata commands,
then record the blocker in a ledger-only checkpoint. Do not wrap the JSON in
Markdown.
