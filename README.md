# stopcock

Type-safe functional utilities for TypeScript. Pipe, array fusion, Option, Result, and 20+ standalone packages.

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
| `@stopcock/validate` | Schema validation with type inference and JIT compilation |
| `@stopcock/stream` | Lazy pull-based streams, infinite sequences |
| `@stopcock/img` | Image filters, convolution, Hough lines, connected components |
| `@stopcock/parse` | Parser combinators with typed composition |
| `@stopcock/search` | Fuzzy search, Trie, Bloom filter, inverted index |
| `@stopcock/struct` | Persistent HashMap, SortedSet, Deque |
| `@stopcock/match` | Pattern matching |
| `@stopcock/encoding` | Base64, Hex, MessagePack |
| `@stopcock/geo` | 2D geometry, geodesic distance, spatial indexing |
| `@stopcock/rand` | Seedable PRNGs and statistical distributions |
| `@stopcock/la` | Linear algebra — vectors and matrices |
| `@stopcock/signal` | FFT, filters, windowing, signal analysis |
| `@stopcock/zip` | In-memory ZIP archive creation |

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
