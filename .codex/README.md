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
- `../AGENTS.md` defines repository-wide execution and release boundaries.
- `../tooling/run-stopcock-v2-controller.sh` is a guarded launcher.

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

The launcher refuses protected branches, dirty worktrees, untracked controller
files, an unset or unrelated base, incomplete start-gate checkboxes, missing
source plans, source-hash drift, or missing authorization.

## Resuming

Each run reconstructs state from the canonical plan and tracked ledger rather
than depending on a particular chat session. After an interruption, first
inspect and commit or revert any partial work, update the ledger honestly, make
the worktree clean, and invoke the same launcher again.

Do not use `codex exec resume --last` for this programme: another Codex task may
have become the most recent session. The tracked ledger is the authoritative
resume mechanism.

## External boundary

The controller may implement and locally validate release machinery, but it
does not have standing authority to push, accept an RC, publish packages, move
dist-tags, mutate a GitHub release, or perform S14 stable publication.
