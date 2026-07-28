# @stopcock/fp-compiler

Optional build-time lowering for portable `@stopcock/fp` pipelines. The
compiler recognizes imported `pipe`, `flow`, and `compile` calls plus array
operators from `@stopcock/fp/array`, then replaces compatible chains with
checked-in loop templates. It does not use runtime evaluation.

```bash
bun add @stopcock/fp
bun add -d @stopcock/fp-compiler
```

`@stopcock/fp` 2.x is a peer dependency. The compiler package is ESM-only and
supports Node.js 22 or newer.

## Build-tool plugin

The host-specific entries are the shortest setup and need no options:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { stopcockFp } from '@stopcock/fp-compiler/vite'

export default defineConfig({
  plugins: [stopcockFp()],
})
```

Equivalent named adapters are exported from `@stopcock/fp-compiler/rollup` and
`/esbuild`. The root `stopcockFp` Unplugin instance remains available when one
configuration must target several hosts: it exposes `.vite(...)`,
`.rollup(...)`, and `.esbuild(...)`, plus unplugin's own built-in `.webpack(...)`
and `.rspack(...)` adapters. The release suite builds and executes a real
fixture through the three adapters we ship a dedicated entry for, then repeats
that matrix from the SHA-256-addressed extraction of the packed compiler
tarball. Webpack and Rspack are not part of that suite: unplugin's built-in
adapters may work, but we do not test or maintain them here. Re-add a
dedicated adapter only on real demand.

For release builds, `diagnostics: 'summary'` prints fused and skipped pipeline
counts plus the static coverage percentage. Use `diagnostics: 'error'` to make
any recognized fallback—including a deferred `flow` or `compile` site—a build
failure.

The transform understands namespace, named, aliased, and custom wrapper-package
imports. Lexically shadowed bindings are left untouched. Exact semantics are
the default. `assumePure: true` permits only documented pure execution
rewrites; it still evaluates every argument expression exactly once, and a
residual or otherwise non-fully-lowered site still constructs the real
operator factory too (see "Tier-preserving lowering" below for the exact
construction-elision contract).

## Options

| Option                 | Purpose                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `include`              | Files the plugin may transform. Defaults to `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, and `.cts`.                     |
| `exclude`              | Files the plugin must ignore. Defaults to `node_modules`.                                                                         |
| `importSources`        | Package roots that export `pipe`, `flow`, and `compile`. Defaults to `@stopcock/fp`.                                              |
| `arrayImportSources`   | Exact package entries that export array operators. Derived as `${importSource}/array` by default.                                 |
| `compileImportSources` | Specialist entries that export `compile` and `compilePure`. Derived as `${importSource}/compile` in addition to the package root. |
| `assumePure`           | Enables proven pure execution rewrites. Argument expressions still evaluate exactly once; operator construction stays observable only at a residual or otherwise non-fully-lowered site. |
| `diagnostics`          | `false`, `summary`, `verbose`, or `error`. Defaults to `false`.                                                                   |

`diagnostics: 'error'` fails the transform when a recognized pipeline cannot
be lowered. Other modes leave unsupported sites unchanged; `verbose` reports
each site and `summary` reports transformed-file totals.

## Supported pipelines

This release lowers statically imported array pipelines composed from:

- element steps: `map`, `filter`, `reject`, `filterMap`, `mapWhile`,
  `flatMap`, `take`, `takeUntil`, `drop`, `takeWhile`, and `dropWhile`;
- full-array boundaries: `sort`, `sortBy`, `sortAsc`, `sortDesc`, `reverse`,
  `uniq`, `tail`, `init`, `flatten`, `scan`, and `without`;
- terminals: `sum`, `count`, `reduce`, `forEach`, `find`, `findIndex`,
  `findMap`, `every`, `some`, `none`, `head`, `last`, `length`, `isEmpty`,
  `join`, `min`, and `max`.

Terminal operators must be last. The compiler preserves argument evaluation
order, lexical bindings, thrown errors, the canonical `Option.none` singleton,
runner-construction timing, reusable reducer seeds, and array semantics for
accepted sites.

### Tier-preserving lowering

The compiler preserves the execution tier selected by the public import:

| Source                         | Recognized facade exports                                      | Compiled layout / fallback |
| ------------------------------ | -------------------------------------------------------------- | -------------------------- |
| `@stopcock/fp`                 | `pipe`, `flow`                                                 | sequential stages          |
| `@stopcock/fp/compile`         | `compile`, `compilePure`                                       | compact fusion             |
| `@stopcock/fp/fusion`          | `pipe`, `fusedPipe`, `flow`, `fusedFlow`, `compile`            | compact fusion             |
| `@stopcock/fp-optimizer`       | `pipe`, `fusedPipe`, `flow`, `fusedFlow`, `compile`, `compilePure` | optimized fusion        |
| configured wrapper source      | configured facade exports                                      | declared tier or visible compiler fallback |

Root `pipe` therefore keeps stage-by-stage callback order and materialization.
Explicit fusion and optimizer imports keep their interleaved/early-exit
semantics for eligible shapes. Root sequential `take` and `drop` stages retain
their native stage-by-stage behavior, including dynamic and coercible counts.
For compact or optimized fusion, the compiler lowers `take` and `drop` only
when the count expression is statically known to produce a primitive number;
the emitted loop applies the same one-time quota normalization as the runtime.
Dynamic or coercible fused counts stay on the source-selected runtime fallback.
`dropWhile` remains eligible in both layouts, and fused `take` keeps the
established one-item lookahead at its lexical position. An unsafe or
unsupported site never silently changes runtime tier.

Every accepted site is first represented as a versioned static Plan IR whose
ordered captures, generated S2 operator facts, boundaries, terminal, semantic
mode, and source tier are authoritative for emission. Every argument
expression passed to an operator still evaluates exactly once, in its original
order, at its original construction point, including in pure mode. A
side-effectful argument such as `A.take(computeCount())` still runs
`computeCount()`, and a callback expression such as `A.map(makeCallback())`
still runs `makeCallback()`. What happens to the operator factory call itself
depends on whether the site is fully lowered. At a **fully-lowered static
site** (every step compiled, with no residual), the factory call is elided:
`A.map`/`A.take`/etc. are never invoked, so their caches, provenance,
inherited setters, and thrown errors are never observable, only the argument
evaluation is. At a **residual, dynamic, or boundary/step-vector retained
site**, the factory call remains fully observable: it still runs for real,
exactly once at its original construction point, with its caches, provenance,
inherited setters, and thrown errors intact, because the real construction
result is genuinely used. The generated execution loop does not retain a root
dispatcher, compiler, fusion planner, or optimizer engine. Retained
construction leaves may remain because their observable JavaScript behavior
is part of the source program.

`compilePure` and `assumePure: true` may remove per-element work only for a
proven rewrite. This release includes `map ... map -> length` callback
elision. `sort -> take` always performs the full sort boundary; the unsafe
bounded top-k shortcut is not retained, and any following `take` uses the
selected tier's ordinary semantics. Dynamic step factories, spread arguments,
unsupported operators, direct `eval`, ambiguous imports, and unsafe expression
contexts remain visible runtime calls.

## Programmatic transform

```ts
import { callbackArity, transformStopcockPipelines } from '@stopcock/fp-compiler'

const result = transformStopcockPipelines(source, 'example.ts', {
  diagnostics: 'error',
})

console.log(result.code)
console.log(result.diagnostics)
console.log(callbackArity('map')) // 1
```

Unsupported or semantically unsafe sites remain ordinary FP calls unless
`diagnostics: 'error'` requests a fail-closed build. Parser failures in files
that contain configured Stopcock imports also fail closed in error mode.
Source maps and per-site diagnostics identify every transformed or skipped
pipeline.

`callbackArity(name)` exposes the checked-in operator metadata used by the
transform and returns `undefined` for an unknown or unsupported name. It is
useful when writing a custom host adapter.

## `stopcock check`

The package ships a `stopcock` bin with one subcommand. `stopcock check`
dry-runs the transform over your project's source files and reports which
pipeline sites compiled and which bailed. It never writes transformed code
back to disk.

```bash
stopcock check
stopcock check --strict
stopcock check --strict src
```

| flag        | meaning                                    |
| ----------- | ------------------------------------------- |
| `--strict`  | exit 1 when any site bailed                 |
| directory   | project root to scan; defaults to cwd       |

Output is a table of `file:line:column  compiled|bailed  op  reason` rows
followed by a summary line (`N sites compiled, M bailed`). Exit `0` unless
`--strict` is given and at least one site bailed, in which case exit `1`.
Exit `2` means the arguments were invalid.

## Development contract

The compiler snapshots public array operator metadata so its published
runtime never imports private `@stopcock/fp` internals. Regenerate that
snapshot after registry changes:

```bash
bun run --cwd packages/fp-compiler generate:ops
```

The release gate runs strict source and TS7 public-type checks, semantic
fixtures, source-map and diagnostic tests, real-host builds, and an isolated
packed consumer under Bundler and NodeNext module resolution.
