# Phase 4a: Unified Public Package

## Scope

`packages/fp` — the unified public package consumers install. Dual-signature wrappers around ReScript output, pure TypeScript guard functions with type predicates, pure TypeScript number stats functions, and barrel exports with namespaces.

No transducer engine — that's Phase 4b.

## Decisions

- **`dual` helper in core** — Phase 1 amendment. Generic arity-based dispatch: checks argument count to determine data-first vs data-last call form
- **~70 dual-wrapped functions** across array, string, dict, number, boolean
- **Guards are pure TypeScript** — type predicates (`x is string`), single-argument only, no dual wrapper
- **Number stats in this package** — pure TypeScript (WASM dropped). Sum, mean, median, stddev, variance, percentile, min, max, minMax, dotProduct
- **Namespaces:** `A`, `S`, `D`, `N`, `B`, `O`, `R`, `G`
- **Transducer entry point:** `lazy` (not `from` — reserved word concern)
- **TDD** — consistent with all prior phases
- **Describe-style test nesting** — consistent with all prior phases

## Phase 1 Amendment: `dual` in core

Add to `packages/core/src/dual.ts`:

```ts
dual(arity: number, fn: Function)
```

- Takes the data-first arity (number of args when called data-first) and the data-first implementation
- Returns a function that uses rest params (`...args`) and checks `args.length` (no `arguments` object):
  - If `args.length >= arity`: call data-first (all args provided)
  - If `args.length < arity`: return a curried function waiting for the data argument (data-last)
- Properly typed with overloads so both call forms have correct type inference

Example usage:

```ts
// In array.ts
import { map as rsMap } from "@stopcock/rescript/src/Array.gen"
import { dual } from "@stopcock/core"

export const map = dual(2, rsMap)
// data-first:  map([1,2,3], x => x + 1)
// data-last:   pipe([1,2,3], map(x => x + 1))
```

TDD tests for `dual`:
- Data-first call (all args) executes immediately
- Data-last call (partial args) returns a function
- Returned function executes correctly when given data
- Works with arities 1-4
- Type inference correct in both forms

## Package Setup

**Files:** `packages/fp/package.json`, `packages/fp/tsconfig.json`, `packages/fp/vitest.config.ts`

- `stopcock`: `"type": "module"`
- Dependencies: `@stopcock/core`, `@stopcock/rescript`
- tsconfig extends `../../tsconfig.base.json`
- Tests co-located with source

## Execution Order

### 1. Package setup

Package.json, tsconfig, vitest config. Verify imports from core and rescript packages resolve.

### 2. Add `dual` to packages/core

Phase 1 amendment. TDD: write tests in `packages/core/src/dual.test.ts`, implement in `packages/core/src/dual.ts`, re-export from core's `index.ts`.

### 3. guard.ts

**File:** `packages/fp/src/guard.ts`

9 type predicate functions, pure TypeScript. No ReScript dependency, no dual wrapper.

#### Functions

- `isString: (x: unknown) => x is string`
- `isNumber: (x: unknown) => x is number`
- `isBoolean: (x: unknown) => x is boolean`
- `isNull: (x: unknown) => x is null`
- `isUndefined: (x: unknown) => x is undefined`
- `isNullOrUndefined: (x: unknown) => x is null | undefined`
- `isArray: (x: unknown) => x is unknown[]`
- `isObject: (x: unknown) => x is Record<string, unknown>`
- `isFunction: (x: unknown) => x is Function`

#### TDD tests

- Each guard: true case, false case
- `isObject`: returns false for `null`, arrays, functions (common gotchas with `typeof x === "object"`)
- `isNullOrUndefined`: true for both `null` and `undefined`, false for `0`, `""`, `false`
- `isNumber`: false for `NaN`? Decision: `NaN` is technically a number (`typeof NaN === "number"`), so `isNumber(NaN)` returns `true`. This matches `typeof` semantics. Document in test.

### 4. array.ts

**File:** `packages/fp/src/array.ts`

Dual-signature wrappers around all 35+ ReScript Array functions.

#### Pattern

```ts
import { dual } from "@stopcock/core"
import * as RS from "@stopcock/rescript/src/Array.gen"

export const map = dual(2, RS.map)
export const filter = dual(2, RS.filter)
export const reduce = dual(3, RS.reduce)  // 3: array, fn, initial
// ... etc
```

#### Arity reference

- Arity 1 (data only, no dual needed): `isEmpty`, `length`, `head`, `last`, `tail`, `init`, `reverse`, `flatten`
- Arity 2: `map`, `mapWithIndex`, `filter`, `filterWithIndex`, `flatMap`, `find`, `findIndex`, `every`, `some`, `includes`, `sort`, `sortBy`, `uniq`, `uniqBy`, `take`, `drop`, `takeWhile`, `dropWhile`, `chunk`, `slidingWindow`, `intersperse`, `forEach`, `forEachWithIndex`, `groupBy`
- Arity 3: `reduce`, `reduceRight`, `zip`, `zipWith`

Functions with arity 1 are just re-exports (no `dual` needed — there's no data-last form for a single-argument function).

#### TDD tests

For each wrapped function, test both call forms:
- Data-first: `A.map([1,2,3], x => x + 1)` → `[2,3,4]`
- Data-last: `pipe([1,2,3], A.map(x => x + 1))` → `[2,3,4]`
- Verify return types match in both forms

No need to re-test the underlying logic (ReScript tests cover that). Focus on: both call forms work, types are correct, edge cases at the dual boundary.

### 5. string.ts, dict.ts, boolean.ts

**Files:** `packages/fp/src/string.ts`, `packages/fp/src/dict.ts`, `packages/fp/src/boolean.ts`

Same `dual` wrapper pattern as array.ts.

#### string.ts arity reference

- Arity 1 (no dual): `isEmpty`, `length`, `trim`, `trimStart`, `trimEnd`, `toLowerCase`, `toUpperCase`
- Arity 2: `startsWith`, `endsWith`, `includes`, `split`, `repeat`
- Arity 3: `slice`, `replaceAll`

#### dict.ts arity reference

- Arity 1 (no dual): `fromEntries`, `toEntries`, `keys`, `values`, `isEmpty`
- Arity 2: `map`, `filter`, `get`, `merge`

Note: `merge` takes two dicts — arity 2, dual makes sense (data-first: `D.merge(dict1, dict2)`, data-last: `pipe(dict1, D.merge(dict2))`).

#### boolean.ts arity reference

- Arity 1 (no dual): `not_`
- Arity 2: `and_`, `or_`
- Arity 3: `ifElse`

#### TDD tests

Same pattern: both call forms for each dual-wrapped function. Light tests — the logic is tested in Phase 2.

### 6. number.ts

**File:** `packages/fp/src/number.ts`

Two parts: dual wrappers for ReScript Number functions + pure TypeScript stats functions.

#### ReScript wrappers

- Arity 1 (no dual): `isEven`, `isOdd`
- Arity 3: `clamp` (value, min, max)

#### Stats functions (pure TypeScript)

All operate on `number[]`. Single-argument functions (no dual — they take one array).

- `sum: (nums: number[]) => number`
- `mean: (nums: number[]) => number`
- `median: (nums: number[]) => number` — sorts a copy, picks middle
- `standardDeviation: (nums: number[]) => number`
- `variance: (nums: number[]) => number`
- `percentile: (nums: number[], p: number) => number` — arity 2, dual
- `min: (nums: number[]) => number`
- `max: (nums: number[]) => number`
- `minMax: (nums: number[]) => [number, number]`
- `dotProduct: (a: number[], b: number[]) => number` — arity 2, dual

#### TDD tests for stats

- `sum`: empty array → 0, single element, multiple elements, negative numbers
- `mean`: empty array behavior (return `NaN` or 0 — decision: return `NaN` for empty, consistent with mathematical convention), single element = itself
- `median`: odd length (middle element), even length (average of two middle), single element, already sorted vs unsorted
- `standardDeviation`/`variance`: known values (e.g., `[2, 4, 4, 4, 5, 5, 7, 9]` → stddev ≈ 2), uniform array → 0
- `percentile`: 0th → min, 100th → max, 50th ≈ median
- `min`/`max`/`minMax`: basic cases, negative numbers, single element
- `dotProduct`: basic case, different length arrays (truncate to shorter), empty → 0

### 7. index.ts

**File:** `packages/fp/src/index.ts`

Barrel exports:

```ts
export { pipe, flow, dual } from "@stopcock/core"
// Option named exports (some, none, fromNullable, fromPredicate, isSome, isNone, etc.)
export * as O from "@stopcock/core/option"
// Result named exports (ok, err, isOk, isErr, etc.)
export * as R from "@stopcock/core/result"
export { O, R } from "@stopcock/core"

import * as A from "./array"
import * as S from "./string"
import * as D from "./dict"
import * as N from "./number"
import * as B from "./boolean"
import * as G from "./guard"

export { A, S, D, N, B, G }
export { lazy } from "./lazy"  // Phase 4b — placeholder export
```

`lazy` is exported here but implemented in Phase 4b. For now, it can be omitted or stubbed.

No logic, no tests.

## Design Constraints

1. All dual-wrapped functions support both `fn(data, ...args)` and `pipe(data, fn(...args))` forms
2. Single-argument functions are plain re-exports (no dual wrapper)
3. Guards use TypeScript type predicates — single-argument only
4. Stats functions are pure TypeScript — no external dependencies
5. Tests focus on dual boundary correctness, not underlying logic (covered in Phase 2)
6. `mean` of empty array returns `NaN`
7. Minimal comments — only *why*, never *what*
