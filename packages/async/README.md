# @stopcock/async

Composable async tasks with cancellation, retry, and concurrency control.

```bash
bun add @stopcock/async
```

```ts
import { Task } from '@stopcock/async'
import { pipe } from '@stopcock/fp'

const fetchUser = pipe(
  Task.fromPromise(() => fetch('/api/user').then(r => r.json())),
  Task.timeout(5000),
  Task.retry({ attempts: 3, backoff: 'exponential' }),
  Task.map(data => data.user),
)

const result = await Task.runSafe(fetchUser)
```

## What's in the box

- **Task** — lazy async computation that doesn't run until you call `run` / `runSafe`
- **Combinators** — `map`, `flatMap`, `tap`, `mapError`, `catchError`, `match`
- **Concurrency** — `all`, `allSettled`, `race`, `any`, `parallel`, `sequential`
- **Resilience** — `retry`, `timeout`, `fallback`
- **Flow control** — `throttle`, `debounce`, `rateLimit`
- **Collection** — `mapAsync`, `filterAsync`, `forEachAsync`, `reduceAsync`, `collectAsync`

[Docs](https://stopcock.dev/libraries/async)
