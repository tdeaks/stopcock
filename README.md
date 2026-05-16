# stopcock

Type-safe functional utilities for TypeScript. Pipe, array fusion, Option, Result, and a handful of focused packages built on the same primitives.

```typescript
import { pipe, A } from '@stopcock/fp'

const top10 = pipe(
  users,
  A.filter(u => u.active && u.score > 0),
  A.map(u => ({ name: u.name, score: u.score })),
  A.take(10),
)
```

`pipe` fuses `filter`, `map`, and `take` into a single loop. `take(10)` bails out after 10 hits. On a million elements, that means touching a few dozen items instead of three full passes.

## Install

```bash
bun add @stopcock/fp
```

Each package is installable independently — grab only what you need.

## Packages

| Package | What |
|---------|------|
| `@stopcock/fp` | pipe, flow, Array, String, Dict, Number, Guards, Object, Math, Boolean, Logic, Option, Result, Lenses, Optics |
| `@stopcock/async` | Lazy Task type with concurrency, retry, timeout, cancellation |
| `@stopcock/date` | Zero-allocation date utilities with branded timestamps, timezones, business days |
| `@stopcock/diff` | Myers diff plus patch apply, invert, compose, rebase |
| `@stopcock/http` | Typed HTTP client with retry, caching, and request composition |
| `@stopcock/img` | Image filters, convolution, Hough lines, connected components |
| `@stopcock/la` | Linear algebra. Vectors and matrices |
| `@stopcock/state` | Proxy-compiled accessors, patch middleware, batching, computed, history |
| `@stopcock/server` | Functional HTTP framework. Module-graph DI, typed middleware, AOT matcher |
| `@stopcock/server-uws` | uWebSockets.js adapter for `@stopcock/server` (Node-only) |

Every function works data-first and data-last. Import only what you use — each package treeshakes independently.

## Docs

[stopcock.dev](https://stopcock.dev)

## Monorepo structure

```
packages/       Individual library packages (@stopcock/*)
apps/docs/      Astro + Starlight docs site
benchmarks/     vitest bench suites
```

## License

MIT
