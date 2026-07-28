# One runtime path

Date: 2026-07-28
Status: APPROVED 2026-07-28, executing. Same process as the simplify-and-compile
plan: check boxes in place, append one line per phase to the Ledger with the
landing commit.

## Goal

Compiled where built, simple where not. Ops become data-last only, the fused
runtime engine goes away, and pipe becomes plain function application. One
way to write a chain, one thing that makes it fast (the compiler), one dumb
honest fallback.

## Evidence (measured 2026-07-27/28, commits cited)

- Fusion-tier decision suite (34fb8f3, 6fe4642): plain sequential calls beat
  the fused engine 2.5-4x geomean on typical chains at every size. Fused wins
  only bounded-take and early-hit find above n~150, and remeda and lodash
  lazy chains beat our fused engine on those same shapes anyway.
- Constructor elision (cd4b808): the compiled tier is at hand-loop parity on
  every measured shape and first against every library. The runtime engine
  no longer has a shape it wins.
- Data-last prototype (71351e4): hoisted data-last matches dual data-first
  everywhere that matters, micro ops get faster (the arity-check tax), and a
  three-op consumer bundle drops 487 to 294 gzip bytes. The cost is the
  dispatcher itself, not the opcode table. dual's overloads collapse
  generics; the single form infers cleanly with zero hand-written overloads.
- Adaptive selector prototype (6fe4642): earns its keep only narrowly,
  adds 1.7x on tiny chains, and still loses to lazy competitors on the
  shapes it protects. Retire it.
- pipe's own dispatch layer costs 17-83% on some rows (the selector's
  sequential path beat naive-through-pipe with identical ops).

## End state

- Every op has ONE form: `op(args) => (data) => result`. No dual, no
  data-first arity dispatch, no hand-written overload types.
- `pipe(x, ...fns)` is left-to-right function application. `flow` is
  composition. Both a few lines. `compile`/`compilePure` stay as markers the
  build transform recognises; at runtime they alias pipe.
- Callback interleaving between tiers is documented as unspecified. Results
  and early-exit counts stay exact; per-tier callback counts stay pinned
  per tier.
- The compiler is the only fusion. Uncompiled chains run at ramda-class
  speed or better, guarded by a new gate.
- Generator writes what the compiler needs. Runtime-engine artifacts
  (opcodes, registry, tags) go away with the engine, subject to the D3
  consumer sweep.

## Invariants

1. Differential corpus: compiled output matches the sequential reference on
   results and early-exit counts. Callback ORDER is per-tier pinned, not
   cross-tier asserted (D1). Corpus never shrinks.
2. Bench floor: compiled geomean on compiler-perf-gate stays >= 1.8.
3. Size: consumer gates (s3b untagged, fp-package, root) hold or improve at
   every phase. size:engine retires with the engine (final bytes recorded
   in the ledger first).
4. New uncompiled floor: a gate asserting plain pipe chains within 1.2x of
   ramda on the eager shapes of the decision suite (we currently match or
   beat; do not regress silently).

## Phase 1: data-last only

- [x] Convert the codegen-emitted array ops to single-form factories
      (template change in codegen/dual-inline.ts land; array.ts regenerates).
      The prototype (71351e4) is the reference implementation; fold it in,
      delete the prototype file.
- [x] Convert the hand-written modules (number, string, object, record, map,
      set, option, result, iter, array-extra, math, guard) off dual and
      dual-untagged. Mechanical per module; land in two or three commits.
      Also converted: typed-array, optic, match (hand-rolled the same
      arguments.length dispatch without literally calling dual()), plus
      every consumer package outside packages/fp that imported dual()
      directly (autodiff, color, async, diff) and their downstream callers
      (packages/state's use of @stopcock/diff and @stopcock/fp/optic).
- [x] Delete dual-untagged.ts (fully internal, no public export -- safe
      once every in-package consumer converted). dual.ts (the public
      @stopcock/fp/dual export) is deliberately NOT deleted this phase:
      packages/date/src/{format,parse,round,duration,tz,business,range,
      arithmetic}.ts still import it, and packages/date is owned by a
      concurrent session this phase does not touch. Every hand-written
      overload type that existed only to work around dual's inference
      collapse is deleted from the modules that did convert.
- [x] Update all internal call sites and tests using data-first form.
- [x] Compiler: transform recognises only the bound form now. Verified
      (not merely assumed) by reading resolveStepOpName/analyzeStep in
      packages/fp-compiler/src/transform.ts and ops.ts: there was no
      data-first recognition path to delete -- pipe steps were already
      required to be data-last, since fusion only ever looks at the
      registry-tagged curried operator. Confirmed by a full grep across
      fp-compiler's src and tests for "data-first" (zero hits beyond the
      unrelated bare-op comment) and by 538/538 fp-compiler tests plus a
      clean check:source/check:types before and after every other change
      in this phase.

Gate: full suite green, consumer-size gates improve (expect roughly the
prototype's 1.66x on op-heavy consumers), compiler-perf-gate unchanged.

## Phase 2: delete the engine

- [ ] D3 sweep FIRST: find every consumer of _op tags, registerTrustedOperator,
      opcodes.ts, registry.ts outside the engine itself (eslint-plugin-fp,
      fp-testing, fusion-debug explain, anything in benchmarks). Record the
      list in the ledger before deleting anything.
- [ ] Rewrite pipe/flow as application/composition. compile/compilePure
      alias pipe at runtime.
- [ ] Delete the compact engine: internal/compact-runtime.ts, plan building,
      segment machinery, tag stamping, the fusion.ts internals behind pipe.
      fusion-debug keeps a truthful explain() (reports 'sequential' or
      'compiled site' only).
- [ ] Generator stops emitting opcodes.ts and registry.ts if the D3 sweep
      clears them; ops-table.ts remains the compiler's input.
- [ ] Gates: record final engine bytes, retire size:engine. Add the
      uncompiled floor gate (invariant 4). Delete the selector prototype and
      its bench column; the decision suite keeps fused rows only as a
      historical column if free, else deletes them.

Gate: full suite green, packed smoke green, decision-suite naive rows become
the pipe rows and hold invariant 4, option/result and dict compiled corpus
untouched.

## Phase 3: re-oracle and clean up

- [ ] fuzz-correctness and the differential corpus re-oracle to sequential
      application (results and early-exit counts exact; per-tier callback
      pins updated once, deliberately, with D1 noted in each file).
- [ ] iter.ts (D2): measure PlannedIterNode against plain generator
      composition on the parity:iter benches. Simplify only with the delta
      recorded here; the lazy re-iteration contract is not negotiable.
- [ ] scan: fix the runtime implementation that loses to ramda, and the
      compiled scan boundary that runs unfused (separate known issue).
- [ ] Docs: compiler README interleaving contract, fp README perf claims
      rewritten from the current bench tables, "compile the hot paths"
      guidance with stopcock check.

Gate: full suite, perf:gates, packed smoke. Ledger closed with final line
counts.

## Decision points

- D1: callback interleaving unspecified across tiers. Recommended: yes.
- D2: iter plan machinery vs plain generator composition. Measure first.
- D3: tag/opcode/registry consumers outside the engine. Sweep decides.

## Not doing

Runtime JIT, shipping the adaptive selector, cross-file helper inlining
(future plan when same-file inlining proves insufficient), a Node register
loader (demand-gated), webpack support, changing compiled-tier semantics.

## Expected totals

| Phase | Delta (rough) |
| ----- | ------------- |
| 1     | -2,500 (dual, overloads, dispatch paths) |
| 2     | -4,000 (engine, plan machinery, generated artifacts) |
| 3     | -500 net |
| Net   | roughly -7,000 lines, uncompiled chains 2.5-4x faster, consumer bundles ~1.6x smaller |

## Ledger

Append one line per phase: `Phase N landed at <commit>`.

Phase 1 landed at 3fdcc46 (10 commits, b23e09c..3fdcc46). Full monorepo
suite (`vp test run --exclude packages/synth/** --exclude packages/date/**`,
isolated, no concurrent load): 3790/3792 passing, 182/184 files; the two
failures are a pre-existing, unrelated peer-dependency version-string
assertion (`^2.0.0` vs the prerelease `2.0.0-next.0`) in
fp-interop/pack.test.ts and fp-testing/companion-packages.pack.test.ts,
last touched by an unrelated commit (5db6fca) before this phase started.
packages/fp's own suite: 45 files / 1046 tests green; check:source,
check:types, codegen:check, manifest:check, check:portable all clean.
Size gates (benchmarks/src/reference): fp-package-size-gate, s8-root,
s3b-untagged, s9-compact, s10-prototype-pack all pass at their existing
ceilings (no ceiling changes needed -- e.g. s3b-untagged's option/result
flow rows sit at 140-149B gzip against a 922B ceiling, well inside;
object.pick at 303B against 717B). compiler-perf-gate.ts geomean measured
1.806-1.830 across three separate runs (baseline 1.818), consistently
>= the 1.8 floor -- unchanged, as required. Ambient-load note: earlier
same-session runs of compiler-perf-gate and the broader 23-gate
run-gates.ts manifest were taken while a full monorepo vitest run was
concurrently executing on the same machine and produced visibly noisy
numbers (including one non-reproducible sub-threshold compiler-perf-gate
reading); every number reported above was re-measured with nothing else
running.

Deviations from the plan, decided rather than silently applied:
- dual.ts (the public @stopcock/fp/dual export) is NOT deleted this phase.
  packages/date/src/{format,parse,round,duration,tz,business,range,
  arithmetic}.ts still import it, and packages/date is owned by a
  concurrent session this phase was told not to touch. dual-untagged.ts
  (no public export, zero external consumers) is deleted as planned.
  Follow-up: once the date session's own work lands, migrate those eight
  files off dual() and delete dual.ts and its `./dual` export.
- Compiler item 5 ("delete the data-first recognition paths") had nothing
  to delete: packages/fp-compiler's transform.ts/ops.ts only ever
  recognised the bound (curried) pipe-step form, confirmed by grepping
  the compiler's own src and tests for "data-first" and by its full test
  suite (538/538) staying green untouched throughout.
- Scope grew beyond the plan's module list: typed-array.ts, optic.ts, and
  match.ts hand-rolled the same arguments.length dispatch dual() used
  elsewhere (without literally calling dual()) and needed the same
  conversion. record.ts, map.ts, and set.ts likewise. Every non-fp package
  that imported dual() directly (autodiff, color, async, diff) was
  converted, plus one transitive consumer bug found only by running its
  suite: packages/state's store.ts/middleware.ts called @stopcock/diff's
  diff/applyUnsafe/compose and @stopcock/fp/optic's view/set data-first
  internally and broke silently (wrong-arity JS calls that don't throw,
  they just return an unapplied closure) until fixed.
- Found and fixed five benchmark correctness bugs unrelated to any of the
  above packages' own test suites: data-first "current" rows in
  core-utilities-perf.ts, structural-perf.ts, scalar-text-hash-perf-gate.ts,
  scalar-text-hash-output.test.ts, and without-perf-gate.ts silently
  measured/compared the wrong thing once their target ops went
  curried-only. Re-oracled four pinned subject-file sha256 hashes
  (core-utilities, data-functional, scalar-text-hash, structural,
  third-wave) that legitimately changed once their pinned files converted.
- map.ts's array.map WeakMap operator-cache (`A.map(f) === A.map(f)` while
  `f` is live) is retired along with the direct-leaf/arity-dispatch
  machinery it was built for, matching the prototype's measured shape.
  map-operator-cache.test.ts (which existed solely to test that cache) and
  the one array.test.ts case with the same assertion are deleted/adjusted.
- Left for Phase 2/3: three additional gates in the broader 23-gate
  run-gates.ts manifest (pipe-dispatch-gate.ts's stable-2-step at a
  hard 1.000 floor with zero margin, compiler-operation-perf-gate.ts's
  drop/dropWhile/flatMap/flatten/take/max/meanByNonEmpty ratios, and
  typed-array-perf-gate.ts's float64/filter/4096/frozen RME) still show
  below-floor or over-RME readings in isolated re-runs despite verifying
  the actual compiled output for drop and flatMap is byte-identical
  before/after this phase (confirmed by calling
  transformStopcockPipelines directly and diffing the emitted code) and
  typed-array.ts's filterLargeNumber/filterLargeLargeBigInt hot loops are
  unchanged line-for-line. These three were not in this phase's required
  gate set (full suite, size gates, compiler-perf-gate, packed smoke, all
  of which are green); recommend a dedicated quiet-machine re-run as a
  Phase 2 or 3 follow-up rather than continuing to chase them here.
