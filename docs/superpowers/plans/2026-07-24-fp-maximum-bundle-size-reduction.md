# `@stopcock/fp` maximum browser-bundle reduction plan

**Date:** 2026-07-24
**Repository:** `/Users/tomdeakin/IdeaProjects/lay-some-pipe`
**Scope:** investigation and implementation plan only
**Measured package:** local built `@stopcock/fp` 1.0.0
**Primary target:** browser ESM, ES2022
**Status:** implementation-ready; no production source was changed while producing this plan

## Executive verdict

The current browser bundle is not competitive. Its direct operations are obscured by avoidable initializer retention, and its default `pipe`/`flow` entry points statically pull a high-performance generic fusion system into code that may only compose two ordinary functions. In the reproduced esbuild lane, `pipe` costs 11.553 KiB gzip, direct `map` costs 1.971 KiB, and `filter -> map -> take` costs 12.631 KiB. The common pipeline is only 1.078 KiB larger than `pipe`, confirming that the cost is predominantly fixed.

The target sizes are nevertheless achievable without deleting data-first/data-last APIs, weakening correctness, using runtime code generation, or requiring the compiler for correctness:

1. Repair initializer purity and split generic dual dispatch from small internal dual wrappers. The measured pure-annotation experiment reduced direct `map` from 2,018 to 221 gzip bytes and Option construction/map/fallback from 1,109 to 839 bytes in esbuild. Webpack reached 219 and 838 bytes respectively. This phase is non-breaking and should land first.
2. Make the default `pipe` and `flow` small, hand-unrolled sequential primitives with no static fusion-engine import. They preserve exact output semantics and remain the runtime fallback. A deliberately conservative prototype using a generic loop was 103 gzip bytes; a realistic hand-unrolled implementation should remain below 0.5 KiB.
3. Make build-time compilation the preferred automatic-fusion path. The existing compiler already emitted validated direct loops at 133-224 gzip bytes in the esbuild fixtures and 346 bytes through Webpack. It can remove the generic runtime completely for recognized sites.
4. Put runtime fusion behind explicit entry points. Provide a compact, CSP-safe generic fallback at `@stopcock/fp/fusion`, while keeping the large pre-generated maximum-throughput template bank out of the default package graph. A semantic-oracle interpreter prototype measured 4,542 gzip bytes; the current generic lowerer with the template bank stubbed out measured 5,986 bytes. Reaching a performance-preserving 4.5-5.0 KiB therefore requires compact opcode metadata, production/debug separation, and a deliberately bounded set of specialized runners. It must be proven by the existing Bun/JSC and Node/V8 gates before replacing any current performance path.
5. Move the full template-bank optimizer to an optional specialist package or explicit optimized entry point and remove it from the narrow root. The default package should contain small utilities, sequential composition, and the compact fallback; applications needing maximum runtime fusion can opt into the optimized runtime, while applications with a build step use `@stopcock/fp-compiler`.

This is a tiered architecture, not “make everything slower to save bytes”: direct operations stay fast, default composition becomes tiny, build-time fusion remains effectively zero-runtime and fastest, and runtime-only consumers retain explicit compact and maximum-throughput choices.

## Working-tree and evidence controls

- The investigation used the existing checkout and built `packages/fp/dist`; it did not rebuild or edit production source because the worktree is user-owned.
- At the time of the final read, `main` was one commit ahead of `origin/main`, with unrelated changes including `bun.lock`, root `vite.config.ts`, and `apps/diff-demo/`. Implementers must re-read `git status --short --branch` and preserve that baseline.
- All mutation experiments were made under `/private/tmp/stopcock-fp-bundle-audit.aSszEf`.
- `docs/` is ignored by `.gitignore`; validate this plan and future ignored artifacts by direct reads and `git check-ignore -v`, not by assuming `git status` will show them.
- The figures below describe the current built distribution. Before implementation, rebuild in an isolated worktree or temporary copy and recreate the baseline report so stale `dist` output cannot be mistaken for source truth.

## Measurement method

### Consumer fixture rules

Every measured fixture:

- imported the public package or subpath, not source internals;
- exported and executed a result so imports could not disappear as unused;
- was behavior-validated by importing the final minified ESM;
- targeted browser ESM and ES2022;
- enabled bundler tree-shaking;
- was minified with Terser 5.49.0, `ecma: 2022`, `module: true`, top-level mangling, and three compression passes unless otherwise stated;
- recorded raw bundled output, Terser-minified output, gzip level 9, Brotli quality 11, and bundler module attribution.

Primary tools already installed in the checkout were:

- esbuild 0.28.1;
- Rollup 4.62.2;
- Rolldown 1.0.1, representing the repository's Vite+/Rolldown family;
- Webpack 5.108.4;
- Terser 5.49.0.

Rollup used `moduleSideEffects: false`, `propertyReadSideEffects: false`, and `tryCatchDeoptimization: false`. That is deliberately aggressive and is valid for this experiment because the package declares `"sideEffects": false`. Webpack and Rolldown used their production tree-shaking paths. The multi-entry esbuild experiment used esbuild's own minifier so it could preserve cross-chunk symbol links; its sizes are therefore a separate lane and must not be compared byte-for-byte with the Terser table.

### Reproduced current consumer matrix

All sizes are bytes. `Min` is Terser output. `Gzip` is level 9. `Br` is Brotli quality 11.

| Fixture | esbuild Raw | esbuild Min | esbuild Gzip | esbuild Br | Rollup Gzip | Rolldown Gzip |
|---|---:|---:|---:|---:|---:|---:|
| `pipe` alone | 222,920 | 93,374 | 11,830 | 9,514 | 10,981 | 11,811 |
| `flow` alone | 213,003 | 89,224 | 10,453 | 8,453 | 9,639 | 10,440 |
| direct `map` | 14,199 | 6,096 | 2,018 | 1,818 | 219 | 2,007 |
| data-last `map` | 14,202 | 6,097 | 2,018 | 1,818 | 220 | 2,007 |
| `filter -> map -> take` | 232,188 | 97,071 | 12,934 | 10,467 | 11,188 | 12,917 |
| `filter -> map -> reduce` | 232,283 | 97,118 | 12,976 | 10,444 | 11,237 | 12,959 |
| deep fused pipeline | 233,485 | 97,709 | 13,059 | 10,534 | 11,311 | 13,040 |
| Option construct/map/fallback | 6,112 | 2,969 | 1,109 | 984 | 1,106 | 1,106 |
| Option through `pipe` | 222,938 | 93,398 | 11,841 | 9,556 | 11,818 | 11,823 |
| Result construct/map/match | 9,521 | 4,161 | 1,396 | 1,257 | 1,383 | 1,383 |
| object plus string helpers | 17,663 | 8,275 | 2,618 | 2,367 | 2,613 | 2,613 |
| two unrelated helpers | 16,015 | 7,581 | 2,396 | 2,173 | 199 | 2,405 |
| root named Option imports | 6,080 | 2,947 | 1,086 | 968 | 51 | 1,082 |
| array namespace with static property | 14,204 | 6,096 | 2,016 | 1,826 | 219 | 2,005 |
| root namespace with static properties | 6,084 | 2,947 | 1,086 | 968 | 51 | 1,082 |
| enumerated root namespace | 228,811 | 97,989 | 13,274 | 10,716 | 13,202 | 13,299 |
| explicit `compile` | 222,102 | 92,873 | 11,529 | 9,311 | 9,823 | 11,515 |
| string `trim` | 7,751 | 3,634 | 1,292 | 1,157 | 1,287 | 1,287 |
| object `pick` | 15,970 | 7,578 | 2,406 | 2,174 | 2,401 | 2,401 |

Important interpretations:

- A static namespace import is not inherently expensive. `F.isSome(F.some(1))` tree-shakes like named imports in these bundlers. Namespace escape or enumeration is the expensive case: `Object.keys(F)` requires all 15 root exports and costs about 12.96 KiB gzip.
- Rollup can already reduce direct `map` and two unrelated simple helpers to about 0.2 KiB. esbuild, Rolldown, and Webpack cannot do so with the current initializer graph. This is evidence of implementation/build purity variance, not an unavoidable API cost.
- `filter -> map -> take` is 1,104 gzip bytes larger than `pipe` in the primary lane; the deep pipeline is only another 125 bytes. The fixed fusion runtime dominates.
- The requested baseline is confirmed within normal fixture/tool variation: 11.55 KiB versus the supplied 11.45 KiB for `pipe`, 1.97 versus 1.94 KiB for direct `map`, 12.63 versus 12.51 KiB for the common pipeline, and 121.21 KiB for the tarball.

Incremental gzip after the default fusion graph is present:

| Fixture | Total gzip | Delta versus `pipe` |
|---|---:|---:|
| `pipe` alone | 11,830 | fixed baseline |
| `filter -> map -> take` | 12,934 | +1,104 |
| `filter -> map -> reduce` | 12,976 | +1,146 |
| deep fused pipeline | 13,059 | +1,229 |

### Webpack-compatible lane

| Fixture | Current Gzip | Pure-annotation experiment Gzip |
|---|---:|---:|
| `pipe` alone | 12,471 | 11,638 |
| direct `map` | 2,018 | 219 |
| `filter -> map -> take` | 13,565 | 11,851 |
| Option flow | 1,106 | 838 |
| Result flow | 1,394 | 840 |
| object plus string | 2,622 | 1,011 |
| two unrelated helpers | 2,407 | 219 |
| root named Option imports | 1,089 | 92 |
| explicit `compile` | 12,182 | 10,492 |
| compiler-lowered common pipeline | 346 | 346 |

The pure experiment annotated 136 safe built calls matching top-level `dual(...)` or `Object.freeze(...)`. It did not change production source. Comments survived because they were inserted into the already-built package for this experiment. Production work must prove that source/codegen annotations survive Vite+ pack and Terser rather than assuming the same result.

### Build-time compiler lane

| Fixture | Min | Gzip | Brotli | Runtime fusion graph present |
|---|---:|---:|---:|---|
| `filter -> map -> take` | 183 | 165 | 133 | no |
| `filter -> map -> reduce` | 129 | 133 | 98 | no |
| deep fused pipeline | 296 | 224 | 202 | no |
| Webpack `filter -> map -> take` | 563 | 346 | 311 | no |

The output was direct loops with no Stopcock runtime import. The compiler therefore already beats the proposed 1.0 KiB budget for recognized pipelines by a wide margin.

### Peer comparison

Equivalent esbuild/Terser `filter -> map -> take` fixtures:

| Library and API shape | Pinned/measured version | Min | Gzip | Brotli |
|---|---:|---:|---:|---:|
| fp-ts array/function modules | 2.16.11 | 651 | 300 | 251 |
| Effect subpaths (`effect/Array`, `effect/Function`) | 3.22.0 | 1,453 | 581 | 503 |
| Rambda named imports | 11.2.0 | 1,871 | 733 | 613 |
| Remeda named imports | 2.34.1 | 1,511 | 772 | 696 |
| Ramda named imports | 0.32.0 | 7,796 | 2,217 | 1,990 |
| `@mobily/ts-belt` namespace `A.*` | 3.13.1 | 21,794 | 5,034 | 4,416 |
| Effect root module namespaces | 3.22.0 | 18,152 | 6,279 | 5,755 |
| lodash-es named helpers | 4.18.1 | 18,118 | 6,508 | 6,002 |
| Stopcock current | 1.0.0 | 97,071 | 12,934 | 10,467 |
| Stopcock compiler-lowered | local | 183 | 165 | 133 |

`fp-ts` and Effect were installed only under the temporary audit directory; no repository manifest or lockfile was changed. Effect's 0.57 KiB subpath result and 6.13 KiB root-module result demonstrate how strongly API topology affects comparisons. ts-belt's requested `A.map` namespace API is represented as such; its result must not be described as proof that namespaces are intrinsically bad because statically analyzable namespace properties can tree-shake.

## Exact byte attribution

### Consumer-retained modules

The following values are esbuild metafile `bytesInOutput` before Terser. They identify retained code; they are not gzip-additive.

| Fixture | Retained module | Bytes in output | Why retained |
|---|---|---:|---|
| `pipe` | `dist/compile-7tMLZoDt.js` | 203,707 | static import from `pipe.ts` through compile/plan/lower |
| `pipe` | `dist/index.js` | 9,713 | root facade plus pipe/flow/root exports |
| `pipe` | `dist/dual-CJak6HFm.js` | 3,152 | Option/dual initializers and opcode table |
| `pipe` | `dist/sort-kernel-BI9t4-T-.js` | 3,128 | lowerer/interpreter boundary support |
| `pipe` | `dist/option-BcIqfp0R.js` | 2,669 | compile returns Option for several terminals |
| direct `map` | `dist/array-tFB-Fahd.js` | 4,624 | selected map plus retained array initializers |
| direct `map` | `dist/result-CmF1jw-r.js` | 3,298 | array chunk cross-import/initializer graph |
| direct `map` | `dist/dual-CJak6HFm.js` | 3,152 | generic dual and full opcode lookup |
| direct `map` | `dist/option-BcIqfp0R.js` | 2,669 | array helpers and impure-looking Option initializers |
| Option flow | `dist/dual-CJak6HFm.js` | 3,152 | selected Option operations still call generic dual |
| Option flow | `dist/option-BcIqfp0R.js` | 2,669 | all non-provably-pure initializers |
| object plus string | `dist/object.js` | 9,796 | selected object helper plus sibling initializers |
| object plus string | `dist/dual-CJak6HFm.js` | 3,152 | generic dual/opcode graph |
| object plus string | `dist/option-BcIqfp0R.js` | 2,669 | cross-import plus initializer retention |
| object plus string | `dist/string.js` | 1,591 | selected helper plus generated/runtime wrappers |
| enumerated root | `dist/compile-7tMLZoDt.js` | 205,427 | namespace enumeration requires every root export |
| enumerated root | `dist/index.js` | 10,207 | namespace object materialization |
| explicit `compile` | `dist/compile-7tMLZoDt.js` | 203,468 | complete generic engine |

### Shared compile chunk by source region

Current `dist/compile-7tMLZoDt.js` is 194,455 raw bytes. Per-region gzip is not additive because the full chunk compresses repeated tokens across regions.

| Source region | Raw bytes | Region-alone gzip | Role |
|---|---:|---:|---|
| `portable-templates.ts` | 151,302 | 6,635 | 233 exported generated shape/template entries |
| `lower.ts` | 14,469 | 3,869 | switches, sinks, boundary and generic lowerers |
| `registry.ts` | 12,697 | 1,411 | complete eager metadata `Map` |
| `compile.ts` | 11,428 | 3,083 | caches, critical runners, pure rewrites, explain/stats |
| `plan.ts` | 3,342 | 1,367 | plan building and structural keys |
| `shape-entry.ts` | 1,054 | 474 | bounded 256-entry shape cache |
| **whole chunk** | **194,455** | **16,309** | gzip level 9 |

`packages/fp/src/portable-templates.ts` contains 233 generated exports (171 array and 62 sink entries) and 289 functions in total. The template bank is highly compressible but still exceeds the entire proposed 5 KiB generic-runtime target by itself when isolated.

### Multi-entry and shared-chunk behavior

An esbuild code-splitting fixture used two fused routes and one direct-map route:

| Output | Raw | Gzip | Brotli | Meaning |
|---|---:|---:|---:|---|
| engine shared chunk | 91,236 | 12,367 | 9,961 | loaded by both fused routes |
| utility shared chunk | 8,530 | 2,919 | 2,595 | shared by all three routes |
| fused route A closure | 99,929 | 15,432 | 12,684 | entry plus both shared chunks |
| fused route B closure | 99,919 | 15,428 | 12,680 | entry plus both shared chunks |
| direct-map route closure | 8,615 | 3,019 | 2,681 | polluted by the union of shared array initializers |
| all emitted files | 100,167 | 15,674 | 12,894 | cacheable aggregate |

Code splitting prevents duplicate engine bytes across the two fused routes, but it can make a light route download a shared utility chunk shaped by heavier routes. New gates must measure each entry's transitive closure, not merely the sum of unique output files.

### Distribution and tarball

Current built distribution:

| Item | Measurement |
|---|---:|
| `dist` on-disk size | about 1.0 MiB |
| unpacked publish payload | 804,528 raw bytes |
| JavaScript | 534,409 bytes across 51 files |
| declarations | 250,882 bytes across 54 files |
| Markdown | 12,612 bytes |
| other | 6,625 bytes |
| publish-style tarball | 124,118 bytes / 121.21 KiB |
| current size-gate shared chunk | 16,274-16,309 gzip bytes, depending gzip wrapper |
| current gate shared-chunk ceiling | 18,000 bytes |
| current gate tarball ceiling | 150,000 bytes |

The declaration reachability experiment found five unreferenced emitted internals totaling 41,590 raw bytes:

- `dual-internal.d.ts`;
- `interpret.d.ts`;
- `opcodes.d.ts`;
- `portable-templates.d.ts` (37,522 bytes);
- `sort-kernel.d.ts`.

Removing only those files reduced a fresh `bun pm pack` tarball from 124,118 to 121,336 bytes. Declarations as a whole account for about 38.4 KiB of the compressed tarball: an experimental pack with all declarations removed was 85,735 bytes. Therefore the tarball cannot reliably reach 100 KiB by deleting one internal declaration or README. It needs both runtime/template removal and a public-declaration emission strategy.

## Confirmed root causes

### 1. Default composition statically imports the complete runtime optimizer

- `packages/fp/src/pipe.ts` imports `compile`, `dispatchAndTrack`, and `planAndLowerFast` from `./compile`.
- Tagged steps route through plan construction, lowering, shape caching, generated templates, and dispatch.
- `packages/fp/src/flow.ts` imports `compile`; two or more functions return a compiled runner.
- `packages/fp/src/index.ts` re-exports `pipe`, `flow`, `compile`, `compilePure`, and `explain`.

This is the primary cause of the 10-12 KiB fixed cost.

### 2. The runtime initializes complete global tables for a selected pipeline

- `packages/fp/src/registry.ts` constructs the full `REGISTRY = new Map(...)` at module evaluation.
- `packages/fp/src/lower.ts` builds `arrayTemplateByKey` from every `ARRAY_TEMPLATES` and `SINK_TEMPLATES` entry and builds `sumFusionByKey`.
- `packages/fp/src/shape-entry.ts` creates a module-global bounded shape cache.
- `packages/fp/src/pipe.ts` creates identity caches and two 256-entry opcode front caches.

These structures are bounded and CSP-safe, but their eager initialization prevents an operation-specific consumer from paying only for selected operations once the engine is imported.

### 3. Safe top-level factories are not consistently marked pure

- `packages/fp/src/option.ts` and `packages/fp/src/result.ts` contain many top-level `dual(...)` initializers with no pure annotation.
- object, string, number, and other generated/manual modules retain similar constructions.
- `none = Object.freeze(...)` is also not annotated.
- `packages/fp/codegen/dual-inline.ts` already emits `/* @__PURE__ */` for generated arity-one IIFEs, proving the pipeline accepts the pattern, but it only generates `array`, `boolean`, and `math`.

The corrected experiment produced direct-map parity across esbuild, Webpack, Rollup, and Rolldown, so this is a proven high-value repair.

### 4. Generic `dual` unnecessarily couples non-fusible values to opcode metadata

- `packages/fp/src/dual.ts` imports the complete `OP_CODES` object and `OP_NON_FUSEABLE`.
- `packages/fp/src/dual-internal.ts` is only a typed alias to public `dual`.
- Option and Result operations do not request tags, yet their selected data-last wrappers retain the generic tagged/non-tagged dispatcher and opcode lookup module.

A synthetic untagged `dualLite` plus pure Option initializers reduced the same Option flow to 195 gzip bytes. The production target should not copy that prototype blindly, but it proves that Option's representation and dual ergonomics do not require 0.8-1.1 KiB.

### 5. The generated array entry is a large shared module with cross-imports

- `packages/fp/src/array.ts` is generated from `packages/fp/codegen/defs/array.ts`.
- Its public `map` implementation is already small and has data-first/data-last fast paths.
- The built `array-tFB-Fahd.js` chunk also contains many unrelated operations and imports Option, Result, number helpers, and the sort kernel.
- Current Vite+ output emits broad facades that import and re-export many names from shared chunks.

Rollup can cut through this topology, but other measured bundlers need purity information and should not be expected to infer every safe initializer.

### 6. The existing size gate measures packaging artifacts, not consumer outcomes

`benchmarks/src/reference/fp-package-size-gate.ts` only:

- identifies one shared `compile-*` chunk imported by `compile.js` and `index.js`;
- enforces 18,000 gzip bytes on that chunk;
- enforces a 150,000-byte tarball.

It does not cover a consumer bundle, the default `pipe`, direct operations, Option/Result, compiler elimination, namespace escape, multi-entry closures, Brotli, webpack, or peer standing. Its assumption that root and compile share exactly one `compile-*` chunk will become invalid under the recommended architecture.

## Rejected or qualified hypotheses

1. **“The shipped compile chunk contains `interpret.ts`.” — Rejected.**
   `interpret.ts` is the semantic oracle and is not imported by the current compile/lower runtime. Its declaration is emitted, but its JavaScript is not in the current public engine graph.

2. **“`sideEffects: false` is missing or ignored.” — Rejected.**
   `packages/fp/package.json` already has `"sideEffects": false`, and complete unused modules are removed. The problem is top-level calls that look effectful inside modules that must be evaluated.

3. **“Pure annotations alone solve the package.” — Rejected.**
   They solve direct-operation retention, but the common pipeline remains about 10.95-11.57 KiB because the engine is still statically imported.

4. **“Namespace imports always retain the whole barrel.” — Rejected.**
   Static property access tree-shakes. Namespace enumeration, spreading, passing to unknown code, or other escape requires materialization and retains the reachable export surface.

5. **“Per-operation files are mandatory for a tiny direct `map`.” — Not proven.**
   Pure annotations reduced the current shared-array topology to 219-221 gzip bytes in all tested bundler families. Leaf exports remain a useful hardening/stretch option, not the first required change.

6. **“The entire high-performance template bank can fit below 5 KiB.” — Rejected.**
   Its built region alone is 6,635 gzip bytes, before planner, registry, cache, Option, sort, or dispatch code.

7. **“A sub-5 KiB generic runtime is impossible.” — Rejected, with a performance warning.**
   A temporary `buildPlan + interpret` engine with the common operators measured 4,542 gzip bytes and preserved the sample's output. It has not been shown to meet the current throughput gates. The current generic lowerer without templates was 5,986 bytes.

8. **“Synchronous dynamic loading can hide the planner.” — Rejected as an architecture.**
   ESM dynamic import is asynchronous. It cannot preserve synchronous `pipe`/`compile` ergonomics without preload requirements, hidden blocking, or semantic changes.

## Non-negotiable behavior and type contract

Every phase must preserve or explicitly version:

- both data-first and data-last calls;
- exact result values and existing Option/Result object tags;
- the canonical frozen `none` singleton where identity is observable;
- callback order, callback count, index arguments, and early termination;
- sparse-array behavior as defined by current tests and source implementations;
- mutation/non-mutation guarantees and returned-array ownership;
- `this` and `arguments` behavior at user callback and wrapper boundaries;
- thrown-error identity, timing, and partial side effects;
- evaluation order of pipeline source, operator arguments, callbacks, and seeds;
- generic iterable versus array behavior, without hidden `Array.from`;
- Node 22+, browser ESM, Bun/JSC, Node/V8, and CSP/no-`eval` portability;
- all documented public subpath imports through the compatibility window;
- TypeScript overload inference, refinements, readonly inputs, tuple types, and absence of published explicit `any`;
- compiler source maps and fail-open runtime fallback unless a user selects strict coverage;
- a synchronous runtime API; no dynamic import disguised as a sync optimizer.

The semantic oracle remains `packages/fp/src/interpret.ts`. Runtime compacting must compare the default sequential path, compact runtime path, optimized runtime path, and compiler-emitted path against it and against direct operator execution.

## Architectural alternatives

| Design | Expected common-pipeline gzip | Runtime effect | Compatibility | Compiler | CSP | Complexity | Verdict |
|---|---:|---|---|---|---|---|---|
| Pure annotations only | 10.9-11.9 KiB | unchanged | fully compatible | optional | safe | low | mandatory phase, insufficient alone |
| Shrink current monolithic engine | 7-10 KiB | risky if templates removed | compatible | optional | safe | high | cannot reach 5 KiB with full bank |
| Tiny sequential `pipe`; explicit fusion | 0.35-0.70 KiB | intermediate arrays without compiler | outputs compatible; performance behavior changes | recommended | safe | medium | recommended default |
| Separate `pipe` and `pipeFused` | 0.1-0.5 KiB default; 4.5-5.0 KiB compact fused | user chooses runtime fusion | additive, easy migration | optional | safe | medium | recommended public topology |
| Compiler plus tiny runtime fallback | 0.13-0.35 KiB compiled; 0.35-0.70 fallback | compiled path should be fastest | compatible when fail-open | optional for correctness | safe | high but existing | recommended automatic path |
| Conditional exports choose fused code | varies | environment-dependent | fragile | no | safe | high | reject; conditions cannot know call shape or plugin use |
| Per-operation public leaf exports | 0.15-0.35 KiB per selected op | unchanged | additive | no | safe | high export/type count | stretch hardening |
| Async dynamic engine loading | small initial, async later | changes sync semantics/cold behavior | breaking | no | safe | high | reject |
| Runtime code generation/JIT | potentially small | CSP and warm-up risk | semantic/platform risk | no | unsafe under strict CSP | high | reject |
| Full optimizer in optional specialist package | 9.5-12 KiB when imported | preserves current maximum throughput | migration for runtime-fusion users | no | safe | medium | recommended escape hatch |

## Recommended target architecture

### Tier 1: tiny default runtime

`@stopcock/fp` exports a hand-unrolled sequential `pipe` and `flow`, minimal Option/Result constructors and guards, and no planner/lowerer/template import. Specialist modules such as `@stopcock/fp/array` export small data-first/data-last operations whose initializers are provably pure. Tagged data-last operators remain callable ordinary functions, so the fallback is always correct.

### Tier 2: build-time automatic fusion

`@stopcock/fp-compiler` recognizes supported `pipe`, `flow`, `compile`, and `compilePure` sites and emits direct loops with source maps. It prunes dead Stopcock import specifiers after proving there are no remaining references. Unsupported sites remain sequential or use the explicitly imported runtime selected by the application. Production CI can opt into coverage/error policy; development remains debuggable and fail-open by default.

### Tier 3: explicit runtime fusion

`@stopcock/fp/fusion` exports `pipeFused`, `flowFused`, `compile`, `compilePure`, and the compact exact/pure runtime. It uses compact step metadata carried by tagged closures or compact arrays, a generic CSP-safe lowerer, a bounded cache, and only evidence-backed specialized runners. Debug/explanation APIs live at `@stopcock/fp/fusion/debug` so strings, names, statistics, and registry descriptions do not enter production consumers.

The existing full portable-template bank remains available as an explicit maximum-throughput runtime, preferably `@stopcock/fp-optimizer`, if the compact runtime cannot satisfy every current performance stratum within 5 KiB. It must not be statically reachable from root, direct modules, or the compact fusion entry. This package/entry is a deliberate choice for runtime-only applications, not the fallback for every `pipe`.

### Proposed export topology

| Specifier | Contents | Target gzip | Root reachable |
|---|---|---:|---|
| `@stopcock/fp` | tiny `pipe`/`flow`, Option/Result constructors and guards only | enumerated 1.5-3 KiB; named 0.1-0.5 KiB | yes |
| `@stopcock/fp/array` | direct and pipe-compatible array operations | selected op 0.2-0.5 KiB | no |
| existing specialist subpaths | direct domain operations | fixture-specific budgets | no |
| `@stopcock/fp/fusion` | compact `pipeFused`, `flowFused`, `compile`, `compilePure` | 4.5-5.0 KiB expected | no |
| `@stopcock/fp/fusion/debug` | `explain*`, stats, names, diagnostics | separately measured | no |
| `@stopcock/fp/dual` | public generic dual | 0.5-1.5 KiB when explicitly used | no |
| `@stopcock/fp-optimizer` or `@stopcock/fp/fusion/optimized` | full specialized portable runtime | 9.5-12 KiB | no |
| `@stopcock/fp-compiler/*` | build plugins | build-time only | no |

Do not expose a root `A` namespace object. Consumers can still write `import * as A from '@stopcock/fp/array'`; static property use already tree-shakes.

## Outcome budgets

Budgets are behavior-validated final consumer artifacts, not source or package chunks. Each final budget applies independently to esbuild, Rollup, Rolldown/Vite+, and Webpack unless a table says otherwise.

| Scenario | Current primary gzip | Minimum acceptable | Expected | Stretch |
|---|---:|---:|---:|---:|
| `pipe` alone | 11.553 KiB | 0.50 KiB | 0.20-0.40 KiB | 0.10-0.20 KiB |
| `flow` alone | 10.208 KiB | 0.50 KiB | 0.20-0.40 KiB | 0.10-0.20 KiB |
| direct `map` | 1.971 KiB | 0.50 KiB | 0.20-0.30 KiB | 0.15-0.22 KiB |
| Option construct/map/fallback | 1.083 KiB | 0.90 KiB | 0.25-0.45 KiB | 0.18-0.25 KiB |
| Result construct/map/match | 1.363 KiB | 0.90 KiB | 0.30-0.55 KiB | 0.20-0.35 KiB |
| sequential `filter -> map -> take` | 12.631 KiB | 1.50 KiB | 0.35-0.70 KiB | 0.30-0.45 KiB |
| compiler-lowered common pipeline | 0.161 KiB esbuild / 0.338 KiB webpack | 1.00 KiB | 0.15-0.40 KiB | 0.12-0.25 KiB |
| explicit compact fusion runtime | 11.259 KiB for current `compile` | 5.50 KiB interim | 4.50-5.00 KiB | 4.00-4.50 KiB |
| enumerated narrow root | 12.963 KiB | 8.00 KiB | 1.50-3.00 KiB | under 1.50 KiB |
| main package tarball | 121.21 KiB | 105 KiB interim | 92-99 KiB | 80-90 KiB |
| optional maximum-throughput runtime | about 10-12 KiB consumer cost | 12 KiB | 9.5-11 KiB | under 9 KiB |

The explicit compact-fusion 5 KiB target is the only target not already demonstrated by a production-equivalent experiment. The 4,542-byte interpreter prototype proves the byte envelope, not the throughput. The release must not claim both “under 5 KiB” and “preserves current portable throughput” until the same artifact passes both gates.

## Phased implementation roadmap

Each task below is intended to be independently executable and reviewable. Do not combine phases merely to make one large bundle-size PR; each phase has a rollback point and its own evidence.

### Phase 0 — freeze a reproducible consumer-size harness

Expected outcome: no product-size change; all later claims become reviewable.

#### Task 0.1 — add fixture definitions and behavior oracles

**Files**

- Add `benchmarks/src/bundle-size/fixtures.ts`.
- Add `benchmarks/src/bundle-size/expected.ts`.
- Add `benchmarks/src/bundle-size/fixture-runtime.test.ts`.

**Change**

- Encode every fixture in the reproduced matrix: pipe, flow, direct/data-last map, common collect/reduce, deep pipeline, Option, Result, object/string, unrelated helpers, named imports, static namespace, enumerated namespace, explicit fusion, and compiler-lowered forms.
- Export deterministic `result` values and compare with the expected oracle after final bundle import.
- Include callback-count, callback-order, thrown-error, empty input, and early-exit variants for the pipelines used as size fixtures.

**Validation**

```bash
bunx vitest run benchmarks/src/bundle-size/fixture-runtime.test.ts
```

**Completion criteria**

- Every fixture runs unbundled and has a deterministic expected result.
- A deliberately broken early-exit fixture fails.
- No fixture is import-only or removable as a constant unused module.

#### Task 0.2 — implement the cross-bundler measurer

**Files**

- Add `benchmarks/src/bundle-size/measure.ts`.
- Add `benchmarks/src/bundle-size/bundlers/esbuild.ts`.
- Add `benchmarks/src/bundle-size/bundlers/rollup.ts`.
- Add `benchmarks/src/bundle-size/bundlers/rolldown.ts`.
- Add `benchmarks/src/bundle-size/bundlers/webpack.ts`.
- Add `benchmarks/src/bundle-size/compress.ts`.
- Add `benchmarks/src/bundle-size/types.ts`.

**Change**

- Build browser ESM/ES2022 with installed bundlers.
- Run Terser once with the pinned common options.
- Record raw, minified, gzip-9, Brotli-11, module attribution, emitted chunks, and each entry's transitive chunk closure.
- Import the final artifact to validate behavior.
- Store tool versions, package version, commit, platform, and exact minifier options in the report.
- Fail if source maps or auxiliary assets are accidentally counted as executable JavaScript.

**Validation**

```bash
bun run benchmarks/src/bundle-size/measure.ts --bundler esbuild --bundler rollup --bundler rolldown --bundler webpack --out /tmp/stopcock-fp-size-baseline.json
```

**Expected measurement**

- Reproduce the tables in this plan within 5% or explain changed inputs in the report.

**Completion criteria**

- All fixtures are behavior-validated after minification.
- Reports contain module attribution and transitive multi-entry closures.
- A failed behavior import makes the command non-zero.

#### Task 0.3 — create consumer budgets without replacing the old gate yet

**Files**

- Add `benchmarks/src/reference/fp-consumer-size-contract.ts`.
- Add `benchmarks/src/reference/fp-consumer-size-gate.ts`.
- Add `benchmarks/src/reference/fp-consumer-size-gate.test.ts`.
- Update `benchmarks/package.json`.

**Change**

- Pin the fixture manifest hash and bundler/minifier identity.
- Initially set ceilings at reproduced baseline plus 3% to prevent regression before reduction phases.
- Store separate budgets by bundler; do not hide a Webpack failure behind an aggregate.
- Keep the existing package-size gate unchanged until Phase 6 changes the output topology.

**Validation**

```bash
bunx vitest run benchmarks/src/reference/fp-consumer-size-gate.test.ts
bun run --cwd benchmarks perf:consumer-size
```

**Completion criteria**

- Tampering tests reject missing fixtures, changed tool identities, duplicate rows, invalid compression values, and behavior failures.

### Phase 1 — repair tree-shaking and initializer purity

Expected gzip after Phase 1:

| Fixture | Minimum | Expected | Stretch |
|---|---:|---:|---:|
| direct `map` | 0.50 KiB | 0.21-0.25 KiB | 0.18-0.21 KiB |
| Option flow | 0.90 KiB | 0.80-0.85 KiB | 0.70 KiB |
| two unrelated helpers | 0.50 KiB | 0.20-0.30 KiB | 0.18-0.22 KiB |
| common pipeline | 12 KiB | 10.9-11.9 KiB | not a Phase 1 goal |

#### Task 1.1 — centralize safe pure annotation emission

**Files**

- Update `packages/fp/codegen/dual-inline.ts`.
- Update `packages/fp/codegen/parse.ts` if declaration metadata is needed.
- Add `packages/fp/codegen/purity.ts`.
- Add `packages/fp/codegen/purity.test.ts`.

**Change**

- Introduce one emitter helper for `/* @__PURE__ */` factory calls and IIFEs.
- Annotate only calls proven not to register globally, read time/random state, mutate arguments, or expose initialization order.
- Cover generated `dual(...)`, tagged arity-one IIFEs, `Object.freeze` for immutable constants, and generated metadata arrays where safe.
- Keep a denylist test for effectful constructors; do not add broad Terser `pure_funcs` configuration because that would lie about third-party calls.

**Validation**

```bash
bun run --cwd packages/fp codegen
bunx vitest run packages/fp/codegen/purity.test.ts
bun run --cwd packages/fp codegen:check
```

**Completion criteria**

- Generated output is deterministic.
- Every safe generated top-level factory is annotated exactly once.
- No effectful call is annotated.

#### Task 1.2 — annotate manual Option, Result, and singleton initializers

**Files**

- Update `packages/fp/src/option.ts`.
- Update `packages/fp/src/result.ts`.
- Update other manual public modules reported by the harness, beginning with `object.ts`, `string.ts`, and `number.ts`.
- Add or update unit tests beside each changed module.

**Change**

- Add source-level pure comments immediately before safe `dual(...)` and `Object.freeze(...)` calls.
- Document why each annotated factory is referentially transparent at module evaluation.
- Do not annotate `new Map`, cache construction, registration, or a call whose body may run at initialization.

**Validation**

```bash
bunx vitest run packages/fp/src/__tests__/option.test.ts packages/fp/src/__tests__/result.test.ts packages/fp/src/__tests__/object.test.ts packages/fp/src/__tests__/string.test.ts
bun run --cwd packages/fp check:source
```

**Completion criteria**

- Option/Result representations and `none` identity are unchanged.
- Data-first and data-last tests remain exact.

#### Task 1.3 — prove annotations survive the complete pack pipeline

**Files**

- Add `packages/fp/scripts/check-built-purity.ts`.
- Update `packages/fp/package.json` `check:release`.
- Update `packages/fp/scripts/check-package-contract.ts`.

**Change**

- Parse the built `dist` and assert safe source factories retain recognized pure markers or have been inlined to plain function declarations.
- Bundle the packed tarball, not the checkout path, for direct map, Option, and unrelated-helper smoke fixtures.
- Keep `"sideEffects": false` and add a contract assertion so it cannot drift.

**Validation**

```bash
node tooling/build-package.mjs
bun run --cwd packages/fp scripts/check-built-purity.ts
bun run --cwd packages/fp check:contract
bun run --cwd benchmarks perf:consumer-size --fixtures direct-map,option-flow,two-unrelated
```

**Completion criteria**

- esbuild, Rolldown, and Webpack each produce direct `map <= 512` gzip bytes and Option flow `<= 922` bytes.
- The packed-package fixture matches the local-dist fixture within 2%.

### Phase 2 — decouple generic dual from small internal wrappers

Expected gzip after Phase 2:

| Fixture | Minimum | Expected | Stretch |
|---|---:|---:|---:|
| Option flow | 0.60 KiB | 0.25-0.45 KiB | 0.18-0.25 KiB |
| Result flow | 0.70 KiB | 0.30-0.55 KiB | 0.20-0.35 KiB |
| string `trim` | 0.70 KiB | 0.15-0.35 KiB | under 0.20 KiB |
| object `pick` | 0.70 KiB | 0.25-0.50 KiB | under 0.30 KiB |

#### Task 2.1 — implement untagged internal dual fast paths

**Files**

- Replace `packages/fp/src/dual-internal.ts` with independent `dualUntagged2`, `dualUntagged3`, `dualUntagged4`, and generic fallback helpers.
- Keep `packages/fp/src/dual.ts` as the public generic/tagged API.
- Add `packages/fp/src/__tests__/dual-internal.test.ts`.

**Change**

- Internal untagged wrappers must not import `opcodes.ts`, `OP_CODES`, or public tagged-dual branches.
- Preserve the current rule that data-first dispatch occurs when the full declared arity is supplied.
- Preserve `arguments.length`, partial-application, error, `this`, and allocation behavior as covered by current dual tests.
- Keep the internal helper absent from the export map.

**Validation**

```bash
bunx vitest run packages/fp/src/__tests__/dual.test.ts packages/fp/src/__tests__/dual-internal.test.ts
bun run --cwd packages/fp check:types
```

**Completion criteria**

- Bundling selected Option/Result operations contains no `OP_CODES` object.
- Public `@stopcock/fp/dual` behavior and declaration contract are unchanged.

#### Task 2.2 — change generated tagged operations to numeric metadata

**Files**

- Update `packages/fp/codegen/defs/*.ts`.
- Update `packages/fp/codegen/dual-inline.ts`.
- Update `packages/fp/src/opcodes.ts`.
- Update `packages/fp/src/plan.ts` `isTaggedStep`/`extractBinding`.
- Update `packages/fp-compiler/scripts/gen-ops-table.ts`.

**Change**

- Resolve operation names to numeric opcodes at code generation, not at consumer module initialization.
- Emit tagged closures with `_op` and captured fields directly.
- Eliminate the runtime name-to-opcode `OP_CODES` lookup from generated domain modules.
- Keep public `dual(..., { op: string })` compatibility on the explicit dual subpath; unknown public tags continue to become non-fusible.
- Generate compiler/runtime opcode metadata from one canonical definition to prevent drift.

**Validation**

```bash
bun run --cwd packages/fp codegen
bun run --cwd packages/fp-compiler generate:ops
bunx vitest run packages/fp/src/__tests__/registry.test.ts packages/fp/src/__tests__/plan-interpreter.test.ts packages/fp-compiler/src/__tests__/ops-table.test.ts
```

**Completion criteria**

- Generated array/string/math/guard operations contain numeric tags and no runtime string lookup.
- Ops-table hash updates are intentional and reviewed with the generated diff.

#### Task 2.3 — expand direct code generation where it reduces runtime helpers

**Files**

- Update `GENERATED_MODULES` in `packages/fp/codegen/dual-inline.ts`.
- Add definitions or parser coverage for `object`, `string`, and `number`.
- Add codegen golden tests for refinement overloads and arities 1-4.

**Change**

- Extend the existing direct-wrapper generation beyond `array`, `boolean`, and `math` only where the parser can preserve public types exactly.
- Prefer small named functions for direct operations and pure tagged closures for data-last mode.
- Do not duplicate large algorithm bodies between data-first and data-last branches.

**Validation**

```bash
bun run --cwd packages/fp codegen
bun run --cwd packages/fp codegen:check
bun run --cwd packages/fp check:types
bun run --cwd benchmarks perf:consumer-size --fixtures string-trim,object-pick,option-flow,result-flow
```

**Completion criteria**

- No TypeScript inference snapshot changes without an explicit compatibility decision.
- Every measured specialist fixture meets the expected column or has a metafile-backed exception.

### Phase 3 — make default composition tiny

This is the first behavior/performance-topology change. Outputs remain compatible, but automatic runtime fusion moves from default `pipe` to the compiler or an explicit fused entry. Ship it in the documented major-version window if the current release promises automatic runtime fusion as observable performance behavior.

Expected gzip after Phase 3:

| Fixture | Minimum | Expected | Stretch |
|---|---:|---:|---:|
| `pipe` | 0.50 KiB | 0.20-0.40 KiB | 0.10-0.20 KiB |
| `flow` | 0.50 KiB | 0.20-0.40 KiB | 0.10-0.20 KiB |
| common sequential pipeline | 1.50 KiB | 0.35-0.70 KiB | 0.30-0.45 KiB |
| Option through `pipe` | 1.20 KiB | 0.30-0.60 KiB | 0.20-0.35 KiB |

#### Task 3.1 — extract a dependency-free sequential `pipe`

**Files**

- Add `packages/fp/src/pipe-core.ts`.
- Update `packages/fp/src/pipe.ts`.
- Update `packages/fp/src/__tests__/pipe.test.ts`.
- Split current fusion-specific tests from `pipe-fastpath.test.ts` and `pipe-fusion.test.ts`.

**Change**

- Preserve current overloads.
- Hand-unroll common arities through five steps, as current untagged branches do, then use a loop for longer chains.
- Remove all static imports from `compile.ts`, `plan.ts`, `lower.ts`, `registry.ts`, and `shape-entry.ts`.
- Treat tagged steps as ordinary callable functions; do not inspect `_op`.
- Add evaluation-order and error-propagation tests for arities 0 through 10.

**Validation**

```bash
bunx vitest run packages/fp/src/__tests__/pipe.test.ts
bun run --cwd packages/fp check:types
bun run --cwd benchmarks perf:consumer-size --fixtures pipe-alone,option-pipe,filter-map-take
```

**Completion criteria**

- `pipe` has no runtime import besides type-only declarations.
- `pipe` is `<= 512` gzip bytes in every bundler.
- Exact semantics match the old untagged path for all fixtures.

#### Task 3.2 — implement dependency-free `flow`

**Files**

- Add `packages/fp/src/flow-core.ts` or reuse `pipe-core.ts` without importing the engine.
- Update `packages/fp/src/flow.ts`.
- Update `packages/fp/src/__tests__/flow.test.ts`.

**Change**

- Preserve zero-, one-, and multi-step behavior, especially one-step function identity if currently observable.
- Hand-unroll common arities where it improves runtime without exceeding 0.5 KiB.
- Do not implement `flow` by importing a heavy `pipe` overload/declaration module if a smaller shared runtime helper is possible.

**Validation**

```bash
bunx vitest run packages/fp/src/__tests__/flow.test.ts
bun run --cwd benchmarks perf:consumer-size --fixtures flow-alone
```

**Completion criteria**

- `flow <= 512` gzip bytes across all bundlers.
- Single-function identity and thrown errors match current tests.

#### Task 3.3 — narrow the root and stage compatibility

**Files**

- Update `packages/fp/src/index.ts`.
- Update `packages/fp/module-manifest.ts`.
- Update `packages/fp/package.json`.
- Update `packages/fp/scripts/check-package-contract.ts`.
- Add a changeset and migration/codemod documentation.

**Change**

- Keep root `pipe`, `flow`, and the current minimal Option/Result constructors and guards.
- Remove `compile`, `compilePure`, `explain`, and public generic `dual` from the root in the next major; retain `@stopcock/fp/compile` and `@stopcock/fp/dual` during the compatibility window.
- In the preceding minor, document and optionally warn via types/docs, not runtime side effects.
- Align the version story: the live package says 1.0.0 while `module-manifest.ts`, CI names, compiler README, and compiler peer dependency refer to 2.x. Decide the actual target major before changing export contracts.

**Validation**

```bash
bun run --cwd packages/fp manifest:check
bun run --cwd packages/fp check:contract
bun run --cwd benchmarks perf:consumer-size --fixtures root-named,root-namespace,root-namespace-enumerated
```

**Completion criteria**

- The major's root export list is intentionally pinned.
- Static named imports stay below 0.5 KiB for the small fixture.
- Enumerated root is below 8 KiB, expected below 3 KiB.
- A migration table maps every removed root name to a stable subpath.

### Phase 4 — harden compiler-assisted elimination

Expected gzip after Phase 4:

| Fixture | Minimum | Expected | Stretch |
|---|---:|---:|---:|
| common compiled pipeline | 1.00 KiB | 0.15-0.40 KiB | 0.12-0.25 KiB |
| reduce compiled pipeline | 1.00 KiB | 0.13-0.35 KiB | under 0.20 KiB |
| deep compiled pipeline | 1.00 KiB | 0.20-0.50 KiB | under 0.30 KiB |
| compiled site runtime graph | absent | absent | absent |

#### Task 4.1 — prune now-dead import specifiers

**Files**

- Update `packages/fp-compiler/src/transform.ts`.
- Update `packages/fp-compiler/src/__tests__/transform.test.ts`.
- Update `packages/fp-compiler/src/__tests__/hosts.test.ts`.

**Change**

- After transforming a site, use binding/reference information to remove only `pipe`/`flow`/`compile` and operator import specifiers with zero remaining references.
- Remove an import declaration only when every specifier is dead.
- Preserve type-only imports, side-effect-only imports, aliases, namespace imports with remaining properties, comments, and ordering.
- Do not rely solely on downstream tree-shaking for generic runtime elimination.

**Validation**

```bash
bunx vitest run packages/fp-compiler/src/__tests__/transform.test.ts packages/fp-compiler/src/__tests__/hosts.test.ts
```

**Completion criteria**

- Host bundles contain no compile/plan/lower/registry/template module for fully compiled fixtures.
- Mixed transformed/untransformed files keep exactly the imports needed by fallback sites.

#### Task 4.2 — make coverage and fallback explicit

**Files**

- Update `packages/fp-compiler/src/types.ts`.
- Update `packages/fp-compiler/src/plugin.ts`.
- Update `packages/fp-compiler/src/transform.ts`.
- Update `packages/fp-compiler/README.md`.

**Change**

- Preserve fail-open runtime fallback as the default.
- Add a machine-readable report option containing files, discovered sites, transformed sites, skips, reasons, and retained runtime imports.
- Keep `diagnostics: 'error'` for strict builds and add a minimum coverage threshold scoped by include/exclude patterns.
- Treat parse failure as an explicit skip in summary output; strict mode must fail rather than silently returning unchanged code.
- Distinguish unsupported semantics from implementation gaps.

**Validation**

```bash
bunx vitest run packages/fp-compiler/src/__tests__/plugin.test.ts packages/fp-compiler/src/__tests__/transform.test.ts
```

**Completion criteria**

- A production sample configured for 100% coverage fails on a spread/dynamic pipeline.
- Default mode preserves the source and reports the fallback reason.

#### Task 4.3 — preserve canonical Option/Result outputs in compiled terminals

**Files**

- Update `packages/fp-compiler/src/codegen.ts`.
- Update `packages/fp-compiler/src/ops.ts` and generated `ops-table.ts`.
- Add compiler semantic fixtures for every Option-returning terminal.

**Change**

- Do not inline a new `{ _tag: 0 }` if callers can observe `=== none`.
- Import the narrow canonical singleton entry or generate code that uses an already-live binding.
- Make singleton imports independently tree-shakeable and budget them.
- Cover empty/non-empty `head`, `last`, `find`, `findMap`, `min`, and `max`.

**Validation**

```bash
bunx vitest run packages/fp-compiler/src/__tests__/transform.test.ts packages/fp/src/__tests__/semantics-fixtures.test.ts
bun run --cwd benchmarks perf:consumer-size --fixtures compiler-option-terminals
```

**Completion criteria**

- Compiled results are reference-equal to exported `none` where the runtime path is.
- Option-terminal compiled fixture remains below 1 KiB.

#### Task 4.4 — validate callbacks, source maps, and development behavior

**Files**

- Extend `packages/fp-compiler/src/__tests__/harness.ts`.
- Extend `packages/fp-compiler/src/__tests__/transform.test.ts`.
- Add `packages/fp-compiler/src/__tests__/source-maps.test.ts`.

**Change**

- Cover static arrows, callback identifiers, member/bound functions, destructuring, block bodies, closure capture, async rejection, `this`, `arguments`, side effects, throws, and callbacks unsafe to inline.
- Verify source-map positions for the pipeline expression, callback throw, and generated loop.
- Define development default: transform with high-resolution source maps and diagnostics, or allow a documented build-only mode. Do not silently run different semantics in dev and production.

**Validation**

```bash
bunx vitest run packages/fp-compiler/src/__tests__/source-maps.test.ts packages/fp-compiler/src/__tests__/transform.test.ts
```

**Completion criteria**

- Every unsafe callback either compiles via hoisting with equivalent semantics or reports a runtime fallback.
- Stack/source positions resolve to the original file and line.

#### Task 4.5 — complete host coverage, including Rspack

**Files**

- Update `packages/fp-compiler/src/__tests__/hosts.test.ts`.
- Update package exports only if a dedicated Rspack adapter is actually required.

**Change**

- Continue exercising Vite, Rollup, esbuild, and Webpack.
- Add Rspack using the Webpack adapter first; do not create a duplicate adapter unless compatibility fails.
- Test packed packages, not only workspace source.
- Assert output behavior, absence of runtime engine strings/modules, and budget.

**Validation**

```bash
bunx vitest run packages/fp-compiler/src/__tests__/hosts.test.ts packages/fp-compiler/src/__tests__/pack.test.ts
```

**Completion criteria**

- All hosts emit equivalent outputs and source maps.
- Fully compiled common fixture is `<= 1,024` gzip bytes in every host.

### Phase 5 — build the compact explicit fusion runtime

This phase has a hard dual gate: size and performance. Do not replace the current optimized runtime merely because a small interpreter passes correctness.

Expected compact-runtime gzip:

| Checkpoint | Minimum | Expected | Stretch |
|---|---:|---:|---:|
| generic exact engine before specializations | 6.0 KiB | 5.0-5.5 KiB | under 5 KiB |
| final compact engine | 5.5 KiB interim | 4.5-5.0 KiB | 4.0-4.5 KiB |
| debug/explain incremental entry | separately budgeted | 1-3 KiB | under 1 KiB |

#### Task 5.1 — introduce explicit fused entry points without moving implementation

**Files**

- Add `packages/fp/src/fusion.ts`.
- Update `packages/fp/module-manifest.ts`.
- Update `packages/fp/package.json`.
- Add `packages/fp/src/__tests__/fusion-entry.test.ts`.

**Change**

- Export `pipeFused`, `flowFused`, `compile`, and `compilePure` from `@stopcock/fp/fusion`.
- Initially delegate to the current engine so API migration can begin before compacting.
- Keep the default root disconnected.

**Validation**

```bash
bun run --cwd packages/fp manifest:check
bunx vitest run packages/fp/src/__tests__/fusion-entry.test.ts
```

**Completion criteria**

- Explicit fused APIs match current compile/fused behavior.
- Default `pipe` bundle does not contain `fusion.ts` or any engine module.

#### Task 5.2 — replace eager string registry with compact step metadata

**Files**

- Add `packages/fp/src/fusion/metadata.ts`.
- Update `packages/fp/src/registry.ts` or leave it debug-only.
- Update `packages/fp/src/plan.ts`.
- Update tagged-operation generation in `packages/fp/codegen/dual-inline.ts`.
- Update `packages/fp/src/__tests__/registry.test.ts` and `plan-interpreter.test.ts`.

**Change**

- Encode domain, cardinality, binding layout, and boundary class as a compact numeric bitfield or small frozen arrays indexed by opcode.
- Prefer metadata carried by tagged steps where that lets unselected op families disappear.
- Move operation names, descriptions, and rich validation messages to debug metadata.
- Remove module-evaluation `Map` construction from the production fusion entry.
- Unknown/malformed public tags must fail or fall back exactly as current behavior specifies; never reinterpret an opcode silently.

**Validation**

```bash
bunx vitest run packages/fp/src/__tests__/registry.test.ts packages/fp/src/__tests__/plan-interpreter.test.ts packages/fp/src/__tests__/optimizer-regressions.test.ts
bun run --cwd benchmarks perf:consumer-size --fixtures explicit-compact-fusion
```

**Expected reduction**

- Remove most of the current registry region's 1,411 region-alone gzip bytes and its eager `Map`.

**Completion criteria**

- Production compact bundle contains no operation-name registry and no eager metadata `Map`.
- Debug entry still produces current useful names/explanations.

#### Task 5.3 — split production compile from explain/stats/pure diagnostics

**Files**

- Split `packages/fp/src/compile.ts` into:
  - `packages/fp/src/fusion/compile.ts`;
  - `packages/fp/src/fusion/pure.ts`;
  - `packages/fp/src/fusion/debug.ts`;
  - `packages/fp/src/fusion/cache.ts`.
- Add `packages/fp/src/fusion-debug.ts` public facade.

**Change**

- Keep exact runtime execution in the production entry.
- Move `PipelineExplanation`, `explain*`, optimizer counters, names, and reporting strings behind `@stopcock/fp/fusion/debug`.
- Preserve bounded cache behavior and explicit reset APIs where public.
- Ensure importing debug adds code; importing production must not retain debug.

**Validation**

```bash
bunx vitest run packages/fp/src/__tests__/compile.test.ts packages/fp/src/__tests__/shape-entry.test.ts
bun run --cwd benchmarks perf:consumer-size --fixtures explicit-compact-fusion,fusion-debug
```

**Completion criteria**

- Metafiles show no debug module in production.
- Existing explanation snapshots pass from the debug entry.

#### Task 5.4 — reduce the portable-template bank to measured specializations

**Files**

- Update `packages/fp/codegen/portable-templates.ts`.
- Update generated `packages/fp/src/portable-templates.ts`.
- Update `packages/fp/src/lower.ts`.
- Update `packages/fp/src/__tests__/portable-templates.test.ts`.
- Update portable corpus contract hashes only with reviewed evidence.

**Change**

- Make the generic lowerer the correctness fallback for every supported opcode/shape.
- Keep specialized runners only for cases that:
  1. materially improve an existing gated stratum;
  2. are common enough to justify bytes; and
  3. keep the compact entry within budget.
- Generate a manifest with each specialization's raw/min/gzip delta and matched benchmark cases.
- Do not generate all combinations up to length three merely because they are possible.
- Keep the full bank available only in the optional optimized runtime if it remains necessary.

**Validation**

```bash
bun run --cwd packages/fp codegen
bunx vitest run packages/fp/src/__tests__/portable-templates.test.ts packages/fp/src/__tests__/optimizer-regressions.test.ts
bun run --cwd benchmarks perf:portable:bun
bun run --cwd benchmarks perf:portable:node
bun run --cwd benchmarks perf:consumer-size --fixtures explicit-compact-fusion
```

**Completion criteria**

- Every removed template has generic semantic coverage.
- Compact entry meets its size budget.
- Existing portable performance policies still pass, or the compact runtime is not advertised/released as the replacement for the optimized tier.

#### Task 5.5 — preserve an optional maximum-throughput runtime

**Files**

- Prefer a new `packages/fp-optimizer/` package with its own manifest, build config, tests, README, and changeset; alternatively use an isolated `@stopcock/fp/fusion/optimized` entry if tarball budgets still pass.
- Move or generate the full template bank into that boundary.
- Add pack and consumer tests.

**Change**

- Keep CSP-safe portable closures; do not introduce `eval` or `new Function`.
- Depend on public/tag metadata contracts rather than private filesystem imports.
- Document when runtime-only users should select it.
- Ensure the main package does not statically import it and does not require it for correctness.

**Validation**

```bash
vp run build:packages
bunx vitest run packages/fp-optimizer/src/__tests__
bun run --cwd benchmarks perf:portable:bun
bun run --cwd benchmarks perf:portable:node
bun run --cwd benchmarks perf:consumer-size --fixtures explicit-optimized-fusion
```

**Completion criteria**

- Optimized tier passes current portable gates.
- Main default and compact bundle metafiles contain no optimizer/template-bank module.
- Package dependency direction has no cycle.

### Phase 6 — change build, declaration, and publish topology

Expected tarball after Phase 6:

| Outcome | Budget |
|---|---:|
| minimum acceptable compatibility release | 105 KiB |
| expected narrow main package | 92-99 KiB |
| stretch | 80-90 KiB |

#### Task 6.1 — make output topology intentional

**Files**

- Update `tooling/pack.config.ts`.
- Update `packages/fp/vite.config.ts`.
- Update `packages/fp/module-manifest.ts`.
- Add `packages/fp/scripts/check-dist-topology.ts`.

**Change**

- Stop assuming one broad shared chunk is always beneficial.
- Keep direct-operation facades tree-shakeable and prevent engine code from entering utility chunks.
- Give fusion/debug/optimized boundaries stable logical entry names.
- Permit Rollup/Rolldown shared chunks only when they reduce transitive entry closures in the multi-entry fixtures.
- Assert that root, array, Option, and Result entries do not import fusion modules.
- Do not pre-minify published ESM; continue allowing consumer bundlers to optimize it.

**Validation**

```bash
node tooling/build-package.mjs
bun run --cwd packages/fp scripts/check-dist-topology.ts
bun run --cwd benchmarks perf:consumer-size --multi-entry
```

**Completion criteria**

- A direct-map route is not polluted by a fused route's shared chunk.
- No duplicate engine chunk is emitted for two fused entries.
- Each entry's closure meets its budget.

#### Task 6.2 — emit only reachable public declarations

**Files**

- Update `tooling/build-package.mjs`.
- Add `tooling/prune-package-declarations.mjs` or integrate a declaration rollup step.
- Update `packages/fp/scripts/check-package-contract.ts`.
- Update package `tsconfig` files only as required.

**Change**

- After `tsc --emitDeclarationOnly`, compute the closure from every `exports[*].types` target.
- Fail on missing/leaked references, then omit unreachable internal declarations.
- Move public explanation types out of internal registry/plan declarations so `compile.d.ts` does not make implementation modules public by reference.
- Prefer shared public type helpers where this reduces repeated declarations without weakening editor navigation or inference.
- Do not delete declarations merely by filename denylist; reachability must be derived from the export map.

**Validation**

```bash
node tooling/build-package.mjs
bun run --cwd packages/fp check:contract
bun run --cwd packages/fp check:types
```

**Expected reduction**

- Immediate safe removal: 41,590 raw declaration bytes, about 2.8 KiB from the packed tarball.
- Further reduction must come from public type factoring/rolling, not whitespace-only minification.

**Completion criteria**

- Packed consumers type-check every public subpath.
- No unreachable declaration is present.
- No explicit `any` or source/internal filesystem path leaks.

#### Task 6.3 — optimize declaration representation without degrading DX

**Files**

- Update generated public type templates in `packages/fp/codegen/defs/*.ts`.
- Add shared types under `packages/fp/src/types.ts` or a dedicated public declaration-only module.
- Add editor/type inference fixtures.

**Change**

- Factor repeated dual overload shapes only where TypeScript preserves inference, refinements, readonly inputs, and currying.
- Keep special overloads for predicates/refinements and tuple-sensitive operations.
- Compare declaration parse time and hover/signature quality before and after.
- Do not strip README or LICENSE to manufacture the target. CHANGELOG inclusion may be reconsidered only after measuring and documenting consumer value.

**Validation**

```bash
bun run --cwd packages/fp check:types
bun run test:types
bun run --cwd packages/fp check:contract
bun run --cwd benchmarks perf:package-size
```

**Completion criteria**

- Tarball is below 100 KiB expected budget.
- Declaration type-check wall time does not regress by more than 5%.
- Public inference snapshots are unchanged.

#### Task 6.4 — replace the topology-specific package-size gate

**Files**

- Update `benchmarks/src/reference/fp-package-size-gate.ts`.
- Update `benchmarks/src/reference/fp-package-size-gate.test.ts`.

**Change**

- Remove the assumption that `compile.js` and `index.js` share one `compile-*` file.
- Gate main tarball, optional optimizer tarball, declaration bytes, unreachable files, root closure, compact fusion closure, and duplicate chunks.
- Use minimum/expected release ceilings: initially 105 KiB during migration, then 100 KiB once compatibility files are removed.
- Keep raw and gzip measurements; do not replace consumer gates with package gates.

**Validation**

```bash
bunx vitest run benchmarks/src/reference/fp-package-size-gate.test.ts
bun run --cwd benchmarks perf:package-size
```

**Completion criteria**

- Tests reject duplicate runtime chunks, orphan declarations, and a tarball over budget.

### Phase 7 — CI, release, migration, and documentation

#### Task 7.1 — add fast PR and full release size lanes

**Files**

- Update `.github/workflows/ci.yml`.
- Update `.github/workflows/publish.yml`.
- Update `benchmarks/package.json`.

**Change**

- PR lane: esbuild + Rolldown core fixture set, packed package, behavior validation.
- Full performance/release lane: esbuild, Rollup, Rolldown/Vite+, Webpack, Rspack, multi-entry closures, gzip/Brotli, compiler fixtures, and peer informational report.
- Upload raw reports and bundle metafiles as artifacts.
- Run size gates after building the exact package tarballs that would publish.
- Keep performance lanes on Bun/JSC and Node/V8; size must not replace performance.

**Validation**

```bash
bun run --cwd benchmarks perf:consumer-size --profile pr
bun run --cwd benchmarks perf:consumer-size --profile release
bun run --cwd benchmarks perf:package-size
```

**Completion criteria**

- Publish workflow cannot proceed after a size, behavior, type, compiler-coverage, or performance failure.

#### Task 7.2 — publish a compatibility and migration matrix

**Files**

- Update `packages/fp/README.md`.
- Update `packages/fp/MIGRATION.md`.
- Update `packages/fp-compiler/README.md`.
- Add optimizer README if Phase 5 creates a package.
- Add a changeset.

**Change**

- Explain default sequential, compiler-fused, compact runtime-fused, and optimized runtime-fused choices with measured costs.
- Map old root `compile`/`dual` imports to subpaths.
- Explain compiler fail-open versus strict coverage.
- State CSP behavior and that no runtime code generation occurs.
- Include Vite, Rollup, esbuild, Webpack, and Rspack setup.
- Publish real measured numbers from CI artifacts, not hand-maintained claims.

**Completion criteria**

- A user can choose a tier without reading source.
- Every migration example is compiled in documentation tests.

#### Task 7.3 — release in rollback-safe steps

**Sequence**

1. Non-breaking purity and dual split.
2. Compiler report/import-pruning improvements.
3. Add explicit fusion entry and optional optimizer.
4. Publish deprecations and codemod.
5. Major release with tiny default composition and narrow root.
6. Remove compatibility files only after adoption window and package telemetry/feedback.

**Rollback points**

- Phase 1 can revert annotations independently if a side effect was misclassified.
- Phase 2 can restore public dual delegation without changing public calls.
- Phase 3 can temporarily re-export the old fused pipe from a compatibility entry.
- Phase 5 can keep compact fusion experimental while the optimized tier remains stable.
- Phase 6 can raise the interim tarball ceiling without relaxing consumer bundle ceilings.

## Correctness test matrix

Each row must compare direct operation, sequential pipe, compact fusion, optimized fusion, and compiler output where applicable.

| Dimension | Required cases |
|---|---|
| data orientation | every supported op data-first and data-last |
| input sizes | empty, one, small, large |
| sparse arrays | holes, explicit `undefined`, inherited numeric properties if currently relevant |
| callback behavior | order, count, index, closure capture, mutation, throw on Nth call |
| early exit | `take`, `takeWhile`, `find`, `some`, `every`, `none`, `findIndex`, `findMap` |
| boundaries | sort, sortBy, scan, without, flatten, uniq, reverse, tail, init |
| terminal forms | collect, reduce-like, Option-returning, boolean, numeric |
| errors | source throw, operator-construction throw, callback throw, reducer throw |
| identity | `flow(fn) === fn` if current; canonical `none`; returned unchanged Result error branches |
| evaluation order | source, callbacks, thresholds/seeds, later steps not evaluated after failure |
| mutation | readonly input remains unmodified unless API explicitly promises mutation |
| iterables | arrays stay arrays; generic iterables are not silently materialized |
| platform | Bun/JSC, Node/V8, browser bundle, strict CSP |
| types | refinements, tuples, readonly, generic callbacks, curried inference, errors |
| compiler fallback | unsupported spread/dynamic sites execute sequential/runtime path exactly |

Use existing suites:

- `packages/fp/src/__tests__/semantics-fixtures.test.ts`;
- `plan-interpreter.test.ts`;
- `optimizer-regressions.test.ts`;
- `pipe*.test.ts`;
- `array.test.ts`;
- `option.test.ts`;
- `result.test.ts`;
- `packages/fp-compiler/src/__tests__/harness.ts` and `transform.test.ts`;
- `benchmarks/src/reference/fuzz-correctness.test.ts`.

Add property/fuzz cases that generate valid opcode chains and compare all tiers against `interpret`. Persist the seed and minimized counterexample for every failure.

## Runtime performance policy

Bundle work is accepted only when the relevant performance lane passes. Keep hot throughput, cold start, allocation, and bundle bytes as separate report fields.

### Existing gates to retain

- Portable runtime corpus: 44 pinned cases.
  - Bun/JSC: global geomean `>= 1.20`, no case below `0.80`, RME `<= 6%`, with current stratum floors.
  - Node/V8: global geomean `>= 1.15`, no case below `0.85`, RME `<= 5%`, with current stratum floors.
- Compiler corpus: all 44 portable cases supported.
  - both engines geomean `>= 0.90`;
  - Bun/JSC no case below `0.80`;
  - Node/V8 no case below `0.70`.
- Compiler operation corpus: 39 operations/37 timed performance rows plus optimizer canaries.
- Current pipe dispatch gate:
  - Bun/JSC geomean `>= 0.98`;
  - Node/V8 geomean `>= 0.96`;
  - preserve current per-case floors for stable/fresh closures until the gate is split by tier.

### Required new separated lanes

| Lane | Comparison | Release threshold |
|---|---|---|
| direct array ops | candidate versus pre-change same-process baseline | geomean `>= 0.98`; no common op below `0.95`; allocations no worse than baseline |
| short sequential pipe | candidate versus current untagged hand-unrolled path | geomean `>= 0.98`; each arity 1-5 `>= 0.95` |
| long sequential pipe | candidate versus current untagged loop | geomean `>= 0.97`; no extra array allocation |
| compact runtime fusion | candidate versus current portable runtime over pinned corpus | retain existing portable stratum policies; if it cannot, publish it as compact fallback, not the performance replacement |
| optimized runtime fusion | candidate versus current portable runtime | retain all existing policies; expected geomean `>= 1.00` |
| early-exit pipelines | same-process reference with consumed-item accounting | no callback-count drift; geomean `>= 0.95`; no case below `0.90` |
| warm cached fusion | stable steps after cache warmup | meet current pipe-dispatch/portable floors; cache hit rate and max size reported |
| cold fusion | first plan/lower/run in fresh process | median latency no worse than current; expected at least 20% improvement for compact tier |
| fresh closures | new data-last callbacks each call | retain current fresh-2/fresh-3 floors and report allocations |
| CSP/interpreted | compact runtime with code generation prohibited | same compact-runtime floors; explicit assertion no `eval`/`Function` |
| compiler execution | emitted loop versus frozen emitter | retain compiler policies; expected geomean `>= 1.00` |

Cold-start reports must separate:

- module parse/evaluation;
- first operator construction;
- first plan build/lower;
- first execution;
- first cache hit;
- steady-state execution.

Allocation reports must separate:

- operator-construction closure;
- intermediate arrays in sequential fallback;
- plan/binding allocation;
- cache growth/eviction;
- per-element allocation;
- compiler-emitted loop allocation.

Do not average these into a single “performance score.” A release can pass hot throughput and still fail cold-start or memory.

## Bundle-size gate policy

### Required core fixtures

Gate all of these in every supported bundler:

- pipe and flow alone;
- direct and data-last map;
- common collect and reduce pipelines;
- deep pipeline;
- Option and Result flows;
- object/string and unrelated helpers;
- root named/static namespace/enumerated namespace;
- explicit compact fusion;
- explicit optimized fusion;
- compiler-lowered collect/reduce/deep;
- two-entry fused plus one-entry direct code-splitting application.

### Gate rules

- Use absolute byte ceilings, not only percentage change.
- Require behavior validation of the minified artifact.
- Gate gzip and record Brotli; add Brotli ceilings after two stable releases.
- Gate each bundler independently.
- Gate the transitive closure for each entry in a code-split application.
- Record module attribution for every failure and show the largest positive deltas.
- Pin fixture and tool identities so changing the denominator requires review.
- Keep peers informational; do not fail a release merely because a peer changes, but fail if Stopcock exceeds its own target.
- Do not allow a smaller direct fixture to compensate for an oversized fusion runtime.

## Compiler failure and fallback semantics

| Situation | Default behavior | Strict production behavior |
|---|---|---|
| parse failure | leave file unchanged, report skip | fail build |
| unrecognized import source | ignore | ignore unless included by configured source |
| spread/dynamic step list | sequential/runtime fallback, report reason | fail if within strict coverage scope |
| unsupported operator | fallback, report operator | fail if coverage requires site |
| unsafe callback to inline | hoist if semantics proven; otherwise fallback | fail only when strict coverage requires |
| `compilePure` rewrite not represented AOT | preserve runtime pure behavior | fail rather than silently compile exact-mode behavior |
| mixed transformed/fallback sites | prune only dead specifiers | report retained runtime graph |
| source-map generation failure | preserve source and report | fail build |

The compiler may be optional for correctness. It may be required by an application's performance/size policy, which is why strict coverage is an application build setting rather than the library's default.

## Package footprint strategy

1. Remove unreachable declarations by computed closure.
2. Move the full portable-template optimizer outside the main default graph and, if necessary, to a separate package.
3. Keep README and LICENSE. Measure CHANGELOG separately before deciding whether it belongs in the tarball.
4. Do not publish source maps unless consumers request them and a separate budget is approved; current build emits none.
5. Keep one implementation of helpers; do not copy algorithms into each public facade.
6. Generate export metadata from `module-manifest.ts` and validate it.
7. Measure dependency install footprint for `@stopcock/fp`, compiler dev dependency, and optional optimizer separately and together.
8. Treat the package version/peer mismatch as a release blocker before splitting packages.

## Risks, dependencies, and mitigations

| Risk | Impact | Mitigation / decision gate |
|---|---|---|
| Pure annotation misclassifies a side effect | silent behavior loss after minification | explicit allowlist, generated purity tests, packed-bundle behavior tests |
| Sequential default loses automatic runtime speed | user-visible regression without compiler | major migration, explicit fused tier, compiler docs, per-tier benchmarks |
| Compact engine meets size but fails throughput | misleading “high performance” claim | dual size/performance gate; retain optional optimized tier |
| Compiler misses dynamic production sites | larger/slower fallback | machine report, strict scoped coverage, fail-open correctness |
| Import pruning removes a live binding | build/runtime failure | binding-reference analysis and mixed-site fixtures |
| Inlined Option terminal breaks singleton identity | subtle semantic divergence | canonical singleton import and reference-equality tests |
| New export topology breaks root imports | compile failures for consumers | minor deprecation, codemod, major release, compatibility matrix |
| Shared chunks contaminate light routes | route regression despite smaller aggregate | transitive-entry closure gate |
| Declaration factoring weakens inference | API quality regression | dts tests, editor snapshots, parse-time measurement |
| Package split creates dependency cycles/version skew | install/runtime failures | one-way metadata contract, synchronized changesets, packed integration tests |
| Rspack differs from Webpack adapter | untested build path | real host test before claiming support |
| Vite+/Rolldown changes chunk heuristics | drift after tool upgrade | pin report tool identity and re-baseline only with review |
| Optional optimizer shifts cost to users | poor ergonomics | default compiler presets, clear decision guide, compact runtime fallback |
| Debug split removes useful production diagnostics | operability loss | explicit debug entry and documented instrumentation |

## Dependencies and ordering

- Phase 0 precedes every size claim.
- Phase 1 should land before output topology changes; it gives immediate user value and trustworthy tree-shaking.
- Phase 2 precedes root narrowing so Option/Result and specialist modules have stable small primitives.
- Compiler import pruning can proceed in parallel with Phase 3 after the fixture contract exists.
- Compact runtime metadata and template reduction require the opcode/codegen changes from Phase 2.
- Tarball/declaration work should measure the final engine/package boundary; doing a declaration rollup before export topology stabilizes creates churn.
- The version/peer-dependency decision blocks the public breaking release but not internal experiments or Phase 1.

## Final acceptance checklist

### Correctness and API

- [ ] All current runtime and type tests pass on Node 22 and Node 24 where currently required.
- [ ] Data-first/data-last behavior is identical.
- [ ] Option/Result representations and canonical `none` identity are preserved.
- [ ] Sparse arrays, callback order/count, early exit, mutation, `this`, and errors are tested across tiers.
- [ ] No runtime code generation; strict CSP fixture passes.
- [ ] Existing imports have either remained valid or have an approved major migration/codemod.
- [ ] Published declarations contain no explicit `any`, missing target, or internal filesystem leak.

### Default bundle

- [ ] `pipe <= 0.5 KiB` gzip in esbuild, Rollup, Rolldown, and Webpack.
- [ ] `flow <= 0.5 KiB`.
- [ ] direct `map <= 0.5 KiB`.
- [ ] Option flow `<= 0.9 KiB`, expected `<= 0.45 KiB`.
- [ ] sequential common pipeline `<= 1.5 KiB`, expected `<= 0.7 KiB`.
- [ ] enumerated narrow root `<= 8 KiB`, expected `<= 3 KiB`.
- [ ] No default/direct fixture contains compile, plan, lower, registry, shape cache, or portable templates.

### Fusion and compiler

- [ ] Compiler common pipeline `<= 1.0 KiB` in every host and contains no generic runtime.
- [ ] Compact explicit fusion `<= 5.0 KiB` expected, or release notes use the honest interim ceiling.
- [ ] Optimized runtime is absent unless explicitly imported.
- [ ] Compiler coverage/fallback report is complete and strict mode fails intentional unsupported sites.
- [ ] Vite, Rollup, esbuild, Webpack, and Rspack host tests pass with source maps.

### Performance

- [ ] Direct-op geomean and per-case floors pass.
- [ ] Short/long sequential pipe floors pass.
- [ ] Early-exit callback counts and throughput floors pass.
- [ ] Cold, warm-cache, and fresh-closure reports pass independently.
- [ ] Compact and optimized runtime claims match the tier's actual gate results.
- [ ] Compiler corpus and operation-corpus gates pass on Bun/JSC and Node/V8.
- [ ] Allocation reports show no unexplained regression.

### Package and release

- [ ] Main tarball is `<= 100 KiB` expected budget.
- [ ] No unreachable internal declarations are published.
- [ ] Multi-entry direct routes are not polluted by fusion shared chunks.
- [ ] Consumer-size and package-size reports are uploaded in CI.
- [ ] Publish workflow blocks on behavior, size, type, compiler, and performance failures.
- [ ] README/MIGRATION explain all tiers with CI-produced numbers.
- [ ] Package, manifest, CI naming, README, and compiler peer versions agree.

## Expected full-plan result

If every phase passes its correctness and performance gates, the realistic final browser costs are:

- `pipe` or `flow`: 0.20-0.40 KiB gzip;
- direct `map`: 0.20-0.30 KiB;
- Option construct/map/fallback: 0.25-0.45 KiB;
- ordinary sequential `filter -> map -> take`: 0.35-0.70 KiB;
- build-time compiled common pipeline: 0.15-0.40 KiB, with the generic runtime absent;
- explicit compact runtime fusion: 4.5-5.0 KiB, conditional on preserving its advertised performance floor;
- enumerated narrow root: 1.5-3.0 KiB;
- main `@stopcock/fp` tarball: 92-99 KiB;
- optional maximum-throughput runtime: about 9.5-11 KiB only when explicitly selected.

The recommended product position is therefore: a tiny, always-correct sequential runtime; direct utilities that tree-shake to hand-written-loop scale; automatic zero-runtime fusion for build-tool users; a compact CSP-safe runtime fallback for explicit fusion; and an isolated maximum-throughput runtime for applications that genuinely need it.
