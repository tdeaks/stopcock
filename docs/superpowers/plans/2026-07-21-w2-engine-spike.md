# W2 cross-engine feasibility spike

Spike for the fp tiered-execution plan (W2). Measures whether the tier-2 monomorphism
premise, generated-loop parity, promotion thresholds, and dynamic import all hold on
V8, JSC, and SpiderMonkey. Scripts live in this session's scratchpad, not checked in
(this doc is the artifact). No production code touched.

## Methodology

All engines run the identical source text (a string, `eval`'d or `page.evaluate`'d so
the exact same bytes execute everywhere). Workload: fuse a filter+map+sum over a
1,000,000-element array (`predFn(v) ? sum += mapFn(v)`), two callback pairs (`cbA/mapA`,
`cbB/mapB`) so a call site can be forced polymorphic or kept monomorphic. Each scenario
runs in its own fresh process (node/bun) or fresh page (firefox) to avoid cross-scenario
contamination — this turned out to matter a lot, see the churn finding below.

- **V8**: node v24.18.0
- **JSC**: bun 1.3.14
- **SpiderMonkey**: Firefox 151.0 via playwright-core 1.61.1 (installed into the
  scratchpad for this spike only, not added to the repo)

Warm timing = 300 measured calls after 2000 untimed warmup calls, `performance.now()`
deltas. First pass used only 50 warmup calls and produced an inverted, wrong result
(generated function looked 4x slower than static) purely from under-warming — worth
noting since it's an easy trap when writing the real promotion-threshold logic.

## Q1: tier-2 monomorphism premise

Shared generated function taking `(arr, predFn, mapFn)` as params, called alternately
with two callback pairs at one call site (tier-1 style, polymorphic on predFn/mapFn)
vs. one specialized closure generated per callback pair via a `new Function` factory
that closes over predFn/mapFn (tier-2 style, monomorphic).

| Engine | Shared/tier-1 (ms/300 iters) | Per-instance/tier-2 (ms/300 iters) | Speedup |
|---|---|---|---|
| V8 (node) | 1748.14 | 225.99 | 87.1% |
| JSC (bun) | 909.91 | 177.76 | 80.4% |
| SpiderMonkey (firefox) | 1267 | 207 | 83.7% |

Premise holds on all three engines, well above the 15% bar (all >80%).

## Q2: generated-loop parity vs hand-written

Same fused loop, written statically in the script vs. produced by the tier-2-style
`new Function` closure above, both fully warmed.

| Engine | Generated (ms/300) | Static (ms/300) | Generated/static ratio |
|---|---|---|---|
| V8 (node) | 225.99 | 408.46 | 55% (faster) |
| JSC (bun) | 177.76 | 165.43 | 108% (parity) |
| SpiderMonkey (firefox) | 207 | 229 | 90% (parity, faster) |

Parity holds everywhere (within 10%, or the generated code is faster). On V8 the
generated closure was substantially faster than the naive static version, not slower —
plausible explanation is the closure gives the specialized function a narrower,
more speculatable call shape than a callback threaded through as a plain parameter,
but this wasn't root-caused further.

## Q1/Q2 caveat: churn degrades promotion, and it's engine-specific

Not asked for directly but surfaced immediately and is important for W4. Created three
extra scenarios: reuse the same specialized closure after a second shape is created and
warmed (`churnedTier2`), alternate two shapes at one call site then measure a *third*
freshly created same-shape closure (`interleavedChurnThenFresh`), and warm two shapes
fully in sequence then measure a fresh third closure (`sequentialChurnThenFresh`).

| Engine | 2nd-shape reuse (churnedTier2) | 3rd fresh closure, interleaved prior churn | 3rd fresh closure, sequential prior churn |
|---|---|---|---|
| V8 (node) | 242.33 ms (~7% slower than clean 225.99) | 1804.05 ms (~8x slower) | 1583.36 ms (~7x slower) |
| JSC (bun) | 727.11 ms (~4x slower than clean 177.76) | 1129.10 ms (~6.3x slower) | 715.28 ms (~4x slower) |
| SpiderMonkey (firefox) | 209 ms (no penalty vs clean 207) | 211 ms (no penalty) | 211 ms (no penalty) |

V8 tolerates two live specializations fine but the third distinct `new Function`
closure created in a process pays a large promotion penalty (roughly an order of
magnitude), whether the prior churn was interleaved at a shared call site or run
sequentially — so it isn't purely an inline-cache-polymorphism story, something about
cumulative dynamic-code volume matters too. JSC degrades earlier, at the second shape.
SpiderMonkey showed no degradation in any churned scenario tried here. This is a real,
reproducible cross-engine difference and it bears directly on the W4 identity-vector
LRU: cache capacity and promotion hysteresis probably need to be tuned per engine, or
at minimum this needs the dedicated perf runner (W7) to characterize properly with a
churn corpus rather than this spike's three ad hoc scenarios. Re-running the same churn
scenarios at a 250x smaller per-call workload (5000 elements instead of 1,000,000) made
the degradation disappear on all engines, so the effect scales with cumulative element
volume processed by prior closures, not merely shape count — treat the numbers above as
a real risk signal, not a precisely characterized threshold.

## Q3: promotion threshold sanity

Time buckets of 100 executions (n=5000 elements/call, to get fast enough buckets while
still triggering tier-up), first bucket vs. plateau.

| Engine | Bucket 0 (100 execs) | Plateau reached by | Plateau ms/bucket |
|---|---|---|---|
| V8 (node) | 1.272 ms | bucket 1 (200 execs / 1.0M elements) | ~0.43-0.48 ms |
| JSC (bun) | 1.433 ms | bucket 3 (400 execs / 2.0M elements) | ~0.24-0.28 ms |
| SpiderMonkey (firefox) | 5.00 ms | bucket 0-1 already flat within noise | ~2-3 ms |

Firefox's `performance.now()` is clamped to ~1ms resolution (privacy protection), so its
plateau reads noisy and coarse; the practical takeaway is "already stable by the first
bucket," not a precise curve. The churned variant of this same bucket sweep (q3ThresholdChurned)
plateaued just as fast as the clean variant at this smaller n=5000 workload, which
does not reproduce the severe churn penalty from Q1/Q2's n=1,000,000 workload — consistent
with the "penalty scales with cumulative elements processed, not just call count" reading
above.

## Q4: chunk-load behavior

Dynamic `import()` of a module (containing a `new Function` call) from a `data:` URL,
and from a `blob:` URL for the browser case.

| Engine | data: URL import works | Latency | blob: URL import works |
|---|---|---|---|
| V8 (node) | yes | 0.50 ms | not tested (node-only path uses data:) |
| JSC (bun) | yes | 1.93 ms | not tested |
| SpiderMonkey (firefox) | yes | 1 ms | yes, 0 ms |

No CSP was in effect in any of these contexts (default node/bun process, default
playwright `about:blank` page), so this only proves the mechanism works, not that it
survives a real CSP without `unsafe-eval`/`script-src: data:` — that's a separate,
already-known constraint the plan's portable-boundary work is meant to handle, not
something this spike re-litigates.

## Promotion threshold recommendation (initial, pending W7 dedicated runners)

| Engine | Recommended promotion trigger (executions) | Recommended promotion trigger (elements consumed) |
|---|---|---|
| V8 | ~200 executions of a shape, AND | ~1,000,000 elements consumed by that shape |
| JSC | ~400 executions of a shape, AND | ~2,000,000 elements consumed by that shape |
| SpiderMonkey | ~100 executions of a shape, AND | ~500,000 elements consumed by that shape |

These are single-session, single-workload-shape numbers (a filter+map+sum fusion at
5000-1,000,000 element scale). They're a reasonable starting default, not a certified
gate. W7's dedicated perf runners should re-derive these against the actual corpus and
against a churn scenario with more than three shapes, given the churn finding above.

## Go/no-go

| Engine | Tier 1 (shared generated fn) | Tier 2 (per-callback specialization) |
|---|---|---|
| V8 (node) | GO — parity confirmed, codegen and chunk-load both work | GO, conditional — premise strong (87% speedup) but 3rd+ shape churn penalty (~7-8x) needs W7 characterization before the W4 LRU capacity is picked |
| JSC (bun) | GO — parity confirmed (108%), codegen and chunk-load both work | GO, conditional — premise strong (80% speedup) but churn penalty appears earlier (2nd shape, ~4x) than on V8; recommend a tighter cache capacity or more conservative promotion on this engine |
| SpiderMonkey (firefox) | GO — parity confirmed (90%), codegen and chunk-load both work | GO — premise strong (84% speedup), no churn penalty observed in any scenario tried |

Tier-2 is not V8-only: all three engines show a strong, reproducible per-instantiation
monomorphism benefit. The one qualifier for the exit gate is the churn behavior found
along the way — it's engine-specific and not fully characterized here, so W4's cache
capacity and promotion hysteresis should be validated per engine with the dedicated
perf runners rather than assumed uniform.
