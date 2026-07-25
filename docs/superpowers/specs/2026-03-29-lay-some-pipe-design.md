# stopcock — Hybrid FP Library Design Spec

## Overview

A high-performance functional programming library for TypeScript with three compilation targets working together:

- **ReScript** (JIT-optimal JS for callback-bound HOFs)
- **Rust/WASM** (SIMD-accelerated numeric compute)
- **Pure TypeScript** (zero-cost type abstractions and pipeline composition)

The consumer API is curried, data-last, and pipeable. An adaptive dispatch layer routes calls to the fastest implementation based on input size.

## Architecture

```
Consumer API (TypeScript — curried, data-last, pipeable)
                    |
         +----------+----------+
         v          v          v
    ReScript     Pure TS     Rust/WASM
    (HOFs:       (pipe,      (SIMD compute:
     map,         flow,       sort, stats,
     filter,      Option,     set ops,
     reduce,      Result,     bulk string,
     groupBy)     transducer  dedup)
                  engine)
```

### Why three layers

- **ReScript** compiles to JS that V8 TurboFan and JSC DFG/FTL maximally optimise — monomorphic functions, pre-allocated arrays, plain `for` loops, no dynamic dispatch, no `arguments` object.
- **Rust/WASM** with SIMD128 processes 2x f64 or 4x f32 per instruction. For self-contained numeric compute where no JS callbacks cross the boundary, WASM beats JIT-compiled JS on large inputs.
- **Pure TypeScript** for `pipe`, `flow`, `Option`, `Result`, and the transducer/fusion engine. These are type-level constructs with trivial runtime.

### Adaptive dispatch

The unified API routes each call to the fastest implementation based on input size. Below configurable thresholds (found by benchmarking), ReScript's JIT-optimal JS wins because WASM boundary crossing cost exceeds compute savings. Above those thresholds, WASM wins.

## Monorepo Structure

```
stopcock/
├── package.json                    # Root workspace config (pnpm)
├── pnpm-workspace.yaml
├── turbo.json                      # Build orchestration
├── tsconfig.base.json              # Shared TS config (ES2022)
│
├── packages/
│   ├── core/                       # Pure TypeScript — pipe, flow, Option, Result
│   │   ├── package.json            # stopcock/core
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── pipe.ts             # 1-20 overloads, for-loop runtime
│   │       ├── flow.ts             # 1-20 overloads, returns composed fn
│   │       ├── option.ts           # Option<A> with numeric _tag (0/1)
│   │       ├── result.ts           # Result<A,E> with numeric _tag (0/1)
│   │       └── types.ts            # Shared type utilities
│   │
│   ├── rescript/                   # ReScript 12 -> JS — HOFs, array ops
│   │   ├── package.json            # stopcock/rescript
│   │   ├── rescript.json           # v12 config (see below)
│   │   └── src/
│   │       ├── Array.res           # 35+ array functions
│   │       ├── String.res          # 12 string functions
│   │       ├── Dict.res            # 8 dict functions
│   │       ├── Guard.res           # 9 type guard functions
│   │       ├── Number.res          # 3 number functions
│   │       └── Boolean.res         # 4 boolean functions
│   │
│   ├── wasm/                       # Rust -> WASM — SIMD compute
│   │   ├── package.json            # stopcock/wasm
│   │   ├── Cargo.toml
│   │   ├── build.sh
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── array.rs            # sort, uniq, set ops (Float64Array + serde)
│   │       ├── number.rs           # sum, mean, median, stddev, etc.
│   │       ├── string.rs           # regex filter, bulk contains
│   │       └── simd.rs             # WASM SIMD128 intrinsics
│   │
│   └── stopcock/              # Unified public package
│       ├── package.json            # stopcock
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts            # Re-exports everything
│           ├── array.ts            # Delegates to ReScript or WASM
│           ├── number.ts           # Delegates to WASM
│           ├── string.ts           # Delegates to ReScript or WASM
│           ├── dispatch.ts         # Adaptive threshold logic
│           ├── typed.ts            # Zero-copy Float64Array fast path
│           ├── lazy.ts             # Transducer fusion engine
│           └── wasm.ts             # WASM init wrapper
│
├── benchmarks/
│   ├── package.json
│   ├── vitest.config.ts
│   └── src/
│       ├── array-map.bench.ts
│       ├── array-sort.bench.ts
│       ├── array-filter.bench.ts
│       ├── array-uniq.bench.ts
│       ├── pipeline-fusion.bench.ts    # Headline benchmark
│       ├── number-stats.bench.ts
│       └── setup.ts
│
└── examples/
    └── basic.ts
```

## Package Details

### 1. packages/core — Pure TypeScript

No dependencies. Targets ES2022. Publishes as `@stopcock/core`.

#### pipe.ts

Overloads from 1 to 20 arguments. Runtime is a plain `for` loop over the functions — no `reduce`, no `arguments` object. Each overload threads the return type of one function into the input type of the next.

#### flow.ts

Same pattern as `pipe` but returns a composed function instead of executing immediately. Overloads from 1 to 20 functions.

#### option.ts

`Option<A>` algebraic type with numeric tags for faster branch prediction:

- `None = { readonly _tag: 0 }` — singleton, one allocation ever
- `Some<A> = { readonly _tag: 1; readonly value: A }`
- Functions (all curried, data-last): `some`, `none`, `fromNullable`, `fromPredicate`, `isSome`, `isNone`, `map`, `flatMap`, `getOrElse`, `getWithDefault`, `match`, `filter`, `toNullable`, `toUndefined`, `toResult`, `tap`

#### result.ts

`Result<A, E>` algebraic type with numeric tags:

- `Ok<A> = { readonly _tag: 1; readonly value: A }`
- `Err<E> = { readonly _tag: 0; readonly error: E }`
- Functions (all curried, data-last): `ok`, `err`, `isOk`, `isErr`, `map`, `mapErr`, `flatMap`, `getOrElse`, `match`, `toOption`, `tryCatch`, `fromNullable`, `tap`, `tapErr`

#### types.ts

Shared type utilities used across the library.

### 2. packages/rescript — ReScript 12 to JS

Publishes as `@stopcock/rescript`. Uses genType to generate TypeScript declarations.

#### rescript.json (corrected for v12)

```json
{
  "name": "@stopcock/rescript",
  "sources": [{ "dir": "src", "subdirs": true }],
  "package-specs": [{ "module": "esmodule", "in-source": true }],
  "suffix": ".res.js",
  "bs-dependencies": ["@rescript/core"],
  "bsc-flags": ["-open RescriptCore"],
  "gentypeconfig": {
    "module": "esmodule",
    "moduleResolution": "bundler",
    "generatedFileExtension": ".gen.tsx"
  }
}
```

Key changes from prompt.md spec:
- `"es6"` -> `"esmodule"` (renamed in v12)
- `".mjs"` -> `".res.js"` (v12 convention)
- Added `@rescript/core` dependency and `-open RescriptCore` flag
- Updated `gentypeconfig` format (removed deprecated `language`/`shims` fields)

#### ReScript code rules for V8/JSC optimal output

- Use `Belt.Array.makeUninitializedUnsafe(len)` for pre-allocated output arrays
- Use `Belt.Array.getUnsafe` and `Belt.Array.setUnsafe` in loops
- Use plain `for` loops, not recursive implementations
- For early-termination functions, use `while` loops with `ref` flags
- All exported functions annotated with `@genType`

#### Array.res functions (35+)

`map`, `mapWithIndex`, `filter`, `filterWithIndex`, `reduce`, `reduceRight`, `flatMap`, `groupBy`, `zip`, `zipWith`, `take`, `drop`, `takeWhile`, `dropWhile`, `find`, `findIndex`, `every`, `some`, `includes`, `reverse`, `sort`, `sortBy`, `uniq`, `uniqBy`, `flatten`, `intersperse`, `chunk`, `slidingWindow`, `head`, `last`, `tail`, `init`, `isEmpty`, `length`, `forEach`, `forEachWithIndex`

#### String.res functions (12)

`isEmpty`, `length`, `trim`, `trimStart`, `trimEnd`, `startsWith`, `endsWith`, `includes`, `split`, `toLowerCase`, `toUpperCase`, `slice`, `replaceAll`, `repeat`

#### Dict.res functions (8)

`fromEntries`, `toEntries`, `keys`, `values`, `map`, `filter`, `merge`, `get`, `isEmpty`

#### Guard.res functions (9)

`isString`, `isNumber`, `isBoolean`, `isNull`, `isUndefined`, `isNullOrUndefined`, `isArray`, `isObject`, `isFunction`

#### Number.res functions (3)

`clamp`, `isEven`, `isOdd`

#### Boolean.res functions (4)

`ifElse`, `and_`, `or_`, `not_`

### 3. packages/wasm — Rust to WASM

Publishes as `@stopcock/wasm`. Built with `wasm-pack` targeting `bundler`.

#### Cargo.toml

```toml
[package]
name = "stopcock-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen = "0.2"
js-sys = "0.3"
serde = { version = "1", features = ["derive"] }
serde-wasm-bindgen = "0.6"
ahash = "0.8"
regex = "1"

[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
strip = true
```

#### build.sh

```bash
#!/bin/bash
RUSTFLAGS="-C target-feature=+simd128" wasm-pack build --target bundler --release
```

#### array.rs — Float64Array + serde operations

`sortNumbers`, `uniqNumbers`, `intersectionNumbers`, `differenceNumbers`, `symmetricDifference`, `unionNumbers`, `chunkNumbers`, `sortStrings`, `uniqStrings`, `filterByRegex`

#### number.rs — SIMD-accelerated statistics

`sum`, `mean`, `median`, `standardDeviation`, `variance`, `percentile`, `min`, `max`, `minMax`

#### simd.rs — WASM SIMD128 intrinsics

`simd_sum` (f64x2 accumulation), `simd_min_max` (f64x2 pmin/pmax), `simd_dot_product` (f64x2 mul+add). All handle scalar remainder.

#### string.rs — bulk string operations

`filterByRegex`, `filterContains`

### 4. packages/fp — Unified Public Package

Publishes as `stopcock`.

#### dispatch.ts — adaptive routing

Threshold config with per-operation crossover points:

| Operation | Initial threshold |
|-----------|------------------|
| sort | 2048 |
| uniq | 1024 |
| intersection | 512 |
| difference | 512 |
| sum | 4096 |
| mean | 4096 |
| median | 1024 |

Below threshold: delegate to ReScript JS. Above: delegate to WASM. Includes optional `calibrate()` for runtime binary-search of actual crossover.

#### array.ts — curried, data-last public API

- **HOF functions** (always ReScript): map, filter, reduce, flatMap, groupBy, zip, find, every, some, sortBy, uniqBy, etc.
- **Compute functions** (adaptive dispatch, numbers only): sort, uniq, intersection, difference, union, symmetricDifference
- **Simple functions** (always ReScript): take, drop, head, last, reverse, flatten, chunk, etc.

#### number.ts — always WASM

sum, mean, median, standardDeviation, variance, percentile, min, max, minMax, dotProduct. Each wraps `number[]` -> `Float64Array` conversion.

#### typed.ts — zero-copy Float64Array fast path

Directly calls WASM without conversion for users already working with typed arrays.

#### lazy.ts — transducer fusion engine

`Pipeline<A>` class with:
- Constructor: `from(arr)`
- Chainable (lazy): `.map()`, `.filter()`, `.take()`, `.drop()`, `.flatMap()`
- Terminal (executes): `.toArray()`, `.first()`, `.count()`, `.reduce()`, `.forEach()`, `.sorted()`

Key invariants:
- Zero intermediate arrays
- Early termination via `HALT` sentinel
- `map -> filter -> take(5)` on 1M items touches only enough elements to collect 5 results

#### wasm.ts — async WASM init

```typescript
import init, * as wasm from "@stopcock/wasm";
let ready = false;
export async function initialize(): Promise<void> {
  if (!ready) { await init(); ready = true; }
}
export { wasm };
```

#### index.ts — main entry point

Exports: `pipe`, `flow`, `A`, `N`, `S`, `O`, `R`, `Typed`, `from`, `initialize`

## Build Configuration

### turbo.json pipeline

1. `@stopcock/wasm#build` — outputs `pkg/**`, inputs `src/**/*.rs` + `Cargo.toml`
2. `@stopcock/rescript#build` — outputs `src/**/*.res.js` + `src/**/*.gen.tsx`, inputs `src/**/*.res` + `rescript.json`
3. `@stopcock/core#build` — outputs `dist/**`, inputs `src/**/*.ts`
4. `stopcock#build` — depends on all three above, outputs `dist/**`

### Shared TypeScript config

ES2022, ESNext modules, bundler resolution, strict, declarations + source maps.

## Implementation Phases

### Phase 1: Root config + packages/core

Root monorepo scaffolding (package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json) plus the pure TypeScript core package (pipe, flow, Option, Result, types). Testable immediately with vitest.

### Phase 2: packages/rescript

ReScript 12 package with Array.res (start with map/filter/reduce), then String, Dict, Guard, Number, Boolean. Verify genType output after each module.

### Phase 3: packages/wasm

Rust WASM package. Start with sortNumbers + sum to verify wasm-pack + SIMD128 builds. Add remaining array, number, and string functions.

### Phase 4: packages/fp

Unified API package. Wire up dispatch.ts, array.ts, number.ts, string.ts, typed.ts, lazy.ts, wasm.ts, index.ts. Import from ReScript and WASM packages.

### Phase 5: Benchmarks + examples

vitest bench setup. Pipeline fusion benchmark first (headline). Then array-map, array-sort, array-uniq, number-stats. Basic usage example.

## Design Constraints

1. No intermediate arrays in fused pipelines
2. Early termination — `take(n)` stops after collecting n items
3. All public functions curried and data-last
4. Numeric tags on ADTs (`_tag: 0 | 1`, not strings)
5. Singleton `None` — one object reference, never new allocation
6. No `arguments` object anywhere
7. No `delete` on objects — use `undefined` assignment
8. Homogeneous arrays — separate functions for `number[]` and `string[]`
9. Pre-allocate arrays when output size is known
10. Float64Array for WASM boundary — numeric arrays cross as typed arrays
11. Minimal comments — only to explain *why*, never *what*. No decorative banners. Code is self-documenting through clear naming.
12. Write code like a human — no LLM tells. No over-commenting, no gratuitous abstractions, no tutorial-style naming, no defensive redundancy. Terse where terse is clear. But never sloppy — the code should be clear, concise, functional, and typesafe. Think Effect-TS or fp-ts at their best: precise types, tight implementations, zero waste.

## Testing Strategy

- Unit tests for every function (core, rescript output, wasm output)
- Integration tests verifying unified API routes correctly between backends
- Property-based tests (fast-check) for array operations
- Cross-engine: Node (V8) and Bun (JSC)
