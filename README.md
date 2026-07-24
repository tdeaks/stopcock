# stopcock

Type-safe functional utilities for TypeScript. Portable pipelines, explicit
data types, lazy and persistent collections, parsing, pattern matching, and a
focused package family built on the same primitives.

```typescript
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'

const top10 = pipe(
  users,
  A.filter((u) => u.active && u.score > 0),
  A.map((u) => ({ name: u.name, score: u.score })),
  A.take(10),
)
```

`pipe` recognizes compatible tagged operations and dispatches to portable
checked-in loop templates. `take(10)` can stop after ten matching results,
while whole-input operations such as sorting and grouping form explicit
materialization boundaries.

## Install

```bash
bun add @stopcock/fp
```

Each package is installable independently. Grab only what you need.

## Packages

| Package                      | What                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `@stopcock/fp`               | Slim composition root plus collection, data, algebra, optic, validation, and recursion subpaths |
| `@stopcock/async`            | Lazy Task and AsyncIter with concurrency, retry, timeout, and cancellation                      |
| `@stopcock/fp-compiler`      | Optional build-time lowering for portable FP pipelines                                          |
| `@stopcock/fp-interop`       | Explicit dependency-light boundaries for foreign tagged values and native protocols             |
| `@stopcock/parser`           | Typed parser combinators and diagnostics                                                        |
| `@stopcock/pattern`          | Exhaustive structural and tagged-data pattern matching                                          |
| `@stopcock/persistent`       | Structurally shared vectors, maps, sets, queues, deques, and stacks                             |
| `@stopcock/fp-testing`       | Deterministic algebraic-law checks, edge cases, and iterable probes                             |
| `@stopcock/eslint-plugin-fp` | Flat-config migration, import-hygiene, and performance rules                                    |
| `@stopcock/fp-codemod`       | Conservative TypeScript-aware FP 1 to FP 2 migrations                                           |
| `@stopcock/autodiff`         | Reverse-mode automatic differentiation for scalar, vector, and matrix values                    |
| `@stopcock/color`            | Colour conversion, perceptual operations, gamut mapping, and accessibility analysis             |
| `@stopcock/date`             | Branded timestamps, timezones, business days, and date utilities                                |
| `@stopcock/diff`             | Myers diff plus patch apply, invert, compose, and rebase                                        |
| `@stopcock/http`             | Typed HTTP client with retry, caching, and request composition                                  |
| `@stopcock/img`              | Image filters, convolution, Hough lines, and connected components                               |
| `@stopcock/la`               | Linear algebra with vectors and matrices                                                        |
| `@stopcock/signal`           | Typed-array DSP, FFT, filter, convolution, resampling, and analysis kernels                     |
| `@stopcock/state`            | Compiled accessors, patch middleware, batching, computed state, and history                     |
| `@stopcock/svg`              | Typed procedural SVG nodes, paths, transforms, paint, filters, and rendering                    |

Pipe-oriented operators generally support data-first and data-last calls.
Specialist APIs use explicit subpath imports so applications pay only for what
they use.

## Docs

[stopcock.dev](https://stopcock.dev)

## Monorepo structure

```text
packages/    Individual library packages (@stopcock/*)
apps/docs/   Astro + Starlight docs site
benchmarks/  vitest bench suites
```

## Development

The monorepo uses [Vite+](https://viteplus.dev/) for runtime and package-manager management, task orchestration, builds, checks, and tests.

```bash
vp install
vp run build:packages
vp check
vp run test:packages
vp run docs:dev
```

On a clean checkout, build the packages once before the first type-aware check so their declaration files exist. `vp run build:packages` builds every package workspace except private `@stopcock/synth`, with a concurrency limit of two. `vp run build` builds the entire workspace, including synth and its Rust/Wasm build. Use `vp build` inside an individual app; root monorepo tasks go through `vp run`.

## License

MIT
