# @stopcock/state

Reactive state store built on structural diffs. Accessor-based subscriptions, middleware, undo/redo, devtools.

```bash
bun add @stopcock/state
```

```ts
import { create } from '@stopcock/state'

const store = create({ user: { name: 'Tom', score: 0 } })

store.subscribe(s => s.user.score, (next, prev) => {
  console.log(`score: ${prev} -> ${next}`)
})

store.set(s => s.user.score, 42)
store.over(s => s.user.score, n => n + 1)
```

## What's in the box

- **create** — create a store from an initial state
- **get / set / over / update / replace** — read and write with accessor functions or mutable drafts
- **subscribe** — listen to the whole store or a specific slice via `s => s.path`
- **batch** — group multiple writes into a single notification
- **at** — get a `Handle` for a path segment with its own get/set/subscribe
- **computed** — derived values that update when their source slice changes
- **middleware** — intercept and transform patches before they apply
- **logger** — console middleware with grouped, color-coded operation logs
- **history** — undo/redo middleware backed by patch inversion
- **devtools** — Redux DevTools integration with time travel
- **asyncAction** — wire async tasks into the store lifecycle
