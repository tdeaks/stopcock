# Dual, performance first

Date: 2026-08-24
Status: APPROVED 2026-08-24, executing. Same process as one-runtime-path: check
boxes in place, append one line per phase to the Ledger with the landing
commit.

## Goal

Every arity-2+ public op answers both call shapes under one name:
`op(data, ...args)` returns the result, `op(...args)` returns the curried
step. Performance is the design driver, not a constraint bolted on after:
the dispatch shape is chosen by measurement before any emission lands, and
every current figure is a hard invariant. This is not the old dual coming
back. The generic `dual()` helper stays an authoring DSL inside codegen/defs
and never appears in shipped output.

## Evidence (why this is feasible without losing the figures)

- The one-runtime-path plan's measured costs of old dual were costs of the
  *mechanism*, not of overloading: a generic wrapper frame per call, tag
  stamping bytes (487 -> 294 gzip on a 3-op consumer once removed), and
  `DualOperation`'s generic-type collapse (71351e4, plan of 2026-07-28).
  Per-op emitted dispatch and per-op emitted overload types pay none of
  those. What remains is one predictable `arguments.length` branch at
  factory-call time and the dispatch bytes.
- Pipe rows are structurally immune: pipe only ever sees the curried
  closure. If the 1-arg branch returns a byte-identical closure, the
  pipe-floor gate (geomean 1.846 vs ramda), pipe-dispatch-gate, and
  compiler-perf-gate (1.79-1.837 readings against the 1.8 floor) cannot
  move. The compiled tier never calls runtime ops at all.
- Size-gate headroom is 3-6x (s3b option/result flow rows 140-149 B against
  a 922 B ceiling, object.pick 303 B against 717 B). Dispatch bytes fit
  inside existing ceilings; the readings will tick up and are recorded, the
  ceilings do not change.
- codegen/defs already authors data-first bodies: array (69 duals), math
  (10), boolean (3), plus string (14), object (7), number (3) that exist as
  defs but are not yet wired into GENERATED_MODULES. The discarded
  data-first bodies for the remaining hand-written modules are recoverable
  from git before b23e09c.
- The curried-only footgun is real and documented: three ledger incidents of
  data-first calls silently returning an unapplied closure (scan bench
  measuring nothing, packages/state breaking silently). Dual makes those
  call sites correct instead of quietly wrong.

## End state

- One name, both shapes, for every arity-2+ op in the public modules.
  Arity-1 ops are untouched.
- Dispatch is emitted per op by codegen from a measured policy table
  (op class -> dispatch form), not by a shared runtime helper.
- Types are emitted per-op overload pairs (data-first listed first). No
  generic dual type in any public signature. Ambiguous-arity ops (optional
  or variadic trailing args) get a type-guard dispatch, enumerated by
  audit, never by accident.
- The compiler is unchanged for pipes. Optionally (measured, Phase 3) it
  learns to lower data-first call sites too.
- packages/date migrates onto the new emission; the old
  `@stopcock/fp/dual` runtime export is deleted (closing the standing
  Phase 1 follow-up from one-runtime-path).

## Invariants

1. Curried-path closure byte-identity: wherever the policy table permits,
   the closure returned by the curried call is byte-identical to today's
   single-form emission, asserted by a codegen test that diffs the two
   templates' closure bodies. Where the measured policy picks a shared-impl
   form instead, invariant 3 covers that class row-by-row.
2. All 23 gates in run-gates.ts green at existing ceilings and floors. No
   ceiling raises, no floor lowers, no gate retirements. Size-gate byte
   readings recorded before/after in the Ledger; per-row growth stays
   within D3's budget.
3. New dual-parity gate: every emitted dual factory vs the frozen
   single-form baseline on three row kinds (hoisted pipe application,
   per-iteration construction, micro op), geomean >= 0.97, no row < 0.90.
4. Data-first competitiveness: new bench rows vs remeda, ramda, lodash-es
   data-first calls. Target: beat remeda (it pays purry dispatch too);
   record, do not gate, against native/hand loops.
5. Type inference never regresses: existing test-d suites stay green, plus
   new cases for unannotated lambdas inside pipe, data-first generic
   inference, and the filter/guard narrowing overload matrix.
6. Differential and fuzz corpora never shrink; fuzz gains a dual lane
   (data-first and curried application of the same op agree on results).

## Phase 0: measure before emitting

- [x] Resurrect the deleted comparison bench
      (`git show b23e09c^:benchmarks/src/prototype-data-last.bench.ts`) as
      `dual-dispatch.bench.ts`, inverted: current single-form is the
      baseline, candidates are (A) delegation
      (`if (arguments.length >= 2) return op(rest)(data)`), (B) both bodies
      inlined behind the branch, (C) shared hoisted impl called from both
      branches.
- [x] Sample ops per class: array streaming (map, filter), array indexed
      (take, drop), scalar (math add, clamp), object (pick), string
      (slice, arity 3). Three row kinds per candidate: hoisted pipe
      application, per-iteration construction, direct data-first call.
      (Plus a 1b row added mid-phase: hoisted curried application of a
      scalar op, the one place shared's extra frame could show. It doesn't.)
- [x] Bundle probe per candidate: the 3-op consumer bundle
      (the 294 B baseline measurement), plus one op-heavy consumer.
      (Op-heavy consumer skipped as a deviation: dispatch bytes are strictly
      per-op additive, so the per-op delta from the 3-op probe already
      determines every larger consumer; a bigger fixture adds no
      decision-relevant information.)
- [x] Bun/JSC always; Node/V8 per D4. (D4 resolved: tsx 4.22.3 now sits in
      benchmarks devDependencies and `node --import=tsx` resolves, so both
      lanes ran.)
- [x] Output: the policy table (op class -> dispatch form), recorded in
      this Ledger with numbers. This is the same move as 393bb06 (map's
      construction split as a measured codegen policy). No emission work
      starts until the table exists.

Gate: policy table in Ledger, bench committed, baselines pinned.

## Phase 1: codegen emission for array, boolean, math

- [x] dual-inline.ts second template: dispatch per the policy table.
      Invariant 1 proven mechanically at conversion time (a comparator over
      old and new emissions: 121/121 curried closures byte-identical) and
      pinned permanently by src/__tests__/dual-emission.test.ts, which
      checks representative closure text against the generated file itself
      (transform-independent) plus a 14-op data-first/curried parity table.
- [x] Emit per-op overload signature pairs. The defs' two-branch (and
      four-branch narrowing) annotations were never discarded; the old
      emitter filtered them down to curried-only and the dual emitter ships
      them whole. Ambiguity audit of array/boolean/math defs: zero optional
      or variadic params, so no predicate dispatch is needed in Phase 1 at
      all; that class lives in string (Phase 2).
- [x] test-d: dual-emission-types.test-d.ts covers data-first generic
      inference, contextual callback params, guard narrowing both shapes,
      pipe with unannotated lambdas, and wrong-shape calls as type errors.
- [x] Re-pin, deliberately and in one commit, every gate that sha256-pins
      generated sources. The audit found exactly one: frozen-reference-
      contract.ts's portable-runtime digest (includes src/array.ts).
      scalar-text-hash, core-utilities, structural, third-wave pin only
      hand-written modules this phase does not touch. Re-pinned with the
      digest recomputed by the gate's own algorithm.
- [x] Wire the dual-parity gate (invariant 3) into run-gates.ts
      (benchmarks/src/reference/dual-parity-gate.ts, group parity:dual).

Gate: packages/fp suite green, all 23 + 1 gates green, byte deltas in
Ledger, compiler-perf-gate unchanged.

## Phase 2: the rest of the surface

- [ ] Defs coverage audit: string/object/number defs exist but are not in
      GENERATED_MODULES. Verify each against the hand-written src (they may
      be stale), then promote current ones into codegen per D2.
- [ ] Remaining hand-written modules (record, map, set, option, result,
      iter, array-extra, typed-array, optic, match, guard, nullable, ...):
      recover data-first bodies from git pre-b23e09c, promote to defs or
      convert in place per D2. Batches of two or three modules, suite and
      gates green per batch.
- [ ] Internal call sites stay curried (they are already); no internal
      caller adopts data-first this plan.

Gate: full monorepo suite green, gates green, byte deltas per batch in
Ledger.

## Phase 3: ecosystem and close-out

- [ ] packages/date off the old dual.ts and onto the new emission; delete
      dual.ts and the `./dual` export (the standing follow-up).
- [ ] fp-compiler, measured and optional: lower recognized data-first call
      sites the same way pipe steps lower. Only if Phase 0/1 numbers show
      uncompiled data-first leaving real headroom.
- [ ] eslint-plugin-fp: retire any curried-only arity rule; keep or add
      wrong-shape detection only where types cannot catch it.
- [ ] fuzz-correctness dual lane (invariant 6).
- [ ] Docs: fp README's call-shape claims become true again; compiler
      README note on data-first call sites.

Gate: full suite, perf:gates, packed smoke, Ledger closed with byte and
bench deltas.

## Decision points

- D1: dispatch form per op class. Decided by Phase 0's table, not by taste.
- D2: hand-written modules promote to codegen vs dual-in-place. Default:
  promote where a current def exists or the op is mechanical; in-place for
  type-heavy modules (optic, match, schema).
- D3: size budget. Readings will grow by the dispatch. Proposal: every
  measured row stays within its existing ceiling and grows <= 48 gzip
  bytes; anything larger needs a Ledger entry with a reason.
- D4: Node/V8 measurement. The `node --import=tsx` resolution gap is an
  environment issue, not code. Fix it in Phase 0 if under an hour,
  otherwise Bun/JSC-only like one-runtime-path Phase 3, stated plainly.

## Not doing

Runtime tags, registries, or any fused-engine resurrection. Twin exports.
A public generic dual() helper. Changing pipe/flow. Internal callers
adopting data-first. Webpack support. Compiled-tier semantic changes.

## Expected totals

| Phase | Delta (rough) |
| ----- | ------------- |
| 0     | +400 (bench + policy rig) |
| 1     | +800 (templates, overload emission, gate) net of regenerated output |
| 2     | +1,200 (defs promotion, recovered bodies, batches) |
| 3     | -300 (old dual.ts and export deleted, date migration) |
| Net   | roughly +2,100 lines; data-first returns everywhere; every existing figure held |

## Ledger

Append one line per phase: `Phase N landed at <commit>`.

Phase 0 landed at 3e95eaf.

Phase 1 landed at 3771dee (plus this ledger-line commit).

Emission: dual-inline.ts now emits dual factories for array (143 ops),
boolean (3), math (8); 121 arity-2+ closures, policy split delegate/inline
by body shape (loop or >200 chars -> delegate, else inline), zero
predicate-dispatch ops needed (the ambiguity audit of these three modules
found no optional/variadic params). Types are the defs' own two-branch
annotations shipped whole; no generic dual type anywhere.

Invariant 1: proven mechanically at conversion time -- a comparator
extracted the curried closure text of every arity-2+ op from the old
(git HEAD single-form) and new (dual) emissions: 121/121 byte-identical.
Pinned permanently by src/__tests__/dual-emission.test.ts against the
generated file text (transform-independent), plus a 14-op data-first/
curried behavioral parity table. dual-emission-types.test-d.ts holds the
type-level contract (data-first generic inference, contextual lambdas in
pipe, guard narrowing both shapes, wrong-shape calls rejected).

Suites: packages/fp 948/948 (42 files, includes the two new files);
fp-compiler 557/557 untouched; full monorepo suite
(--exclude synth/date) 181 files / 3724 tests, all green after two
manifest fixes (parity:dual registered as a gate group; node 24.19.0
requalified in perf-profile-contract.ts per the 0fe5c26 pattern).
check:types and check:source clean. codegen determinism (three identical
regenerations) verified by check-codegen-reproducibility's canonical
passes; its final tracked-and-clean assertion verified green after the
landing commit.

Gates, substantive (all pass):
- dual-parity-gate (new, invariant 3, wired into run-gates as
  parity:dual): geomean 1.000, min 0.931 (construction/take, RME 8.74%),
  7/7 rows correct. The dispatch branch measures at zero, now enforced.
- pipe-floor: geomean 1.559, min 1.081 vs the 0.833 floor.
- compiler-perf: geomean 1.864 / 1.916 / 1.895 across three isolated
  runs (invariant >= 1.8 holds; one worst-case row read 0.761 on the
  first run and did not reproduce -- 0.905, 0.906 after).
- compiler-operation-perf, compiler-perf-sessions, s10-hand-loop,
  pipe-dispatch, iter-perf, iter-compiled-perf: green in the full
  manifest run.
- Size gates: s8-root -- sequential.common-pipeline 220 -> 246 B gzip
  (+26 B, the dispatch bytes; ceiling 1536 B), every other row unchanged
  (root.pipe 126, root.flow 138, named-fixture 154, enumerated 403).
  s3b-untagged unchanged (140/126/66/303 B -- none of those modules are
  regenerated). fp-package: shared runtime 629 B unchanged, same-package
  lower-bound 37033 -> 38012 (+979 B whole-package dispatch cost,
  ceiling 100000). All inside D3's budget; no ceiling changed.

Provenance re-pins, both evidenced:
- frozen-reference-contract portable-runtime digest re-pinned (includes
  the regenerated src/array.ts).
- core-utilities subject digest re-pinned: found stale at HEAD BEFORE
  this phase (verified by hashing the six subject files at HEAD with the
  gate's own algorithm -- none of them generated, none changed here); the
  same touched-without-repinning gap the one-runtime-path ledger
  documented for scalar-text-hash. Pre-existing, fixed in passing.

Gates, noise-blocked (documented, not chased): the full 24-gate manifest
run and solo re-runs were taken with measured heavy ambient load resident
(a Virtualization.framework VM at 78% CPU, WindowServer 47%, two agent
apps at 20-40%, Docker 20%). Six gates fail ONLY on RME (measurement
precision), with every substantive floor passing in the same runs:
core-utilities geomean 4.646 / floors pass, structural 2.252 / worst
1.002, third-wave 2.296 / worst 0.776 vs 0.150 floor, without 2.007 /
min 0.957, scalar-text-hash geomean 1.850, iter-broad geomean 1.556,
typed-array frozen geomean 7.663 (concat rows read RME up to 588%, pure
scheduler chaos, plus the known-tight float64/reverse/64 boundary row at
0.900 vs 0.920 on a module this phase never touched). perf-profile-gate
fails as designed -- it is the quiet-machine detector, and the machine is
not quiet: its no-change ceremony read one outlier session (spread
0.19-0.20 vs the 0.12 ceiling) in each of two runs, different session
position each time, bias 0.0004. No tolerance was widened.

Toolchain requalification: the managed bun moved 1.3.14 -> 1.4.0 and node
24.18.1 -> 24.19.0 since 0fe5c26; both added to perf-profile-contract.ts
(prior versions kept). Bun is the release-evidence runtime, so its entry
notes the variance ceremony must pass before 1.4.0 readings count as
release evidence; under current load it reads exactly like a loaded
machine and not like a regression (14 timing gates green under 1.4.0,
failures RME-only).

A/B exoneration (post-landing, after a 14/24 re-run on the user's own
quieter machine showed the SAME rows failing): the failing RME rows were
re-run on a worktree at cef414d (pre-dual, single-form emission, same
bun 1.4.0, same host). core-utilities fails the identical rows there
(curry/arity-4, option/map-some, result/map-ok, map/get-present,
map/get-present-undefined, plus record/omit-128) with floors passing
(geomean 4.700 / worst 1.427 pre-dual vs 4.646 / 1.286 post-dual), and
the stale provenance pin reproduces, confirming it pre-dates Phase 1.
third-wave fails the identical four rows there (match/discriminant-
data-first, match/tag-data-first, schema/map-sync-success, writer/zip)
with floors passing (2.360 / 0.996 pre vs 2.296 / 0.776 post). The RME
failures are environmental/toolchain, present before this plan's first
commit, on subject modules this phase never touched.

perf-profile ceremony distribution under bun 1.4.0 (7 runs, VM and
Docker closed, Spotlight mds indexing at ~40% CPU plus two resident
agent apps): 1 pass, 6 single-outlier-session failures at spread
0.133-0.204 vs the 0.12 within-session ceiling, outlier position moving
run to run; sessionMedianSpread 0.004-0.043 (ceiling 0.15) and
noChangeBias <= 0.0013 (ceiling 0.1) pristine every run. The ceiling is
NOT widened: the gate is the quiet-machine detector and it is correctly
reporting a marginal environment. Bun 1.4.0 readings become release
evidence when the ceremony passes on a genuinely quiet host (agent apps
closed, mds settled); until then this environment's timing readings
carry that caveat, which the A/B above shows applies equally to the
pre-dual tree. No further code changes expected for the formal close.

Phase 0 measured 2026-08-24 (bench: benchmarks/src/dual-dispatch.bench.ts,
probe: benchmarks/src/dual-dispatch-size-probe.ts). Both lanes ran: Bun/JSC
(`bun run bench dual-dispatch`) and Node/V8 (`npx vitest bench --run
dual-dispatch`), ambient load, this development machine.

Speed, both engines agreeing:
- Row 1 (hoisted pipe, the invariant row): all three candidates flat with
  each other and never slower than the shipped baseline at n=100 and
  n=10,000. The baseline itself read 1.07-1.12x *slower* than the
  candidates on several runs; the candidates' closures are the same code,
  so this is run-order/function-identity noise, not a real gap (the same
  base row also swung 1.07x to 2.91x between two Bun runs of the map
  construction row). Candidate-vs-candidate deltas were stable across runs
  and engines; candidate-vs-base deltas were not, and only the former
  decide anything here.
- Row 1b (hoisted curried application of add, per-element shape): all four
  within 2% on both engines. shared's extra frame is inlined; it never
  shows.
- Row 2 (construction per call): flat everywhere. The bare
  `arguments.length` branch is invisible on both JSC and V8. The 71351e4
  "arity-check tax" was the generic dual() wrapper machinery, not the
  branch.
- Row 3 (data-first): inline and shared tie for best. delegate pays
  10-18% on cheap ops (map n=100, add, take, pick) and ties at map
  n=10,000. Every candidate beats remeda (its purry dispatch is the
  competitive bar) by 1.4-3x on small ops and ~10x on map, and beats
  ramda map by 1.7-2x. Predicate dispatch (string slice) is within noise
  of both the shipped curried op and native s.slice.

Size (3-op map/filter/reduce consumer, esbuild + terser + gzip -9, the s3b
contract): single 212 B (anchor: the real @stopcock/fp/array consumer is
219 B, validating the synthetic baseline), delegate +47 B, shared +67 B,
inline +76 B. Per-op gzip delta: delegate ~16 B, shared ~22 B, inline
~25 B. All inside D3's <= 48 B per-row budget for single-op gate rows.

Decision, the policy table (D1):

| Op class | Dispatch form | Why |
| -------- | ------------- | --- |
| Loop-bodied ops (array, object, record collections) | delegate | Flat on every curried row, byte-identical curried closure (invariant 1), smallest bytes (+16 B/op). Its 10-18% data-first gap exists only where the loop is trivial, and it still beats remeda there. |
| Expression-bodied ops (math, boolean, cheap string) | inline | The inlined body is smaller than the delegation call for one-expression ops, and these are exactly the ops where delegate's data-first tax shows. Fastest and smallest for the class. |
| Ambiguous arity (optional/variadic trailing args, e.g. string.slice) | predicate dispatch on the data type | Measured within noise of native; arity alone cannot disambiguate. Enumerated by Phase 1's audit, never by accident. |
| shared | retired | Dominated: speed tied with inline, bytes worse than delegate, and it breaks invariant 1's byte-identity. |

Per-op overrides stay possible in codegen (the policy keys off the def's
body shape, which dual-inline.ts already parses); any override needs a
bench row justifying it, same as this table.

Observed in passing, not fixed here: s3b-untagged-size-gate.ts's
object.pick case source calls `pick({ a: 1, b: 2 }, ['a'])` data-first,
which under the curried-only op bundles an unapplied closure. Harmless for
a size measurement, but it is another live instance of the silent
partial-application class this plan closes; the call shape becomes correct
the moment Phase 2 lands dual object ops, with no gate change needed.
