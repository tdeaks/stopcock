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
Current canonical stage: S0B
Current slice: ALIGN_LIVE_2_0_NEXT_COHORT
Last verified commit: 03db3708ca8dd3aae8129c15555758cda0919035
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

| Stage | Status             | Verified commit or evidence                                                                                                                                                                                                                                                                                                                                                            |
| ----- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0    | GATE_PASSED        | Contracts checkpoint `dcf054568bc71f031b5a4b43ec152bf09a00866c`; package-cohort readiness inventory validated with three explicit S0R blockers                                                                                                                                                                                                                                         |
| S0R   | GATE_PASSED | Conditional stage; shared readiness-transition test added to every frozen package-remediation target; Async ready; Date/Diff remain; Date remediation passed with truthful length-dispatched overloads and packed consumers; only Diff remains; Diff remediation passed source, type, build, package, packed-consumer, and independent validation; all 21 library workspaces are ready |
| S0B   | IN_PROGRESS | —; deterministic cohort version authority implemented and independently validated; live package manifests and lockfile remain unchanged; immutable single-build cohort packer and exact packed-manifest checker implemented and independently validated; private Synth packed-dependency compatibility runner implemented and independently validated; credential-free deterministic cohort changelog rendering implemented and independently validated after the live alignment failed closed |
| S1A   | NOT_STARTED        | Consumer, size, and topology evidence                                                                                                                                                                                                                                                                                                                                                  |
| S1B   | NOT_STARTED        | Dedicated performance-profile qualification                                                                                                                                                                                                                                                                                                                                            |
| S1C   | NOT_STARTED        | Frozen runtime, startup, and memory baselines                                                                                                                                                                                                                                                                                                                                          |
| S2    | NOT_STARTED        | Requires independent `v2_verifier` audit                                                                                                                                                                                                                                                                                                                                               |
| S3A   | NOT_STARTED        | Initializer purity                                                                                                                                                                                                                                                                                                                                                                     |
| S3B   | NOT_STARTED        | Untagged internal duals                                                                                                                                                                                                                                                                                                                                                                |
| S4    | NOT_STARTED        | —                                                                                                                                                                                                                                                                                                                                                                                      |
| S5A   | NOT_STARTED        | Trusted provenance                                                                                                                                                                                                                                                                                                                                                                     |
| S5B   | NOT_STARTED        | Measured retention policy                                                                                                                                                                                                                                                                                                                                                              |
| S6    | NOT_STARTED        | —                                                                                                                                                                                                                                                                                                                                                                                      |
| S7    | NOT_STARTED        | Requires independent `v2_verifier` audit                                                                                                                                                                                                                                                                                                                                               |
| S8    | NOT_STARTED        | —                                                                                                                                                                                                                                                                                                                                                                                      |
| S9    | NOT_STARTED        | —                                                                                                                                                                                                                                                                                                                                                                                      |
| S10   | NOT_STARTED        | Requires independent `v2_verifier` audit                                                                                                                                                                                                                                                                                                                                               |
| S10X  | NOT_STARTED        | Conditional optimizer extraction                                                                                                                                                                                                                                                                                                                                                       |
| S10J  | NOT_STARTED        | Optimizer topology decision                                                                                                                                                                                                                                                                                                                                                            |
| S11   | NOT_STARTED        | —                                                                                                                                                                                                                                                                                                                                                                                      |
| P1A   | NOT_STARTED        | Array Iter kernels                                                                                                                                                                                                                                                                                                                                                                     |
| P1B   | NOT_STARTED        | Typed-array Iter admission                                                                                                                                                                                                                                                                                                                                                             |
| P2    | NOT_STARTED        | Typed-array policy                                                                                                                                                                                                                                                                                                                                                                     |
| P3A   | NOT_STARTED        | Allocation evidence infrastructure                                                                                                                                                                                                                                                                                                                                                     |
| P3B   | NOT_STARTED        | Measured allocation strategies                                                                                                                                                                                                                                                                                                                                                         |
| P4    | NOT_STARTED        | Object, Record, and Map candidates                                                                                                                                                                                                                                                                                                                                                     |
| DISP  | NOT_STARTED        | Optional-candidate dispositions                                                                                                                                                                                                                                                                                                                                                        |
| S12P  | NOT_STARTED        | —                                                                                                                                                                                                                                                                                                                                                                                      |
| S12   | NOT_STARTED        | —                                                                                                                                                                                                                                                                                                                                                                                      |
| S13   | NOT_STARTED        | External RC publication remains user-authorized                                                                                                                                                                                                                                                                                                                                        |
| S14   | NOT_STARTED        | Stable acceptance and publication remain user-authorized                                                                                                                                                                                                                                                                                                                               |

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
- [x] (2026-07-24) Repaired Async's three higher-rank `dual` overload
      assignments without changing runtime behavior, packed its existing
      changelog, and independently validated its complete current-version
      package surface.
- [x] (2026-07-24) Repaired Date's false range and optional-disambiguation
      overloads with Date-local length dispatch, added source and packed
      consumer contracts, and independently validated its complete
      current-version package surface.
- [x] (2026-07-24) Repaired Diff's two rank-2 `dual` overload assignments with
      package-local declaration assertions, added source and packed consumer
      contracts, and independently validated its complete current-version
      package surface.
- [x] (2026-07-24) Completed S0R with all 20 base public packages and private
      Synth's bounded compatibility prerequisites marked ready; the
      fail-closed readiness promotion gate reports no blocker.
- [x] (2026-07-24) Implemented and independently validated S0B's deterministic
      cohort version authority, filtered Changesets integration, transactional
      private-byte preservation, and guarded root command surface without
      aligning the live manifests or lockfile.
- [x] (2026-07-24) Implemented and independently validated S0B's immutable
      cohort packer and packed-manifest checker with deterministic dependency
      order, exact workspace/packed identity, content-addressed development
      evidence, and private Synth exclusion.
- [x] (2026-07-24) Implemented and independently validated S0B's private Synth
      compatibility runner against exact packed FP/Signal dependency closures,
      copied live Synth source, and a bounded source-type/runtime contract
      without aligning live manifests, rebuilding Synth WASM, or publishing.
- [x] (2026-07-24) Attempted the exact live `2.0.0-next.0` alignment; the
      configured GitHub changelog adapter required unavailable credentials, and
      the cohort transaction restored every controlled file to its starting
      bytes.
- [x] (2026-07-24) Implemented and independently validated an execution-only,
      deterministic local Changesets changelog renderer for every cohort
      mutation without changing the repository's normal Changesets config,
      package manifests, changelogs, prerelease state, or lockfile.

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
- S0R Async remediation:
  - startup HEAD was
    `7caa01afc44ac161c06af05b218d615d7d1bd65f`, with a clean worktree on the
    recorded branch and isolated worktree;
  - both preserved source-plan hashes matched the canonical pins, the frozen
    base and last verified commit were ancestors, and the trusted project
    configuration plus the `v2_explorer` and `v2_test_runner` agents were
    active;
  - the initial source-type probe reproduced exactly three TS2322 failures at
    `src/task.ts:94`, `src/task.ts:124`, and `src/task.ts:140`;
  - narrow declaration-site overload assertions now preserve the existing
    `dual(2, ...)` runtime calls for `map`, `tap`, and `mapError`, while focused
    type contracts cover both data-first and data-last error-channel inference;
  - `vp exec tsc -p tsconfig.json --noEmit` and
    `vp exec tsc -p tsconfig.type-tests.json` passed;
  - the declared `vp run build` wrapper was denied before task execution by
    the already-recorded sandbox communication restriction; its exact
    configured command, `node ../../tooling/build-package.mjs`, passed and
    produced the package runtime plus declarations;
  - `vp test run` passed 7 files and 99 tests, including the real tarball,
    every declared runtime entry, behavior smoke tests, and packed declaration
    consumers under Bundler and NodeNext resolution;
  - the Async tarball now includes its existing `CHANGELOG.md` alongside
    `README.md` and `LICENSE`, with no source or test artifact;
  - the readiness inventory validates all 21 package records and now reports
    exactly `@stopcock/date` and `@stopcock/diff` as blocked;
  - the focused readiness command passed 9 tests, while `--require-ready`
    failed closed with exactly those two remaining blockers;
  - an independent `v2_test_runner` repeated source types, public type
    contracts, the direct build, the 99-test package/pack suite, readiness,
    formatting, and diff checks without source edits; all required positive
    gates passed and the two-package fail-closed result matched;
  - focused formatting and `git diff --check` passed, and every non-ledger
    dirty path remains inside the immutable `async-source-types` target.
- S0R Date remediation:
  - startup HEAD was
    `0973fb61d0407f7868bee16bcf7a2ab300d09cd3`, with a clean worktree on the
    recorded branch and isolated worktree;
  - both preserved source-plan hashes matched the canonical pins, the frozen
    base and last verified commit were ancestors, and the trusted project
    configuration plus the `v2_explorer` and `v2_test_runner` agents were
    active;
  - the initial source-type probe reproduced exactly 10 TypeScript failures in
    `src/range.ts` and `src/tz.ts`;
  - `range` and `rangeBy` now publish the unary data-last forms their existing
    `dual(4)` runtime actually implements;
  - Date-local three- and four-argument wrappers now preserve
    `arguments.length` dispatch, forward optional disambiguation in data-first
    calls, retain default-disambiguation data-last calls, and deliberately
    reject ambiguous data-last-with-disambiguation forms;
  - focused public type contracts cover both supported call forms and reject
    the former false overloads; the fall-back-fold runtime test proves
    explicit `earlier` and `later` disambiguation select timestamps one hour
    apart;
  - `vp exec tsc -p tsconfig.json --noEmit` and
    `vp exec tsc -p tsconfig.type-tests.json` passed;
  - the declared `vp run build` wrapper was denied before task execution by
    the already-recorded sandbox communication restriction; its exact
    configured command, `node ../../tooling/build-package.mjs`, passed and
    produced the package runtime plus declarations;
  - `vp test run` passed 16 files and 331 tests, including the real tarball,
    declared root runtime, behavior smoke tests, and packed declaration
    consumers under Bundler and NodeNext resolution;
  - the independently repacked 39-file tarball was 17.20 kB with Bun shasum
    `9259d6f5275a13683ef2272ff9c6e72573a2f020`; it includes the packaged
    `Unreleased` migration note and excludes source and tests;
  - the readiness inventory validates all 21 package records and now reports
    exactly `@stopcock/diff` as blocked;
  - the focused readiness command passed 9 tests, while `--require-ready`
    failed closed with exactly that remaining blocker;
  - the independent `v2_test_runner` repeated the 331-test package/pack suite,
    readiness, formatting, and diff checks without source edits;
  - the independent `v2_verifier` returned `PASS`, including confirmation that
    the existing pending Date patch changesets plus the packaged migration note
    satisfy this corrective slice;
  - focused formatting and `git diff --check` passed, and every non-ledger
    dirty path remains inside the immutable `date-source-types` target.
- S0R Diff remediation:
  - startup HEAD was
    `a9697d72ff81d9bf5647d52a8d73adae96e58dcd`, with a clean worktree on the
    recorded branch and isolated worktree;
  - both preserved source-plan hashes matched the canonical pins, the frozen
    base and last verified commit were ancestors, and the trusted project
    configuration plus the `v2_explorer` and `v2_test_runner` agents were
    active;
  - the initial source-type probe reproduced exactly two TS2322 failures at
    `src/apply.ts:116` and `src/apply.ts:129`;
  - Diff-local declaration-site assertions preserve the existing generic
    data-first/data-last overloads and unchanged `dual(2, ...)` runtime calls
    for `apply` and `applyUnsafe`;
  - `vp exec tsc -p tsconfig.json --noEmit` and
    `vp exec tsc -p tsconfig.type-tests.json` passed;
  - the declared `vp run build` wrapper was denied before task execution by
    the already-recorded sandbox communication restriction; its exact
    configured command, `node ../../tooling/build-package.mjs`, passed and
    produced the package runtime plus declarations;
  - `vp test run` passed 10 files and 151 tests, including the real tarball,
    extracted root runtime in both call forms, existing correctness coverage,
    and packed declaration consumers under Bundler and NodeNext resolution;
  - the independently repeated 29-file Diff tarball was 9.39 kB and the
    primary run recorded Bun shasum
    `ec493a9bab9ea786f1a27093c89ab851e3ed32f7`; it includes README,
    CHANGELOG, and LICENSE and excludes source and tests;
  - the readiness inventory validates all 21 package records with no blocker;
    both `--check` and `--require-ready` passed;
  - an independent `v2_test_runner` repeated source types, public type
    contracts, the direct build, the 151-test package/pack suite, readiness,
    formatting, diff, and immutable-scope checks without tracked-file edits;
    all passed;
  - focused formatting and `git diff --check` passed, and every non-ledger
    dirty path remains inside the immutable `diff-source-types` target.
- S0B cohort version authority:
  - startup HEAD was
    `76cb1a595c220fb9292efe88feb8f550efb69aeb`, with a clean worktree on the
    recorded branch and isolated worktree;
  - the frozen base and prior verified commit were ancestors, both preserved
    source-plan hashes matched the canonical pins, and the trusted project
    configuration plus custom Stopcock 2.0 agents were active;
  - `tooling/v2-cohort.mjs` now derives the selected public inventory, consumes
    the installed Changesets planner through its CLI-scoped dependency graph,
    filters mixed, private-only, and synthetic excluded releases, and provides
    deterministic `plan`, `align-next`, `advance-next`, `join-current`,
    `check`, and evidence-gated `align-stable` operations;
  - mutation operations snapshot and transactionally restore controlled
    Changesets, manifest, changelog, and lockfile bytes on failure, and assert
    excluded private workspace bytes both before and after lockfile work;
  - the focused fixture suite passed 8 tests covering mixed starting versions,
    patch/minor/major changesets, `0.0.0`, initial alignment, advancement,
    conditional optimizer join, rollback, stable exit, exact range
    normalization, private-only changeset retention, missing private versions,
    and filtered synthetic prerelease-exit releases;
  - two live `plan --target 2.0.0-next.0` runs were byte-identical with SHA-256
    `72e9efdabe132e468e939ccfd2d8f281f3bb968b29becc15eeda94f10fb1bdf7`
    and left the worktree unchanged;
  - the readiness gate still reports 21 packages, comprising 20 public
    packages and private Synth, with no blocker;
  - the controller regression suite passed 19 tests, and syntax, focused lint,
    focused formatting, and `git diff --check` all passed;
  - an independent `v2_test_runner` repeated the 8 cohort tests, 19 controller
    tests, readiness, syntax, lint, formatting, diff hygiene, and live plan
    determinism without changing tracked files or leaving a process running;
  - the slice changes only the root command surface, the cohort authority, its
    focused tests, and this ledger. No package manifest, changelog, Changesets
    state, lockfile, generated artifact, runtime source, or external state was
    changed.
- S0B immutable cohort packer:
  - startup HEAD was
    `4c2ee6e48a7532666937322bcc04de142d78c4c1`, with a clean worktree on the
    recorded branch and isolated worktree;
  - the frozen base and prior verified commit were ancestors, both preserved
    source-plan hashes matched the canonical pins, and the trusted project
    configuration plus custom Stopcock 2.0 agents were active;
  - `tooling/v2-pack-cohort.mjs` now derives the selected public inventory,
    builds and packs each package exactly once in deterministic dependency
    order, excludes private Synth, and emits immutable development, candidate,
    or stable-attempt cohort manifests at their canonical paths;
  - the manifest binds the complete canonical build-input set, package source,
    workspace manifest, built distribution, packed manifest, packed
    distribution, internal ranges, export keys, tarball bytes, dependency
    graph, and build order into one content hash;
  - `check-packed` validates the canonical artifact path and schema, exact
    workspace and build-input identity, packed public surface, exact
    same-cohort internal ranges, declared export targets, the package `files`
    allowlist, tarball set and bytes, packed distribution bytes, archive path
    safety, and symlink-free artifact traversal;
  - candidate and release packing fail with pending public changesets,
    candidate mode rejects the local-only `2.0.0-next.0`, and any differing
    artifact at an immutable path is refused rather than overwritten;
  - focused real-Bun fixture coverage proves `workspace:*` normalization,
    dependency-ordered single builds, exact packed ranges, Synth exclusion,
    byte-stable repeated packing, source-drift content addressing, immutable
    tamper refusal, complete build-input enforcement, packed-surface binding,
    undeclared-file rejection, and symlink rejection;
  - the combined cohort, packer, and controller suites passed 29 tests; syntax,
    focused lint, focused formatting, and `git diff --check` all passed;
  - two live `plan --target 2.0.0-next.0` runs remained byte-identical at 11,930
    bytes with SHA-256
    `72e9efdabe132e468e939ccfd2d8f281f3bb968b29becc15eeda94f10fb1bdf7`;
  - both readiness modes still report 21 packages, comprising 20 public
    packages and private Synth, with no blocker;
  - a bounded read-only `v2_explorer` audit returned `PASS` after verifying the
    workspace-to-packed range transformation, root build inputs, archive
    protections, immutable paths, and slice boundary;
  - an independent `v2_test_runner` repeated both syntax checks, all 29 tests,
    both readiness modes, live plan determinism, focused lint and formatting,
    and diff hygiene; HEAD, every dirty path, and every dirty byte remained
    unchanged, and it left no repository artifact or background process;
  - the slice changes only the root command surface, the cohort authority, the
    new packer, its focused test, and this ledger. No package manifest,
    changelog, Changesets state, lockfile, generated cohort artifact, runtime
    source, or external state was changed.
- S0B private Synth compatibility runner:
  - startup HEAD was
    `b41b0bad5f46d66dbfc428022e35abc8ba9de8bb`, with a clean worktree on the
    recorded branch and isolated worktree;
  - the frozen base and prior verified commit were ancestors, both preserved
    source-plan hashes matched the canonical pins, and the trusted project
    configuration plus custom Stopcock 2.0 agents were active;
  - `tooling/v2-synth-compat.mjs` now requires one explicit immutable cohort
    manifest, validates it before and after execution, proves private Synth is
    excluded from the public package set, and refuses a live Synth manifest
    outside the exact aligned cohort;
  - the runner derives Synth's exact non-development dependency closure,
    copies only hash-matched public tarballs into a fresh temporary consumer,
    installs through local `file:` dependencies plus local overrides with an
    unreachable registry, disables lifecycle scripts and shared cache use, and
    verifies every installed manifest byte against the packed evidence;
  - the compatibility contract copies the real private Synth source tree
    without symbolic links, type-checks that copy against the packed
    dependencies, and executes a bounded `pipe` plus Signal-backed wavetable
    and embedded-WASM render smoke without running Cargo, rebuilding WASM, or
    publishing Synth;
  - focused coverage uses the live Synth source tree and real fixture tarballs;
    it proves recursive runtime dependency admission, development-only
    dependency exclusion, non-runtime package exclusion, deterministic
    results, exact cleanup after install/type/runtime failures, invalid or
    missing manifests, public/non-private Synth drift, registry-only
    dependency rejection, tarball tampering, and symlink refusal;
  - the focused runner suite passed 3 tests, and the existing cohort, packer,
    controller, and readiness suites passed 38 tests;
  - both readiness modes still validate 21 package records with no blocker,
    live Synth source types pass, and syntax, focused lint, focused formatting,
    and `git diff --check` all pass;
  - an independent `v2_explorer` audit found no canonical contradiction and
    its three concrete coverage gaps were remediated before final validation;
  - an independent `v2_test_runner` repeated every command above without
    changing HEAD, any dirty path, or any dirty byte, and left no repository
    artifact. Its sandbox denied `ps`, but every assigned command and the
    runner implementation itself use bounded synchronous child processes;
  - the slice changes only the root command surface, the Synth compatibility
    runner, its focused test, and this ledger. No package manifest, changelog,
    Changesets state, lockfile, generated cohort artifact, production source,
    external state, or ignored repository evidence was changed.
- S0B deterministic cohort changelog remediation:
  - startup HEAD was
    `1446dddf2f20f7b63bcecfc920e267f513d2ccc1`, with a clean worktree on the
    recorded branch and isolated worktree;
  - the frozen base and prior verified commit were ancestors, both preserved
    source-plan hashes matched the canonical pins, and the trusted project
    configuration plus custom Stopcock 2.0 agents were active;
  - two pre-mutation live `plan --target 2.0.0-next.0` runs were byte-identical,
    reported 20 public packages plus private Synth, and reported no readiness
    blocker;
  - the exact
    `bun run release:v2:align-next --target 2.0.0-next.0` command reached
    Changesets changelog generation and failed because
    `@changesets/changelog-github` required `GITHUB_TOKEN`; the transaction
    restored every controlled byte, left `.changeset/pre.json` absent, and
    returned the tracked worktree to clean;
  - `loadChangesetsRuntime` now resolves the installed
    `@changesets/cli/changelog` renderer through the same CLI-scoped dependency
    graph as the planner and applier, and `applyNormalizedReleasePlan` supplies
    it through an execution-only cloned config for `align-next`,
    `advance-next`, and `align-stable`;
  - the checked-in `.changeset/config.json` remains unchanged, while the local
    renderer preserves Changeset summaries and normal release/dependency
    sections without GitHub API calls or credentials;
  - the focused fixture now begins with the live GitHub changelog tuple, proves
    the applier receives the deterministic renderer, preserves the original
    config bytes and summary text, restores failed transactions, and produces a
    byte-stable no-write second alignment;
  - the cohort, packer, Synth, and controller suites passed 32 tests; both
    JavaScript syntax checks, focused lint, focused formatting, readiness,
    byte-identical live planning, and `git diff --check` passed;
  - an independent `v2_explorer` traced the credential dependency and confirmed
    the execution-only local renderer as the smallest S0B-scoped remediation;
  - an independent `v2_test_runner` repeated all 32 tests, syntax, lint,
    formatting, two byte-identical live plans, readiness, and diff hygiene
    without changing HEAD or either implementation dirty byte; the pre-ledger
    implementation diff SHA-256 remained
    `101f0fab19f76c1096dc758213ab4b48794c8d60133c90fdb8510333c7618bed`,
    and it left no attributable generated file or background process;
  - this remediation changes only the cohort authority, its focused test, and
    this ledger. No package manifest, package changelog, Changesets state,
    lockfile, generated cohort artifact, runtime source, ignored source,
    external state, or Git metadata was changed.

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
- TypeScript 7 cannot infer the rank-2 error-channel relationship for three
  Async overload assignments through the current generic `dual` return type.
  Declaration-site assertions restore the already-declared public overloads
  without changing `dual`, emitted runtime control flow, or another package's
  remediation scope.
- Date's range overloads advertised binary data-last closures even though the
  existing `dual(4)` runtime returns unary closures with the range end already
  captured. The timezone overloads also advertised optional data-last
  disambiguation forms that the fixed-arity `dual` helpers could not dispatch.
- Optional timezone disambiguation creates an unavoidable arity collision
  between direct default-disambiguation calls and curried explicit-
  disambiguation calls. Preserving length-only dispatch requires keeping the
  former and rejecting the latter instead of introducing value-based dispatch.
- TypeScript 7 likewise collapses Diff's rank-2 generic target type to
  `unknown` through the current generic `dual` result. The intended overloads
  and executable two-argument dispatch were already sound, but Diff had no
  package-local public type or packed-consumer regression contract.
- The installed Changesets implementation exposes the required planner,
  prerelease, and applier modules only through `@changesets/cli`'s isolated
  dependency graph. A CLI-package-scoped `createRequire` reaches those exact
  installed modules without adding or hoisting another dependency.
- The installed prerelease-exit planner really does synthesize excluded
  releases when private workspaces are absent from `preVersions`: the fixture
  observed Synth, a versioned private app, docs, and benchmarks. Filtering
  those releases before the applier is therefore an exercised safety
  requirement rather than a theoretical guard.
- The S10J topology authority has one canonical artifact path,
  `artifacts/v2/optimizer-topology-decision.json`. The cohort authority can
  admit the optional optimizer only from an active prerelease join or a
  schema-valid direct-package decision at that path.
- Bun resolves selected internal `workspace:*` dependencies to the package's
  exact version in a packed manifest. Packed-surface validation must therefore
  model that one packaging transformation while still requiring the exact
  prerelease cohort range in the artifact.
- Package declaration builds inherit `tsconfig.base.json` outside each package
  tree. Reproducible packed identity must hash that root configuration as a
  canonical build input rather than relying only on package-local source.
- Bun does not satisfy an exact transitive dependency inside one local tarball
  merely because the same package is also a top-level `file:` tarball
  dependency. The isolated Synth install therefore needs hash-matched local
  overrides for the complete non-development closure; the unreachable
  registry fixture fails if any edge escapes that closure.
- The live Changesets configuration uses
  `@changesets/changelog-github`, and the installed applier resolves each
  committed Changeset before rendering. Even a local development-cohort
  alignment therefore attempted a GitHub API lookup and required
  `GITHUB_TOKEN`; the original fixture used the credential-free CLI renderer
  and could not expose that live-only failure.
- Cohort mutations correctly require a clean canonical worktree. Once the
  credential-free remediation itself made the worktree dirty, the controller
  could not retry live alignment without weakening that guard; the remediation
  must become its own checkpoint first.

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

- Decision: Repair Async's `map`, `tap`, and `mapError` assignments with
  Async-local declaration-site overload assertions around their unchanged
  `dual` calls.
  Rationale: The failure is a TypeScript representation limit at the package
  boundary. Changing shared FP `dual` would exceed the immutable package target
  and risk unrelated runtime/type behavior, while the local assertions are
  zero-runtime and are covered in both call forms by public type contracts.
  Date: 2026-07-24.

- Decision: Align Date's public overloads with its existing length-dispatched
  runtime and use Date-local optional-argument wrappers for timezone operations.
  Rationale: Casts would preserve false public contracts, while changing shared
  FP `dual` exceeds the immutable target. Length-only dispatch can support
  explicit disambiguation data-first or data-last, not both at the colliding
  arity, so the working direct form and default data-last form remain public.
  Date: 2026-07-24.

- Decision: Repair Diff's `apply` and `applyUnsafe` assignments with
  Diff-local declaration-site overload assertions around their unchanged
  `dual(2, ...)` calls.
  Rationale: The failure is the same TypeScript higher-rank representation
  limit already isolated in Async. Changing shared FP `dual` exceeds the
  immutable package target and risks unrelated behavior, while focused source
  and packed type contracts prove the existing public overloads in both call
  forms.
  Date: 2026-07-24.

- Decision: Do not add a duplicate Diff changeset or migration note for this
  remediation.
  Rationale: The intended public overloads and emitted runtime behavior are
  unchanged, and Diff already has pending major 2.0 and package-metadata
  changesets. The package contract now proves those declarations can actually
  build and ship.
  Date: 2026-07-24.

- Decision: Checkpoint S0B's version authority before any live version,
  changelog, prerelease-state, or lockfile alignment.
  Rationale: The additive authority and its destructive-boundary fixtures form
  an independently valid working slice; packer and Synth evidence must exist
  before the repository's live release metadata is normalized.
  Date: 2026-07-24.

- Decision: Normalize every selected public package to one explicit target,
  use exact internal prerelease peer ranges, use `^2.0.0` stable peer ranges,
  and keep workspace-only source dependency ranges as `workspace:*`.
  Rationale: This prevents ordinary bump arithmetic or npm prerelease semantics
  from splitting the coordinated cohort while preserving source-workspace
  intent.
  Date: 2026-07-24.

- Decision: Admit `@stopcock/fp-optimizer` only through an explicit
  optimizer-naming pending changeset plus active join, or the canonical S10J
  direct-package decision.
  Rationale: Merely discovering a new workspace or an unrelated pending
  changeset cannot be allowed to mutate S0's frozen selected inventory.
  Date: 2026-07-24.

- Decision: Treat all cohort mutations as byte-restorable transactions and
  verify excluded private workspace bytes immediately after filtered
  Changesets application and again after lockfile generation.
  Rationale: A post-lockfile-only assertion cannot distinguish an unsafe
  Changesets mutation from a later lockfile-side effect, and failure recovery
  cannot depend on Git metadata commands inside the controller.
  Date: 2026-07-24.

- Decision: Bind immutable cohort identity to canonical root build inputs,
  package source and distribution trees, workspace and packed manifests,
  packed distribution bytes, dependency topology, and the exact tarballs.
  Rationale: A hash of only workspace metadata or only tarball filenames would
  allow build-config, export, archive-content, or emitted-byte drift to masquerade
  as the same development or release artifact.
  Date: 2026-07-24.

- Decision: Checkpoint the immutable packer and `check-packed` before adding the
  private Synth compatibility runner or normalizing live release metadata.
  Rationale: Real-tar fixture evidence makes the packer an independently valid
  additive slice, while Synth installation and live cohort alignment have
  separate mutation and validation boundaries.
  Date: 2026-07-24.

- Decision: Define S0B's bounded private Synth compatibility contract as a
  copied-source type-check plus one deterministic runtime smoke against only
  the exact packed FP/Signal runtime dependency closure.
  Rationale: This exercises the private dependent's real import/type graph and
  the root `pipe`, Signal-backed wavetable, and embedded-WASM runtime seams
  affected by the 2.0 cohort without expanding a package-compatibility lane
  into Synth implementation work, a Cargo/WASM rebuild, or the full Synth
  suite.
  Date: 2026-07-24.

- Decision: Render every 2.0 cohort mutation with the installed
  `@changesets/cli/changelog` through an execution-only cloned Changesets
  config, while leaving `.changeset/config.json` unchanged.
  Rationale: The cohort authority must preserve pending Changeset text and
  normal changelog sections deterministically without requiring GitHub
  credentials or network access. One shared path also prevents RC and stable
  alignment from silently choosing different changelog bytes.
  Date: 2026-07-24.

- Decision: Checkpoint the deterministic changelog remediation before retrying
  the live initial alignment.
  Rationale: The cohort authority's clean-worktree guard is a required mutation
  boundary. Bypassing or weakening it to combine the remediation with the live
  metadata rewrite would invalidate the controller's provenance guarantees.
  Date: 2026-07-24.

## Current blockers

None. The deterministic version authority, credential-free changelog path,
immutable packer/packed-manifest checker, and private Synth compatibility
runner are independently valid. S0B still owns live cohort alignment and the
complete real packed exit gate before S1 becomes eligible.

## Exact next action

From the clean deterministic-changelog checkpoint, run
`bun run release:v2:align-next --target 2.0.0-next.0` as the next independently
valid S0B slice. Prove the filtered Changesets operation aligns all 20 selected
public manifests plus private Synth, exact internal prerelease ranges,
changelogs/prerelease state, and `bun.lock`; rerun the live Changesets plan
parser and `check-cohort`, then prove the exact second alignment is byte-stable
and writes nothing. Recheck excluded private bytes, but do not pack, publish, or
change production runtime behavior in that alignment slice.

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

The Async remediation now passes its complete current-version package contract
inside the literal `async-source-types` target. Its runtime behavior and public
exports are unchanged; only its source typing, type regressions, packed
changelog contract, readiness state, and focused evidence changed. S0R remains
in progress for the separately scoped Date and Diff blockers.

The Date remediation now passes its complete current-version package contract
inside the literal `date-source-types` target. Its supported runtime behavior
and public exports remain intact; false overloads were corrected, optional
data-first disambiguation now reaches the runtime body, and packed migration
and consumer evidence is checked in. S0R remains in progress for the separately
scoped Diff blocker.

The Diff remediation now passes its complete current-version package contract
inside the literal `diff-source-types` target. Its runtime calls and intended
public overloads are unchanged; package-local assertions make those overloads
declaration-buildable, and source plus packed consumers freeze both call
forms. The complete 20-package public readiness cohort and private Synth
compatibility prerequisites now have no blocked or waived record, so S0R is
complete and S0B is the next canonical stage.

S0B now has an independently valid deterministic version authority with real
Changesets integration, explicit conditional-inventory authority, private-byte
preservation, and transaction rollback. The live package versions, dependency
ranges, changelogs, prerelease state, and lockfile remain untouched, so this is
a partial S0B checkpoint rather than the stage exit. The immutable packer,
packed-manifest checker, private Synth runner, and live aligned cohort remain
ordered follow-up work.

S0B now also has an independently valid immutable cohort packer and exact
packed-manifest checker. A real Bun workspace fixture proves deterministic
single-build packing, exact prerelease dependency materialization,
content-addressed same-version snapshots, and fail-closed archive and overwrite
behavior. Private Synth is asserted and excluded but its packed compatibility
runner remains the next slice; live package versions, ranges, changelogs,
prerelease state, lockfile, and external release state remain untouched.

S0B now also has an independently valid private Synth packed-dependency
compatibility runner. A hermetic real-tar fixture proves that only the exact
non-development dependency closure is installed and that the real Synth source
type-checks and executes its bounded FP/Signal compatibility smoke. Live
package versions, ranges, changelogs, prerelease state, lockfile, generated
cohort artifacts, production source, and external release state remain
untouched, so live `2.0.0-next.0` alignment is the next partial S0B slice.

The first live alignment attempt exposed a credential dependency in the normal
GitHub-enriched Changesets changelog adapter and rolled back without changing
the cohort. S0B now has an independently validated, execution-only deterministic
renderer that preserves the pending Changeset text and leaves the normal
repository config untouched. The clean-worktree mutation guard intentionally
requires this remediation to checkpoint before live alignment is retried; the
package versions, ranges, changelogs, prerelease state, and lockfile therefore
remain unchanged.
