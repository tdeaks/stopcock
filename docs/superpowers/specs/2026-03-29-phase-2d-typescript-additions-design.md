# Phase 2d: TypeScript Additions

## Scope

Pure TypeScript functions that can't go through ReScript due to type system limitations: function utilities in `packages/core`, lenses and type-safe object access in `packages/fp`. TDD throughout.

## Decisions

- **Function utilities in core** — generic HOF combinators that lose their types through genType
- **Lenses as top-level exports** — not namespaced, core FP concept like `pipe` and `flow`
- **`path`/`pathOr` in `Obj` namespace** — convenience shortcuts for reads; lenses for updates
- **`evolve` in `Obj` namespace** — needs TypeScript mapped types for type safety
- **Template literal types for `path`** — `path(user, "address.city")` returns the correct nested type
- **TDD with describe-style nesting** — consistent with all prior phases

## Execution Order

### 1. Function utilities in core

**Files:** `packages/core/src/function.ts`, `packages/core/src/function.test.ts`

8 functions. Re-exported from core's `index.ts`.

#### Functions

- `identity: <A>(a: A) => A` — returns its argument unchanged. Useful as a default transform.
- `always: <A>(a: A) => () => A` — returns a function that always returns the given value. Thunk factory.
- `flip: <A, B, C>(fn: (a: A, b: B) => C) => (b: B, a: A) => C` — swap first two arguments
- `complement: <A>(pred: (a: A) => boolean) => (a: A) => boolean` — negate a predicate. `complement(isEven)` === `isOdd`
- `memoize: <A extends (...args: any[]) => any>(fn: A) => A` — cache results. Single-arg: `Map` keyed by argument value. Multi-arg: `Map` keyed by `JSON.stringify(args)` (pragmatic, handles primitives and plain objects; not suitable for circular refs or functions as args).
- `once: <A extends (...args: any[]) => any>(fn: A) => A` — call underlying function at most once, return cached result thereafter
- `converge: <A, B>(after: (...args: any[]) => B, fns: Array<(a: A) => any>) => (a: A) => B` — apply input to each branching function, pass results to converging function
- `juxt: <A>(fns: Array<(a: A) => any>) => (a: A) => any[]` — apply input to each function, return array of results

#### TDD tests

- `identity`: returns argument unchanged, preserves reference identity for objects
- `always`: returned thunk always returns same value, ignores arguments
- `flip`: swaps arguments, types are correct
- `complement`: negates predicate, true → false, false → true
- `memoize`: second call with same args returns cached result (verify with spy that underlying fn called once), different args call fn again
- `once`: first call executes, subsequent calls return cached result (verify with spy), works with different arguments on subsequent calls (still returns first result)
- `converge`: basic branching and merging, e.g. `converge(add, [head, last])([1,2,3])` → `4`
- `juxt`: applies all functions, returns array of results, empty functions array → `[]`

#### Pipe integration tests

- `pipe(arr, A.filter(complement(isEven)))` — complement in pipeline
- `pipe(value, identity)` — passthrough
- `flow(A.map(double), A.filter(complement(isNegative)))` — complement in flow

### 2. Type-safe object access in unified package

**Files:** `packages/fp/src/object.ts` (additions to existing), `packages/fp/src/object.test.ts`

3 functions added to `Obj` namespace. Pure TypeScript with advanced generic types.

#### path

```ts
path<T, P extends string>(obj: T, path: P): PathValue<T, P>
```

Type-safe deep property access using dot-separated string paths. `PathValue<T, P>` is a recursive template literal type that resolves the nested type:

```ts
type User = { address: { city: string } }
path(user, "address.city")  // returns string
path(user, "address")       // returns { city: string }
```

Returns `undefined` if any segment is missing at runtime. Return type is `PathValue<T, P> | undefined`.

#### pathOr

```ts
pathOr<T, P extends string, D>(obj: T, path: P, defaultValue: D): PathValue<T, P> | D
```

Like `path` but returns `defaultValue` instead of `undefined` when the path doesn't resolve.

#### evolve

```ts
evolve<T>(obj: T, transformations: Partial<{ [K in keyof T]: (v: T[K]) => T[K] }>): T
```

Apply a transformation map to an object. Each key in `transformations` maps to a function that transforms that key's value. Keys not in `transformations` pass through unchanged.

```ts
evolve(user, {
  age: n => n + 1,
  name: s => s.toUpperCase()
})
```

Nested `evolve` for deep transforms:

```ts
evolve(user, {
  address: evolve({ city: s => s.toUpperCase() })
})
```

#### TDD tests

**path:**
- Shallow access: `path(obj, "name")` → value
- Deep access: `path(obj, "address.city")` → nested value
- Missing intermediate: `path(obj, "foo.bar")` → `undefined`
- Missing leaf: `path(obj, "address.zip")` → `undefined`
- Type-level test: `expectTypeOf(path(user, "address.city")).toEqualTypeOf<string | undefined>()`

**pathOr:**
- Existing path returns value (not default)
- Missing path returns default
- Type includes default type

**evolve:**
- Basic transformation of multiple keys
- Untransformed keys pass through unchanged
- Empty transformations → original object (shallow copy)
- Nested evolve for deep transforms
- Type-level test: result has same type as input

#### Dual wrapping

- `path`: arity 2, dual — `pipe(user, Obj.path("address.city"))`
- `pathOr`: arity 3, dual — `pipe(user, Obj.pathOr("address.city", "unknown"))`
- `evolve`: arity 2, dual — `pipe(user, Obj.evolve({ age: inc }))`

### 3. Lenses in unified package

**Files:** `packages/fp/src/lens.ts`, `packages/fp/src/lens.test.ts`

7 functions. Top-level exports (no namespace).

#### Types

```ts
type Lens<S, A> = {
  readonly get: (s: S) => A
  readonly set: (a: A, s: S) => S
}
```

A lens is a pair of getter and setter. This is the van Laarhoven-style simplified to a plain object for clarity and performance.

#### Lens constructors

- `lens: <S, A>(get: (s: S) => A, set: (a: A, s: S) => S) => Lens<S, A>` — create a lens from getter and setter
- `lensProp: <S, K extends keyof S>(key: K) => Lens<S, S[K]>` — lens focused on a single property
- `lensIndex: <A>(index: number) => Lens<A[], A>` — lens focused on an array index
- `lensPath: <S, P extends string>(path: P) => Lens<S, PathValue<S, P>>` — lens focused on a dot-separated path (reuses `PathValue` type from `path`)

#### Lens operations

- `view: <S, A>(lens: Lens<S, A>) => (s: S) => A` — read through the lens
- `set: <S, A>(lens: Lens<S, A>, value: A) => (s: S) => S` — set the focused value, return new structure
- `over: <S, A>(lens: Lens<S, A>, fn: (a: A) => A) => (s: S) => S` — apply function to the focused value, return new structure

#### TDD tests

**Constructors:**
- `lens`: custom getter/setter roundtrip — `view(myLens)(obj)` returns focused value, `set(myLens, newVal)(obj)` returns updated object
- `lensProp`: `lensProp("name")` focuses on name property, get and set work
- `lensIndex`: `lensIndex(0)` focuses on first array element, get and set work, out-of-bounds behaviour
- `lensPath`: `lensPath("address.city")` focuses on nested property, get and set work

**Operations:**
- `view`: reads value through lens
- `set`: returns new object with updated value, original unchanged
- `over`: applies transform to focused value, returns new object

**Lens laws (property-based tests with fast-check):**
1. **Get-Set:** `set(lens, view(lens)(s))(s)` === `s` — setting what you get changes nothing
2. **Set-Get:** `view(lens)(set(lens, a)(s))` === `a` — getting what you set returns what you set
3. **Set-Set:** `set(lens, b)(set(lens, a)(s))` === `set(lens, b)(s)` — setting twice is same as setting once with last value

**Pipe integration:**
- `pipe(user, view(nameLens))` — read in pipeline
- `pipe(user, over(ageLens, inc))` — update in pipeline
- `pipe(user, set(cityLens, "London"))` — set in pipeline
- Compose lenses: `pipe(user, view(lens(view(addressLens), ...)))` — or provide `composeLens` if needed

**Immutability:**
- `set` and `over` return new objects, originals unchanged
- Nested set creates new objects at each level of the path

#### Implementation notes

- `lensProp`: getter is `s => s[key]`, setter uses spread `{ ...s, [key]: value }`
- `lensIndex`: getter is `s => s[index]`, setter copies array and replaces at index
- `lensPath`: splits path string, walks the object for get, reconstructs nested objects for set
- `view`/`set`/`over` are all data-last — they return functions that take the data structure. This makes them naturally pipeable without `dual`.

### 4. Export updates

#### packages/core/index.ts

Add re-exports from `function.ts`: `identity`, `always`, `flip`, `complement`, `memoize`, `once`, `converge`, `juxt`.

#### packages/fp/src/index.ts

- Add `path`, `pathOr`, `evolve` to `Obj` namespace exports
- Add top-level exports: `lens`, `lensProp`, `lensIndex`, `lensPath`, `view`, `set`, `over`

Updated full export list:

```ts
// Core FP
export { pipe, flow, dual, identity, always, flip, complement, memoize, once, converge, juxt } from "@stopcock/core"

// ADTs
export { O, R } from "@stopcock/core"

// Namespaced modules
export { A, S, D, N, B, G, Obj, Logic, M }

// Lenses (top-level)
export { lens, lensProp, lensIndex, lensPath, view, set, over } from "./lens"

// Fusion
export { lay } from "./lay"
```

## Design Constraints

1. Function utilities preserve full generic type signatures — no `unknown` returns
2. `path` uses template literal types for compile-time path validation
3. Lenses satisfy all three lens laws (verified with property-based tests)
4. `set` and `over` are immutable — always return new structures
5. Lenses are top-level exports, not namespaced
6. `path`/`pathOr`/`evolve` are in `Obj` namespace
7. No mutation of input data anywhere
8. Minimal comments — only *why*, never *what*
