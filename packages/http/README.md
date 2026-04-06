# @stopcock/http

Typed HTTP client. Generics on response and error types, retry via `@stopcock/async`, request deduplication.

```bash
bun add @stopcock/http
```

```ts
import { createClient, HttpError } from '@stopcock/http'

const api = createClient({
  baseUrl: 'https://api.example.com',
  headers: () => ({ Authorization: `Bearer ${getToken()}` }),
  retry: { attempts: 3, backoff: 'exponential' },
  timeout: 5000,
})

const users = await api.get<User[]>('/users', { query: { q: 'tom' } })
const user = await api.post<User>('/users', { body: { name: 'Tom' } })

// typed error bodies
try {
  await api.get<User, ApiError>('/users/999')
} catch (e) {
  if (e instanceof HttpError) {
    e.status    // number
    e.data      // ApiError
  }
}
```

## What's in the box

- **createClient** -- factory with base URL, headers, timeout, retry, dedup, hooks
- **Typed requests** -- `get<T, E>`, `post`, `put`, `patch`, `delete`, `head`
- **HttpError\<E\>** -- typed error with status, parsed response body, request info
- **Task escape hatch** -- `api.task.get()` returns a raw `Task` for `@stopcock/async` composition
- **with()** -- clone a client with merged config
- **Path params** -- `/users/:id` with `{ params: { id: 42 } }`
- **Query params** -- arrays, undefined filtering, encoding
- **Dedup** -- concurrent identical GETs share one fetch
- **Upload progress** -- `onProgress` callback via XHR fallback

[Docs](https://stopcock.dev/libraries/http)
