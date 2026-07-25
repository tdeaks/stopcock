# Stopcock FP tiered execution plan

> **Status: superseded.** The FP 2.0 implementation completed on 2026-07-23
> chose a CSP-safe portable runtime and a separate build-time compiler instead
> of automatic runtime code generation. `Stream` was replaced by `Iter`. Keep
> this document as design history only; do not execute its workstreams.

## Outcome

Every pipeline shape executes near hand-written speed once warm, on every supported engine, with exact semantics, truthful diagnostics, a real static opt-out for environments that forbid dynamic code, and gates that are actually enforceable. This is the consolidated successor to the 2026-07-21 universal-pipeline-performance plan (superseded in full) and it amends the runtime portions of the 2026-07-21 absolute-performance plan. Every deviation from the absolute-performance plan is listed in the delta ledger at the end; nothing is amended silently.

## Measured baseline (interim profile, Node 24, within-run ratios)

| Shape | vs 0.0.3 default engine | vs fused native loop now |
|---|---|---|
| without | 3.3x to 5x faster; beats lodash | n/a (eager) |
| reverse | 1.6x to 2.2x faster; lodash parity | n/a (eager) |
| filterMap -> take hoisted | 5% to 16% slower | 66% to 74% |
| filterMap -> take inline | 30% to 50% slower | 44% to 47% |
| map -> filter -> reduce hoisted | est. much slower (old auto-JIT) | 6.6% to 7% |
| flatMap -> uniq -> count | unmeasured before | 22% to 55% |
| Stream map/filter/take | unchanged | ~50% |
| build-compiled (plugin) | new capability | 96% to 108% |
| compilePure sort+take | new capability | 77% to 83% of selection loop |

Diagnosis unchanged: the old engine ran runtime codegen for any fuseable chain by default; the new engine's sound replacement covers a narrow template grammar plus a slow generic path, and the sound JIT is unreachable behind an explicit await. The fix is tiered runtime generation on the new foundations, with the design corrections below.

## Non-negotiables

- Exact semantics are the default. Every tier answers to the reference interpreter; a tier is a speed, never a semantic.
- Callback source is never parsed, stringified, or spliced. Generated code contains loop structure only; callbacks are opaque values.
- The root entry chunk statically contains no dynamic-code machinery. Generation lives in the lazily imported JIT chunk.
- Warm pipelines may promote to generated code by default. Promotion is eventual, per execution identity, never process-global.
- A portable-only build is a static, auditable boundary, not a runtime flag (see Portable boundary).
- explainPipeline describes static eligibility only. Live tier state is reported by explainRunner. Neither may lie.
- Bounded memory: every cache in this plan has a stated capacity and an owner.
- No public performance claim without measured rows, exact denominators, and per-tier attribution.

## Execution identity and ownership model

This section exists because the previous plan hand-waved four things the review caught: cache swap ownership, call-site identity, pure/exact identity, and processed-element accounting.

### ShapeEntry: the one canonical mutable cell

- Execution identity is the triple (plan shape key, semantic mode exact|pure, applied-rewrite signature). Exact and pure runners never share an entry. compileJit(assumePure) promotes through the pure identity, never the exact one.
- Every cache layer (shape LRU, pipe numeric front cache, pipe identity cache, tier-2 cache) holds a reference to one canonical mutable ShapeEntry per execution identity. Nothing closes over a concrete runner function. Dispatch reads entry.run at call time, so a tier swap is one field write that every holder observes immediately, including existing identity-cache entries. The current pipe implementation violates this (boundRunner closes over the runner at creation, so identity-cache hits would never see a promoted tier); fixing that is a prerequisite task, not a footnote.
- ShapeEntry owns: current tier, portable runner, generated runner or null, chunk/loader state, promotion counters, disable reasons (csp, opt-out, churn), and eviction hooks. Eviction from any LRU downgrades the entry in place (entry.run reverts to portable); holders need no notification.

### Tier state and promotion

- Tier 0: portable (templates plus the W1 switch interpreter). Always present. The only tier under CSP or opt-out.
- Tier 1: per-shape generated runner, callbacks passed as parameters. Single flat frame (the IIFE tiering-race lesson). Identity-blind, so inline arrows benefit.
- Tier 2: generated runner closing over a specific callback identity vector, giving monomorphic, inlinable callback sites. Keyed by (execution identity, callback vector) in a bounded 64-entry LRU. There is no per-call-site state and no permanent demotion: JavaScript has no call-site token for bare pipe, so "site" was a fiction. A vector that keeps recurring keeps its runner; churn just misses the cache and runs tier 1. Runners returned by compile, compilePure, and flow ARE stable identities (the runner object itself) and get tier-2 treatment directly when their callback vector is fixed at construction.
- Processed-element accounting counts elements actually read from the source by the executing loop, not input length. take(1) over one million elements credits what it consumed. Promotion thresholds: 8 executions or 4,096 consumed elements, per execution identity.
- Promotion is eventual, and the plan says so plainly: the chunk import settles on a microtask, so an uninterrupted synchronous hot loop stays tier 0 until the stack yields. Once the chunk is resident, generation for newly hot identities is synchronous. await compileJit remains the deterministic prewarm for callers who need tier N on call one. Explicit compile/compilePure/flow trigger the chunk load and generate eagerly at construction (building a reusable runner is the reuse signal); bare pipe adapts.
- compileJit keeps its explicit contract: onUnavailable throw or fallback. Automatic promotion always fails silent to portable.

### Diagnostics

- explainPipeline(...steps): static analysis of a hypothetical plan: domains, segments, boundaries, semantics, rewrites, tier eligibility, and which static conditions (csp unknown at analysis time, opt-out) would cap it.
- explainRunner(runner): live truth for a real runner: current tier, promotion counters, chunk state, generation timestamps, disable reasons. Works on compile/flow runners and on the runner pipe used most recently for a given steps list via a lookup helper.
- getOptimizerStats gains per-tier counters: generations, promotions, demotions, cache evictions, chunk load state.

## Portable boundary

- A separate portable module graph: the portable entry must not import the loader module at all, so no bundler, scanner, or CSP auditor can find a path from it to new Function. This is a build-level split (two compiled graphs), not an if-statement.
- Resolution order: the stopcock-portable export condition selects the portable graph at bundle time; STOPCOCK_PORTABLE_ONLY is read once before the first import() would fire and pins portable at runtime; the CSP probe (inside the chunk, on first load) pins portable on failure. All three surface in explainRunner as the disable reason.
- CI asserts: the portable graph's emitted assets contain no Function constructor reference and no import edge to the JIT chunk; the default graph's root entry references the chunk only via dynamic import.

## Oracle independence

The review was right that a self-referential oracle can rot silently. Three independent legs:

1. The reference interpreter remains the semantic oracle for all tiers, with the known caveat that it shares the registry and Plan IR. Its independence comes from leg 2.
2. Manual semantic fixtures, hand-written, no registry imports: callback order and argument shapes, exceptions mid-pipeline, input mutation during iteration, dense-hole behavior, reentrancy, NaN and negative-zero handling, scan/take edge conventions. The existing pre-registry test suite seeds this; W0a extends it deliberately.
3. A frozen reference emitter owned by benchmarks/, not by fp-compiler: a small registry-derived generator that emits the hand-fused loop for a pipeline description. It is reviewed once, changed only with a changelog entry, and NEVER shared with production code. fp-compiler is measured against it (non-circular); runtime tiers are measured against it; fp-compiler output is additionally diffed against it as a semantics cross-check.

## Workstreams

### W0a: reference emitter and fuzz correctness

- [ ] Frozen emitter in benchmarks/ covering, initially, the intersection grammar the runtime and registry agree on: map, filter, reject, filterMap, flatMap, take, drop, takeWhile, dropWhile, scan (tagged; verified) as stream ops; sum, count, reduce, forEach, find, every, some, toArray as sinks; sort, reverse, uniq as boundary ops emitted as explicit materialization steps (uniq is a boundary in the lowerer, not a stream op; the emitter must mirror the registry's classification, checked by a test).
- [ ] Seeded pipeline generator over that grammar with work budgets: expansion factor times input size capped (no unbounded flatMap chains), output size capped, callback cost classes (trivial, arithmetic, allocating).
- [ ] Correctness fuzzing: every generated pipeline runs through interpret, tier 0, and (when resident) tier 1/2, comparing outputs AND callback logs. Failures shrink automatically (drop ops, shrink input) to a minimal repro appended to the pinned corpus.
- [ ] The manual fixture set from Oracle leg 2, written by hand against the docs, not against the implementation.

Exit gate: 500 pipelines fuzz clean across tiers on the pinned corpus in bounded local time; the emitter's output diffs clean against fp-compiler for the compiler's supported subset.

### W0b: raw paired-sample perf runner

- [ ] A benchmark runner that records raw per-round samples (no aggregation-then-discard), pairs stopcock and reference rows ABBA within one process, and reports per-tier rows separately. It must not reuse generate-report's fastest-stopcock-row selection (generate-report.ts picks the fastest stopcock row for win rates, which would hide slower tiers); either extend generate-report with a per-tier mode or emit its own report.
- [ ] A fixed, stratified performance corpus derived from W0a's grammar: strata by op count, sink kind, boundary presence, size, callback class. The corpus is checked in and versioned; nightly seed rotation only ADDS discovered regressions to it.
- [ ] Paired per-case non-regression harness against 0.0.3: check out the tag, run the same corpus subset that 0.0.3's API supports, compare per case. Single-op pipelines are explicitly in the corpus.

Exit gate: the runner reproduces the known sentinel numbers within confidence bounds and demonstrates a forced-tier report with all tiers visible.

### W1: tier-0 floor: fused switch interpreter

- [ ] Replace the generic closure-chain segment execution with one loop per segment, switch on opcode per stage, stage state in locals, flag-based early exit (no thrown HALT sentinel on the hot path).
- [ ] Single-op collapse: pipe(data, A.map(f)) and every other one-step pipeline dispatches directly to the eager data-first kernel with zero plan machinery. The corpus covers these.
- [ ] Templates stay in front where they win.

Exit gate: corpus tier-0 geomean at least 40% of the frozen reference, no stratum below 25%; sentinels unregressed; CSP-tier delta vs 0.0.3's no-jit mode measured and published (the 60/50 portable gate from the absolute plan is superseded for tier 0; see delta ledger item 3).

### W2: cross-engine feasibility spike (before any tier commitment)

- [ ] Verify on JSC (bun or Playwright WebKit) and SpiderMonkey (Firefox): per-instantiation function feedback (the tier-2 monomorphism premise), generated-loop parity with hand-written, promotion threshold sanity, chunk-load behavior.
- [ ] Output: a short checked-in report and initial per-engine threshold table (the absolute plan's tables exist as two constants today; this creates the real artifact).

Exit gate: tier-1 premise holds on all three engines; tier-2 premise evaluated per engine with a go/no-go per engine recorded. If tier 2 is V8-only, it ships V8-gated and explainRunner says so.

### W3: tier 1 on the ShapeEntry model

- [ ] Introduce ShapeEntry and rewire every existing cache to hold it by reference; delete the closed-over-runner pattern in pipe. This lands first and alone, verified by a test that promotes an entry and observes the swap through a pre-existing identity-cache hit.
- [ ] Plan-to-source emission in the JIT chunk from Plan IR (flat single-frame functions, bindings parameter, per-iteration const bindings).
- [ ] Eager generation for compile/compilePure/flow at construction; adaptive promotion for bare pipe with consumed-element accounting.
- [ ] Portable boundary work (export condition, env check, CI asset scans).
- [ ] explainRunner and the stats counters.

Exit gates: corpus tier-1 warm geomean at least 70% of the frozen reference, no stratum below 50%; paired per-case non-regression vs 0.0.3 on the shared corpus (this is the gate that proves "at or above old-engine speed", per case, not by geomean arithmetic); map -> filter -> reduce from 7% to at least 65%; inline-arrow warm geomean at least 60%; promotion-latency measurement published (calls to promote, wall time to promote, cold one-shot overhead vs 0.0.3).

### W4: tier 2 as identity-vector cache

- [ ] (execution identity, callback vector) LRU per the ownership model; no site state, no permanent demotion.
- [ ] Direct tier 2 for explicit runners with fixed vectors.
- [ ] Churn scenario in the corpus (alternating vectors over one shape) proving no thrash and no regression vs tier 1.

Exit gate: corpus tier-2 geomean at least 85% on engines that passed the W2 go; common 2-3 op shapes at least 90%; tier-1 gates re-pass with tier-2 bookkeeping active.

### W5: Stream dialect and unification

- [ ] FIRST, the semantic decision the previous plan skipped: Array scan includes the initial accumulator, Stream scan does not; Array plan take permits one extra upstream callback, Stream stops immediately. Either introduce dialect-distinguished opcodes in the registry with both behaviors preserved, or sign off breaking one surface to match the other. This is a sign-off item, not an implementation detail.
- [ ] Then the absorbed M3 checklist: persistent linked plan nodes, array-backed sources through the tiered executors, iterator state machine for generic iterables, iterator closure correctness, Stream.compile.

Exit gate: original M3 gates (80% of the array executor for array-backed, 50% for iterables) plus the deferred 5% bundle budget paid by deleting Stream's old machinery.

### W6: compiler completion

- [ ] Grammar parity: every W0a op either transforms or diagnoses, including flatMap, scan, and boundaries.
- [ ] flow and compile call sites.
- [ ] Compiler measured against the frozen emitter (non-circular) on the corpus subset it claims.

Exit gate: at least 90% geomean vs the frozen reference, nothing below 80%, over the claimed subset.

### W7: certification and release

- [ ] JSC and SpiderMonkey lanes run the corpus gates, not just smoke.
- [ ] Dedicated perf runners are mandatory for stable certification. The interim profile produces guidance numbers only; the written-acceptance loophole from the previous plan is deleted.
- [ ] Sentinel non-regression vs this session's checked-in numbers, all tiers attributed in the report.
- [ ] Ship with the absolute plan's release sequence: 1.0.0 prereleases carry W0 through W3; tier 2 and Stream land in the minor line.

## Delta ledger vs the absolute-performance plan (complete; each item needs sign-off)

1. AMENDED: "The root portable executor never contains or evaluates dynamic JavaScript" becomes the root-chunk static-cleanliness rule plus default eventual promotion, with the portable boundary as the opt-out. (Approved in principle earlier; re-confirm against this plan's mechanics.)
2. AMENDED: tiering is no longer exclusive to compileJit runners; bare pipe and explicit runners promote per the ownership model. compileJit remains the deterministic prewarm with its throw/fallback contract.
3. SUPERSEDED GATE: the M1 portable gate (60% geomean, 50% floor) is delivered by tier 1 for default builds. For CSP and portable-only builds the floor becomes the W1 gate (40% geomean, 25% stratum floor), a deliberate weakening for that population, stated here rather than hidden.
4. MOVED: Stream unification (M3) moves into this plan as W5 and joins the release gates; its bundle-budget gate comes with it.
5. DEFERRED: @stopcock/fp-compiler-swc remains deferred out of the committed scope (it was an M2 deliverable in the absolute plan).
6. UNCHANGED: registry as sole source of truth, interpreter oracle discipline, exact-by-default, no callback source parsing, no process-global modes, benchmark truth rules, compute integration for M5/M6.
7. ADDED: ShapeEntry ownership model, execution-identity triple, explainRunner, portable module graph, frozen reference emitter, cross-engine spike as a gating workstream, paired non-regression vs 0.0.3, single-op collapse.

## Sequencing and cut line

W0a and W0b first and in parallel (they are the measurement and truth infrastructure everything else answers to). W1 next (safe under any sign-off outcome). W2 spike before W3/W4 commitments. W3 is the regression fix; W4 is the ceiling; W5/W6 parallel after W3; W7 gates release. Stopping after W3 leaves every pipeline at or above 0.0.3 speed with better semantics, proven per case, which is the minimum shippable outcome of this plan.

## Risks

- Dynamic code by default: unchanged from before; the portable graph and export condition are the auditable answer, now specified as a build boundary rather than a flag.
- Tier-2 engine specificity: contained by the W2 spike and per-engine go/no-go rather than assumed.
- Oracle rot: contained by the three-leg structure; the frozen emitter changes only with a changelog entry.
- Complexity: three tiers, one ownership model, one oracle discipline. Any tier that cannot pass differential testing does not ship; any cache without a stated owner and capacity does not merge.
