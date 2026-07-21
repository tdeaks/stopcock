# stopcock

Type-safe functional utilities for TypeScript. Pipe, array fusion, Option, Result, and a handful of focused packages built on the same primitives.

```typescript
import { pipe, A } from '@stopcock/fp'

const top10 = pipe(
  users,
  A.filter((u) => u.active && u.score > 0),
  A.map((u) => ({ name: u.name, score: u.score })),
  A.take(10),
)
```

`pipe` fuses streaming operations like `filter`, `map`, and `take` into a single loop. `take(10)` bails out after 10 matching results, while materializing operations such as `sort`, `sortBy`, `reverse`, `groupBy`, and `uniq` run on a completed array boundary.

## Install

```bash
bun add @stopcock/fp
```

Each package is installable independently. Grab only what you need.

## Packages

| Package           | What                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `@stopcock/fp`    | pipe, flow, Array, String, Dict, Number, Guards, Object, Math, Boolean, Logic, Option, Result, Lenses, Optics |
| `@stopcock/async` | Lazy Task type for concurrency, retry, timeout, cancellation                                                  |
| `@stopcock/date`  | Zero-allocation date utilities for branded timestamps, timezones, business days                               |
| `@stopcock/diff`  | Myers diff plus patch apply, invert, compose, rebase                                                          |
| `@stopcock/http`  | Typed HTTP client with retry, caching, request composition                                                    |
| `@stopcock/img`   | Image filters, convolution, Hough lines, connected components                                                 |
| `@stopcock/la`    | Linear algebra. Vectors and matrices                                                                          |
| `@stopcock/state` | Proxy-compiled accessors, patch middleware, batching, computed, history                                       |

Every function works data-first and data-last. Import only what you use; each package treeshakes independently.

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

On a clean checkout, build the packages once before the first type-aware check so their declaration files exist. `vp run build:packages` builds the 12 publishable packages with a concurrency limit of two and intentionally excludes `@stopcock/synth`. `vp run build` builds the entire workspace, including synth and its Rust/Wasm build. Use `vp build` inside an individual app; root monorepo tasks go through `vp run`.

## License

MIT
