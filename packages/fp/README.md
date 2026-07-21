# @stopcock/fp

Pipe-based functional programming for TypeScript. Fuses streaming array operations into single loops.

```bash
bun add @stopcock/fp
```

```ts
import { pipe, flow, A, S, N, O, R } from '@stopcock/fp'

const activeNames = pipe(
  users,
  A.filter((u) => u.active && u.score > 0),
  A.map((u) => u.name),
  A.take(10),
)
```

`filter -> map -> take(10)` fuses into one streaming loop and bails out after 10 matching results.

For sorted leaderboards, `sortBy -> take(k)` is a special top-k optimization, not the same kind of streaming fusion:

```ts
const leaderboard = pipe(
  users,
  A.filter((u) => u.active && u.score > 0),
  A.sortBy((a, b) => b.score - a.score),
  A.take(10),
  A.map((u) => u.name),
)
```

Here `filter` can stream first, `sortBy -> take(10)` uses the bounded top-k path, and the final `map` runs after that boundary.

## What's in the box

- **pipe / flow** - left-to-right composition, with automatic fusion for streaming array chains
- **A** (Array), **S** (String), **D** (Dict), **N** (Number), **M** (Math), **B** (Boolean), **Obj** (Object), **Logic** - namespaced utilities, all pipe-friendly
- **O** (Option), **R** (Result) - sum types for nullable values and fallible operations, with tags for fast branching
- **G** (Guards) - type narrowing: `isString`, `isNil`, `isPlainObject`, etc.
- **Lenses** - `lens`, `lensProp`, `lensIndex`, `lensPath`, `view`, `set`, `over`

Every function is dual: data-first and data-last.

```ts
A.take(users, 5) // data-first
pipe(users, A.take(5)) // data-last
```

[Docs](https://stopcock.dev/libraries/fp)
