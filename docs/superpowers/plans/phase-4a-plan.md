# Phase 4a Implementation Plan: Unified Public Package

## Summary
- Create `packages/fp` — the package consumers install.
- Add `dual` to `@stopcock/core` (Phase 1 amendment).
- Dual-wrap ~70 ReScript functions for data-first + data-last usage.
- Pure TypeScript guard functions (9) with type predicates.
- Pure TypeScript number stats functions (10).
- Deferred from Phase 2d: `path`, `pathOr`, `evolve` (3 functions in `Obj` namespace), lenses (7 functions, top-level exports).
- Barrel exports with namespaces: `A`, `S`, `D`, `N`, `B`, `O`, `R`, `G`, `Obj`, `Logic`, `M`.

## Implementation Changes

- New files in core:
    - `packages/core/src/dual.ts` — `dual` helper
    - `packages/core/src/dual.test.ts`
    - `packages/core/src/types.test-d.ts` — add dual type assertions
- Modified in core:
    - `packages/core/src/index.ts` — re-export `dual`
- New package:
    - `packages/fp/package.json` — `stopcock`, `"type": "module"`, depends on `@stopcock/core` + `@stopcock/rescript`
    - `packages/fp/tsconfig.json` — extends `../../tsconfig.base.json`, compiles `src/` to `dist/`
    - `packages/fp/vitest.config.ts`
- New source files in unified package:
    - `packages/fp/src/array.ts` + `array.test.ts`
    - `packages/fp/src/string.ts` + `string.test.ts`
    - `packages/fp/src/dict.ts` + `dict.test.ts`
    - `packages/fp/src/number.ts` + `number.test.ts`
    - `packages/fp/src/boolean.ts` + `boolean.test.ts`
    - `packages/fp/src/guard.ts` + `guard.test.ts`
    - `packages/fp/src/types.ts` — shared `PathValue<T, P>` type used by object.ts and lens.ts
    - `packages/fp/src/object.ts` + `object.test.ts` — deferred from 2d
    - `packages/fp/src/lens.ts` + `lens.test.ts` — deferred from 2d
    - `packages/fp/src/math.ts` + `math.test.ts` — dual wrappers for 2c Math.res
    - `packages/fp/src/logic.ts` + `logic.test.ts` — dual wrappers for 2c Logic.res
    - `packages/fp/src/index.ts` — barrel exports
- No changes to `turbo.json` — the existing `build` task with `dependsOn: ["^build"]` already handles the dependency chain.

## Execution Order

### 1. `dual` in core

**Files:** `packages/core/src/dual.ts`, `packages/core/src/dual.test.ts`

```ts
dual(arity: number, fn: Function)
```

- Uses `...args` rest params (no `arguments` object).
- `args.length >= arity` → call data-first immediately.
- `args.length < arity` → return curried function waiting for data argument.
- Typed with overloads for arities 1–4 so both call forms infer correctly.

**Tests:**
- Data-first call (all args) executes immediately.
- Data-last call (partial args) returns a function.
- Returned function executes correctly when given data.
- Works with arities 2, 3, 4.
- Type-level tests for both call forms in `types.test-d.ts`.

Re-export from `packages/core/src/index.ts`.

### 2. Unified package scaffold

- `packages/fp/package.json`: `"type": "module"`, dependencies on `@stopcock/core` and `@stopcock/rescript`.
- `packages/fp/tsconfig.json`: extends base, `src/` → `dist/`.
- `packages/fp/vitest.config.ts`: include `src/**/*.test.ts`.
- Smoke test: import `dual` from core and a ReScript gen function, verify resolution.
- Run `bun install` to link the new workspace package.

### 3. guard.ts (9 functions)

Pure TypeScript type predicates. No dual wrapper (single-argument only).

**Functions:**
- `isString: (x: unknown) => x is string`
- `isNumber: (x: unknown) => x is number` — `typeof x === "number"` (includes `NaN`)
- `isBoolean: (x: unknown) => x is boolean`
- `isNull: (x: unknown) => x is null`
- `isUndefined: (x: unknown) => x is undefined`
- `isNullOrUndefined: (x: unknown) => x is null | undefined`
- `isArray: (x: unknown) => x is unknown[]` — `Array.isArray(x)`
- `isObject: (x: unknown) => x is Record<string, unknown>` — `typeof x === "object" && x !== null && !Array.isArray(x)`
- `isFunction: (x: unknown) => x is Function`

**Tests:** true/false case for each. `isObject` returns false for null, arrays, functions. `isNumber(NaN)` returns true (matches `typeof` semantics). `isNullOrUndefined` true for both null and undefined, false for `0`, `""`, `false`.

### 4. array.ts (~35 dual wrappers)

Import from `@stopcock/rescript/src/Array.gen` and wrap with `dual`.

**Arity reference:**
- **No dual (arity 1):** `isEmpty`, `length`, `head`, `last`, `tail`, `init`, `reverse`, `flatten`, `first` (alias for `head` — the 4b fusion engine references `first` as a fuseable terminal op)
- **Arity 2:** `map`, `mapWithIndex`, `filter`, `filterWithIndex`, `flatMap`, `find`, `findIndex`, `every`, `some`, `includes`, `sortBy`, `uniq`, `uniqBy`, `take`, `drop`, `takeWhile`, `dropWhile`, `chunk`, `slidingWindow`, `intersperse`, `forEach`, `forEachWithIndex`, `groupBy`, `partition`, `aperture`, `intersection`, `union`, `difference`, `symmetricDifference`
- **Arity 3:** `reduce`, `reduceRight`, `zip`, `zipWith`, `adjust`, `update`, `insert`, `scan`, `remove`
- **Standalone generators (no dual):** `range`, `repeat`, `times`, `unfold`, `transpose`, `sort`, `xprod`

**Note:** `sort` takes a single array (arity 1, numeric sort). `xprod` takes two arrays but both are "data" — no meaningful data-last form. `range`/`repeat`/`times`/`unfold` are generators with no data argument.

**Tests:** For each dual-wrapped function, test both call forms. No need to retest underlying logic.

### 5. string.ts (14 dual wrappers)

**Arity reference:**
- **No dual (arity 1):** `isEmpty`, `length`, `trim`, `trimStart`, `trimEnd`, `toLowerCase`, `toUpperCase`
- **Arity 2:** `startsWith`, `endsWith`, `includes`, `split`, `repeat`
- **Arity 3:** `slice`, `replaceAll`

### 6. dict.ts (9 dual wrappers)

**Arity reference:**
- **No dual (arity 1):** `toEntries`, `keys`, `values`, `isEmpty`
- **Arity 1 standalone (no dual):** `fromEntries`
- **Arity 2:** `map`, `filter`, `get`, `merge`

### 7. boolean.ts (4 dual wrappers)

**Arity reference:**
- **No dual (arity 1):** `not_`
- **Arity 2:** `and_`, `or_`
- **Arity 3:** `ifElse`

### 8. math.ts (9 dual wrappers from 2c Math.res)

**Arity reference:**
- **No dual (arity 1):** `inc`, `dec`, `negate`, `product`
- **Arity 2:** `add`, `subtract`, `multiply`, `divide`, `modulo`

### 9. logic.ts (9 dual wrappers from 2c Logic.res)

**Arity reference:**
- **No dual (arity 1, returns predicate):** `both`, `either`, `allPass`, `anyPass`
- **Arity 2:** `equals`, `defaultTo`
- **Arity 3:** `when_`, `unless`, `cond`

### 10. number.ts (stats + ReScript wrappers)

**ReScript wrappers:**
- **No dual (arity 1):** `isEven`, `isOdd`
- **Arity 3:** `clamp`

**Stats functions (pure TypeScript, all operate on `number[]`):**
- **No dual (arity 1):** `sum`, `mean`, `median`, `standardDeviation`, `variance`, `min`, `max`, `minMax`
- **Arity 2 (dual):** `percentile`, `dotProduct`

**Implementation notes:**
- `sum`: `for` loop accumulator, empty → `0`.
- `mean`: `sum(nums) / nums.length`, empty → `NaN`.
- `median`: sort a copy, pick middle (or average two middle for even length).
- `variance`: `mean(nums.map(x => (x - m) ** 2))` where `m = mean(nums)`.
- `standardDeviation`: `Math.sqrt(variance(nums))`.
- `percentile(nums, p)`: sort copy, linear interpolation. Arity 2, dual: `pipe(nums, N.percentile(50))`.
- `min`/`max`: `Math.min(...nums)` / `Math.max(...nums)`. Empty → `Infinity` / `-Infinity`.
- `minMax`: single-pass `for` loop returning `[min, max]`.
- `dotProduct(a, b)`: sum of element-wise products, truncate to shorter. Arity 2, dual: `pipe(a, N.dotProduct(b))`.

**Stats tests:**
- `sum`: empty → 0, basic, negatives.
- `mean`: empty → `NaN`, single = itself, basic.
- `median`: odd/even length, single element, unsorted input.
- `variance`/`standardDeviation`: known values (`[2,4,4,4,5,5,7,9]` → stddev ≈ 2), uniform → 0.
- `percentile`: 0th → min, 100th → max, 50th ≈ median.
- `min`/`max`/`minMax`: basic, negatives, single element.
- `dotProduct`: basic, different lengths (truncate), empty → 0.

### 11. types.ts (shared types)

**File:** `packages/fp/src/types.ts`

Extract `PathValue<T, P>` — a recursive template literal type that resolves dot-separated paths to their nested type. Used by both `object.ts` (`path`/`pathOr`) and `lens.ts` (`lensPath`). Create this before object.ts and lens.ts.

```ts
type PathValue<T, P extends string> =
  P extends `${infer Head}.${infer Tail}`
    ? Head extends keyof T ? PathValue<T[Head], Tail> : never
    : P extends keyof T ? T[P] : never
```

No tests needed — type correctness is verified through `path` and `lensPath` type-level tests.

### 12. object.ts (deferred from Phase 2d)

**Dual wrappers for 2c Object.res** + pure TypeScript `path`, `pathOr`, `evolve`.

**Object.res wrappers (arity reference):**
- **Arity 2:** `pick`, `omit`, `dissoc`, `mergeDeepLeft`, `mergeDeepRight`
- **Arity 3:** `assoc`, `mergeWith`

TypeScript wrappers add narrower generics than genType produces:
```ts
pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>
omit<T, K extends keyof T>(obj: T, keys: K[]): Omit<T, K>
```

**Pure TypeScript additions:**

#### path
```ts
path<T, P extends string>(obj: T, path: P): PathValue<T, P> | undefined
```
Template literal type `PathValue<T, P>` recursively resolves dot-separated paths. Arity 2, dual: `pipe(user, Obj.path("address.city"))`.

**Implementation:** Split path string on `.`, walk object. Return `undefined` if any segment missing.

#### pathOr
```ts
pathOr<T, P extends string, D>(obj: T, path: P, defaultValue: D): PathValue<T, P> | D
```
Arity 3, dual: `pipe(user, Obj.pathOr("address.city", "unknown"))`.

#### evolve
```ts
evolve<T>(obj: T, transformations: Partial<{ [K in keyof T]: (v: T[K]) => T[K] }>): T
```
Arity 2, dual: `pipe(user, Obj.evolve({ age: inc }))`.

**Implementation:** Iterate `Object.keys(transformations)`, apply each function to the corresponding key in obj. Spread for immutability.

**Tests:**
- `path`: shallow access, deep access, missing intermediate → `undefined`, missing leaf → `undefined`. Type-level: `expectTypeOf(path(user, "address.city")).toEqualTypeOf<string | undefined>()`.
- `pathOr`: existing path returns value, missing returns default.
- `evolve`: transforms multiple keys, untransformed pass through, empty transforms → shallow copy, nested evolve.
- Dual forms for all three.

### 13. lens.ts (deferred from Phase 2d)

7 functions, top-level exports (not namespaced).

**Types:**
```ts
type Lens<S, A> = {
  readonly get: (s: S) => A
  readonly set: (a: A, s: S) => S
}
```

**Constructors:**
- `lens<S, A>(get, set) => Lens<S, A>`
- `lensProp<S, K extends keyof S>(key: K) => Lens<S, S[K]>` — getter: `s => s[key]`, setter: `{ ...s, [key]: value }`
- `lensIndex<A>(index: number) => Lens<A[], A>` — getter: `s => s[index]`, setter: copy + replace
- `lensPath<S, P extends string>(path: P) => Lens<S, PathValue<S, P>>` — reuses `PathValue` from object.ts

**Operations (all data-last, naturally pipeable — no dual needed):**
- `view<S, A>(lens: Lens<S, A>) => (s: S) => A`
- `set<S, A>(lens: Lens<S, A>, value: A) => (s: S) => S`
- `over<S, A>(lens: Lens<S, A>, fn: (a: A) => A) => (s: S) => S`

**Tests:**
- Constructor roundtrips: `view(myLens)(obj)` returns focused value, `set(myLens, val)(obj)` returns updated object.
- `lensProp`, `lensIndex`, `lensPath` — get and set work.
- Immutability: `set`/`over` return new objects, originals unchanged.
- Pipe integration: `pipe(user, view(nameLens))`, `pipe(user, over(ageLens, inc))`, `pipe(user, set(cityLens, "London"))`.

**Lens law property tests (fast-check):**
1. **Get-Set:** `set(lens, view(lens)(s))(s) === s`
2. **Set-Get:** `view(lens)(set(lens, a)(s)) === a`
3. **Set-Set:** `set(lens, b)(set(lens, a)(s)) === set(lens, b)(s)`

### 14. index.ts (barrel exports)

```ts
// Core
export { pipe, flow, dual, identity, always, flip, complement, memoize, once, converge, juxt } from "@stopcock/core"
export { type Option, type Some, type None, type Result, type Ok, type Err, type Fn, type LazyValue } from "@stopcock/core"
export { O, R } from "@stopcock/core"

// Namespaced modules
import * as A from "./array.js"
import * as S from "./string.js"
import * as D from "./dict.js"
import * as N from "./number.js"
import * as B from "./boolean.js"
import * as G from "./guard.js"
import * as Obj from "./object.js"
import * as Logic from "./logic.js"
import * as M from "./math.js"
export { A, S, D, N, B, G, Obj, Logic, M }

// Lenses (top-level)
export { type Lens, lens, lensProp, lensIndex, lensPath, view, set, over } from "./lens.js"
```

No logic, no tests.

## Test Plan

### dual tests (core)
- Data-first immediate execution for arities 2, 3, 4.
- Data-last returns curried function for arities 2, 3, 4.
- Type-level tests for both forms.

### Guard tests
- True/false for each of 9 guards.
- `isObject` edge cases (null, array, function → false).
- `isNumber(NaN)` → true.

### Dual wrapper tests (array, string, dict, boolean, math, logic)
- Both call forms for every dual-wrapped function.
- Light — logic already tested in Phase 2.

### Object tests
- Dual wrappers for Object.res functions (both forms).
- `path`/`pathOr`/`evolve` runtime + type-level tests.

### Lens tests
- Constructor roundtrips.
- All three operations.
- Pipe integration.
- Lens laws (property-based, fast-check).

### Stats tests
- All 10 functions with edge cases (empty arrays, single elements, known values).

### Acceptance criteria
- `bun run build` builds all three packages in correct order.
- `bun run test` passes across core, rescript, and stopcock.
- All functions accessible via namespace imports: `A.map`, `S.trim`, `N.sum`, etc.
- Both `fn(data, args)` and `pipe(data, fn(args))` work for every dual-wrapped function.
- Lens laws hold (property-based tests pass).
- `path` type inference resolves nested types at compile time.

## Assumptions
- Phases 1, 2a–2d are complete.
- GenType exported names for `and_`/`or_`/`not_`/`when_` are known from Phase 2b/2c — dual wrappers use whatever names genType actually emits.
- `dual` uses `args.length` dispatch, not `arguments.length` — consistent with the no-`arguments`-object rule.
- `PathValue` type is shared between `object.ts` and `lens.ts` — extracted to `packages/fp/src/types.ts` in step 11.
- Stats functions are pure TypeScript (WASM dropped per spec).
- `lazy` (transducer entry point) is omitted from index.ts — Phase 4b adds it.
- Object.res dual wrappers add narrower TypeScript generics than genType produces — the ReScript runtime does the work, TypeScript adds `Pick`/`Omit` type narrowing via overloaded signatures on top of the `dual` call.
