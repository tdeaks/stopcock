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
Current canonical stage: S11R
Current slice: PACKED_COHORT_AND_EXTRACTED_MATRIX
Last verified commit: 9a265f391d4340bf43ca0d87e8bcb6683b0972d7
Last controller run: 2026-07-26

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

| Stage | Status             | Verified commit or evidence                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0    | GATE_PASSED        | Contracts checkpoint `dcf054568bc71f031b5a4b43ec152bf09a00866c`; package-cohort readiness inventory validated with three explicit S0R blockers                                                                                                                                                                                                                                                                            |
| S0R   | GATE_PASSED        | Conditional stage; shared readiness-transition test added to every frozen package-remediation target; Async ready; Date/Diff remain; Date remediation passed with truthful length-dispatched overloads and packed consumers; only Diff remains; Diff remediation passed source, type, build, package, packed-consumer, and independent validation; all 21 library workspaces are ready                                    |
| S0B   | GATE_PASSED        | Aligned 20-package public plus private Synth `2.0.0-next.0` cohort at `551852a06c1c22a2241fb9e3c75815524fdbc9fb`; no-write alignment replay, immutable 20-tarball development artifact `sha256:88526ab370fc4a9cc7227bbca34490320e906939b528f5da7606eecd6f70e0d8`, exact packed checks, 117-export Bun/Node/type consumer, private Synth compatibility, and independent exit validation passed                             |
| S1A   | GATE_PASSED        | Cross-bundler packed consumer, behavior, size, identity, topology, and lower-bound package evidence checkpoint `81ae2c3b0acf8d3dbc2ae5ecbc1d7703fde688d0`; independent consumer and topology audits passed                                                                                                                                                                                                                |
| S1B   | GATE_PASSED        | Local scope only at `0c207b9`; checked-in profile registry, fail-closed host resolution, and repeated no-change qualification. The user descoped self-hosted runner provisioning, so `perf-linux-x64` stays recorded as unprovisioned and hosted CI matches no profile                                                                                                                                                    |
| S1C   | GATE_PASSED        | Frozen lane contract, fail-closed manifest validation, and three-session release manifests for both engines at `cfa0669`; identity-bound raw samples, memory capability matrix, and the pre-approved compact floor recorded before any compact implementation                                                                                                                                                             |
| S2    | GATE_PASSED        | Acyclic canonical semantic/lowering/evidence/receipt generation checkpoint `cad86c15ae64b90a86675bbca96f6bea362d25ff`; complete clean gates and independent `v2_verifier` audit passed                                                                                                                                                                                                                                    |
| S3A   | GATE_PASSED        | Package-wide fail-closed initializer-purity checkpoint `6ced74a4574123a36284d2baaca9cf7f4f449436`; exact packed/local four-bundler size and behavior evidence, two-run reproducibility, full clean release gates, and independent audit passed                                                                                                                                                                            |
| S3B   | GATE_PASSED        | Independent `dualUntagged2/3/4` plus bounded fallback at `f6a62be`; Option, Result, and every other untagged consumer no longer retain the opcode table; enforced size rows met with one recorded deferral for fusible `string.trim`                                                                                                                                                                                      |
| S4    | GATE_PASSED        | One measured direct-leaf codegen policy entry at `393bb06`; map generated instead of hand-written, cache confined to construction, every history within 3% of a hand-written loop on the release lane                                                                                                                                                                                                                     |
| S5A   | GATE_PASSED        | Module-private provenance table at `e0becf5`; public tag fields keep existing and authorize nothing, full valid-opcode forgery corpus passes, no public registrar ships                                                                                                                                                                                                                                                   |
| S5B   | GATE_PASSED        | Weak callback-keyed operator cache at `706d5ad`; the strong one-entry slot is gone, `map(f) === map(f)` holds while `f` is live, and all seven optional candidates are recorded as measured stops                                                                                                                                                                                                                         |
| S6    | GATE_PASSED        | Engine-owned fusion module plus three additive entries at `547de0d`; facades bind to the engine, not to root, and a direct-only consumer retains neither engine nor debug                                                                                                                                                                                                                                                 |
| S7    | GATE_PASSED        | Receipt emission, `stopcock check` CLI and renderer, import pruning, callback and source-map hardening, canonical Option terminals, lane split, and the topology-neutral package gate at `9301314`                                                                                                                                                                                                                        |
| S8    | GATE_PASSED        | Root `pipe`/`flow` sequential at `55ca6a1`; root surface narrowed to the migration map, every size ceiling met with no planner retained. Non-publishable integration state, as the stage requires                                                                                                                                                                                                                         |
| S9    | GATE_PASSED        | Compact fusion at `90c3265`: 2,874 gzip bytes against the 5.5 KiB hard gate, no debug surface, no name registry, and agreement with every other tier on results, callback order, and early-exit counts                                                                                                                                                                                                                    |
| S10   | GATE_PASSED        | Generated 233-descriptor runner bank at `a1286fd`, every descriptor executed against its runner; static `explain` cuts the debug facade's compact increment from 8,905 B to 996 B; selection observable and truthful; 27/27 disposition matrix shipped; hand-loop parity at 1.00x-1.07x. Pareto/evidence sidecar deferred, hard-coded critical runners deliberately retained                                              |
| S10X  | GATE_PASSED        | External-package branch taken on the user's decision at `e75c9be`. `@stopcock/fp-optimizer` created, cohort joined at 21 public packages; FP's tarball carries 0 B of optimizer, measured from the packed artifact. OptimizerAbiV1 keeps provenance inside FP and negotiates identity on hashes; FP has no dependency or peer on the optimizer                                                                            |
| S10J  | GATE_PASSED        | `externalization-required`, decided from the packed artifact rather than an estimate: optimizer 214,155 B, 2.09x the 100 KiB threshold, dominated by the 192,752 B chunk holding the 233 generated templates                                                                                                                                                                                                              |
| S11R  | IN_PROGRESS | Corrective prerequisite stage authorized on 2026-07-26: repair S2/S7 compiler integrity, bind the complete S10X extracted-artifact matrix, and obtain fresh critical-boundary audits before S11. Source/test slice: static Plan IR, import-aware exact/pure lowering, deterministic whole-core receipts, hashed external locators, Rspack, five-host composition-engine gates, and packed compiler smoke validation pass. FP packed-package-contract repair also passes independently; compact `compilePure`, the extracted matrix, and fresh audits remain. The independently audited compact-pure/compiler source-and-test slice now passes with sealed digest `sha256:cfc4a407607e9b32fca93a9b38b1a8fd1343adbe0df8fc7c088d4411dfc34f90`; checkpoint application is pending. The optimizer ABI, compiler artifact-context receipts, and complete extracted-host/layout qualification harness are source-valid; this new source checkpoint is pending before a fresh cohort is packed. The first real cohort replay exposed and now has a focused repair for export-hidden transitive package manifests; checkpoint application is pending before repacking. The second replay copied the isolated closure and exposed a false plugin-shape smoke assertion; its focused harness repair is checkpoint-pending before repacking. The third replay exposed that the generated compiler receipt validator shipped only a declaration; a private packed runtime-entry repair is checkpoint-pending. The fourth replay reached real host graph auditing and exposed a macOS physical-path alias mismatch; its fail-closed canonicalization repair is checkpoint-pending. The fifth replay proved the `.mjs` consumer was outside the compiler default filter and that pre-tree-shake observation was not emitted-retention evidence; both repairs are checkpoint-pending. The sixth replay reached the real Vite source-map gate and exposed temporary extracted paths in generated maps; fail-closed canonical source identities, physical containment, and exact code-to-map linkage are checkpoint-pending. |
| S11   | NOT_STARTED        | Static Plan IR, tier-preserving codegen, expression/source-map corpus, pure map-to-length rewrite, exact construction semantics, deterministic receipts, and five-host smoke coverage exist in the sealed candidate based at `73cc413`; S11 cannot start until S11R passes                                                                                                                                                |
| P1A   | GATE_PASSED        | Iter Array kernels merged at `bd13eaf`; the floor stays at `0.80x` with ten terminals shipping below it under a recorded exception owned by S11, on the user's decision                                                                                                                                                                                                                                                   |
| P1B   | GATE_PASSED        | Typed-array Iter admission merged at `171826c` under a second named size exception granted by the user; separate kernel families, because sharing P1A's cost the Array product 2x                                                                                                                                                                                                                                         |
| P2    | GATE_PASSED        | Canonical-view inspection seam merged; every candidate strategy measured and stopped, so typed-array behaviour is unchanged by design                                                                                                                                                                                                                                                                                     |
| P3A   | GATE_PASSED        | Allocation and memory evidence infrastructure merged at `9bde654`; seven families calibrated on the release lane, three uncalibrated on the canary and reported rather than tuned                                                                                                                                                                                                                                         |
| P3B   | NOT_STARTED        | Measured allocation strategies                                                                                                                                                                                                                                                                                                                                                                                            |
| P4    | GATE_PASSED        | Compiled object read paths, guarded plain-data write tier, and lazy `Map.getOrElse` merged at `908f5f6`; the Record narrow-path candidate stopped on measurement and one row deferred to S4                                                                                                                                                                                                                               |
| DISP  | NOT_STARTED        | Preflight manifest/schema work exists at `f435dd6`, but its unresolved P3B row means the canonical stage has not started or passed                                                                                                                                                                                                                                                                                        |
| S12P  | NOT_STARTED        | A preflight tarball probe at `02b79a6` imported 45/45 public subpaths and measured FP at 131,017 B, but it did not build S12P's required prototype and is not a stage verdict                                                                                                                                                                                                                                             |
| S12   | NOT_STARTED        | Depends on a passed S12P exact prototype; no S12 implementation has started                                                                                                                                                                                                                                                                                                                                               |
| S13   | NOT_STARTED        | External RC publication remains user-authorized                                                                                                                                                                                                                                                                                                                                                                           |
| S14   | NOT_STARTED        | Stable acceptance and publication remain user-authorized                                                                                                                                                                                                                                                                                                                                                                  |

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
- [x] (2026-07-24) Retried the exact live `2.0.0-next.0` alignment and stopped
      with a ledger-only blocker after Bun could not perform the mandatory
      non-frozen lockfile regeneration; every attempted cohort transaction
      restored the tracked worktree to its starting bytes.
- [x] (2026-07-24) Continued S0B directly from the clean recorded checkpoint
      after the user abandoned the controller workflow. The exact canonical
      alignment completed with registry read access, aligned all selected
      manifests and internal prerelease peers, consumed the six public
      changesets, generated prerelease changelogs/state, and regenerated
      `bun.lock`.
- [x] (2026-07-24) Corrected all seven first-release public package allowlists
      to include their newly generated `CHANGELOG.md`, then built and packed
      the complete 20-package public cohort once into immutable development
      artifact
      `sha256:88526ab370fc4a9cc7227bbca34490320e906939b528f5da7606eecd6f70e0d8`.
- [x] (2026-07-24) Completed S0B: clean alignment replay wrote no byte; the
      immutable development pack reproduced the same content hash; exact
      packed inspection, all-cohort clean install, 117-export Bun/Node runtime
      imports and declaration type-check, private Synth compatibility, 13
      focused tests, and independent exit validation all passed.
- [x] (2026-07-24) Deliberately amended S1A's canonical scope to permit only
      the exact benchmark dependency lockfile delta, then isolated the stale
      S0B State peer normalization in prerequisite commit
      `d51f016adb3448922b1107adea1e189ed4b2ec95`.
- [x] (2026-07-24) Completed S1A's packed cross-bundler consumer harness,
      frozen behavior/identity/size envelope, topology-neutral package gate,
      and publish-style lower-bound feasibility projection.
- [x] (2026-07-24) Closed independent S1A audit findings covering portable
      workspace identity, Webpack closure attribution, legacy orphan
      JavaScript, substituted tarball evidence, stable-tarball/file-graph
      binding, and duplicate runtime artifacts in both topology modes.
- [x] (2026-07-24) Checkpointed the independently validated S1A implementation
      as `81ae2c3b0acf8d3dbc2ae5ecbc1d7703fde688d0`.
- [x] (2026-07-24) Replaced live runtime/compiler discovery with one acyclic,
      definition-only operator semantic, lowering, evidence, and receipt
      protocol while preserving every generated FP runtime byte.
- [x] (2026-07-24) Preserved the frozen legacy runtime projection only as
      labelled byte-compatibility data while making canonical comparator,
      capability, and compiler facts authoritative.
- [x] (2026-07-24) Closed the first independent S2 audit's package-qualified-ID
      and mutable-catalogue findings with deep-frozen catalogues, immediate
      pre-emission validation, and a no-partial-write regression.
- [x] (2026-07-24) Completed S2 at
      `cad86c15ae64b90a86675bbca96f6bea362d25ff`; the clean release,
      reproducibility, consumer/package-size, type-contract, and mandatory
      independent exit gates all passed.
- [x] (2026-07-25) Completed S3A at
      `6ced74a4574123a36284d2baaca9cf7f4f449436` with one central
      package-wide purity authority, deterministic generated annotations,
      proven manual annotations, built-output enforcement, and exact
      packed/local consumer evidence.
- [x] (2026-07-25) Closed the S3A verifier's reproducibility blocker by
      retaining raw closure hashes as validated diagnostics while binding
      stable evidence to exact minified executable closures, then proving the
      same evidence hash across two fresh sequential builds and packs.
- [x] (2026-07-25) Evaluated the S1B entry gate and stopped before
      implementation: GitHub reports zero self-hosted repository runners,
      hosted CI remains canary-only, and no accountable owner or provisioning
      runbook exists for the required dedicated profiles.
- [x] (2026-07-25) The user descoped self-hosted runner provisioning and
      authorized the local implementation only, so S1B resumed against the one
      real machine: a checked-in profile registry, fail-closed host resolution,
      and repeated no-change noise qualification at `0c207b9`.
- [x] (2026-07-25) Completed S1C at `cfa0669`: seven frozen lanes measured
      against hand-written sequential references, two declared-inactive future
      lanes, three-session release manifests on both engines, and a fail-closed
      validator bound to exact source/dist/packed identity.
- [x] (2026-07-25) Repinned the stale `EXPECTED_PORTABLE_SUBJECT` digest that
      S3A invalidated, restoring the portable release gate.
- [x] (2026-07-25) Completed S3B at `f6a62be`: `dual-internal` no longer
      re-exports the public tagged dual, Option and Result call their exact
      arity directly, and the enforced consumer size rows pass with no opcode
      table.
- [x] (2026-07-25) Recorded the fusible `string.trim` ceiling as deferred to
      S11 instead of meeting it by changing public `dual`, which S3B's own
      scope forbids.
- [x] (2026-07-25) Completed S4 at `393bb06`: `Array.map` moved from a
      hand-written definition exception to one generated direct-leaf policy
      entry, with construction and its frozen callback cache off the direct
      path.
- [x] (2026-07-25) Rejected three candidate emission shapes on measured
      evidence rather than preference, after the new map history gate caught
      each of them regressing the direct path on one engine or the other.
- [x] (2026-07-25) Completed S5A at `e0becf5`: optimized execution now requires
      an entry in a module-private provenance table, and every public tag-field
      forgery reaches the complete generic path.
- [x] (2026-07-25) Replaced the S0 tag-authority characterization, which
      existed to document the forgeable behaviour, with the forgery corpus that
      proves it is gone.
- [x] (2026-07-25) Completed S5B's mandatory half at `706d5ad`: `Array.map`'s
      one-entry strong callback slot is a WeakMap keyed on the callback, so
      nothing is retained once the callback is not.
- [x] (2026-07-25) Measured all seven optional direct-leaf candidates and
      stopped every one of them with a recorded reason rather than rewriting
      them mechanically.
- [x] (2026-07-25) Completed S6 at `547de0d`: the fused implementation moved to
      an engine-owned module, three additive fusion entries ship, and a
      dependency-free sequential core exists without being connected to root.
- [x] (2026-07-25) Completed P3A in an isolated lane and merged it: throughput
      and memory measurement now run in separate workers, and the allocation
      corpus reports per-family dispositions.
- [x] (2026-07-25) Landed S7's consuming half in an isolated lane and merged
      it: a deterministic receipt renderer, an evidence policy engine, and
      `stopcock check` packed as a real bin.
- [x] (2026-07-25) Completed P4 in an isolated lane and merged it: three
      candidates shipped on measured evidence, one stopped, and one row
      deferred to S4 without moving its bar.
- [x] (2026-07-25) Landed S7's lane-split and topology-gate slice in an
      isolated lane and merged it: four named performance lanes with their own
      denominators, and a chunk-agnostic package gate.
- [x] (2026-07-25) Repaired the frozen pipe-dispatch baseline at `58809a4`
      after that lane found S5A had silently broken it. The regression was
      mine and had been live since `e0becf5`.
- [x] (2026-07-25) Merged P1A's Iter Array kernels and P2's typed-array
      inspection seam. P2 shipped no strategy: every candidate lost when
      measured against the real exported functions rather than a lab kernel.
- [x] (2026-07-25) Wired the Iter subpath ceiling to the built artifact after
      finding it was only ever checked against synthetic reports.
- [x] (2026-07-25) The user decided both open lane questions: ship the Iter
      kernels below the floor under a recorded exception, and strip P2's empty
      policy table.
- [x] (2026-07-25) Recorded the Iter kernel floor exceptions and stripped the
      typed-array policy seam at `bd13eaf` and `e31d00c`.
- [x] (2026-07-25) Ran the competitor comparison suite for the first time this
      programme, on a qualified quiet machine, and found `flow` composing 15x
      slower than lodash. Fixed at `0bf8e17`.
- [x] (2026-07-25) Closed the two verification holes at `c8af09a` and
      `52b30ba`: every gate now runs from one command with a manifest that
      fails when a gate is added and not listed, and a competitor cliff gate
      looks outward for the first time.
- [x] (2026-07-25) The first full gate run found two gates red since before the
      programme began, and one more untagged-path regression in `pipe`.
- [x] (2026-07-25) Completed P1B and merged it. The lane refused to raise the
      size ceiling itself and escalated; the user granted a named exception.
- [x] (2026-07-25) Fixed a real hole in P2's iteration seam and, separately,
      landed the iter subpath enforcement that an earlier commit of mine had
      claimed but not contained.
- [x] (2026-07-25) Landed S7 receipt emission at `1810394`, so the `stopcock
check` CLI finally has something producing what it reads, and proved the
      two halves end to end.
- [x] (2026-07-26) The user explicitly authorized clearing the compiler
      blocker. A deliberate outer control-plane amendment introduced S11R so
      the sealed candidate can repair and freshly requalify S2, S7, and S10X
      evidence before S11 timing resumes.
- [x] (2026-07-26) Replayed the sealed compiler candidate under S11R, repaired
      external receipt identity and the runtime-composition-engine gate, and
      completed the deterministic source/test slice required before a clean
      cohort pack.
- [x] (2026-07-26) Repaired the FP packed-package contract before cohort
      creation: nested runtime/flat declaration exports, declaration-graph
      containment, dotted generated declaration rewriting, root-surface
      assertions, and consumer documentation now agree across clean FP and
      optimizer builds.
- [x] (2026-07-26) Restored distinct compact `compilePure` execution and
      endpoint inference, retained only the proven map-to-length rewrite,
      retired bounded top-k, repaired private quota/provenance authority, and
      made AOT boundaries preserve their source-selected compact or optimized
      runtime semantics.
- [x] (2026-07-26) Replayed the stable source/test matrix and obtained an
      independent bounded PASS over the exact 37-path slice. No timing,
      cohort packing, registry, release, or publication action ran.

## Evidence log

- S9 progress, partial:
  - measured budget before building anything: `buildPlan` plus a generic
    executor closes at 3,846 gzip bytes against the stage's hard 5.5 KiB gate,
    while the optimized engine closes at 11,502 because of its template bank.
    So the gate is reachable by dropping templates, not by shaving;
  - `internal/compact/facts.generated.ts` encodes cardinality and input domain
    as one byte per opcode: 65 opcodes in 1,426 bytes against a 20 KB registry
    whose names exist for diagnostics. Generated from the registry, with a test
    asserting the two agree for every registered opcode and that no operation
    name appears in the generated file;
  - `internal/compact/plan.ts` is the canonical planner with registry lookups
    replaced. It produces identical codes, segments, and bindings, and keeps
    the same authority rule: an untrusted step or an unregistered opcode is
    opaque;
  - the agreement test caught an encoding collision immediately: a one-to-one
    array operator encoded to zero, which was also the unregistered sentinel.
    Presence now has its own bit;
  - a `@__PURE__` marker on the fact table was added and left the S3A purity
    policy failing for one commit. The policy was right to object; the marker
    is now reviewed and registered rather than removed, because a droppable
    fact table is the point of having one.

- S9 completion:
  - compact closes at **2,874 gzip bytes** against the hard 5.5 KiB gate, with
    optimized fusion at 11,495. The gate also checks that production compact
    carries no debug surface and no operation-name registry, matching quoted
    string literals rather than bare substrings — a substring search reported
    `dropWhileActive`, an ordinary local in the executor, as the registry
    returning;
  - the executor is the generic exact implementation the other tiers are
    checked against. That is a deliberate choice, not a shortcut: a separately
    written compact executor would be a second place for early-exit and sink
    semantics to drift, and compact's job is to be small and exactly right.
    Speed stays in optimized fusion;
  - removing the registry from that executor was two call sites: an error
    message resolving an operation name, and a cardinality lookup. Both now
    read the compact fact table;
  - 16 agreement tests cover compact against optimized against the generic
    path on ten pipeline shapes including sinks, materializers and empty
    input, plus identical callback order, identical early-exit counts, forged
    steps staying on the generic fallback, and cold/warm/fresh-closure cache
    behaviour.

- Three defects found during S9, none cosmetic:
  - the generic executor re-read `source.length` each iteration while
    optimized fusion snapshots it once. The canonical contract is
    snapshot-then-dense-index-read, so a callback shrinking the array
    mid-iteration produced different results in the two tiers. Fixed in the
    executor, which also corrects the semantic oracle;
  - optimized flow imported the sequential core, putting root's own
    implementation inside the optimized tier's closure and leaving the package
    topology gate unable to tell the tiers apart. Optimized flow now composes
    locally. The first fix attempted was to exclude root's closure from the
    forbidden set, which would have let root import the optimized engine
    undetected; the policy test caught it;
  - the declaration post-processor appends `.js` to a directory specifier, so
    `compact/index.ts` emitted an import of `./internal/compact.js` for a file
    at `./internal/compact/index.js`. Worked around by making the entry a real
    file rather than touching shared tooling mid-programme. This is the second
    time that tooling bug has cost a slice time.

- S9 follow-up owned by S10:
  - the debug facade still carries the explain machinery, so against a compact
    base its increment is 8,905 B rather than the 288 B it adds to an optimized
    base. The S6 ceiling is measured against the optimized base it was written
    for and the compact number is reported beside it, rather than moving the
    ceiling to absorb it.

- S8 evidence:
  - root `pipe` and `flow` delegate to the dependency-free sequential core.
    The 20 overload signatures moved with them, so the public type surface is
    unchanged;
  - measured root entries, all under their ceilings and none retaining the
    planner, lowerer, registry, shape cache, or templates:

    | entry                      | gzip  | ceiling |
    | -------------------------- | ----- | ------- |
    | `root.pipe`                | 191 B | 512 B   |
    | `root.flow`                | 143 B | 512 B   |
    | sequential common pipeline | 640 B | 1,536 B |
    | root named fixture         | 221 B | 512 B   |
    | root enumerated            | 442 B | 8,192 B |

  - operator identity (`_op`) is present in the common-pipeline row and is
    exactly what S8 permits a reachable data-last wrapper to keep; the gate's
    forbidden-marker list excludes it deliberately and a test pins that;
  - `compile`, `compilePure`, `dual`, and `explain` moved to the subpaths that
    own them, and `@stopcock/fp-codemod` rewrites all four;
  - the S0 boundary contract now asserts against the recorded migration map in
    both directions: a name destined for the root must be present, a name
    destined elsewhere must be absent. That is a stronger check than the
    pre-cutover snapshot it replaces;
  - tests exercising fused execution moved to the explicit entry, which is
    where that behaviour now lives. Root sequencing has its own 19-test
    contract covering execution order (`map,map,filter,filter` rather than
    interleaved), agreement with fusion at arities one to five, and the
    narrowed surface;
  - `@stopcock/fp` passes 2,643 tests, `@stopcock/fp-compiler` 234,
    `@stopcock/fp-codemod` 14, the benchmarks reference suite 418, and the
    deterministic gates 4/4;
  - per the stage's own exit gate this is a complete but **non-publishable**
    2.0-next integration state.

- Hazard found during the cutover:
  - `fuzz-correctness.test.ts` appends every disagreement it finds to a
    checked-in pinned corpus. Running it while the cutover was half-applied —
    root already sequential, harness still comparing against fused
    expectations — wrote 9,082 lines of bogus cases into that corpus, which
    then replayed as permanent failures. Reverting the file and pointing the
    harness at the engine restored a clean 78-test pass. A self-recording
    corpus will absorb any transient breakage as though it were a finding.

- S7 callback, source-map, and Option evidence:
  - eleven callback-context cases pass against the real runtime, executed
    rather than inspected: closure capture, a shadowed name binding to the
    right scope, destructured parameters, a member-expression callback, `this`
    surviving through a bound method, an enclosing `arguments` object not
    leaking into a callback, a throw propagating unchanged, and callback order
    staying interleaved per element (`m1,f2,m2,f4,m3,f6`) rather than staged;
  - source maps resolve after both edit kinds this stage introduced. A callback
    body maps to the line it was written on, generated pipeline code maps to
    the call site it replaced, and a file whose imports were pruned still maps
    its callback body correctly. The lookup decodes VLQ locally rather than
    adding a dependency mid-programme;
  - compiled Option terminals return the canonical `none`, not a copy: a
    compiled miss is identical to the runtime's export, and two separately
    compiled sites return the same object as each other. A per-site singleton
    would pass a deep-equality check and fail that second one;
  - six terminal cases are compared against the interpreted pipeline rather
    than against hand-written expectations, so the compiled and runtime paths
    have to agree with each other;
  - the `none` identity comparison runs inside the compiled module. Comparing
    across vitest's loader and the `data:` URL import yields two copies of the
    singleton and fails for reasons unrelated to the compiler — worth knowing
    before someone reads that as a defect;
  - `@stopcock/fp-compiler` passes 234 tests, `@stopcock/fp` 2,622, the
    benchmarks reference suite 412, and the deterministic gates 3/3.

- S7 consumer-rule evidence:
  - the host tests built and executed a fused bundle in Rollup, esbuild,
    webpack, and Vite but never checked the rule that matters: at most 1 KiB
    and no runtime engine retained. Both halves are measured now;
  - the transformed consumer measures 193 B gzip against 13,420 B untransformed
    through esbuild, so pruning plus fusion removes the engine rather than
    relying on the bundler to shake it;
  - **the first version of the engine check was worthless and was replaced.**
    It looked for internal function names, which minification renames, so it
    reported a clean bundle for both the transformed and untransformed builds.
    The markers are now property keys and field names, which survive
    minification, and a test asserts an untransformed bundle _fails_ the rule so
    the guard is itself guarded;
  - webpack is measured in production. Its development output carries 1,192 B
    of scaffolding for an empty module against 1,380 B for the pipeline, so a
    development-mode measurement is mostly webpack's debugger: the 1,399 B
    failure it first produced was 85% host overhead. In production the floor is
    332 B and the transformed consumer is 448 B;
  - the ceiling was verified to bite by lowering it to 100 B and confirming all
    four hosts fail;
  - `@stopcock/fp-compiler` passes 215 tests with clean types.

- S7 import-pruning slice:
  - the transform never pruned anything, only added, so a fully transformed file
    still imported operators it no longer mentioned;
  - pruning is decided from reference analysis over the post-transform program.
    Each replacement records its range, a reference inside a replaced range no
    longer exists, and everything else still counts. That is what lets a mixed
    file keep exactly what its fallback site needs while dropping what the fused
    site consumed;
  - it refuses to touch type-only imports and type-only specifiers, bare
    side-effect imports, and any binding still referenced anywhere including
    under an alias;
  - removing a specifier widens over its separator. Without that,
    `import { filter, map }` losing `filter` emits `import { , map }`, which
    does not parse. Caught by executing the transformed output rather than
    reading it, and both pipelines in the mixed fixture return correct values
    with imports pruned;
  - the step collector's partial-recognition fix landed alongside: a site that
    used real operators before hitting one the compiler could not handle now
    emits a skipped receipt naming them, instead of vanishing from coverage;
  - 14 focused tests over the planner and 6 over the transform cover full
    removal, mixed retention, type-only, side-effect-only, aliases, an
    untouched file, and separator widening in all three positions;
  - `@stopcock/fp-compiler` passes 214 tests with clean types.

- S7 receipt-emission slice:
  - the plugin emits one `CompilerReceiptV1` per recognised site, opt-in
    through a `receipts` option and off by default. Emission changes no
    generated code and no transform selection;
  - determinism is enforced by construction: no clock, no random id, no
    absolute path. Paths are repo-relative and POSIX-separated, keys serialize
    in a fixed order, and receipts sort by id so discovery order cannot
    perturb the bytes;
  - source, config, and semantic-mode changes each move the receipt. The
    config hash deliberately excludes `diagnostics` and the receipt settings,
    because neither can change a decision and including them would invalidate
    every receipt when someone turned logging on;
  - free-text reasons stay for humans; receipts carry a code from the frozen
    vocabulary. An unclassifiable reason maps to `compiler-defect` rather than
    the nearest-looking code, so a gap in the mapping is visible;
  - a site with no identifiable operators produces no receipt, because the
    schema requires a semantic identity and inventing one for an unrecognised
    call is the caller-supplied descriptor the provenance rules forbid. Those
    sites are counted and reported rather than dropped;
  - the collector used to discard every operator it had recognised when it hit
    one it could not handle, so a mixed site vanished from coverage entirely.
    It now returns the partial names and the site appears as a skip;
  - 15 focused tests cover schema validity, absence of absolute paths,
    byte-identical output across runs, stable ordering, source/config/semantics
    each moving the receipt, a skip carrying a code rather than prose, no
    emitted-code claim on an untransformed site, no receipt without an
    identity, unknown operator names being dropped rather than invented, the
    compiler and manifest identities being bound in, and an unclassifiable
    reason mapping to `compiler-defect`;
  - proven end to end on a two-site file: two receipts emitted, the CLI renders
    both with all six evidence classes separated, and the `unsupported` policy
    fails on the skipped site. The render shows "selection is not execution",
    "absence is not a pass", and no runtime claim without a joined profile;
  - `@stopcock/fp-compiler` passes 194 tests with clean types.

- P1B evidence:
  - typed arrays reach the kernels through a `PLAN_SOURCE_TYPED_ARRAY` form.
    Admission requires a canonical view, intrinsic iteration, the resolved
    `@@iterator` identical to the intrinsic, `length` agreeing with the
    intrinsic accessor, and a buffer that is neither resizable, growable, nor
    detached. SharedArrayBuffer skips the detachment query because it cannot
    detach, and an engine without `ArrayBuffer.prototype.detached` is never
    admitted;
  - a callback detaching mid-traversal is the one residual divergence, closed
    by comparing source length after traversal and rethrowing through the
    value's own iterator. That is only conclusive for whole-source terminals,
    so early-exit terminals and any shape carrying `take` keep iterating;
  - 21 shipped rows over 18 distinct kernels, 189 stops in three recorded
    reasons, all 210 rows present exactly once in the manifest;
  - **the finding that shaped the design**: pointing typed arrays at P1A's
    existing Array kernels is simpler and is a reproducible regression to the
    Array product. Array rows measured geomean 0.528 with a minimum of 0.149
    against an otherwise identical module instance that had only seen Arrays;
    an Array-only control measured 1.013, and the effect inverted when the
    instances swapped roles. One function reading both source kinds specialises
    for neither. With separate families the same comparison measures 1.002;
  - shipped rows measure geomean 1.095 against hand-written indexed loops, up
    from 0.075 on the generic path they replace. Three `forEach` rows ship at
    0.24–0.36 under the same S11-owned floor exception P1A carries, against a
    generic path measuring 0.03;
  - the size exception was granted deliberately: 8,421 to 10,563 gzip bytes on
    the subpath, 10,481 to 13,747 on a consumer closure, with the admission
    seam accounting for 1,723 of the 2,110 and the kernels only 397;
  - Bun and Node's zlib disagree by 20 bytes on identical input. The contract
    records which runtime it was measured under, so a re-measurement elsewhere
    cannot silently move the ceiling.

- Two defects closed while integrating P1B:
  - `hasIntrinsicIteration` checked the value's own `@@iterator` and the shared
    `%TypedArray%.prototype` but not the family prototype between them.
    Overriding `Uint8Array.prototype[Symbol.iterator]` left it answering true
    while iteration was entirely custom. It now compares the method the value
    actually resolves. Reproduced before fixing and covered by tests;
  - the commit that claimed to enforce the iter subpath ceiling against the
    built artifact changed only the pin; the test edit was never in it. The
    ceiling had been checked against synthetic reports and a declaration count,
    which is how P1B could exceed it by 2,108 bytes with the suite green. Now
    measured against `dist/iter.js`, and verified by lowering the ceiling and
    watching it fail.

- Verification hardening:
  - `gate-manifest.ts` lists every runnable gate with what it checks and
    whether it needs a quiet machine; `gate-manifest.test.ts` fails when a
    runnable `*-gate.ts` is not listed, so a gate cannot be added and then
    never run; `perf:gates` executes the list and `--deterministic` skips the
    timing ones for a busy machine;
  - the first full run was 15/21 on Bun. Of the six failures, three were RME
    limits on a machine that was not quiet (the profile gate correctly refused
    to qualify it at the same moment), and two were gates that had been red
    since **before this programme started**:
    - `data-functional-perf-gate` pinned a subject digest that never matched
      its files. Those files are byte-identical at the programme base and
      today, so the pin was simply never updated when they last changed at
      `5db6fca`;
    - `scalar-text-hash-perf-gate` was stale at the base too, and this
      programme's changes to `string.ts` moved it further;
  - both were repinned to their actual bytes. Underneath, both pass: geomean
    2.355 and 2.017 against floors of 0.90. Nothing was failing on merit;
  - `competitor-floor-gate.ts` compares against lodash, ramda, and ts-belt with
    a deliberately loose 0.5x cliff floor. It does not rank and does not chase
    wins; it exists because every internal gate stayed green through a 15x
    `flow` regression. A missing row always fails, including reported-only
    rows;
  - `pipe/two-functions` is measured but not enforced: vitest bench reports
    0.93x, a plain varying-input loop 1.28x, and the paired sampler 0.39x.
    Removing work from the untagged path moved the loop number and left the
    paired one unchanged, so the paired regime is measuring something other
    than the work done. The reason is recorded on the row rather than a floor
    being set to whichever number was convenient;
  - `pipe` itself checked its hot-entry cache and did two provenance lookups
    before reaching the untagged fast path. Since generated code always writes
    the public `_op` when it registers an operator, a function without `_op`
    cannot be trusted and the check is skippable on a property read:
    `pipe(x, inc, dbl)` went from 7.21 ns to 2.20 ns in isolation. The one
    behaviour change is that deleting `_op` from a trusted operator makes a
    multi-argument `pipe` run it generically rather than fused, which changes
    speed and not results; `buildPlan` still binds from provenance alone.

- Competitor comparison, measured on the integrated tree with the profile gate
  passing (`spread 0.0501`, `bias 0.0`). 80 benchmark groups across the
  pipeline and core array suites; ratios are stopcock throughput over theirs:

  | library | median | behind in    |
  | ------- | ------ | ------------ |
  | remeda  | 3.23x  | 2% of groups |
  | ramda   | 2.63x  | 10%          |
  | lodash  | 2.59x  | 11%          |
  | rambda  | 2.27x  | 6%           |
  | ts-belt | 1.15x  | 25%          |
  - ts-belt is genuinely competitive and wins a quarter of the groups. The
    other four sit at roughly 2–3x;
  - against a hand-written fused loop the S1C lanes remain the honest figure:
    parity, not a win;
  - the large-`n` early-exit rows (`filter→map→take(100)` at 10M elements,
    916,503 ops/sec against native's 30) measure short-circuiting versus
    materializing a 10-million-element intermediate. They are real but they are
    not a general speed claim;
  - `vitest bench` omits sample arrays for a few very fast rows, which reports
    as a missing `hz` rather than an error. The five-chained-`map` pipeline was
    verified directly (100,000 elements in 5 ms) and those rows are excluded
    from the aggregate rather than counted as zero.

- `flow` composition repair:
  - `flow` compiled every composition. Over plain functions that built a whole
    plan to discover there was nothing to fuse, then ran the steps in order
    anyway. It now scans for a trusted operator and compiles only when one is
    present;
  - measured on the pipe-flow benchmark: creating a composed function went from
    2.3M to 35.4M ops/sec against lodash's 9.8M, and create-plus-call from 0.5M
    to 29.1M against lodash's 9.0M. That is 15x slower than lodash before and
    3.6x faster after;
  - semantics are pinned on both sides: plain compositions apply each step once
    in order and propagate throws unwrapped, and a composition containing an
    operator still fuses, proven by callback interleaving rather than by
    timing;
  - the worst-case tail across the whole comparison moved from 0.06x to 0.54x.

- P1A evidence:
  - `packages/fp/codegen/iter-kernels.ts` generates `src/iter-kernels.ts` and a
    210-row manifest: 15 terminals x 14 shapes, each row present exactly once,
    75 shipped across five shapes and 135 recorded as `generic-fallback` with a
    byte reason. Codegen reproducibility passes with git-diff checking;
  - admission rests only on observable facts. A shadowed `Symbol.iterator`, a
    proxy, or a mutated array-iterator prototype takes the generic path, and
    typed arrays are deliberately not admitted;
  - 85 oracle rows compare each shipped pair against the same plan on a generic
    source, asserting both the result and the exact per-stage `(value, index)`
    call sequence across four input sizes, plus holes-as-undefined, live length
    during mutation, `take(0)` non-evaluation, early-exit read counts, throwing
    callbacks, repeated completion, consumer `return()`, and nested flatMap
    closing;
  - kernels versus the generic emit path, same harness, ratio is hand-written
    loop over Iter so higher is faster: `map-filter/reduce` 0.095 to 0.975,
    `map-filter/count` 0.100 to 1.173, `map-filter/findOrUndefined` 0.115 to
    1.196, `map-filter/toArray` 0.718 to 1.086, `map/toArray` 0.388 to 0.914;
  - the existing gates hold at unchanged thresholds: `iter-perf-gate` geomean
    0.892 with min 0.852 against floors of 0.84 and 0.82, and
    `iter-broad-perf-gate` geomean 1.872 with min 0.991;
  - the `Iter.toArrayInto` inference defect was root-caused rather than worked
    around: the target-capacity rule lived in a rest parameter as a conditional
    type, which TypeScript evaluates before resolving an overloaded call in an
    earlier argument, and every `Iter.map`/`filter`/`take` is an overloaded
    `dual`. Moving the element rule onto the source parameter as plain
    assignability fixes it with the same type parameters, same return type, and
    the same accepted and rejected calls. A regression test was verified to fail
    on the pre-fix source;
  - the Iter subpath size exception is the one the stage explicitly permits.
    The subpath went from 6,438 to 8,433 gzip bytes; 5% would have been 322
    bytes while the fixed seam alone costs about 480, so no terminal-fused
    kernel set fits inside the ordinary tolerance. The contract names the five
    accepted kernel shapes and fails on further growth or any unnamed kernel;
  - the ceiling is now measured against `dist/iter.js` rather than a synthetic
    report. That found the pin stale by 9 bytes on P1A's own branch and 21 on
    the integrated tree, with the kernel set unchanged.

- P2 evidence:
  - `packages/fp/src/internal/typed-array-view.ts` adds the canonical-view
    inspection seam that P1B will consume. It imports nothing from the public
    typed-array entry;
  - **no strategy shipped, and that is the result.** Every candidate the lab
    ranked as a clear win lost when measured against the real exported
    functions. Dropping the size band so a short canonical view always takes
    the stashed intrinsic measured 0.81x in the lab and regressed the existing
    gate from 0.988/0.977/0.975 to 0.796/0.770/0.779 on `float64/slice/64` and
    from 1.120/1.095/0.996 to 0.934/0.938/0.883 on `float64/reverse/64`;
  - the root cause is recorded in the lab's own header so the next lane does not
    repeat it: the lab kernel is not the production kernel, because it allocates
    through a shared helper with a different call-site shape;
  - a declared noise floor of 0.83–1.21 on JSC and 0.85–1.16 on V8, measured by
    timing a function against itself at n=216, bounds what was acted on;
  - the Bun BigInt filter replacement was rejected on its own bar: tiny −11.8%,
    small +1.2%, bulk +1.8% against a required 10% improvement with the
    confidence interval wholly above parity;
  - the existing `typed-array-perf-gate` is green on both engines with no
    threshold moved: Bun frozen geomean 8.735 and native 1.197, Node frozen
    2.346 and native 1.236;
  - deferred without action: `bigint64` filters measure 0.71–0.86x native
    against a 0.85x bar, because native `filter` keeps each element unboxed
    across the predicate call and no userland one-pass predicate can. No stage
    in the superplan owns closing it.

- S7 lane-split and package-gate evidence (partial stage):
  - `s7-optimized-sequential-lanes.ts` declares four lanes in one frozen table,
    each naming its own subject, denominator, and floor owner, so gate output
    says what was timed and what it was divided by:

    | lane               | subject                           | denominator                                       |
    | ------------------ | --------------------------------- | ------------------------------------------------- |
    | `sequential`       | `sequentialPipe` from the S6 core | variadic hand-written loop, same process          |
    | `compact`          | —                                 | inactive until S9                                 |
    | `optimized-fusion` | `pipe` from `fusion-optimized.ts` | frozen `pre-hot-identity-front-cache-v1` baseline |
    | `compiler`         | `compile()` runner execution      | the sequential lane                               |

  - compact follows the S1C convention: `inactive` with a reason naming S9, and
    the evaluator fails if it ever carries rows, reports active, or stops
    naming a stage;
  - measured on Bun, 8-element input, 60 rounds of 2,000-iteration batches,
    ABBA-paired, median of per-pair ratios: sequential 0.79–0.98x of a
    hand-written loop at 124–292 ns per call; optimized fusion 1.09–1.11x
    stable-2-step and 1.02–1.04x stable-6-step against the frozen baseline;
    compiler 2.09x cached 2-step, 0.92x 6-step, and 0.18–0.20x when the runner
    is rebuilt per call;
  - one optimized run in four measured 0.947 while a `tsc` run competed for
    CPU. The other three were clean and the floor was not touched;
  - the pipe-dispatch RME limit is enforced only on the lane that inherits its
    floors. The other lanes print RME with a marker rather than being judged
    against a limit borrowed from a different subject;
  - the package gate no longer requires root and the optimized entry to share
    exactly one runtime artifact. It now derives `sharedRuntime` as the
    intersection of the two entry closures in both modes and holds every
    artifact in it to the unchanged 18,000 gzip-byte ceiling, so the same gate
    accepts the legacy and tiered fixtures. Schema and report version 3 → 4;
  - the legacy-mode assertion is retained until root actually changes: root and
    `./compile` must still share at least one direct runtime artifact, under
    the 150,000-byte legacy tarball ceiling;
  - real packed run is green: topology `tiered`, tarball 130,632 B, projection
    64,107 B against a 100,000 B ceiling;
  - **one policy relaxation, recorded rather than slipped through**: S6's
    fusion entries flipped the real packed artifact to `tiered`, where the gate
    previously forbade all duplicate runtime artifacts. `dist/array.js` and
    `dist/readonly-array.js` are the same module by design and were already on
    the frozen S1A allowlist for legacy mode; that allowlist is unchanged in
    content and now applies in both modes;
  - **deferred, not tuned**: a ceiling on shared-runtime total bytes. Measured
    5 shared artifacts totalling 21,802 gzip bytes, largest 16,531. Any total
    ceiling would have to be set above the measured value to pass, which is
    tuning after observation, so it is recorded as evidence for S9/S10 when
    compact fusion exists to shrink it.

- Pipe-dispatch baseline repair:
  - S5A moved binding authority into the private table and changed
    `extractBinding` to take a provenance entry. The frozen baseline still
    called it with an operator function, so it rebuilt empty bindings and the
    fused kernel called undefined;
  - both fresh-closure cases had been skipping since `e0becf5` and the gate
    reported 5 failures. The vitest suite does not run the gate scripts, which
    is why 341 passing tests did not catch it;
  - the fixture now extracts bindings from public fields itself, which is what
    the implementation it snapshots did. Importing the current
    `extractBinding` would have changed the denominator every ratio is measured
    against;
  - all four cases measure again at 1.06x, 1.02–1.04x, 1.00–1.02x, and
    0.97–1.00x. `fresh-3-step` still exceeds its 5% RME limit at 8.5–10.0% on a
    busy machine; the limit was not moved and the row needs a quiet re-run
    before it can be called green.

- P4 evidence (reproduced on the merged tree; ratios are candidate over
  reference, so lower is faster):
  - `Obj.compilePathOf<T>()(...segments)` returns a frozen reader triple with
    segments copied and frozen once, depths 1–3 unrolled, and depth 4+ falling
    back to the generic loop:

    | row                        | candidate | reference | ratio                      |
    | -------------------------- | --------- | --------- | -------------------------- |
    | compiled read depth 1      | 10.4 ns   | 51.4 ns   | 0.206x                     |
    | compiled read depth 2      | 14.5 ns   | 69.4 ns   | 0.202x                     |
    | compiled read depth 3      | 13.5 ns   | 89.7 ns   | 0.147x                     |
    | compiled `hasPath` depth 3 | 11.1 ns   | 95.1 ns   | 0.116x                     |
    | compiled read depth 4      | 56.6 ns   | 111.0 ns  | 0.505x, reported not gated |

  - no compiled _write_ shipped: a path write is dominated by structurally
    cloning each container, not by walking the path, so compiling it buys
    nothing. Recorded in the docs and the disposition rather than shipped and
    explained away;
  - the guarded plain-data write tier lives inside `clonePathContainer`, so
    `setPath` and `modifyPath` benefit with no new API. The guard reads through
    the same `Reflect.ownKeys` plus `getOwnPropertyDescriptor` sequence as the
    exact clone, so a Proxy observes identical traps and no accessor can fire
    before the shortcut is chosen. Measured 0.583x, 0.486x, 0.396x at depths
    1–3, 0.471x on a null-prototype source, and 0.452x for `modifyPath`;
  - the write guard was mutation-tested clause by clause. The enumerable,
    writable, configurable, prototype, unsafe-own-key, key-ordering, and
    null-prototype clauses each fail a mutation. The accessor, array, and
    key-safety clauses survive because another clause already covers them; they
    were kept as deliberate belt-and-braces at the single point of assignment
    and documented as such rather than deleted;
  - `Map.getOrElse` ships direct and data-last with the exact required
    sequence: `get` first, `has` only when `get` returned `undefined`, fallback
    evaluated exactly once and only when absent. 1.35x a hand-written lookup on
    a hit and 1.09x on a miss. The win is skipping a default nobody needed, not
    nanoseconds, and the changeset says so;
  - the Record narrow-path candidate is **stopped**: `Record.set` already costs
    0.798x the now-faster plain-data `Obj` write on the same flat data, so
    Record is the fast contract without an addition and a narrow helper would
    duplicate `Obj` traversal for no measured gain. The positioning is
    documented instead;
  - `map/getOrUndefined-present` measures 1.172x native `Map.get` against a 10%
    bar. The bar was **not** moved. The row still prints `MISSES BAR
(deferred)` and names S4 as owner, because pre-P4 `map.ts` measures
    1.00–1.28x in the same harness: this is the pre-existing direct-dispatch
    wrapper frame at ~0.6 ns against a ~5.5 ns native lookup, so the bar is
    tighter than a single JS call frame;
  - two live subject digests moved with their subjects:
    `EXPECTED_STRUCTURAL_SUBJECT_SHA256` for `object.ts` and
    `EXPECTED_CORE_UTILITIES_SUBJECT_SHA256` for `map.ts`. Neither
    `portable-perf-contract.ts` nor `third-wave-perf-contract.ts` pins those
    files;
  - after the merge `packages/fp` passes 2471 tests with clean source and
    type-test types and a clean build, and the benchmarks reference suite
    passes 358 tests.

- S7 CLI-slice evidence (partial stage; emission and transform work remain):
  - `packages/fp-compiler/src/receipt-report.ts` renders six evidence classes
    in a fixed order and never merges them: declared capability, static
    decision, corpus evidence, runtime observation, qualified benchmark, and
    packed release evidence, each with its own status and its own invalidating
    hash classes;
  - `src/cli.ts` ships as `"bin": { "stopcock": "./dist/cli.js" }` with a
    required `check` subcommand. Exit `0` every requested policy passed, `1` a
    checked policy failed, `2` invalid arguments, schema, or artifacts;
  - at least one policy is mandatory: there is no implicit default, and both
    "no expectations supplied" and "referenced evidence not supplied" fail
    rather than pass. No missing evidence is treated as success;
  - `--json` writes key-sorted newline-terminated JSON to stdout with prose on
    stderr; without it prose goes to stdout and stderr stays empty;
  - stale-hash invalidation, each proven by a test: source invalidates all six
    classes; config and package invalidate everything except declared
    capability; semantic manifest invalidates corpus evidence; output
    invalidates runtime, benchmark, and release; runtime invalidates runtime
    observation. A stale class has its statements removed rather than
    annotated, so an allocation or execution sentence cannot outlive its label;
  - render rules proven by test: a fallback renders as not transformed with no
    lowering or allocation claim; a transformed site renders "selection is not
    execution"; a site with no hash-joined runtime profile renders
    `unavailable` and carries no consumed-item or early-exit claim; corpus
    statements carry the qualifier that a corpus pass is not proof an arbitrary
    user callback is equivalent; absent evidence renders `unavailable` with
    "absence is not a pass";
  - determinism is proven both in-process and from the packed bin, including
    across reordered `--receipts`, `--evidence`, and `--policy` flags;
  - packed proof: `bun pm pack`, extracted into a clean consumer, run through
    the `node_modules/.bin/stopcock` shim. Every import specifier in
    `dist/cli.js` is a `node:` builtin, so the checker cannot import a
    production fusion runtime to render a report;
  - 36 focused tests; the whole `@stopcock/fp-compiler` suite passes 179 tests
    with clean types after the merge;
  - the receipt schema itself was not extended: `--expectations` and
    `--policy-file` are CLI-level envelopes validated with unknown-field
    rejection.

- P3A evidence:
  - `benchmarks/src/reference/allocation-perf-*` adds the corpus, its metric
    contract, separate memory and throughput workers, a startup lane, and a
    fail-closed gate with 17 focused tests. No package source, public API, or
    threshold changed: P3A is evidence infrastructure and the shipped runtime is
    byte-identical;
  - release budget is 3 sessions, 32 held outputs of 50,000 elements per
    target, one process per session per lane. Memory is never measured in a
    process that also times throughput;
  - retained heap on Bun via `Bun.gc(true)`'s return value, in bytes, median of
    three sessions:

    | target                     | retained   | per element |
    | -------------------------- | ---------- | ----------- |
    | `array.map`                | 12,388,398 | 7.74 B      |
    | `array.filter`             | 6,390,642  | 3.99 B      |
    | `pipe.map-filter`          | 14,410,474 | 9.01 B      |
    | `compile.map-filter`       | 14,380,000 | 8.99 B      |
    | `iter.map-filter-toArray`  | 14,409,021 | 9.01 B      |
    | `typed-array.map`          | 12,408,604 | 7.76 B      |
    | `collector.array`          | 14,385,270 | 8.99 B      |
    | `transducer.intoArray`     | 14,393,789 | 9.00 B      |
    | `array.mapInto`            | 3,272      | ~0          |
    | `array.filterInto`         | 1,966      | ~0          |
    | `typed-array.mapInto`      | 2,831      | ~0          |
    | `iter.toArrayInto`         | 10,368     | 0.01 B      |
    | `transducer.intoArrayInto` | 10,509     | 0.01 B      |
    | `collector.arrayInto`      | 4,845      | ~0          |

  - the existing `*Into` surface retains 2–10 KB where its allocating
    equivalent retains 12–14 MB. That is the number P3B has to beat;
  - on Node, allocating targets retain 13.0–13.1 MB and `typed-array.map` reads
    only 11,200 B of retained heap against 12,800,000 B of external buffer,
    exactly 32 × 50,000 × 8;
  - startup, measured against an esbuild bundle of the source entry: Bun 3.82
    ms import and 515,428 B retained, Node 2.40 ms and 4,020,288 B;
  - unsupported metrics are recorded, not zeroed: `gcCount` and `gcPauseMs` are
    unsupported on JSC, which accepts a `gc` PerformanceObserver and then never
    emits an entry, and `externalBufferBytes` is unsupported on JSC, which
    counts backing stores inside the `Bun.gc(true)` heap size instead;
  - `gcCount` on Node is declared a lower bound, not a total: V8 delivers `gc`
    entries on a later turn and the observation window closes on a declared 50
    ms timer;
  - a 64 KiB noise floor was declared before observation, below which a byte
    metric is calibrated on absolute range rather than relative spread. At 1.5
    KB retained a `*Into` row can measure negative, so a relative spread there
    is meaningless; the absolute band is the stricter test at that scale;
  - all seven families calibrated on the Bun release lane. Three came back
    uncalibrated on the Node canary and were reported rather than tuned away:
    `array-direct` on `array.map` peak-RSS spread 0.161 against a 0.15 limit,
    `typed-array` on throughput spread 0.182, and `writable-target` on
    `typed-array.mapInto` throughput spread 0.658. Several lanes were running
    concurrently, which is the likely cause;
  - the benchmarks reference suite passed 350 tests after the merge.

- S6 evidence:
  - `src/internal/fusion-engine.ts` and `src/internal/fusion-flow.ts` hold the
    unchanged fused implementation; `src/pipe.ts` and `src/flow.ts` are thin
    re-exports, so root behaviour, exports, and bytes are unchanged;
  - `@stopcock/fp/fusion`, `/fusion/optimized`, and `/fusion/debug` are wired
    through `module-manifest.ts` and the package export map, build to real dist
    entries, and import and run from the built package;
  - the facades bind to the engine module, not to root `pipe`. The contract
    test asserts that identity directly, which is the property S8 would
    otherwise break silently;
  - fused and sequential execution are told apart by callback order rather than
    by counters: fused runs `map,filter,map,filter` over two elements,
    sequential runs `map,map,filter,filter`;
  - `src/internal/sequential.ts` imports nothing, is asserted not to be root,
    and agrees with the fused engine on the same pipeline;
  - the measured facade gate:

    | fixture                 | gzip     | engine  | debug   |
    | ----------------------- | -------- | ------- | ------- |
    | `direct.map`            | 465 B    | absent  | absent  |
    | `fusion.pipeline`       | 11,437 B | present | absent  |
    | `fusion.pipeline.debug` | 11,725 B | present | present |

  - the debug facade adds 288 B over the same pipeline without it, against its
    3,072 B incremental ceiling, and is absent from a pipeline that does not
    import it;
  - `packages/fp` passed 2452 tests, source types, public type tests, and a
    clean build; the benchmarks reference suite passed 333 tests;
  - a `@stopcock/fp` minor changeset records the additive entries;
  - `vp fmt` and `git diff --check` passed.

- S5B evidence:
  - the generated `Array.map` cache is now `new WeakMap<object, any>()` keyed on
    the callback. The previous shape held the most recent callback and its
    operator alive for the process lifetime and evicted the first callback as
    soon as a second arrived;
  - 8 focused contract tests cover same-operator identity while the callback is
    live, distinct operators for distinct callbacks, more than one callback
    cached at once, each cached operator staying bound to its own callback, the
    absence of any strong module-level slot, reentrancy never exposing a
    partially constructed operator, a cached operator remaining fusible, and a
    non-function argument not being cached. None of them depends on GC timing;
  - `benchmarks/src/reference/s5b-construction-gate.ts` measures every optional
    candidate on both paths a cache touches, batching 1,000 constructions per
    sample because one construction is below this profile's clock resolution:

    | candidate | repeat    | churn      | net    |
    | --------- | --------- | ---------- | ------ |
    | `filter`  | 35 → 7 ns | 42 → 54 ns | +17 ns |
    | `flatMap` | 25 → 8 ns | 30 → 40 ns | +7 ns  |
    | `find`    | 27 → 6 ns | 34 → 46 ns | +10 ns |
    | `reduce`  | 24 → 6 ns | 30 → 46 ns | +2 ns  |
    | `some`    | 32 → 6 ns | 26 → 46 ns | +7 ns  |
    | `every`   | 27 → 6 ns | 27 → 50 ns | −2 ns  |
    | `take`    | 23 → 5 ns | 27 → 47 ns | −3 ns  |

  - every candidate clears the 5% repeat-construction bar and every candidate
    pays 8–82% on churn. Against a 100,000-element execution costing ~44,000
    ns none of those nets is observable, several flip sign between sessions,
    and `take` has no callback to key on at all, so all seven are recorded as
    stopped with their reason;
  - the gate fails closed if a candidate has no recorded disposition, has an
    empty reason, or is marked enabled without qualifying in the run it is
    recorded against;
  - `packages/fp` passed 2437 tests and a clean build; the benchmarks reference
    suite passed 327 tests; the S3B size rows are unchanged;
  - `vp fmt` and `git diff --check` passed.

- S5A evidence:
  - `packages/fp/src/internal/provenance.ts` holds a module-scoped `WeakMap`
    with no package export, no public registrar, and no caller-supplied
    descriptor, evidence label, or eligibility claim;
  - generated code registers each operator it constructs with an opcode
    resolved at generation time and bindings taken from the captured
    arguments, so nothing a caller supplies reaches the table;
  - `plan.ts`, every arity-specialized fast path in `pipe.ts`, and
    `compile.ts`'s single-step filter check read provenance instead of public
    fields; a step this package did not construct is opaque and runs the
    complete generic path;
  - the 13-test forgery corpus covers every registered opcode forged with
    bindings, an out-of-range forged opcode, a forged operator staying callable
    and correct, public `dual(..., { op })` operators staying callable but
    generic, deleted public fields, overwritten public fields, a copied trusted
    operator, per-call-site bindings, same-shape pipelines not sharing
    bindings, absence from the public export map, a foreign table failing to
    grant authority, exactly what the registrar records, and non-function
    candidates;
  - an out-of-range forged opcode used to throw `registry: no metadata for
opcode N`; it is now simply generic, and the pipe fast-path test was
    updated to that outcome;
  - a codegen structural test asserts every emitted public tag write has a
    matching registration, so a future operator cannot ship tagged but
    unregistered;
  - fresh-operator construction costs 84 ns instead of 42 ns, the WeakMap
    write; construction with a live cached callback is unchanged at 83 ns;
  - the map history gate, S3B size rows, and the S3A fresh consumer-size gate
    are unaffected: `array.map.direct` measures 438–443 gzip bytes and
    `option.specialist-flow` 207–217 across all four bundlers, from both
    local dist and the packed tarball;
  - `packages/fp` passed 2429 tests, source types, public type tests, and a
    clean build; the benchmarks reference suite passed 322 tests;
  - a `@stopcock/fp` major changeset records the behaviour change and what it
    means for callers;
  - `vp fmt` and `git diff --check` passed.

- S4 evidence:
  - `packages/fp/codegen/direct-leaf.ts` holds the whole policy: one entry
    (`array.map`), a pure model, and a pure renderer, so the emitted shape is
    testable without running the generator;
  - the shipped shape is a shared execution leaf called from both the
    data-first branch and the constructed closure, with the single-entry strong
    callback cache confined to the data-last branch. The direct path reads no
    cache, tag, provenance, or fusion state;
  - the cache is unchanged and still recorded as frozen compatibility debt.
    S4 moved it; S5B owns its collectable replacement;
  - `benchmarks/src/reference/s4-map-history-gate.ts` establishes each
    call-site history in its own process, five sessions per history, and scores
    the 100,000-element direct call against a hand-written loop measured in the
    same process with the same callback policy. Normalizing inside the session
    is what makes the histories comparable at all;
  - three candidate shapes were measured and rejected, each on the direct path
    after an unrelated history:

    | rejected shape                         | cost                                                                         |
    | -------------------------------------- | ---------------------------------------------------------------------------- |
    | construction as its own function       | ~85% on V8 after a mixed-size history, ~70% on JSC after a data-last history |
    | both paths inlining the body           | ~89% on JSC after a data-last history                                        |
    | only the direct path inlining the body | ~78% on JSC                                                                  |

  - the shipped shape holds every history within 3% of a hand-written loop on
    Bun (`0.99`–`1.03` loops across large-only, ascending, descending,
    mixed-forms, fresh-callbacks, stable-callback, and one-op-pipe) and within
    noise on Node;
  - the construction lane reports `map(f)` on its own: 83 ns for a stable
    callback and 42–208 ns for a fresh one, with no array ever traversed;
  - a cross-process denominator was tried first and rejected. It moves every
    row together when the machine drifts, which reported a plateau that was not
    there; the earlier `1.15`–`1.27x` readings were that artifact;
  - Node is the canary lane, so the gate reports its over-limit rows without
    blocking, consistent with the S1B profile policy;
  - 10 codegen structural tests cover the single pilot entry, the frozen cache
    disposition, the recorded construction reason, a leaf free of cache and tag
    reads, the no-cache rendering, the still-available isolated rendering, the
    generated dispatcher, a direct path free of cache and tag reads, every
    other operation keeping its previous shape, and byte-for-byte reproduction
    of `src/array.ts` from the checked-in definitions;
  - `packages/fp` passed 2416 tests, source types, public type tests, and a
    clean build; the benchmarks reference suite passed 322 tests;
  - `EXPECTED_PORTABLE_SUBJECT` was repinned for the changed bytes;
  - `vp fmt` and `git diff --check` passed.

- S3B evidence:
  - `packages/fp/src/dual-internal.ts` now imports nothing: `dualUntagged2`,
    `dualUntagged3`, `dualUntagged4`, and a bounded `dualUntaggedN` fallback
    replace the re-exported public tagged dual, and an arity-dispatched `dual`
    remains for the modules that are not migrated to a fixed arity yet;
  - `packages/fp/src/string.ts` moved to the public `./dual` because its
    operations are tagged; every other `dual-internal` consumer was already
    untagged and now sheds the opcode table for free;
  - Option and Result call `dualUntagged2`/`dualUntagged3` directly, so their
    bundles retain only the wrapper they use;
  - 12 focused contract tests cover parity with the untagged public dual on
    both call forms, `arguments.length` dispatch at arity 3 and 4, absence of
    `_op`/`_fn`/argument fields, per-partial-application allocation, unchanged
    error propagation, single body invocation, the generic fallback, exact
    Option/Result representations, canonical `none` identity, and both call
    forms on migrated operations;
  - `benchmarks/src/reference/s3b-untagged-size-gate.ts` bundles each flow from
    the built dist with esbuild, minifies with the frozen terser settings, and
    gzips at level 9:

    | flow          | gzip  | ceiling | opcode table |
    | ------------- | ----- | ------- | ------------ |
    | `option.flow` | 216 B | 922 B   | absent       |
    | `result.flow` | 203 B | 922 B   | absent       |
    | `object.pick` | 363 B | 717 B   | absent       |
    | `string.trim` | 851 B | 717 B   | retained     |

  - `option.flow` and `result.flow` land below their expected 0.25–0.45 KiB and
    0.30–0.55 KiB bands;
  - `string.trim` is fusible, carries opcode 50, and stays on the public tagged
    dual, which resolves its opcode through the whole `OP_CODES` table at
    runtime. The row is recorded as `deferred to S11` and reported on every
    run; it is not enforced, not removed, and not met by widening the ceiling;
  - the S3A purity policy gained a `dual-untagged` call kind and a separate
    reviewed inventory for the migrated Option/Result initializers;
  - `EXPECTED_PORTABLE_SUBJECT` and `EXPECTED_THIRD_WAVE_SUBJECT_SHA256` were
    repinned for the changed candidate bytes in the same change;
  - `packages/fp` passed 2406 tests, source types, public type tests, and a
    clean build; the benchmarks reference suite passed 322 tests;
  - `vp fmt` and `git diff --check` passed.

- S1C evidence:
  - `s1c-baseline-contract.ts` freezes the lane registry (`direct`,
    `root-fused`, `compiler`, `iter`, `typed-array`, `startup`, `allocation`
    frozen; `compact-fusion` and `optimized-fusion` explicitly inactive with
    the stage that activates them), the `0.97x`/`0.90x`/`1.00x` hot-path
    floors, the pre-approved compact `0.75x` geomean and `0.60x` per-row
    size-first floor, bounded quick/release session, round, worker, retry, and
    wall-clock budgets, and the frozen `"sideEffects": false` package fact;
  - `validateBaselineManifest` fails closed on unexpected kind or schema,
    foreign profile or engine, empty worker identity, any source/dist/packed
    identity mismatch, a release manifest missing an identity, an omitted lane,
    a wrong lane status, rows on an inactive lane, a frozen lane with no rows,
    duplicate rows, a foreign sampler or orientation, unpaired samples, a
    median or ratio that does not reproduce from raw samples, too few sessions
    for the budget, an omitted or unavailable required memory metric, and a
    metric claimed on an engine declared unable to collect it;
  - the memory capability matrix records collection method, unit, and required
    status per engine, with explicit `null` where unsupported: JSC exposes no
    GC-count or GC-pause observation, and Bun's retained heap must come from
    `Bun.gc(true)`'s return value because `heapUsed` does not track live
    allocation there;
  - three-session release manifests were produced and self-validated on both
    engines and are checked in at
    `benchmarks/reports/s1c-baseline-bun-jsc-release.json` and
    `benchmarks/reports/s1c-baseline-node-v8-release.json`, both bound to
    source `sha256:15c2f27c...`, dist `sha256:bdf15152...`, and packed
    `sha256:c1a8be1c...`;
  - `direct`, `root-fused`, and `typed-array` reproduce to within ~1% across
    repeated runs; `compiler` and `iter` are visibly bimodal on this profile,
    which is why the frozen rows retain every raw sample rather than one
    number;
  - 59 focused tests passed:

    ```sh
    bun run ../node_modules/vitest/vitest.mjs run \
      src/reference/s1c-baseline-gate.test.ts \
      src/reference/perf-profile-gate.test.ts \
      src/reference/portable-perf-gate.test.ts
    ```

  - `vp fmt` and `git diff --check` passed.

- S1B local evidence:
  - `benchmarks/src/reference/perf-profile-contract.ts` records
    `local-macos-arm64` (Apple M4 Pro, 14 logical cores, Darwin 25.x, Bun
    1.3.14 release lane, Node 24.18.0 canary) and `perf-linux-x64` as
    explicitly unprovisioned;
  - `resolveProfile` fails closed on unknown profile id, foreign platform or
    architecture, wrong CPU brand, wrong core count, drifted OS release major,
    an unqualified runtime, and an unlisted runtime version; a hosted or
    otherwise unrecorded host matches nothing;
  - `releaseEvidenceEligible` is false for the Node canary even when the host
    qualifies, so no canary number can become a baseline or release claim;
  - qualification runs five in-process paired sessions of an identical
    no-change subject against itself after a discarded tier-up/ramp prelude,
    and reports within-session spread, session-median spread, and pooled
    no-change bias as relative interdecile ranges;
  - measured limits recorded in `benchmarks/PERF_PROFILE.md` are `0.12`
    within-session spread, `0.15` session-median spread, and `0.10` no-change
    bias; a busier machine fails the gate rather than widening them;
  - `bun run perf:profile:bun` and `bun run perf:profile:node` both pass on the
    live host; session medians on a quiet machine land within ~0.5% of 1.0;
  - the focused suite passed 18 tests:

    ```sh
    bun run ../node_modules/vitest/vitest.mjs run \
      src/reference/perf-profile-gate.test.ts
    ```

  - `vp fmt` and `git diff --check` passed.

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
- S0B live cohort alignment blocker:
  - startup HEAD was
    `756345aafca2e162072bf495f0c1a67cba9700f0`, with a clean worktree on the
    recorded branch and isolated worktree;
  - the frozen base and prior verified commit were ancestors, both preserved
    source-plan hashes matched the canonical pins, and the trusted project
    configuration plus custom Stopcock 2.0 agents were active;
  - two pre-mutation live `plan --target 2.0.0-next.0` runs were byte-identical
    with SHA-256
    `72e9efdabe132e468e939ccfd2d8f281f3bb968b29becc15eeda94f10fb1bdf7`,
    reported all 20 public packages plus private Synth, and reported no
    readiness blocker;
  - the readiness promotion command passed with all 21 package records ready;
  - the exact
    `bun run release:v2:align-next --target 2.0.0-next.0` command applied the
    filtered release plan and cohort normalization, then failed at its required
    `bun install --lockfile-only` step because Bun 1.3.14 could not write its
    active temporary/cache state in this sandbox;
  - dedicated writable temporary and cache roots advanced Bun to dependency
    manifest resolution, but the installed cache was insufficient and the
    sandbox rejected the resulting registry requests with
    `ConnectionRefused`; copying the complete visible Bun cache into a writable
    root and enabling prefer-offline behavior did not remove those requests;
  - a local read-only registry substitute was not viable because the sandbox
    rejected loopback listener creation with `EPERM`;
  - `bun install --lockfile-only --frozen-lockfile` succeeds against the
    unmodified checkout, proving the starting lockfile is internally valid, but
    it neither regenerates the lockfile after cohort mutation nor satisfies the
    canonical non-frozen command;
  - every failed alignment transaction restored manifests, changelogs,
    Changesets state, private bytes, and `bun.lock`; the tracked worktree was
    clean at the unchanged startup HEAD before this ledger-only edit;
  - a bounded read-only `v2_explorer` trace confirmed that manual lockfile
    editing or substituting frozen validation would weaken the S0B gate;
  - an independent `v2_test_runner` confirmed the unchanged startup HEAD,
    exactly this one dirty ledger path, `git diff --check`, all 21 readiness
    records with no blocker, and two byte-identical live plans with SHA-256
    `72e9efdabe132e468e939ccfd2d8f281f3bb968b29becc15eeda94f10fb1bdf7`;
  - the focused formatter still reports the ledger's pre-existing formatting
    drift and reports the same failure against the unchanged HEAD version;
    reformatting unrelated historical ledger content was deliberately excluded;
  - no package, source, generated artifact, ignored repository evidence,
    external state, or Git metadata was changed.
- S0B successful live cohort alignment:
  - direct execution resumed from clean HEAD
    `7ce1532eaf255c98e51af39ac8d27be0cc7c65c4` on the recorded
    `codex/stopcock-v2` branch and canonical worktree;
  - `bun run release:v2:align-next --target 2.0.0-next.0` completed and
    reported `changed: true`, 20 public packages, one private compatibility
    package, no pending public changeset, and no untouched private changeset;
  - the operation consumed
    `add-fp-companion-tools`, `add-fp-interop`,
    `add-persistent-collections`, `fp-absolute-performance`,
    `fp-validation-composition`, and
    `normalize-public-package-metadata` into Changesets prerelease state and
    deterministic package changelogs;
  - every selected public manifest and private Synth is
    `2.0.0-next.0`; public prerelease peer ranges are exact, Synth remains
    private, and excluded app/docs/benchmark workspaces have no diff;
  - the mandatory non-frozen Bun lockfile update completed with registry read
    access; `bun install --lockfile-only --frozen-lockfile` then passed and
    preserved the complete alignment diff SHA-256
    `0fdd05be4697c31e3be4db5c3c2c796488801baf2bd11128c09e43a5005409e0`;
  - `bun run release:v2:check-cohort` passed with the exact selected cohort and
    no pending public changeset;
  - the combined cohort, packer, and Synth fixture suite passed 13 tests;
    all three tooling syntax checks and `git diff --check` passed;
  - the aligned metadata is ready for a clean checkpoint. Development packing
    deliberately remains the next slice because the immutable packer requires
    a clean canonical worktree.
- S0B immutable aligned development cohort:
  - the first live development pack failed closed because seven packages that
    received their first generated changelog did not yet include
    `CHANGELOG.md` in their package `files` allowlist;
  - `@stopcock/eslint-plugin-fp`, `@stopcock/fp-codemod`,
    `@stopcock/fp-compiler`, `@stopcock/fp-interop`,
    `@stopcock/fp-testing`, `@stopcock/parser`, and `@stopcock/pattern` now
    pack that public release file;
  - direct `bun pm pack` checks for all seven packages passed and included
    `CHANGELOG.md`; a non-frozen `bun install --lockfile-only` confirmed that
    the allowlist-only manifest changes require no lockfile byte change;
  - `bun run release:v2:pack-cohort --mode dev --target 2.0.0-next.0` built all
    20 public packages once in dependency order and wrote
    `artifacts/v2/dev/2.0.0-next.0/88526ab370fc4a9cc7227bbca34490320e906939b528f5da7606eecd6f70e0d8/cohort-manifest.json`;
  - the manifest reports cohort content hash
    `sha256:88526ab370fc4a9cc7227bbca34490320e906939b528f5da7606eecd6f70e0d8`
    and 20 exact package/tarball records;
  - the packer's integrated exact packed check passed, and an explicit
    `release:v2:check-packed` replay passed against the same manifest;
  - after the immutable artifact checkpoint, private Synth source types and
    the bounded FP/Signal runtime contract passed against only the exact packed
    FP and Signal tarballs;
  - a second development pack rebuilt the 20 packages, resolved to the same
    content hash, reported `changed: false`, and left the canonical worktree
    clean;
  - a clean isolated consumer installed all 20 tarballs through local
    content-addressed paths and overrides with no peer warning; all installed
    Stopcock packages reported `2.0.0-next.0`;
  - all 117 declared packed exports imported under Bun 1.3.14 and Node
    24.18.0, and TypeScript 7.0.2 type-checked those exact installed
    declarations; optional React, Svelte, and Vue peers were present for their
    explicit State subpaths;
  - an independent `v2_test_runner` repeated clean no-write alignment, cohort
    checking, exact packed checking, Synth compatibility, the 13 focused
    tooling tests, both 117-export runtime imports, the packed declaration
    consumer, diff hygiene, and final clean status without source edits;
  - S0B exits at clean verified commit
    `551852a06c1c22a2241fb9e3c75815524fdbc9fb`.
- S1A consumer-size and topology evidence:
  - canonical S1A lockfile authority was repaired at
    `379f55ef5283cdbc0593d2bb4e39bb676198c596`; Bun's previously stale State
    cohort peer record was isolated at
    `d51f016adb3448922b1107adea1e189ed4b2ec95`;
  - the final S1A `bun.lock` object delta contains exactly the five declared
    benchmark tools—esbuild `0.28.1`, Rolldown `1.0.1`, Rollup `4.62.2`,
    Terser `5.49.0`, and Webpack `5.108.4`—plus 21 Rolldown
    optional/transitive records; no other workspace or existing package record
    changed, and `bun install --frozen-lockfile` made no change;
  - the consumer contract contains 26 fixture identities per bundler: 23
    active fixtures and three future fusion fixtures represented as explicit
    `expected-export-absent`; the release report contains 104 rows, 92 executed
    measurements, 12 N/A rows, and 100 artifact records;
  - every final minified artifact executed its independent behavior oracle;
    all four bundler/minifier/version identities, frozen package/compiler
    identities, raw/minified hashes, gzip/Brotli values, module attribution,
    transitive closures, emitted compiler identities, and literal
    artifact-origin receipts revalidated;
  - release and PR profiles passed in all four bundlers. The final report is
    reproducible across temporary-directory roots after removing only
    `generatedAt`, with normalized SHA-256
    `f344977f83994dad71668300fe0f1dd6b2a1f1025e4844103e65ce070cde80a3`;
  - the frozen final-target rows remain separate from current baseline
    ceilings: direct/root final targets are 512 bytes gzip, compiler rows are
    1 KiB, compact is 5.5 KiB, optimized is 12 KiB, and debug is a 3 KiB
    incremental closure;
  - the topology gate detects legacy versus complete three-export tiered
    layouts without relying on a chunk filename. The live legacy artifact
    passes at 124,807 tarball bytes and 16,286 gzip bytes for its single shared
    direct runtime artifact;
  - source and projection tarballs are independently re-read and re-extracted;
    schema v3 binds path, tar hash, byte count, file count, and file-set hash.
    The source receipt is 109 files with file-set SHA-256
    `719252da3e11207e9c07cb24017083719743191aaf5e740bc0c6f13c7d10ef7c`;
    the projection receipt is 99 files with file-set SHA-256
    `4bf005b1e054000e91217f7fdb8321665d71191135e7a7a148376528eb88d21b`;
  - the source tarball is byte-identical to immutable S0B FP artifact
    `sha256:631d228853b6603dae8cd2ef3e1c317c6ca3733564ec0905be5c693970d11deb`;
    FP and FP-compiler source and distribution identities remain unchanged;
  - the same-package lower-bound projection is 61,174 bytes, below the strict
    100,000-byte stable ceiling, and retains the complete observed optimized
    closure, 49 reachable declarations, README, LICENSE, and explicit
    root/direct/compact/debug stubs. It remains labelled feasibility evidence,
    not S12 release proof;
  - the current legacy `dist/array.js` and `dist/readonly-array.js` duplicate
    is frozen as the only permitted legacy duplicate group. Any other legacy
    duplicate and every nontrivial tiered duplicate fail closed;
  - focused validation passed 36 consumer/tamper tests and 9 topology/tamper
    tests; strict TypeScript passed for every production harness file; focused
    formatting, `git diff --check`, canonical S1A scope, and both independent
    read-only audits passed;
  - the repository-wide benchmark TypeScript project remains unsuitable as a
    clean gate because it includes broad pre-existing Node-type and benchmark
    callback-signature failures; S1A therefore used the strict focused
    production type-check plus executable test suites without weakening either.
- S2 canonical generation and protocol evidence:
  - the implementation checkpoints are
    `7295a2034649acf40f68c03b9c14283368df2e1b` for acyclic canonical
    generation, `c4ee9e407465e4294d5964aeeece19f618531b6b` for frozen runtime
    artifact identity, and
    `cad86c15ae64b90a86675bbca96f6bea362d25ff` for the independently
    verified fail-closed protocol boundary;
  - one definition-only catalogue now owns 65 package-qualified semantic
    identities, their separate legacy/compiler lowerings, lossless runner
    descriptors, explicit unsupported worker/SIMD/Wasm/incremental
    capabilities, and externally joined declared evidence;
  - generated runtime and compiler views share semantic-facts SHA-256
    `b8fc99c1023be40c96da6df4c393ed1a0f17c86d86c7d1d5546fd37ed10b5c16`,
    manifest SHA-256
    `3e5965cc012340e21667b4a1c07109a1637394e472f463e953198019f2dbcde5`,
    and receipt-schema SHA-256
    `d6b4843e9e8fc645a985eda698b94ed48c05c9370d17bfcc89b68e0895169d6e`;
  - the clean reproducibility gate passed with aggregate SHA-256
    `ce2d0d7e1aa2c22fda55341e44c1497cde98d91f05403fdbe634e9b9b6348c1e`;
    the shared compile artifact remains
    `241b4363b77371747f31d768e9303d515f8be872a79edfb19ee42f7d2cf04a0d`;
  - every one of the 51 built FP JavaScript files is byte-identical to the
    frozen pre-S2 tarball; the package remains 126,153 tarball bytes with a
    16,286-byte shared-runtime gzip closure, and the retained lower-bound
    projection remains 60,739 bytes;
  - the clean FP release gate passed 41 files and 2,388 tests; FP-compiler
    passed 6 files and 143 tests; the consumer-size and package-size suites
    passed 36 and 9 tests respectively; all 9 package type-contract suites
    passed;
  - the accepted two-run consumer evidence retains current-product
    characterization report SHA-256
    `c1f3f922c4997ad21a520e1810539094a1fdb7c499501e07d530000b42a9447d`
    and frozen-cohort release-replay SHA-256
    `a64b432929f1f01f5c3f972e830632f5dc31bfe0ad34d36b4759dc439c205456`;
    both contain 104 rows and 100 artifacts, and their stable
    `{schemaVersion, fixtureManifest, tools, artifacts, rows}` projections are
    byte-identical at SHA-256
    `a4fa5891e632ec752e3a9bff00a5a90c71ee9c2a3a6c98dc0f68a3345b1e1fd7`;
  - the first mandatory verifier audit correctly blocked unqualified semantic
    IDs and mutable post-validation catalogues. The remediation rejects
    malformed IDs, freezes every canonical container and nested record, and
    validates the full catalogue immediately before every writer; its stale
    semantic fixture proves no emission callback runs;
  - the fresh mandatory `v2_verifier` audit returned `PASS` at exact clean
    commit `cad86c15ae64b90a86675bbca96f6bea362d25ff`, confirmed both original
    blockers closed, accepted the unchanged-byte two-run consumer evidence,
    and found no new blocker.
- S3A initializer-purity evidence:
  - the exact independently verified checkpoint is
    `6ced74a4574123a36284d2baaca9cf7f4f449436`;
  - one fail-closed package-wide inventory classifies every production-source
    pure marker and rejects unknown, duplicated, missing, or shape-drifted
    annotations. Built output contains 16 generated markers, 98 proven manual
    `dual` markers, and one immutable `option.none` initializer marker;
  - generated `array.ts`, `boolean.ts`, and `math.ts` remain deterministic at
    canonical manifest SHA-256
    `3e5965cc012340e21667b4a1c07109a1637394e472f463e953198019f2dbcde5`;
    complete codegen/build reproducibility passed at aggregate SHA-256
    `1c3798c96b5d28a07f69099a1decb35ab724c2db40fe18ce856007d11d735e57`;
  - the clean FP release gate passed 41 files and 2,388 tests, every strict
    source/codegen/script/type layer, package construction, NodeNext and
    runtime consumers, and the built purity contract. The S3A contract passed
    6 tests and its focused TypeScript project;
  - the separate S3A fixture manifest is pinned at
    `sha256:c29186d691905282902684edb5e2b09d8e387a76b4bf1a66c8b748f220045687`.
    It reuses frozen `array.map.direct` and adds a specialist Option-only
    fixture without changing the frozen S1A root-pipe denominator;
  - the 16-row fresh local-dist/packed matrix passed exact behavior in esbuild,
    Rollup, Rolldown, and Webpack. Direct `map` measured
    `277/222/222/247` gzip bytes and specialist Option measured
    `834/827/826/835`; local and packed rows are identical, remain below
    `512/922`, and have zero origin delta;
  - package projection SHA-256
    `4f4d0e32bccdebb9433af1c079b52461f43c750575de24e5429ef3b111df8b04`,
    dist-tree SHA-256
    `ca6f9f99fb75404f122e07f49aa3f219a0da2490e3a2810c80ea8e80236387eb`,
    and packed-tarball SHA-256
    `c1a8be1cf1483d0de0a8c591088caf156d2ca01a509389c63f06cd75f2ac35bf`
    match across the package and consumer gates;
  - raw bundle closure hashes remain present and format-validated as diagnostic
    evidence. Stable evidence excludes only those hashes because Webpack and
    Rolldown embed randomized absolute scratch paths in unminified output; it
    still binds all identities, behavior, measurements, topology, artifact
    counts, and exact minified executable closure hashes;
  - two fresh sequential build/pack/measure runs reproduced S3A evidence
    SHA-256
    `9b7157becbf282a8465e73b6be16dd178155488e8b59a730a3a98e98052be5ee`.
    The independent verifier reran that gate at the exact clean commit and
    returned `PASS`;
  - frozen S1A consumer/tamper tests passed 36 tests, package-size/tamper tests
    passed 9 tests, and all 9 package type-contract suites passed. The current
    source tarball is 126,194/150,000 bytes, legacy shared runtime is
    16,287/18,000 gzip bytes, and the lower-bound projection is
    60,760/<100,000 bytes.
- S1B entry-gate evidence:
  - `gh api repos/tdeaks/stopcock/actions/runners` returned
    `{"runners":[],"total_count":0}`;
  - `.github/workflows/ci.yml` runs performance jobs only on
    `ubuntu-latest` and `macos-14`, and `benchmarks/PERF_PROFILE.md` states
    that the required `perf-linux-x64` and `perf-macos-arm64` runners do not
    yet exist and that its results are not release evidence;
  - repository search found no accountable infrastructure owner, provisioned
    runner identity, power/thermal profile, provisioning runbook, profile
    validator, or repeated noise qualification. S1B therefore failed its entry
    gate before any implementation or external mutation.
- S11R compiler source/test checkpoint evidence:
  - the static compiler uses an explicit Plan IR with construction captures,
    source-tier layout, exact/pure mode, residual ABI, segment topology,
    lowering identity, and mapped source fragments; supported sites lower
    without retaining a runtime composition or execution engine;
  - every official operator expression is still evaluated exactly once.
    Five real hosts reject root, compile, fusion, compact-runtime, planner, and
    optimizer modules, admit only an audited construction-leaf closure, remove
    the facade invocation, and execute generated loops. An inherited `_op`
    setter can retain and later call the constructed operator with identical
    original/compiled behavior;
  - external source IDs now emit
    `external/sha256-<64 lowercase hex>` from the versioned
    `stopcock.receipt.external-source.v1` domain. Raw machine paths never enter
    receipt JSON; distinct external IDs remain distinct; malformed or reserved
    external locators fail both generated validators;
  - two consecutive protocol generations emitted operator manifest
    `sha256:149af8c82b015b37265d13425b375e8a184afeeab1990122604658bb84f9c141`
    and receipt schema
    `sha256:9bb0669aa1519ed6e78a9862c2c182e33850ebac502efec9eb91ff58a2775a85`;
  - `packages/fp-compiler` release validation passed 16 files and 401 tests,
    including real packed compiler and five-host smoke cases, with source and
    public type checks green;
  - compiler differential and deterministic performance-policy validation
    passed 3 files and 64 tests. The optimizer-tier differential now uses one
    FP package instance, so it does not silently substitute duplicate-instance
    fallback semantics for the selected optimized tier;
  - FP codegen types, source types, and generated debug/compiler schema parity
    passed, including 25 protocol tests. `codegen:repro` still stops before
    generation on `codegen/compact-facts.ts` importing `../src/registry`; that
    source is byte-identical to this slice's starting HEAD and remains a
    reported baseline failure rather than absorbed work;
  - no timing command ran. The packed FP/compiler/optimizer cohort, topology
    mismatch layouts, named extracted consumer matrix, and fresh S2/S7 audits
    remain for the next S11R slices.
- S11R FP packed-package-contract checkpoint evidence:
  - `@stopcock/fp/fusion/debug` now binds its nested runtime target
    `dist/fusion/debug.js` to TypeScript's actual flat
    `dist/fusion-debug.d.ts` output through one authoritative module manifest;
  - the declaration graph scans static, side-effect, dynamic, import-equals,
    `require`, module-augmentation, and triple-slash reference forms. It
    permits contained parent traversal, preserves `.d.ts`/`.d.mts`/`.d.cts`
    references, rejects source-module extensions, and fails closed when the
    resolved declaration escapes `dist`;
  - the shared declaration rewriter treats dotted basenames such as
    `facts.generated` and `bank-identity.generated` as extensionless while
    preserving `.js`, `.mjs`, `.cjs`, and `.json`. Its two focused tests and
    idempotence replay passed;
  - a fresh FP build and packed contract verified 44 public modules with
    Bundler, NodeNext, and runtime consumers. The declaration safety/facade
    suite passed 17 tests; script and source type checks passed;
  - a fresh optimizer build and source check passed, and its declaration now
    imports `bank-identity.generated.js`;
  - the independent S11R packaging audit passed sealed moving-tree digest
    `sha256:044685208216f6a516dc941c374cc86afee34bb1c3d55e6d283f34d8ead34932`;
  - the broader FP type-test project still exposes two historical S10X debts:
    compact `compile` has lost endpoint inference, and a boundary type fixture
    imports moved types from the wrong facade. More importantly,
    `compilePure` currently aliases exact `compactCompile` while
    `explainPure` advertises rewrites. These predate this packaging slice but
    must be repaired before the final S11R cohort is created;
  - no timing command ran. This is a package-contract checkpoint, not an S11R
    exit-gate verdict.
- S11R compact-pure/compiler source-test checkpoint evidence:
  - `@stopcock/fp/compile` now gives `compilePure` a distinct compact pure
    executor. It elides callbacks only for a complete maps-only stream
    immediately consumed by `length`, preserves dense source reads and
    construction effects, and works after a preceding boundary;
  - the unsafe top-k path is fully retired. Full sort materialization remains
    authoritative before `take`;
  - primitive-number `take` and `drop` quotas are normalized once in private
    provenance. Non-number and coercible quotas remain authenticated opaque
    callables, and the optimizer ABI's fifth slot re-authenticates the callable
    instead of trusting mutable public `_fn`;
  - tier-aware AOT preserves compact reverse read order, `init` endpoint,
    sparse/species behavior for `flatten` and `without`, live-length
    `sum`/`min`/`max`, and the optimized tier's distinct singleton versus
    planned-boundary behavior. Frozen fused `take` lookahead remains intact;
  - canonical semantic manifest
    `sha256:149af8c82b015b37265d13425b375e8a184afeeab1990122604658bb84f9c141`,
    optimizer bank
    `sha256:9c6a26633a128e597a3522f8d36a02aad4848bfe022abed58769776f336435e4`,
    compiler emitter
    `sha256:627e2fea01170610b5f2d23cb69dafc7571953106ced8e78aabd0b924b6f9aa8`,
    and codegen/build reproducibility
    `sha256:965fb404b61ee5d2c7b0394fe96668c1ad953919980f9b6b6a85921a33268a7e`
    agree across their generated and live consumers;
  - the stable broad replay passed FP source/types/contract/script/codegen
    checks and 1,233 tests plus 17 codegen invariants; optimizer source/build
    and 1,774 tests; compiler source/types/build and 438 tests. ABI distribution
    SHA-256 is
    `0e8d26ab832e72c79f7c2df215fa3797a6d969b59cd1e1f3fe72af332c84a7c7`;
  - the independent verifier repeated the sealed dirty-set digest
    `sha256:cfc4a407607e9b32fca93a9b38b1a8fd1343adbe0df8fc7c088d4411dfc34f90`,
    exact S11R scope, workspace, focused semantic probes, and returned `PASS`;
  - no timing command ran. This is the clean-source checkpoint prerequisite,
    not the packed-cohort, extracted-matrix, fresh S2/S7, or S11R exit verdict.
- S11R packed-cohort/extracted-matrix source checkpoint evidence:
  - FP now publishes one physical instance token plus complete semantic,
    runner, binding, consume, and execution identities. The optimizer owns an
    independently generated expected identity and runner-bank contract, and
    the production compatibility gate rejects every identity, mode, layout,
    shape, trust, or physical-instance mismatch before a specialized runner can
    execute;
  - an installed-ABI mismatch uses FP's exact interpreter without recording a
    specialized selection. Its opcode-front-cache entry retains only immutable
    shape metadata; current-call bindings are supplied at invocation, and an
    independent re-audit proved no callback or binding remains reachable from
    either opcode front cache;
  - compiler receipts now bind exact FP, compiler, optional optimizer, FP ABI,
    and optimizer-bank artifact identities. The semantic-manifest field binds
    the complete operator manifest, while semantic-facts retain their separate
    projection identity;
  - two consecutive protocol generations reproduced operator manifest
    `sha256:24208c1a8b963d5c951b4515789bd8cf9393a8120b07d1102f60805cd659f094`,
    runner schema
    `sha256:adc10bc33b7498be93476b5210e4c33bd4553c2677860c60e718784983c0cd72`,
    binding schema
    `sha256:2ad9dc1bbf782bb2f9ba39141d7c38215ac86bd3e9718368e204d46a9d69eb6b`,
    and optimizer bank
    `sha256:9c6a26633a128e597a3522f8d36a02aad4848bfe022abed58769776f336435e4`;
  - the extracted matrix requires exactly 21 public tarballs, copies only the
    lock-bound compiler dependency closure, scrubs inherited Node injection,
    runs the declared packed CLI, and covers five real hosts, common and mixed
    sites, import pruning, executable source maps, construction semantics,
    deterministic receipts, corpus joins, and CLI failures;
  - the extracted layout matrix covers ordinary, hoisted, isolated,
    duplicate/shared, and duplicate/separate installs on every materialized
    package side. It mutates every ABI and runner-bank identity independently,
    records the effective package-tree identity, exercises the production
    compatibility gate, and requires two byte-identical materializations;
  - FP source/type/contract/codegen gates pass with 49 files and 1,233 tests;
    optimizer source/build passes with 10 files and 1,797 tests; compiler
    source/type/build passes with 17 files and 446 tests; the focused S11R
    manifest/layout boundary suite passes four tests. Independent adversarial
    re-audits passed the generated optimizer expectation boundary, duplicate
    layout-side coverage, and binding-free fallback-cache retention;
  - no timing command ran. No packed-cohort or extracted qualification result
    is claimed by this source checkpoint; the cohort must be produced from the
    resulting clean commit.
- S11R export-hidden dependency-resolution repair evidence:
  - fresh cohort
    `sha256:23a2e310588ce5eaf3c6f55835689b0ae4c75412954ba71768f5f957740abef5`
    passed the 21-package packed checker, then the first extracted host replay
    failed closed because `js-tokens@10` deliberately does not export
    `./package.json`;
  - locked closure resolution now first accepts an exported manifest, then
    derives the matching physical manifest from Node's selected executable
    entry, and finally uses the same ordered require search paths for a package
    that exports only subpaths. Every candidate must be a regular JSON file
    whose declared package name matches the lock-bound dependency;
  - package specifiers are validated before filesystem joining, including a
    traversal regression probe. Compiler source types, script syntax, diff
    integrity, and all six focused S11R boundary tests pass. Resolution errors,
    malformed selected manifests, and a wrong-name first lookup-path package
    are terminal rather than permitting a later-package substitution. Optional
    dependencies are skipped only for a typed missing-package error naming that
    exact dependency; descendant or integrity failures still propagate. An
    independent resolver re-audit returned `PASS`;
  - the stale cohort was moved recoverably to
    `/tmp/stopcock-s11r-stale-cohort.ZwFXpm/23a2e310588ce5eaf3c6f55835689b0ae4c75412954ba71768f5f957740abef5`.
    It will not be reused after this source repair. No timing command ran and no
    extracted qualification result is claimed.
- S11R extracted compiler load-smoke repair evidence:
  - fresh cohort
    `sha256:aca0bbbb29712e8d3247a46296544bff29d4402c28f7f609e40189a112c54c06`
    passed the 21-package packed checker. Its compiler dependency closure copied
    22 lock-bound packages and 890 real files with identity
    `sha256:ed43b1f90b8599dbc189a51867b10bfef2323f79e7b6a03f62eac91dbfe44518`;
  - the isolated import succeeded, but the smoke probe incorrectly required
    `stopcockFp` itself to be a function. The public root intentionally exports
    the unplugin object. The probe now uses top-level await and requires its
    `raw`, `vite`, `rollup`, `webpack`, `rspack`, and `esbuild` adapter methods
    to be functions; import or surface failures retain status, signal, stdout,
    stderr, and spawn errors in the diagnostic;
  - the exact repaired probe passes against the extracted compiler and copied
    dependency closure with both `NODE_PATH` and `NODE_OPTIONS` removed.
    Compiler source types, script syntax, all six focused S11R tests, and diff
    integrity pass;
  - this source-only harness repair makes that cohort stale under the
    source-bound manifest. It was moved recoverably to
    `/tmp/stopcock-s11r-stale-cohort.6yph91/aca0bbbb29712e8d3247a46296544bff29d4402c28f7f609e40189a112c54c06`.
    No timing command ran and no extracted qualification result is claimed.
- S11R packed compiler receipt-validator repair evidence:
  - fresh cohort
    `sha256:e9669301b79865d023e1c7fc2a66a30a26deec0209e34c3eb329634c32d025f3`
    passed the 21-package packed checker and the isolated compiler/dependency
    smoke. The host matrix then failed closed because the tarball carried
    `receipt-schema.generated.d.ts` but not the generated validator JavaScript;
  - the compiler build now has a private
    `receipt-schema.generated` entry. It emits a stable 350-byte entry facade
    plus the dependency-free validator chunk, while package exports and the
    compiler root API remain unchanged. An independent architecture review
    confirmed this is the smallest S2/S11R seam and rejected inventing a public
    schema export;
  - compiler source types and the focused packed-tarball suite pass. The pack
    contains 56 files, including executable
    `dist/receipt-schema.generated.js`, and the extracted physical-path import
    exposes both the schema hash and validator. Diff integrity passes;
  - the source-bound cohort became stale and was moved recoverably to
    `/tmp/stopcock-s11r-stale-cohort.F6H06U/e9669301b79865d023e1c7fc2a66a30a26deec0209e34c3eb329634c32d025f3`.
    No timing command ran and no extracted qualification result is claimed.
- S11R extracted graph physical-path repair evidence:
  - fresh cohort
    `sha256:316f9554becc3583663673ca908f676ea4aa0ad78609ea7ff04cad945c619e3f`
    passed the 21-package packed checker with compiler tarball
    `sha256:259dd74833c2c23a3a37bb2d7e1bf3b485234ade4c4fbc9e2eb036fdf4d0639d`.
    The host matrix loaded the compiler, validator, and dependency closure and
    reached its real module-graph audit;
  - a host reported an extracted FP chunk through macOS's physical
    `/private/var` path while the selected topology retained the equivalent
    `/var` path. The graph rejected the alias before classifying the verified
    package root;
  - graph identities now compare real paths for the module, selected package,
    consumer, and repository roots. A `node_modules` identity is derived from
    the physical selected-root-relative path rather than an untrusted raw
    suffix. File URLs are decoded before those checks and malformed file
    identities fail. Prefix checks retain path separators, foreign
    Stopcock-looking modules still fail, and repository modules cannot be
    relabelled external even through a symlink alias;
  - compiler source types, script syntax, all eight focused S11R boundary
    tests, and diff integrity pass. An independent physical-containment audit
    returned `PASS`. The stale source-bound cohort was moved recoverably to
    `/tmp/stopcock-s11r-stale-cohort.7HC0D0/316f9554becc3583663673ca908f676ea4aa0ad78609ea7ff04cad945c619e3f`.
    No timing command ran and no extracted qualification result is claimed.
- S11R emitted-contributor and module-extension repair evidence:
  - fresh cohort
    `sha256:8afe00b67a947fccd6bd29423fc06a52ce53255db5fdc6371e7bf2780f485dfc`
    passed the complete 21-package checker. The first Vite row then retained
    root sequential FP because every extracted consumer is `.mjs` while the
    compiler's default filter selected only `.js`/`.jsx`/`.ts`/`.tsx`. The
    old loop-presence assertion was not proof of compilation: the retained
    runtime itself contains loops;
  - the public default filter now accepts the eight standard JS/TS module
    extensions: `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, and
    `.cts`. The default filter remains part of receipt configuration identity,
    so the fresh extracted replay will deliberately emit new receipt IDs;
  - graph attribution now uses final emitted contribution rather than every
    module a host observed: Rollup, Vite, and Rolldown require positive
    `renderedLength`; esbuild requires positive `bytesInOutput` in the exact
    physical JavaScript output; Webpack and Rspack traverse final JavaScript
    chunks and flatten their post-optimization concatenated members. Missing,
    malformed, ambiguous, or empty contribution metadata fails closed;
  - Webpack-family builds use the extracted consumer as their deterministic
    context. The trace-mapping import accepts either the dependency's native
    ESM namespace or Node's CommonJS `default` namespace. The packed CLI test
    now audits its complete compiler-local relative closure, including the
    private generated receipt validator, while continuing to reject FP,
    optimizer, fusion, Babel, and package-root escapes;
  - compiler source/types, script syntax, diff integrity, five real `.mjs`
    host adapters, the packed five-adapter consumer, the packed CLI, and the
    complete compiler suite pass: 17 files and 453 tests. Three independent
    audits returned `PASS` for Rollup/esbuild/Rolldown contribution
    attribution, Webpack/Rspack final-chunk attribution, and the extension plus
    packed-CLI boundary;
  - the stale source-bound cohort was moved recoverably to
    `/tmp/stopcock-s11r-stale-cohort.SPld6H/8afe00b67a947fccd6bd29423fc06a52ce53255db5fdc6371e7bf2780f485dfc`.
    No timing command ran and no extracted qualification result is claimed.
- S11R extracted source-map canonicalization repair evidence:
  - fresh cohort
    `sha256:465d8ecdb6e852618c0c757f14dc08db997c5005aeb9c7c82a28a8d7902cf9be`
    passed the complete 21-package checker with compiler tarball
    `sha256:2615cf3698031ca3408172d345d5d3432f81fbd5a1c74d211e1f23f56d6ca743`.
    The repaired compiler filter and final emitted-contributor graph gate
    passed; the first Vite row then failed closed because its raw map retained
    the physical temporary extracted FP path;
  - all five hosts now canonicalize every raw source before writing or
    executing the map. Selected consumer and package files become stable
    topology identities, Webpack runtime helpers use a bounded virtual
    namespace, `sourceRoot` is `stopcock:///`, and `file` is the colocated
    output basename. Source ordering, non-empty mappings, names, and every
    embedded source-content string are preserved;
  - ordinary host paths resolve only from the captured repository working
    directory or output directory. Webpack paths additionally admit the
    selected consumer root. A spelling containing the exact scratch marker is
    relabelled only when one raw candidate resolves to the same regular
    physical file as the selected topology source. Unknown schemes, unsafe
    encodings, virtual traversal, hidden Stopcock identities, directories,
    repository escapes, and foreign scratch-name spoofs fail closed;
  - every host rewrites its generated code to exactly one colocated external
    source-map directive after sanitization and before execution. The runtime
    throw matrix now requires the canonical `stopcock:///consumer/src/...`
    identity and rejects any extracted scratch token in the mapped stack;
  - compiler source/types/build validation passes with 17 files and 454 tests;
    the focused source-map and host suites pass 17 tests; script syntax and
    diff integrity pass. Independent host-shape/linkage and security-boundary
    re-audits both returned `PASS`;
  - the stale source-bound cohort was moved recoverably to
    `/tmp/stopcock-s11r-stale-cohort.j5D66b/465d8ecdb6e852618c0c757f14dc08db997c5005aeb9c7c82a28a8d7902cf9be`.
    No timing command ran and no extracted qualification result is claimed.

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
- Bun 1.3.14 does not treat the currently visible dependency cache as
  sufficient for non-frozen `--lockfile-only` resolution after the cohort
  manifests change. With writable temporary and cache roots it still requests
  registry manifests, while this controller environment permits neither those
  requests nor a loopback registry; a valid frozen starting lockfile does not
  supply equivalent regeneration evidence.
- The S0 readiness checker intentionally fingerprints the pre-alignment S0
  package manifests and deliberate 1.x/2.x mismatch. After S0B alignment it is
  historical readiness evidence rather than a live cohort command;
  `release:v2:check-cohort` owns the aligned train. Rewriting the S0 inventory
  to chase prerelease metadata would erase its frozen boundary.
- S1A originally required exact bundler versions but omitted `bun.lock` from
  its allowed changes. The minimal canonical and policy amendment now permits
  that path only for the declared S1A tools.
- Bun's first S1A lock regeneration also normalized the already-aligned State
  peer record left stale by S0B. Keeping that unrelated byte in S1A would have
  violated the narrow exception, so it was isolated in its own prerequisite
  cohort-lock checkpoint.
- Rolldown inherited the invoking process directory, and Webpack emitted
  absolute/composite attribution identities plus order-sensitive multi-entry
  closures. Explicit consumer-root working directories, deterministic module
  and chunk IDs, split entry closures, and root-relative attribution made the
  evidence portable.
- The initial topology evaluator checked unreachable JavaScript only in
  tiered mode, excluded public targets from duplicate scans, and trusted
  self-consistent tarball metadata. Independent adversarial review converted
  each into a failing fixture and moved the production trust boundary to
  stable-tarball re-extraction with exact file-set receipts.
- The current legacy package intentionally contains one byte-identical public
  pair, `array.js` and `readonly-array.js`. Schema v3 records and freezes that
  exact compatibility exception while rejecting any new legacy duplicate;
  tiered mode permits only identical trivial empty public stubs.
- The historical runtime registry labelled several operations as
  SIMD/worker-eligible without an owned implementation or corpus. S2 retains
  those bits only in its explicitly non-authoritative byte-compatibility
  projection; every canonical capability is `unsupported`.
- Stable sort comparators historically carried callback arity 1 in runtime
  metadata even though the observable comparator contract is binary. S2 makes
  arity 2 canonical and preserves arity 1 only in the labelled legacy
  projection required for frozen-byte compatibility.
- S1A consumer origins bind source, distribution, tarball, and compiler
  identities, so a current-source `release` replay correctly rejects S2 even
  when the tested runtime bytes are unchanged. S2 therefore needs the accepted
  pair of a frozen-denominator release replay and current-product
  characterization; the frozen origin pins remain untouched.
- The first S2 verifier found two genuine fail-open seams missed by the green
  implementation tests: bare semantic IDs and mutable exported catalogue
  arrays after module-initialization validation. The exit remediation now
  freezes the complete catalogue and exercises the actual pre-emission gate.
- The first S3A audit found that a module-local marker test was still
  fail-open for annotations added outside its known files. The final contract
  recursively inventories every production source marker and rejects unknown,
  duplicated, missing, or structurally drifted annotations.
- `option.none` is safe to annotate only in its exact immutable
  `Object.freeze({ _tag: 0 })` form. The package-wide source and built
  contracts pin that shape and its singleton behavior instead of relying on a
  broad pure-function assumption.
- Generated tagged `sum`, `min`, and `max` initializers mutate imported aliases,
  while tagged String factories read the mutable public opcode table. Both
  groups remain deliberately denied even though nearby factories are safe.
- Raw Webpack and Rolldown output can contain randomized absolute scratch paths
  in non-executable comments. Raw closure hashes are useful diagnostics but
  cannot be stable report identity; exact minified executable closures remain
  stable and byte-identical across fresh local and packed runs.
- S1B is not merely missing checked-in configuration. The live GitHub
  repository has no self-hosted runner registered, and no repository artifact
  identifies an accountable owner who can provision and qualify either
  required profile.
- A deterministic compiler differential initially reported five callback-count
  mismatches because its transformed source selected the optimizer tier while
  its runtime oracle constructed operators from a different FP module
  instance. Using the selected package instance made all 35 rows pass. The
  failure is retained as a warning for the required duplicate-install matrix:
  topology mismatch must fail closed rather than masquerade as optimized
  semantics.
- The first clean cohort-pack attempt exposed three independent FP package
  defects in sequence: the nested `fusion/debug` runtime entry had a flat
  declaration output, the contract checker rejected valid contained parent
  imports before resolving them, and the shared declaration rewriter mistook
  dotted generated basenames for explicit runtime extensions.
- Adversarial declaration review found that regular-expression traversal
  missed side-effect/import-equals/reference forms. A token scanner plus
  kind-aware reference resolver now covers them and distinguishes legitimate
  declaration references from forbidden source-module specifiers.
- Reconciling package documentation exposed a stale protected API table. The
  accepted S10X topology keeps static explanations in FP and moves
  engine-bound runner/statistics diagnostics with the direct optimizer; setup
  commit `b6b9bc4` records that exact one-way surface.
- The same review proved the current FP-only `compilePure` compatibility
  export is only an alias of exact compact compilation even though
  `explainPure` advertises pure rewrites. This is a pre-existing semantic
  blocker, not something a clean package contract can bless.
- The first attempted AOT repair used root sequential materialization as the
  oracle for explicit fused tiers. Adversarial replay proved the frozen compact
  interpreter and optimized runtime-plan topology are the actual
  source-selected contracts, including fused `take`'s lexical one-item
  lookahead.
- Whole-plan map-to-length detection missed the valid
  `boundary -> map -> length` case and produced a different residual input.
  The final Plan IR selects the complete maps-only stream immediately before
  `length`, not merely a whole-pipeline spelling.
- Boundary-specific replay exposed observable differences hidden by ordinary
  arrays: reverse read order, `init` endpoint coercion, sparse flatten/filter
  behavior, and live numeric-materializer length reads. The final emitter
  preserves those source-tier contracts rather than calling a superficially
  equivalent public leaf.

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

- Decision: Stop the live S0B alignment with a ledger-only blocked checkpoint
  instead of manually rewriting `bun.lock` or substituting
  `bun install --lockfile-only --frozen-lockfile`.
  Rationale: The canonical plan explicitly requires the non-frozen
  `bun install --lockfile-only` result after cohort mutation. The current
  environment cannot produce that result, every transaction restored its
  starting bytes, and accepting a handcrafted or no-op lockfile would weaken
  the release-cohort gate.
  Date: 2026-07-24.

- Decision: Continue the canonical programme directly in the recorded
  execution worktree and do not invoke the controller launcher again.
  Rationale: The user explicitly replaced the failed controller workflow with
  direct staged implementation. The controller-only environment prevented a
  required registry read; direct execution completed the exact canonical
  command without weakening or substituting its lockfile gate.
  Date: 2026-07-24.

- Decision: Preserve the S0 readiness inventory as frozen pre-alignment
  evidence and use `release:v2:check-cohort` for the live aligned train.
  Rationale: The S0 contract deliberately records the old manifest hash,
  versions, ranges, and inconsistent 1.x/2.x boundary. Refreshing it in S0B
  would rewrite historical entry evidence and is outside S0B's allowed files;
  the cohort authority already consumes its ready dispositions and owns exact
  post-alignment version/range/prerelease validation.
  Date: 2026-07-24.

- Decision: Measure the immutable S0B FP/FP-compiler tarballs for S1A consumer
  baselines while measuring a freshly packed stable tarball for the
  topology-neutral live-layout gate.
  Rationale: The consumer denominator must not drift as production changes,
  while the topology gate must prove each current layout and its exact packed
  file graph rather than replay only the old cohort.
  Date: 2026-07-24.

- Decision: Freeze per-bundler current ceilings at the characterized result
  plus 3%, keep final 2.0 absolute targets separate, and predeclare absent
  fusion rows as fail-closed N/A records.
  Rationale: This reproduces the current matrix inside the canonical 5%
  tolerance without allowing a current baseline to weaken the final product
  target or an unimplemented tier to disappear from the schema.
  Date: 2026-07-24.

- Decision: Treat `@stopcock/fp/compile` as the explicit optimized
  compatibility facade in tiered topology checks.
  Rationale: The canonical public-tier contract deliberately routes this
  deprecated facade to optimized fusion in the same-package topology and to
  compact fusion only after an accepted S10X extraction; it is not a root or
  direct-specialist closure.
  Date: 2026-07-24.

- Decision: Preserve only the observed legacy `array.js`/`readonly-array.js`
  duplicate group and require zero nontrivial duplicate runtime groups in the
  future tiered layout.
  Rationale: S1A must pass the exact current packed topology without making
  legacy debt a general permission for new retained runtimes.
  Date: 2026-07-24.

- Decision: Make definition-only operator semantics authoritative while
  retaining contradictory historical runtime facts only in a labelled legacy
  projection when exact frozen-byte compatibility requires them.
  Rationale: S2 must correct semantic authority without changing the current
  runtime artifact; explicit disposition prevents compatibility metadata from
  authorizing a future backend.
  Date: 2026-07-24.

- Decision: Keep reference implementation, law, corpus, and evidence IDs as
  link fields outside the semantic hash.
  Rationale: The canonical protocol requires those independently authored
  joins to invalidate through evidence validation without creating a
  self-referential semantic or emitted-artifact hash.
  Date: 2026-07-24.

- Decision: Satisfy S2 consumer compatibility with a frozen-denominator
  release replay plus a current-product characterization whose stable
  projections are byte-identical.
  Rationale: S1A origin receipts intentionally include source identity, so
  rebasing them after a codegen-only change would destroy the denominator.
  Generated runtime and built artifact equality proves the S2 product claim
  without mislabelling current source as release-qualified.
  Date: 2026-07-24.

- Decision: Freeze every canonical catalogue container and revalidate the
  runtime encoding plus semantic/lowering/runner graph immediately around
  every writer.
  Rationale: Module-initialization validation alone is not fail-closed if an
  exported array or definition record can be mutated before emission.
  Date: 2026-07-24.

- Decision: Centralize S3A source and built-output annotation authority in one
  package-wide allowlist/denylist, including the exact immutable
  `option.none` initializer.
  Rationale: File-local positive tests cannot detect a new unsound marker
  elsewhere, while the exact frozen singleton form is a safe initializer and
  preserves canonical Option identity.
  Date: 2026-07-25.

- Decision: Use a separate specialist Option fixture for S3A while leaving the
  frozen S1A root-pipe `option.flow` denominator unchanged.
  Rationale: S3A owns initializer purity, not root topology. The canonical size
  plan's Option construction/map/fallback target is independently measurable
  without smuggling later root work into this stage.
  Date: 2026-07-25.

- Decision: Retain raw bundle closure hashes as validated diagnostics but
  exclude them from S3A's stable evidence projection.
  Rationale: Absolute randomized scratch paths in raw bundler comments change
  those hashes without changing code. Stable evidence still binds exact
  minified executable closures, behavior, measurements, topology, tools,
  source commit, and package identities, and a sequential two-run gate proves
  reproducibility.
  Date: 2026-07-25.

- Decision: Stop at the S1B entry gate without creating placeholder runner
  labels, inventing an infrastructure owner, or treating this local Mac or
  GitHub-hosted workers as qualified release evidence.
  Rationale: The canonical stage requires real named capacity with an
  accountable owner before implementation. Provisioning or registering
  external runners is not covered by the ledger's current external mutation
  authority, and fabricated configuration would not satisfy the gate.
  Date: 2026-07-25.

- Decision: Insert corrective stage S11R and resume the compiler work through
  it rather than widening S11 informally or claiming historical S2/S7/S10X
  evidence covers the extracted topology.
  Rationale: Independent review proved the current candidate spans protocol,
  receipt, package-host, and extracted-install authority owned by earlier
  stages. S11R gives those repairs one bounded scope, requires the complete
  content-addressed matrix and fresh critical audits, and leaves qualified
  timing in S11.
  Date: 2026-07-26.

- Decision: Encode non-project receipt sources as opaque, domain-separated
  hashes and reserve the `external/` namespace for that exact locator form.
  Rationale: Preserving a raw host ID leaks machine paths and makes receipt,
  site, and evidence identity depend on checkout location; basename or content
  alone would also collide distinct external sources.
  Date: 2026-07-26.

- Decision: Define compiler runtime elimination as removal of composition and
  execution machinery while retaining exactly observable operator
  construction leaves.
  Rationale: Public factory calls can expose inherited setters, cache identity,
  provenance, throws, and callable closures. Erasing them is semantically
  wrong; invoking them to execute the transformed pipeline is equally wrong.
  Date: 2026-07-26.

- Decision: Represent public runtime and declaration output paths separately
  in the FP module manifest when the build tools emit different layouts.
  Rationale: `fusion/debug.js` is a deliberate nested runtime subpath while
  TypeScript emits `fusion-debug.d.ts` from its flat source entry. Inventing or
  copying a declaration file would create two authorities.
  Date: 2026-07-26.

- Decision: Keep static diagnostics in FP and engine-bound diagnostics in the
  direct optimizer after S10X extraction.
  Rationale: Forwarding `explainRunner` or optimizer statistics through FP
  would recreate the forbidden dependency/cycle and pull optimizer code into
  consumers that requested static explanations only.
  Date: 2026-07-26.

- Decision: Do not create the final S11R development cohort while FP's
  `compilePure` compatibility facade silently executes exact compact semantics.
  Rationale: A content-addressed cohort makes the selected bytes immutable;
  freezing a known violation of the global pure-mode invariant would turn a
  local repair into invalid extracted evidence.
  Date: 2026-07-26.

- Decision: Preserve the existing tier split while admitting only statically
  primitive numeric quotas to fused AOT, and retire bounded top-k rather than
  weaken exact effects to keep it.
  Rationale: Public tags and fields are diagnostic, not authority; coercible
  quotas, sort snapshots, Proxy reads, species, and thrown-error timing remain
  observable. Narrow private provenance plus source-tier boundaries is the
  fastest sound base for later S11 specialization.
  Date: 2026-07-26.

## Current blockers

There is no external blocker to S11R's deterministic work. The compact-pure,
endpoint, boundary, provenance, and AOT source-tier blockers are cleared in the
pending checkpoint. The clean 21-public-package cohort, complete extracted
host/layout matrix, and fresh independent S2/S7 audits remain. New timing
evidence remains unavailable until the current host requalifies, but timing is
outside S11R and is not part of those deterministic prerequisites.

### Historical S1B entry stop

This section preserves the original S1B entry finding. At that point the live
GitHub repository reported zero self-hosted runners; hosted CI was canary-only;
and no accountable infrastructure owner, provisioning runbook, dedicated
machine identity, or qualified Linux x64/macOS arm64 profile was recorded.
External mutation authorization was `NONE`, so the programme could not
provision or register those machines autonomously.

It is not the current stage state: S1B, S1C, and S3B are all `GATE_PASSED` in
the authoritative stage table. The present machine's later loss of timing
qualification is recorded separately below and prevents new timing evidence;
it does not reopen those completed stages or block S11R's deterministic work.

## Regression found while closing out: an unenforced gate

`iter-array-kernel-gate.test.ts` had git conflict markers committed into it at
`83264e5`. A stale stash from a much older commit re-entered the tree during
the checkout cycles used to bisect the compiler row, and a `git add -A` swept
the unresolved markers in. The file did not parse from that commit until
`e51c7a0`, so the Iter subpath ceiling was not enforced across that range.

Resolved to the side that reads `ITER_SUBPATH_SIZE_CONTRACT.exception
.distinctKernels`, the field that exists since the P1A exception landed. The
stashed side referenced `distinctKernelCount`, which predates it.

The stash is still in the stash list, untouched. Do not pop it: it is an
obsolete variant of this same file.

## Remaining local stages after the S11R amendment

Named here so completion is checkable rather than a matter of recollection.
S13 and S14 are excluded: both are external publication and remain
user-authorized, with `External mutation authorization: NONE`.

| #   | Stage | Status                                             |
| --- | ----- | -------------------------------------------------- |
| 1   | S11R  | IN_PROGRESS                                        |
| 2   | S11   | NOT_STARTED                                        |
| 3   | P3B   | NOT_STARTED                                        |
| 4   | DISP  | NOT_STARTED; preflight validator remains available |
| 5   | S12P  | NOT_STARTED; earlier pack result is preflight only |
| 6   | S12   | NOT_STARTED                                        |

## Blocker: the host has fallen out of perf qualification

`perf-profile-gate` reports `ok: false`, and is degrading rather than
recovering. First reading: session 0 spread 0.1204 against the profile's 0.12
limit. Re-checked later in the same session after a stretch of non-timing work:
session 2 spread 0.2741 against 0.12, and session median spread 0.2282 against
0.15 — a second limit now breached, and the first breached by more than twice
the margin.

A third reading put the session median spread at 0.3108. The trend is
monotonic — 0.1204, 0.2282, 0.3108 — and each profile-gate run is itself a
benchmark load, so probing the host is now part of what is degrading it. Stop
measuring and leave the machine idle. Re-running timing gates on it would
manufacture more of the evidence this section exists to retract. S1B made that check fail-closed precisely so that
timing evidence cannot be produced on a host that is no longer behaving, and it
is now refusing.

Everything downstream of that is unusable, and this is retracted evidence, not
a caveat:

- `portable-perf-gate` reads geomean 0.985 against a 1.200 floor and a worst
  case of 0.001, with three rows failing the harness's own relative-margin-of-
  error check at 6.1%, 8.4% and 12.2%. A worst case of 0.001 is a broken
  measurement, not a thousandfold slowdown. Earlier in the same session the
  same gate on the same tree read geomean 1.703 and worst case 0.980.
- The P3B allocation candidate cannot be adjudicated. It was reverted after a
  corpus run that looked catastrophic, and then the identical failure
  reproduced with the change reverted — so that run said nothing about the
  candidate either way.
- The S11 compiler row blocker is now doubtful. Its readings were tightly
  clustered, which is why it looked solid, but it was measured across the same
  long session on the same drifting host. The finding that a byte-identical
  compiled artifact measured 40% slower is much better explained by a host
  drifting out of qualification than by anything in the tree, and it should not
  be carried forward as a product regression.

The general lesson is procedural: this session ran many hours of back-to-back
benchmarks and never re-checked host qualification between them. `perf-profile-
gate` should be run immediately before any gate whose verdict is a timing
number, not once at S1B and then trusted for the rest of the programme.

Nothing here is worked around. No floor was moved, no row excepted, no digest
repinned to make a red gate green. The P3B candidate stays reverted because it
has no valid supporting measurement, not because it was shown to lose.

## Earlier S12P preflight, and what it did not establish

Packed both packages as npm would, installed them together into a throwaway
consumer, and imported and executed every public subpath from the tarballs.

- **45/45 public subpaths import and run**, including `@stopcock/fp-optimizer`'s
  pipe against a packed `@stopcock/fp`. The extraction is qualified from the
  artifact a consumer installs, not from the workspace.
- `@stopcock/fp` tarball is **131,017 B against a 100,000 B stable ceiling**.
  It is under the 150,000 B legacy ceiling, so the package is in the legacy
  band and has not reached its 2.0 target.
- `@stopcock/fp-optimizer` is 25,229 B.

Composition, so the remedy is aimed at the right thing: 536 KB of JavaScript
and 332 KB of declarations uncompressed, no source maps, no stray source in
`dist`, README plus CHANGELOG only 14 KB. Reaching the ceiling needs roughly a
24% cut.

**What this did not establish.** S12P is specified to measure a prototype with
the S12 rules already applied, including the inference-safe declaration
factoring representation. That prototype had not been built, so 131,017 B was
an **upper bound on a possible S12P number, not an S12P gate result**. The
observation remains useful preflight evidence only. S12P and S12 are both
`NOT_STARTED`; neither stage is stopped, passed, or otherwise adjudicated by
this earlier pack.

## Exact next action

Checkpoint this independently validated compact-pure/compiler source-and-test
slice. From the resulting clean worktree, pack the immutable 21-public-package
development cohort, validate the exact extracted artifacts, run the complete
named host and duplicate-layout matrix, and obtain fresh S2/S7 verifier audits.
S11 remains `NOT_STARTED` until that complete S11R qualification is green.

Do not perform further timing work until `perf-profile-gate` reports `ok: true`.
After the host requalifies, re-run `portable-perf-gate` and
`compiler-perf-sessions-gate` before producing any S11 or P3B timing verdict.
DISP, S12P, and S12 remain future `NOT_STARTED` stages; their earlier probes do
not bypass S11R or establish a gate result.

### S10X outcome

The user chose the external-package branch over shrinking the bank. Evidence:

- FP tarball optimizer footprint 214,155 B -> 0 B, from `npm pack`, not an
  estimate. Total pack 917,316 B -> 668,637 B.
- Debug facade increment 245 B over a compact base and 290 B over an optimized
  one, against a 3 KiB ceiling. The optimized consumer is 10,617 B against
  12 KiB.
- The 26 explain assertions frozen before S10 deleted the engine still pass
  unchanged from the extracted package, which is the strongest single check
  that the move preserved behaviour.
- FP 1,200 tests, optimizer 1,749, compiler 234, benchmarks 437.

Two consequences worth carrying forward rather than discovering later:

- FP's `explain` now reports every segment as `generic`. That is true for an
  FP-only install and is not a loss of detail: the bank lives in a package FP
  cannot see, and claiming a segment runs on a template would be a guess. The
  bank-aware `explain` ships in the optimizer.
- `option-terminals.test.ts` in the compiler had been failing since before this
  programme, so its eight Option-identity assertions had never executed. Two
  harness bugs, now fixed. Worth assuming other suites have the same shape of
  problem until checked.

### S10X residue now owned by S11R

The spec's full extracted-topology matrix is not complete. Done: package,
ABI, negotiation, cohort join, compiler specifier recognition, FP-only
completeness, boundary tests. Not done: the S7 host matrix rerun against
content-addressed extracted artifacts, duplicate-install and hoisting layout
tests, cross-package receipts naming both package hashes, and the codemod and
migration-doc updates. S11R owns re-running that qualification before S11 or
DISP may begin.

### S10 residue carried forward

Two S10 items are deliberately not done, and neither is hidden behind a passing
gate:

- The Pareto/`OperatorEvidenceV1` sidecar joining descriptor, bank,
  emitted-artifact, corpus, size, and benchmark hashes is not built. The
  descriptor bank and its per-runner conformance exist; the external evidence
  join does not. DISP owns closing this.
- `bindCriticalRunner`'s hand-bound runners for `map -> filter`, the long
  flatMap reduce shape, and the `map -> filter -> reduce/find` pair are
  retained. The exit gate forbids deleting a hard-coded runner before its
  generated replacement passes, and no generated replacement was produced for
  them, so retaining them is the compliant outcome rather than an oversight.

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

The formerly blocked live alignment has now completed through the canonical
non-frozen Bun lockfile step. The repository contains one coherent local
`2.0.0-next.0` metadata cohort with deterministic prerelease changelogs and no
runtime/API change. At that partial checkpoint, clean no-write replay,
immutable development packing, exact packed inspection, all-package
install/import/type evidence, and private Synth compatibility still remained.

S0B is complete at
`551852a06c1c22a2241fb9e3c75815524fdbc9fb`. The exact local
`2.0.0-next.0` cohort is aligned, packable, peer-consistent, independently
validated, and retained as one immutable 20-tarball development artifact;
private Synth is aligned, compatibility-green, and absent from the publication
manifest. No registry or other external release state changed. S1A now owns
the first post-alignment implementation work.

S1A is complete at
`81ae2c3b0acf8d3dbc2ae5ecbc1d7703fde688d0`. The immutable aligned cohort now
has portable, behavior-valid consumer-size evidence across esbuild, Rollup,
Rolldown, and Webpack plus a topology-neutral live package gate with exact
stable-tarball/file-graph receipts. The same-package optimized projection is
plausible at 61,174 bytes but remains explicitly non-release evidence. No
production source, public export, generated runtime, distribution byte, or
external release state changed. The dependency graph now admits S2 even while
the independent S1B/S1C performance-profile lane remains pending.

S2 is complete at
`cad86c15ae64b90a86675bbca96f6bea362d25ff`. One acyclic, definition-only
protocol now owns operator semantics, lowerings, runner descriptors, evidence
joins, receipt schemas, runtime encodings, and compiler projections. Its
catalogue is deeply immutable and every writer revalidates the complete graph
before emission. All 51 built FP JavaScript artifacts remain byte-identical to
the frozen S1A package, the accepted consumer projections remain identical,
and the mandatory independent verifier passed after its original fail-open
findings were closed. No public behavior, root fusion path, package topology,
version, lockfile, or external release state changed. S3A is now admissible;
S1B/S1C still gate S3B and later timing-dependent work.

S3A is complete at
`6ced74a4574123a36284d2baaca9cf7f4f449436`. Safe generated and manual
initializers now have one package-wide fail-closed purity authority, the built
package proves those markers survive or inline as intended, and exact fresh
packed/local consumer artifacts satisfy the direct-map and specialist-Option
budgets in all four bundlers without behavior or public-runtime changes. A
reproducibility defect in raw diagnostic hashes was corrected without hiding
or normalizing those diagnostics; two fresh sequential runs and the
independent audit reproduced the same stable executable evidence.

S1B is the next canonical stage but failed its entry gate before source or
workflow edits. Neither required dedicated runner exists in the live GitHub
repository, no accountable provisioning owner is recorded, and the only
checked-in profile is explicitly interim. The programme is durably blocked at
that boundary until real capacity and authority are supplied; no external
runner, GitHub release, registry, package, or publication state was changed.

## S11 compiler residual stopping point — 2026-07-26

S11 implementation started from worktree HEAD
`73cc41386a1000936e4c05d7cddde239b9949698`. The current uncheckpointed tree
contains a coherent compiler candidate:

- `StaticCompilerPlanV1` is the authority for ordered construction captures,
  generated S2 operator facts, source tier, exact/pure mode, boundaries,
  terminals, residual receivers, segments, and lowering identity.
- Root `@stopcock/fp` sites lower as sequential stages. Explicit
  `@stopcock/fp/fusion`, `@stopcock/fp/compile`, and
  `@stopcock/fp-optimizer` sites retain their compact or optimized fused
  layouts. Unsupported sites visibly retain the tier selected by their source
  import.
- Every source operator expression is evaluated exactly once, including in
  pure mode. The pure `map ... map -> length` rewrite removes eligible
  per-element callback execution but does not erase factory calls, caches,
  provenance, inherited setters, argument evaluation, or thrown errors.
- The expression corpus covers statement and expression positions, nested
  sites, binding hygiene, TDZ-sensitive positions, `this`, `arguments`,
  receiver semantics, source maps, direct `eval`, and lexical `Array`
  exclusion.
- Compiler receipts now identify the exact module/export/source span and use a
  recomputed SHA-256 projection of the complete deterministic receipt core.
  Parser failures are visible and fail closed in `diagnostics: 'error'`.
- Vite, Rollup, esbuild, Webpack, and Rspack build and execute the exact common
  consumer. The minified closure stays at or below 1 KiB while the host module
  graph excludes root sequential, compile, fusion, and optimizer execution
  engines. Required exact operator-construction leaves remain visible.
- A five-host smoke probe passes from the SHA-256-addressed extraction of the
  real `@stopcock/fp-compiler` tarball. This is not the canonical S10X
  extracted-artifact matrix: the probe copies the workspace FP `dist` rather
  than consuming a content-addressed packed FP artifact, and it does not yet
  repeat the required mixed transformed/untransformed, pruning, source-map,
  strict-coverage, deterministic-receipt, packed-CLI, or
  duplicate-install/hoisting cases. It is supporting implementation evidence,
  not S7 requalification or an S11 entry-gate pass.

Validation on this exact moving-tree candidate:

- `packages/fp-compiler: bun run check:release`: 16 files, 393 assertions,
  all passed.
- deterministic compiler benchmark/differential and policy tests:
  4 files, 82 tests, all passed in the independent sealed replay.
- generated protocol type-check: passed.
- generated debug/compiler receipt-schema parity:
  25 tests, all passed after the authoritative fixture gained the required
  source identity and span.
- focused receipt/ops/plugin validation: 4 files, 33 tests, all passed.
- protocol regeneration completed with operator manifest
  `sha256:4f5b9fcf6af2846e0de2f43147199146a2726b2b0fb3ff3e8af1825c2c29e5a3`
  and receipt schema
  `sha256:5beb48ec29c220e0c00632fd243218521d698b754f852daf6e9264ddd25c5cd8`.
- No timing command was run. The host remains unqualified, so none of S11's
  `0.90x`, per-row, or changed-context `+10%` thresholds has evidence.
- `packages/fp: bun run codegen:check` still stops on the unchanged
  `packages/fp/codegen/compact-facts.ts` import of `../src/registry`; both the
  failing source and checker are byte-identical to HEAD. This baseline failure
  is reported, not absorbed into S11.
- The independent S11 verifier audited sealed digest
  `sha256:82a507b089bb7ec31abc66b6b27a407097323d1f83f34576b94aa0822e4ca0be`
  across 59 dirty paths. It confirmed the deterministic validation above and
  returned `BLOCKED` on the false S10X entry gate, rejected scope, unresolved
  literal runtime-elimination wording, missing qualified timing, and portable
  receipt-path defect recorded below.

### Blocking architectural and control-plane facts

The implementation uncovered defects in already-passed prerequisites rather
than only S11 work:

- S10X explicitly leaves S11 blocked until extracted artifacts own the complete
  repeated S7 matrix. The current packed candidate content-addresses only the
  compiler tarball and supplies only the five-host common-consumer smoke case;
  it therefore does not satisfy that prerequisite.
- S7 promised Rspack and packed-host coverage but did not ship a Rspack package
  entry or lockfile dependency.
- S7's receipt identity hashed only a small site locator rather than the
  canonical receipt core, parser failures could disappear, and receipts did
  not bind the exact public source module/export/span.
- S7's portable-path helper still preserves an absolute source path when the
  source is outside the configured root. That makes otherwise identical
  receipts machine-location-dependent and must fail closed or canonicalize to
  a deterministic non-absolute identity.
- S2's generated compiler projection did not bind the emitter ABI, and the
  authoritative receipt schema lacked the new fail-closed fields.

Those repairs are required for S11's own exit gate, but the current S11 scope
does not permit the package, Rspack, lockfile, S2 generator, schema, receipt,
plugin, or new Plan-IR module paths. The existing S7 scope also excludes
`bun.lock`, `packages/fp-compiler/vite.config.ts`, and the authoritative S2
generator outputs. The checkpoint scope checker therefore rejects this tree
under S11, S7, and S2 exactly as designed.

There is also a wording conflict that cannot be resolved by deleting observable
work: S11 requires every operator expression to execute exactly once and also
asks for “complete runtime elimination.” Exact first-party factory calls can
expose cache identity, private provenance, inherited property setters, thrown
errors, and callable returned closures. The implemented and tested
interpretation removes every execution dispatcher/planner while retaining
those construction leaves. Treating “complete runtime elimination” as removal
of the factory calls would violate the exactness invariant; treating `_op` or
an operator name as proof of an execution engine would be a false-positive
gate. The verifier's independent transformed esbuild probe was 625 B gzip but
still contained `filterMap`, `_op`, provenance, and executable data-last
operator loops. The candidate therefore does not prove the literal
no-runtime-engine wording; the protected specification must define whether
source-observable construction/runtime leaves are permitted.

The protected canonical plan and scope policy may not be edited by a controller
iteration. The user explicitly authorized clearing this blocker on 2026-07-26,
so an outer control-plane amendment created corrective stage S11R with these
requirements:

1. creates a bounded S2/S7 prerequisite re-entry for the exact repair paths and
   portable receipt-path rule, and requires fresh S2 and S7 independent audits;
2. requires the complete S10X content-addressed extracted-artifact matrix,
   including packed FP/compiler inputs, all five hosts, mixed sites, pruning,
   source maps, strict coverage, deterministic receipts, packed CLI, and
   duplicate-install/hoisting cases, before S11 entry;
3. adds the new Plan IR/source-map modules to S11's explicit scope; and
4. states that exact runtime elimination removes dispatch/planning/execution
   engines but preserves source-observable operator construction.

After the setup commit, replay this candidate under S11R, repair the portable
receipt locator and runtime-composition-engine gate, checkpoint the validated
source/test slice, produce the clean 21-package content-addressed cohort, and
run the complete extracted matrix plus fresh S2/S7 audits. Only a passed S11R
may start S11 timing, and timing may run only after the host requalifies. No
threshold, semantic invariant, or receipt check has been deliberately
weakened. The host marker rejection was replaced by a module-topology allowlist
and is explicitly not accepted here as proof until S11R's adversarial
construction and emitted-execution checks pass. No external release state was
changed.
