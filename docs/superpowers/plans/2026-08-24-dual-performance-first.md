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

- [ ] dual-inline.ts second template: dispatch per the policy table.
      Codegen test asserts invariant 1 (closure-body diff against the
      single-form emission).
- [ ] Emit per-op overload signature pairs. Ambiguity audit of defs first:
      any op whose data-first and curried call shapes can collide on
      argument count gets predicate dispatch (Effect-style) and a test.
- [ ] test-d: pipe with unannotated lambdas, data-first inference,
      filter/guard 4-overload matrix, wrong-shape calls are type errors.
- [ ] Re-pin, deliberately and in one commit, every gate that sha256-pins
      generated sources: scalar-text-hash, core-utilities, structural,
      third-wave, frozen-reference-contract. Listed here so it is a step,
      not a mid-phase discovery.
- [ ] Wire the dual-parity gate (invariant 3) into run-gates.ts.

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
