# FP Performance Loss Remediation Implementation Plan

> Superseded on 2026-07-21 by [Stopcock FP absolute-performance implementation plan](./2026-07-21-stopcock-fp-absolute-performance-implementation.md). Keep this document only as historical benchmark context; do not implement its API, benchmark, or acceptance decisions.

**For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every measured `@stopcock/fp` performance loss under control, using "within 2x of hand-written native/manual baselines" as the acceptable native-ceiling target.

**Architecture:** Treat native loops/manual JavaScript as ceilings, not peers Stopcock must beat. First establish an authoritative JSON benchmark loss ledger, then fix the severe gaps in fusion, stream execution, and object/guard hot paths while preserving public APIs and type behavior.

**Tech Stack:** TypeScript, Bun, Vitest bench, `@stopcock/fp`, RTK shell prefix.

---

## Current Measured Losses

Use these as the initial remediation targets. Refresh them before implementation because benchmark noise and dirty worktree changes may move exact numbers.

| Area | Current loss | Priority |
|---|---:|---|
| `Stream.from -> map -> filter -> take -> toArray` | `32.04x` to `32.97x` slower than native loop | P0 |
| fused `map -> takeUntil` | `14.62x` to `17.76x` slower than native loop | P0 |
| `Obj.assoc` | `3.18x` slower than native immutable spread baseline | P1 |
| `Obj.path` | `1.32x` slower than Rambda | P1 |
| fused `filterMap -> take(25)` | about `1.70x` to `1.73x` slower than native loop | P2 |
| large array `map` | about `1.00x` to `1.02x` slower than `ts-belt` at `n=100000` | P2 |
| `Obj.omit` | about `1.02x` slower than Ramda | Watch |
| `isShallowEqual` | `1.03x` to `1.09x` slower than manual loop | Watch |

## Task 1: Build the Benchmark Loss Ledger

**Files:**
- Modify: `benchmarks/generate-report.ts`
- Create: `benchmarks/src/package/performance-loss-ledger.test.ts` or equivalent script/test file
- Read: `benchmarks/vitest.config.ts`, `benchmarks/vitest.config.dist.ts`

- [ ] Add a JSON-first benchmark summary path that classifies each row as `stopcock`, `library`, `native-chain`, `native-loop`, or `manual-js`.
- [ ] Count and report two win rates:
  - library-only win rate
  - all-baselines win rate
- [ ] Mark any result as actionable when Stopcock is:
  - more than `2x` behind native-loop/manual-js, or
  - behind a library peer by more than `5%`.
- [ ] Preserve existing Markdown report generation.
- [ ] Run:

```bash
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest run --config benchmarks/vitest.config.ts benchmarks/src/package/performance-loss-ledger.test.ts
```

Expected: pass, and the test confirms classification/win-rate logic using fixture data.

## Task 2: Fix Severe Fusion Losses

**Files:**
- Modify: `packages/fp/src/pipe.ts`
- Modify: `packages/fp/src/fuse.ts`
- Modify: `packages/fp/src/__tests__/pipe-fusion.test.ts`
- Benchmark: `benchmarks/src/pipeline/fused-operators.bench.ts`

- [ ] Add regression tests for `map -> takeUntil`, `filterMap -> take`, `findMap`, and `mapWhile` in both `auto` and `no-jit` fusion modes.
- [ ] Add small tagged-array pipeline fast paths in `pipe` so common calls like `pipe(data, A.map(fn), A.takeUntil(pred))` avoid avoidable temporary array allocation and repeated setup work.
- [ ] Add direct specialized runners for:
  - `map -> takeUntil`
  - `filterMap -> take`
  - `findMap`
  - `mapWhile`
- [ ] Keep generated JIT/interpreted behavior identical. Do not change `setFusionMode`, `getFusionStats`, `resetFusionStats`, or `explainFusion` public behavior.
- [ ] Run:

```bash
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest run packages/fp/src/__tests__/pipe-fusion.test.ts packages/fp/src/__tests__/array.test.ts --typecheck
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest bench --run src/pipeline/fused-operators.bench.ts --config vitest.config.ts --outputJson /tmp/stopcock-fused-after.json
```

Acceptance:
- fused `map -> takeUntil` is within `2x` of the native loop at all benchmark sizes.
- `findMap` and `mapWhile` stay within `1.25x` of native loop.
- `filterMap -> take(25)` stays within `2x` of native loop.

## Task 3: Rewrite Stream Execution Internals

**Files:**
- Modify: `packages/fp/src/stream.ts`
- Modify: `packages/fp/src/__tests__/stream.test.ts`
- Benchmark: `benchmarks/src/stream-ops.bench.ts`

- [ ] Preserve the public `Stream<A>` iterable API.
- [ ] Replace generator-per-transform composition with a compact pipeline representation.
- [ ] Use an indexed loop when the source is array-backed.
- [ ] Use a single iterator state machine for generic iterables.
- [ ] Specialize terminal operations into one-pass execution:
  - `toArray`
  - `reduce`
  - `first`
  - `count`
  - `every`
  - `some`
  - `find`
  - `forEach`
- [ ] Treat `zip`, `concat`, `chunk`, and `distinct` as optimization boundaries unless they can be optimized without semantic risk.
- [ ] Add tests proving laziness, replayability, early termination, side-effect order, and infinite stream safety.
- [ ] Run:

```bash
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest run packages/fp/src/__tests__/stream.test.ts --typecheck
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest bench --run src/stream-ops.bench.ts --config vitest.config.ts --outputJson /tmp/stopcock-stream-after.json
```

Acceptance:
- `Stream.from -> map -> filter -> take(100) -> toArray` is within `2x` of native loop for array-backed sources.
- Stopcock Stream remains faster than native array chain at `n=10000` and `n=100000`.
- Stream remains replayable unless the input iterable itself is one-shot.

## Task 4: Fix Object And Guard Hot Paths

**Files:**
- Modify: `packages/fp/codegen/defs/object.ts`
- Modify: `packages/fp/src/object.ts`
- Modify: `packages/fp/src/guard.ts`
- Modify: `packages/fp/src/__tests__/object.test.ts`
- Modify: `packages/fp/src/__tests__/guard.test.ts`
- Benchmark: `benchmarks/src/object-ops.bench.ts`, `benchmarks/src/guard-ops.bench.ts`

- [ ] Add cached string path segment handling for repeated `Obj.path(obj, 'a.b.c')` calls.
- [ ] Add a no-dot fast path for shallow `Obj.path(obj, 'key')`.
- [ ] Keep tuple path behavior unchanged and do not weaken path types.
- [ ] Replace `Obj.assoc` runtime with an immutable TypeScript implementation equivalent to:

```ts
const out = { ...obj }
out[key] = value
return out
```

- [ ] Correct `isShallowEqual` for different keys with `undefined` values by adding `hasOwnProperty` checks.
- [ ] Update the shallow-equality benchmark manual baseline to include the same key-existence semantics.
- [ ] Leave `Obj.omit` as a watch item unless refreshed results show a gap over `2x`.
- [ ] Run:

```bash
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest run packages/fp/src/__tests__/object.test.ts packages/fp/src/__tests__/guard.test.ts --typecheck
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest bench --run src/object-ops.bench.ts --config vitest.config.ts --outputJson /tmp/stopcock-object-after.json
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest bench --run src/guard-ops.bench.ts --config vitest.config.ts --outputJson /tmp/stopcock-guard-after.json
```

Acceptance:
- `Obj.assoc` is within `2x` of the native immutable spread baseline.
- `Obj.path` beats or is within `1.1x` of Rambda/Ramda on the current benchmark.
- `isShallowEqual({ a: undefined }, { b: undefined })` returns `false`.
- Deep equality wins are not regressed by more than `5%`.

## Task 5: Benchmark Credibility And Public Claims

**Files:**
- Modify: `benchmarks/src/object-ops.bench.ts`
- Modify: `benchmarks/src/option-result.bench.ts`
- Modify: `benchmarks/generate-report.ts`
- Modify docs only after refreshed benchmark evidence exists.

- [ ] Rename misleading rows. In particular, do not label native spread as `lodash`.
- [ ] Add hoisted-vs-inline pipeline benchmarks for fused operators to separate algorithm speed from per-call operator construction cost.
- [ ] Add Option/Result competitor rows before making public Option/Result performance claims.
- [ ] Add report metadata that prints:
  - runtime
  - competitor versions
  - source-vs-dist config
  - win-rate denominator
  - whether native/manual baselines are included
- [ ] Run:

```bash
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest bench --run src/option-result.bench.ts --config vitest.config.ts --outputJson /tmp/stopcock-option-result-after.json
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bun run build
```

Acceptance:
- Reports no longer imply native/manual baselines are peer FP-library competitors.
- Public win-rate claims always state their denominator.
- Option/Result claims are withheld unless peer rows exist.

## Task 6: Final Verification

**Files:**
- No new files unless a refreshed benchmark report is intentionally committed.

- [ ] Run focused tests:

```bash
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest run packages/fp/src/__tests__/pipe-fusion.test.ts packages/fp/src/__tests__/stream.test.ts packages/fp/src/__tests__/object.test.ts packages/fp/src/__tests__/guard.test.ts packages/fp/src/__tests__/array.test.ts --typecheck
```

- [ ] Run typecheck and build:

```bash
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx tsc -p packages/fp/tsconfig.json --noEmit
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bun run build
```

- [ ] Run targeted benchmark suite:

```bash
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest bench --run src/pipeline/fused-operators.bench.ts --config vitest.config.ts --outputJson /tmp/stopcock-fused-final.json
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest bench --run src/stream-ops.bench.ts --config vitest.config.ts --outputJson /tmp/stopcock-stream-final.json
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest bench --run src/object-ops.bench.ts --config vitest.config.ts --outputJson /tmp/stopcock-object-final.json
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest bench --run src/guard-ops.bench.ts --config vitest.config.ts --outputJson /tmp/stopcock-guard-final.json
/Users/tomdeakin/Library/Application\ Support/Headroom/headroom/bin/rtk bunx vitest bench --run src/array/map.bench.ts --config vitest.config.dist.ts --outputJson /tmp/stopcock-array-map-final.json
```

- [ ] Summarize before/after:
  - total wins including native/manual baselines
  - library-only wins
  - every remaining loss over `2x`
  - any semantic benchmark corrections that changed comparability

## Assumptions

- No breaking public API changes.
- Preserve current type behavior, subpath exports, and tree-shaking behavior.
- Use RTK for all shell commands.
- Native/manual loops are ceilings, not benchmarks Stopcock must beat.
- A remaining loss under `2x` to native/manual code is acceptable unless it is also a library-to-library loss.
