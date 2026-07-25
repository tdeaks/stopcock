# Phase 5: Benchmarks + Examples

## Scope

`benchmarks/` package for performance measurement and `examples/` directory for usage documentation. Local-only benchmarks using vitest bench. No CI integration.

## Decisions

- **vitest bench** for benchmarking (already a devDependency)
- **Comparison targets:** Remeda, Lodash, Ramda, native Array methods
- **Both micro and macro benchmarks** — per-function performance + pipeline chain performance
- **Array sizes:** 100, 1,000, 10,000, 100,000 to show scaling
- **Examples:** quick-start overview + focused deep-dives per concept
- **Local-only** — `bun run bench` in benchmarks package

## Benchmarks

### Package setup

**Files:** `benchmarks/package.json`, `benchmarks/vitest.config.ts`, `benchmarks/src/setup.ts`

- `benchmarks` package in workspace
- Dependencies: `stopcock`, `remeda`, `lodash-es`, `ramda`, `@types/ramda`
- `vitest.config.ts`: bench mode configuration
- `setup.ts`: shared test data generators (random arrays of various sizes)

### setup.ts — shared data generators

Pre-generate arrays at each size to avoid allocation noise in benchmarks:

- `numbersN`: `number[]` of size N with random floats
- `stringsN`: `string[]` of size N with random words
- `objectsN`: `{ id: number, name: string, active: boolean }[]` of size N

Sizes: 100, 1_000, 10_000, 100_000.

### Micro-benchmarks (per function)

Each benchmark file compares the same operation across all libraries at all array sizes.

#### array-map.bench.ts

For each size (100, 1K, 10K, 100K):
- `stopcock A.map` (data-first)
- `Remeda R.map` (data-first)
- `Lodash _.map`
- `Ramda R.map`
- `Native Array.prototype.map`

Transform: `x => x * 2` (numeric) to keep the callback cost minimal and measure iteration overhead.

#### array-filter.bench.ts

Same structure. Predicate: `x => x > 0.5` (filters ~50%).

#### array-sort.bench.ts

Same structure. Numeric sort comparator.

Note: Ramda's sort and native sort have different APIs — adapt as needed.

#### array-uniq.bench.ts

Same structure. Arrays with ~30% duplicates to make deduplication meaningful.

Note: Lodash `_.uniq`, Ramda `R.uniq`, Remeda `R.unique`. Native has no built-in — use `[...new Set(arr)]` as the native baseline.

#### number-stats.bench.ts

Sum and mean across libraries:
- `stopcock N.sum / N.mean`
- `Lodash _.sum / _.mean`
- Native `arr.reduce((a, b) => a + b, 0)`
- Manual for loop

Median and stddev (not available in all libraries):
- `stopcock N.median / N.standardDeviation`
- Manual implementations as baseline

### Macro-benchmarks (pipeline chains)

#### pipeline-fusion.bench.ts — headline benchmark

Chain: filter positives → double them → take first 10.

For each size (100, 1K, 10K, 100K):
- `stopcock lay()` — fused, single pass
- `stopcock pipe()` — eager, intermediate arrays
- `Remeda pipe()` — their pipe with their functions
- `Lodash _.chain` or `_.flow`
- `Ramda R.pipe`
- `Native` — chained `Array.prototype` calls

This is the benchmark that demonstrates the value of `lay`. On large arrays with `take(10)`, `lay` should dramatically outperform everything else due to early termination.

#### pipeline-complex.bench.ts

Chain: filter → map → sort → take first 5.

This includes a materialization boundary (sort is non-fuseable). Demonstrates that `lay` still wins on the fuseable segments even when materialization is required.

For each size (1K, 10K, 100K):
- Same library comparisons as above

### Running benchmarks

Package.json script: `"bench": "vitest bench"`

```bash
cd benchmarks
bun run bench                  # run all benchmarks
bun run bench --filter map     # run only map benchmarks
```

## Examples

### examples/quick-start.ts

Single comprehensive file. Shows:
- `pipe` and `flow` basics
- Array operations with dual signatures (data-first and data-last)
- Option and Result for error handling
- `lay` for fused pipelines
- Namespaces (`A`, `S`, `D`, `N`, `O`, `R`, `G`)

Realistic scenario: processing a list of users — filter active, extract names, handle missing fields with Option, validate with Result.

### examples/pipe-and-flow.ts

Focused on composition:
- `pipe` with increasing arity (2, 5, 10 functions)
- `flow` to create reusable composed functions
- Mixing typed transforms (`string → number → boolean`)

### examples/option-result.ts

Error handling patterns:
- `O.fromNullable` for nullable API responses
- `O.map` / `O.flatMap` chains
- `R.tryCatch` for functions that might throw
- `R.map` / `R.mapErr` for transforming success/error
- Converting between Option and Result
- Pattern matching with `O.match` and `R.match`

### examples/array-operations.ts

Array ops with dual signatures:
- Data-first for standalone calls
- Data-last in pipe for chaining
- Grouped by category: accessors, slicing, HOFs, search, transform, combinators
- Dict and String operations

### examples/fusion.ts

`lay` deep dive:
- Side-by-side comparison with `pipe` — same operations, different performance
- Early termination example with large array + `take`
- Materialization boundaries — sort in the middle of a chain
- When to use `lay` vs `pipe` — guidance on when fusion matters

## Execution Order

1. **Benchmark package setup** — package.json, vitest config, setup.ts with data generators
2. **Micro-benchmarks** — array-map, array-filter, array-sort, array-uniq, number-stats
3. **Macro-benchmarks** — pipeline-fusion (headline), pipeline-complex
4. **Quick-start example** — full API tour
5. **Focused examples** — pipe-and-flow, option-result, array-operations, fusion

## Design Constraints

1. Benchmarks measure iteration overhead, not callback cost — use trivial transform functions
2. Pre-generate test data outside the benchmark loop
3. Each benchmark runs at 4 array sizes to show scaling
4. No CI integration — local `bun run bench` only
5. Examples should be runnable as-is (`bun run examples/quick-start.ts`)
6. Examples use realistic scenarios, not contrived demos
7. No comments explaining what library functions do — the code should be self-evident
