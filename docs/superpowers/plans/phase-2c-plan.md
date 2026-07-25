# Phase 2c Implementation Plan: Extended ReScript Functions

## Summary
- Extend `@stopcock/rescript` with 42 new functions across 4 areas: Array.res additions (17), Object.res (7), Logic.res (9), Math.res (9).
- Same TDD-against-generated-JS pipeline as 2a/2b.
- Set operations use true set semantics (deduped). Math binary ops use data-last-friendly ordering (`subtract(3)(10)` = 7).
- `path`, `pathOr`, `evolve`, function utilities, and lenses are excluded — those go to Phase 2d as pure TypeScript.

## Implementation Changes

- No package or toolchain changes — `@stopcock/rescript` is fully scaffolded from 2a.
- Modified source files:
    - `packages/rescript/src/Array.res` — 17 new functions appended to existing module.
- New source files:
    - `packages/rescript/src/Object.res`
    - `packages/rescript/src/Logic.res`
    - `packages/rescript/src/Math.res`
- New test files:
    - `packages/rescript/__tests__/array-extended.test.ts` — separate file for the 17 additions to keep the 2a array tests untouched.
    - `packages/rescript/__tests__/object.test.ts`
    - `packages/rescript/__tests__/logic.test.ts`
    - `packages/rescript/__tests__/math.test.ts`
- No changes to `turbo.json`, root `package.json`, or `@stopcock/core`.

## Execution Order

### 1. Array.res additions (17 functions)

All appended to the existing `Array.res`. Same Belt hot-path rules as 2a.

#### Manipulation (6 functions)
- `partition: (array<'a>, 'a => bool) => (array<'a>, array<'a>)` — single pass, push to two result arrays.
- `adjust: (array<'a>, int, 'a => 'a) => array<'a>` — copy array, apply function at index. Out-of-bounds → return unchanged copy.
- `update: (array<'a>, int, 'a) => array<'a>` — copy, replace at index. Out-of-bounds → unchanged copy.
- `insert: (array<'a>, int, 'a) => array<'a>` — pre-allocate `len + 1`, copy with gap at index.
- `remove: (array<'a>, int, int) => array<'a>` — `remove(arr, index, count)`. Clamp count to remaining elements.
- `aperture: (array<'a>, int) => array<array<'a>>` — alias for existing `slidingWindow`. Export both names from the same implementation.

#### Generation (4 functions)
- `range: (int, int) => array<int>` — exclusive end. `range(5, 1)` → `[]`. Pre-allocate.
- `repeat: ('a, int) => array<'a>` — pre-allocate to n.
- `times: (int => 'a, int) => array<'a>` — pre-allocate to n.
- `unfold: ('b => option<('a, 'b)>, 'b) => array<'a>` — `while` loop, push to result until None.

#### Combinators (3 functions)
- `scan: (array<'a>, ('b, 'a) => 'b, 'b) => array<'b>` — pre-allocate `len + 1` (includes initial value).
- `xprod: (array<'a>, array<'b>) => array<('a, 'b)>` — pre-allocate `len1 * len2`.
- `transpose: array<array<'a>> => array<array<'a>>` — truncate to shortest row length. Pre-allocate outer and inner arrays.

#### Set operations (4 functions)
- `intersection: (array<'a>, array<'a>) => array<'a>` — build `Js.Dict` lookup from second array, iterate first, dedup result.
- `union: (array<'a>, array<'a>) => array<'a>` — iterate both, `Js.Dict` for seen tracking.
- `difference: (array<'a>, array<'a>) => array<'a>` — `Js.Dict` lookup from second, iterate first.
- `symmetricDifference: (array<'a>, array<'a>) => array<'a>` — `difference(a, b) ++ difference(b, a)`, or single-pass with two lookups.

**Implementation notes:**
- Set operations use `Js.Dict` with `Js.Json.stringify` as the key serializer for structural equality lookups. This works for primitives and simple objects. Complex nested structures are acceptable since ReScript `==` is structural anyway.
- `aperture` shares the `slidingWindow` implementation body — either call `slidingWindow` directly or extract a shared internal function.

### 2. Object.res (7 functions)

Operates on `Js.t` objects. GenType will produce broad types; Phase 4a adds `Pick<T, K>` / `Omit<T, K>` narrowing in TypeScript.

**Functions (all data-first, all `@genType`):**
- `pick: (Js.t<'a>, array<string>) => Js.t<'b>` — iterate keys, copy matching to new object.
- `omit: (Js.t<'a>, array<string>) => Js.t<'b>` — iterate all object keys, skip listed ones.
- `assoc: (Js.t<'a>, string, 'b) => Js.t<'c>` — shallow copy via `Js.Obj.assign`, set key.
- `dissoc: (Js.t<'a>, string) => Js.t<'b>` — shallow copy, delete key.
- `mergeDeepLeft: (Js.t<'a>, Js.t<'a>) => Js.t<'a>` — recursive merge, first wins on conflict.
- `mergeDeepRight: (Js.t<'a>, Js.t<'a>) => Js.t<'a>` — recursive merge, second wins on conflict.
- `mergeWith: (Js.t<'a>, Js.t<'a>, ('b, 'b) => 'b) => Js.t<'a>` — shallow merge with conflict resolver.

**Implementation notes:**
- `mergeDeepLeft`/`mergeDeepRight` share a recursive helper parameterized by conflict direction.
- Need to check if a value is a plain object before recursing: `Js.typeof(v) === "object" && !Js.Array2.isArray(v) && v !== Js.null`.
- All return new objects — no mutation.

### 3. Logic.res (9 functions)

Predicate composition and conditional logic.

**Functions (all data-first, all `@genType`):**
- `equals: ('a, 'a) => bool` — ReScript structural `==`.
- `defaultTo: ('a, option<'a>) => 'a` — unwrap with default.
- `when_: ('a, 'a => bool, 'a => 'a) => 'a` — trailing underscore for keyword avoidance. If predicate true, apply transform.
- `unless: ('a, 'a => bool, 'a => 'a) => 'a` — inverse of `when_`.
- `cond: (array<('a => bool, 'a => 'b)>, 'a) => option<'b>` — first matching predicate wins, None if no match.
- `both: ('a => bool, 'a => bool) => 'a => bool` — combined AND predicate.
- `either: ('a => bool, 'a => bool) => 'a => bool` — combined OR predicate.
- `allPass: (array<'a => bool>) => 'a => bool` — all predicates pass. Empty → always true.
- `anyPass: (array<'a => bool>) => 'a => bool` — any predicate passes. Empty → always false.

**Implementation notes:**
- `both`/`either` return new lambdas — trivial.
- `allPass`/`anyPass` — `while` loop with `ref` for early termination in the returned function.
- `cond` — `while` loop through conditions array, return first match.
- `when_` needs genType name verification (same underscore question as `and_`/`or_`/`not_` from 2b).

### 4. Math.res (9 functions)

Pointfree arithmetic. Binary ops: data-first is `op(data, operand)`, so `subtract(10, 3) = 7` and when curried data-last `subtract(3)(10) = 7`.

**Functions (all data-first, all `@genType`):**
- `add: (float, float) => float`
- `subtract: (float, float) => float` — `subtract(a, b) = a - b`
- `multiply: (float, float) => float`
- `divide: (float, float) => float` — `divide(a, b) = a / b`. Division by zero → `Infinity`.
- `modulo: (float, float) => float` — `modulo(a, b) = mod_float(a, b)`
- `inc: float => float`
- `dec: float => float`
- `negate: float => float`
- `product: array<float> => float` — `for` loop accumulator, empty → `1.0`.

**Implementation notes:** All trivial single-operation functions. `product` is a `for` loop starting from `1.0`.

## GenType Type Mapping Notes
- `option<'a>` → `T | undefined` (relevant for `unfold` seed return, `cond`, `defaultTo`)
- Tuples `('a, 'b)` → `[A, B]` (relevant for `partition`, `xprod`, `cond` condition pairs, `unfold`)
- `Js.t<'a>` → broad object types (Phase 4a narrows with TypeScript generics)
- `Js.Dict.t<'a>` → `{[key: string]: A}` (set operation internals, not exposed)
- Verify `when_` exported name after first genType build.

## Test Plan

### Array extended tests
- **Manipulation:** `partition` split correctness + empty; `adjust`/`update` in-bounds + out-of-bounds; `insert` at start/middle/end; `remove` basic + clamp + out-of-bounds.
- **Generation:** `range` empty/basic/descending-returns-empty; `repeat` n=0/basic; `times` n=0 + index correctness; `unfold` fibonacci-style + immediate None.
- **Combinators:** `scan` empty → `[initial]` + accumulation; `xprod` empty + product length; `transpose` square + ragged (truncate to shortest).
- **Set ops:** all four with disjoint/overlapping/identical/empty arrays. Verify deduplication in results.

### Object tests
- `pick`/`omit`: basic selection/removal, missing keys ignored, empty keys.
- `assoc`/`dissoc`: add/overwrite/remove, non-existent key removal returns unchanged.
- `mergeDeepLeft`/`mergeDeepRight`: flat + nested objects, conflict direction verified.
- `mergeWith`: resolver called on conflicts, pass-through on non-conflicts.

### Logic tests
- `equals`: primitives, nested objects, arrays.
- `defaultTo`: Some → value, None → default.
- `when_`/`unless`: predicate true/false paths.
- `cond`: first match wins, no match → `undefined`, empty conditions → `undefined`.
- `both`/`either`: truth table.
- `allPass`/`anyPass`: empty array edge cases, mixed pass/fail.

### Math tests
- Binary ops: basic arithmetic, negatives, zero.
- `divide`: zero divisor → `Infinity`.
- `modulo`: basic + negative dividend.
- `inc`/`dec`/`negate`: basic + edge cases.
- `product`: empty → `1`, single, multiple, includes zero.

### Acceptance criteria
- `rescript build` compiles all modified/new `.res` files.
- `bun run test` passes all tests across core, rescript (2a array + 2b string/dict/number/boolean + 2c extended).
- GenType output verified for each module.
- Existing 2a array tests still pass after Array.res additions.

## Assumptions
- Phases 2a and 2b are complete.
- `Js.Dict` with stringified keys is acceptable for set operation lookups (works for primitives and simple structures).
- `aperture` aliases `slidingWindow` — both names exported, single implementation.
- `transpose` truncates to shortest row (no padding with undefined).
- `when_` underscore handling matches whatever was discovered in 2b for `and_`/`or_`/`not_`.
- Object module genType output will be broadly typed — Phase 4a adds TypeScript narrowing.
