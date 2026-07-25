# Phase 2c: Extended ReScript Functions

## Scope

Additional ReScript modules for Ramda-level function coverage: Array.res additions (17 functions including set operations), Object.res (7 functions), Logic.res (9 functions), Math.res (9 functions). Same TDD-against-generated-JS pipeline as Phase 2a/2b.

`path`, `pathOr`, and `evolve` are **not** in this phase — they move to the unified TypeScript package (Phase 2d) for type-safe deep access. Function utilities and lenses also deferred to Phase 2d.

## Decisions

- **TDD against generated JS** — consistent with Phase 2a/2b
- **Data-first exports** — dual wrapping deferred to Phase 4a
- **Set operations use true set semantics** — results are deduped, not Ramda-style
- **Math ops are data-last friendly** — `divide(divisor)(data)` = `data / divisor`, `subtract(n)(data)` = `data - n`. Breaks from Ramda but intuitive in pipes.
- **Belt for hot-path array internals** — same as Phase 2a
- **Core for everything else**

## Execution Order

### 1. Array.res additions

17 new functions added to the existing `Array.res` module.

#### Array manipulation

- `partition: (array<'a>, 'a => bool) => (array<'a>, array<'a>)` — split into [matches, non-matches]
- `adjust: (array<'a>, int, 'a => 'a) => array<'a>` — apply function at index, return new array
- `update: (array<'a>, int, 'a) => array<'a>` — replace element at index, return new array
- `insert: (array<'a>, int, 'a) => array<'a>` — insert element at index, shift rest right
- `remove: (array<'a>, int, int) => array<'a>` — remove `count` elements starting at index
- `aperture: (array<'a>, int) => array<array<'a>>` — sliding windows of size n (similar to `slidingWindow` — alias or replace)

#### Array generation

- `range: (int, int) => array<int>` — `range(1, 5)` → `[1, 2, 3, 4]` (exclusive end)
- `repeat: ('a, int) => array<'a>` — `repeat("x", 3)` → `["x", "x", "x"]`
- `times: (int => 'a, int) => array<'a>` — `times(i => i * 2, 3)` → `[0, 2, 4]`
- `unfold: ('b => option<('a, 'b)>, 'b) => array<'a>` — generate array from seed until None

#### Array combinators

- `scan: (array<'a>, ('b, 'a) => 'b, 'b) => array<'b>` — like reduce but returns all intermediate accumulator values
- `xprod: (array<'a>, array<'b>) => array<('a, 'b)>` — cartesian product
- `transpose: array<array<'a>> => array<array<'a>>` — transpose rows/columns

#### Set operations (true set semantics — results are deduped)

- `intersection: (array<'a>, array<'a>) => array<'a>` — elements in both
- `union: (array<'a>, array<'a>) => array<'a>` — elements in either, deduped
- `difference: (array<'a>, array<'a>) => array<'a>` — elements in first but not second
- `symmetricDifference: (array<'a>, array<'a>) => array<'a>` — elements in one but not both

#### TDD tests

**Manipulation:**
- `partition`: empty array → `([], [])`, all match → `([all], [])`, none match → `([], [all])`, mixed
- `adjust`: in-bounds index, out-of-bounds (return unchanged), negative index
- `update`: in-bounds, out-of-bounds (return unchanged), negative index
- `insert`: at start, middle, end, out-of-bounds
- `remove`: basic removal, count exceeds remaining (clamp), index out-of-bounds

**Generation:**
- `range`: `range(0, 0)` → `[]`, `range(1, 5)` → `[1,2,3,4]`, `range(5, 1)` → `[]` (no descending — empty)
- `repeat`: `repeat("x", 0)` → `[]`, basic case
- `times`: `times(f, 0)` → `[]`, index passed correctly
- `unfold`: basic fibonacci-style generation, immediate None → `[]`

**Combinators:**
- `scan`: empty → `[initial]`, accumulation values correct
- `xprod`: empty arrays, basic product, result length = len1 * len2
- `transpose`: square matrix, ragged arrays (fill with undefined or truncate — decision: truncate to shortest row)

**Set operations:**
- `intersection`: disjoint → `[]`, overlapping, identical arrays, empty arrays, result is deduped
- `union`: disjoint (concatenated deduped), overlapping, empty arrays
- `difference`: `difference([1,2,3], [2,3,4])` → `[1]`, empty arrays, identical → `[]`
- `symmetricDifference`: `symmetricDifference([1,2,3], [2,3,4])` → `[1,4]`

#### Implementation notes

- `partition`: single pass, push to two result arrays
- `adjust`/`update`/`insert`: copy array, modify at index. Pre-allocate.
- `range`: pre-allocate `Belt.Array.makeUninitializedUnsafe(end - start)`
- `repeat`/`times`: pre-allocate to known size
- `unfold`: `while` loop with `ref`, push to result (size unknown)
- Set operations: build lookup with `Belt.HashSet` or `Js.Dict` for O(n) performance, not nested loops
- `transpose`: pre-allocate based on shortest row length
- `scan`: pre-allocate to `length + 1` (includes initial)

#### Note on aperture vs slidingWindow

Phase 2a defines `slidingWindow`. Ramda calls this `aperture`. These are the same function. Keep `slidingWindow` as the name (more descriptive), add `aperture` as an alias.

### 2. Object.res (new module)

7 functions for typed object manipulation. Operates on ReScript records/Js.t objects.

#### Functions (all data-first)

- `pick: (Js.t<'a>, array<string>) => Js.t<'b>` — new object with only specified keys
- `omit: (Js.t<'a>, array<string>) => Js.t<'b>` — new object without specified keys
- `assoc: (Js.t<'a>, string, 'b) => Js.t<'c>` — return new object with key set to value
- `dissoc: (Js.t<'a>, string) => Js.t<'b>` — return new object without specified key
- `mergeDeepLeft: (Js.t<'a>, Js.t<'a>) => Js.t<'a>` — recursive merge, first object wins on conflict
- `mergeDeepRight: (Js.t<'a>, Js.t<'a>) => Js.t<'a>` — recursive merge, second object wins on conflict
- `mergeWith: (Js.t<'a>, Js.t<'a>, ('b, 'b) => 'b) => Js.t<'a>` — merge with custom conflict resolver

**Note:** ReScript's type system doesn't track object shapes as precisely as TypeScript. genType output for these will use broad types. Phase 4a's TypeScript wrappers will add narrower generic signatures using `Pick<T, K>`, `Omit<T, K>`, etc.

#### TDD tests

- `pick`: basic key selection, keys that don't exist (ignored), empty keys array → `{}`
- `omit`: basic key removal, keys that don't exist (ignored), empty keys array → original
- `assoc`: add new key, overwrite existing key
- `dissoc`: remove existing key, remove non-existent key (return unchanged)
- `mergeDeepLeft`/`mergeDeepRight`: flat objects, nested objects, conflict resolution direction
- `mergeWith`: custom resolver called on conflicts, non-conflicting keys pass through

#### Implementation notes

- `pick`/`omit`: iterate keys, build new object with `Js.Dict.set`
- `assoc`/`dissoc`: shallow copy via `Js.Obj.assign`, then set/delete
- `mergeDeep*`: recursive function, check if value is object before recursing
- No mutation of input objects — always return new objects

### 3. Logic.res (new module)

9 functions for predicate composition and conditional logic.

#### Functions (all data-first)

- `equals: ('a, 'a) => bool` — deep structural equality (ReScript `==`)
- `defaultTo: ('a, option<'a>) => 'a` — unwrap option with default (similar to `getWithDefault` but for general use)
- `when: ('a, 'a => bool, 'a => 'a) => 'a` — if predicate true, apply transform; otherwise return unchanged
- `unless: ('a, 'a => bool, 'a => 'a) => 'a` — if predicate false, apply transform; otherwise return unchanged
- `cond: (array<('a => bool, 'a => 'b)>, 'a) => option<'b>` — first matching predicate's transform is applied, None if no match
- `both: ('a => bool, 'a => bool) => 'a => bool` — combined predicate: both must be true
- `either: ('a => bool, 'a => bool) => 'a => bool` — combined predicate: at least one true
- `allPass: (array<'a => bool>) => 'a => bool` — all predicates must pass
- `anyPass: (array<'a => bool>) => 'a => bool` — at least one predicate passes

#### TDD tests

- `equals`: primitives, nested objects, arrays, `null`/`undefined`
- `defaultTo`: Some → value, None → default
- `when`: predicate true → transformed, predicate false → unchanged
- `unless`: predicate false → transformed, predicate true → unchanged
- `cond`: first match wins, no match → None, empty conditions → None
- `both`/`either`: truth table combinations
- `allPass`/`anyPass`: empty array edge case (`allPass([])` → always true, `anyPass([])` → always false), mixed pass/fail

#### Implementation notes

- `both`/`either` return a new function — plain lambda in ReScript
- `allPass`/`anyPass`: `while` loop with early termination
- `cond`: `while` loop through conditions, break on first match
- `when`/`unless`: simple ternary

### 4. Math.res (new module)

9 functions. Pointfree arithmetic for use in pipes. **Data-last friendly semantics** — `subtract(3)` means "subtract 3", not "subtract from 3".

#### Functions (all data-first)

- `add: (float, float) => float` — `add(a, b)` = `a + b`
- `subtract: (float, float) => float` — `subtract(a, b)` = `a - b`. Data-last: `subtract(3)(10)` = `10 - 3` = `7`
- `multiply: (float, float) => float` — `multiply(a, b)` = `a * b`
- `divide: (float, float) => float` — `divide(a, b)` = `a / b`. Data-last: `divide(2)(10)` = `10 / 2` = `5`
- `modulo: (float, float) => float` — `modulo(a, b)` = `a mod b`. Data-last: `modulo(3)(10)` = `10 mod 3` = `1`
- `inc: float => float` — `n + 1`
- `dec: float => float` — `n - 1`
- `negate: float => float` — `-n`
- `product: array<float> => float` — multiply all elements

**Data-last semantic note:** For binary ops, the data-first form is `op(data, operand)`. The data-last form is `op(operand)` which returns `(data) => op(data, operand)`. This means:

```
pipe(10, N.subtract(3))     → subtract(10, 3) → 10 - 3 = 7 ✓
pipe(10, N.divide(2))       → divide(10, 2)   → 10 / 2 = 5 ✓
pipe(10, N.modulo(3))       → modulo(10, 3)   → 10 % 3 = 1 ✓
```

The dual wrapper in Phase 4a handles this automatically — `dual(2, fn)` means data-first is `fn(data, operand)`.

#### TDD tests

- `add`/`subtract`/`multiply`/`divide`: basic arithmetic, negative numbers, zero
- `divide`: division by zero → `Infinity` (JS semantics, no throw)
- `modulo`: basic cases, negative dividend
- `inc`/`dec`: basic, floating point
- `negate`: positive → negative, negative → positive, zero → zero
- `product`: empty array → 1 (multiplicative identity), single element, multiple elements, includes zero

#### Implementation notes

All trivial — single arithmetic operations. `product` is a `for` loop accumulator.

## Phase 4a Amendments

### New namespace: `Obj`

Object functions get namespace `Obj` (not `O` — that's Option).

```ts
import { pipe, A, N, Obj, Logic } from "stopcock"
```

Updated namespace list: `A`, `S`, `D`, `N`, `B`, `O`, `R`, `G`, `Obj`, `Logic`, `Math` (or `M`?)

**Decision:** Use `M` for Math to keep namespaces short. `Logic` stays full — `L` conflicts with potential `Lens` namespace in Phase 2d. Full list:

`A`, `S`, `D`, `N`, `B`, `O`, `R`, `G`, `Obj`, `Logic`, `M`

### TypeScript type narrowing for Object.res

Phase 4a wrappers for `pick`/`omit`/`assoc`/`dissoc` add TypeScript generics:

```ts
pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>
omit<T, K extends keyof T>(obj: T, keys: K[]): Omit<T, K>
```

The ReScript runtime does the work; TypeScript adds the type narrowing.

### Dual wrapping for new functions

All new functions follow the same `dual` pattern from Phase 4a. Arity reference:

**Array additions:**
- Standalone generators (no dual — no data argument): `range`, `repeat`, `times`, `unfold`
- Arity 1 (no dual): `transpose`
- Arity 2: `partition`, `aperture`, `intersection`, `union`, `difference`, `symmetricDifference`
- Arity 3: `adjust`, `update`, `insert`, `scan`, `remove`

**Object:**
- Arity 2: `pick`, `omit`, `dissoc`, `mergeDeepLeft`, `mergeDeepRight`
- Arity 3: `assoc`, `mergeWith`

**Logic:**
- Arity 1 (no dual): `both`, `either`, `allPass`, `anyPass` (return predicates, no data arg)
- Arity 2: `equals`, `defaultTo`
- Arity 3: `when`, `unless`, `cond`

**Math:**
- Arity 1 (no dual): `inc`, `dec`, `negate`, `product`
- Arity 2: `add`, `subtract`, `multiply`, `divide`, `modulo`

## Design Constraints

1. ReScript exports data-first only — dual wrapping in Phase 4a
2. All exported functions annotated with `@genType`
3. Set operations use true set semantics (deduped results)
4. Math binary ops: data-first is `op(data, operand)` — intuitive in pipes
5. No mutation of input data — always return new arrays/objects
6. `aperture` is an alias for `slidingWindow`
7. `transpose` truncates to shortest row
8. GenType output verified after each module
