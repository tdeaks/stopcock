---
"@stopcock/server": minor
"@stopcock/server-uws": minor
---

Initial release of `@stopcock/server` and `@stopcock/server-uws`.

`@stopcock/server` ships a functional HTTP framework: module-graph DI (`defineModule`/`defineApp`), layered factories (`defineRepository`/`Service`/`Controller`/`Routes`) with introspectable `LAYER_KIND`/`LAYER_NAME` symbols, typed-error middleware via `defineMiddleware`, the `route.<method>(...).use(...).handler(...)` builder chain, Bun and Node adapters, and the AOT matcher with build-time codegen (`emitMatcher`).

`@stopcock/server-uws` provides the uWebSockets.js adapter (Node-only) via `mountUws(uwsApp, app)`.
