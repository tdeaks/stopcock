# @stopcock/server

Functional HTTP framework. Module-graph DI, typed route plugins, lifecycle hooks, typed-error middleware, AOT matcher with build-time codegen.

```bash
bun add @stopcock/server
```

```ts
import { defineModule, defineApp, defineService, defineRepository, route, toBunFetch } from '@stopcock/server'

const makePostsRepo = defineRepository('posts', ({ db }: { db: Db }) => ({
  list:    ()   => db.posts.findAll(),
  find:    (id: string) => db.posts.findById(id),
}))

const makePostsService = defineService('posts', ({ repo }: { repo: ReturnType<typeof makePostsRepo> }) => ({
  list: () => repo.list(),
  find: (id: string) => repo.find(id),
}))

const DbModule = defineModule({
  name: 'db',
  provides: () => ({ db: makeDb() }),
})

const PostsModule = defineModule({
  name: 'posts',
  imports: [DbModule],
  provides: ({ db }) => ({ posts: makePostsService({ repo: makePostsRepo({ db }) }) }),
  routes:   ({ posts }) => [
    route.get('/posts')      .handler(()    => posts.list()),
    route.get('/posts/:id')  .handler((ctx) => posts.find(ctx.params.id)),
  ],
})

const app = defineApp({
  modules: [PostsModule],
  plugins: [
    cors(),
    openapi({ path: '/openapi.json' }),
  ],
})

Bun.serve({ port: 3000, fetch: toBunFetch(app) })
```

## What's in the box

- **defineModule / defineApp** — module-graph DI. `provides` is memoised across importers; cycle detection at startup.
- **defineRepository / defineService / defineController / defineRoutes** — layered factories with `LAYER_KIND` / `LAYER_NAME` symbols for tooling introspection.
- **route.<method>(path).use(mwOrPlugin).meta(meta).handler(fn)** — typed builder chain. Path params inferred onto ctx; middleware/plugin-added fields flow through `.use()`.
- **defineMiddleware\<Provides, E\>** — write a plain `async (ctx) => Provides`. Returns a `Handler -> Handler` transform with typed errors.
- **defineRoutePlugin / defineLifecycle / definePlugin** — route plugins, lifecycle hooks, and app plugins without hiding handler dependencies from TypeScript.
- **AOT matcher codegen** — `emitMatcher(routes, 'matcher.gen.ts')` produces a Workers-safe static matcher.
- **Adapters** — `toBunFetch`, `toNodeListener`. uWebSockets.js via `@stopcock/server-uws`.

## Design

See `docs/proposals/server.md` for the full position. Short version: NestJS-style opinionation (modules, layered factories) without the runtime DI container, decorators, or metadata reflection. Elysia-style type safety. AOT-compiled routing.

## Related

- [`@stopcock/server-uws`](../server-uws) — uWebSockets.js adapter
- [`@stopcock/async`](../async) — Task type used for handlers
