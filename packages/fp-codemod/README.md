# @stopcock/fp-codemod

TypeScript-aware, conservative migrations from Stopcock FP 1 to FP 2.

```bash
bun add -d typescript @stopcock/fp-codemod
bunx stopcock-fp-codemod --check src
bunx stopcock-fp-codemod --write src
```

The codemod safely:

- rewrites `stream`, `dict`, and `dual-lite` package subpaths;
- splits legacy root namespaces such as `A`, `O`, and `Stream` into focused
  subpath imports;
- moves legacy named Option, Result, Guard, and Function exports to their
  modules;
- renames `explainPipeline`, moves compiler telemetry to the compile subpath,
  and converts positional Option/Result match handlers to named records;
- preserves aliases, type-only imports, quote style, and semicolon style;
- emits explicit errors for runtime-JIT, async Result, Logic, and old optics
  migrations that require a design decision rather than guessing.

Dry-run is the default. `--check` is suitable for CI, `--write` applies the
reported mechanical edits, and `--json` emits a machine-readable summary.
Warnings and errors identify the semantic follow-up that cannot be automated.

Programmatic use:

```ts
import { transformSource } from '@stopcock/fp-codemod'
import { runCodemod } from '@stopcock/fp-codemod/node'

const result = transformSource(sourceText, 'example.ts')
const summary = await runCodemod(['src'], { write: true })
```

TypeScript 7 is a peer dependency so the codemod uses the same compiler API as
the project it migrates.
