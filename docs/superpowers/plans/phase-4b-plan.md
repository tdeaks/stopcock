# Phase 4b Implementation Plan: Fusion Engine (`lay`)

## Summary
- Implement `lay` — a fused `pipe` for array operations. Same functions, same syntax, single-pass execution with zero intermediate arrays.
- Amend `dual` in core to support optional tagging (`_op`, `_fn` metadata).
- Amend array.ts dual wrappers to pass tags.
- Implement the fusion engine in `packages/fp/src/lay.ts`.
- Export `lay` from the unified barrel.

## Implementation Changes

- Modified in core:
    - `packages/core/src/dual.ts` — add optional `tag` parameter; data-last forms attach `_op` and `_fn` when tagged.
    - `packages/core/src/dual.test.ts` — tests for tagged dual behavior.
- Modified in unified package:
    - `packages/fp/src/array.ts` — add `{ op: "..." }` tag to every `dual` call.
- New files:
    - `packages/fp/src/lay.ts` — fusion engine.
    - `packages/fp/src/lay.test.ts` — correctness, early termination, materialization, degradation tests.
- Modified:
    - `packages/fp/src/index.ts` — add `lay` export.

## Execution Order

### 1. Amend `dual` with tagging

Update `dual` signature:

```ts
dual(arity: number, fn: Function, tag?: { op: string })
```

When `tag` is provided, the data-last return form gets:
- `_op: string` — operation name (e.g. `"map"`, `"filter"`)
- `_fn: Function` — the original callback passed by the user

When `tag` is omitted, behavior is identical to current — no metadata attached.

**Tests:**
- Tagged dual: data-last form has `_op` and `_fn` properties.
- Untagged dual: no `_op` or `_fn` properties (existing behavior preserved).
- Both call forms (data-first, data-last) still work correctly with tags.
- Existing dual tests continue to pass unchanged.

### 2. Tag array.ts wrappers

Add tags to every `dual` call in `packages/fp/src/array.ts`:

```ts
export const map = dual(2, RS.map, { op: "map" })
export const filter = dual(2, RS.filter, { op: "filter" })
export const take = dual(2, RS.take, { op: "take" })
export const drop = dual(2, RS.drop, { op: "drop" })
export const takeWhile = dual(2, RS.takeWhile, { op: "takeWhile" })
export const dropWhile = dual(2, RS.dropWhile, { op: "dropWhile" })
export const flatMap = dual(2, RS.flatMap, { op: "flatMap" })
export const reduce = dual(3, RS.reduce, { op: "reduce" })
export const forEach = dual(2, RS.forEach, { op: "forEach" })
export const every = dual(2, RS.every, { op: "every" })
export const some = dual(2, RS.some, { op: "some" })
export const find = dual(2, RS.find, { op: "find" })
export const findIndex = dual(2, RS.findIndex, { op: "findIndex" })
export const sort = dual(1, RS.sort, { op: "sort" })  // non-fuseable — see note below
export const sortBy = dual(2, RS.sortBy, { op: "sortBy" })  // non-fuseable
export const reverse = dual(1, RS.reverse, { op: "reverse" })  // non-fuseable
export const uniq = dual(1, RS.uniq, { op: "uniq" })  // non-fuseable
export const uniqBy = dual(2, RS.uniqBy, { op: "uniqBy" })  // non-fuseable
export const groupBy = dual(2, RS.groupBy, { op: "groupBy" })  // non-fuseable
// ... remaining functions also tagged
```

All ops get tagged so `lay` can identify them. The fusion engine decides which are fuseable vs which force materialization.

**Note on `dual(1, fn, tag)` for arity-1 functions:** `dual` with arity 1 means the function always executes data-first (since 1 arg ≥ arity 1 is always true). The `dual` wrapper here is used purely as a tagging mechanism — attaching `_op` metadata so `lay` can recognize these operations. The dual dispatch behavior is irrelevant for arity-1 functions.

**No new tests needed** — existing dual/array tests still pass. Tag presence verified in lay.ts tests.

### 3. `lay` type overloads

**File:** `packages/fp/src/lay.ts` (top of file)

`lay` needs 1-20 function overloads mirroring `pipe`'s signatures so TypeScript correctly infers the return type of the last function in the chain. Copy the overload pattern from `packages/core/src/pipe.ts`, replacing the function name.

```ts
export function lay<A, B>(a: A, f1: (a: A) => B): B
export function lay<A, B, C>(a: A, f1: (a: A) => B, f2: (b: B) => C): C
// ... up to 20 functions
export function lay(a: unknown, ...fns: Array<(x: unknown) => unknown>): unknown {
  // fusion engine implementation
}
```

Also add a 0-arity overload: `lay<A>(a: A): A` — returns data unchanged when no functions are provided.

### 4. Fusion engine (`lay.ts`)

The core of this phase. Key concepts:

#### Operation classification

```ts
const FUSEABLE = new Set(["map", "filter", "take", "drop", "takeWhile", "dropWhile", "flatMap"])
const FUSEABLE_TERMINAL = new Set(["reduce", "forEach", "every", "some", "find", "findIndex", "first"])
const NON_FUSEABLE = new Set(["sort", "sortBy", "reverse", "uniq", "uniqBy", "groupBy"])
```

#### HALT sentinel

```ts
const HALT: unique symbol = Symbol("HALT")
```

Internal, unexported. Used by `take`/`takeWhile` to signal early termination in the fused loop.

#### Algorithm

1. Accept `(data, ...fns)` — same shape as `pipe`.
2. Walk the function list, grouping consecutive fuseable ops into segments. Non-fuseable ops or untagged functions are segment boundaries.
3. For each segment:
   - If it's a fused segment (one or more fuseable ops): run a single `for` loop over the current data array, applying each op per item. Handle `HALT` for early termination.
   - If it's a non-fuseable op: materialize the current result (if in a fused segment), then call the op on the concrete array.
   - If it's an untagged function: materialize, call it, continue with its result.
4. Return the final result.

#### Fused loop detail

```
for each item in source:
  let val = item
  for each op in segment:
    if op is "filter": if !fn(val) → skip item (continue outer)
    if op is "map": val = fn(val)
    if op is "take": if collected >= n → HALT; else collect val
    if op is "drop": if skipped < n → skip item; else pass through
    if op is "takeWhile": if !fn(val) → HALT; else collect val
    if op is "dropWhile": if still dropping && fn(val) → skip; else pass through
    if op is "flatMap": for each sub in fn(val) → feed through remaining ops
  collect val into result
```

**`flatMap` in fused context:** For each source item, produce 0-N sub-items. Each sub-item is fed through the remaining ops in the segment individually. This handles expanding (1-to-many) and collapsing (1-to-0).

**`drop`/`dropWhile` state:** These ops maintain per-segment state (a counter or flag). State is initialized when the segment starts.

**Terminal ops in fused context:** `reduce`, `forEach`, `every`, `some`, `find`, `findIndex`, `first` consume the fused stream and return a non-array result. They must be the last op in a segment (any op after them starts a new context on the returned value, which is not an array for most terminals). `first` is an alias for `head` (defined in Phase 4a's array.ts) that returns `Option<A>` and supports early termination — it HALTs after collecting the first item that passes through the fused chain.

#### Implementation notes

- The fused loop body is a single function with a `switch` on `_op` for each step. No dynamic dispatch or polymorphism — keep it monomorphic for V8.
- `HALT` is checked after each op. If `HALT`, break the outer source loop immediately.
- Result collection: push to a pre-allocated or dynamic result array depending on whether final size is known (`take` → known, `filter` → unknown).
- `lay(data)` with no functions returns `data` unchanged (same as `pipe`).

### 5. Export from index.ts

Add to `packages/fp/src/index.ts`:

```ts
export { lay } from "./lay.js"
```

## Test Plan

### Correctness (lay === pipe for all cases)

Property: for any combination of ops and data, `lay(data, ...ops)` produces the same result as `pipe(data, ...ops)`.

- `lay(data, A.map(f))` === `pipe(data, A.map(f))`
- `lay(data, A.filter(f), A.map(g))` === `pipe(data, A.filter(f), A.map(g))`
- `lay(data, A.filter(f), A.map(g), A.take(5))` === `pipe(data, A.filter(f), A.map(g), A.take(5))`
- `lay(data, A.map(g), A.sort, A.take(5))` === `pipe(data, A.map(g), A.sort, A.take(5))`
- `lay(data, A.flatMap(f), A.filter(g))` === `pipe(data, A.flatMap(f), A.filter(g))`
- `lay(data, A.drop(3), A.map(f))` === `pipe(data, A.drop(3), A.map(f))`
- `lay(data, A.dropWhile(f), A.take(5))` === `pipe(data, A.dropWhile(f), A.take(5))`

### Early termination

- `lay(millionItems, A.take(5))` returns 5 items. Use a counting spy on the source to verify far fewer than 1M items visited.
- `lay(millionItems, A.filter(f), A.take(5))` visits only enough items to find 5 matches.
- `lay(millionItems, A.takeWhile(x => x < 10))` stops at first failing item.

### Materialization boundaries

- Non-fuseable in middle: `lay(data, A.filter(f), A.sort, A.take(5))` — filter fused into segment 1, sort materializes, take in segment 2.
- Multiple non-fuseable: `lay(data, A.sort, A.reverse)` — both materialize sequentially.
- Non-fuseable at start: `lay(data, A.sort, A.filter(f), A.map(g))` — sort materializes, filter+map fused.
- Non-fuseable at end: `lay(data, A.filter(f), A.sort)` — filter fused into segment, sort on materialized result.

### Graceful degradation

- Untagged function in chain: `lay(data, A.filter(f), customFn, A.map(g))` — materializes at customFn, result correct.
- All untagged: `lay(data, fn1, fn2)` — behaves identically to `pipe(data, fn1, fn2)`.
- Mixed tagged and untagged: result matches `pipe` equivalent.

### Fuseable terminal ops

- `lay(data, A.filter(f), A.reduce(g, 0))` — fused filter+reduce, returns number.
- `lay(data, A.map(f), A.forEach(g))` — fused map+forEach, returns void/undefined.
- `lay(data, A.filter(f), A.every(g))` — fused, returns boolean.
- `lay(data, A.filter(f), A.some(g))` — fused, returns boolean.
- `lay(data, A.map(f), A.find(g))` — fused, returns `T | undefined`.
- `lay(data, A.filter(f), A.findIndex(g))` — fused, returns `number | undefined`.

### flatMap in fused context

- `lay(data, A.flatMap(x => [x, x]), A.take(4))` — expanding then limiting.
- `lay(data, A.flatMap(x => x > 0 ? [x] : []), A.map(f))` — filtering via flatMap then mapping.
- `lay(data, A.flatMap(x => []))` — collapsing to empty.

### Edge cases

- Empty input: `lay([], A.map(f))` → `[]`.
- No operations: `lay(data)` → `data`.
- Single operation: `lay(data, A.map(f))` → same as `A.map(f)(data)`.
- `take(0)`: `lay(data, A.take(0))` → `[]` (HALT immediately).
- `drop(Infinity)`: `lay(data, A.drop(Infinity))` → `[]`.

### Property-based (fast-check)

- For random arrays and random combinations of fuseable ops: `lay(data, ...ops)` === `pipe(data, ...ops)`.
- This is the ultimate correctness test — if it holds, the fusion engine is correct.

## Acceptance Criteria

- `bun run build` succeeds.
- `bun run test` passes all tests across core, rescript, and stopcock.
- `lay` produces identical results to `pipe` for all tested operation combinations.
- Early termination verified: `lay(largeArray, A.take(5))` does not visit all elements.
- Untagged functions degrade gracefully — never produce incorrect results.
- `lay` exported from `stopcock` barrel.

## Assumptions

- Phase 4a is complete: `dual`, unified package, array wrappers, and all namespace exports exist.
- Tagging `dual` is backwards-compatible — untagged calls behave identically.
- The `_op` and `_fn` properties on data-last functions don't conflict with anything (they're unconventional property names on functions, but JS allows this).
- `flatMap` in a fused context is the most complex case — may need multiple iterations of the fused loop implementation to get right.
- `lay` type overloads mirror `pipe` overloads (1-20 functions) for correct return type inference.
- `HALT` is a module-scoped `Symbol`, not exported. Fusion internals are completely opaque to consumers.
