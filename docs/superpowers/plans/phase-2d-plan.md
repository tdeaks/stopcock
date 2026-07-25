# Phase 2d Implementation Plan: TypeScript Additions

## Summary
- Add 8 function utilities to `packages/core` (identity, always, flip, complement, memoize, once, converge, juxt).
- Lenses and type-safe object access (`path`, `pathOr`, `evolve`) are spec'd for the unified `packages/fp` package — but that package is created in Phase 4a. This plan defers those to Phase 4a, keeping Phase 2d focused on pure `@stopcock/core` additions only.
- All pure TypeScript — these functions lose their generic type signatures through genType, which is why they can't be ReScript.

## Scope Adjustment from Spec

The spec places `path`, `pathOr`, `evolve`, and lenses in `packages/fp/`. That package doesn't exist until Phase 4a scaffolds it. Two options:

1. **Create `packages/fp` early** just for 2d, then Phase 4a adds dual wrappers and namespaces to it.
2. **Defer `path`/`pathOr`/`evolve`/lenses to Phase 4a** and keep 2d scoped to core function utilities only.

This plan takes **option 2**: implement only the 8 function utilities in core. Rationale:
- `path`/`pathOr`/`evolve` need dual wrapping to be pipeable, which requires `dual` from Phase 4a.
- Lenses need pipe integration tests with the full namespace system.
- Creating the unified package scaffold prematurely means Phase 4a has to work around pre-existing structure rather than owning its own setup.
- The function utilities are self-contained in core and immediately usable.

Phase 4a's plan should include the deferred items: `path`, `pathOr`, `evolve`, lenses (7 functions), `PathValue` type, and lens law property tests.

## Implementation Changes

- New source files:
    - `packages/core/src/function.ts` — 8 function utilities
    - `packages/core/src/function.test.ts` — runtime tests
- Modified files:
    - `packages/core/src/index.ts` — re-export all 8 functions
    - `packages/core/src/types.test-d.ts` — type-level assertions for function utilities
- No changes to `turbo.json`, root `package.json`, or `@stopcock/rescript`.

## Functions (8 total)

### identity
```ts
<A>(a: A) => A
```
Returns argument unchanged. Default transform / passthrough in pipelines.

### always
```ts
<A>(a: A) => () => A
```
Thunk factory. `always(42)` returns `() => 42`.

### flip
```ts
<A, B, C>(fn: (a: A, b: B) => C) => (b: B, a: A) => C
```
Swap first two arguments of a binary function.

### complement
```ts
<A>(pred: (a: A) => boolean) => (a: A) => boolean
```
Negate a predicate. `complement(isEven)(3)` → `true`.

### memoize
```ts
<A extends (...args: any[]) => any>(fn: A) => A
```
Cache results by argument. Single-arg: `Map` keyed by argument value. Multi-arg: `Map` keyed by `JSON.stringify(args)`. Not suitable for circular refs or function arguments.

### once
```ts
<A extends (...args: any[]) => any>(fn: A) => A
```
Call underlying function at most once. Subsequent calls return the cached first result regardless of arguments.

### converge
```ts
<A, B>(after: (...args: any[]) => B, fns: Array<(a: A) => any>) => (a: A) => B
```
Apply input to each branching function, pass results as arguments to converging function. `converge(add, [head, last])([1,2,3])` → `4`.

### juxt
```ts
<A>(fns: Array<(a: A) => any>) => (a: A) => any[]
```
Apply input to each function, return array of results. `juxt([Math.min, Math.max])(3)` → `[3, 3]`.

## Implementation Notes

- `identity`: trivial one-liner.
- `always`: returns a closure capturing the value.
- `flip`: returns `(b, a) => fn(a, b)`.
- `complement`: returns `(a) => !pred(a)`.
- `memoize`: uses a `Map`. For single-arg, key is the raw argument. For multi-arg, key is `JSON.stringify(args)`. Check `fn.length` to determine arity, but fall back to stringify for variadic/zero-length functions.
- `once`: uses a `let called = false` flag and cached result in closure.
- `converge`: returns `(a) => after(...fns.map(f => f(a)))`.
- `juxt`: returns `(a) => fns.map(f => f(a))`.

All are pure, no mutation, no side effects (except `memoize`/`once` which maintain internal cache state by design).

## Test Plan

### Runtime tests (`function.test.ts`)

**identity:**
- Returns argument unchanged for primitives and objects.
- Preserves reference identity (`result === input`).

**always:**
- Returned thunk returns the captured value.
- Multiple calls return same value.
- Thunk ignores any arguments passed to it.

**flip:**
- Swaps arguments: `flip(subtract)(3, 10)` = `subtract(10, 3)`.
- Works with string operations: `flip(concat)("world", "hello")`.

**complement:**
- Negates: `complement(isEven)(3)` → `true`, `complement(isEven)(4)` → `false`.

**memoize:**
- Second call with same arg returns cached result (spy verifies fn called once).
- Different arg calls fn again (spy called twice).
- Multi-arg: same args cached, different args call fn.
- Cache works with `undefined`/`null` as arguments.

**once:**
- First call executes fn (spy verifies).
- Subsequent calls return first result (spy not called again).
- Returns first result even when called with different arguments.

**converge:**
- `converge((a, b) => a + b, [x => x - 1, x => x + 1])(5)` → `10`.
- Empty fns array: `converge(after, [])(x)` calls `after()` with no args.

**juxt:**
- `juxt([x => x + 1, x => x * 2])(3)` → `[4, 6]`.
- Empty fns array → `[]`.

### Pipe integration tests (in `function.test.ts`)

- `pipe(value, identity)` — passthrough.
- `pipe(arr, filter(complement(isEven)))` — complement in pipeline.
- `flow(map(double), filter(complement(isNegative)))` — complement in flow.

### Type-level tests (in `types.test-d.ts`)

- `identity` preserves type: `expectTypeOf(identity(42)).toEqualTypeOf<number>()`.
- `always` returns correct thunk type: `expectTypeOf(always("hi")).toEqualTypeOf<() => string>()`.
- `flip` swaps parameter types.
- `complement` returns predicate type.
- `memoize` preserves function signature.
- `once` preserves function signature.

### Acceptance criteria
- `bun run build` emits `function.js` + `function.d.ts` in core's `dist/`.
- `bun run test` passes all tests across core (existing + new) and rescript.
- All 8 functions re-exported from `@stopcock/core` index.
- Type-level tests pass with `--typecheck`.

## Assumptions
- Phases 2a–2c are complete.
- `path`, `pathOr`, `evolve`, and lenses (10 functions total) are deferred to Phase 4a when the unified package is scaffolded.
- `memoize` using `JSON.stringify` for multi-arg cache keys is acceptable — documented limitation for functions/circular refs.
- `converge` and `juxt` use `any[]` in their signatures — tighter overloaded types (for 2-5 branching fns) can be added later if needed but aren't required for Phase 2d.
- No `dual` wrapping needed — these are all standalone utilities or return functions naturally.
