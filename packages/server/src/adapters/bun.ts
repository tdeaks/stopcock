import type { App } from '../router/router'
import { isFastJson, type FastJson } from '../respond'
import type { Handler } from '../router/types'

/**
 * Bun / Deno / Workers — runtimes that natively speak Web fetch. Pass the
 * returned function straight to `Bun.serve({ fetch })`. Goes through
 * `app.dispatch` and only constructs a `Response` at the boundary; plain
 * JSON returns avoid `Response.json()`'s extra Blob/header init.
 */
const pathnameOf = (url: string): string => {
  const hostStart = url.indexOf('://') + 3
  const pathStart = url.indexOf('/', hostStart)
  if (pathStart === -1) return '/'
  const q = url.indexOf('?', pathStart)
  const h = url.indexOf('#', pathStart)
  const end = q === -1 ? (h === -1 ? url.length : h) : (h === -1 ? q : Math.min(q, h))
  let pathname = url.slice(pathStart, end)
  if (pathname.length > 1 && pathname.charCodeAt(pathname.length - 1) === 47) {
    pathname = pathname.slice(0, -1)
  }
  return pathname
}

const JSON_HEADERS: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' }

const finishBunResult = (
  result: Awaited<ReturnType<App['dispatch']>>,
): Response => {
  if (result.kind === 'static' || result.kind === 'value') {
    const status = result.status ?? 200
    if (!result.headers && status === 200) return new Response(result.body, { headers: JSON_HEADERS })
    const headers: Record<string, string> = { ...JSON_HEADERS }
    if (result.headers) Object.assign(headers, result.headers)
    return new Response(result.body, { status, headers })
  }
  if (result.kind === 'notFound') return new Response('not found', { status: 404 })
  return result.response
}

export const toBunFetch = (app: App) => (request: Request): Response | Promise<Response> => {
  const pathname = pathnameOf(request.url)
  const maybe = app.dispatch(request.method, pathname, request, request.signal)
  // Static-route fast path returns synchronously; skip the await microtask.
  if (!(maybe instanceof Promise)) return finishBunResult(maybe)
  return maybe.then(finishBunResult)
}

/**
 * Bun.serve native routes adapter. Returns a `{ routes, fetch }` object you
 * spread into `Bun.serve(...)`.
 *
 * Static routes (declared with `.static(value)`) are registered as
 * pre-allocated `Response` objects on Bun's native router — zero JavaScript
 * runs per request, the response comes straight from Bun's C++ HTTP layer.
 *
 * Dynamic routes are registered as per-path handlers. Bun's native router
 * matches the path (skipping our matcher) and calls the handler with
 * `req.params` already populated. The handler then invokes the middleware
 * chain directly via `__direct`, serializes via the route's compiled
 * serializer when present, and returns a `Response`.
 *
 * Routes with global hooks fall back to the standard `fetch` path since
 * native routes bypass `app.fetch` (no edge hooks, no after hooks across
 * routes).
 *
 *   const app = defineApp({ modules })
 *   Bun.serve(toBunRoutes(app))
 */
type BunRequestLike = Request & { params?: Record<string, string> }
type RouteHandler = (req: BunRequestLike) => Response | Promise<Response>
type BunRoutes = Record<string, Response | RouteHandler | Record<string, RouteHandler>>

class BunNativeCtx {
  private _query: URLSearchParams | null = null
  constructor(public request: Request, public params: Record<string, string>) {}
  get query(): URLSearchParams {
    if (this._query) return this._query
    const url = this.request.url
    const q = url.indexOf('?')
    this._query = new URLSearchParams(q === -1 ? '' : url.slice(q + 1))
    return this._query
  }
}

const buildStaticResponse = (
  body: string,
  status?: number,
  headers?: Readonly<Record<string, string>>,
): Response => {
  if (!headers && (status === undefined || status === 200)) {
    return new Response(body, { headers: JSON_HEADERS })
  }
  const h: Record<string, string> = { ...JSON_HEADERS }
  if (headers) Object.assign(h, headers)
  return new Response(body, { status: status ?? 200, headers: h })
}

const compileRouteHandler = (route: App['routes'][number]): RouteHandler => {
  const direct = (route.handler as Handler<unknown, unknown, unknown>).__direct
  const serializer = route.serializer
  const render = route.render

  const finishValue = (value: unknown): Response => {
    if (value instanceof Response) return value
    if (isFastJson(value)) {
      const fj = value as FastJson
      const body = serializer ? serializer(fj.value).body : JSON.stringify(fj.value)
      if (!fj.headers && fj.status === undefined) {
        return new Response(body, { headers: JSON_HEADERS })
      }
      const headers: Record<string, string> = { ...JSON_HEADERS }
      if (fj.headers) Object.assign(headers, fj.headers)
      return new Response(body, { status: fj.status ?? 200, headers })
    }
    const body = serializer ? serializer(value).body : JSON.stringify(value)
    return new Response(body, { headers: JSON_HEADERS })
  }

  // Non-async wrapper. When the entire middleware+handler chain is
  // synchronous (sync auth + sync handler), this returns Response directly
  // and Bun.serve avoids the microtask hop.
  return (req) => {
    const ctx = new BunNativeCtx(req, req.params ?? {})
    let value: unknown
    try {
      value = direct ? direct(ctx as never) : route.handler(ctx as never).run()
    } catch (e) {
      return render(e)
    }
    if (value instanceof Promise) {
      return value.then(finishValue, render)
    }
    return finishValue(value)
  }
}

export const toBunRoutes = (app: App): { routes: BunRoutes; fetch: (request: Request) => Response | Promise<Response> } => {
  const routes: BunRoutes = {}
  // Group routes by path. Multiple methods on the same path become a
  // method-keyed object in Bun's routes config.
  const byPath = new Map<string, App['routes'][number][]>()
  for (const r of app.routes) {
    const list = byPath.get(r.path)
    if (list) list.push(r); else byPath.set(r.path, [r])
  }

  for (const [path, group] of byPath) {
    // Single GET with a precomputed body → pure native response, no JS.
    if (group.length === 1) {
      const r = group[0]!
      if (r.staticBody !== undefined && r.method === 'GET' && r.hooks.length === 0) {
        routes[path] = buildStaticResponse(r.staticBody, r.staticStatus, r.staticHeaders)
        continue
      }
    }
    if (group.length === 1) {
      routes[path] = compileRouteHandler(group[0]!)
      continue
    }
    const methods: Record<string, RouteHandler> = {}
    for (const r of group) {
      if (r.staticBody !== undefined && r.hooks.length === 0) {
        // Method-keyed static is uncommon; build a tiny handler that returns
        // the cached Response. Bun does not yet accept Response as a value
        // inside method-keyed routes.
        const cached = buildStaticResponse(r.staticBody, r.staticStatus, r.staticHeaders)
        methods[r.method] = () => cached
      } else {
        methods[r.method] = compileRouteHandler(r)
      }
    }
    routes[path] = methods
  }

  return { routes, fetch: toBunFetch(app) }
}
