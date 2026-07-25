# Performance programme: measured plan

Everything here is anchored to numbers taken on 25 July 2026, Apple M4 Pro
(10 P-cores, 4 E-cores, 48 GB), Bun 1.3.14. Figures marked **[M]** were
measured in this session. Figures marked **[E]** are estimates and say what
they rest on.

## Baseline and ceilings

Reference shape A, full traversal, n=10,000,000:
`filter → map`, then `sum + count + some`.

| | G elem/s | vs today |
|---|---:|---:|
| compiler output today | 0.52 | 1.0x |
| hand-written kernel, demonstrated **[M]** | 2.77 | **5.4x** |
| read+write ceiling (f64 copy) **[M]** | 5.11 | 9.8x |
| read-only ceiling (f64, 16 accumulators) **[M]** | 9.59 | **18.4x** |

Reference shape B, early exit, n=10,000: `filter → map → take(10)`.

| | ops/sec |
|---|---:|
| compiler output today **[M]** | 32,220,101 |
| best achievable **[M]** | 40,820,169 |

**Shape B has 1.27x of headroom and is done.** All remaining performance lives
in full-traversal shapes. Do not spend effort on early-exit codegen.

### The machine is not the constraint

M4 Pro has roughly 273 GB/s. The fastest single-core loop measured used 77.
We are bound by per-element load/convert/add throughput in the engine, not by
DRAM. Two consequences:

- SIMD is worth doing. There is ~200 GB/s of headroom per socket.
- Parallelism is capped by bandwidth at roughly 3.5x, not 10x, despite 10
  P-cores.

## Dead ideas, with the evidence that killed them

Recorded so nobody re-proposes them.

| idea | measurement | verdict |
|---|---|---|
| narrow the element type (f64→f32/i32/i16) | f64 9.25, f32 3.74, i32 2.32, i16 2.33 G elem/s **[M]** | **harmful.** JS numbers are f64; every narrow read pays a conversion that costs more than the bandwidth saved |
| branchless masking of filters | branchy 2.42, branchless 1.57 G elem/s **[M]** | **harmful.** The predictor handles it; the multiply is pure added work |
| SIMD for streaming `map` | bounded by copy at 5.11 G elem/s **[M]** | low value for materialising maps; high value for reductions, see W4 |

## P0: blockers

Nothing ships on top of these.

**P0.1 The compiler emits code that throws.** `prune-imports.ts` removes an
import that the boundary-op path still references:

```js
// pipe(xs, A.min)  →
var _boundary0 = (A.min)     // `import * as A` was pruned
// ReferenceError: A is not defined
```

Confirmed by execution for `min`, `max`, `sort`, `sortBy`, `reverse`, `uniq`,
`flatten`, `tail`, `init`, `head`, `last`, `join`. 22 import/operator
combinations. The site reports `transformed: true`, so `diagnostics: 'error'`
does **not** catch it. A clean build ships code that crashes on first call.

**P0.2 The docs claim is false.** `benchmarks.mdx` says root `pipe` fuses. It
has been sequential since bf49879.

**P0.3 The optimizer loses to doing nothing.** Below root `pipe` from 4 steps
(0.77x at 4, 0.49x at 5, 0.53x at 6) **[M]**. Also produces no samples at all
in `long.bench.ts > map→map→map→map→map` at n≥10,000, which currently blocks
report generation, and swings between 1,022 and 11,371 ops/sec on an identical
shape depending on what ran before it.

---

## W1: schedule-aware codegen

The core of the programme. Each item is gated on shape, because **the value of
every one of these varies by more than an order of magnitude depending on the
pipeline it is applied to.**

### W1.1 Preallocation

Measured value by shape **[M]**:

| shape | gain |
|---|---:|
| pure `map` chain | 3.0x |
| aggregation (shape A) | 1.6x |
| bounded by `take(k)` | 1.27x |
| unbounded `filter` | none (122,332 vs 121,624) |

Rule: emit `new Array(n)` with index assignment when every stream op preserves
cardinality; `new Array(min(n,k))` plus `.length = k` when bounded by `take`;
keep `push` otherwise. Over-allocating to `n` for a filter buys nothing and
costs memory.

Touches `generateFusedBody` / `generateFusedLoop`. Cardinality classification
already exists in the registry.

### W1.2 Deforestation

If the pipeline result is consumed exactly once by a known consumer in scope,
fuse into the consumer. No output array, no write traffic, no second read.

Largest single contributor measured: the V2→V3 step was **2.3x [M]** (with
W1.3). Moves a materialising pipeline from the 5.11 ceiling to the 9.59 one.

Needs the transform to see past one call site. Prerequisite for W2.

### W1.3 Shared scans

```ts
const total = pipe(ys, sum); const n = pipe(ys, count(p)); const any = pipe(ys, some(p))
```

Three passes become one. Worth Nx for N terminals over the same source, and N
is commonly 3-5 in report and dashboard code.

Same prerequisite as W1.2: multi-site analysis.

### W1.4 Callback inlining

Two parts:

- **Local bindings.** `const f = x => ...` in the same module is statically
  resolvable but is not inlined today; only call-site literals are. Guard on
  `const`, arrow or function expression, unshadowed, never reassigned, not
  exported. Babel `Scope` has the constant-violation data.
- **Cross-module.** Bundler adapters have the module graph, so imported
  callbacks can be inlined too. CLI cannot do this; it is the argument for the
  adapters being the premium path.

Measured **1.2x** on shape A, **0x** on shape B **[M]**. Real codebases keep
helpers in other modules, so the cross-module half is worth more than the
local half.

### W1.5 Accumulator splitting and unrolling

The biggest single technique measured, and the most shape-sensitive.

| shape | gain |
|---|---:|
| unfiltered `sum`, 1 → 8 accumulators | **6.1x** (1.60 → 9.77) **[M]** |
| unfiltered `sum`, 8 → 16 accumulators | 1.04x (9.25 → 9.59) **[M]** |
| filtered reduction (shape A) | 1.2x **[M]** |

Serial `s += x` stalls on FP-add latency. Independent lanes remove the stall.
With a filter in the loop the branch already breaks the chain, so the win
mostly evaporates.

Rule: split accumulators for every reduction terminal; unroll to 8; do not go
to 16. Applies to `sum`, `min`, `max`, `count`, `every`, `some`, `reduce` with
a declared-associative operator.

**W1.5 is the argument for W2.** A fixed pass order that always unrolls wastes
effort on filtered shapes; one that never unrolls leaves 6x on unfiltered
reductions.

---

## W2: the planner

W1.1-W1.5 each vary 1x-6x by shape. That is not a pass pipeline, it is a
search problem.

Treat a function as a dataflow graph and plan it: fuse across statements,
share scans, sink filters, choose materialisation points, choose unroll
factors, choose parallel splits. This is what makes W1.2 and W1.3 possible at
all, and what stops W1.5 being applied where it does not pay.

Separate the algorithm from the schedule, as Halide does. The user writes
`pipe`. The compiler picks the schedule. You already have all four pieces:

| needed | you have |
|---|---|
| algorithm IR | `ops-table.ts`, generated |
| legality contract for reordering | `assumePure`, declared, currently unused |
| record of the chosen schedule | `receipt-emit.ts`, hashed, `stopcock check` |
| autotuner | the benchmark harness, paired CIs, frozen references |

`assumePure` is load-bearing. Every reordering optimisation is illegal without
it, and it is already declared at the build boundary and spent on nothing.

---

## W3: algorithmic rewrites

The only tier that changes complexity rather than constants, and therefore the
only one that cannot be caught up with.

- **`sortBy → take(k)` as bounded selection.** O(n log n) → O(n log k).
- **Callback elision.** `map(identity)`, always-true filters.

Both already exist in the runtime for `compilePure` and are deliberately not
lowered AOT, which the README states outright. Closing that is the cheapest
large win on the list because the algorithms are already written.

## W4: SIMD via WASM

Reinstated. We are at 77 of ~273 GB/s, so there is real per-core headroom.

Scope narrowly: reduction terminals over typed arrays, no callbacks that throw
or allocate. `f64x2` gives 2 lanes. Precedent exists in `synth`
(`isSynthWasmBinaryAvailable`, `renderWasmForTest`, stateful WASM runtime).

**[E]** 1.5-2x on reductions on top of W1.5, resting on the bandwidth headroom
above. Do not attempt for materialising maps: bounded by copy at 5.11 G elem/s.

## W5: parallelism

Pure pipeline plus associative terminal plus `SharedArrayBuffer` splits across
workers with no copying. `worker-offloaded-transferable-pipelines` already
plans the transport.

**[E] 3.5x, not 10x.** 10 P-cores but bandwidth caps a parallel reduction near
34 G elem/s against a single-core 9.59. Requires `assumePure`.

## W6: reach

Codegen work benefits nobody who cannot run it.

- **W6.1 `stopcock compile` CLI.** Covers tsc, Deno, Node-from-source,
  Turbopack, library builds. ~200 lines: file walking plus the bookkeeping at
  `plugin.ts:75-123`. Must detect CJS and fail, since `transform.ts` is
  `sourceType: 'module'` and silently no-ops otherwise.
- **W6.2 Widen unplugin** to rspack, farm, rolldown. Already supported by
  `createUnplugin`; needs export entries and a fixture each.
- **W6.3 tsc** via the CLI as a pre-pass. Do not build a
  `ts.TransformerFactory`.
- **W6.4 SWC.** A native plugin means porting codegen to Rust; scope
  separately. Interim: document the pre-pass, and publish a Next.js fixture
  showing the existing webpack adapter already works.

## W7: evidence

- **W7.1 Hand-written baseline lane.** Today the compiler is only compared to
  `benchmarks/src/reference/emitter.ts`, which you wrote and which also uses
  `push`. That is why it scores 2.04x while sitting 5.4x off hand-written. Add
  frozen hand-written kernels, gate on `compiler / hand-written >= 0.85` per
  case.
- **W7.2 Fix the reference emitter** alongside W1.1. The reported ratio will
  fall. That is correct; put it in the changelog.
- **W7.3 Republish** `apps/docs/src/data/benchmarks-*.json` only after W1 and
  P0.3 land.

---

## Sequencing

| phase | work | expected cumulative on shape A |
|---|---|---|
| 0 | P0.1, P0.2, P0.3 | 1.0x, correctness and honesty |
| 1 | W1.1, W1.4 local, W7.1, W7.2 | ~2x **[M]** |
| 2 | W2 planner, then W1.2, W1.3 | ~4.6x **[M]** |
| 3 | W1.5, W1.4 cross-module | ~5.4x **[M]** |
| 4 | W3 algorithmic | complexity win, unbounded |
| 5 | W6 reach | 0x locally, everything for adoption |
| 6 | W4 SIMD | ~8-11x **[E]** |
| 7 | W5 parallel | ~30-40x **[E]** |

Phases 1-3 are measured. Phase 6-7 rest on the bandwidth headroom.

Phase 5 is deliberately after 3: shipping the CLI earlier distributes codegen
that is 5x off its ceiling.

## The claim at the end of this

> Full-traversal pipelines within 15% of hand-written loops, single core.
> 30-40x on parallel reductions.
> The build tells you, per site, which schedule it chose and why.

The last line is the one nobody else offers, and it is the only one that
cannot be beaten by a competitor's next release.
