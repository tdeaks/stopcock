# One runtime path

Date: 2026-07-28
Status: DRAFT. Same process as the simplify-and-compile plan: check boxes in
place, append one line per phase to the Ledger with the landing commit.

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

- [ ] Convert the codegen-emitted array ops to single-form factories
      (template change in codegen/dual-inline.ts land; array.ts regenerates).
      The prototype (71351e4) is the reference implementation; fold it in,
      delete the prototype file.
- [ ] Convert the hand-written modules (number, string, object, record, map,
      set, option, result, iter, array-extra, math, guard) off dual and
      dual-untagged. Mechanical per module; land in two or three commits.
- [ ] Delete dual.ts and dual-untagged.ts. Delete every hand-written
      overload type that existed to work around dual's inference collapse.
- [ ] Update all internal call sites and tests using data-first form.
- [ ] Compiler: transform recognises only the bound form now; delete the
      data-first recognition paths and their tests.

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
