#!/usr/bin/env bash

set -euo pipefail

fail() {
  echo "Stopcock 2.0 controller not started: $*" >&2
  exit 2
}

check_only=false
case "${1:-}" in
  --check)
    check_only=true
    shift
    ;;
  "")
    ;;
  *)
    fail "unknown argument '$1'; supported argument: --check"
    ;;
esac
[[ "$#" -eq 0 ]] || fail "unexpected additional arguments"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" ||
  fail "run this launcher inside the Stopcock Git repository"

cd "$repo_root"

canonical_plan="docs/superpowers/plans/2026-07-24-stopcock-v2-performance-density-superplan.md"
performance_plan="docs/superpowers/plans/2026-07-24-stopcock-fp-performance-frontier-implementation.md"
size_plan="docs/superpowers/plans/2026-07-24-fp-maximum-bundle-size-reduction.md"
ledger="STOPCOCK_V2_PROGRESS.md"
prompt=".codex/prompts/stopcock-v2-controller.md"
result_schema=".codex/schemas/stopcock-v2-controller-result.schema.json"
stage_policy=".codex/policies/stopcock-v2-stage-scopes.json"
checkpoint_helper="tooling/apply-stopcock-v2-checkpoint.mjs"
checkpoint_tests="tooling/__tests__/stopcock-v2-checkpoint.test.mjs"

required_files=(
  .gitignore \
  AGENTS.md \
  .codex/config.toml \
  .codex/agents/v2_explorer.toml \
  .codex/agents/v2_test_runner.toml \
  .codex/agents/v2_verifier.toml \
  "$canonical_plan" \
  "$performance_plan" \
  "$size_plan" \
  "$ledger" \
  "$prompt" \
  "$result_schema" \
  "$stage_policy" \
  "$checkpoint_helper" \
  "$checkpoint_tests"
)

for required_file in "${required_files[@]}"; do
  git ls-files --error-unmatch "$required_file" >/dev/null 2>&1 ||
    fail "$required_file must be committed before execution"
  git cat-file -e "HEAD:$required_file" 2>/dev/null ||
    fail "$required_file is missing from HEAD"
done

verify_control_plane() {
  for required_file in "${required_files[@]}"; do
    [[ -f "$required_file" ]] || fail "missing required file: $required_file"
    [[ "$(git ls-files -v -- "$required_file" | cut -c1)" == "H" ]] ||
      fail "$required_file has assume-unchanged, skip-worktree, or unexpected index state"
    head_blob="$(git rev-parse "HEAD:$required_file")" ||
      fail "cannot resolve committed control-plane file: $required_file"
    [[ "$(git rev-parse ":$required_file")" == "$head_blob" ]] ||
      fail "$required_file differs between HEAD and the index"
    [[ "$(git hash-object -- "$required_file")" == "$head_blob" ]] ||
      fail "$required_file differs between HEAD and the worktree"
  done
}

verify_execution_state() {
  branch="$(git branch --show-current)"
  [[ -n "$branch" ]] || fail "detached HEAD is not an execution branch"

  case "$branch" in
    main | master | trunk)
      fail "refusing to execute on protected branch '$branch'; use an isolated worktree"
      ;;
  esac

  [[ -z "$(git status --porcelain --untracked-files=all)" ]] ||
    fail "the execution worktree must be clean before each controller iteration"
  [[ "$(node "$trusted_checkpoint_helper" --check-workspace)" == "OK" ]] ||
    fail "the execution worktree failed the protected/ignored-state check"

  grep -Fxq "Execution authorization: AUTHORIZED" "$ledger" ||
    fail "execution authorization is not AUTHORIZED in the ledger"
  grep -Fxq "Programme status: IN_PROGRESS" "$ledger" ||
    fail "programme status is not IN_PROGRESS in the ledger"

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
}

command -v codex >/dev/null 2>&1 || fail "codex CLI is not available"
command -v node >/dev/null 2>&1 || fail "Node.js is not available"

git_dir="$(git rev-parse --absolute-git-dir)"
common_git_dir="$(cd "$(git rev-parse --git-common-dir)" && pwd -P)"
[[ -f .git && ! -d .git && "$git_dir" != "$common_git_dir" ]] ||
  fail "execution requires an isolated linked worktree"
controller_result="$git_dir/stopcock-v2-controller-result.json"
controller_lock="$git_dir/stopcock-v2-controller.lock"
controller_lock_pid="$controller_lock/pid"
trusted_checkpoint_helper="$git_dir/stopcock-v2-checkpoint-helper.mjs"

if ! mkdir "$controller_lock" 2>/dev/null; then
  stale_pid=""
  if [[ -f "$controller_lock_pid" ]]; then
    stale_pid="$(tr -d '[:space:]' < "$controller_lock_pid")"
  fi
  if [[ "$stale_pid" =~ ^[0-9]+$ ]] && kill -0 "$stale_pid" 2>/dev/null; then
    fail "another controller is active with PID $stale_pid"
  fi
  rm -f "$controller_lock_pid"
  rmdir "$controller_lock" 2>/dev/null ||
    fail "stale lock has unexpected contents and requires inspection: $controller_lock"
  mkdir "$controller_lock" 2>/dev/null ||
    fail "could not reacquire controller lock: $controller_lock"
fi
printf '%s\n' "$$" > "$controller_lock_pid"
cleanup_controller_lock() {
  rm -f "$trusted_checkpoint_helper"
  rm -f "$controller_lock_pid"
  rmdir "$controller_lock" 2>/dev/null || true
}
trap cleanup_controller_lock EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM

umask 077
git cat-file blob "HEAD:$checkpoint_helper" > "$trusted_checkpoint_helper" ||
  fail "could not materialize the committed checkpoint helper"
chmod 700 "$trusted_checkpoint_helper"

if [[ -e "$controller_result" ]]; then
  if [[ "$check_only" == true ]]; then
    fail "a preserved result requires a normal controller resume: $controller_result"
  fi
  branch="$(git branch --show-current)"
  recovery_action="$(
    node "$trusted_checkpoint_helper" \
      --recover-result "$controller_result" \
      --start-branch "$branch"
  )" || fail "preserved controller result could not be recovered safely"
  case "$recovery_action" in
    CONTINUE)
      rm -f "$controller_result"
      echo "Recovered the interrupted checkpoint; continuing from its clean ledger state." >&2
      ;;
    COMPLETE)
      rm -f "$controller_result"
      echo "Recovered a completed local Stopcock 2.0 checkpoint." >&2
      exit 0
      ;;
    BLOCKED)
      rm -f "$controller_result"
      echo "Recovered a durable Stopcock 2.0 blocker; inspect the ledger." >&2
      exit 3
      ;;
    *)
      fail "recovery helper returned unexpected action '$recovery_action'"
      ;;
  esac
fi

verify_control_plane
node --test "$checkpoint_tests" ||
  fail "the controller safety suite failed"

trust_probe="$(
  codex debug prompt-input STOPCOCK_V2_TRUST_PROBE 2>/dev/null
)" || fail "Codex could not inspect the effective project configuration"
grep -Fq "STOPCOCK_V2_PROJECT_CONFIG_ACTIVE_V1" <<<"$trust_probe" ||
  fail "Codex did not load this worktree's AGENTS.md guidance"
grep -Fq "\"cwd\":\"$repo_root\"" <<<"$trust_probe" ||
  grep -Fq "<cwd>$repo_root</cwd>" <<<"$trust_probe" ||
  fail "Codex prompt inspection did not resolve the exact execution worktree"
# shellcheck disable=SC2016 # Backticks are literal prompt markers.
approval_reviewer_marker='approvals_reviewer` is `auto_review'
grep -Fq "$approval_reviewer_marker" <<<"$trust_probe" ||
  fail "Codex did not activate the project-scoped approval reviewer"
# shellcheck disable=SC2016 # Backticks are literal prompt markers.
sandbox_marker='`sandbox_mode` is `workspace-write`'
grep -Fq "$sandbox_marker" <<<"$trust_probe" ||
  fail "Codex did not activate the required workspace-write sandbox"

verify_execution_state
if [[ "$check_only" == true ]]; then
  echo "Stopcock 2.0 controller preflight passed; no controller iteration started." >&2
  exit 0
fi

while true; do
  verify_execution_state

  controller_start_head="$(git rev-parse HEAD)"
  [[ ! -e "$controller_result" ]] ||
    fail "a controller result unexpectedly exists before the next iteration"

  echo "Starting an authorized Stopcock 2.0 controller iteration at $controller_start_head" >&2
  if ! codex exec \
    --strict-config \
    -c sandbox_workspace_write.network_access=false \
    --output-schema "$result_schema" \
    --output-last-message "$controller_result" \
    - < "$prompt"; then
    fail "controller iteration failed; no checkpoint was applied"
  fi

  [[ -f "$controller_result" ]] ||
    fail "controller returned successfully without a structured result"

  checkpoint_action="$(
    node "$trusted_checkpoint_helper" \
      --result "$controller_result" \
      --start-head "$controller_start_head" \
      --start-branch "$branch"
  )" || fail "controller checkpoint validation or application failed"

  case "$checkpoint_action" in
    CONTINUE)
      rm -f "$controller_result"
      echo "Checkpoint applied; starting the next clean controller iteration." >&2
      ;;
    STOP)
      rm -f "$controller_result"
      echo "Controller stopped without requesting another checkpoint." >&2
      exit 0
      ;;
    COMPLETE)
      rm -f "$controller_result"
      echo "Stopcock 2.0 programme completed its local implementation gates." >&2
      exit 0
      ;;
    BLOCKED)
      rm -f "$controller_result"
      echo "Controller recorded a genuine blocker; inspect the ledger and worktree." >&2
      exit 3
      ;;
    *)
      fail "checkpoint helper returned unexpected action '$checkpoint_action'"
      ;;
  esac
done
