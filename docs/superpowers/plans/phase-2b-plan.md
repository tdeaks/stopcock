# Phase 2b Implementation Plan: ReScript String, Dict, Number, Boolean

## Summary
- Add `String.res`, `Dict.res`, `Number.res`, and `Boolean.res` to the existing `@stopcock/rescript` package scaffolded in Phase 2a.
- 29 functions total: String (14), Dict (9), Number (3), Boolean (4).
- Same TDD-against-generated-JS pipeline as Phase 2a: TypeScript tests first, then ReScript implementation.
- Guard.res is explicitly excluded — guards move to pure TypeScript in Phase 4.

## Implementation Changes

- No package scaffold changes — `@stopcock/rescript` already exists from Phase 2a with `rescript.json`, `vitest.config.ts`, and Turbo integration.
- New ReScript source files:
    - `packages/rescript/src/String.res`
    - `packages/rescript/src/Dict.res`
    - `packages/rescript/src/Number.res`
    - `packages/rescript/src/Boolean.res`
- New test files (one per module, describe-style nesting):
    - `packages/rescript/__tests__/string.test.ts`
    - `packages/rescript/__tests__/dict.test.ts`
    - `packages/rescript/__tests__/number.test.ts`
    - `packages/rescript/__tests__/boolean.test.ts`
- No changes to `turbo.json`, root `package.json`, or `@stopcock/core`.

## Execution Order

Implement modules sequentially. For each: write all TS tests, implement ReScript, verify genType output, then move on.

### 1. String.res (14 functions)

All thin wrappers around `Js.String2` / `String` builtins, compiled for monomorphic output.

**Functions (all data-first, all `@genType`):**
- `isEmpty: string => bool`
- `length: string => int`
- `trim: string => string`
- `trimStart: string => string`
- `trimEnd: string => string`
- `startsWith: (string, string) => bool`
- `endsWith: (string, string) => bool`
- `includes: (string, string) => bool`
- `split: (string, string) => array<string>`
- `toLowerCase: string => string`
- `toUpperCase: string => string`
- `slice: (string, int, int) => string`
- `replaceAll: (string, string, string) => string`
- `repeat: (string, int) => string`

**Implementation notes:** These are straightforward delegations to JS string builtins via ReScript's `String` module from `@rescript/core`. No Belt needed. The value is genType declarations and monomorphic compiled output.

### 2. Dict.res (9 functions)

Works with `Dict.t<'a>` (JS plain objects). Callbacks use `(value, key)` ordering.

**Functions (all data-first, all `@genType`):**
- `fromEntries: array<(string, 'a)> => Dict.t<'a>`
- `toEntries: Dict.t<'a> => array<(string, 'a)>`
- `keys: Dict.t<'a> => array<string>`
- `values: Dict.t<'a> => array<'a>`
- `map: (Dict.t<'a>, ('a, string) => 'b) => Dict.t<'b>`
- `filter: (Dict.t<'a>, ('a, string) => bool) => Dict.t<'a>`
- `merge: (Dict.t<'a>, Dict.t<'a>) => Dict.t<'a>`
- `get: (Dict.t<'a>, string) => option<'a>`
- `isEmpty: Dict.t<'a> => bool`

**Implementation notes:**
- `fromEntries` — iterate entries array, build dict with `Dict.set`.
- `toEntries` — get keys, map to `(key, value)` tuples.
- `map`/`filter` — iterate keys, build new dict.
- `merge` — create new dict from first, then overwrite with second's entries.
- `get` — use `Dict.get` from `@rescript/core` which returns `option<'a>`.
- `isEmpty` — `Array.length(Dict.keysToArray(d)) === 0`.

### 3. Number.res (3 functions)

**Functions (all data-first, all `@genType`):**
- `clamp: (float, float, float) => float` — `clamp(value, min, max)`. If `min > max`, swap them so the function always works.
- `isEven: int => bool` — `mod(n, 2) === 0`
- `isOdd: int => bool` — `mod(n, 2) !== 0`

**Implementation notes:** Trivial. `clamp` uses `Math.min` / `Math.max` or a conditional. The `min > max` swap is: `let (lo, hi) = min > max ? (max, min) : (min, max)`.

### 4. Boolean.res (4 functions)

**Functions (all data-first, all `@genType`):**
- `ifElse: (bool, () => 'a, () => 'a) => 'a` — lazy branching
- `and_: (bool, bool) => bool`
- `or_: (bool, bool) => bool`
- `not_: bool => bool`

**Implementation notes:**
- `ifElse` takes two thunks; only the matching branch is evaluated.
- Trailing underscores (`and_`, `or_`, `not_`) avoid ReScript keyword conflicts.
- Verify genType exported names — genType may or may not strip the trailing underscore. Tests must use whatever name genType actually emits.

## GenType Type Mapping Notes
- `option<'a>` → `T | undefined` (relevant for `Dict.get`)
- `Dict.t<'a>` → `{[key: string]: A}` (relevant for all Dict functions)
- Tuples `(string, 'a)` → `[string, A]` (relevant for `fromEntries`, `toEntries`)
- Thunks `() => 'a` → `() => A` (relevant for `ifElse`)
- Verify actual exported names for `and_`, `or_`, `not_` after first genType build. Adjust test imports if genType strips or preserves the underscore.

## Test Plan

### String tests
- `isEmpty`: empty → true, whitespace → false, non-empty → false
- `trim`/`trimStart`/`trimEnd`: whitespace variations, already-trimmed strings, empty string
- `startsWith`/`endsWith`/`includes`: match, no match, empty search string (→ true)
- `split`: basic delimiter, multi-char delimiter, not found (single-element array), empty delimiter (splits every char)
- `slice`: basic range, negative indices, out-of-bounds clamping
- `replaceAll`: single/multiple occurrences, no match (returns original), empty pattern
- `repeat`: n = 0 (empty), n = 1 (identity), n > 1
- `toLowerCase`/`toUpperCase`: basic transforms, already-cased, empty string

### Dict tests
- `fromEntries`/`toEntries` roundtrip preserves entries
- `keys`/`values`: correct extraction, empty dict → `[]`
- `map`: transforms values, key available in callback, empty dict
- `filter`: includes/excludes correctly, empty dict, filter all/none
- `merge`: disjoint keys, overlapping keys (second wins), one or both empty
- `get`: existing key → value, missing key → `undefined`
- `isEmpty`: empty → true, non-empty → false

### Number tests
- `clamp`: below min → min, above max → max, in range → unchanged, min = max, min > max (swap behavior)
- `isEven`: 0, positive even/odd, negative even/odd
- `isOdd`: inverse for all `isEven` cases

### Boolean tests
- `ifElse`: true branch evaluated (false branch spy not called), false branch evaluated (true branch spy not called)
- `and_`: truth table (4 combos)
- `or_`: truth table (4 combos)
- `not_`: true → false, false → true

### Acceptance criteria
- `rescript build` compiles all 4 new `.res` files and emits `.res.js` + `.gen.tsx` for each.
- `bun run test` passes all tests across `@stopcock/core` and `@stopcock/rescript` (Array from 2a + String/Dict/Number/Boolean from 2b).
- GenType output verified for each module's specific type mappings.

## Assumptions
- Phase 2a is complete: `@stopcock/rescript` package exists with `Array.res`, Turbo integration, and vitest config.
- `@rescript/core` provides `Dict`, `String`, `Math`, and `Array` modules used in implementations.
- No Belt needed for these modules — unlike the Array hot-path work in 2a, these are straightforward delegations.
- GenType underscore handling for `and_`/`or_`/`not_` needs verification on first build — test imports may need adjustment.
- No barrel `index.ts` or re-exports in this phase. The unified package (Phase 4) handles that.
