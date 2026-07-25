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

Equivalent named adapters are exported from
`@stopcock/fp-compiler/rollup`, `/esbuild`, and `/webpack`. The root
`stopcockFp` Unplugin instance remains available when one configuration must
target several hosts: it exposes `.vite(...)`, `.rollup(...)`,
`.esbuild(...)`, and `.webpack(...)`. The release suite builds and executes a
real fixture through all four adapters.

For release builds, `diagnostics: 'summary'` prints fused and skipped pipeline
counts plus the static coverage percentage. Use `diagnostics: 'error'` to make
any recognized fallback—including a deferred `flow` or `compile` site—a build
failure.

The transform understands namespace, named, aliased, and custom wrapper-package
imports. Lexically shadowed bindings are left untouched. Exact semantics are
the default; `assumePure: true` records an explicit pure contract for future
pure-only rewrites without silently changing the current transform.

## Options

| Option                 | Purpose                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `include`              | Files the plugin may transform. Defaults to JavaScript and TypeScript, including JSX/TSX.                                         |
| `exclude`              | Files the plugin must ignore. Defaults to `node_modules`.                                                                         |
| `importSources`        | Package roots that export `pipe`, `flow`, and `compile`. Defaults to `@stopcock/fp`.                                              |
| `arrayImportSources`   | Exact package entries that export array operators. Derived as `${importSource}/array` by default.                                 |
| `compileImportSources` | Specialist entries that export `compile` and `compilePure`. Derived as `${importSource}/compile` in addition to the package root. |
| `assumePure`           | Records the explicit `pure` semantic mode. It does not currently enable extra rewrites.                                           |
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

### What fusing changes

Compiling a pipeline fuses it, and fusing is observable if your callbacks have
side effects. The result is always the same. How many times your callbacks run,
and in what order, is not:

```ts
pipe([1, 2, 3], map(log), filter(big))
// runtime  (root pipe, sequential): log 1, log 2, log 3, then the filters
// compiled (fused):                 log 1, filter, log 2, filter, log 3, filter

pipe([1, 2, 3, 4], map(log), find((x) => x === 2))
// runtime  (root pipe, sequential): log runs 4 times
// compiled (fused):                 log runs 2 times, then stops
```

Root `pipe` is sequential at runtime and documents that. This plugin lowers the
same call into a fused loop, so enabling it changes the above. That is the point
of the plugin — it is the same thing `@stopcock/fp/fusion` and
`@stopcock/fp-optimizer` do, obtained by adding a build step instead of changing
an import — but it means a pipeline whose callbacks log, count, or mutate can
behave differently with the plugin on.

Pure callbacks are unaffected. If yours are not pure and you depend on
stage-by-stage order, keep those pipelines out of the compiler (an unsupported
operator or a dynamic step leaves the site as a runtime call), or write them as
explicit loops. `compile` and `compilePure` can be lowered from either the root
or `/compile` entry, including a single static step. A single-step `flow`
remains untouched because the runtime deliberately returns the original
function identity. `compilePure` shapes with the runtime's bounded top-k or
callback-elision rewrite remain portable until those pure-only rewrites have
equivalent AOT templates, avoiding a silent performance regression. The
compiler does not silently materialize generic
iterables. Dynamic step factories, spread arguments, unsupported operators,
and ambiguous or shadowed imports remain runtime FP calls.

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
`diagnostics: 'error'` requests a fail-closed build. Source maps and per-site
diagnostics identify every transformed or skipped pipeline.

`callbackArity(name)` exposes the checked-in operator metadata used by the
transform and returns `undefined` for an unknown or unsupported name. It is
useful when writing a custom host adapter.

## `stopcock check`

The package ships a `stopcock` bin with one subcommand. It reads receipts your
build already emitted and evidence manifests you hand it. It never compiles,
profiles, or benchmarks your code, and it never loads a fusion runtime.

```bash
stopcock check \
  --receipts build/receipts \
  --evidence build/evidence \
  --expectations build/expectations.json \
  --policy unsupported \
  --policy stale-evidence \
  --json
```

| flag                    | meaning                                                  |
| ----------------------- | -------------------------------------------------------- |
| `--receipts <path>`     | receipt JSON file or directory, repeatable, required     |
| `--evidence <path>`     | evidence manifest file or directory, repeatable          |
| `--expectations <path>` | hashes the artifacts are expected to match               |
| `--policy <id>`         | `unsupported`, `stale-evidence`, or `coverage-threshold` |
| `--policy-file <path>`  | a project policy document                                |
| `--coverage <n>/<d>`    | exact ratio required by `coverage-threshold`             |
| `--json`                | deterministic JSON on stdout, prose on stderr            |

At least one policy is required. Exit `0` means every requested policy passed,
`1` means a checked policy failed, `2` means the arguments, schema, or
artifacts were invalid. Missing evidence is never a pass.

Each site renders six classes separately: declared capability, static
decision, corpus evidence, runtime observation, qualified benchmark, and
packed release evidence. A fallback never reads as transformed, a statically
selected lowering never reads as executed, and a stale source, config,
semantic-manifest, output, package, or runtime hash withdraws every claim in
the classes it invalidates.

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
