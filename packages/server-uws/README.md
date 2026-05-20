# @stopcock/server-uws

uWebSockets.js adapter for [`@stopcock/server`](../server). Node-only — uWS ships a native binary that doesn't match Bun's ABI.

```bash
bun add @stopcock/server-uws uWebSockets.js@github:uNetworking/uWebSockets.js
```

```ts
import { App } from 'uWebSockets.js'
import { mountUws } from '@stopcock/server-uws'
import { app } from './app'

const uws = App()
mountUws(uws, app)
uws.listen(3000, (token) => {
  if (!token) throw new Error('uWS failed to listen')
  console.log('listening on http://localhost:3000')
})
```

## Notes

- Includes a JSON fast-path that skips `Response` construction for plain-object handler returns. ~3x throughput vs the slow path.
- Handlers that return a `Response` directly, or throw a typed error, go through the slow path (full status + headers + body contract).
- uWS req/res are stack-allocated and invalidated as soon as the handler returns synchronously. The adapter snapshots everything from req at entry and registers an abort handler on res — your handler code never sees these constraints.
