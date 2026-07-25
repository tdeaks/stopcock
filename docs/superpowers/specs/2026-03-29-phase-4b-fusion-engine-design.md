# Phase 4b: Fusion Engine (`lay`)

## Scope

`lay` — a fused alternative to `pipe` for array operations. Same functions, same syntax, single-pass execution with zero intermediate arrays. Lives in `packages/fp/src/lay.ts`.

```ts
import { pipe, lay, A } from "stopcock"

// Eager — intermediate arrays between each step
pipe(data, A.filter(f), A.map(g), A.take(5))

// Fused — single pass, zero intermediates, early termination
lay(data, A.filter(f), A.map(g), A.take(5))
```

## How It Works

### Tagged functions

The `dual` wrapper (from core) attaches metadata to data-last function forms:

```ts
const fn = (arr) => rsMap(arr, f)   // normal function
fn._op = "map"                       // operation tag
fn._fn = f                           // original callback
```

`pipe` ignores these tags — it just calls the function. `lay` reads them and fuses.

### Fusion execution

`lay` collects tagged functions into fused segments. A fused segment iterates the source once, applying all operations per item:

```
lay(data, A.filter(f), A.map(g), A.take(5))

For each item in data:
  → apply filter(f): skip if false
  → apply map(g): transform
  → apply take(5): collect, halt after 5
```

One iteration, zero intermediate arrays.

### Materialization boundaries

Some operations need the full array — they can't process items one at a time. When `lay` encounters one, it materializes the current fused segment, runs the non-fuseable op on the concrete array, then starts a new fused segment.

```
lay(data,
  A.filter(f),     // fused ─┐
  A.map(g),        // fused ─┤ segment 1 → materializes
  A.take(100),     // fused ─┘
  A.sort,          // non-fuseable → runs on materialized array
  A.take(5)        // fused ── segment 2 → materializes at return
)
```

**Fuseable ops (process one item at a time):** `map`, `filter`, `take`, `drop`, `takeWhile`, `dropWhile`, `flatMap`

**Fuseable terminal ops (consume the fused stream, return non-array):** `reduce`, `forEach` (returns `void`), `every`, `some`, `find`, `findIndex`, `first` (returns `Option<A>`)

**Non-fuseable ops (force materialization):** `sort`, `sortBy`, `reverse`, `uniq`, `uniqBy`, `groupBy`

### Graceful degradation

Untagged functions (custom user code, non-library functions) also force materialization. `lay` materializes the current segment into an array, passes it to the untagged function, then inspects the result and continues.

This means `lay` always produces correct results, even with mixed tagged/untagged functions. Worst case (all untagged) it behaves identically to `pipe`.

### Return type

`lay` returns whatever the last operation produces — same contract as `pipe`. If the last op is `A.map(g)`, returns `B[]`. If it's `A.reduce(f, init)`, returns the accumulator type. If it's `A.first`, returns `Option<A>`.

### Early termination

`take`, `takeWhile`, and `first` support early termination via a `HALT` sentinel. When a take-style op has collected enough items, it signals halt. The fused loop breaks immediately — no further source items are processed.

`lay(millionItems, A.filter(f), A.take(5))` processes only enough items to find 5 that pass the filter, then stops.

## Amendments to Prior Phases

### Phase 1 amendment: tagged `dual`

The `dual` helper in core needs to support tagging. Updated signature:

```ts
dual(arity: number, fn: Function, tag?: { op: string })
```

When `tag` is provided, the data-last form attaches `_op` and `_fn` metadata. When omitted, behaves exactly as before (no tags).

### Phase 4a amendment: tagged wrappers

Array wrapper functions in `packages/fp/src/array.ts` pass tags to `dual`:

```ts
export const map = dual(2, RS.map, { op: "map" })
export const filter = dual(2, RS.filter, { op: "filter" })
export const take = dual(2, RS.take, { op: "take" })
export const sort = dual(2, RS.sort, { op: "sort" })  // tagged but non-fuseable
// etc.
```

All ops are tagged (so `lay` can identify them), but only fuseable ops get fused. Non-fuseable ops are recognized by tag and trigger materialization.

## Execution Order

### 1. Amend `dual` in core

Add optional `tag` parameter. Data-last forms attach `_op` and `_fn` when tag is provided. TDD:

- Tagged dual: data-last form has `_op` and `_fn` properties
- Untagged dual: behaves exactly as before (no properties)
- Both call forms still work correctly with tags

### 2. Amend array.ts wrappers

Add tags to all `dual` calls in `packages/fp/src/array.ts`. No new tests needed — existing dual tests still pass, tag presence verified in lay tests.

### 3. lay.ts — fusion engine

**File:** `packages/fp/src/lay.ts`

Core implementation:

- Accept initial value + variadic tagged/untagged functions (same signature shape as `pipe`)
- Walk the function list, grouping consecutive fuseable ops into segments
- Execute each segment as a single fused loop
- Materialize between segments for non-fuseable ops or untagged functions
- Return the final result

Key internals:

- `HALT` sentinel symbol for early termination
- Fused loop: `for` over source, apply each op in sequence per item, break on `HALT`
- `flatMap` in a fused segment: for each source item, produce 0-N items, feed each through the remaining ops

### 4. Export from index.ts

Add `export { lay } from "./lay"` to barrel.

## TDD Tests

### Correctness (lay produces same results as pipe)

- `lay(data, A.map(f))` === `pipe(data, A.map(f))`
- `lay(data, A.filter(f), A.map(g))` === `pipe(data, A.filter(f), A.map(g))`
- `lay(data, A.filter(f), A.map(g), A.take(5))` === `pipe(data, A.filter(f), A.map(g), A.take(5))`
- `lay(data, A.map(g), A.sort, A.take(5))` === `pipe(data, A.map(g), A.sort, A.take(5))`

### Early termination

- `lay(millionItems, A.take(5))` returns 5 items (verify with a counting spy that fewer than 1M items are visited)
- `lay(millionItems, A.filter(f), A.take(5))` visits only as many items as needed to find 5 matches

### Materialization boundaries

- Non-fuseable op in middle: `lay(data, A.filter(f), A.sort, A.take(5))` — filter is fused, sort materializes, take runs on sorted array
- Multiple non-fuseable ops: `lay(data, A.sort, A.reverse)` — both materialize, correct result
- Non-fuseable at start: `lay(data, A.sort, A.filter(f), A.map(g))` — sort materializes immediately, filter+map fused

### Graceful degradation

- Untagged function in chain: `lay(data, A.filter(f), customFn, A.map(g))` — materializes at customFn, correct result
- All untagged: `lay(data, customFn1, customFn2)` — behaves like `pipe`

### Return types

- `lay(data, A.map(f))` returns array
- `lay(data, A.reduce(f, 0))` returns number
- `lay([], A.map(f))` returns `[]`

### Edge cases

- Empty input array
- Single operation
- No operations: `lay(data)` returns data unchanged
- `flatMap` in fused chain: expanding (1-to-many) and collapsing (1-to-0)

## Design Constraints

1. `lay` has the same signature shape and return type contract as `pipe`
2. Fuseable ops: map, filter, take, drop, takeWhile, dropWhile, flatMap
3. Fuseable terminal ops: reduce, forEach, every, some, find, findIndex, first
4. Non-fuseable ops force materialization, then a new fused segment starts
5. Untagged functions force materialization — graceful degradation, never incorrect results
6. Early termination via `HALT` sentinel for take-style ops
7. Zero intermediate arrays within a fused segment
8. `HALT` is an unexported symbol — internal to the fusion engine
