# Stopcock 2.0 execution ledger

This is the durable resumability record for the canonical Stopcock 2.0
superplan. It is deliberately separate from the architecture plan: the
superplan defines what must happen, while this file records what has actually
happened.

Execution authorization: AUTHORIZED
External mutation authorization: NONE
External authorized action: NONE
External authorized artifact: NONE
Programme status: IN_PROGRESS
Base release ref: 624b25bc0cd226178bd46294d60b1a337fa11aee
Execution branch: codex/stopcock-v2
Execution worktree: /Users/tomdeakin/IdeaProjects/lay-some-pipe-stopcock-v2
Current canonical stage: S0R
Current slice: REMEDIATE_ASYNC_SOURCE_TYPES_AND_PACKAGE_METADATA
Last verified commit: 044dd5c39666fb204911c43f0b4898ee007f3846
Last controller run: 2026-07-24

Do not change `Execution authorization` to `AUTHORIZED` merely because the
workflow has been installed. It changes only after the user explicitly asks to
start execution from a named, frozen base.

`Execution authorization` covers local implementation only. RC or stable
registry mutation requires a separate action-and-artifact-specific user
authorization recorded in the three external fields above, execution through
the protected external release workflow, and a deliberate setup commit that
records `COMPLETED` only after registry evidence has been reconciled. The local
controller never performs that external mutation itself.

## Start gate

- [x] The current 1.x release decision is complete.
- [x] The exact base release ref is recorded above.
- [x] The workflow scaffold and canonical superplan are committed and available
      from that base or an explicitly identified setup commit.
- [x] A dedicated non-protected execution branch and isolated worktree exist.
- [x] The exact execution worktree is trusted by Codex, so its project config
      and custom agents are active.
- [x] The execution worktree is clean.
- [x] Both preserved source-plan SHA-256 values match the hashes recorded in the
      canonical superplan.
- [x] The user has explicitly authorized implementation to begin.
- [x] `Execution authorization` is `AUTHORIZED`.

## Canonical stage status

Allowed status values are `NOT_STARTED`, `IN_PROGRESS`, `CHECKPOINT_PENDING`,
`GATE_PASSED`, `STOPPED_BY_PLAN`, and `BLOCKED`.

| Stage | Status      | Verified commit or evidence                                                                                                                    |
| ----- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| S0    | GATE_PASSED | Contracts checkpoint `dcf054568bc71f031b5a4b43ec152bf09a00866c`; package-cohort readiness inventory validated with three explicit S0R blockers |
| S0R   | IN_PROGRESS | Conditional stage; shared readiness-transition test added to every frozen package-remediation target                                           |
| S0B   | NOT_STARTED | —                                                                                                                                              |
| S1A   | NOT_STARTED | Consumer, size, and topology evidence                                                                                                          |
| S1B   | NOT_STARTED | Dedicated performance-profile qualification                                                                                                    |
| S1C   | NOT_STARTED | Frozen runtime, startup, and memory baselines                                                                                                  |
| S2    | NOT_STARTED | Requires independent `v2_verifier` audit                                                                                                       |
| S3A   | NOT_STARTED | Initializer purity                                                                                                                             |
| S3B   | NOT_STARTED | Untagged internal duals                                                                                                                        |
| S4    | NOT_STARTED | —                                                                                                                                              |
| S5A   | NOT_STARTED | Trusted provenance                                                                                                                             |
| S5B   | NOT_STARTED | Measured retention policy                                                                                                                      |
| S6    | NOT_STARTED | —                                                                                                                                              |
| S7    | NOT_STARTED | Requires independent `v2_verifier` audit                                                                                                       |
| S8    | NOT_STARTED | —                                                                                                                                              |
| S9    | NOT_STARTED | —                                                                                                                                              |
| S10   | NOT_STARTED | Requires independent `v2_verifier` audit                                                                                                       |
| S10X  | NOT_STARTED | Conditional optimizer extraction                                                                                                               |
| S10J  | NOT_STARTED | Optimizer topology decision                                                                                                                    |
| S11   | NOT_STARTED | —                                                                                                                                              |
| P1A   | NOT_STARTED | Array Iter kernels                                                                                                                             |
| P1B   | NOT_STARTED | Typed-array Iter admission                                                                                                                     |
| P2    | NOT_STARTED | Typed-array policy                                                                                                                             |
| P3A   | NOT_STARTED | Allocation evidence infrastructure                                                                                                             |
| P3B   | NOT_STARTED | Measured allocation strategies                                                                                                                 |
| P4    | NOT_STARTED | Object, Record, and Map candidates                                                                                                             |
| DISP  | NOT_STARTED | Optional-candidate dispositions                                                                                                                |
| S12P  | NOT_STARTED | —                                                                                                                                              |
| S12   | NOT_STARTED | —                                                                                                                                              |
| S13   | NOT_STARTED | External RC publication remains user-authorized                                                                                                |
| S14   | NOT_STARTED | Stable acceptance and publication remain user-authorized                                                                                       |

## Progress

- [x] (2026-07-24) Installed the dormant project-scoped Codex workflow.
- [x] (2026-07-24) Froze and recorded base commit
      `624b25bc0cd226178bd46294d60b1a337fa11aee`.
- [x] (2026-07-24) Created and trusted the isolated
      `codex/stopcock-v2` worktree and authorized future execution.
- [x] (2026-07-24) Began S0 after independently rechecking every start-gate
      item against the live checkout.
- [x] (2026-07-24) Implemented and focused-validated the additive S0
      architecture, root-migration, eager/lazy `flatMap`, and public-tag
      characterization slice.
- [x] (2026-07-24) Checkpointed the validated S0 contracts slice as
      `dcf054568bc71f031b5a4b43ec152bf09a00866c`.
- [x] (2026-07-24) Repaired the linked-worktree checkpoint boundary with a
      trusted outer helper, exact staged/tree digests, and idempotent recovery.
- [x] Complete the S0 package-cohort/readiness slice.
- [x] (2026-07-24) Enumerated all 21 package manifests into the checked-in S0
      readiness inventory: 20 public packages plus private Synth.
- [x] (2026-07-24) Recorded `@stopcock/async`, `@stopcock/date`, and
      `@stopcock/diff` as explicit source-type/build blockers and bound each to
      a predecessor-recorded, literal-package S0R scope.
- [x] (2026-07-24) Reproduced the first S0R Async source-type blocker and
      traced the smallest package-local implementation and metadata repair.
- [x] (2026-07-24) Stopped before package edits after an independent
      `v2_verifier` audit proved that the immutable Async target cannot produce
      an independently test-valid readiness transition.
- [x] (2026-07-24) Added the exact shared readiness-transition test to all
      three predecessor-owned S0R package targets and resumed S0R without
      widening any target from inside its remediation iteration.

## Evidence log

- Start-gate evidence:
  - live branch `codex/stopcock-v2`;
  - live worktree
    `/Users/tomdeakin/IdeaProjects/lay-some-pipe-stopcock-v2`;
  - live HEAD `6d6bdc03e4d6fdb987685b6b3507e7baa08a3309`;
  - frozen base `624b25bc0cd226178bd46294d60b1a337fa11aee` is
    an ancestor;
  - startup status was clean;
  - performance source-plan SHA-256
    `e5b6c1a8bc2f7b72b65e85d07a8c9289b56c496b54050cf7a6e5b6ee6d5fc10e`;
  - size source-plan SHA-256
    `dc7127ee67dab6ae2f32caffe55425c6ffaf4da8ee8c02c3705cbd674dc47fbf`.
- Local checkpoint evidence:
  - `dcf054568bc71f031b5a4b43ec152bf09a00866c`
    (`test(fp): freeze 2.0 cross-tier semantics`) contains only the five S0
    contract files and this ledger.
- S0 contracts focused validation:
  - the focused Vitest run passed 3 files and 27 tests:

    ```sh
    bunx vitest run \
      packages/fp/src/__tests__/v2-boundary-contract.test.ts \
      packages/fp/src/__tests__/v2-tag-authority-characterization.test.ts \
      packages/fp-compiler/src/__tests__/v2-flatmap-contract.test.ts
    ```

  - `bun run --cwd packages/fp check:source` passed;
  - `bun run --cwd packages/fp check:types` passed, including the root
    type-export import contract;
  - `bun run --cwd packages/fp-compiler check:source` passed;
  - focused `vp fmt ... --check` passed;
  - the independent `v2_test_runner` produced the initial 21-test and source
    type-check evidence and made no source edits;
  - the outer recovery review strengthened the fixtures, added the root
    type-import contract, and independently re-ran the 27-test, type, format,
    build, pack, and packed-import evidence recorded above.
- Environment recovery/evidence:
  - initial `vp run build:packages` could not resolve `vite-plus`;
  - `bun install --frozen-lockfile` restored the exact locked dependency set
    without changing tracked files;
  - a retry reached package execution but the task orchestrator could not
    create its sandboxed communication channel (`Operation not permitted`);
  - direct FP and FP-compiler builds via
    `node ../../tooling/build-package.mjs` passed and produced only ignored
    `dist` artifacts;
  - `bun pm pack --destination <temporary-directory>` produced real tarballs
    for `@stopcock/fp@1.0.0` and `@stopcock/fp-compiler@0.0.0`;
  - the final FP tarball contains no test or fixture artifact;
  - extracted packed FP execution and packed FP-compiler import both passed.
- Controller-repair evidence:
  - `bun run test:controller` passed 19 focused safety tests covering
    checkpoint application, three crash-recovery boundaries, trusted-helper
    substitution, ignored state, every static and dynamic stage scope,
    dependency transitions, durable blockers, S13 version policy, and S14
    completion;
  - `shellcheck tooling/run-stopcock-v2-controller.sh`, JavaScript and shell
    syntax checks, JSON parsing, `git diff --check`, and focused `vp fmt
--check` all passed.
- S0 package-cohort/readiness evidence:
  - `tooling/check-stopcock-v2-package-cohort-readiness.mjs --check` enumerated
    every live `packages/*/package.json` exactly once and validated the
    manifest-set SHA-256
    `sha256:4baee38a8b79d0eb58e2b2636b631526552a4834329e36bedfcdbf3faee31d2c`;
  - the inventory contains all 20 canonical public packages and private
    `@stopcock/synth`, every declared export, package-local build/type/test/pack
    command, internal Stopcock dependency/peer, README/LICENSE/changelog state,
    and an explicit disposition;
  - all eight public `0.0.0` packages passed independent source-type and direct
    build probes and have pending first-release changeset provenance where a
    changelog does not yet exist;
  - source-type and declaration builds fail closed for `@stopcock/async`,
    `@stopcock/date`, and `@stopcock/diff`; Async also has an existing
    `CHANGELOG.md` absent from its package files allowlist;
  - dependency-ordered retries proved the initial Autodiff, Color, and Img
    missing-LA failures were build-order artifacts rather than package
    blockers;
  - `--require-ready` rejects promotion with the exact three blocked public
    packages;
  - the focused readiness test command passed 9 tests covering the live
    inventory plus omission, duplication, unexpected membership, invalid
    `0.0.0` disposition, peer-state drift, manifest-hash drift, missing dynamic
    scope, and fail-closed promotion:

    ```sh
    node --test tooling/__tests__/stopcock-v2-package-cohort-readiness.test.mjs
    ```

  - the independent `v2_test_runner` re-ran the 3-file/27-test frozen S0
    semantic suite, FP source/types, FP-compiler source types, the 19-test
    controller safety suite, focused formatting, and `git diff --check`; all
    passed after mechanical formatting;
  - the broad root `test:packages` command remains unsuitable as S0 readiness
    evidence: it includes benchmark gates, encountered two pre-existing pinned
    benchmark-byte failures, and the sandboxed task orchestrator could not
    create its communication channel. Bounded direct package commands provided
    the disposition evidence instead.
- S0R Async pre-implementation audit:
  - startup HEAD was
    `04460afad794b78bbac9834c67dbc67b77ff58ae`, with a clean worktree on the
    recorded branch and isolated worktree;
  - both preserved source-plan hashes matched the canonical pins, the frozen
    base and last verified commit were ancestors, and the trusted project
    configuration plus custom agents were active;
  - `vp exec tsc -p tsconfig.json --noEmit` from `packages/async` reproduced
    the three recorded TS2322 failures at `src/task.ts:94`, `src/task.ts:124`,
    and `src/task.ts:140`;
  - the smallest runtime-preserving repair is confined to narrow Async-local
    typing adapters for `map`, `tap`, and `mapError`, plus packing the existing
    `CHANGELOG.md`;
  - the starting-HEAD `async-source-types` target permits only
    `packages/async/**` and the readiness inventory;
  - the currently green 9-test readiness suite hard-codes all three original
    blockers in its live-inventory and `--require-ready` assertions, so
    clearing Async's disposition necessarily makes that checked-in test fail;
  - the readiness test is outside the immutable target, and S0R is forbidden
    from editing or widening that target during its own iteration;
  - the independent `v2_verifier` returned `BLOCKED`; no package, inventory,
    dynamic-scope, test, generated, or ignored source file was changed.
- S0R predecessor scope repair:
  - `async-source-types`, `date-source-types`, and `diff-source-types` now each
    admit exactly their literal package, the shared readiness inventory, and
    `tooling/__tests__/stopcock-v2-package-cohort-readiness.test.mjs`;
  - no package implementation, readiness disposition, test assertion, or
    controller policy changed in the setup checkpoint.

## Surprises and discoveries

- The canonical plan originally lived under an ignored `/docs/` directory.
  The repository ignore rules now expose it and its two hash-pinned source plans
  so all three can be committed and made available to isolated worktrees.
- Current eager `Array.flatMap` behavior is not uniform across internal
  execution surfaces. Generated direct execution and the build compiler use
  the frozen indexed-Array contract; `interpret.ts`, portable lowering, and
  multi-step runtime `compile()` also consume arbitrary returned iterables and
  observe some live lengths. The independent S0 fixture records those surfaces
  as ineligible comparison oracles until they conform.
- The project task orchestrator requires an IPC/communication facility denied
  by the current sandbox. Direct bounded package commands remain usable.
- The worktree's Git metadata is stored at
  `/Users/tomdeakin/IdeaProjects/lay-some-pipe/.git/worktrees/lay-some-pipe-stopcock-v2`,
  outside the writable root. Source writes work, but Git cannot create
  `index.lock`.
- The first real FP tarball exposed
  `dist/__tests__/v2-contract-fixtures.d.ts`. Moving the executable fixture to
  `.mts` kept it outside the package build inputs; the rebuilt and repacked
  artifact contains no test fixture.
- The first public-tag characterization only collected observed forged values
  and would pass without proving the authority problem. It now asserts that
  every registered forged opcode and binding is accepted by the current 1.x
  planner, while remaining explicitly characterized as a vulnerability rather
  than a desired 2.0 contract.
- The nominal root `test:packages` command also discovers benchmark tests, so
  it is not a package-readiness-only lane. Its current pinned-byte failures do
  not substitute for or erase the per-package source/build results.
- Autodiff, Color, and Img require their internal LA dependency to be built
  before declaration resolution. Their first direct probes failed only because
  the audit ran alphabetically; all three passed when retried after LA.
- The current FP dual return type is not assignable to several explicit
  dependent-package overload surfaces under the repository's TypeScript
  toolchain. Async, Date, and Diff are the only persistent source/build
  failures found by the complete public-package probe.
- The focused readiness test encodes the mutable three-package blocker list.
  The original predecessor-recorded S0R targets omitted that shared test path;
  the explicit setup checkpoint resolved the omission for all three targets
  before any package remediation resumed.

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

- Decision: Use `624b25bc0cd226178bd46294d60b1a337fa11aee` as
  the frozen product/docs base and `e51a61976c6f189265a0691743a0c1129cfb6405`
  as the setup-bearing execution branch starting point.
  Rationale: The latter is a single descendant commit containing only the
  dormant controller scaffold and its three preserved plan artifacts.
  Date: 2026-07-24.

- Decision: Freeze eager `Array.flatMap` as an indexed returned-Array contract
  and lazy `Iter.flatMap` as the arbitrary-iterable/IteratorClose contract.
  Rationale: This is the canonical semantic boundary; current internal
  divergences are recorded rather than promoted to oracle behavior.
  Date: 2026-07-24.

- Decision: Approve a same-package private
  `WeakMap<Function, TrustedOperatorMetadata>` or equivalently unforgeable
  provenance mechanism populated only by generated internal factories.
  Rationale: Public `_op`, `_fn`, `_a1`, and `_a2` fields are mutable,
  forgeable compatibility data and cannot authenticate an optimized lowering.
  Date: 2026-07-24.

- Decision: Map every current root value and type export to the pinned 2.0
  sequential, fusion, fusion-debug, dual, Option, or Result destination without
  changing the live root in S0.
  Rationale: S8 owns the atomic runtime/export cutover; S0 only freezes its
  complete migration contract.
  Date: 2026-07-24.

- Decision: Keep implementation inside `workspace-write` and move scoped local
  checkpoint application into the outer launcher.
  Rationale: Noninteractive Codex cannot surface a fresh approval, and Git
  metadata remains protected in `workspace-write`. A schema-validated handoff
  preserves the sandbox while allowing the already-authorized outer process to
  create exact local checkpoints.
  Date: 2026-07-24.

- Decision: Treat a package as S0 `ready` only when its static release surface
  is complete and the recorded source-type/direct-build probe passes; reserve
  scoped correctness, pack, clean-install, and declared-export proof for the
  S0R exit gate.
  Rationale: S0 must expose real blockers without duplicating S0B's cohort
  packer or pretending that the root benchmark-inclusive test command is a
  package-readiness lane.
  Date: 2026-07-24.

- Decision: Record three immutable S0R dynamic targets:
  `async-source-types`, `date-source-types`, and `diff-source-types`.
  Rationale: Each target names one literal package and the shared readiness
  inventory, so later remediation cannot expand into another package or widen
  its own scope.
  Date: 2026-07-24.

- Decision: Stop the first S0R iteration before Async implementation and
  request a ledger-only blocked checkpoint.
  Rationale: Marking Async ready must refresh the live inventory, which
  deterministically breaks a checked-in readiness test that the frozen target
  cannot edit. Keeping Async blocked would not complete the remediation, and
  checkpointing a known failing product would violate the canonical slice
  invariant.
  Date: 2026-07-24.

## Current blockers

- `@stopcock/async` fails source types and declaration build at
  `src/task.ts:94`, `src/task.ts:124`, and `src/task.ts:140`; its existing
  changelog is also absent from the packed-files allowlist.
- `@stopcock/date` fails source types and declaration build in `src/range.ts`
  and `src/tz.ts`.
- `@stopcock/diff` fails source types and declaration build at
  `src/apply.ts:116` and `src/apply.ts:129`.

These are S0R remediation blockers. They block S0B, not the completed S0
inventory/contract gate.

- The former frozen-scope conflict is resolved by the predecessor setup
  checkpoint. The exact shared transition test is now inside every affected
  S0R target while the target contract remains immutable during each package
  remediation iteration.

## Exact next action

Resume `async-source-types` from a clean worktree. Repair only Async-local
source typing and packed changelog metadata, update the shared readiness
inventory and exact transition assertion, and rerun the scoped
correctness/type/build/pack/import/readiness gates without editing the
dynamic-scope contract.

## Outcomes and retrospective

Execution started and the first additive S0 slice is source-, type-,
distribution-, and pack-valid at
`dcf054568bc71f031b5a4b43ec152bf09a00866c`. No production runtime, generated
output, public export, package version, lockfile, or external release state has
changed.

S0 now has a machine-checked 21-package cohort/readiness contract, a complete
public FP-dependant register, an explicit assertion for the intentional
pre-S0B version mismatch, and durable S0R scope targets for every discovered
blocker. This slice changes no package runtime, public export, package version,
lockfile, generated product output, or external state.

The first S0R controller iteration stopped before implementation because the
predecessor-recorded target cannot keep the state-coupled readiness test green
while clearing Async's disposition. The blocked checkpoint is ledger-only; no
invalid package or inventory work is being handed to the launcher.

The predecessor setup checkpoint resolves that scope omission without changing
Async or weakening the readiness gate. S0R is ready to resume from the same
literal `async-source-types` target.
