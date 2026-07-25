# Phase 1: Root Config + packages/core

## Scope

Root monorepo scaffolding and the pure TypeScript core package (`@stopcock/core`): pipe, flow, Option, Result, and shared types. TDD throughout — tests first, describe-style nesting, property-based tests for algebraic laws.

## Decisions

- **Bun** as package manager (workspaces in root `package.json`)
- **Vitest** for testing (`@fast-check/vitest` for property-based tests)
- **Turborepo** for build orchestration
- All 20 overloads for pipe and flow
- Describe-style test nesting (`describe` → `describe` → `it`)
- Named exports + `O`/`R` namespace exports from core

## Execution Order

### 1. Root Scaffolding

**Files:** `package.json`, `turbo.json`, `tsconfig.base.json`

- Root `package.json`: private, `"type": "module"`, Bun workspaces (`"workspaces": ["packages/*"]`)
- DevDependencies: `typescript`, `vitest`, `turbo`, `fast-check`, `@fast-check/vitest`
- `turbo.json`: full build pipeline (wasm → rescript → core → unified) so it doesn't need changing later. Only core exists in Phase 1.
- `tsconfig.base.json`: ES2022 target, ESNext modules, bundler module resolution, strict, declarations + source maps

No `pnpm-workspace.yaml` — Bun workspaces use `package.json`.

### 2. Core Package Setup

**Files:** `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`

- `@stopcock/core`: `"type": "module"`, zero runtime dependencies
- tsconfig extends `../../tsconfig.base.json`, compiles `src/` to `dist/`
- vitest config: points at `src/**/*.test.ts`
- Tests co-located with source (`pipe.test.ts` alongside `pipe.ts`)

Checkpoint: a passing empty test proves the toolchain works before TDD begins.

### 3. types.ts

**File:** `packages/core/src/types.ts`

Shared type utilities:

- `Fn<A, B>` — `(a: A) => B`
- `LazyValue<A>` — `() => A` (used in `getOrElse` defaults)

~10-15 lines, type definitions only, no runtime code. Type-level tests via `expectTypeOf` in vitest.

### 4. pipe.ts + flow.ts

**Files:** `packages/core/src/pipe.ts`, `packages/core/src/pipe.test.ts`, `packages/core/src/flow.ts`, `packages/core/src/flow.test.ts`

#### pipe.ts

- 20 overloads: `pipe(a, f1)` through `pipe(a, f1, ...f20)`
- Each overload threads the return type of one function into the input of the next
- Runtime: single function, `for` loop over rest args. No `arguments` object, no `reduce`.

#### flow.ts

- 20 overloads: `flow(f1)` through `flow(f1, ...f20)`
- Same type threading, returns a composed function instead of executing
- Runtime: returns a function that runs the same `for` loop

#### TDD tests (write first)

- Passthrough: `pipe(1, x => x)` → `1`
- Type threading: `pipe("hello", s => s.length, n => n > 3)` → `true`
- All 20 arities compile and run
- `flow` equivalence: `flow(f, g)(x)` === `pipe(x, f, g)`
- Property: `pipe(x, f, g)` === `g(f(x))` for arbitrary functions

### 5. option.ts

**Files:** `packages/core/src/option.ts`, `packages/core/src/option.test.ts`

#### Types

```
None  = { readonly _tag: 0 }           // singleton — one allocation ever
Some<A> = { readonly _tag: 1; readonly value: A }
Option<A> = None | Some<A>
```

Numeric `_tag` for faster branch prediction.

#### Functions (16, all curried, data-last)

`some`, `none`, `fromNullable`, `fromPredicate`, `isSome`, `isNone`, `map`, `flatMap`, `getOrElse`, `getWithDefault`, `match`, `filter`, `toNullable`, `toUndefined`, `toResult`, `tap`

#### TDD tests (write first)

- Constructors: `some(1)` has `_tag: 1`, `none` is singleton (`none === none`)
- `fromNullable`: `null | undefined` → `None`, value → `Some`
- `fromPredicate`: predicate false → `None`, true → `Some`
- `map` / `flatMap` / `filter` are no-ops on `None`
- `getOrElse`: returns value for `Some`, evaluates lazy `() => A` default for `None`
- `getWithDefault`: returns value for `Some`, returns strict `A` default for `None`
- `toResult`: `Some(a)` → `Ok(a)`, `None` → `Err(defaultError)`
- `tap`: calls side-effect for `Some`, skips for `None`, returns original
- Pipeable: `pipe(some(5), map(n => n + 1), getOrElse(() => 0))` → `6`

#### Property-based tests (fast-check)

- Functor identity: `map(x => x)` roundtrips
- Functor composition: `map(f ∘ g)` === `map(g)` then `map(f)`
- Monad left identity: `flatMap(f)(some(a))` === `f(a)`
- Monad right identity: `flatMap(some)(m)` === `m`
- Monad associativity

### 6. result.ts

**Files:** `packages/core/src/result.ts`, `packages/core/src/result.test.ts`

#### Types

```
Ok<A>  = { readonly _tag: 1; readonly value: A }
Err<E> = { readonly _tag: 0; readonly error: E }
Result<A, E> = Ok<A> | Err<E>
```

#### Functions (14, all curried, data-last)

`ok`, `err`, `isOk`, `isErr`, `map`, `mapErr`, `flatMap`, `getOrElse`, `match`, `toOption`, `tryCatch`, `fromNullable`, `tap`, `tapErr`

#### TDD tests (write first)

- Constructors: `ok(1)` has `_tag: 1`, `err("fail")` has `_tag: 0`
- `map` / `flatMap` are no-ops on `Err`
- `mapErr` transforms `Err`, no-op on `Ok`
- `tryCatch`: throwing fn → `Err`, normal fn → `Ok`
- `fromNullable`: `null | undefined` → `Err(default)`, value → `Ok`
- `toOption`: `Ok(a)` → `Some(a)`, `Err` → `None`
- `tap` / `tapErr`: call side-effect for respective variant, return original
- `getOrElse`: returns value for `Ok`, evaluates lazy default for `Err`
- Pipeable: `pipe(ok(10), map(n => n * 2), getOrElse(() => 0))` → `20`

#### Property-based tests (fast-check)

- Functor identity and composition laws
- Monad left/right identity and associativity
- `toOption` consistency: `ok(a) |> toOption` === `some(a)`

**Dependency:** `toOption` imports from `option.ts` — this is why Option is implemented first.

### 7. index.ts

**File:** `packages/core/src/index.ts`

Re-export barrel:

- All types and functions from `pipe.ts`, `flow.ts`, `types.ts`
- All from `option.ts` as named exports + `O` namespace
- All from `result.ts` as named exports + `R` namespace

No logic, no tests.

## Design Constraints (from main spec)

1. All public functions curried and data-last
2. Numeric `_tag` on ADTs (0 or 1, not strings)
3. Singleton `None` — one object reference
4. No `arguments` object anywhere
5. Pre-allocate arrays when output size is known
6. No intermediate arrays in fused pipelines
7. Minimal comments — only *why*, never *what*
8. Write code like a human — terse, production-grade, no LLM tells
