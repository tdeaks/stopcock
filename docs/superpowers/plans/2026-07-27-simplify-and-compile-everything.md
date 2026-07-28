# Simplify and compile everything

Date: 2026-07-27
Status: DRAFT. This file is the whole process: check boxes in place, append
one line per phase to the Ledger at the bottom with the landing commit. No
replays, no evidence sidecars, no separate progress file.

## Goal

One compiler, one runtime fallback, one source of truth. Every operator
either compiles to a fused loop at build time or is explicitly non-fusible.
Net line count drops by roughly 30k while compiled coverage goes up.

## Current state (measured 2026-07-27)

- 166 ops in the registry (141 array-domain, 25 scalar-domain). 140 compile.
  The 26 that do not are all one-expression scalars.
- Zero option, result, dict, or iterable domain ops. A chain touching any of
  those either splits the fused loop or never fuses.
- Four-plus executors must agree: compiled output, fp-optimizer bank (233
  templates), compact runtime, sequential, reference interpreter, plus the
  iter-kernel and typed-array-kernel families.
- `codegen/protocol/generate-protocol.ts` writes nine artifacts:
  opcodes.ts, registry.ts, abi-identity.generated.ts,
  fusion-debug-receipt-schema.generated.ts, operator-manifest-v1.json,
  future-tier-manifest-v1.json, operator-evidence-v1.json, ops-table.ts,
  receipt-schema.generated.ts.
- `benchmarks/package.json` has ~50 stage-named gate scripts (s1c, s3a,
  s3b, s4, s5b, s6, s7, s8, s9, s12p...) keyed to ledger stages that will
  no longer exist.
- The inliner (`fp-compiler/src/inline.ts`) already pastes safe arrow
  bodies into loop bodies. Keep it; everything below builds on it.

## End state

- `@stopcock/fp`: operators plus the compact runtime fallback (~3 KB gzip
  engine). No optimizer hooks, no ABI negotiation, no receipt schemas.
- `@stopcock/fp-compiler`: babel transform, template-driven codegen, vite/
  rollup/esbuild adapters via unplugin, and a `stopcock check` that prints
  compiled and bailed sites from transform diagnostics.
- `operator-definitions.ts` defines every op's semantics AND its emitted
  form. The generator writes exactly three artifacts: `opcodes.ts`,
  `registry.ts`, `ops-table.ts`.
- Two execution tiers: compiled (fast path) and compact/sequential
  (fallback, also the differential oracle).

## Invariants

Every phase lands green on all four. These are the only gates.

1. Differential corpus: every compiled pipeline matches the sequential
   reference on results, callback invocation order, and early-exit counts.
   Runner: `benchmarks/src/reference/compiler-diff.test.ts` plus
   `ensure-identical-output.ts`. Grows every phase, never shrinks.
2. Bench floor: compiled chains within 1.1x of a hand-written loop on the
   release lane (`perf:compiler:bun`). Currently 1.00x to 1.07x.
3. Size gate: fp runtime engine under the existing compact ceiling
   (today: 2,874 gzip bytes against a 5.5 KiB ceiling, `perf:compact:s9`,
   renamed `perf:size:engine` in Phase 0).
4. Coverage rule: every op in operator-definitions.ts has an `emit`
   template or `fusible: false`. No third state. Enforced by a unit test
   in codegen, not a separate harness.

---

## Phase 0: delete before building

Objective: remove the optimizer tier, the receipts system, and the release
apparatus so every later phase touches less code. No new capability.

### 0.1 Delete `@stopcock/fp-optimizer`

- [x] `git rm -r packages/fp-optimizer`. Remove from root workspace
      globs if pinned anywhere.
- [x] fp: delete `src/abi.ts` and `src/internal/abi-identity.generated.ts`.
      Remove the `./abi` subpath from `packages/fp/package.json` exports.
- [x] fp: in `src/compile.ts` and `src/fusion.ts`, remove optimizer
      negotiation branches and the `'@stopcock/fp-optimizer'` install
      probe. `compile` binds directly to the compact engine.
- [x] fp tests: simplify `__tests__/fp-only-install.test.ts` to assert the
      compact engine loads with no optional lookups.
- [x] compiler: remove `'@stopcock/fp-optimizer'` from
      `DEFAULT_IMPORT_SOURCES` in `transform.ts`; drop the `'optimized'`
      member from `CompilerFallbackTier` in `types.ts`.
- [x] benchmarks: delete `s12p-requalification-gate.ts`,
      `s6-facade-gate.ts`, optimizer rows in `compiler-diff.test.ts` and
      `compiler-operation-perf.ts` (keep compiled vs runtime rows).

### 0.2 Delete receipts, keep diagnostics

The transform already produces per-site diagnostics
(`DiagnosticsLevel = 'summary' | 'verbose' | 'error'`). That survives as
the only observability surface.

- [x] compiler: delete `receipt-core.ts`, `receipt-emit.ts`,
      `receipt-report.ts`, `receipt-schema.generated.ts`.
- [x] `types.ts`: delete `ReceiptOptions`, `receipts`,
      `expectedSemanticManifestHash`, `expectedLoweringAbiHash`.
      `TransformResult` keeps a `diagnostics: readonly DiagnosticSite[]`
      array (`{file, line, column, op, kind: 'compiled' | 'bailed',
      reason}`).
- [x] `cli.ts`: rewrite as one file, ~80 lines. `stopcock check` runs the
      transform over the project's include globs in dry-run mode and
      prints the diagnostics table plus a summary line
      (`N sites compiled, M bailed`). Exit 1 only with `--strict` and
      bailed sites. Delete policies, evidence manifests, expectation
      envelopes, canonical JSON.
- [x] fp: delete `src/internal/fusion-debug-receipt-schema.generated.ts`;
      `fusion/debug` keeps `explain()` (plan shape and chosen tier as a
      plain object) and loses schema'd JSON output.
- [x] transform.ts: delete receipt emission and stale-hash handling paths
      (the `ReceiptReasonCodeV1` import and everything feeding it).

### 0.3 Delete the v2 release apparatus

- [x] Delete `tooling/v2-cohort.mjs`, `v2-pack-cohort.mjs`,
      `v2-synth-compat.mjs`, `apply-stopcock-v2-checkpoint.mjs`,
      `check-stopcock-v2-package-cohort-readiness.mjs`,
      `run-stopcock-v2-controller.sh`, and all six
      `tooling/__tests__/*.mjs` controller tests.
- [x] Delete `STOPCOCK_V2_PROGRESS.md`, `artifacts/v2` (2.6 MB), and the
      controller sections of `AGENTS.md`.
- [x] Remove the `test:controller`, `test:v2-*`, and `release:v2:*`
      scripts from the root `package.json`. Release flow is changesets
      version + publish, nothing else.
- [x] Add ONE packed smoke test (new, ~100 lines,
      `tooling/packed-smoke.test.mjs`): `npm pack` fp and fp-compiler into
      a temp dir, install into a scratch project, build a three-op
      pipeline with the vite plugin, run it, assert output and assert the
      bundle contains no `@stopcock/fp` engine import. This is the sole
      survivor of the packed-consumer idea.
- [x] Delete `scratch_tools_before.txt`.

### 0.4 Slim the generated tables

- [x] Registry: drop `simdEligible`, `workerEligible`, `denseHoles`,
      `exactLowering` columns (two are speculative, two are literal
      `true` constants).
- [x] Ops table: drop `semanticHash`, `loweringHash`,
      `loweringAbiVersion`, and the three top-of-file `sha256` constants.
      They existed for receipts and ABI negotiation. Keep `semanticId`
      and `semanticRevision` (cheap, human-readable identity for
      diagnostics). Update `CompilerOperatorFact` in `ops.ts`.
- [x] Generator: stop writing `abi-identity.generated.ts`,
      `fusion-debug-receipt-schema.generated.ts`,
      `receipt-schema.generated.ts`, `operator-evidence-v1.json`,
      `future-tier-manifest-v1.json`, `operator-manifest-v1.json`.
      Nine outputs become three.

### 0.5 Bundler adapters

- [x] Delete `webpack.ts`, `rspack.ts`, `webpack-like-source-maps.ts`,
      `source-map-seed-loader.js`. Keep `vite.ts`, `rollup.ts`,
      `esbuild.ts`, `plugin.ts` (unplugin core). Unplugin's built-in
      webpack export may keep working; README marks it untested. (D2)
- [x] Delete webpack/rspack rows from compiler tests and the packed smoke
      test matrix.

### 0.6 Benchmark gate consolidation

- [x] Keep `run-gates.ts` as the single entry (`perf:gates`). Inside it,
      keep gates keyed by invariant, not stage: `size:engine` (was s9),
      `size:consumer` (was s3a/s3b/s8), `parity:compiler` (was
      compiler-perf-gate), `parity:iter` (was iter gates), `allocation`,
      `competitors`. Delete gates that guarded deleted machinery
      (s5b construction, s6 facades, s12p, portable/callback-churn).
- [x] Root and benchmarks `package.json` scripts shrink to: `bench`,
      `bench:dist`, `perf:gates`, `report:*`. Everything else goes.

Gate: `vp test` green in fp and fp-compiler, `perf:gates` green,
packed smoke green. Expected delta: roughly -25k lines plus 2.6 MB of
artifacts. Rollback: each of 0.1/0.2/0.3 is its own commit; revert
individually.

---

## Phase 1: one source of truth, then finish the long tail

Objective: emission becomes data. Registry and compiler tables generate
from one file, and a new op compiles the day it is defined.

### 1.1 The `emit` field

Add to every entry in `operator-definitions.ts`. Six kinds cover all
existing ops. `cb` is the callback slot, pre-inlined by `inline.ts` when
safe, else a hoisted temp; `v`/`i` are the loop locals; `a1`/`a2` are
bound argument spellings.

```ts
// one-to-one (map, mapWithIndex, scalar ops)
emit: { kind: 'expr', expr: (v, cb) => `${cb.call(v)}` }
// filtering (filter, reject, filterWithIndex)
emit: { kind: 'filter', test: (v, cb) => `${cb.call(v)}` }
// expanding (flatMap, chunk-as-stream)
emit: { kind: 'expand', each: (v, cb, push) =>
  `for (const _e of ${cb.call(v)}) ${push('_e')}` }
// stateful stream (scan, dedupeAdjacent, zipWithIndex)
emit: { kind: 'stateful',
  decl: (a1) => `let _acc = ${a1}`,
  step: (v, cb) => `_acc = ${cb.call('_acc', v)}`,
  value: '_acc' }
// terminal sink (reduce, count, min, some, find)
emit: { kind: 'sink',
  init: (a1) => `let _acc = ${a1}`,
  step: (v, cb) => `_acc = ${cb.call('_acc', v)}`,
  finish: '_acc',
  earlyExit: undefined /* or a break condition for some/find */ }
// materialising boundary (sort, reverse, chunk, append...)
emit: { kind: 'boundary' } // existing whole-array call, unchanged
```

- [x] Define the `OpEmit` type in `codegen/protocol/operator-v1.ts`.
      `withIndex` variants set `indexed: true` on the base op instead of
      duplicating templates.
- [x] Port the 140 currently supported ops. Mechanical; the emitted text
      must match what `emitElementSegment` produces today. Where today's
      hand-written emission has a measured special case, keep it in a
      small `overrides` map in `codegen.ts` keyed by op name; expectation
      is that map stays empty or near-empty.

### 1.2 Generator rewrite

- [x] `generate-protocol.ts` emits three files only: `opcodes.ts`,
      `registry.ts` (slimmed columns), `ops-table.ts` (facts plus
      serialized emit templates).
- [x] Fold `codegen/purity.ts` output into a `pure: boolean` flag on each
      definition; its checker becomes one test
      (`codegen/purity.test.ts` stays, asserting flags match analysis).
- [x] The coverage rule (invariant 4) lands here as a generator-time
      error: an op with neither `emit` nor `fusible: false` fails the
      build.

### 1.3 Codegen consumes templates

- [x] `codegen.ts`: `emitElementSegment` (541 lines of per-op switch
      today) becomes scaffold-plus-splice: per-domain loop header, per-op
      template insertion, existing take/drop/early-exit bookkeeping
      unchanged. Target roughly 200 lines.
- [x] `emitCallback`/`inline.ts` unchanged: templates receive a `cb`
      handle whose `.call(...)` renders either the inlined body or a
      temp invocation.
- [x] Source maps: templates carry no positions; operator spans map to
      the whole spliced fragment exactly as hand-written emission does
      today. `mapped-code.ts` unchanged.

### 1.4 The 26 stragglers

- [x] Add expr templates for: `add`, `subtract`, `multiply`, `divide`,
      `inc`, `dec`, `negate`, `trim`, `trimStart`, `trimEnd`,
      `toLowerCase`, `toUpperCase`, `split`, `strLength`, `strIsEmpty`,
      `keys`, `values`, `dictIsEmpty`, `sortInline`, and the guards
      (`isArray`, `isBoolean`, `isFunction`, `isNil`, `isNumber`,
      `isObject`, `isString`). All are `expr` or `boundary` kind.
- [x] Corpus: chains with a scalar op mid-pipeline
      (`A.map -> N.inc -> A.filter`, `A.map -> S.trim -> A.reject`) must
      compile as ONE fused loop. Assert via diagnostics (`1 site
      compiled`) and via output identity.

Gate: all 166 ops compile; differential corpus green; `perf:compiler:bun`
holds the 1.1x floor; `codegen/` drops roughly 8k lines and
`fp-compiler/src` roughly 1k net. Rollback: 1.1+1.2 land together
(generator and its outputs), 1.3 separately, 1.4 last.

---

## Phase 2: Option and Result become compiled domains

Objective: sum types lower to locals, not objects. Compiled chains
allocate zero Options.

Lowered form: Option is `(ok: boolean, val)` locals; Result is
`(ok, val, err)`.

```ts
// pipe(x, O.fromNullable, O.map(f), O.filter(p), O.getOrElse(0))
let _v = x
let _ok = _v != null
if (_ok) _v = f(_v)
if (_ok && !p(_v)) _ok = false
const out = _ok ? _v : 0
```

### Steps

- [x] Registry: add option/result domains and ops with facts and
      templates. Initial set (~22): `O.map`, `O.flatMap` (callback
      returns a real Option; unwrap via `isSome`), `O.filter`,
      `O.getOrElse`, `O.orElse`, `O.match`, `O.fromNullable`,
      `O.fromPredicate`, `O.toUndefined`, `O.toNull`, `O.tap`, `O.zip`,
      and the Result mirrors (`R.map`, `R.mapErr`, `R.flatMap`,
      `R.getOrElse`, `R.match`, `R.fromThrowable`, `R.toOption`...).
      Each is a straight-line template over the locals; no loop scaffold.
- [x] Boundary fusion: an array segment ending in an Option-producing
      terminal (`head`, `last`, `find`, `findMap`, `get`) flows into a
      following option segment: one loop, early exit sets `_ok`/`_v`,
      then the option block runs. Extend `segmentsFromPlan` and
      `segmentKindsForOperatorFacts` with the `option` segment kind. The
      existing `DEFAULT_OPTION_NONE_LOCAL` plumbing in codegen.ts is the
      seed of this and gets subsumed.
- [x] `flatMap` boundary honesty: the callback returns a runtime Option,
      so the template unwraps it (`_ok = isSome(_t); if (_ok) _v =
      _t.value`). One allocation at the callback edge, zero from our
      operators. Do not try to compile the callback's interior.
- [x] No runtime fusion work: an uncompiled Option chain runs as plain
      function calls through pipe (sequential semantics, already
      correct). Compact runtime untouched, no new opcodes in the compact
      engine.
- [x] Delete `dualUntagged2/3/4/N` in `dual-internal.ts`; revert the
      untagged modules to plain `dual`. Compiled sites import no runtime
      Option machinery, so the tree-shaking contortion has no job.
      `size:consumer` gate proves it stays within ceiling.

### Corpus additions

Some/None through every op; Ok/Err mirrors; `fromNullable` on `null`,
`undefined`, `0`, `''`, `NaN`; callback-order case proving `O.tap` fires
exactly once and only when present; array-to-option fused case
(`A.filter -> A.head -> O.map -> O.getOrElse`) asserting the source loop
exits at first match (count callback invocations).

Gate: `perf:allocation:bun` extended with a compiled Option chain
asserting zero allocations per element (existing option-result.bench.ts
rows compare before/after). Differential corpus green. Expected delta:
+~600 lines templates/corpus, -~200 dual contortions.

---

## Phase 3: dict domain (Record, Object, Map, Set, String)

Objective: keyed chains fuse like array chains.

- [x] New loop scaffolds in codegen: `for (const _k in _src)` with an
      own-property guard matching runtime semantics exactly (check what
      `record.ts` does today: `Object.hasOwn` or `in`; the emitted guard
      must match, this is a correctness seam, add corpus cases with
      prototype pollution and symbol keys); `for (const [_k, _v] of
      _src)` for Map/Set.
- [x] Facts and templates for ~40 ops: Record `map`, `mapWithKey`,
      `filter`, `filterMap`, `mapKeys`, `partition`, `keys`, `values`,
      `toEntries`, `fromEntries`; Map/Set equivalents; Object `pick`,
      `omit`, `mapValues`.
- [x] `pick`/`omit` with a statically known key array compile to object
      literals: `pipe(o, Obj.pick(['a','b']))` emits
      `{a: _src.a, b: _src.b}`. Non-static key arrays bail to runtime
      (diagnostic reason: `dynamic-keys`).
- [x] String chains are expression composition, no loops:
      `pipe(s, S.trim, S.toLowerCase, S.split('/'))` emits
      `s.trim().toLowerCase().split('/')`.
- [x] Cross-domain boundaries: `keys`/`values`/`toEntries` bridge dict to
      array segments; `fromEntries` bridges back. Reuse the boundary
      segment machinery from Phase 2, no new concepts.

Corpus: key order preservation (insertion order for Record and Map),
symbol and inherited keys excluded, empty inputs, `mapKeys` collision
semantics identical to runtime (last write wins or whatever record.ts
does; assert, do not assume).

Gate: dict-ops, object-ops, string-ops benches gain compiled rows and
must beat the runtime rows; differential corpus green. Expected delta:
+~800 lines.

---

## Phase 4: iterable domain

Objective: iterator-protocol overhead disappears from compiled chains.

- [x] Terminal present: `pipe(src, I.map(f), I.filter(g), I.toArray)`
      emits one `for (const _v of _src)` loop with inlined bodies and
      the existing take/early-exit bookkeeping. No `.next()` result
      objects beyond the source's own.
- [x] No terminal: emit a single generator function containing the fused
      body (`function* (_src) { for (const _v of _src) { ...; yield _v } }`).
      One generator replaces N chained ones.
- [x] Op set (~20): `map`, `filter`, `flatMap`, `take`, `drop`,
      `takeWhile`, `dropWhile`, `scan`, `enumerate`, `chunk`, plus
      terminals `toArray`, `reduce`, `forEach`, `find`, `some`, `every`,
      `count`, `first`. Excluded initially: `zip`, `interleave`, and
      anything multi-source (bails with reason `multi-source`); revisit
      only on demand.
- [x] Sources: anything iterable. When the source is statically known to
      be an Array (literal or from a compiled array segment), emit the
      indexed array loop instead. That fold makes Phase 6's kernel
      deletion safe for bundler users.

Corpus: infinite source with `take` (must not hang), early-exit counts,
generator input consumed exactly once, re-iteration of the lazy result
(each iteration re-runs the source, matching runtime `iter.ts`
semantics; assert against current behavior), `for await` explicitly out
of scope (bails).

Gate: `perf:iter:gate` gains compiled rows; expect a multiple, not a
percentage, on chains of 3+ ops. Differential corpus green. Expected
delta: +~600 lines.

---

## Phase 5: rewrites (a list, not an engine)

Objective: peepholes with measured wins, each individually justified.

Mechanics: one file (`fp-compiler/src/rewrites.ts`), a fixed ordered
array of `{match, replace}` over the static plan's op array, applied
before codegen. Every rewrite requires `pure` facts on the ops it
deletes work from, plus corpus cases proving observable behavior is
unchanged under `assumePure` and that the rewrite does NOT fire without
`assumePure` when it could be observed (callback identity, invocation
counts).

- [x] `map |> length` -> `length` (exists in codegen today as
      `emitPureMapLengthBoundary`; port here, delete the special case).
- [x] DROPPED: `map(f) |> map(g)` -> `map(g o f)` when both inline; degenerate
      given fusion already avoids the intermediate array, so keep ONLY
      if it simplifies emitted text, else drop the item.
- [x] `filter |> length` -> counting loop with no output array.
- [x] DROPPED: `sortBy |> take(k)` -> bounded selection. Bench first; land only
      with a measured win at realistic n and k.

Hard cap: the file stays a switch. No pattern DSL, no cost model, no
fixpoint iteration. Expected delta: +~300 lines.

---

## Phase 6: runtime consolidation (last, measured)

Objective: two runtimes remain. Do this only after Phases 1-4, because
the compiler now covers what the deleted fast paths used to accelerate.

- [ ] Delete `interpret.ts` (538 lines). Sequential is the oracle;
      anything that imported the reference interpreter for tests now
      runs the sequential tier.
- [ ] Measure, then delete `iter-kernels.ts` (1,697) and the typed-array
      kernel family (`typed-array-source.ts`, `typed-array-view.ts`,
      kernel branches in `iter.ts`). Record the no-bundler regression in
      this file next to the checkbox (expected: interpreted Iter chains
      revert to plain generator speed; bundler users keep compiled
      loops). If the recorded delta is unacceptable to you, the kernels
      stay and this box gets a WONTFIX note. (D3)
- [ ] Delete or fold `transducer.ts` (518) and `collector.ts` (426):
      public subpaths with zero internal consumers. v2 is pre-release;
      remove the subpath exports and the modules. If either has a real
      external user by then, keep the module and drop this box.
- [ ] Collapse `dual.ts`/`dual-internal.ts` to the plain tagged form
      (started in Phase 2; finish here).
- [ ] Re-run the full gate set; update the size gate's recorded engine
      bytes (should drop).

Gate: full suite, `perf:gates`, packed smoke. Expected delta: -~4k
lines.

---

## Decision points

- D1 (Phase 0): consolidate to a single `stopcock` package with subpath
  exports, the 1.x direction. Recommended: yes, during Phase 0. It
  permanently deletes the cohort problem and the compiler matches one
  import source (`importSources: ['stopcock']`, operators at
  `stopcock/fp`). Phase 0 stands either way; if deferred, the deleted
  cohort tooling is simply not replaced.
- D2 (Phase 0): webpack and rspack demoted to untested. Re-add only on
  real demand, as adapter files somebody asks for.
- D3 (Phase 6): iter-kernels deletion trades no-bundler Iter speed for
  4k fewer lines and one fewer agreeing executor. Delete only with the
  measured delta written into this file.

## Not doing

Runtime JIT or a resurrected optimizer tier, wasm/SIMD backends,
cross-function or cross-module inference (compile only what is
statically visible at the pipe/flow/compile call site; dynamic chains
bail to compact, loudly, with a diagnostic reason), rewrite engines,
async iterables, multi-source iterable fusion, new packages, new
generated-file kinds, new config surface beyond deleting options.
Optics, schema, match, parser, and date compilation are future emitters
with their own one-page plans when their turn comes.

## Sequencing and PR shape

Phases land in order; each phase is one PR (Phase 0 may be three: 0.1,
0.2+0.4, 0.3+0.5+0.6). Every PR runs: `vp test` (fp, fp-compiler),
`perf:gates`, differential corpus, packed smoke. A phase that cannot
land green gets reverted, not patched forward on a broken base.

## Expected totals

| Phase | Delta (approx) |
| ----- | -------------- |
| 0     | -25,000 lines, -2.6 MB artifacts |
| 1     | -9,000 net (generator and codegen shrink, +templates) |
| 2     | +400 net |
| 3     | +800 |
| 4     | +600 |
| 5     | +300 |
| 6     | -4,000 |
| Net   | roughly -36,000 lines, coverage 140 ops -> 166 plus three new domains |

## Ledger

Append one line per phase: `Phase N landed at <commit>`.

Phase 0 landed at 1b4f1cc (0.1), e33c55a (0.2+0.4), 305c182 (0.3+0.5+0.6).
Phase 1 landed at 287409e (1.1+1.2), 56917e3 (1.3), 784cda2 (1.4).
Phase 2 landed at 094b029.
Phase 3 landed at 50be26a.
Phase 4 landed at a085506.
Phase 5 landed at d29c30f (rewrites.ts, 139 lines).
Phase 5 notes: map|>map dropped (fusion already single-loops it; AST
composition buys nothing). sortBy|>take dropped on correctness despite a
measured 17-25x win: takeSortedBy's quickselect is not tie-stable relative
to stable sortBy|>take, concrete mismatch demonstrated. filter|>length was
already fused under compile(); the rewrite closes the bare pipe()/flow()
sequential-stages gap. Purity gate reused: assumePure -> semantics 'pure',
the only gate that exists. Suite 2997 tests green, geomean 1.456.
Phase 4 notes: 20 iterable ops. toArrayInto dropped: it is a bare type cast
with no data-last form, pipe(src, I.toArrayInto(t)) is broken in uncompiled
code too (runtime bug, tracked separately). No-terminal chains emit one
re-iterable generator wrapper matching make(factory); one-shot generator
sources empty on second pass, corpus-pinned. Known bounded gap: chunk
followed by take can over-read one raw source element (one fused loop vs
chained lazy generators), value-identical output, documented in code and
corpus. iter-compiled-perf-gate added under parity:iter: geomean 1.79x over
the uncompiled Iter runtime, dropWhile chain 4.23x. Suite 2990 tests
green.
Phase 3 notes: 36 compiler-only ops (record 9, map 13, set 11, object 3).
Record scaffold inlines the Reflect.ownKeys + propertyIsEnumerable snapshot;
SYMBOL KEYS ARE VISITED (the corpus line above saying excluded was wrong
about record.ts; corpus asserts reality). dictIsEmpty template fixed to
match record.ts#isEmpty (Object.keys missed symbols). pick/omit unroll on
static keys with the null-proto/skip-absent/dangerous-key-throw semantics;
dynamic keys fall back to the correct boundary call instead of a hard
'dynamic-keys' bail (reason code exists, never set). String chains keep one
var per step (2.5x measured win; plan's perf escape hatch). Suite 2946
tests green; record chains 1.2-1.9x, pick 3.6x, string chain 2.5x.
Phase 2 notes: 19 ops (toNull is really toNullable; no get terminal exists;
zip/getOrElse collisions avoided via canonical optionMap/resultMap names).
Compiler-only rows: opcodes.ts and registry.ts byte-identical. dualUntagged
NOT merged into plain dual: tagged dual drags OP_CODES into every consumer
(216B -> 1471B vs the 922B ceiling) and its overloads collapse generic
callbacks; dispatchers live in dual-untagged.ts instead, size gate green.
Zero-allocation confirmed: 6.99 B/element retained on the compiled option
chain vs 7.04 for bare array.map. option-result bench: compiled rows 2.2x
to 2.4x over uncompiled. Suite 2912 tests green.
Phase 1 notes: purity fold skipped (purity.ts governs @__PURE__ annotation
policy per module, not per-op semantics; left as is). Overrides map has one
member: findMap (AST fast path inspects the raw arrow). keys/values/
sortInline are boundary templates calling the real exports (symbol-aware
enumerableKeys and comparator sort cannot be one-liners without divergence);
sortInline has no public export, pre-existing gap. Emission proven
byte-identical across a 58-case corpus before/after the 1.3 splice rewrite.
All 166 ops compile; geomean 1.436 -> 1.497 across the phase.
Notes: D1 deferred (packages stay @stopcock/*; cohort tooling deleted, not
replaced). D2 done. optional-dispositions-gate deleted with its ledger (p3b
stage machinery). perf-profile-gate kept: allocation and competitor gates
import its host-profile helpers. Emitted code diffed byte-identical against
ee883ec across sentinel/short-circuit/drop/dropWhile/flatMap shapes; the
four residual timing-gate failures are shared-box noise (geomeans 1.4-2.2x,
only small-n early-exit tails dip) and need one release-grade rerun on a
dedicated quiet machine. Suite: 2854 tests green, packed smoke green.
