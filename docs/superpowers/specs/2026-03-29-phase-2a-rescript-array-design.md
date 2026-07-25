# Phase 2a: ReScript Array.res

## Scope

`packages/rescript` package setup and `Array.res` — 35+ array functions compiled via ReScript 12 to JIT-optimal JS, with genType for TypeScript declarations. TDD against the generated JS output.

## Decisions

- **TDD against generated JS** — TypeScript tests define the consumer contract, ReScript implements to satisfy them
- **Dual signatures** — deferred to Phase 4. ReScript exports data-first only; the unified package wraps with dual (data-first + data-last) signatures in TypeScript
- **Belt for hot paths** — `Belt.Array.makeUninitializedUnsafe`, `getUnsafe`, `setUnsafe` for pre-allocated arrays and tight loops
- **Core for everything else** — `@rescript/core` (`-open RescriptCore`) as the default environment
- **Describe-style test nesting** — consistent with Phase 1
- **Verify genType output after each group** — catch type generation issues early

## Package Setup

### rescript.json

```json
{
  "name": "@stopcock/rescript",
  "sources": [{ "dir": "src", "subdirs": true }],
  "package-specs": [{ "module": "esmodule", "in-source": true }],
  "suffix": ".res.js",
  "bs-dependencies": ["@rescript/core"],
  "bsc-flags": ["-open RescriptCore"],
  "gentypeconfig": {
    "module": "esmodule",
    "moduleResolution": "bundler",
    "generatedFileExtension": ".gen.tsx"
  }
}
```

### package.json

`@stopcock/rescript`: `"type": "module"`. Dependencies: `rescript`, `@rescript/core`. Build script: `rescript build`. GenType output co-located in `src/` (`.res.js` + `.gen.tsx` alongside `.res` source).

### Test setup

Tests live in `packages/rescript/__tests__/` as TypeScript files (e.g., `array.test.ts`). They import from the generated `.gen.tsx` files. Vitest config at `packages/rescript/vitest.config.ts`.

### Toolchain verification

Before TDD begins, verify the full pipeline end-to-end:

1. Write a trivial ReScript function (e.g., `let add = (a, b) => a + b`) with `@genType`
2. Compile with `rescript build`
3. Verify `.res.js` output is clean JS (no runtime bloat)
4. Verify `.gen.tsx` output has correct TypeScript types
5. Write a TypeScript test that imports from `.gen.tsx` and passes

This checkpoint proves the toolchain works before committing to 35+ functions.

## ReScript Code Rules

For V8 TurboFan / JSC DFG+FTL optimal output:

- `Belt.Array.makeUninitializedUnsafe(len)` for pre-allocated output arrays when size is known
- `Belt.Array.getUnsafe` and `Belt.Array.setUnsafe` in loops (no bounds checks)
- Plain `for` loops, not recursive implementations
- `while` loops with `ref` flags for early-termination functions
- All exported functions annotated with `@genType`
- No `arguments` object, no dynamic dispatch
- Homomorphic: functions operate on `array<'a>`, not mixed types

## Function Groups (execution order)

TDD each group: write TypeScript tests first, then implement in ReScript to make them pass.

### Group 1: Simple Accessors

`head`, `last`, `tail`, `init`, `isEmpty`, `length`

- `head: array<'a> => option<'a>` — returns first element or None
- `last: array<'a> => option<'a>` — returns last element or None
- `tail: array<'a> => array<'a>` — all elements except first (empty if empty)
- `init: array<'a> => array<'a>` — all elements except last (empty if empty)
- `isEmpty: array<'a> => bool` — true if length is 0
- `length: array<'a> => int` — array length

**Tests:** empty array edge cases for all. `head`/`last` return None on empty. `tail`/`init` return `[]` on empty. Basic happy paths.

**Note:** `head` and `last` return ReScript `option`, which genType maps to `T | undefined`. Tests should verify this mapping.

### Group 2: Slicing

`take`, `drop`, `takeWhile`, `dropWhile`, `chunk`, `slidingWindow`

- `take: (array<'a>, int) => array<'a>` — first n elements (clamp to bounds)
- `drop: (array<'a>, int) => array<'a>` — skip first n elements
- `takeWhile: (array<'a>, 'a => bool) => array<'a>` — take while predicate holds
- `dropWhile: (array<'a>, 'a => bool) => array<'a>` — drop while predicate holds
- `chunk: (array<'a>, int) => array<array<'a>>` — split into chunks of size n
- `slidingWindow: (array<'a>, int) => array<array<'a>>` — overlapping windows of size n

**Tests:** empty arrays, n > length, n = 0, n = 1, n = length, n < 0. `chunk` with non-divisible length (last chunk is shorter). `slidingWindow` with window > length (returns empty). `takeWhile`/`dropWhile` where predicate is always true/false.

**Edge case:** `n <= 0` for `chunk`/`slidingWindow`/`take`/`drop` returns empty array. No throws.

**Implementation notes:** `take`/`drop` use pre-allocated arrays (size is known). `takeWhile`/`dropWhile` use `while` loop with `ref` for early termination. `chunk` pre-allocates outer array (`Math.ceil(len / n)`).

### Group 3: Core HOFs

`map`, `mapWithIndex`, `filter`, `filterWithIndex`, `forEach`, `forEachWithIndex`

- `map: (array<'a>, 'a => 'b) => array<'b>` — pre-allocate output, `for` loop
- `mapWithIndex: (array<'a>, ('a, int) => 'b) => array<'b>` — same with index
- `filter: (array<'a>, 'a => bool) => array<'a>` — two-pass or dynamic push
- `filterWithIndex: (array<'a>, ('a, int) => bool) => array<'a>` — same with index
- `forEach: (array<'a>, 'a => unit) => unit` — side-effect only, returns unit
- `forEachWithIndex: (array<'a>, ('a, int) => unit) => unit` — same with index

**Tests:** empty arrays. `map` type transformation (e.g., `int => string`). `filter` removes nothing, removes everything, removes some. `forEach` calls effect correct number of times (spy/mock). Index parameters receive correct values.

**Implementation notes:** `map` pre-allocates with `Belt.Array.makeUninitializedUnsafe(len)` — output size equals input size. `filter` cannot pre-allocate (output size unknown) — use a loop that pushes to a result array. `forEach` is a plain `for` loop returning unit.

### Group 4: Reducers

`reduce`, `reduceRight`, `flatMap`, `flatten`

- `reduce: (array<'a>, ('b, 'a) => 'b, 'b) => 'b` — left fold with initial value
- `reduceRight: (array<'a>, ('b, 'a) => 'b, 'b) => 'b` — right fold with initial value
- `flatMap: (array<'a>, 'a => array<'b>) => array<'b>` — map then flatten
- `flatten: array<array<'a>> => array<'a>` — one level of flattening

**Tests:** empty arrays. `reduce` sum, string concatenation. `reduceRight` order matters (concatenation shows reversed fold). `flatMap` expanding (1-to-many) and collapsing (1-to-0). `flatten` with mixed-length inner arrays, empty inner arrays.

**Implementation notes:** `reduce`/`reduceRight` are plain `for` loops with an accumulator. `flatMap` — compute total output length first, then pre-allocate and fill. `flatten` — same strategy: sum inner lengths, pre-allocate, fill.

### Group 5: Search

`find`, `findIndex`, `every`, `some`, `includes`

- `find: (array<'a>, 'a => bool) => option<'a>` — first match or None
- `findIndex: (array<'a>, 'a => bool) => option<int>` — index of first match or None
- `every: (array<'a>, 'a => bool) => bool` — all elements satisfy predicate
- `some: (array<'a>, 'a => bool) => bool` — at least one satisfies predicate
- `includes: (array<'a>, 'a) => bool` — element exists (ReScript `==` structural equality — works for primitives; for objects, compares by value not reference)

**Tests:** empty arrays (find → None, every → true, some → false). Match at start, middle, end. No match. `includes` with primitives.

**Implementation notes:** All use `while` loop with `ref` flag for early termination. `find`/`findIndex` break on first match. `every` breaks on first false. `some` breaks on first true.

### Group 6: Transform

`reverse`, `sort`, `sortBy`, `uniq`, `uniqBy`, `intersperse`

- `reverse: array<'a> => array<'a>` — new reversed array (no mutation)
- `sort: array<float> => array<float>` — numeric sort (not lexicographic)
- `sortBy: (array<'a>, ('a, 'a) => int) => array<'a>` — sort with comparator
- `uniq: array<'a> => array<'a>` — deduplicate (structural equality)
- `uniqBy: (array<'a>, 'a => 'b) => array<'a>` — deduplicate by key function
- `intersperse: (array<'a>, 'a) => array<'a>` — insert separator between elements

**Tests:** empty and single-element arrays for all. `reverse` doesn't mutate original. `sort` numeric ordering (not string-coerced). `sortBy` with custom comparator. `uniq` preserves first occurrence order. `uniqBy` by key. `intersperse` with 0, 1, many elements.

**Implementation notes:** `reverse` pre-allocates (size known). `sort`/`sortBy` copy then sort in-place (don't mutate input). `intersperse` pre-allocates (`2 * len - 1`). `uniq`/`uniqBy` cannot pre-allocate — push to result.

### Group 7: Combinators

`zip`, `zipWith`, `groupBy`

- `zip: (array<'a>, array<'b>) => array<('a, 'b)>` — pair elements, truncate to shorter
- `zipWith: (array<'a>, array<'b>, ('a, 'b) => 'c) => array<'c>` — zip with transform
- `groupBy: (array<'a>, 'a => string) => Dict.t<array<'a>>` — group into dict by key function

**Tests:** empty arrays. Arrays of different lengths (truncation). `zip` produces tuples. `zipWith` transforms. `groupBy` groups correctly, preserves order within groups.

**Implementation notes:** `zip`/`zipWith` pre-allocate to `min(len1, len2)`. `groupBy` builds a `Dict.t` — uses `Js.Dict.set` in a `for` loop.

**Note on genType tuple mapping:** ReScript tuples `('a, 'b)` map to `[A, B]` in TypeScript via genType. Tests should verify this.

## Design Constraints

1. ReScript exports data-first only — dual wrapping deferred to Phase 4
2. All exported functions annotated with `@genType`
3. No mutation of input arrays — always return new arrays
4. Pre-allocate output arrays when size is known
5. Early termination via `while` + `ref` for search functions
6. Minimal comments in ReScript source — only *why*, never *what*
7. GenType output verified after each group
