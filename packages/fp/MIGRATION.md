# Migration: fusion API to Plan IR API

The old `fuse.ts` engine (runtime opcode scanner plus a `new Function` JIT) is
gone. `pipe`, `flow`, and `compile` all route through the Plan IR
(`registry.ts`, `plan.ts`, `interpret.ts`, `lower.ts`, `compile.ts`) instead.
There is no process-global fusion mode anymore: every compiled runner is
self-contained.

## API mapping

| Old | New |
| --- | --- |
| `setFusionMode('no-jit')` | Nothing to do. `compile`, `flow`, and `pipe` always use this path. |
| `setFusionMode('jit')` | `await compileJit(...steps)`. Not yet implemented — ships in a later tranche. |
| `setFusionMode('auto')` | Nothing to do. There is no mode to select. |
| `getFusionMode()` | Removed. No replacement; there is no global mode. |
| `explainFusion(...steps)` | `explainPipeline(...steps)` |
| `getFusionStats()` | `getOptimizerStats()` |
| `resetFusionStats()` | `resetOptimizerStats()` |

## Behavior notes

- `compile`/`compilePure`/`explainPipeline`/`getOptimizerStats`/`resetOptimizerStats`
  are exported from the package root, same as before.
- `explainPipeline` returns `domains`, `segments`, `materializationBoundaries`,
  `semantics` (`'exact'` or `'pure'`), `executor`, and `appliedRewrites` —
  different shape from the old `FusionExplanation` (`fuseable`, `willUseJit`,
  `operations`, `opcodes`, `reason`). Read the actual shape in
  `src/compile.ts` before porting assertions.
- `getOptimizerStats` returns `plansBuilt`, `lowerings`, `shapeCacheHits`,
  `shapeCacheMisses`, `shapeCacheSize` — different fields from the old
  `FusionStats` (`mode`, `jitAvailable`, `segmentsRun`, `jitCompiles`, etc).
  There's no JIT tier yet, so there's nothing to count there.
- `pipe()` no longer has a JIT/no-JIT/auto distinction. Every pipeline runs
  through the same portable executor: no `new Function`, no eval, callback
  order and count follow exact semantics always.
- The old JIT under-counted the callback preceding a `take` in some
  pipelines (its loop bound `i < src.length && c < limit` didn't account for
  filtering/expanding steps before the `take`). That was a bug, not a
  documented semantic. The new engine's callback counts always match the
  reference interpreter (`interpret.ts`) exactly.
