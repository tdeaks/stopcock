# Phase 2a Implementation Plan: `@stopcock/rescript` + `Array.res`

## Summary
- Add the `@stopcock/rescript` workspace package with ReScript 12, `@rescript/core`, and genType.
- Implement 35+ array functions in `Array.res`, compiled to JIT-optimal JS via ReScript, with genType producing `.gen.tsx` TypeScript declarations.
- TDD against the generated JS: TypeScript tests define the consumer contract, ReScript implements to satisfy them.
- All functions are data-first only in this phase; dual wrapping is deferred to Phase 4.

## Implementation Changes

- Package scaffold:
    - Create `packages/rescript/package.json`: `@stopcock/rescript`, `"type": "module"`, dependencies `rescript` and `@rescript/core`, scripts `build` = `rescript build`, `test` = `vitest run --config vitest.config.ts`.
    - Create `packages/rescript/rescript.json` per spec: `esmodule` output, `in-source` compilation, `.res.js` suffix, genType with `.gen.tsx` extension, `-open RescriptCore`.
    - Create `packages/rescript/vitest.config.ts` including `__tests__/**/*.test.ts`.
    - Create `packages/rescript/tsconfig.json` extending `../../tsconfig.base.json` with `noEmit: true` (TS is only used for tests, not compilation), `include` covering `__tests__` and `src/**/*.gen.tsx`.
    - Tests live in `packages/rescript/__tests__/` as TypeScript files importing from `../src/Array.gen.tsx`.
- Root adjustments:
    - Add `rescript` and `@rescript/core` to root `devDependencies` (or to the rescript package directly — whichever Bun resolves correctly; verify during scaffold).
    - Update `turbo.json`:
        - **Remove `build:wasm` task entirely** — WASM (Phase 3) is dropped from scope. The main spec's Rust/WASM layer, adaptive dispatch, `typed.ts`, `wasm.ts`, and `initialize()` are all out of scope. Stats functions are pure TypeScript (Phase 4a).
        - **Remove `dependsOn: ["build:wasm"]`** from `build:rescript` — without a wasm package this dependency would break the build.
        - Update `build:rescript` outputs from `["lib/**"]` to `["src/**/*.res.js", "src/**/*.gen.tsx"]` since ReScript compiles in-source with the `in-source` config.
    - The rescript package's `package.json` needs a `"build:rescript"` script (not `"build"`) to match the Turbo task name. Alternatively, rename the Turbo task to `"build"` and let the rescript package's `"build": "rescript build"` script match. **Decision:** rename the Turbo task from `build:rescript` to `build` — Turbo's `dependsOn: ["^build"]` on the unified package already chains workspace `build` scripts. Remove the separate `build:rescript` task and let the rescript package define `"build": "rescript build"`. The `build` task's `dependsOn: ["^build"]` handles ordering.
    - The existing `build` task depends on `^build`, so `@stopcock/core` and `@stopcock/rescript` will both build before any downstream package — this is correct.
- Toolchain verification (before any TDD):
    - Write a trivial `packages/rescript/src/Smoke.res` with `@genType let add = (a, b) => a + b`.
    - Run `rescript build`, verify `Smoke.res.js` is clean JS and `Smoke.gen.tsx` has correct types.
    - Write `packages/rescript/__tests__/smoke.test.ts` importing from `../src/Smoke.gen.tsx`, assert `add(1, 2) === 3`.
    - Run `bun run test` from root, confirm Turbo orchestrates both packages.
    - Delete `Smoke.res` and smoke test after verification.
- Array module — implement in 7 groups, TDD order (write TS tests first, then ReScript):
    - Group 1 — Simple Accessors: `head`, `last`, `tail`, `init`, `isEmpty`, `length`.
    - Group 2 — Slicing: `take`, `drop`, `takeWhile`, `dropWhile`, `chunk`, `slidingWindow`.
    - Group 3 — Core HOFs: `map`, `mapWithIndex`, `filter`, `filterWithIndex`, `forEach`, `forEachWithIndex`.
    - Group 4 — Reducers: `reduce`, `reduceRight`, `flatMap`, `flatten`.
    - Group 5 — Search: `find`, `findIndex`, `every`, `some`, `includes`.
    - Group 6 — Transform: `reverse`, `sort`, `sortBy`, `uniq`, `uniqBy`, `intersperse`.
    - Group 7 — Combinators: `zip`, `zipWith`, `groupBy`.
    - After each group: verify genType output (`.gen.tsx`) has correct TypeScript types before moving on.
    - All functions go in a single `packages/rescript/src/Array.res` file.
    - All tests go in a single `packages/rescript/__tests__/array.test.ts` file with describe-style nesting by group.

## ReScript Implementation Rules
- `@genType` on every exported function.
- `Belt.Array.makeUninitializedUnsafe(len)` for pre-allocated output when size is known (`map`, `take`, `drop`, `reverse`, `zip`, `zipWith`, `intersperse`, `chunk` outer array, `flatMap`/`flatten` after computing total length).
- `Belt.Array.getUnsafe` / `Belt.Array.setUnsafe` in loops — no bounds checks.
- Plain `for` loops, not recursive implementations.
- `while` loops with `ref` flags for early-termination (`takeWhile`, `dropWhile`, `find`, `findIndex`, `every`, `some`).
- No mutation of input arrays — always return new arrays.
- `sort`/`sortBy` copy first (`Belt.Array.copy`), then sort in-place.
- `uniq`/`uniqBy`/`filter`/`filterWithIndex` cannot pre-allocate — push to result array.

## GenType Type Mapping Notes
- ReScript `option<'a>` maps to `T | undefined` in genType output. `head`, `last`, `find`, `findIndex` return `T | undefined`, not a tagged Option.
- ReScript tuples `('a, 'b)` map to `[A, B]` in TypeScript. `zip` returns `[A, B][]`.
- `Dict.t<array<'a>>` maps to `{[id: string]: A[]}`. `groupBy` returns this.
- Tests must assert against these genType-mapped types, not ReScript types.

## Public API (Phase 2a)
- All 35 functions exported data-first from `Array.gen.tsx`.
- No barrel `index.ts` in the rescript package yet — consumers import directly from the gen file. The unified package (Phase 4) will re-export with dual signatures.
- Functions are not pipeable in this phase (data-first, no currying). Pipeability comes from the dual wrapper in Phase 4.

## Test Plan
- Toolchain checkpoint: `rescript build` compiles, genType emits `.gen.tsx`, Vitest runs TS tests against generated JS.
- Group 1 tests: empty array edge cases for all 6 functions. `head`/`last` return `undefined` on empty. `tail`/`init` return `[]` on empty. Happy paths with multi-element arrays.
- Group 2 tests: empty arrays, `n > length`, `n = 0`, `n = 1`, `n = length`, `n < 0` (returns `[]`). `chunk` non-divisible length. `slidingWindow` window > length. `takeWhile`/`dropWhile` always-true/always-false predicates.
- Group 3 tests: empty arrays. `map` type transformation. `filter` removes nothing/everything/some. `forEach` calls effect correct number of times (spy). Index params receive correct values.
- Group 4 tests: empty arrays. `reduce` sum + concatenation. `reduceRight` order verification. `flatMap` expanding/collapsing. `flatten` mixed-length + empty inner arrays.
- Group 5 tests: empty arrays (`find` → `undefined`, `every` → `true`, `some` → `false`). Match at start/middle/end. No match. `includes` with primitives.
- Group 6 tests: empty + single-element arrays. `reverse` doesn't mutate. `sort` numeric ordering. `sortBy` custom comparator. `uniq` preserves first-occurrence order. `uniqBy` by key. `intersperse` with 0, 1, many elements.
- Group 7 tests: empty arrays. Different-length arrays (truncation for zip). `zip` produces tuples. `groupBy` preserves order within groups.
- Acceptance criteria:
    - `bun run build` compiles ReScript and emits `.res.js` + `.gen.tsx` for all functions.
    - `bun run test` runs both `@stopcock/core` and `@stopcock/rescript` test suites.
    - All 35+ functions have TypeScript tests asserting behavior against the genType-generated JS.

## Assumptions
- ReScript 12 is the target version; `rescript.json` config (not legacy `bsconfig.json`).
- GenType is included with ReScript 12 (no separate install needed).
- Bun can resolve ReScript and `@rescript/core` as workspace dependencies.
- WASM / Phase 3 is dropped from scope. The main design spec's three-layer architecture (ReScript + WASM + TypeScript) is simplified to two layers (ReScript + TypeScript). Stats functions become pure TypeScript in Phase 4a. `dispatch.ts`, `typed.ts`, `wasm.ts`, and `initialize()` are not implemented.
- `turbo.json` is simplified: `build:wasm` task removed, `build:rescript` renamed to `build` in the rescript package.
- No changes to `@stopcock/core` in this phase.
- `includes` uses ReScript structural equality (`==`), which works for primitives but has implications for object comparison — acceptable for this phase.
