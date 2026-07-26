# Performance programme

Revision 2, after adversarial review. Supersedes
`2026-07-25-compiler-as-default-swc-tsc-cli.md` and
`2026-07-25-screaming-fast-compiler-programme.md`; delete both.

Measurements: Apple M4 Pro (10P+4E, 48 GB), Bun 1.3.14, 25 July 2026.
**[M]** measured, **[E]** estimated, **[U]** unverified and load-bearing.

---

## What review changed

Recorded so the reasoning is auditable.

| claim in revision 1 | status | why |
|---|---|---|
| "~200 GB/s of headroom per socket, SIMD is worth doing" | **withdrawn** | 273 GB/s is SoC-wide. 8→16 accumulators is 1.04x **[M]**. That is a per-core plateau at ~80 GB/s, not spare capacity. W4 is cut. |
| "30-40x combined ceiling" | **withdrawn** | Double-counted one bandwidth budget across W4 and W5. |
| "receipts already record the chosen schedule" | **false** | `receipt-emit.ts:128` hardcodes `segmentKinds` to `'stream'`; `:131` sets `loweringHash: null`. The field does not exist. |
| "you already have an autotuner" | **false** | `receipt-emit.ts:9-11` requires byte-identical receipts for identical input. A measuring autotuner makes builds machine-dependent. Direct conflict. |
| "P0.1 affects the boundary-op path, 22 combinations" | **understated** | Ordinary callbacks are affected. `pipe(rows, map(row => sum(row)))` leaves `sum` dangling **[M]**. |
| W1.1 in phase 1 | **resequenced** | It preallocates the arrays W1.2 deletes. |
| "split accumulators for every reduction terminal" | **scoped down** | Breaks `every`/`some` short-circuit and `min`/`max` NaN handling. Not bit-identical for floats. |
| "shape B is done, don't spend effort on early exit" | **narrowed** | One data point at ~50% selectivity. `take(10)` behind a 1% filter is a traversal shape. |

---

## Measured baseline

Shape A, `filter → map` then `sum + count + some`, n=10M:

| | G elem/s | vs today |
|---|---:|---:|
| compiler output today | 0.52 | 1.0x |
| hand-written kernel **[M]** | 2.77 | 5.4x |
| read+write copy ceiling **[M]** | 4.26-5.11 | — |
| read-only ceiling, 8 lanes **[M]** | 8.06-9.77 | — |

The read-only ceiling is **unfiltered**. Shape A has a filter, and filtered
reductions gain only 1.39x from lane splitting **[M]**, so shape A cannot reach
it. Do not quote 18x.

Per-core plateau **[M]**: 1 lane 1.87, 4 lanes 6.35, 8 lanes 10.00, 16 lanes
9.96 G elem/s. Saturation at 8 lanes, ~80 GB/s. More independent work does not
help. This is the ceiling that governs the whole programme.

---

## P0 — blockers

Nothing else ships first. All three are silent-failure classes.

### P0.1 Dangling references to pruned imports

**Symptom.** `pipe(xs, A.max)` emits `var _boundary0 = (A.max)` with
`import * as A` removed → `ReferenceError` at runtime. Site reports
`transformed: true`, so `diagnostics: 'error'` does not catch it.

**Root cause, corrected.** Not the boundary path.
`recordReplaced(call.start!, call.end!)` (transform.ts:683, 705, 730, 763, 775)
marks the entire call range dead, while codegen re-emits arbitrary subranges of
that same range verbatim via
`renderExpression = (node) => code.slice(node.start!, node.end!)`
(codegen.ts:930), plus inlined callback bodies (codegen.ts:35) and step
captures (codegen.ts:1183). Any identifier surviving into output but living
inside a replaced range is misclassified dead at prune-imports.ts:49-50.

**Verified classes [M]:**

| input | dangling |
|---|---|
| `pipe(xs, A.max)` | `A` |
| `pipe(rows, map(row => sum(row)))` | `sum` |
| `pipe(rows, A.map(row => pipe(row, A.sum)))` | `pipe`, `A` |

**Steps.**
1. Replace range-based liveness with reference-based. After MagicString
   assembly, re-parse the emitted output and collect its free identifiers.
   Prune an import only if its local binding does not appear in that set.
   Slower but correct, and correctness is not negotiable here.
2. If re-parsing costs too much, have codegen return the set of source
   identifiers it re-emitted, and union that into the live set. Requires
   `renderExpression`, the inline path, and the step-capture path to report.
   Faster, but every future re-emission site must remember to report — which
   is exactly how this bug happened. Prefer step 1.
3. Add a fixture per verified class above, asserting the module **executes**.
4. Blocked by P0.3, which is what lets step 3 be meaningful.

**Acceptance.** All six classes execute. A deliberately reintroduced prune bug
fails the suite.

### P0.2 Silent no-ops

Two paths return the input unchanged with `diagnostics: []`, under
`diagnostics: 'error'`:

- **Parse failure** — `transform.ts:500-502` catches and returns. A file using
  decorators or any unsupported syntax is silently skipped.
- **CJS input** — `transform.ts:517-519`. No `ImportDeclaration` means
  `hasAnyBinding` is false, so the file is skipped. This is not a CLI-only
  concern; it is every host, today.

**Steps.**
1. Add a `DiagnosticSite`-level or file-level diagnostic for both, with
   distinct reason codes (`parse-failed`, `no-esm-bindings`).
2. Under `diagnostics: 'error'`, both fail the build.
3. Distinguish "file does not use stopcock" (silent, correct) from "file uses
   stopcock via `require`" (must warn). Requires a cheap `require(` +
   `@stopcock/fp` text probe before the ESM check.

**Acceptance.** A decorator file and a CJS file each fail under
`diagnostics: 'error'` with the right reason code.

### P0.3 The differential oracle cannot see import pruning

**This is why P0.1 shipped, and without fixing it P0.1 recurs.**

`harness.ts:22` defines `stripImports`, `:49` applies it, `:54` injects `pipe`
and `A` as `new Function` parameters. Whether prune-imports removed a
declaration is unobservable to the oracle by construction.

**Steps.**
1. Add an execution lane that writes the transformed output to a real `.mjs`
   file and imports it, with `@stopcock/fp` resolved through the workspace.
2. Keep the existing `new Function` lane — it is faster and still valuable for
   semantics. Add the module lane as a second, smaller corpus covering every
   op in `ops-table.ts` at least once.
3. Every op in the table gets one module-lane fixture. Generate the fixture
   list from the table so a new op cannot be added without one.

**Acceptance.** Module lane covers 39/39 ops. Reverting the P0.1 fix turns it
red.

### P0.4 The docs claim is false

`apps/docs/src/content/docs/performance/benchmarks.mdx` says root `pipe` fuses.
It has been sequential since bf49879. Fix before promoting anything.

### P0.5 The optimizer loses to doing nothing

`@stopcock/fp-optimizer` measured 0.77x at 4 pipeline steps, 0.49x at 5, 0.53x
at 6, against unfused root `pipe` **[M]**. It also produces no samples in
`long.bench.ts > map→map→map→map→map` at n≥10,000, blocking report generation,
and swings 1,022-11,371 ops/sec on an identical shape depending on what ran
before it.

**Steps.** Diagnose against the 233-entry `FusionRunnerDescriptorV1` bank.
Either extend coverage past 3 steps or fix the generic path. Then decide:
optimizer becomes credible, or root `pipe` points back at fusion.

**Acceptance.** Optimizer ≥ root at every depth 1..10.

---

## W0 — fix the evidence system

Everything downstream is decided by measurement. The measurements in revision 1
bypassed the apparatus this repo already has.

**W0.1 Use `perf-runner.ts` for every decision.** It does ABBA-interleaved
paired micro-batches sharing warmup/GC/JIT state, bootstrap median CIs, and
sign tests. Revision 1's numbers have none of that. The 8-accumulator loop
varies 8.80-10.23 G elem/s within one warmed process (16%), while the 8→16
"effect" was 4%. That decision was noise.

**W0.2 Two engines, always.** `compiler-perf-contract.ts:151-161` already uses
different case floors for JSC (0.8) and V8 (0.7) because they diverge.
Producing 2M elements: 0.67 ms preallocated vs 2.58 ms pushed on Bun, 3.02 ms
vs 9.76 ms on Node — a 4.5x engine difference on precisely the operation W1.1
concerns. No constant lands on one engine's evidence.

**W0.3 Measure at the corpus sizes that exist.** `setup.ts:12` is
`[100, 1_000, 10_000, 100_000]`. Every unroll number in revision 1 was taken at
n=10M, which is divisible by 8 and hides the remainder loop entirely. Unrolling
must be measured at n=100, where the remainder loop and register pressure are
pure cost.

**W0.4 State whether results are consumed.** Every figure must come from a
harness with a live consumer, and say so.

---

## W1 — codegen

Ordered by dependency, not by size of win.

### W1.2 Deforestation *(first, it enables the rest)*

Fuse the pipeline into its consumer when the result is consumed in scope.

**Measured [M]**, by selectivity × downstream terminals:

| | 1 terminal | 3 terminals |
|---|---:|---:|
| 10% selectivity | 1.34x | 1.80x |
| 50% | 2.02x | 2.59x |
| 90% | 2.84x | 4.02x |

Single-consumer only is the `/1` column: **1.34x-2.84x**. The `/3` column is
W1.3, not this.

The property that matters is not the multiplier: deforested cost is flat at
6.0-7.6 ms across every cell while materialised climbs 10.1→27.1. It makes
pipeline cost independent of selectivity and read count.

**Steps.**
1. Multi-site analysis: find `pipe()` results bound to a `const` used exactly
   once, in the same scope, not exported, not captured by a closure that
   escapes.
2. Alias analysis is the risk. JavaScript has getters, proxies, and
   `arguments`. Start with the provably-safe subset: local `const`, initialised
   by a `pipe()` call, all uses syntactically visible in the same function
   body. Refuse anything else.
3. Emit the consumer's loop body inside the producer's loop.
4. Requires the transform to hold more than one call site. This is the change
   that makes W2 possible; it is not blocked by W2. **Revision 1 stated the
   dependency in both directions; this is the correct one.**

**Acceptance.** Deforested and non-deforested output agree on the fixture
corpus, including callback invocation counts and order.

### W1.3 Shared scans

Multiple terminals over the same source become one pass. Worth Nx for N
terminals; the `/3` column above.

Same prerequisite as W1.2 and lands with it.

### W1.1 Preallocation *(after W1.2)*

**Measured [M]:** pure map chain 3.23x, `take(k)`-bounded 1.30x, unbounded
filter 0.98x.

Rule:
- every stream op cardinality-preserving → `new Array(n)`, index-assign
- bounded by `take(k)` → `new Array(min(n,k))`, index-assign,
  **`.length = produced`** at exit
- anything else → keep `push`

**`.length = produced`, not `.length = k`.** Revision 1 said `k`. With a filter
upstream, fewer than k elements can be produced and `.length = k` leaves holes.
That was a correctness bug in the plan text.

Sequenced after W1.2 because deforestation deletes the array entirely for
single-consumer pipelines. What remains is genuinely-materialising pipelines,
which is a smaller set than revision 1 assumed.

### W1.4 Callback inlining

- **Local bindings.** `const f = x => ...` unshadowed, never reassigned, not
  exported. Babel `Scope` has the constant-violation data. **1.2x [M]** on
  shape A, **0x [M]** on early-exit shapes.
- **Cross-module.** Deferred. It requires module-graph access inside
  `transform`, which breaks the per-file contract every unplugin host is built
  on (plugin.ts:63-116) and destroys incremental rebuild caching. If it ships,
  it works in some hosts and not others, forking semantics and receipts by
  bundler. Not worth that before the local half is proven.

Note `INLINE_CALLBACK_LIMIT = 3` (codegen.ts:50) already exists and is
undocumented folklore. Re-derive it under W0 rather than adding more.

### W1.5 Accumulator splitting — **scoped down**

**Measured [M]:** unfiltered reduction 1.87 → 6.35 (4 lanes) → 10.00 (8 lanes)
G elem/s. Filtered reduction 1.39x. Plateau at 8; 16 gives 1.00x. Lanes must be
scalar locals — held in a `Float64Array` they measure 2.68 G elem/s, worse than
4 scalar lanes **[M]**.

Revision 1 said "split accumulators for every reduction terminal". That is
wrong three ways:

- **`every` / `some`.** Splitting evaluates up to 7 predicates past the
  short-circuit point. A throwing or effectful predicate changes behaviour.
  **Excluded entirely.**
- **`min` / `max`.** codegen.ts:846-859 uses `<` / `>`, false against NaN, so
  today a NaN only wins as element 0. With 8 lanes a NaN anywhere becomes its
  lane's value and can survive the combine. **Excluded entirely.**
- **Float `sum` / `reduce`.** Not bit-identical: relative difference ~5e-14
  **[M]**. Requires the numeric contract (W-NUM). **Gated.**

**What ships without a contract:** integer `sum`, integer `reduce` with a
declared-associative operator, and `count`. All bit-identical **[M]**.

Unroll to 8, never 16, and emit a remainder loop. Measure at n=100 first
(W0.3).

---

## W-NUM — the numeric contract

New workstream. Two of the largest techniques are not semantics-preserving, and
revision 1 had them landing in a default `exact` build.

| technique | float | integer |
|---|---|---|
| accumulator splitting | not bit-identical, ~5e-14 **[M]** | identical **[M]** |
| algebraic fusion | 304,672/500,000 samples differ, worst 1.11e-10 **[M]** | identical **[M]** |

Purity and numeric associativity are **orthogonal**. `assumePure` is a callback
flag and README.md:56 says it "does not currently enable extra rewrites".
Callback purity does not license reassociating IEEE-754 addition.

**Steps.**
1. Third axis in `StopcockCompilerOptions`: `numeric: 'exact' | 'reassociate'`,
   default `'exact'`.
2. Thread through `transform.ts:480` alongside `semantics`.
3. Add to the receipt schema, versioned, so a consumer can audit which sites
   were reassociated and exclude them.
4. Include in `configHash` (plugin.ts:33-42) so receipts invalidate correctly.
5. Document the error bound per technique, with the measurements above.

**Acceptance.** A default build produces bit-identical floats. Opting in is
recorded per site in the receipt.

---

## W-ALG — algorithmic rewrites

The only tier that changes complexity. Highest measured value in data-intensive
work.

**`sortBy → take(k)` as bounded selection.** O(n log n) → O(n log k). Measured
**3.95x** of a 9.2x total on a 5M-row top-10 analytics query **[M]** — the
single largest contributor, larger than every codegen technique combined on
that shape.

**Corrected from revision 1**, which called this "the cheapest large win
because the algorithms are already written". It is not a port:

- transform.ts:135-151 (`retainedPortablePureRewrite`) shows the AOT path
  *deliberately declines* these sites so the runtime rewrite survives.
- Bounded selection is **not stable**. Ties emerge in a different order than
  `sortBy` then `take`. That is an observable result change, not a trace
  change.
- emitter.ts:404-409 — the fuzz oracle checks exact comparator traces, which a
  selection algorithm will not match.

So this needs a stability decision, a contract (arguably W-NUM's axis extended
to ordering), and an oracle that compares sets rather than traces for these
sites. Cheapest *semantics-changing* win, not cheapest win.

**Callback elision** (`map(identity)`, always-true filters) is genuinely cheap
and exact. Ship that half first.

---

## W-DATA — data representation

Both measured in the analytics query, neither in revision 1.

- **Dense-key grouping**, **1.53x [M]**. When the group key is a dense integer
  range, accumulate into a typed array instead of hashing into a `Map`.
  Requires proving density from the key projection, or a user annotation.
- **Columnar layout**, **1.53x [M]**. The query touched 4 of 6 fields;
  array-of-objects pays for all 6 in every cache line. The compiler **cannot**
  do this to the user's data — it is a representation the user must opt into.
  This is what `table-1.0` is for. Scope it there, not here.

---

## W6 — reach

Codegen benefits nobody who cannot run it. **Sequenced after W1** so what ships
is not 5x off its ceiling.

**W6.1 `stopcock compile` CLI.** `bin.stopcock` exists; `cli.ts` is currently
`stopcock check` and states it "never compiles". Add a subcommand. Per file:
`transformStopcockPipelines` → write `code` and `map` → `buildCompilerReceipt`
per site → write `stopcock-receipts.json`. Roughly the bookkeeping at
plugin.ts:75-123 plus a file walker. Covers tsc, Deno, Node-from-source,
Turbopack, library builds. P0.2 must land first, or the CLI inherits the silent
no-op.

**W6.2 Widen unplugin** to rspack, farm, rolldown — already supported by
`createUnplugin`. Export entries plus a fixture each.

**W6.3 tsc** via the CLI as a pre-pass. Do not build a
`ts.TransformerFactory`: tsc cannot load one without ts-patch, and our codegen
emits text while a transformer must return nodes.

**W6.4 SWC.** Deleted as a workstream. A native plugin means porting
`codegen.ts`, `ops-table.ts` and `inline.ts` to Rust, which is a separate
project, and saying "scope separately" inside a plan item is an admission it
is not one. **Keep only** the Next.js fixture proving the existing webpack
adapter already works, which is the part with value.

---

## W7 — evidence

**W7.1 Hand-written baseline lane.** Today the compiler is only compared to
`benchmarks/src/reference/emitter.ts`, which also builds with `push`. Add
frozen hand-written kernels, hashed like the emitter.

**Land the lane without a threshold.** Revision 1 asserted `>= 0.85`. The
compiler currently sits at ~0.19 on shape A (1/5.4). A gate three phases ahead
of the work is a gate that gets lowered, and then it is a number in a config
file rather than a gate. Publish what the lane says, set the threshold from
what is achieved.

**W7.2 Fix the reference emitter** alongside W1.1. The reported ratio will
fall. Correct; changelog it.

**W7.3 Receipt invalidation.** `emittedCodeHash` is
`sha256(context.emittedCode)` over the whole transformed file
(receipt-emit.ts:134, plugin.ts:88). Every W1 landing changes it for every site
in every file, breaking `stopcock check` for every consumer on every release.
Needs a migration story before W1 ships, not after.

**W7.4 Schedule recording.** `segmentKinds` is hardcoded `'stream'`
(receipt-emit.ts:128) and `loweringHash` is always `null` (`:131`). The receipt
records which operators were seen, not what was done to them. If "the build
tells you which schedule it chose" is the pitch, this is the work that makes it
true, and it was unscoped in revision 1.

---

## W2 — the planner *(deferred, deliberately)*

The case is real: every technique varies 1x-6x by shape, so no fixed pass order
is right. But revision 1 checked off four prerequisites it does not have:

- **No cost model.** A *measuring* autotuner conflicts with
  receipt-emit.ts:9-11 — "Determinism is the whole point. Identical source,
  config, and semantics must produce byte-identical receipts." Measuring at
  build time makes output machine-dependent, churns receipts, and breaks
  content-addressed caching. A *modelled* planner needs a cost model that does
  not exist and is not scoped.
- **No schedule recording** (W7.4).
- **No legality contract** for the reorderings it would choose (W-NUM).
- **No third-party corpus.** Deferring W6 while designing a search-based
  scheduler means tuning against `benchmarks/`, which we wrote.

**Do W1 as explicit shape-gated rules first.** The gating conditions are
already measured and written above. If those rules prove insufficient, that is
the evidence for a planner, and by then W6 has supplied a corpus and W7.4 has
supplied the recording.

---

## Sequencing

| phase | work | gate |
|---|---|---|
| 0 | P0.3 oracle, then P0.1, P0.2, P0.4, P0.5 | module lane green on 39/39 ops |
| 1 | W0 evidence system | every constant re-derived on two engines |
| 2 | W1.2, W1.3 | callback counts and order preserved |
| 3 | W1.1, W1.4 local, W7.1, W7.2 | hand-written lane published |
| 4 | W-NUM contract, then gated W1.5 | default build bit-identical |
| 5 | W-ALG callback elision, then bounded top-k | stability decision recorded |
| 6 | W6.1, W6.2, W6.3, W7.3, W7.4 | CLI output byte-identical to vite adapter |
| 7 | W-DATA via `table-1.0`; W2 only if W1 rules prove insufficient | — |

**Cut entirely:** W4 (SIMD via WASM). Refuted by the per-core plateau. Also
bounded above by a copy measured at 4.26-5.11 G elem/s **[M]** against a pure-JS
8-lane loop at 8.06-10.00 — getting data into linear memory costs more than the
loop it accelerates.

**Demoted to a two-day spike:** W5 parallelism. Closure transport across
workers is unsolved (callbacks capture lexical environments and are not
structured-cloneable), `SharedArrayBuffer` is typed-array only while the
flagship analytics benchmark is 5M objects, browsers need COOP/COEP, and at
n=10M the whole job is ~1 ms against 50-200 µs worker dispatch. If the spike
says otherwise, reinstate it with numbers.

**Before reinstating W4, one falsification test:** an f64x2 reduction over data
already resident in WASM linear memory, versus the 8-lane JS loop. One
afternoon. If SIMD cannot beat 10 G elem/s on data it does not have to copy,
the question is closed permanently.

---

## What this is worth

Phases 2-4 are measured: **~5x on shape A**, **~9x on the analytics shape**,
single core.

No combined multiplier is quoted for phases 5-7, because revision 1's 30-40x
came from multiplying two estimates against one bandwidth budget.

## The claim

> Full-traversal pipelines materially faster than idiomatic JS, gated against
> hand-written baselines rather than our own emitter.
>
> The build tells you, per site, what it did and what it could not do.

The second line is the differentiator and it is currently **false in three
ways**: parse failures and CJS are silent (P0.2), pruning bugs report success
(P0.1), and the receipt does not record what was done (W7.4). Fixing those is
worth more than any multiplier in this document, because it is the only claim
here that a competitor's next release cannot take away.
