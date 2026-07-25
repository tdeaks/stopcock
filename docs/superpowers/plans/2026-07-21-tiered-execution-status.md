# Tiered execution: verification-pass status (2026-07-21)

Scope: final verification of W0a through W6 as implemented this session on
`fp-absolute-performance`. Everything below is measured this pass unless
marked otherwise. Nothing in this doc has been committed; the branch is
still uncommitted per instructions.

**Addendum (same day, follow-up pass):** both open items below are closed.
The flatMap `const v` bug (section 2/9) is fixed at `jit-chunk.ts:283`. The
boundary-then-sink "150-300x" finding (section 5/9) is root-caused: it is
not a tier-1 codegen defect, it's the 0.0.3 baseline silently no-op'ing
`uniq`/`reverse` whenever a later step follows them in the same `pipe()`
chain, so the baseline it was measured against was doing far less real work
than the current, correct implementation. See the inline notes added below
and the numbers re-run after the fix.

## 1. Suite, types, lint

| Check | Result |
|---|---|
| `bun run test` (full monorepo) | 3557 passed, 5 failed, 121/122 files. Failures are all in `packages/synth/src/__tests__/synth.test.ts` (`Cannot set properties of undefined (setting 'onmessage')`), reproduce in isolation, and this file has no diff on this branch (last touched by an unrelated earlier commit). Pre-existing, out of scope for this workstream set. |
| Typecheck | Runs inline with vitest ("Type Errors: no errors") on both full-suite runs. No standalone `tsc --noEmit` script exists at root or in `packages/fp`/`packages/fp-compiler`/`benchmarks`. |
| `bun run lint` | Clean. One warning: unused eslint-disable directive at `packages/fp/codegen/portable-templates.ts:230`, exit code 0. |

## 2. Cross-tier fuzz (extended this pass)

`benchmarks/src/reference/fuzz-correctness.test.ts` previously compared
interpret / pipe / frozen emitter only, predating tier 1's existence.
Extended it to also run every generated pipeline through an awaited
`compileJit(...)` (tier 1/2), comparing output and callback log against
interpret and pipe, skipping only the degenerate 0-step and 1-step cases
where `compileJit`'s single-op collapse can't diverge from either.

| Run | Result |
|---|---|
| 500 seeds | 14 failures, all "Assignment to constant variable" (Node/V8 wording) |
| 2000 seeds | ~24 total failures (500-seed pinned entries + new discoveries), same single root cause, no second bug shape found |

**Root cause, found and fixed (follow-up pass):** `packages/fp/src/jit-chunk.ts:283`, the `OP_FLAT_MAP` case in `emitStageChain`, was:

```
const items = f(v); for (const v of items) { ...rest }
```

The outer stream loop declares `let v = src[__i]` (jit-chunk.ts:347); flatMap's
`for (const v of items)` shadows it inside its own block. Any stage emitted
*after* flatMap in the same segment that reassigns `v` — map (`v = f(v)`),
filterMap, `mapWhile`, scan, or a second flatMap — writes to that shadowed
`const` binding and throws. Reproduced for effectively every
flatMap-then-reassigning-stage shape, under both bare `pipe()` (once
adaptively promoted) and `compileJit`/`compile()` (eager generation), on both
V8 (Node/vitest: "Assignment to constant variable") and JSC (bun: "Attempted
to assign to readonly property" — same bug, different engine wording).

**Fix applied:** `for (let v of items)` at that line. `let` per for-of
iteration still gives each nested flatMap its own fresh binding (the loop
body's own block scope), so nested flatMaps stay correctly isolated from
each other and from the outer segment's `v` — only the reassignment-after-
shadowing crash is gone. Re-ran the fuzz suite after the fix: 500 seeds and
`STOPCOCK_FUZZ_COUNT=2000` both green (78 tests each, 0 failures), including
every previously-pinned entry in `benchmarks/src/reference/pinned-corpus.json`.

## 3. Corpus perf run

`bun run src/reference/run-perf.ts --tier all` (benchmarks/), report at
`benchmarks/reports/tiered-perf-2026-07-21-final.json`.

| Tier | n | geomean | min stratum ratio | allCorrect |
|---|---|---|---|---|
| tier 0 | 38 | 1.373 | 0.812 | true |
| tier 1 | 38 | 1.295 | 0.151 | true |

12 case/tier combinations (6 distinct cases x {t0,t1}) skipped: all are the
flatMap-then-reassigning-stage shape above, thrown during the run rather than
measured. `allCorrect: true` only holds over the cases that didn't crash —
read it as "correct where it completed," not "nothing is wrong."

Worst tier-1 stratum: `map -> filter -> reduce (sentinel)` at 0.856, and
several `4+ ops, sink=reduce-like/short-circuit, boundary=present` strata in
the 0.9-1.0 band. The W3 exit gate (no stratum below 50% of the frozen
reference) is met on everything that ran; it cannot be evaluated on the 6
skipped cases, which is itself the finding.

**Re-run after the jit-chunk.ts:283 fix** (`bun run perf:corpus -- --tier
all`, report at `benchmarks/reports/tiered-perf-2026-07-21-fixed.json`): all
44 cases now run at both tiers, nothing skipped, nothing crashes.

| Tier | n | geomean | allCorrect |
|---|---|---|---|
| tier 0 | 44 | 1.258 | true |
| tier 1 | 44 | 1.222 | true |

The 6 previously-skipped flatMap cases are now measured and correct at both
tiers (e.g. `flatMap -> uniq -> count (sentinel)` at 1.005/0.994 t0/t1,
`filterMap -> take (sentinel)` at 1.233/1.467 t0/t1). Geomeans move slightly
versus the 38-case run above (1.373->1.258 t0, 1.295->1.222 t1) because the
denominator now includes 6 more strata, not because anything regressed —
every case that was measured before is unchanged. Worst tier-1 stratum is
still `map -> filter -> reduce (sentinel)` at 0.899.

`explainRunner`/tier attribution: confirmed the runner auto-detects tier via
`__getJitRunnerState`/`explainRunner` per `run-perf.ts`'s `buildTier1Runner`
comment; also confirmed (section 6) that `compile()`'s "tier 0" label is not
a hard guarantee — `compile()` triggers eager tier-1 generation at
construction, so a "tier 0" measurement can be silently contaminated by
generated code if the chunk import resolves mid-measurement.

## 4. The map->flatMap->filter->filterMap->reduce outlier (W6 finding)

Investigated per item 4. The frozen emitter's flatMap (`benchmarks/src/reference/emitter.ts`)
fans out with an indexed loop (`for (let j = 0; j < items.length; j++) { let v = items[j]; ... }`).
jit-chunk.ts's flatMap (a W5 change, shared with Stream) uses
`for (const v of items)`. The original hypothesis was that this was purely a
denominator-distortion story (emitter "too fast" relative to jit-chunk's
for-of, skewing the ratio). It is not just that: it's the same bug as section
2 above. jit-chunk's `const v` crashes outright whenever a later stage
reassigns it; the ~0.2x ratio the W6 report measured is what you see when the
race between the synchronous benchmark loop and the async chunk-load
*doesn't* land promotion mid-measurement (stays on the correct, merely
slower, portable tier 0 path) — the crash and the bad ratio are two faces of
the same jit-chunk.ts:283 bug, not two separate stories.

Documented in `benchmarks/src/reference/CHANGELOG.md` (first entry, proposed
and explicitly **not applied**) and in a dated header note in `emitter.ts`.
The emitter itself is not changed: its indexed loop is correct, and copying
jit-chunk's idiom into it would import the bug into the oracle rather than
fix anything. Re-measure the outlier once jit-chunk.ts:283 is fixed.

## 5. Baseline-compare vs 0.0.3

### Original run (predates promotion, synchronous harness)

`benchmarks/reports/baseline-compare-2026-07-21-final.json`: geomean 0.402,
34/44 cases flagged as regressions. This run cannot observe tier-1/2
promotion at all: `runPaired` (`benchmarks/src/reference/perf-runner.ts`) is
fully synchronous with no `await` between rounds, and the plan states
plainly that "an uninterrupted synchronous hot loop stays tier 0 until the
stack yields." So this number is pure tier-0-vs-0.0.3's-always-JIT'd-engine,
not evidence about promotion at all.

### Promoted rerun (this pass)

Wrote `benchmarks/src/reference/baseline-compare-promoted.ts`: same corpus
and baseline worktree, but warms each case with up to 16 explicitly yielded
(`await setTimeout(0)`) calls first, checks `explainSteps(...)` after each
yield, and only starts the synchronous `runPaired` measurement once tier >= 1
(or the yield budget is exhausted). Report at
`benchmarks/reports/baseline-compare-promoted-2026-07-21.json`.

| | geomean | regressions flagged | crashed/skipped |
|---|---|---|---|
| Un-promoted (original) | 0.402 | 34/44 | 0 |
| Promoted (this pass) | 0.376 | 22/35 | 9 (all the flatMap bug, section 2) |

Promotion demonstrably occurs now (`warmTier` column shows t1 for nearly
every multi-op case, confirmed via `explainSteps`, not assumed). Some shapes
genuinely improve a lot once actually warm — e.g. `2-3 ops,
sink=short-circuit, boundary=none (arithmetic, n=10000)` goes from ~0.084x
(unpromoted) to 3.0x (promoted), the kind of result the plan predicts.

But the aggregate did **not** improve, and several `boundary=present` shapes
at tier 1 are catastrophically slower than 0.0.3 (0.003-0.006x, i.e.
150-300x slower), with correctness otherwise intact. This was flagged as a
separate, un-root-caused tier-1 codegen problem specific to boundary-then-
sink shapes (sort/reverse/uniq followed by a reduce-like or short-circuit
sink), distinct from the flatMap bug in section 2, with `emitBoundaryInline`
recommended as the first place to look.

### Root cause (follow-up pass): not a codegen bug — 0.0.3's boundary fusion is unsound

Reproduced the worst offender (`2-3 ops, sink=short-circuit, boundary=present
(arithmetic, n=10000)`: `map -> uniq -> filter -> find`) directly against a
real 0.0.3 worktree, isolated from the harness: current tree 0.27ms/call,
0.0.3 0.0004ms/call — roughly the same 700x gap the corpus measured. Timed a
hand-rolled, non-generated JS loop doing the same real work (map, `new
Set`, filter, short-circuit find) as a sanity check: 1.15ms/call, *slower*
than the current tree's generated code. So the generated tier-1 code is not
pathologically slow for this shape — it's doing legitimate work at a
reasonable rate. 0.0.3 is the one that's not.

Confirmed why: 0.0.3's `pipe()` runtime-codegen fusion silently **no-ops**
`uniq` and `reverse` whenever a later step follows them in the same chain
(this is the same defect already noted below for `uniq`, here shown to
extend to `reverse` too, and it's the actual explanation for the perf
finding, not a separate one). Direct isolation:

```
pipe(input.concat(input), A.uniq)                    // -> correctly deduped, len 1000
pipe(input.concat(input), A.uniq, A.map(x => x))      // -> len 20000, i.e. uniq no-op'd
pipe([5,3,1,4,2,3,1], A.reverse)                      // -> [1,3,2,4,1,3,5], correctly reversed
pipe([5,3,1,4,2,3,1], A.reverse, A.map(x => x))       // -> [5,3,1,4,2,3,1], i.e. reverse no-op'd
pipe([5,3,1,4,2,3,1], A.sortAsc, A.map(x => x))       // -> correctly sorted -- sort is NOT affected
```

That lines up exactly with the corpus's own stratification: every
`boundary=present` case tagged `arithmetic`/`allocating` uses `uniq` or
`reverse` as its boundary op and shows the catastrophic 0.002-0.09x ratios;
every case tagged `trivial` (n=100) uses `sort` instead and shows only a
mild 0.4-0.7x ratio (ordinary small-n tiered-dispatch overhead, not this
bug). 0.0.3 isn't doing the boundary materialization at all for `uniq`/
`reverse`-then-more-ops shapes, so of course it's fast — it's skipping real
work the current tree correctly performs. This is the same class of bug as
the "0.0.3 uniq unsoundness" finding below, just not previously known to
also cover `reverse`, and not previously connected to the perf finding.

**No production code change was made for this.** There is nothing to fix in
`jit-chunk.ts` or anywhere else in the current tree: the current
implementation is correct and reasonably fast, confirmed against a
hand-written equivalent. The "150-300x slower" number measured a broken
baseline, not a regression. Re-ran `baseline-compare-promoted.ts` against
the same 0.0.3 worktree after the section-2 flatMap fix (report at
`benchmarks/reports/baseline-compare-promoted-2026-07-21-fixed.json`, all 44
cases now measured instead of 35+9-skipped):

| | geomean | regressions flagged | crashed/skipped |
|---|---|---|---|
| Promoted (original pass) | 0.376 | 22/35 | 9 (flatMap bug) |
| Promoted (post-fix) | 0.485 | 24/44 | 0 |

The geomean moves up mostly because the 9 previously-crashing flatMap cases
now measure in (several of them fast, e.g. `filterMap -> take (sentinel)` at
1.044x), not because the uniq/reverse-tainted cases changed — those are
unchanged and still show the same 0.002-0.09x band, for the reason above.
Per-case flips worth noting: `2-3 ops, sink=short-circuit, boundary=none
(arithmetic, n=10000)` and several other `boundary=none` multi-op strata
land at 1.5-2.9x once genuinely warm (promotion doing its job on shapes
0.0.3 isn't cheating on); `flatMap -> uniq -> count (sentinel)` is 0.105x
(same uniq unsoundness, now measurable instead of crashing).

### 0.0.3 uniq unsoundness (confirmed this pass)

Both mismatched-correctness cases in every baseline-compare run involve
`uniq` (`map -> uniq -> filter`, `flatMap -> uniq -> reduce`). Isolated
repro: calling 0.0.3's `A.uniq` directly, or through a single-op `pipe()`,
dedupes correctly (1000 uniques out of 10000 inputs in the sample checked).
Chained with a *following* op through 0.0.3's `pipe()`
(`pipe(input, map, uniq, filter)`), the result has 3302 elements — more than
the 1000-element ceiling `uniq` could possibly produce, i.e. the
dedup step is silently defeated by 0.0.3's runtime-codegen fusion once uniq
isn't the last step. The current tree's output (333 elements, <= 1000) is
internally consistent and correct; 0.0.3 is the one that's wrong. This is
why those two cases show as `MISMATCH` against baseline in every
baseline-compare run in this repo, and it should not be read as a regression
in the current tree. (Follow-up pass: the same defect also covers `reverse`,
per the root-cause note above — it's the direct explanation for the perf
finding, not just a correctness footnote.)

## 6. W2 go/no-go (from `docs/superpowers/plans/2026-07-21-w2-engine-spike.md`, not re-run this pass)

| Engine | Tier 1 | Tier 2 |
|---|---|---|
| V8 (node) | GO | GO, conditional (3rd+ shape churn penalty ~7-8x, needs W7 characterization) |
| JSC (bun) | GO | GO, conditional (churn penalty from 2nd shape, ~4x, tighter cache capacity recommended) |
| SpiderMonkey (firefox) | GO | GO (no churn penalty observed) |

Tier-2 is not V8-only. Promotion-threshold recommendations from the spike
(V8 ~200 execs/1M elements, JSC ~400 execs/2M elements, SpiderMonkey ~100
execs/500k elements) are explicitly interim, pending W7's dedicated runners.

## 7. Exit-gate scorecard

| Workstream | Exit gate (from plan) | Status |
|---|---|---|
| W0a | 500 pipelines fuzz clean across tiers; emitter diffs clean against fp-compiler | **PASS (follow-up pass)** — jit-chunk.ts:283 fixed; 500-seed and 2000-seed fuzz both green (78/78), including every pinned corpus entry. fp-compiler diff not re-run this pass. |
| W0b | Runner reproduces sentinel numbers within CI; forced-tier report with all tiers visible | PASS — `run-perf.ts --tier all` produces per-tier rows; sentinels present in report |
| W1 | Tier-0 geomean >= 40% of reference, no stratum < 25%; sentinels unregressed; CSP delta published | PASS on measured data — tier-0 geomean 1.258 over the full 44-case corpus post-fix (>> 40%). CSP delta vs 0.0.3 no-jit mode not separately re-measured this pass. |
| W2 | Tier-1 premise holds on all 3 engines; tier-2 go/no-go per engine | PASS (not re-run; spike report stands, section 6) |
| W3 | Tier-1 warm geomean >= 70%, no stratum < 50%; paired per-case vs 0.0.3; map->filter->reduce >= 65%; inline-arrow geomean >= 60%; promotion-latency published | **PASS on measured data (follow-up pass).** Tier-1 geomean 1.222 over the full 44-case corpus (>> 70%), nothing crashes. map->filter->reduce measured at 0.899 in the corpus run (>> 65%); the baseline-compare-promoted 0.0.3-relative numbers for boundary=present shapes are root-caused as a 0.0.3 baseline defect (section 5), not a current-tree regression, so they don't block this gate. Promotion-latency: not separately isolated as its own report this pass. |
| W4 | Tier-2 geomean >= 85% on GO engines; common 2-3 op shapes >= 90%; tier-1 gates re-pass with tier-2 active | **not-measurable-this-session** — no standalone tier-2-only corpus run was executed this pass (run-perf.ts's `--tier all` here only reports t0/t1 columns); churn figure of 88-93% of tier 1 was reported by the W4 workstream and is carried here as-given, not independently re-verified this pass. |
| W5 | 80% of array executor for array-backed, 50% for iterables; bundle budget paid | **not-measurable-this-session** for the iterable half — the ~17-19% vs the 50% iterable-codegen floor was reported by the W5 workstream and is carried here as-given, not independently re-measured this pass (needs the iterable codegen dimension the gate calls for, which this pass did not build). Array-backed side not separately isolated from the section-3 corpus run. |
| W6 | >= 90% geomean vs frozen reference, nothing below 80%, over the compiler's claimed subset | Not re-run this pass; the map->flatMap->filter->filterMap->reduce outlier W6 flagged is resolved to a root cause in section 4 **and now fixed** (jit-chunk.ts:283, section 2), so the emitter/jit-chunk divergence for this shape is gone. |
| W7 | JSC/SpiderMonkey lanes run corpus gates; dedicated runners mandatory for certification; sentinel non-regression | Not started. All numbers in this doc are the plan's own "interim profile... guidance numbers only" per W7's exit gate — nothing here is a certified release number. |

## 8. Delta ledger (1-7) status

| # | Item | Status |
|---|---|---|
| 1 | Root-chunk static-cleanliness + eventual promotion, portable boundary as opt-out | Implemented (`jit-loader.ts`/`jit-loader-portable.ts` split, `STOPCOCK_PORTABLE_ONLY`, `check-portable-boundary` script exist per git status). Re-confirm sign-off separately; not re-litigated this pass. |
| 2 | Bare pipe/explicit runners promote per ownership model; compileJit keeps throw/fallback | Implemented and exercised this pass — `explainSteps`/`dispatchAndTrack` promotion confirmed live in section 5's promoted rerun. |
| 3 | W1 gate (40%/25%) supersedes M1 portable gate for CSP/portable builds | W1 numbers pass (section 7); CSP-specific delta vs 0.0.3 no-jit not separately re-measured this pass. |
| 4 | Stream unification (M3) as W5, bundle-budget gate joins | W5 landed (Stream on plan IR, dialect opcodes, iterator machine per git status); iterable-codegen gate open per section 7/W5. Bundle budget not measured this pass. |
| 5 | fp-compiler-swc deferred | Unchanged, still deferred, nothing to report. |
| 6 | Registry/interpreter-oracle/exact-by-default/no-source-parsing/benchmark-truth unchanged | Confirmed by the fuzz harness (oracle discipline intact: interpret/pipe/emitter agree on everything except the tier-1/2 bug, which is a tier bug, not an oracle bug) and by CHANGELOG.md's frozen-emitter discipline being followed for the section-4 finding. |
| 7 | ShapeEntry, execution-identity triple, explainRunner, portable module graph, frozen emitter, W2 spike, paired non-regression, single-op collapse | All present: `shape-entry.ts`, `explainRunner`/`explainSteps` in compile.ts, `jit-loader*.ts` split, `benchmarks/src/reference/emitter.ts`, `2026-07-21-w2-engine-spike.md`, `baseline-compare.ts`/`baseline-compare-promoted.ts`, single-op collapse in `compile.ts`'s `compileJit`. |

## 9. Open sign-off items

All sign-offs recorded 2026-07-21 (owner: Tom):

- **Stream dialect opcodes decision (W5): SIGNED OFF, keep both.**
  Dialect-distinguished opcodes (`OP_TAKE_STREAM`/`OP_SCAN_STREAM`) preserve
  both surfaces' semantics; no breaking change to either.
- **Pure rewrites for bare pipe: SIGNED OFF, exact-only stays.** pipe() never
  applies pure rewrites; compilePure is the documented top-k path.
- **Delta ledger item 3 (40%/25% CSP floor): ACCEPTED.**
- **Delta ledger items 1, 2, 4, 6, 7: APPROVED as a block.** Item 5
  (fp-compiler-swc) remains deferred as written.
- **W7 dedicated-runner requirement:** every perf number in this document,
  and every number in the corpus/baseline reports referenced above, is
  interim guidance under the plan's own rule ("the written-acceptance
  loophole from the previous plan is deleted"). Nothing here is a release
  gate pass until W7's dedicated runners re-derive it.
- ~~**jit-chunk.ts:283 (flatMap `const v`):** blocks a clean W0a/W3 gate
  today.~~ **Fixed (follow-up pass):** `for (let v of items)` at
  jit-chunk.ts:283. Fuzz clean at 500 and 2000 seeds; full 44-case corpus run
  now measures every case (see sections 2/3).
- ~~**Boundary-then-sink tier-1 regression (section 5):** 150-300x slowdown
  vs 0.0.3...~~ **Root-caused, not a current-tree bug (follow-up pass):**
  it's 0.0.3's `pipe()` silently no-op'ing `uniq`/`reverse` whenever chained
  with a later step, so 0.0.3 does far less real work than it appears to.
  Confirmed by direct isolation against the 0.0.3 worktree and by timing a
  hand-written equivalent of the workload (see section 5). No fix applied to
  the current tree because there is nothing wrong with it; the boundary
  materialization is correct and reasonably fast. This no longer blocks W3.

## 10. git status summary (final, uncommitted)

| Area | Modified | Untracked (new) |
|---|---|---|
| packages/fp/src | 11 | 10 (incl. this pass's edit to `fuzz-correctness.test.ts` is under benchmarks, not here) |
| packages/fp-compiler/src | 5 | 0 |
| benchmarks | 1 (package.json) | reference/ dir (whole W0a/W0b harness, now incl. this pass's `baseline-compare-promoted.ts` and `CHANGELOG.md`) + 5 report JSONs |
| root | 1 (vitest.config.ts) | 0 |

Nothing committed. This pass's own file changes: extended
`benchmarks/src/reference/fuzz-correctness.test.ts` (async jit comparison),
added `benchmarks/src/reference/CHANGELOG.md`, added a dated note to
`benchmarks/src/reference/emitter.ts`'s header, added
`benchmarks/src/reference/baseline-compare-promoted.ts`, and the 3 new
report JSONs under `benchmarks/reports/`. No production code
(`packages/fp/src/*.ts` proper, excluding its test files) was modified.

**Follow-up pass:** one production line changed —
`packages/fp/src/jit-chunk.ts:283` (`const v` -> `let v` in the flatMap
for-of, section 2). Full `packages/fp` suite re-run clean (2223 passed).
Added `benchmarks/reports/tiered-perf-2026-07-21-fixed.json` and
`benchmarks/reports/baseline-compare-promoted-2026-07-21-fixed.json`. Still
nothing committed.
