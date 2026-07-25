# Stopcock FP universal pipeline performance plan

> Superseded in full by [the tiered execution plan](./2026-07-21-stopcock-fp-tiered-execution-implementation.md) after adversarial review found twelve defects (cache-swap ownership, call-site identity, oracle circularity, unenforceable gates, and an incomplete amendment ledger among them). Keep for context only; do not implement from this document.

## Outcome

Every pipeline shape, not just a blessed list, executes near hand-written speed: warm pipelines within striking distance of a fused native loop regardless of op sequence, length, callback style, or input size, while keeping the exact-semantics guarantee, the interpreter oracle, CSP degradation, and bounded memory from the absolute-performance plan.

This plan amends the 2026-07-21 absolute-performance plan. It does not replace it; it reverses one architectural decision and extends the runtime tiering. Amendments are listed explicitly and need sign-off before implementation.

## Honest baseline: what the current branch actually did

Measured on the interim profile (Node 24, within-run ratios):

| Shape | vs 0.0.3 default engine | vs fused native loop now |
|---|---|---|
| without | 3.3x to 5x faster; beats lodash everywhere | n/a (eager op) |
| reverse | 1.6x to 2.2x faster; lodash parity | n/a (eager op) |
| head, last | unchanged; 3.5x over lodash | n/a |
| filterMap -> take hoisted | 5% to 16% slower | 66% to 74% |
| filterMap -> take inline | 30% to 50% slower | 44% to 47% |
| map -> filter -> reduce hoisted | unmeasured before; est. much slower | 6.6% to 7% |
| flatMap -> uniq -> count | unmeasured before | 22% to 55% |
| Stream map/filter/take | unchanged (untouched until M3) | ~50% |
| build-compiled (plugin) | new capability | 96% to 108% |
| compilePure sort+take | new capability | 77% to 83% of selection loop |

The diagnosis: the old engine ran runtime code generation for ANY fuseable opcode chain by default (fusion mode auto). M1 deleted that default for two good reasons (callback source parsing was semantically unsound; silent eval is CSP-hostile) and one bad consequence: the replacement covers only a 180-template grammar over four ops plus a slow generic closure chain, and the sound JIT that could serve every shape is unreachable in practice behind await compileJit. Result: eager ops improved a lot, one covered pipeline shape roughly recovered, and the unbounded space of every other pipeline regressed to roughly a tenth of native.

The fix is not more templates. Enumerating shapes loses to combinatorics; any checked-in list is a blessed subset by definition. The fix is to bring back runtime code generation as the default warm path, rebuilt on the new engine's sound foundations: opaque callbacks, Plan IR lowering, interpreter-differential testing, per-shape (not global) state, and CSP probing with graceful fallback.

## Amendments to the absolute-performance plan (require sign-off)

1. AMEND "The root portable executor never contains or evaluates dynamic JavaScript" to: "The root entry chunk never statically contains dynamic-code machinery. Warm pipelines may promote to generated code loaded lazily from the internal JIT chunk; environments that block dynamic code, and users who opt out, permanently run the portable tier."
2. AMEND "compileJit dynamically imports the internal JIT chunk..." tiering rule to: tier promotion applies to plain pipe, flow, and compile runners as well, using the same lazily imported chunk, the same thresholds, and the same generated-loop-structure-only discipline. compileJit remains as the eager, awaitable form.
3. UNCHANGED: exact semantics by default, callback source is never parsed or stringified, no process-global mode, bounded caches, the interpreter is the oracle, explainPipeline reports the executing tier truthfully.

Opt-out contract for amendment 1: dynamic code is disabled when the CSP probe fails, when process.env.STOPCOCK_PORTABLE_ONLY is set at chunk-load time, or when the bundler resolves the "stopcock-portable" export condition. All three pin tier 0/templates forever; none is a runtime mode.

## The tier model

| Tier | What runs | Callback call sites | Expected vs native | When |
|---|---|---|---|---|
| Build | fp-compiler emitted loop | inlined at build time | 90% to 110% | plugin users, static sites |
| 2 | per-identity generated runner, callbacks closed over | monomorphic, V8-inlinable, vectorizable | 85% to 100% | hot call sites with stable callback identities |
| 1 | per-shape generated runner, callbacks as parameters | polymorphic but optimal loop structure | 70% to 85% | any warm shape, including fresh inline arrows |
| 0 | portable: templates + fused switch interpreter | closure/switch dispatch | 40% to 74% | cold calls, CSP, opt-out, pre-promotion |

Design facts the tiers are built on, learned this session:

- Generated runners must be single-frame: the compiled-lane investigation proved an extra IIFE frame loses the TurboFan tiering race at scale (54% of native from frame overhead alone). Tier 1/2 emit one flat function per plan.
- Separate new Function instantiations get their own SharedFunctionInfo and feedback vectors. Tier 2 exploits this: generating per callback-identity-set makes the callback call sites monomorphic so V8 inlines and vectorizes them. Tier 1 shares one generated function per shape, so its callback sites go polymorphic; that is exactly the old engine's ~75%-of-native behavior, now with sound semantics.
- Tier 1 is identity-blind, which finally fixes the inline-arrow case properly: fresh closures per call share the shape runner; only binding extraction remains per call.
- Promotion thresholds stay as shipped: 8 executions or 4,096 processed elements, tracked per plan shape, never globally. They apply to bare pipe only: compile, compilePure, and flow generate eagerly at construction because building a reusable runner is itself the reuse signal (W2). Tier 2 requires additionally that the same callback identity vector was seen on N consecutive promoted calls (start at N=4). Identity churn demotes to tier 1 permanently for that site.
- All tiers lower from the same Plan IR through the same registry metadata, and every tier is differential-tested against the reference interpreter. A tier is a speed, never a semantic.

## Workstreams

### W0: the fuzz gate (build this first; everything else is judged by it)

"Any pipeline you can throw at it" needs a generator of pipelines, not a benchmark list.

- [ ] Pipeline generator: seeded random op chains (length 1 to 8) over the full streamable grammar (map, filter, reject, filterMap, flatMap, take, drop, takeWhile, dropWhile, scan, uniq) plus terminal sinks (toArray, sum, count, reduce, find, every, some) and boundary ops (sort, reverse), over sizes {100, 1K, 8K, 100K, 1M}, with hoisted and inline callback variants.
- [ ] Native reference generator: reuse fp-compiler's codegen to emit the equivalent hand-fused loop for each generated pipeline. The compiler is the definition of "hand-written"; no second implementation.
- [ ] Correctness: every generated pipeline's output and callback counts checked against interpret() before timing. A fuzz case that fails correctness is a release blocker, not a skip.
- [ ] Ratio harness: stopcock (each tier, forced) vs the emitted native loop; JSON output through the existing report pipeline; geomean and worst-case per tier per size class.
- [ ] Check in the seed list; nightly rotates seeds and appends survivors that found bugs to a pinned regression corpus.

Exit gate: harness runs 500 pipelines locally in bounded time; zero correctness failures across tiers on the pinned corpus.

### W1: tier 0 floor: fused switch interpreter

The generic closure chain (one call hop per op per element) is the 6.6%-of-native floor. Replace it.

- [ ] One loop per stream segment, switch on opcode per stage inside the loop, stage state in local slots, no per-element closure calls except user callbacks.
- [ ] Keep the 180 templates in front (they beat the switch for their shapes); the switch replaces only the closure-chain fallback.
- [ ] Differential vs interpreter across the W0 corpus.

Exit gate: fuzz tier-0 geomean at least 40% of native, no shape below 25%, sentinels unregressed.

### W2: tier 1: shared per-shape runtime codegen, on by default

- [ ] Move plan-to-source emission into the existing lazy jit-chunk, lowering from Plan IR (single flat function per plan, bindings array parameter, callbacks invoked as opaque values; the compiled-lane frame and const-binding lessons apply).
- [ ] Fire-and-forget chunk load: first promotion-eligible call triggers import(); calls keep using tier 0 until the chunk resolves, then swap per-shape. pipe stays synchronous throughout.
- [ ] Eager generation for explicit runners: compile, compilePure, and flow trigger the chunk load and generate their shape runner at construction time, no promotion threshold; constructing a reusable runner is the reuse signal. Calls before the chunk resolves run the portable tier and swap on arrival. Bare pipe keeps the adaptive thresholds, since a pipe call carries no reuse signal and one-shot calls must not pay generation cost.
- [ ] CSP probe once at chunk init; failure pins tier 0 silently and explainPipeline says so.
- [ ] Bounded runner cache: 256-entry LRU keyed by shape, shared with the portable shape cache's keying.
- [ ] The three opt-outs (probe, env, export condition).
- [ ] explainPipeline and getOptimizerStats report tier per segment, promotions, and chunk state.

Exit gate: fuzz tier-1 warm geomean at least 70% of native, no shape below 50% (this is the M1 portable gate applied to every shape, met by generation instead of enumeration); inline-arrow warm geomean at least 60%; map -> filter -> reduce specifically from 7% to at least 65%.

### W3: tier 2: per-identity specialization

- [ ] Promote a tier-1 site to tier 2 when the callback identity vector is stable across 4 consecutive calls; generate a fresh function instance closing over those exact callbacks.
- [ ] Bounded: 64-entry LRU across the process; an evicted site falls back to tier 1, re-promotable.
- [ ] Identity mismatch on a tier-2 runner demotes that site to tier 1 permanently (churny sites never thrash).
- [ ] Differential vs interpreter on the pinned corpus with hoisted callbacks.

Exit gate: fuzz tier-2 geomean at least 85% of native, common 2-3 op shapes at least 90%; no tier-1 regression from the added bookkeeping (checked by re-running the W2 gate).

### W4: Stream on the same engine (absorbs old M3)

Stream is still the old generator machinery at ~50% of native and 2x behind competitors. Unify it.

- [ ] Persistent linked plan nodes, O(1) append, flatten once per iteration start.
- [ ] Array-backed sources route through the same tier 0/1/2 executors as pipe; generic iterables get the custom state machine; iterator closure correctness per the original M3 checklist.
- [ ] Stream.compile returns a reusable runner sharing the tier machinery.

Exit gate: original M3 gates (array-backed at least 80% of the equivalent array executor, iterables at least 50%) plus the deferred 5% bundle budget, which the deletion of Stream's old machinery must pay for.

### W5: compiler completion (the 100% tier for everyone who opts in)

- [ ] flow(...) and compile(...) call-site transformation (currently pipe only).
- [ ] Grammar parity with the runtime: every registry op the fuzz generator covers, the compiler either transforms or explicitly diagnoses.
- [ ] Compiled lanes in the benchmark suite driven by the same W0 generator, so build-tier claims come from the same corpus.
- [ ] The SWC twin stays deferred; it multiplies maintenance, not coverage.

Exit gate: original M2 gate (at least 90% geomean vs hand-written, nothing below 80%) measured over the W0 corpus subset the compiler claims to transform.

### W6: certification and release

- [ ] Re-run every gate above as paired ABBA rounds on the interim profile; publish raw JSON only.
- [ ] Sentinel non-regression vs this session's checked-in numbers (without, reverse, head/last, chunk, filterMap -> take, the three new pipeline suites).
- [ ] Ship as the 1.0.0 prerelease line together with fp-compiler per the absolute-performance release sequence. No stable until dedicated runners exist or the interim profile is accepted in writing as the gate machine.

## What this plan deliberately does not do

- No WASM and no workers here; that remains the compute integration (M5/M6), which serves closed numeric kernels, not arbitrary callbacks.
- No new runtime dependencies; the JIT chunk is self-contained emission over Plan IR.
- No attempt to make tier 0 reach tier 1 numbers by generating thousands more templates; enumeration lost to generation, twice (the old AOT table, then the 180-template table).
- No global fusion mode returns. Tier state is per shape and per call site, observable via explainPipeline.

## Sequencing and cut line

W0 then W1 then W2 ship together (that is the regression fix); W3 follows immediately (that is "obscenely fast"); W4 and W5 can proceed in parallel after W2; W6 gates the release. Stopping after W2 leaves every pipeline at or above old-engine speed with better semantics; stopping after W3 is the target state.

## Risks

- Dynamic code by default will bother some consumers regardless of probing and opt-outs. Mitigation: the export condition gives auditable builds a static kill switch; the docs state plainly which tier executes when and how to verify (explainPipeline).
- Tier-2 memory and code churn: bounded LRUs, permanent demotion on churn, and the fuzz harness runs a churn scenario.
- Engine variance: tier thresholds come from the checked-in per-engine tables already specified in the absolute-performance plan; JSC and SpiderMonkey lanes run in W6, not after.
- Complexity: three executing tiers is real surface. The containment is that all tiers lower from one IR, one registry, and answer to one oracle; a tier that cannot pass differential testing does not ship.
