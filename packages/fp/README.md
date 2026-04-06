# @stopcock/fp

Pipe-based functional programming for TypeScript. Fuses array operations into single loops.

```bash
bun add @stopcock/fp
```

```ts
import { pipe, flow, A, S, N, O, R } from '@stopcock/fp'

const leaderboard = pipe(
  users,
  A.filter(u => u.active && u.score > 0),
  A.sortBy((a, b) => b.score - a.score),
  A.take(10),
  A.map(u => u.name),
)
```

`filter → map` fuses into a single loop. `take(10)` bails out early.

## What's in the box

- **pipe / flow** — left-to-right composition, with automatic fusion for array chains
- **A** (Array), **S** (String), **D** (Dict), **N** (Number), **M** (Math), **B** (Boolean), **Obj** (Object), **Logic** — namespaced utilities, all pipe-friendly
- **O** (Option), **R** (Result) — sum types for nullable values and fallible operations, numeric tags for fast branching
- **G** (Guards) — type narrowing: `isString`, `isNil`, `isPlainObject`, etc.
- **Lenses** — `lens`, `lensProp`, `lensIndex`, `lensPath`, `view`, `set`, `over`

Every function is dual: data-first or data-last.

```ts
A.take(users, 5)       // data-first
pipe(users, A.take(5)) // data-last
```

[Docs](https://stopcock.dev/libraries/fp)
