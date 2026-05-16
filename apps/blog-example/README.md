# Blog API example

A small blog API built on the stopcock server PoC. Demonstrates the proposed
file conventions, the module pattern, and how typed errors flow through
middleware composed with `pipe`.

## Run

```sh
bun run examples/blog/src/main.ts
```

Then:

```sh
curl http://localhost:3000/health
curl http://localhost:3000/posts
curl -X POST http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"alice@example.com","password":"hunter2"}'
# → {"token":"t-u1-..."}
curl -X POST http://localhost:3000/posts \
  -H "authorization: Bearer t-u1-..." \
  -H 'content-type: application/json' \
  -d '{"title":"hi","body":"world"}'
```

## Conventions

```
src/
├── modules/<name>/
│   ├── <name>.module.ts     <Name>Module(deps) factory returning ModuleDef
│   ├── <name>.service.ts    pure business logic; deps passed explicitly
│   ├── <name>.repo.ts       data access; depends on infra/db
│   └── <name>.schema.ts     types + runtime guards (swap for Zod later)
├── middleware/              defineMiddleware(...) factories
├── errors/domain.ts         tagged error classes + the renderDomain mapper
├── infra/                   external boundaries (db, cache, queues)
└── main.ts                  wire infra → services → modules → defineApp
```

Each module exports a `<Name>Module(deps): ModuleDef` factory. The bootstrap
in `main.ts` builds the deps and hands them to each module factory, then
passes the modules to `defineApp({ modules: [...] })`.

## How it reads

A module file (`posts.module.ts`) is the place a new dev opens first when
adding a route. It's a flat list of `defineHandler` calls:

```ts
const findPost = (deps: Deps) => defineHandler({
  method: 'GET',
  path: '/posts/:id',
  handler: (ctx) => of(async () => deps.posts.find(ctx.params.id)),
})

const createPost = (deps: Deps) => {
  const inner: Handler<Ctx<{}> & { userId: string; body: CreatePostInput }, Post, never> =
    (ctx) => of(async () => deps.posts.create(ctx.userId, ctx.body))
  return defineHandler({
    method: 'POST',
    path: '/posts',
    handler: pipe(inner, withBody(parseCreatePost), deps.withAuth),
  })
}

export const PostsModule = (deps: Deps) => defineModule({
  name: 'posts',
  defaultRender: renderDomain,
  routes: [findPost(deps), createPost(deps), /* ... */],
})
```

Middleware is composed with plain `pipe`. The inner handler declares what it
needs from ctx; middleware provide those things. The typed error channel
accumulates through the pipe; `defaultRender` exhaustively handles every
error any middleware can emit.

## What's missing (next steps)

- Schema integration (Standard Schema / Zod / Valibot).
- `stopcock g resource posts` CLI command to scaffold new modules.
- AOT codegen of the wiring graph (so `main.ts` doesn't grow per module).
- Decorator surface via opt-in plugin (`@stopcock/server-decorators`).
