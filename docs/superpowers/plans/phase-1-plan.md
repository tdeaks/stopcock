# Phase 1 Implementation Plan: Root Scaffolding + `@stopcock/core`

## Summary
- This is a greenfield implementation: the repo currently contains docs only, so Phase 1 should scaffold the root workspace and a single publishable `@stopcock/core` package.
- Follow the Phase 1 spec strictly: Bun workspaces, Vitest, Turborepo, and the core modules only. Defer later amendments such as `dual`, tagged `dual`, subpath exports, and non-core packages.

## Implementation Changes
- Root scaffold:
    - Create root `package.json` (`private: true`, `"type": "module"`), `turbo.json`, and `tsconfig.base.json`; do not add `pnpm-workspace.yaml`.
    - Root scripts: `build` = `turbo run build`, `test` = `turbo run test`.
    - Use Bun workspaces with `["packages/*"]`; add root devDependencies `typescript`, `vitest`, `turbo`, `fast-check`, and `@fast-check/vitest`.
    - Use the current Turbo `tasks` config, not legacy `pipeline`; define the full build pipeline across all packages (wasm → rescript → core → unified) so it doesn't need changing later — only core exists in Phase 1. Define `test` to depend on `^build`.
- Core package scaffold:
    - Create `@stopcock/core` as the only workspace package: `"type": "module"`, zero runtime dependencies, `dist/` build output, and an `exports` map for `"."` only.
    - Package scripts: `build` = `tsc -p tsconfig.json`, `test` = `vitest run --config vitest.config.ts --typecheck`, `test:watch` = `vitest --config vitest.config.ts --typecheck`.
    - `vitest.config.ts`: include `src/**/*.test.ts` and `src/**/*.test-d.ts`.
    - `tsconfig.json` extends `../../tsconfig.base.json`, compiles `src/` to `dist/`.
    - `tsconfig.base.json`: ES2022 target, ESNext modules, bundler module resolution, strict, declarations + source maps.
    - Keep tests co-located in `src/`; runtime tests use `*.test.ts`, type-only tests use `*.test-d.ts`, and build config excludes both from emitted `dist/`.
    - Use describe-style test nesting (`describe` → `describe` → `it`).
    - Add a temporary `smoke.test.ts` first to prove install + test wiring before TDD on library code.
- Core modules:
    - `types.ts`: define only `Fn<A, B>` and `LazyValue<A>`, with type assertions in `types.test-d.ts`.
    - `pipe.ts`: implement 1-20 function overloads (no 0-arity identity overload — `pipe(a)` is not in spec); one runtime body with a plain `for` loop over rest params. No `reduce`, no `arguments` object.
    - `flow.ts`: implement 1-20 function overloads; return a composed function with the same plain-loop execution model instead of delegating to `pipe`. No `reduce`, no `arguments` object.
    - `option.ts`: export `none` as a singleton constant, `some` and `fromNullable` as direct lifters, `fromPredicate(predicate)(value)` as a curried lifter, `isSome` and `isNone` as type guards, and operators `map`, `flatMap`, `filter`, `getOrElse`, `getWithDefault`, `match`, `toNullable`, `toUndefined`, `toResult`, `tap` — all curried, data-last (16 functions total).
    - `result.ts`: export `ok` and `err` as direct constructors, `tryCatch(thunk)` as a direct lifter returning `Result<A, unknown>`, `fromNullable(defaultError)(value)` as a curried lifter, `isOk` and `isErr` as type guards, and all existing-Result operators as data-last functions. `flatMap` widens error types by union when the mapper returns a different `E`.
    - Break the Option/Result dependency cycle intentionally: `Option.toResult` should use a type-only `Result` import and tagged object literals; `Result.toOption` may import `some` and `none` from `option.ts`.
    - Implement in TDD order: `types`, `pipe`, `flow`, `option` except `toResult`, `result`, then backfill `Option.toResult`, then `index.ts`.
- Barrel exports:
    - `index.ts` re-exports `pipe`, `flow`, `Fn`, `LazyValue`, all named Option/Result APIs, and namespace exports `O` and `R`.
    - Keep `index.ts` logic-free and untested.

## Public API
- `Option<A>`:
    - `None = { readonly _tag: 0 }`, `Some<A> = { readonly _tag: 1; readonly value: A }`, `Option<A> = None | Some<A>`.
    - `match(onNone, onSome)` returns a data-last function; `getOrElse(() => fallback)` is lazy; `getWithDefault(fallback)` is strict; `toResult(defaultError)` uses a strict error value.
- `Result<A, E>`:
    - `Ok<A> = { readonly _tag: 1; readonly value: A }`, `Err<E> = { readonly _tag: 0; readonly error: E }`, `Result<A, E> = Ok<A> | Err<E>`.
    - `match(onErr, onOk)` returns a data-last function; `getOrElse(() => fallback)` is lazy and zero-argument; `tryCatch(thunk)` captures thrown values as `unknown`; `flatMap` widens error types by union when the mapper returns a different `E`.
- Type testing strategy:
    - Use `*.test-d.ts` for overload/threading and guard-narrowing assertions so Vitest typechecks them cleanly with `--typecheck`.

## Test Plan
- Toolchain checkpoint: `bun install`, then `bun run test` passes with the smoke test.
- Composition runtime tests:
    - `pipe` identity and threaded transforms, 20-arity runtime coverage, and property `pipe(x, f, g) === g(f(x))`.
    - `flow` 1-20 arities, type threading, and equivalence `flow(f, g)(x) === pipe(x, f, g)`.
- ADT runtime tests:
    - Option constructors, singleton `none`, nullable/predicate lifting, no-op behavior on empty cases, strict vs lazy fallbacks, `tap` reference preservation, `toResult`, and pipeability.
    - Result constructors, `map`/`mapErr`/`flatMap`, `tryCatch`, `fromNullable`, `toOption`, `tap`/`tapErr`, `getOrElse`, and pipeability.
- Property-based tests:
    - Use `@fast-check/vitest` `test.prop` for Option/Result functor identity/composition, monad left identity, right identity, and associativity on primitive arbitraries, and `toOption` consistency: `ok(a) |> toOption === some(a)`.
- Type-only tests:
    - `Fn`/`LazyValue` aliases, `pipe`/`flow` overload inference, `isSome`/`isNone`/`isOk`/`isErr` narrowing, namespace export shapes `O` and `R`.
- Acceptance criteria:
    - `bun run build` emits a clean `dist/` for `@stopcock/core`.
    - `bun run test` runs both runtime suites and `*.test-d.ts` type checks.
    - The published surface is only the root `@stopcock/core` entry with named exports plus `O` and `R` namespaces.

## Assumptions
- Strict Phase 1 scope is locked in: do not implement `dual`, tagged `dual`, subpath exports, `packages/rescript`, `packages/wasm`, `packages/fp`, `benchmarks`, `examples`, README work, CI, or linting in this phase.
- Root workspaces stay as `["packages/*"]` exactly, even though later phases will need a workspace change for `benchmarks`.
- `@stopcock/core` exposes `"."` only in this phase; later docs that import `@stopcock/core/option` or `@stopcock/core/result` require a follow-up package export change.
- Tooling defaults were validated against current official docs: [Bun workspaces](https://bun.sh/docs/pm/workspaces), [Turborepo tasks](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks), [Vitest config](https://vitest.dev/config/), [Vitest type testing](https://vitest.dev/guide/testing-types), and [@fast-check/vitest](https://fast-check.dev/docs/ecosystem/).
