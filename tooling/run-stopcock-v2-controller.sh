#!/usr/bin/env bash

set -euo pipefail

fail() {
  echo "Stopcock 2.0 controller not started: $*" >&2
  exit 2
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" ||
  fail "run this launcher inside the Stopcock Git repository"

cd "$repo_root"

canonical_plan="docs/superpowers/plans/2026-07-24-stopcock-v2-performance-density-superplan.md"
performance_plan="docs/superpowers/plans/2026-07-24-stopcock-fp-performance-frontier-implementation.md"
size_plan="docs/superpowers/plans/2026-07-24-fp-maximum-bundle-size-reduction.md"
ledger="STOPCOCK_V2_PROGRESS.md"
prompt=".codex/prompts/stopcock-v2-controller.md"

for required_file in \
  AGENTS.md \
  .codex/config.toml \
  "$canonical_plan" \
  "$performance_plan" \
  "$size_plan" \
  "$ledger" \
  "$prompt"; do
  [[ -f "$required_file" ]] || fail "missing required file: $required_file"
  git ls-files --error-unmatch "$required_file" >/dev/null 2>&1 ||
    fail "$required_file must be committed before execution"
done

branch="$(git branch --show-current)"
[[ -n "$branch" ]] || fail "detached HEAD is not an execution branch"

case "$branch" in
  main | master | trunk)
    fail "refusing to execute on protected branch '$branch'; use an isolated worktree"
    ;;
esac

[[ -z "$(git status --porcelain --untracked-files=all)" ]] ||
  fail "the execution worktree must be clean"

grep -Fxq "Execution authorization: AUTHORIZED" "$ledger" ||
  fail "execution authorization is not AUTHORIZED in the ledger"

if sed -n '/^## Start gate$/,/^## Canonical stage status$/p' "$ledger" |
  grep -Fq -- "- [ ]"; then
  fail "one or more start-gate checkboxes remain incomplete"
fi

base_ref="$(sed -n 's/^Base release ref: //p' "$ledger" | head -n 1)"
[[ -n "$base_ref" && "$base_ref" != "UNSET" ]] ||
  fail "Base release ref is unset in the ledger"
git rev-parse --verify "${base_ref}^{commit}" >/dev/null 2>&1 ||
  fail "Base release ref '$base_ref' is not a local commit"
git merge-base --is-ancestor "$base_ref" HEAD ||
  fail "Base release ref '$base_ref' is not an ancestor of HEAD"

recorded_branch="$(sed -n 's/^Execution branch: //p' "$ledger" | head -n 1)"
[[ "$recorded_branch" == "$branch" ]] ||
  fail "ledger branch '$recorded_branch' does not match live branch '$branch'"

recorded_worktree="$(sed -n 's/^Execution worktree: //p' "$ledger" | head -n 1)"
[[ "$recorded_worktree" == "$repo_root" ]] ||
  fail "ledger worktree '$recorded_worktree' does not match '$repo_root'"

performance_hash="$(
  shasum -a 256 "$performance_plan" | awk '{print $1}'
)"
[[ "$performance_hash" == "e5b6c1a8bc2f7b72b65e85d07a8c9289b56c496b54050cf7a6e5b6ee6d5fc10e" ]] ||
  fail "performance source-plan hash does not match the canonical plan"

size_hash="$(
  shasum -a 256 "$size_plan" | awk '{print $1}'
)"
[[ "$size_hash" == "dc7127ee67dab6ae2f32caffe55425c6ffaf4da8ee8c02c3705cbd674dc47fbf" ]] ||
  fail "size source-plan hash does not match the canonical plan"

command -v codex >/dev/null 2>&1 || fail "codex CLI is not available"

echo "Starting the authorized Stopcock 2.0 controller in $repo_root on $branch" >&2
exec codex exec \
  --strict-config \
  --sandbox workspace-write \
  -c sandbox_workspace_write.network_access=false \
  - < "$prompt"
