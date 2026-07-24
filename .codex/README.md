# Stopcock 2.0 Codex controller

This directory contains a dormant, project-scoped workflow for implementing the
canonical Stopcock 2.0 superplan. Installing these files does not start Codex
and does not authorize implementation.

## Components

- `config.toml` selects Sol/max for the primary agent, enables bounded
  subagents, disables network and side-effecting MCP approval paths, and keeps
  execution in a workspace-write sandbox with tightly scoped automatic review
  of eligible local approval requests.
- `agents/v2_explorer.toml` performs read-only repository tracing.
- `agents/v2_test_runner.toml` runs assigned validation without fixing code.
- `agents/v2_verifier.toml` performs independent Sol/ultra critical-gate audits.
- `../STOPCOCK_V2_PROGRESS.md` is the durable, controller-writable execution
  ledger. It intentionally lives outside protected `.codex/`.
- `prompts/stopcock-v2-controller.md` is the noninteractive controller prompt.
- `schemas/stopcock-v2-controller-result.schema.json` constrains every
  controller result consumed by the launcher.
- `policies/stopcock-v2-stage-scopes.json` binds every checkpoint to the
  active canonical leaf stage, its dependency graph, and its maximum path
  scope.
- `../AGENTS.md` defines repository-wide execution and release boundaries.
- `../tooling/run-stopcock-v2-controller.sh` is a guarded launcher.
- `../tooling/apply-stopcock-v2-checkpoint.mjs` validates and applies exact
  local checkpoints outside the implementation sandbox.

## Before the first run

1. Complete the current release decision and choose an immutable base ref.
2. Commit this workflow and the now-visible canonical superplan.
3. Create a dedicated worktree and non-protected branch from the intended base,
   then make the setup commit available there.
4. Mark that exact worktree path as trusted in the Codex project trust settings;
   project config and custom agents are ignored in untrusted worktrees.
5. Record the exact base ref, branch, and absolute worktree path in the ledger.
6. Confirm the worktree is clean and both preserved source-plan hashes match
   the canonical plan.
7. Obtain explicit user authorization to begin.
8. Check every start-gate item and change the ledger authorization to
   `AUTHORIZED` in a scoped setup commit.
9. From the isolated worktree, run:

       tooling/run-stopcock-v2-controller.sh

Use `tooling/run-stopcock-v2-controller.sh --check` to run every launcher
preflight without starting a Codex iteration.

The launcher refuses protected branches, concurrent launchers, in-progress Git
operations, dirty worktrees, unexpected ignored files, untracked controller
files, an unset or unrelated base, incomplete start-gate checkboxes, missing
source plans, source-hash drift, control-plane index flags or byte drift, a
non-linked worktree, missing authorization, or a failing controller safety
suite. A read-only Codex prompt diagnostic also proves that this exact worktree
loaded its project guidance, workspace-write sandbox, and project approval
reviewer before any model iteration starts.

Each controller iteration may edit and validate one independently valid slice,
but it cannot write protected Git metadata. It returns a schema-constrained
checkpoint request into the worktree Git directory. The request binds the
active canonical stage and maximum scope, unchanged HEAD, exact dirty paths,
and a SHA-256 digest of canonical Git modes and bytes. The outer launcher
recomputes that digest from the worktree and staged tree, enforces append-only
ledger history and dependency-safe stage transitions, uses literal
NUL-delimited Git paths, and verifies the final parent, tree, and committed
path set. Controller-owned commits disable repository hooks and signing. The
model can return only a durable `checkpoint_ready` result; partial progress,
blockers, and S14 completion all pass through the same two-commit checkpoint.

## Resuming

Each controller iteration reconstructs state from the canonical plan and
tracked ledger rather than depending on a particular chat session. After a
valid checkpoint the launcher records the slice commit hash in a separate
ledger commit, verifies a clean worktree, and automatically starts the next
iteration. A durable blocker exits with status `3`; completed local gates exit
with status `0`. If an iteration crashes after producing a valid result, the
next normal launch replays one of three exact states: dirty or staged
pre-commit, committed slice with pending ledger, or already-complete
slice-plus-ledger. Every parent, message, path, digest, ledger byte, and scope
invariant is revalidated before recovery. Any unrecognized state remains
untouched and fails closed. The helper is materialized from committed `HEAD`
into the private worktree Git directory, so a controller edit to the worktree
helper or policy cannot acquire the outer process's Git authority. A hard-crash
PID lock is reclaimed only when its recorded process is gone and the lock has
no unexpected contents. `--check` never replays a preserved result; use a
normal launch for that recovery.

Do not use `codex exec resume --last` for this programme: another Codex task may
have become the most recent session. The tracked ledger is the authoritative
resume mechanism.

## External boundary

The controller may implement and locally validate release machinery, but it
does not have standing authority to push, accept an RC, publish packages, move
dist-tags, mutate a GitHub release, or perform S14 stable publication. Generic
execution authorization is intentionally insufficient. The ledger records a
separate external action and artifact hash; S13 and S14 can pass only after a
user-authorized protected release workflow has completed and its registry
evidence has been deliberately reconciled into the ledger.
