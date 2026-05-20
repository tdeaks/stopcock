---
"@stopcock/server": minor
"@stopcock/server-uws": minor
"@stopcock/server-validate-zod": minor
"@stopcock/server-validate-arktype": minor
"@stopcock/server-validate-typebox": minor
---

Initial release of the `@stopcock/server` family.

`@stopcock/server` ships a functional HTTP framework: module-graph DI (`defineModule`/`defineApp`), layered factories (`defineRepository`/`Service`/`Controller`/`Routes`) with introspectable `LAYER_KIND`/`LAYER_NAME` symbols, typed-error middleware via `defineMiddleware`, the `route.<method>(...).use(...).handler(...)` builder chain, Bun and Node adapters, and the AOT matcher with build-time codegen (`emitMatcher`).

The optional plugins ship as subpath exports off the same package: `@stopcock/server/bearer`, `@stopcock/server/cookie`, `@stopcock/server/cors`, `@stopcock/server/openapi`, `@stopcock/server/static`, `@stopcock/server/timing`, and `@stopcock/server/validate`. Import only the ones you use — tree-shaking keeps the rest out of the bundle.

`@stopcock/server-uws` provides the uWebSockets.js adapter (Node-only) via `mountUws(uwsApp, app)`.

`@stopcock/server-validate-zod`, `@stopcock/server-validate-arktype`, and `@stopcock/server-validate-typebox` adapt the corresponding schema libraries to the validator middleware in `@stopcock/server/validate`.
