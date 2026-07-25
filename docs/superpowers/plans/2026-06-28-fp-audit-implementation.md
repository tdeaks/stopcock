# FP Audit Implementation Plan

> **Status: completed and superseded by FP 2.0.** The live package now uses
> focused specialist subpaths, Option-first partial operations, `Record`
> instead of `Dict`, `Iter` instead of `Stream`, unified optics, and Vite+.
> Commands and API names below are retained only as historical implementation
> evidence.

**For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Workers must preserve the existing dirty worktree, avoid reverting unrelated changes, and use `/Users/tomdeakin/Library/Application Support/Headroom/headroom/bin/rtk` for shell commands.

**Goal:** Implement the `@stopcock/fp` audit recommendations in focused, verifiable slices until the package has stronger type safety, benchmark credibility, docs accuracy, export ergonomics, and core FP completeness.

**Architecture:** Start with high-trust surfaces before broad API expansion: type tests, benchmark correctness, and public docs/export contracts. Then add ergonomic runtime APIs in small modules with tests. Generated files may be changed directly only when the existing package pattern already treats them as source; otherwise prefer updating generators and rerunning package codegen.

**Tech Stack:** Bun, Vitest, Vitest typecheck, TypeScript, tsup, ReScript-generated helper files, Markdown/MDX docs.

---

## Task 1: Type-Safety Coverage Baseline

**Files:**
- Modify: `packages/fp/src/__tests__/types.test-d.ts`
- Modify only if a type test exposes a real typing bug: `packages/fp/src/{pipe,flow,option,result,guard,array,object,lens,types}.ts`

- [ ] Add type tests for `pipe` and `flow` inference through multiple stages and negative tests past the public overload limit.
- [ ] Add data-last type tests for array/string/object functions already exported today.
- [ ] Add Option/Result type tests for value inference, error inference, `flatMap`, `mapErr`, and extraction.
- [ ] Add guard narrowing tests for `G.isString`/`G.isNumber` inside `A.filter`.
- [ ] Add object path and lens tests that pin today's behavior, including invalid string paths returning `unknown` and `lens.index` accepting mutable arrays only if that is the current public type.
- [ ] Run: `/Users/tomdeakin/Library/Application Support/Headroom/headroom/bin/rtk bunx vitest run packages/fp/src/__tests__/types.test-d.ts --typecheck`
- [ ] Run: `/Users/tomdeakin/Library/Application Support/Headroom/headroom/bin/rtk bunx tsc -p packages/fp/tsconfig.json --noEmit`

## Task 2: Benchmark Credibility Fixes

**Files:**
- Modify: `benchmarks/vitest.config.dist.ts`
- Modify: `benchmarks/package.json`
- Modify: `benchmarks/src/lens-ops.bench.ts`
- Modify if needed: `benchmarks/generate-report.ts`

- [ ] Fix dist benchmark aliasing so `@stopcock/fp` resolves to `packages/fp/dist/index.js` and subpaths resolve to the matching `packages/fp/dist/*.js` entrypoints.
- [ ] Replace `latest` benchmark competitor versions with concrete versions already resolved in the current lockfile or installed workspace.
- [ ] Fix `lens-ops.bench.ts` so Rambda is only benchmarked for lens APIs it actually exports, or omit Rambda from lens cases with an explicit code comment.
- [ ] Ensure benchmark reports include runtime/package/dependency metadata, or add a small metadata helper if the report generator is the right place.
- [ ] Run: `/Users/tomdeakin/Library/Application Support/Headroom/headroom/bin/rtk bunx vitest bench --run src/array/map.bench.ts --config vitest.config.dist.ts` from `benchmarks`.
- [ ] Run: `/Users/tomdeakin/Library/Application Support/Headroom/headroom/bin/rtk bunx vitest bench --run src/lens-ops.bench.ts --config vitest.config.ts` from `benchmarks`.

## Task 3: Public Docs Accuracy And Fusion Positioning

**Files:**
- Modify: `README.md`
- Modify: `packages/fp/README.md`
- Modify: `apps/docs/src/content/docs/libraries/fp.mdx`
- Modify: `apps/docs/src/content/docs/concepts/fusion.mdx`
- Modify related API MDX pages only when they contain stale operator lists.

- [ ] Remove or correct stale API claims such as `S.padStart`, `N.round`, `N.toFixed`, and any guard/object names not exported today.
- [ ] Document the distinction between streaming fusion, terminal folds, accessor terminals, materialization boundaries, and the `sortBy -> take(k)` top-k specialization.
- [ ] Add import guidance for root namespace imports and package subpaths after Task 4 lands.
- [ ] Run: `/Users/tomdeakin/Library/Application Support/Headroom/headroom/bin/rtk bunx tsc -p apps/docs/tsconfig.json --noEmit` if the docs package has a TypeScript config; otherwise run the narrow docs build command available in `apps/docs/package.json`.

## Task 4: Tree-Shaking Subpath Exports

**Files:**
- Modify: `packages/fp/tsup.config.ts`
- Modify: `packages/fp/package.json`
- Add if needed: `packages/fp/src/{array,object,dict,string,number,math,boolean,logic,function}.ts` entry wrappers only if direct entrypoints are not already suitable.

- [ ] Add tsup entries for public namespace modules that users should be able to import directly.
- [ ] Add package exports for `@stopcock/fp/array`, `/object`, `/dict`, `/string`, `/number`, `/math`, `/boolean`, `/logic`, and `/function`.
- [ ] Ensure type declarations are emitted for every new subpath.
- [ ] Run: `/Users/tomdeakin/Library/Application Support/Headroom/headroom/bin/rtk bun run build` from `packages/fp`.
- [ ] Smoke test at least one source import and one dist import with Bun or TypeScript.

## Task 5: Guard Refinement And Branding Story

**Files:**
- Modify: `packages/fp/src/guard.ts`
- Modify: `packages/fp/src/index.ts`
- Modify: `packages/fp/src/__tests__/guard.test.ts`
- Modify: `packages/fp/src/__tests__/types.test-d.ts`

- [ ] Add `Refinement<A, B extends A>` and `Predicate<A>` public types.
- [ ] Add `and`, `or`, and `not` guard combinators that preserve narrowing where TypeScript can express it.
- [ ] Add lightweight `Brand<T, B extends string>` and refinement helpers only if they stay runtime-free and do not force a validation framework into `guard.ts`.
- [ ] Run: `/Users/tomdeakin/Library/Application Support/Headroom/headroom/bin/rtk bunx vitest run packages/fp/src/__tests__/guard.test.ts packages/fp/src/__tests__/types.test-d.ts --typecheck`

## Task 6: Option/Result Completeness

**Files:**
- Modify: `packages/fp/src/option.ts`
- Modify: `packages/fp/src/result.ts`
- Modify: `packages/fp/src/index.ts`
- Modify: `packages/fp/src/__tests__/option.test.ts`
- Modify: `packages/fp/src/__tests__/result.test.ts`
- Modify: `packages/fp/src/__tests__/types.test-d.ts`

- [ ] Add missing near-term combinators: `orElse`, `orElseWith`, `and`, `andThen`, `flatten`, `zip`, `zipWith`, `contains`, `exists`, `mapNullable`, and `fromThrowable`/`tryCatchAsync` where they fit existing style.
- [ ] Preserve current numeric `_tag` representation and discriminated-union narrowing.
- [ ] Add runtime tests and type tests for value/error inference.
- [ ] Run: `/Users/tomdeakin/Library/Application Support/Headroom/headroom/bin/rtk bunx vitest run packages/fp/src/__tests__/option.test.ts packages/fp/src/__tests__/result.test.ts packages/fp/src/__tests__/types.test-d.ts --typecheck`

## Task 7: Object Path Ergonomics

**Files:**
- Modify: `packages/fp/src/types.ts`
- Modify: `packages/fp/src/object.ts`
- Modify: `packages/fp/src/lens.ts`
- Modify: `packages/fp/src/__tests__/object.test.ts`
- Modify: `packages/fp/src/__tests__/lens.test.ts`
- Modify: `packages/fp/src/__tests__/types.test-d.ts`

- [ ] Add tuple path overloads or builders without breaking loose string paths.
- [ ] Preserve optionality where practical and keep invalid dynamic string paths returning `unknown`.
- [ ] Avoid making runtime paths slower; pre-split reusable path builders are preferred over repeated string splitting for hot paths.
- [ ] Run object/lens runtime tests and type tests.

## Task 8: Fusion API And JIT Portability

**Files:**
- Modify: `packages/fp/src/fuse.ts`
- Modify: `packages/fp/src/pipe.ts`
- Modify: `packages/fp/src/flow.ts`
- Modify: `packages/fp/src/array.ts` or generator definitions for new operators.
- Modify: `packages/fp/src/__tests__/pipe-fusion.test.ts`
- Add docs/API updates after behavior lands.

- [ ] Add public fusion mode controls such as `setFusionMode('auto' | 'jit' | 'no-jit')` and a read-only stats/explain surface.
- [ ] Add high-value fused operators such as `filterMap`, `findMap`, `mapWhile`, `takeUntil`, `partitionMap`, `groupMap`, and `countBy` in small increments with benchmarks.
- [ ] Keep CSP/no-JIT paths tested.
- [ ] Run pipe-fusion tests and targeted pipeline benchmarks.

## Task 9: Benchmark Scope Expansion

**Files:**
- Add benchmark files under `benchmarks/src` for fusion plans, memory/cold import, bundle/tree-shaking, and stream/lazy bridge.
- Modify: `benchmarks/generate-report.ts`

- [ ] Add native JS loop and native JS chain baselines for headline fusion workloads.
- [ ] Add memory allocation and cold import benchmarks where Vitest/Bun can measure them reliably.
- [ ] Add bundle/tree-shaking smoke checks with a small bundler fixture if practical.
- [ ] Add stream/iterator benchmarks before changing stream internals.
