# Phase 2b: ReScript String, Dict, Number, Boolean

## Scope

Remaining ReScript modules in `packages/rescript`: String.res (12 functions), Dict.res (8-9 functions), Number.res (3 functions), Boolean.res (4 functions). Same TDD-against-generated-JS pipeline as Phase 2a.

Guard.res is **not** in this phase — guard functions move to pure TypeScript with type predicates in Phase 4.

## Decisions

- **TDD against generated JS** — consistent with Phase 2a
- **Data-first exports** — dual wrapping deferred to Phase 4
- **Core only** — `@rescript/core` for all modules, no Belt needed (no hot-path array work)
- **Dict callback ordering** — `(value, key)`, consistent with Array's data-first pattern
- **Describe-style test nesting** — consistent with Phase 1 and 2a
- **Verify genType output after each module**

## Execution Order

### 1. String.res

14 functions. Most are thin wrappers around `Js.String2` methods, compiled through ReScript for monomorphic output and genType declarations.

#### Functions (all data-first)

- `isEmpty: string => bool` — true if length is 0
- `length: string => int` — string length
- `trim: string => string` — trim whitespace both ends
- `trimStart: string => string` — trim leading whitespace
- `trimEnd: string => string` — trim trailing whitespace
- `startsWith: (string, string) => bool` — prefix check
- `endsWith: (string, string) => bool` — suffix check
- `includes: (string, string) => bool` — substring check
- `split: (string, string) => array<string>` — split by delimiter
- `toLowerCase: string => string`
- `toUpperCase: string => string`
- `slice: (string, int, int) => string` — substring by start/end index
- `replaceAll: (string, string, string) => string` — replace all occurrences of pattern with replacement
- `repeat: (string, int) => string` — repeat n times

**Note:** The main spec lists 12 but this adds `isEmpty` and `length` to match the Array module pattern, bringing the total to 14.

#### TDD tests

- `isEmpty`: empty string → true, whitespace → false, non-empty → false
- `trim`/`trimStart`/`trimEnd`: whitespace variations, already-trimmed strings
- `startsWith`/`endsWith`/`includes`: match, no match, empty search string
- `split`: basic delimiter, multi-char delimiter, delimiter not found (returns single-element array), empty delimiter (splits every char)
- `slice`: basic range, negative indices, out-of-bounds clamping
- `replaceAll`: single occurrence, multiple occurrences, no match (returns original), empty pattern
- `repeat`: n = 0 (empty string), n = 1 (identity), n > 1

### 2. Dict.res

8-9 functions for working with `Dict.t<'a>` (JS plain objects as dictionaries).

#### Functions (all data-first)

- `fromEntries: array<(string, 'a)> => Dict.t<'a>` — build dict from key-value pairs
- `toEntries: Dict.t<'a> => array<(string, 'a)>` — extract key-value pairs
- `keys: Dict.t<'a> => array<string>` — extract keys
- `values: Dict.t<'a> => array<'a>` — extract values
- `map: (Dict.t<'a>, ('a, string) => 'b) => Dict.t<'b>` — transform values, callback is `(value, key)`
- `filter: (Dict.t<'a>, ('a, string) => bool) => Dict.t<'a>` — filter entries, callback is `(value, key)`
- `merge: (Dict.t<'a>, Dict.t<'a>) => Dict.t<'a>` — shallow merge, second dict wins on conflict
- `get: (Dict.t<'a>, string) => option<'a>` — safe key lookup
- `isEmpty: Dict.t<'a> => bool` — true if no keys

#### TDD tests

- `fromEntries`/`toEntries` roundtrip: `toEntries(fromEntries(entries))` preserves entries
- `keys`/`values`: correct extraction, empty dict returns `[]`
- `map`: transforms values, key available in callback, empty dict
- `filter`: includes/excludes correctly, empty dict, filter all/none
- `merge`: disjoint keys, overlapping keys (second wins), empty dicts
- `get`: existing key → Some, missing key → None
- `isEmpty`: empty dict → true, non-empty → false

**genType note:** `Dict.t<'a>` maps to `{[key: string]: A}` in TypeScript. ReScript tuples `(string, 'a)` map to `[string, A]`. Tests should verify both mappings.

### 3. Number.res

3 functions.

#### Functions (all data-first)

- `clamp: (float, float, float) => float` — clamp value to `[min, max]` range. Signature: `clamp(value, min, max)`
- `isEven: int => bool` — true if divisible by 2
- `isOdd: int => bool` — true if not divisible by 2

#### TDD tests

- `clamp`: value below min → min, value above max → max, value in range → unchanged, min = max, min > max (treat as `clamp(value, max, min)` — swap so it still works)
- `isEven`: 0 → true, positive even, positive odd, negative even, negative odd
- `isOdd`: inverse of `isEven` for all cases

### 4. Boolean.res

4 functions.

#### Functions (all data-first)

- `ifElse: (bool, () => 'a, () => 'a) => 'a` — lazy branching: true evaluates first thunk, false evaluates second
- `and_: (bool, bool) => bool` — logical AND (trailing underscore avoids ReScript keyword conflict)
- `or_: (bool, bool) => bool` — logical OR
- `not_: bool => bool` — logical NOT

#### TDD tests

- `ifElse`: true branch evaluated (false branch not called), false branch evaluated (true branch not called). Verify laziness with side-effect spies.
- `and_`: truth table (4 combinations)
- `or_`: truth table (4 combinations)
- `not_`: true → false, false → true

**genType note:** The trailing underscores (`and_`, `or_`, `not_`) are ReScript naming — genType should strip them or preserve them. Tests should verify the actual exported names.

## Design Constraints

1. ReScript exports data-first only — dual wrapping deferred to Phase 4
2. All exported functions annotated with `@genType`
3. Dict callbacks use `(value, key)` ordering
4. No Guard.res — guards are pure TypeScript in Phase 4
5. Minimal comments in ReScript source — only *why*, never *what*
6. GenType output verified after each module
