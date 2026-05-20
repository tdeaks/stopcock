// @ts-nocheck
/**
 * HTTP-level framework benchmark.
 *
 * Run from benchmarks/:
 *   bun run bench:server --duration=10 --connections=50
 *   bun run bench:server --scenario=read-heavy --frameworks=stopcock,fastify,hono
 */
import autocannon from 'autocannon'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createServer } from 'node:http'
import {
  defineApp,
  defineMiddleware,
  defineModule,
  json,
  route,
  toBunFetch,
  toBunRoutes,
  toNodeListener,
} from '../../../packages/server/src/index'
import { checkParity } from './parity'

const HOST = '127.0.0.1'
const AUTH_TOKEN = 'Bearer bench-token'
const FILLER_ROUTES = 96
let nextPort = Number(process.env['BENCH_SERVER_PORT'] ?? 32100)

const ORDER_BODY = JSON.stringify({
  customerId: 'customer-42',
  coupon: 'SPRING10',
  items: [
    { sku: 'pipe-15mm', quantity: 2, unitPrice: 8.25 },
    { sku: 'elbow-90', quantity: 4, unitPrice: 1.2 },
    { sku: 'valve-lockshield', quantity: 1, unitPrice: 12.5 },
  ],
})

// Larger dataset so xl-payload scenarios can return 1024-row responses
// (~64KB JSON) and stress serialization + socket-write throughput.
const searchRows = Array.from({ length: 1024 }, (_, i) => ({
  id: `post-${i}`,
  title: i % 3 === 0 ? `alpha release ${i}` : `fixture note ${i}`,
  tags: i % 2 === 0 ? ['alpha', 'routing'] : ['bench', 'json'],
}))

const HEAVY_HEADERS = {
  authorization: AUTH_TOKEN,
  cookie: 'sid=abc123; theme=dark; lang=en-GB; consent=opt-in; ab=variant-c',
  'accept-language': 'en-GB,en;q=0.9,fr;q=0.8',
  'accept-encoding': 'gzip, deflate, br',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) bench/1.0 autocannon',
  'x-request-id': '00000000-0000-4000-8000-000000000001',
  'x-forwarded-for': '203.0.113.42, 198.51.100.7',
  'x-csrf-token': 'csrf-bench-abc123def456',
  'if-none-match': '"v42-etag-deadbeef"',
  'x-trace-id': 'trace-7f4a2c1e-bench',
} as const

const scenarios = {
  'read-heavy': {
    description: 'mostly GETs across health, param, search, and deep routes',
    requests: [
      { method: 'GET', path: '/health' },
      ...Array.from({ length: 5 }, (_, i) => ({
        method: 'GET',
        path: `/api/v1/users/${1000 + i}?include=teams`,
        headers: { authorization: AUTH_TOKEN },
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        method: 'GET',
        path: `/api/v1/search?q=alpha&page=${i + 1}&limit=8`,
      })),
      {
        method: 'GET',
        path: '/api/v1/teams/team-7/projects/project-3/issues/issue-99?expand=comments',
        headers: { authorization: AUTH_TOKEN },
      },
      { method: 'GET', path: '/api/v1/not-found' },
    ],
  },
  'mixed-api': {
    description: 'GETs plus JSON POSTs and one miss, close to CRUD API traffic',
    requests: [
      { method: 'GET', path: '/health' },
      {
        method: 'GET',
        path: '/api/v1/users/42?include=teams',
        headers: { authorization: AUTH_TOKEN },
      },
      {
        method: 'GET',
        path: '/api/v1/teams/team-7/projects/project-3/issues/issue-99?expand=comments',
        headers: { authorization: AUTH_TOKEN },
      },
      { method: 'GET', path: '/api/v1/search?q=alpha&page=2&limit=8' },
      {
        method: 'POST',
        path: '/api/v1/orders',
        headers: {
          authorization: AUTH_TOKEN,
          'content-type': 'application/json',
        },
        body: ORDER_BODY,
      },
      {
        method: 'POST',
        path: '/api/v1/orders',
        headers: {
          authorization: AUTH_TOKEN,
          'content-type': 'application/json',
        },
        body: ORDER_BODY,
      },
      { method: 'GET', path: '/api/v1/not-found' },
    ],
  },
  'param-stress': {
    description: 'deep param route behind a realistic route table',
    requests: Array.from({ length: 8 }, (_, i) => ({
      method: 'GET',
      path: `/api/v1/teams/team-${i}/projects/project-${i + 1}/issues/issue-${i + 2}?expand=comments`,
      headers: { authorization: AUTH_TOKEN },
    })),
  },
  'static-asset': {
    description: 'tiny GET to a single static route, isolates matcher + serialization overhead',
    requests: [{ method: 'GET', path: '/health' }],
  },
  '404-heavy': {
    description: 'all requests miss the route table, stresses the not-found cold path',
    requests: [
      { method: 'GET', path: '/api/v1/does-not-exist' },
      { method: 'GET', path: '/api/v1/teams/team-7/projects/project-3/missing/issue-99' },
      { method: 'GET', path: '/api/v1/filler-999/tenant-a/id-b' },
      { method: 'POST', path: '/api/v1/nope', headers: { 'content-type': 'application/json' }, body: '{}' },
      { method: 'GET', path: '/' },
    ],
  },
  'large-payload': {
    description: '~4kb JSON response, weighted toward serialization + flush rather than routing',
    requests: [
      { method: 'GET', path: '/api/v1/search?q=&page=1&limit=64' },
      { method: 'GET', path: '/api/v1/search?q=fixture&page=1&limit=64' },
    ],
  },
  'xl-payload': {
    description: '~64kb JSON response (1024 rows), pure write-throughput test',
    requests: [
      { method: 'GET', path: '/api/v1/search?q=&page=1&limit=1024' },
    ],
  },
  'header-heavy': {
    description: 'realistic browser request: 10 headers per request including auth, cookies, csrf, trace',
    requests: [
      {
        method: 'GET',
        path: '/api/v1/users/42?include=teams',
        headers: HEAVY_HEADERS,
      },
      {
        method: 'GET',
        path: '/api/v1/teams/team-7/projects/project-3/issues/issue-99?expand=comments',
        headers: HEAVY_HEADERS,
      },
      {
        method: 'GET',
        path: '/health',
        headers: HEAVY_HEADERS,
      },
    ],
  },
  'cold-route-tail': {
    description: 'hits the LAST registered route — surfaces matcher cost differences on cold paths',
    requests: [
      {
        method: 'GET',
        path: `/api/v1/filler-${FILLER_ROUTES - 1}/tenant-z/id-9`,
      },
    ],
  },
  'error-paths': {
    description: 'mix of 4xx / 5xx responses — stresses error rendering, not happy paths',
    requests: [
      // 401: missing auth
      { method: 'GET', path: '/api/v1/users/42?include=teams' },
      // 404: no route
      { method: 'GET', path: '/api/v1/missing-route' },
      // 500: handler throws (added below)
      { method: 'GET', path: '/api/v1/error-500' },
      // 401: auth required, missing
      { method: 'POST', path: '/api/v1/orders', body: '{}', headers: { 'content-type': 'application/json' } },
    ],
  },
  'deep-nesting': {
    description: '5-level nested JSON tree — exercises serializer recursion and stack walks',
    requests: [{ method: 'GET', path: '/api/v1/tree' }],
  },
  'query-heavy': {
    description: '10+ query params per request — stresses URL parsing and URLSearchParams init',
    requests: [
      { method: 'GET', path: '/api/v1/query-echo?a=1&b=2&c=3&d=4&e=5&f=6&g=7&h=8&i=9&j=10&k=11&l=12' },
      { method: 'GET', path: '/api/v1/query-echo?include=teams&expand=comments&page=2&limit=8&sort=name&order=asc&filter=active&format=json&fields=id,name&trace=on' },
    ],
  },
  'echo-body': {
    description: 'POST with three body sizes (1KB, 8KB, 64KB) — body parsing + reflection throughput',
    requests: [
      {
        method: 'POST', path: '/api/v1/echo',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ size: 'small', data: 'x'.repeat(900) }),
      },
      {
        method: 'POST', path: '/api/v1/echo',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ size: 'medium', data: 'y'.repeat(8000) }),
      },
      {
        method: 'POST', path: '/api/v1/echo',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ size: 'large', data: 'z'.repeat(64000) }),
      },
    ],
  },
  'redirect-heavy': {
    description: '302 responses with Location header — non-2xx status + header writing path',
    requests: [{ method: 'GET', path: '/api/v1/redirect' }],
  },
  'mixed-methods': {
    description: 'GET + POST + PUT + PATCH + DELETE across realistic CRUD endpoints',
    requests: [
      { method: 'GET', path: '/api/v1/users/42', headers: { authorization: AUTH_TOKEN } },
      {
        method: 'POST', path: '/api/v1/orders',
        headers: { authorization: AUTH_TOKEN, 'content-type': 'application/json' }, body: ORDER_BODY,
      },
      {
        method: 'PUT', path: '/api/v1/things/thing-7',
        headers: { authorization: AUTH_TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'updated', count: 3 }),
      },
      {
        method: 'PATCH', path: '/api/v1/things/thing-7',
        headers: { authorization: AUTH_TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({ count: 4 }),
      },
      {
        method: 'DELETE', path: '/api/v1/things/thing-7',
        headers: { authorization: AUTH_TOKEN },
      },
    ],
  },
}

const parseArgs = () => {
  const out = {
    connections: 50,
    connectionsSweep: null,
    duration: 10,
    pipelining: 1,
    pipeliningSweep: null,
    warmup: 2,
    scenario: 'mixed-api',
    frameworks: 'all',
    json: false,
    parity: true,
    parityOnly: false,
    report: '',
    runs: 1,
  }

  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.split('=')
    if (key === '--connections' && value) out.connections = Number(value)
    else if (key === '--connections-sweep' && value) {
      out.connectionsSweep = value.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
      if (out.connectionsSweep.length === 0) out.connectionsSweep = null
    }
    else if (key === '--duration' && value) out.duration = Number(value)
    else if (key === '--pipelining' && value) out.pipelining = Number(value)
    else if (key === '--pipelining-sweep' && value) {
      out.pipeliningSweep = value.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
      if (out.pipeliningSweep.length === 0) out.pipeliningSweep = null
    }
    else if (key === '--warmup' && value) out.warmup = Number(value)
    else if (key === '--scenario' && value) out.scenario = value
    else if (key === '--frameworks' && value) out.frameworks = value
    else if (key === '--json') out.json = true
    else if (key === '--no-parity') out.parity = false
    else if (key === '--parity-only') { out.parityOnly = true; out.parity = true }
    else if (key === '--report') out.report = value || '../docs/benchmarks-server'
    else if (key === '--runs' && value) out.runs = Math.max(1, Number(value))
  }

  if (!scenarios[out.scenario]) {
    const names = Object.keys(scenarios).join(', ')
    throw new Error(`unknown scenario "${out.scenario}". Expected one of: ${names}`)
  }
  return out
}

const isAddressInUse = (error) =>
  error?.code === 'EADDRINUSE' || String(error?.message ?? '').includes('EADDRINUSE')

const takePort = () => nextPort++

const listen = (server) =>
  new Promise((resolve, reject) => {
    const attempt = (remaining) => {
      const port = takePort()
      const onError = (error) => {
        server.off('listening', onListening)
        if (remaining > 0 && isAddressInUse(error)) {
          attempt(remaining - 1)
          return
        }
        reject(error)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve({ server, url: `http://${HOST}:${port}` })
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, HOST)
    }
    attempt(50)
  })

const listenFastify = async (fastify) => {
  for (let remaining = 50; remaining >= 0; remaining--) {
    const port = takePort()
    try {
      await fastify.listen({ port, host: HOST })
      return `http://${HOST}:${port}`
    } catch (error) {
      if (remaining > 0 && isAddressInUse(error)) continue
      throw error
    }
  }
  throw new Error('failed to bind fastify benchmark server')
}

const closeNodeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })

const sendJson = (res, status, value) => {
  const body = JSON.stringify(value)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

const collectBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

const unauthorized = () => ({
  error: 'Unauthorized',
  message: 'missing benchmark authorization header',
})

const assertAuth = (value) => {
  if (value !== AUTH_TOKEN) {
    const error = new Error('missing benchmark authorization header')
    error.status = 401
    error.code = 'Unauthorized'
    throw error
  }
}

const getQuery = (url, name) => new URL(url, 'http://bench.local').searchParams.get(name)

const healthPayload = () => ({
  ok: true,
  service: 'bench-api',
  version: 1,
})

const userPayload = (userId, include) => ({
  id: userId,
  name: `User ${userId}`,
  active: true,
  include: include ?? null,
  roles: ['owner', 'reader'],
  teams: include === 'teams'
    ? [
        { id: 'team-1', name: 'Core' },
        { id: 'team-2', name: 'Ops' },
      ]
    : undefined,
})

const issuePayload = (teamId, projectId, issueId, expand) => ({
  id: issueId,
  teamId,
  projectId,
  title: `Issue ${issueId}`,
  status: 'open',
  priority: Number(issueId.replace(/\D+/g, '') || 0) % 4,
  comments: expand === 'comments'
    ? [
        { id: 'comment-1', body: 'first diagnostic note' },
        { id: 'comment-2', body: 'follow-up with repro details' },
      ]
    : undefined,
})

const searchPayload = (urlOrQuery) => {
  const params = typeof urlOrQuery === 'string'
    ? new URL(urlOrQuery, 'http://bench.local').searchParams
    : urlOrQuery
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 1)
  const limit = Number(params.get('limit') ?? 8)
  const start = (page - 1) * limit
  const matching = searchRows.filter((row) => row.title.includes(q) || row.tags.includes(q))
  return {
    q,
    page,
    limit,
    total: matching.length,
    results: matching.slice(start, start + limit),
  }
}

const orderPayload = (body) => {
  const items = Array.isArray(body?.items) ? body.items : []
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0), 0)
  const discount = body?.coupon ? subtotal * 0.1 : 0
  const total = Math.round((subtotal - discount) * 100) / 100
  return {
    id: `order-${body?.customerId ?? 'anonymous'}`,
    accepted: true,
    lineItems: items.length,
    subtotal,
    discount,
    total,
  }
}

// Five-level nested object for deep-nesting scenarios. Same instance reused
// so the bench measures serialization, not allocation.
const TREE_PAYLOAD = {
  id: 'root',
  meta: { generated: '2026-01-01', version: 3 },
  children: [
    {
      id: 'child-a',
      meta: { kind: 'branch', weight: 2.5 },
      children: [
        {
          id: 'leaf-a1',
          meta: { kind: 'leaf' },
          children: [
            { id: 'subleaf-a1a', meta: { tags: ['x', 'y'] }, children: [] },
            { id: 'subleaf-a1b', meta: { tags: ['z'] }, children: [] },
          ],
        },
        { id: 'leaf-a2', meta: { kind: 'leaf' }, children: [] },
      ],
    },
    {
      id: 'child-b',
      meta: { kind: 'branch', weight: 1.1 },
      children: [
        { id: 'leaf-b1', meta: { kind: 'leaf', tags: ['p', 'q'] }, children: [] },
      ],
    },
  ],
}

const queryEchoPayload = (params: URLSearchParams) => {
  const out: Record<string, string> = {}
  for (const [k, v] of params) out[k] = v
  return { params: out, count: Object.keys(out).length }
}

const echoPayload = (body) => ({ received: body, ok: true })

const REDIRECT_LOCATION = '/api/v1/users/1'

const thingPayload = (id, method, body) => ({
  id,
  method,
  patch: body ?? null,
  status: method === 'DELETE' ? 'gone' : 'ok',
})

const errorPayloadBody = () => {
  const e = new Error('synthetic bench error')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(e as any).status = 500
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(e as any).code = 'BenchError'
  throw e
}

const fillerPayload = (index, tenant, id) => ({
  route: index,
  tenant,
  id,
  ok: true,
})

const renderBenchError = (error) =>
  Response.json(
    {
      error: error?.code ?? error?.name ?? 'Error',
      message: error?.message ?? 'internal error',
    },
    { status: error?.status ?? 500 },
  )

const healthSchema = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, service: { type: 'string' }, version: { type: 'number' } },
  required: ['ok', 'service', 'version'],
} as const

const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    active: { type: 'boolean' },
    include: { type: 'string' },
    roles: { type: 'array', items: { type: 'string' } },
    teams: { type: 'array', items: {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
      required: ['id', 'name'],
    }},
  },
  required: ['id', 'name', 'active', 'roles'],
} as const

const issueSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    teamId: { type: 'string' },
    projectId: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'string' },
    priority: { type: 'number' },
    comments: { type: 'array', items: {
      type: 'object',
      properties: { id: { type: 'string' }, body: { type: 'string' } },
      required: ['id', 'body'],
    }},
  },
  required: ['id', 'teamId', 'projectId', 'title', 'status', 'priority'],
} as const

const fillerSchema = {
  type: 'object',
  properties: { route: { type: 'number' }, tenant: { type: 'string' }, id: { type: 'string' }, ok: { type: 'boolean' } },
  required: ['route', 'tenant', 'id', 'ok'],
} as const

const buildStopcockApp = () => {
  const withAuth = defineMiddleware((ctx) => {
    assertAuth(ctx.request.headers.get('authorization'))
    return { principal: { id: 'bench-user', tenant: 'bench-tenant' } }
  })

  const HealthModule = defineModule({
    name: 'health',
    routes: () => [
      route.get('/health').static(healthPayload()),
    ],
  })

  const ApiModule = defineModule({
    name: 'api',
    prefix: '/api/v1',
    routes: () => [
      ...Array.from({ length: FILLER_ROUTES }, (_, i) =>
        route.get(`/filler-${i}/:tenant/:id`).output(fillerSchema).handler((ctx) =>
          fillerPayload(i, ctx.params.tenant, ctx.params.id),
        ),
      ),
      route.get('/users/:userId').use(withAuth).output(userSchema).handler((ctx) =>
        userPayload(ctx.params.userId, (ctx as any).query.get('include')),
      ),
      route.get('/teams/:teamId/projects/:projectId/issues/:issueId').use(withAuth).output(issueSchema).handler((ctx) =>
        issuePayload(
          ctx.params.teamId,
          ctx.params.projectId,
          ctx.params.issueId,
          (ctx as any).query.get('expand'),
        ),
      ),
      route.get('/search').handler((ctx) => searchPayload((ctx as any).query)),
      route.post('/orders').use(withAuth).handler(async (ctx) =>
        json(201, orderPayload(await ctx.request.json())),
      ),
      route.put('/things/:id').use(withAuth).handler(async (ctx) =>
        thingPayload(ctx.params.id, 'PUT', await ctx.request.json()),
      ),
      route.patch('/things/:id').use(withAuth).handler(async (ctx) =>
        thingPayload(ctx.params.id, 'PATCH', await ctx.request.json()),
      ),
      route.delete('/things/:id').use(withAuth).handler((ctx) =>
        thingPayload(ctx.params.id, 'DELETE', null),
      ),
      route.get('/error-500').handler(() => errorPayloadBody()),
      route.get('/tree').handler(() => TREE_PAYLOAD),
      route.get('/query-echo').handler((ctx) => queryEchoPayload((ctx as any).query)),
      route.post('/echo').handler(async (ctx) => echoPayload(await ctx.request.json())),
      route.get('/redirect').handler(() =>
        new Response(null, { status: 302, headers: { location: REDIRECT_LOCATION } })),
    ],
  })

  return defineApp({
    modules: [HealthModule, ApiModule],
    renderError: renderBenchError,
  })
}

const startStopcock = async () => {
  const app = buildStopcockApp()
  const { server, url } = await listen(createServer(toNodeListener(app)))
  return { id: 'stopcock', name: '@stopcock/server node adapter', url, close: () => closeNodeServer(server) }
}

const startStopcockBun = async () => {
  // Only available under Bun. Under Node, globalThis.Bun is undefined.
  const Bun = (globalThis as { Bun?: { serve: (opts: unknown) => { port: number; stop: () => unknown; url: URL } } }).Bun
  if (!Bun) return null

  const app = buildStopcockApp()
  const fetchHandler = toBunFetch(app)

  for (let remaining = 50; remaining >= 0; remaining--) {
    const port = takePort()
    try {
      const server = Bun.serve({ hostname: HOST, port, fetch: fetchHandler, development: false })
      // Bun.serve may pick a different port if the requested one is taken; use
      // server.port as the source of truth.
      const actualPort = server.port
      return {
        id: 'stopcock-bun',
        name: '@stopcock/server bun.serve adapter',
        url: `http://${HOST}:${actualPort}`,
        close: () => Promise.resolve(server.stop()),
      }
    } catch (error) {
      if (remaining > 0 && isAddressInUse(error)) continue
      throw error
    }
  }
  throw new Error('failed to bind bun.serve benchmark server')
}

const startStopcockBunRoutes = async () => {
  const Bun = (globalThis as { Bun?: { serve: (opts: unknown) => { port: number; stop: () => unknown; url: URL } } }).Bun
  if (!Bun) return null

  const app = buildStopcockApp()
  const cfg = toBunRoutes(app)

  for (let remaining = 50; remaining >= 0; remaining--) {
    const port = takePort()
    try {
      const server = Bun.serve({ hostname: HOST, port, ...cfg, development: false })
      const actualPort = server.port
      return {
        id: 'stopcock-bun-routes',
        name: '@stopcock/server bun.serve native routes',
        url: `http://${HOST}:${actualPort}`,
        close: () => Promise.resolve(server.stop()),
      }
    } catch (error) {
      if (remaining > 0 && isAddressInUse(error)) continue
      throw error
    }
  }
  throw new Error('failed to bind bun.serve routes benchmark server')
}

const startStopcockUws = async () => {
  // uWS ships ABI-pinned native binaries for Node; it won't load under Bun
  // (process.versions.modules differs). Treat any load failure as "skip".
  let uwsMod
  try {
    uwsMod = await import('uWebSockets.js')
  } catch {
    return null
  }
  const adapterMod = await importOptional('../../../packages/server-uws/src/index')
  if (!adapterMod) return null
  const uws = uwsMod.default ?? uwsMod
  const { mountUws } = adapterMod

  const app = buildStopcockApp()
  const uwsApp = uws.App()
  mountUws(uwsApp, app)

  for (let remaining = 50; remaining >= 0; remaining--) {
    const port = takePort()
    const token = await new Promise((resolve) => uwsApp.listen(HOST, port, resolve))
    if (token) {
      return {
        id: 'stopcock-uws',
        name: '@stopcock/server uws adapter',
        url: `http://${HOST}:${port}`,
        close: () => new Promise((resolve) => { uws.us_listen_socket_close(token); resolve() }),
      }
    }
  }
  throw new Error('failed to bind uws benchmark server')
}

const startNative = async () => {
  const fillerPatterns = Array.from({ length: FILLER_ROUTES }, (_, i) => ({
    index: i,
    pattern: new RegExp(`^/api/v1/filler-${i}/([^/]+)/([^/]+)/?$`),
  }))
  const userPattern = /^\/api\/v1\/users\/([^/]+)\/?$/
  const issuePattern = /^\/api\/v1\/teams\/([^/]+)\/projects\/([^/]+)\/issues\/([^/]+)\/?$/
  const thingPattern = /^\/api\/v1\/things\/([^/]+)\/?$/

  const server = createServer(async (req, res) => {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', 'http://bench.local')
    const pathname = url.pathname

    try {
      if ((method === 'GET' || method === 'HEAD') && pathname === '/health') {
        if (method === 'HEAD') { res.statusCode = 200; res.end(); return }
        sendJson(res, 200, healthPayload())
        return
      }
      if (method === 'GET') {
        for (const routeInfo of fillerPatterns) {
          const hit = routeInfo.pattern.exec(pathname)
          if (hit) {
            sendJson(res, 200, fillerPayload(routeInfo.index, hit[1], hit[2]))
            return
          }
        }
      }
      const userHit = method === 'GET' ? userPattern.exec(pathname) : null
      if (userHit) {
        assertAuth(req.headers.authorization)
        sendJson(res, 200, userPayload(userHit[1], url.searchParams.get('include')))
        return
      }
      const issueHit = method === 'GET' ? issuePattern.exec(pathname) : null
      if (issueHit) {
        assertAuth(req.headers.authorization)
        sendJson(res, 200, issuePayload(issueHit[1], issueHit[2], issueHit[3], url.searchParams.get('expand')))
        return
      }
      if ((method === 'GET' || method === 'HEAD') && pathname === '/api/v1/search') {
        if (method === 'HEAD') { res.statusCode = 200; res.end(); return }
        sendJson(res, 200, searchPayload(url.searchParams))
        return
      }
      if (method === 'POST' && pathname === '/api/v1/orders') {
        assertAuth(req.headers.authorization)
        const body = JSON.parse(await collectBody(req))
        sendJson(res, 201, orderPayload(body))
        return
      }
      const thingHit = thingPattern.exec(pathname)
      if (thingHit && (method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
        assertAuth(req.headers.authorization)
        const body = method === 'DELETE' ? null : JSON.parse(await collectBody(req))
        sendJson(res, 200, thingPayload(thingHit[1], method, body))
        return
      }
      if (method === 'GET' && pathname === '/api/v1/error-500') {
        errorPayloadBody()  // throws
        return
      }
      if (method === 'GET' && pathname === '/api/v1/tree') {
        sendJson(res, 200, TREE_PAYLOAD)
        return
      }
      if (method === 'GET' && pathname === '/api/v1/query-echo') {
        sendJson(res, 200, queryEchoPayload(url.searchParams))
        return
      }
      if (method === 'POST' && pathname === '/api/v1/echo') {
        const body = JSON.parse(await collectBody(req))
        sendJson(res, 200, echoPayload(body))
        return
      }
      if ((method === 'GET' || method === 'HEAD') && pathname === '/api/v1/redirect') {
        res.statusCode = 302
        res.setHeader('location', REDIRECT_LOCATION)
        res.setHeader('content-length', '0')
        res.end()
        return
      }
      sendJson(res, 404, { error: 'NotFound', message: 'not found' })
    } catch (error) {
      sendJson(res, error?.status ?? 500, {
        error: error?.code ?? error?.name ?? 'Error',
        message: error?.message ?? 'internal error',
      })
    }
  })

  const { url } = await listen(server)
  return { id: 'native', name: 'node:http baseline', url, close: () => closeNodeServer(server) }
}

const startExpress = async () => {
  const mod = await importOptional('express')
  if (!mod) return null
  const express = mod.default ?? mod
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '128kb' }))

  const auth = (req, res, next) => {
    if (req.headers.authorization !== AUTH_TOKEN) {
      res.status(401).json(unauthorized())
      return
    }
    next()
  }

  app.get('/health', (_req, res) => res.json(healthPayload()))
  for (let i = 0; i < FILLER_ROUTES; i++) {
    app.get(`/api/v1/filler-${i}/:tenant/:id`, (req, res) =>
      res.json(fillerPayload(i, req.params.tenant, req.params.id)),
    )
  }
  app.get('/api/v1/users/:userId', auth, (req, res) =>
    res.json(userPayload(req.params.userId, req.query.include)),
  )
  app.get('/api/v1/teams/:teamId/projects/:projectId/issues/:issueId', auth, (req, res) =>
    res.json(issuePayload(req.params.teamId, req.params.projectId, req.params.issueId, req.query.expand)),
  )
  app.get('/api/v1/search', (req, res) => res.json(searchPayload(new URLSearchParams(req.query))))
  app.post('/api/v1/orders', auth, (req, res) => res.status(201).json(orderPayload(req.body)))
  app.put('/api/v1/things/:id', auth, (req, res) => res.json(thingPayload(req.params.id, 'PUT', req.body)))
  app.patch('/api/v1/things/:id', auth, (req, res) => res.json(thingPayload(req.params.id, 'PATCH', req.body)))
  app.delete('/api/v1/things/:id', auth, (req, res) => res.json(thingPayload(req.params.id, 'DELETE', null)))
  app.get('/api/v1/tree', (_req, res) => res.json(TREE_PAYLOAD))
  app.get('/api/v1/query-echo', (req, res) =>
    res.json(queryEchoPayload(new URLSearchParams(req.query))))
  app.post('/api/v1/echo', (req, res) => res.json(echoPayload(req.body)))
  app.get('/api/v1/redirect', (_req, res) => res.redirect(302, REDIRECT_LOCATION))
  app.get('/api/v1/error-500', (_req, res) => {
    try { errorPayloadBody() } catch (e) {
      res.status((e as { status?: number }).status ?? 500).json({
        error: (e as { code?: string; name?: string }).code ?? (e as Error).name,
        message: (e as Error).message,
      })
    }
  })
  app.use((_req, res) => res.status(404).json({ error: 'NotFound', message: 'not found' }))

  const { server, url } = await listen(createServer(app))
  return { id: 'express', name: 'Express', url, close: () => closeNodeServer(server) }
}

const startFastify = async () => {
  const mod = await importOptional('fastify')
  if (!mod) return null
  const fastify = (mod.default ?? mod)({ logger: false })

  const auth = async (request, reply) => {
    if (request.headers.authorization !== AUTH_TOKEN) {
      reply.code(401).send(unauthorized())
    }
  }

  fastify.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: 'NotFound', message: 'not found' })
  })
  fastify.get('/health', async () => healthPayload())
  for (let i = 0; i < FILLER_ROUTES; i++) {
    fastify.get(`/api/v1/filler-${i}/:tenant/:id`, async (request) =>
      fillerPayload(i, request.params.tenant, request.params.id),
    )
  }
  fastify.get('/api/v1/users/:userId', { preHandler: auth }, async (request) =>
    userPayload(request.params.userId, request.query.include),
  )
  fastify.get('/api/v1/teams/:teamId/projects/:projectId/issues/:issueId', { preHandler: auth }, async (request) =>
    issuePayload(request.params.teamId, request.params.projectId, request.params.issueId, request.query.expand),
  )
  fastify.get('/api/v1/search', async (request) => searchPayload(new URLSearchParams(request.query)))
  fastify.post('/api/v1/orders', { preHandler: auth }, async (request, reply) => {
    reply.code(201)
    return orderPayload(request.body)
  })
  fastify.put('/api/v1/things/:id', { preHandler: auth }, async (request) =>
    thingPayload(request.params.id, 'PUT', request.body))
  fastify.patch('/api/v1/things/:id', { preHandler: auth }, async (request) =>
    thingPayload(request.params.id, 'PATCH', request.body))
  fastify.delete('/api/v1/things/:id', { preHandler: auth }, async (request) =>
    thingPayload(request.params.id, 'DELETE', null))
  fastify.get('/api/v1/tree', async () => TREE_PAYLOAD)
  fastify.get('/api/v1/query-echo', async (request) =>
    queryEchoPayload(new URLSearchParams(request.query)))
  fastify.post('/api/v1/echo', async (request) => echoPayload(request.body))
  fastify.get('/api/v1/redirect', async (_request, reply) => {
    reply.code(302).header('location', REDIRECT_LOCATION).send()
  })
  fastify.get('/api/v1/error-500', async (_request, reply) => {
    try { errorPayloadBody() } catch (e) {
      reply.code((e as { status?: number }).status ?? 500)
      return {
        error: (e as { code?: string; name?: string }).code ?? (e as Error).name,
        message: (e as Error).message,
      }
    }
  })

  return {
    id: 'fastify',
    name: 'Fastify',
    url: await listenFastify(fastify),
    close: () => fastify.close(),
  }
}

const startHono = async () => {
  const honoMod = await importOptional('hono')
  if (!honoMod) return null
  const adapterMod = await importOptional('@hono/node-server')
  if (!adapterMod) return null
  const { Hono } = honoMod
  const { getRequestListener } = adapterMod
  const app = new Hono()

  const auth = async (c, next) => {
    if (c.req.header('authorization') !== AUTH_TOKEN) return c.json(unauthorized(), 401)
    await next()
  }

  app.get('/health', (c) => c.json(healthPayload()))
  for (let i = 0; i < FILLER_ROUTES; i++) {
    app.get(`/api/v1/filler-${i}/:tenant/:id`, (c) =>
      c.json(fillerPayload(i, c.req.param('tenant'), c.req.param('id'))),
    )
  }
  app.get('/api/v1/users/:userId', auth, (c) =>
    c.json(userPayload(c.req.param('userId'), c.req.query('include'))),
  )
  app.get('/api/v1/teams/:teamId/projects/:projectId/issues/:issueId', auth, (c) =>
    c.json(issuePayload(
      c.req.param('teamId'),
      c.req.param('projectId'),
      c.req.param('issueId'),
      c.req.query('expand'),
    )),
  )
  app.get('/api/v1/search', (c) => c.json(searchPayload(new URL(c.req.url).searchParams)))
  app.post('/api/v1/orders', auth, async (c) => c.json(orderPayload(await c.req.json()), 201))
  app.put('/api/v1/things/:id', auth, async (c) =>
    c.json(thingPayload(c.req.param('id'), 'PUT', await c.req.json())))
  app.patch('/api/v1/things/:id', auth, async (c) =>
    c.json(thingPayload(c.req.param('id'), 'PATCH', await c.req.json())))
  app.delete('/api/v1/things/:id', auth, (c) =>
    c.json(thingPayload(c.req.param('id'), 'DELETE', null)))
  app.get('/api/v1/tree', (c) => c.json(TREE_PAYLOAD))
  app.get('/api/v1/query-echo', (c) =>
    c.json(queryEchoPayload(new URL(c.req.url).searchParams)))
  app.post('/api/v1/echo', async (c) => c.json(echoPayload(await c.req.json())))
  app.get('/api/v1/redirect', (c) => c.redirect(REDIRECT_LOCATION, 302))
  app.get('/api/v1/error-500', (c) => {
    try { errorPayloadBody() } catch (e) {
      return c.json({
        error: (e as { code?: string; name?: string }).code ?? (e as Error).name,
        message: (e as Error).message,
      }, (e as { status?: number }).status ?? 500)
    }
    return c.json({}) // unreachable
  })
  app.notFound((c) => c.json({ error: 'NotFound', message: 'not found' }, 404))

  // overrideGlobalObjects:false stops @hono/node-server from replacing
  // global.Response with its Node-friendly polyfill. The replacement breaks
  // Bun.serve in the same process (Bun rejects non-native Response instances).
  const { server, url } = await listen(createServer(getRequestListener(app.fetch, { overrideGlobalObjects: false })))
  return { id: 'hono', name: 'Hono', url, close: () => closeNodeServer(server) }
}

const startKoa = async () => {
  const koaMod = await importOptional('koa')
  if (!koaMod) return null
  const routerMod = await importOptional('@koa/router')
  if (!routerMod) return null
  const bodyParserMod = await importOptional('koa-bodyparser')
  if (!bodyParserMod) return null
  const Koa = koaMod.default ?? koaMod
  const Router = routerMod.default ?? routerMod
  const bodyParser = bodyParserMod.default ?? bodyParserMod
  const app = new Koa()
  const router = new Router()

  const auth = async (ctx, next) => {
    if (ctx.get('authorization') !== AUTH_TOKEN) {
      ctx.status = 401
      ctx.body = unauthorized()
      return
    }
    await next()
  }

  router.get('/health', (ctx) => { ctx.body = healthPayload() })
  // Koa's @koa/router does not auto-derive HEAD from GET; add explicit HEAD
  // routes for the head-requests scenario so parity passes.
  router.head('/health', (ctx) => { ctx.status = 200 })
  for (let i = 0; i < FILLER_ROUTES; i++) {
    router.get(`/api/v1/filler-${i}/:tenant/:id`, (ctx) => {
      ctx.body = fillerPayload(i, ctx.params.tenant, ctx.params.id)
    })
  }
  router.get('/api/v1/users/:userId', auth, (ctx) => {
    ctx.body = userPayload(ctx.params.userId, ctx.query.include)
  })
  router.get('/api/v1/teams/:teamId/projects/:projectId/issues/:issueId', auth, (ctx) => {
    ctx.body = issuePayload(ctx.params.teamId, ctx.params.projectId, ctx.params.issueId, ctx.query.expand)
  })
  router.get('/api/v1/search', (ctx) => {
    ctx.body = searchPayload(new URLSearchParams(ctx.query))
  })
  router.head('/api/v1/search', (ctx) => { ctx.status = 200 })
  router.post('/api/v1/orders', auth, (ctx) => {
    ctx.status = 201
    ctx.body = orderPayload(ctx.request.body)
  })
  router.put('/api/v1/things/:id', auth, (ctx) => {
    ctx.body = thingPayload(ctx.params.id, 'PUT', ctx.request.body)
  })
  router.patch('/api/v1/things/:id', auth, (ctx) => {
    ctx.body = thingPayload(ctx.params.id, 'PATCH', ctx.request.body)
  })
  router.delete('/api/v1/things/:id', auth, (ctx) => {
    ctx.body = thingPayload(ctx.params.id, 'DELETE', null)
  })
  router.get('/api/v1/tree', (ctx) => { ctx.body = TREE_PAYLOAD })
  router.get('/api/v1/query-echo', (ctx) => {
    ctx.body = queryEchoPayload(new URLSearchParams(ctx.query))
  })
  router.post('/api/v1/echo', (ctx) => {
    ctx.body = echoPayload(ctx.request.body)
  })
  router.get('/api/v1/redirect', (ctx) => {
    ctx.status = 302
    ctx.set('location', REDIRECT_LOCATION)
  })
  router.get('/api/v1/error-500', (ctx) => {
    try { errorPayloadBody() } catch (e) {
      ctx.status = (e as { status?: number }).status ?? 500
      ctx.body = {
        error: (e as { code?: string; name?: string }).code ?? (e as Error).name,
        message: (e as Error).message,
      }
    }
  })

  app.use(bodyParser({ jsonLimit: '128kb' }))
  app.use(router.routes())
  app.use(router.allowedMethods())
  app.use((ctx) => {
    if (ctx.status === 404) {
      ctx.status = 404
      ctx.body = { error: 'NotFound', message: 'not found' }
    }
  })

  const { server, url } = await listen(createServer(app.callback()))
  return { id: 'koa', name: 'Koa', url, close: () => closeNodeServer(server) }
}

const importOptional = async (name) => {
  try {
    return await import(name)
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' || String(error?.message ?? '').includes(`Cannot find package '${name}'`)) {
      return null
    }
    throw error
  }
}

const candidates = [
  { id: 'native', start: startNative },
  { id: 'stopcock', start: startStopcock },
  { id: 'stopcock-bun', start: startStopcockBun },
  { id: 'stopcock-bun-routes', start: startStopcockBunRoutes },
  { id: 'stopcock-uws', start: startStopcockUws },
  { id: 'fastify', start: startFastify },
  { id: 'hono', start: startHono },
  { id: 'express', start: startExpress },
  { id: 'koa', start: startKoa },
]

const runAutocannon = (options) =>
  new Promise((resolve, reject) => {
    autocannon(options, (error, result) => error ? reject(error) : resolve(result))
  })

const round = (value, digits = 2) => Number(value ?? 0).toFixed(digits)
const mb = (bytes) => `${round((bytes ?? 0) / 1024 / 1024)} MB/s`

const printTable = (rows) => {
  const header = ['framework', 'req/s', 'lat avg', 'lat p99', 'lat p999', 'lat max', 'throughput', 'gc ms', 'gc#', 'rss Δmb', '2xx/3xx', 'non2xx', 'errors']
  const data = rows.map((row) => [
    row.name,
    round(row.requests.average, 0),
    `${round(row.latency.average)} ms`,
    `${round(row.latency.p99)} ms`,
    `${round(row.latency.p99_9 ?? 0)} ms`,
    `${round(row.latency.max ?? 0)} ms`,
    mb(row.throughput.average),
    String(row.gcMs ?? 0),
    String(row.gcCount ?? 0),
    String(row.rssDeltaMB ?? 0),
    String(row['2xx'] + row['3xx']),
    String(row.non2xx),
    String(row.errors),
  ])
  const all = [header, ...data]
  const widths = header.map((_, i) => Math.max(...all.map((row) => String(row[i]).length)))
  for (const [i, row] of all.entries()) {
    console.log(row.map((cell, column) => String(cell).padEnd(widths[column])).join('  '))
    if (i === 0) console.log(widths.map((width) => '-'.repeat(width)).join('  '))
  }
}

const renderMarkdown = (args, scenario, rows, skipped) => {
  const lines = []
  lines.push(`# Server benchmark — ${args.scenario}`)
  lines.push('')
  lines.push(`_${scenario.description}_`)
  lines.push('')
  lines.push(`connections=${args.connections} duration=${args.duration}s warmup=${args.warmup}s pipelining=${args.pipelining}`)
  lines.push('')
  lines.push('| framework | req/s | lat avg | lat p99 | lat p999 | lat max | throughput | gc ms | gc# | rss Δmb | 2xx/3xx | non2xx | errors |')
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const row of rows) {
    lines.push(`| ${row.name} | ${round(row.requests.average, 0)} | ${round(row.latency.average)} ms | ${round(row.latency.p99)} ms | ${round(row.latency.p99_9 ?? 0)} ms | ${round(row.latency.max ?? 0)} ms | ${mb(row.throughput.average)} | ${row.gcMs ?? 0} | ${row.gcCount ?? 0} | ${row.rssDeltaMB ?? 0} | ${row['2xx'] + row['3xx']} | ${row.non2xx} | ${row.errors} |`)
  }
  if (skipped.length > 0) {
    lines.push('')
    lines.push(`_skipped (deps missing): ${skipped.join(', ')}_`)
  }
  lines.push('')
  return lines.join('\n')
}

const writeReport = (basePath, args, scenario, rows, skipped, sweepTag) => {
  const md = renderMarkdown(args, scenario, rows, skipped)
  const json = JSON.stringify(
    { scenario: args.scenario, description: scenario.description, args, results: rows, skipped },
    null,
    2,
  )
  const resolvedBase = resolve(process.cwd(), basePath)
  const tag = sweepTag ? `-c${sweepTag.connections}-p${sweepTag.pipelining}` : ''
  const suffix = `-${args.scenario}${tag}`
  const mdPath = `${resolvedBase}${suffix}.md`
  const jsonPath = `${resolvedBase}${suffix}.json`
  mkdirSync(dirname(mdPath), { recursive: true })
  writeFileSync(mdPath, md)
  writeFileSync(jsonPath, json)
  console.log(`wrote ${mdPath}`)
  console.log(`wrote ${jsonPath}`)
}

const runParity = async (running, scenario) => {
  const baseline = running.find((r) => r.id === 'native')
  if (!baseline) {
    console.log('parity: skipped (need native baseline running)')
    return { diffs: [] }
  }
  const others = running.filter((r) => r.id !== 'native')
  const result = await checkParity(baseline, others, scenario.requests)
  if (result.diffs.length === 0) {
    console.log(`parity: ok (${others.length} frameworks × ${scenario.requests.length} requests)`)
  } else {
    console.log(`parity: ${result.diffs.length} divergence(s) vs ${baseline.name}`)
    for (const d of result.diffs) {
      console.log(`  ${d.framework} :: ${d.request} — ${d.reason}`)
    }
  }
  return result
}

// PerformanceObserver may or may not emit 'gc' entries depending on the runtime
// (Node supports it natively, Bun is partial). Caller gets zeros if unsupported.
const observeFrameworkMetrics = async () => {
  let perfHooks
  try { perfHooks = await import('node:perf_hooks') } catch { /* unsupported */ }
  let gcMs = 0
  let gcCount = 0
  let observer
  if (perfHooks?.PerformanceObserver) {
    try {
      observer = new perfHooks.PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          gcMs += entry.duration
          gcCount++
        }
      })
      observer.observe({ entryTypes: ['gc'] })
    } catch { observer = undefined }
  }
  const baseline = process.memoryUsage().rss
  let maxRss = baseline
  const interval = setInterval(() => {
    const rss = process.memoryUsage().rss
    if (rss > maxRss) maxRss = rss
  }, 250)
  return {
    stop: () => {
      try { observer?.disconnect() } catch { /* ignore */ }
      clearInterval(interval)
      return {
        gcMs: Math.round(gcMs),
        gcCount,
        rssDeltaMB: Math.max(0, Math.round((maxRss - baseline) / 1024 / 1024)),
      }
    },
  }
}

const runBenchPass = async (args, scenario, running, pipelining, connections) => {
  const rows = []
  for (const r of running) {
    const metrics = await observeFrameworkMetrics()
    try {
      if (args.warmup > 0) {
        await runAutocannon({
          url: r.url,
          connections: Math.min(10, connections),
          duration: args.warmup,
          pipelining,
          requests: scenario.requests,
        })
      }

      // Multi-run: take the median of N runs. Single autocannon runs have
      // ~5-10% variance from GC pauses and other system noise. Median is
      // robust against that without throwing away signal.
      const samples = []
      for (let i = 0; i < args.runs; i++) {
        const result = await runAutocannon({
          url: r.url,
          connections,
          duration: args.duration,
          pipelining,
          requests: scenario.requests,
        })
        samples.push(result)
      }

      const pickMedian = (key, sub) => {
        const sorted = [...samples].sort((a, b) => a[key][sub] - b[key][sub])
        return sorted[Math.floor(sorted.length / 2)]
      }
      const reqMedianResult = pickMedian('requests', 'average')
      const latMedianResult = pickMedian('latency', 'p99')

      const m = metrics.stop()
      rows.push({
        id: r.id,
        name: r.name,
        requests: reqMedianResult.requests,
        latency: latMedianResult.latency,
        throughput: reqMedianResult.throughput,
        errors: samples.reduce((s, x) => s + x.errors, 0),
        non2xx: samples.reduce((s, x) => s + x.non2xx, 0),
        '2xx': samples.reduce((s, x) => s + x['2xx'], 0),
        '3xx': samples.reduce((s, x) => s + x['3xx'], 0),
        runs: samples.length,
        reqRange: samples.length > 1 ? [
          Math.min(...samples.map(s => s.requests.average)),
          Math.max(...samples.map(s => s.requests.average)),
        ] : null,
        gcMs: m.gcMs,
        gcCount: m.gcCount,
        rssDeltaMB: m.rssDeltaMB,
      })
      const suffix = samples.length > 1
        ? ` (median of ${samples.length}; range ${round(Math.min(...samples.map(s => s.requests.average)), 0)}-${round(Math.max(...samples.map(s => s.requests.average)), 0)})`
        : ''
      console.log(`${r.name}: ${round(reqMedianResult.requests.average, 0)} req/s, p99 ${round(latMedianResult.latency.p99)} ms${suffix}`)
    } catch (error) {
      metrics.stop()
      console.error(`${r.name} failed: ${error?.message ?? error}`)
    }
  }
  rows.sort((a, b) => b.requests.average - a.requests.average)
  return rows
}

const main = async () => {
  const args = parseArgs()
  const scenario = scenarios[args.scenario]
  const wanted = args.frameworks === 'all'
    ? new Set(candidates.map((candidate) => candidate.id))
    : new Set(args.frameworks.split(',').map((name) => name.trim()).filter(Boolean))

  const skipped = []
  const running = []
  const pipeliningValues = args.pipeliningSweep ?? [args.pipelining]
  const connectionsValues = args.connectionsSweep ?? [args.connections]
  const isSweep = (args.pipeliningSweep && args.pipeliningSweep.length > 1)
    || (args.connectionsSweep && args.connectionsSweep.length > 1)
  const passes = []

  console.log(`server benchmark: ${args.scenario} (${scenario.description})`)
  const connStr = args.connectionsSweep ? `connections-sweep=${connectionsValues.join(',')}` : `connections=${args.connections}`
  const pipeStr = args.pipeliningSweep ? `pipelining-sweep=${pipeliningValues.join(',')}` : `pipelining=${args.pipelining}`
  console.log(`${connStr} duration=${args.duration}s warmup=${args.warmup}s ${pipeStr}`)
  console.log('')

  try {
    for (const candidate of candidates) {
      if (!wanted.has(candidate.id)) continue
      const r = await candidate.start()
      if (!r) {
        skipped.push(candidate.id)
        continue
      }
      running.push(r)
    }

    if (args.parity) {
      const parityResult = await runParity(running, scenario)
      if (parityResult.diffs.length > 0) {
        console.log('')
        console.log('refusing to run bench with divergent responses. Pass --no-parity to override.')
        process.exitCode = 1
        return
      }
      console.log('')
    }

    if (args.parityOnly) return

    for (const connections of connectionsValues) {
      for (const pipelining of pipeliningValues) {
        if (isSweep) {
          console.log(`--- connections=${connections} pipelining=${pipelining} ---`)
        }
        const rows = await runBenchPass(args, scenario, running, pipelining, connections)
        passes.push({ pipelining, connections, rows })
        if (isSweep) console.log('')
      }
    }
  } finally {
    for (const r of running) {
      try { await r.close() } catch { /* swallow */ }
    }
  }

  for (const pass of passes) {
    console.log('')
    if (isSweep) console.log(`connections=${pass.connections} pipelining=${pass.pipelining}`)
    printTable(pass.rows)
  }

  if (skipped.length > 0) {
    console.log('')
    console.log(`skipped missing optional framework deps: ${skipped.join(', ')}`)
    console.log('Run `bun install` from the repo root after pulling the benchmark dependencies.')
  }

  if (args.json) {
    console.log('')
    const payload = isSweep
      ? { scenario: args.scenario, args, passes, skipped }
      : { scenario: args.scenario, args, results: passes[0].rows, skipped }
    console.log(JSON.stringify(payload, null, 2))
  }

  if (args.report) {
    for (const pass of passes) {
      const argsForReport = isSweep ? { ...args, pipelining: pass.pipelining, connections: pass.connections } : args
      const sweepTag = isSweep ? { pipelining: pass.pipelining, connections: pass.connections } : null
      writeReport(args.report, argsForReport, scenario, pass.rows, skipped, sweepTag)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
