# Compiler as the default: SWC, tsc, and a CLI

Goal: `@stopcock/fp-compiler` becomes the path every user is on, not the one
bundler users opt into. Today it ships as vite/rollup/esbuild/webpack adapters
only, so anyone on tsc, SWC, Deno, or plain Node gets unfused root `pipe`.

## What makes this cheap

The lowering engine is already parser-agnostic. `codegen.ts` (1,241 lines) and
`ops-table.ts` (821 lines) produce **source strings**; `transform.ts` splices
them into the original file with MagicString using byte offsets. Babel is used
only to locate call sites and resolve import bindings.

The coupling that remains is narrow:

- `Step` holds `t.Expression` for the operator node and its args
- `inline.ts` inspects arrow params and bodies to decide inlining
- `transform.ts` parses with `sourceType: 'module'` and matches
  `ImportDeclaration` only

So a second frontend has to supply: import bindings, call-site offsets, and
per-step expression ranges. It does not need to reimplement lowering.

## Prerequisites

Neither is optional, and both are cheaper than the frontends.

**P1. The docs claim is false today.** `apps/docs/.../benchmarks.mdx` says "All
three operations fuse into a single loop" about root `pipe`. Root `pipe` has
been sequential since bf49879. Fix before promoting anything.

**P2. Decide the runtime floor.** A compiler default still leaves a runtime
path for un-lowered sites, and that path is now the slowest tier. Measured at
n=10,000, chains of N `map` steps:

| steps | root | optimizer | compiler |
|---:|---:|---:|---:|
| 3 | 26,214 | 72,334 | 70,915 |
| 5 | 14,237 | 11,832 | 66,619 |
| 6 | 11,081 | 4,400 | 68,210 |

The optimizer falls below root at 4 steps. Either fix that cliff or point root
`pipe` back at fusion, otherwise every coverage gap lands on a bad floor.

## Phase 1: `stopcock compile` (CLI)

Highest coverage per unit of work. Reuses the engine unchanged.

`bin.stopcock` already exists and points at `dist/cli.js`; `cli.ts` is
currently `stopcock check` and states it "never compiles". Add a sibling
subcommand rather than a second binary.

```
stopcock compile <glob...> [--out-dir <dir>] [--in-place] [--sourcemap]
                 [--diagnostics summary|verbose|error] [--receipts <dir>]
```

- Walk inputs, call `transformStopcockPipelines(code, id, options)` per file,
  write `code` and `map`.
- Emit receipts through the existing `receipt-emit.ts` so `stopcock check`
  works identically to the bundler path. This is the invariant that keeps
  frontends honest: same receipts, same policies, same evidence.
- `--diagnostics error` exits non-zero on any un-lowered site.

Covers: tsc projects (run on source before tsc, or on ESM emit), Deno, Node
run from source, library builds, and anything with a `package.json` script.

Constraint to document: ESM only. `transform.ts` parses `sourceType: 'module'`
and matches `ImportDeclaration`. Running it on CJS emit is a no-op, so for tsc
users it must run **before** tsc, or after tsc with `"module": "esnext"`.

## Phase 2: tsc

Two routes. Ship the first, offer the second only if asked.

**2a. CLI as a pre-pass (recommended).** No transformer, no ts-patch, no
peer-version matrix. One line in `package.json`:

```json
"build": "stopcock compile 'src/**/*.ts' --out-dir .stopcock && tsc -p tsconfig.build.json"
```

The awkward part is source layout, so it wants a `--in-place` mode guarded by
a clean-tree check, or a documented `.stopcock/` staging dir with paths
rewritten in `tsconfig`.

**2b. `ts.TransformerFactory` (only on demand).** Real cost: tsc does not load
transformers natively, so it requires ts-patch or a programmatic
`ts.createProgram` host. Worse, our codegen emits **text**, and a TS
transformer must return nodes; splicing arbitrary source through
`ts.factory.createIdentifier(rawText)` is a known hack that breaks source maps
and formatting. If it is genuinely wanted, the honest shape is a TS frontend
that yields the same `Step` descriptors and offsets, then text-splice the
emitted JS as a post-emit step, which is Phase 1 again with a TS parser.

Recommendation: do 2a, and treat 2b as unfunded until someone asks with a real
project attached.

## Phase 3: SWC

Be straight about this one. SWC dropped JS plugins; `jsc.experimental.plugins`
loads Rust compiled to WASM, and WASM plugins are isolated, so a thin Rust
shim cannot call back into our JS codegen. A true SWC plugin means porting
`codegen.ts`, `ops-table.ts`, and `inline.ts` to Rust. That is a project in
its own right, not a phase of this one.

What to ship instead, in order:

- **`@swc/core` programmatic users:** document running
  `transformStopcockPipelines` as a pre-pass before `swc.transform`. Works
  today, no new code.
- **Next.js:** already covered. Next still runs webpack, so the existing
  `@stopcock/fp-compiler/webpack` adapter applies. Verify with a fixture app
  and document it, because most people assume "Next uses SWC" means the
  webpack adapter is unavailable.
- **Turbopack:** genuinely uncovered. No interim story beyond the CLI as a
  pre-build step.
- **Rust port:** scope separately, only if SWC-native demand is real. The
  ops-table is generated, so a shared generator emitting both TS and Rust
  tables is the sane starting point rather than a hand port.

## Phase 4: widen unplugin (nearly free)

`plugin.ts` uses `createUnplugin`, which already supports rspack, farm, and
rolldown beyond the four exported today. Add the export entries, a fixture per
host, and the docs row. This is the cheapest coverage left on the table and
should probably land alongside Phase 1.

## Cross-cutting: conformance

Without this the frontends drift and the guarantee dies.

- One fixture corpus, every frontend, **byte-identical** output asserted.
- Every frontend emits receipts; `stopcock check` runs over all of them with
  the same policies.
- The existing release suite already builds and executes a real fixture
  through all four bundler adapters. Extend that harness rather than starting
  a parallel one.

## Order

1. P1 docs fix, P2 runtime-floor decision
2. Phase 1 CLI, Phase 4 unplugin widening
3. Phase 2a tsc pre-pass docs and `--in-place`
4. Phase 3 SWC pre-pass docs, Next.js/webpack fixture
5. Rust port only if demanded, scoped separately

## What this does not fix

The compiler cannot be automatic. Every route here is still "add a build
step". "Default" here means the documented, templated, `diagnostics: 'error'`
path, not something that happens without configuration. The claim that holds
up is: fastest when compiled, competitive when not, and the build tells you
which one you got.
