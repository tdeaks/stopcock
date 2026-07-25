# Phase 5 Implementation Plan: Benchmarks + Examples

## Summary
- Add a `benchmarks/` workspace package with vitest bench for performance measurement against Remeda, Lodash, Ramda, and native.
- Micro-benchmarks (per function) and macro-benchmarks (pipeline chains, fusion).
- Add `examples/` directory with runnable TypeScript files demonstrating the full API.
- Local-only — no CI integration.

## Implementation Changes

- Root:
    - Update root `package.json` workspaces from `["packages/*"]` to `["packages/*", "benchmarks"]`.
    - No turbo.json changes — benchmarks are run manually, not part of the build/test pipeline.
- New package:
    - `benchmarks/package.json` — depends on `stopcock`, `remeda`, `lodash-es`, `ramda`, `@types/ramda`.
    - `benchmarks/vitest.config.ts` — bench mode config.
    - `benchmarks/tsconfig.json` — extends `../tsconfig.base.json`, `noEmit: true`.
- New benchmark files:
    - `benchmarks/src/setup.ts` — shared data generators.
    - `benchmarks/src/array-map.bench.ts`
    - `benchmarks/src/array-filter.bench.ts`
    - `benchmarks/src/array-sort.bench.ts`
    - `benchmarks/src/array-uniq.bench.ts`
    - `benchmarks/src/number-stats.bench.ts`
    - `benchmarks/src/pipeline-fusion.bench.ts`
    - `benchmarks/src/pipeline-complex.bench.ts`
- New example files:
    - `examples/quick-start.ts`
    - `examples/pipe-and-flow.ts`
    - `examples/option-result.ts`
    - `examples/array-operations.ts`
    - `examples/fusion.ts`

## Execution Order

### 1. Benchmark package scaffold

- Create `benchmarks/package.json`:
    ```json
    {
      "name": "benchmarks",
      "private": true,
      "type": "module",
      "scripts": {
        "bench": "vitest bench"
      },
      "dependencies": {
        "stopcock": "workspace:*",
        "remeda": "latest",
        "lodash-es": "latest",
        "ramda": "latest"
      },
      "devDependencies": {
        "@types/ramda": "latest",
        "@types/lodash-es": "latest"
      }
    }
    ```
- Create `benchmarks/vitest.config.ts` with bench mode: `include: ["src/**/*.bench.ts"]`.
- Create `benchmarks/tsconfig.json` extending base, `noEmit: true`, includes `src/`.
- Update root `package.json` workspaces to include `"benchmarks"`.
- Run `bun install` to link workspace.
- Verify: `cd benchmarks && bun run bench` runs (even if no bench files yet).

### 2. setup.ts — shared data generators

Pre-generate arrays at four sizes to avoid allocation noise in benchmarks:

```ts
const SIZES = [100, 1_000, 10_000, 100_000] as const

// For each size:
numbersN    // number[] of random floats (0-1)
stringsN    // string[] of random 5-char words
objectsN    // { id: number, name: string, active: boolean }[]
```

Use a seeded PRNG (e.g. simple xorshift) so data is deterministic across runs.

Export a helper: `getData(type, size)` → returns the pre-generated array.

### 3. Micro-benchmarks

Each file follows the same pattern:

```ts
import { bench, describe } from "vitest"
import { A } from "stopcock"
import * as R from "remeda"
import * as _ from "lodash-es"
import * as Ra from "ramda"
import { getData } from "./setup"

describe.each([100, 1_000, 10_000, 100_000])("map — n=%i", (n) => {
  const data = getData("numbers", n)
  const fn = (x: number) => x * 2

  bench("stopcock", () => A.map(data, fn))
  bench("remeda", () => R.map(data, fn))
  bench("lodash", () => _.map(data, fn))
  bench("ramda", () => Ra.map(fn, data))
  bench("native", () => data.map(fn))
})
```

#### array-map.bench.ts
Transform: `x => x * 2`. Measures iteration overhead with minimal callback cost.

#### array-filter.bench.ts
Predicate: `x => x > 0.5`. Filters ~50% to make the workload meaningful.

#### array-sort.bench.ts
Numeric sort comparator: `(a, b) => a - b`. Note: Ramda's `sort` takes comparator first; native `Array.prototype.sort` mutates (copy first for fair comparison).

#### array-uniq.bench.ts
Arrays with ~30% duplicates (generated in setup.ts). Native baseline: `[...new Set(arr)]`. Remeda: `R.unique`. Lodash: `_.uniq`. Ramda: `Ra.uniq`.

#### number-stats.bench.ts
- Sum: all libraries + native reduce + manual for loop.
- Mean: stopcock + lodash + manual.
- Median + stddev: stopcock vs manual implementations (not available in all libraries).

### 4. Macro-benchmarks

#### pipeline-fusion.bench.ts — headline benchmark

Chain: filter positives → double them → take first 10.

This is the benchmark that demonstrates `lay`'s value. On 100K items with `take(10)`, `lay` should dramatically outperform due to early termination — it processes ~20 items instead of 100K.

```ts
describe.each([100, 1_000, 10_000, 100_000])("filter→map→take(10) — n=%i", (n) => {
  const data = getData("numbers", n)

  bench("lay (fused)", () =>
    lay(data, A.filter(x => x > 0.5), A.map(x => x * 2), A.take(10))
  )
  bench("pipe (eager)", () =>
    pipe(data, A.filter(x => x > 0.5), A.map(x => x * 2), A.take(10))
  )
  bench("remeda", () =>
    R.pipe(data, R.filter(x => x > 0.5), R.map(x => x * 2), R.take(10))
  )
  bench("lodash flow", () =>
    _.flow([
      (d: number[]) => _.filter(d, x => x > 0.5),
      (d: number[]) => _.map(d, x => x * 2),
      (d: number[]) => _.take(d, 10),
    ])(data)
  )
  bench("ramda pipe", () =>
    Ra.pipe(Ra.filter((x: number) => x > 0.5), Ra.map((x: number) => x * 2), Ra.take(10))(data)
  )
  bench("native", () =>
    data.filter(x => x > 0.5).map(x => x * 2).slice(0, 10)
  )
})
```

#### pipeline-complex.bench.ts

Chain: filter → map → sort → take first 5. Includes a materialization boundary (sort).

Sizes: 1K, 10K, 100K. Same library comparisons.

Demonstrates that `lay` still wins on fuseable segments even with materialization in the middle — the filter→map segment before sort is fused, and the take after sort is a separate fused segment.

### 5. Examples

All examples should be runnable with `bun run examples/<file>.ts`. They import from `stopcock` (the workspace package).

#### examples/quick-start.ts

Single comprehensive file. Realistic scenario: processing a list of users.

- `pipe` and `flow` basics.
- Array operations with dual signatures (both forms shown).
- Option for missing fields, Result for validation.
- `lay` for a fused pipeline on a large dataset.
- All namespaces demonstrated: `A`, `S`, `D`, `N`, `O`, `R`, `G`.

#### examples/pipe-and-flow.ts

- `pipe` with 2, 5, 10 functions.
- `flow` to create reusable composed transforms.
- Type threading across transforms (`string → number → boolean`).

#### examples/option-result.ts

- `O.fromNullable` for nullable API responses.
- `O.map` / `O.flatMap` chains.
- `R.tryCatch` for throwing functions.
- `R.map` / `R.mapErr` transforms.
- Converting between Option and Result (`O.toResult`, `R.toOption`).
- Pattern matching with `O.match` / `R.match`.

#### examples/array-operations.ts

- Data-first standalone calls vs data-last in pipe.
- Grouped by category: accessors, slicing, HOFs, search, transform, combinators.
- Dict and String operations.

#### examples/fusion.ts

- Side-by-side `pipe` vs `lay` — same ops, different execution model.
- Early termination: large array + `take` + timing comparison.
- Materialization boundaries: sort in the middle.
- Guidance: when `lay` matters (large arrays, take/filter heavy) vs when it doesn't (small arrays, all non-fuseable ops).

## Design Constraints

1. Benchmarks measure iteration overhead — use trivial callbacks (`x * 2`, `x > 0.5`).
2. Pre-generate test data outside the benchmark loop (in `setup.ts`).
3. Each micro-benchmark runs at 4 sizes (100, 1K, 10K, 100K) to show scaling.
4. Seeded PRNG for deterministic data across runs.
5. No CI integration — `bun run bench` only.
6. Examples must be runnable as-is: `bun run examples/quick-start.ts`.
7. Examples use realistic scenarios, not contrived demos.
8. No comments explaining library functions — code should be self-evident.
9. Fair comparisons: copy arrays before native sort (which mutates), adapt API differences across libraries.

## Acceptance Criteria

- `bun install` resolves all benchmark dependencies (remeda, lodash-es, ramda).
- `cd benchmarks && bun run bench` runs all 7 benchmark files and produces results.
- `bun run bench --filter fusion` runs only the fusion benchmark.
- `bun run examples/quick-start.ts` executes without errors.
- All 5 example files run successfully.
- Benchmark results show `lay` outperforming `pipe` on the fusion benchmark (especially at 100K with take).

## Assumptions

- All prior phases (1, 2a–2d, 4a, 4b) are complete.
- `vitest bench` works with Bun as the runtime.
- Lodash-es, Remeda, and Ramda are installed as regular dependencies in the benchmarks package (not devDependencies) since they're used in bench files.
- Examples import from `stopcock` which resolves to the workspace package `packages/fp`.
- `examples/` is a top-level directory, not a workspace package — files are run directly with `bun run`.
- Benchmark numbers will vary by machine. The goal is relative comparison, not absolute performance targets.
