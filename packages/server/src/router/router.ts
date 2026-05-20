import { of } from '@stopcock/async'
import type { Handler, Ctx } from './types'
import type { Params } from './routing'
import { compileMatcher, type MatcherFn } from './compile'
import type { EdgeHook, LifecycleHook, RouteMeta } from '../plugin'
import { isFastJson, type FastJson } from '../respond'
import type { JsonSerializerWithBytes } from '../compile-json'
import { queryGetFast } from '../query-fast'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

type AnyHandler = Handler<Ctx<Record<string, string>>, unknown, unknown>

type Compiled = {
  method: Method
  path: string
  pattern: RegExp
  paramNames: readonly string[]
  handler: AnyHandler
  render: (e: unknown) => Response
  hooks: readonly LifecycleHook[]
  meta?: RouteMeta
  serializer?: JsonSerializerWithBytes
  staticBody?: string
  staticBodyLength?: number
  staticStatus?: number
  staticHeaders?: Readonly<Record<string, string>>
}

const compilePath = (path: string): { pattern: RegExp; paramNames: string[] } => {
  const paramNames: string[] = []
  const source = path.replace(/\/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    paramNames.push(name)
    return '/([^/]+)'
  })
  return { pattern: new RegExp(`^${source}/?$`), paramNames }
}

const defaultRender = (e: unknown): Response => {
  const status = (e as { status?: number })?.status ?? 500
  const message = (e as { message?: string })?.message ?? 'internal error'
  const tag = (e as { _tag?: string })?._tag
  return Response.json({ error: tag ?? 'Error', message }, { status })
}

export type DispatchResult =
  | {
      /**
       * Pre-serialized JSON body. Dispatch handles the serializer call so the
       * adapter only writes bytes. `byteLength` is set when the serializer
       * proves the output is ASCII-only (body.length === byteLength); when
       * null the adapter must compute via Buffer.byteLength.
       */
      readonly kind: 'value'
      readonly body: string
      readonly byteLength: number | null
      readonly status?: number
      readonly headers?: Readonly<Record<string, string>>
    }
  | {
      /** Pre-encoded body for static routes. */
      readonly kind: 'static'
      readonly body: string
      readonly byteLength: number | null
      readonly status?: number
      readonly headers?: Readonly<Record<string, string>>
    }
  | { readonly kind: 'response'; readonly response: Response }
  | { readonly kind: 'notFound' }

export interface App {
  readonly routes: readonly Compiled[]
  /**
   * Adapter-level dispatch. Returns the raw handler value when possible so
   * adapters can JSON.stringify directly and skip Response/ReadableStream
   * construction. Use `fetch` for the standard Web-API path; use `dispatch`
   * for hot HTTP adapters.
   *
   * Returns synchronously when the result can be determined without any
   * async work — currently for `notFound` and `static` results. Adapters
   * should branch on `result instanceof Promise` to avoid an unnecessary
   * microtask on the hot path.
   */
  dispatch(method: string, pathname: string, request: Request, signal?: AbortSignal): DispatchResult | Promise<DispatchResult>
  get<P extends string, Res, E>(
    path: P,
    handler: Handler<Ctx<Params<P>>, Res, E>,
    render?: (e: E) => Response,
    options?: RegisterOptions,
  ): App
  post<P extends string, Res, E>(
    path: P,
    handler: Handler<Ctx<Params<P>>, Res, E>,
    render?: (e: E) => Response,
    options?: RegisterOptions,
  ): App
  put<P extends string, Res, E>(
    path: P,
    handler: Handler<Ctx<Params<P>>, Res, E>,
    render?: (e: E) => Response,
    options?: RegisterOptions,
  ): App
  patch<P extends string, Res, E>(
    path: P,
    handler: Handler<Ctx<Params<P>>, Res, E>,
    render?: (e: E) => Response,
    options?: RegisterOptions,
  ): App
  delete<P extends string, Res, E>(
    path: P,
    handler: Handler<Ctx<Params<P>>, Res, E>,
    render?: (e: E) => Response,
    options?: RegisterOptions,
  ): App
  head<P extends string, Res, E>(
    path: P,
    handler: Handler<Ctx<Params<P>>, Res, E>,
    render?: (e: E) => Response,
    options?: RegisterOptions,
  ): App
  options<P extends string, Res, E>(
    path: P,
    handler: Handler<Ctx<Params<P>>, Res, E>,
    render?: (e: E) => Response,
    options?: RegisterOptions,
  ): App
  fetch(request: Request): Promise<Response>
}

export type RegisterOptions = {
  readonly hooks?: readonly LifecycleHook[]
  readonly meta?: RouteMeta
  readonly serializer?: JsonSerializerWithBytes
  readonly staticBody?: string
  readonly staticStatus?: number
  readonly staticHeaders?: Readonly<Record<string, string>>
}

type AppOptions = {
  readonly edge?: readonly EdgeHook[]
  readonly hooks?: readonly LifecycleHook[]
  readonly meta?: RouteMeta
}

type Mutable = { matcher: MatcherFn | null }

const toResponse = (value: unknown): Response =>
  value instanceof Response ? value : Response.json(value)

const isAsciiString = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 128) return false
  }
  return true
}

const register = (routes: Compiled[], mut: Mutable, appOptions: AppOptions, method: Method) =>
  <P extends string, R, E>(path: P, handler: Handler<Ctx<Params<P>>, R, E>, render?: (e: E) => Response, options?: RegisterOptions): App => {
    const { pattern, paramNames } = compilePath(path)
    const staticBody = options?.staticBody
    routes.push({
      method,
      path,
      pattern,
      paramNames,
      handler: handler as AnyHandler,
      render: (render ?? defaultRender) as (e: unknown) => Response,
      hooks: options?.hooks ?? [],
      meta: options?.meta,
      serializer: options?.serializer,
      staticBody,
      // Pre-scan static bodies once at registration. ASCII is the typical case
      // (compiled JSON of nums/bools/ASCII strings) so save the per-request
      // Buffer.byteLength scan.
      staticBodyLength: staticBody !== undefined && isAsciiString(staticBody) ? staticBody.length : undefined,
      staticStatus: options?.staticStatus,
      staticHeaders: options?.staticHeaders,
    })
    mut.matcher = null
    return makeApp(routes, mut, appOptions)
  }

const runBefore = async (ctx: Ctx, hooks: readonly LifecycleHook[]) => {
  for (const hook of hooks) await hook.before?.(ctx)
}

const runAfter = async (ctx: Ctx, response: Response, hooks: readonly LifecycleHook[]): Promise<Response> => {
  let current = response
  for (const hook of hooks) current = await hook.after?.(ctx, current) ?? current
  return current
}

const runOnError = async (ctx: Ctx, error: unknown, hooks: readonly LifecycleHook[]): Promise<Response | undefined> => {
  for (const hook of hooks) {
    const response = await hook.onError?.(ctx, error)
    if (response) return response
  }
  return undefined
}

const EMPTY_HOOKS: readonly LifecycleHook[] = []

const ensureMatcher = (routes: Compiled[], mut: Mutable): MatcherFn => {
  if (!mut.matcher) {
    mut.matcher = compileMatcher(routes.map((r) => ({
      method: r.method,
      path: r.path,
      paramNames: [...r.paramNames],
      pattern: r.pattern,
    })))
  }
  return mut.matcher
}

const pathnameOf = (url: string): string => {
  const hostStart = url.indexOf('://') + 3
  const pathStart = url.indexOf('/', hostStart)
  let pathname: string
  if (pathStart === -1) {
    pathname = '/'
  } else {
    const q = url.indexOf('?', pathStart)
    const h = url.indexOf('#', pathStart)
    const end = q === -1 ? (h === -1 ? url.length : h) : (h === -1 ? q : Math.min(q, h))
    pathname = url.slice(pathStart, end)
  }
  if (pathname.length > 1 && pathname.charCodeAt(pathname.length - 1) === 47) {
    pathname = pathname.slice(0, -1)
  }
  return pathname
}

class RequestCtx {
  private _params: Record<string, string> | null
  private _query: URLSearchParams | null = null
  // undefined = not yet computed; null = no query string present
  private _qs: string | null | undefined = undefined
  constructor(
    public request: Request,
    eagerParams: Record<string, string> | null,
    private readonly m: RegExpExecArray | null,
    private readonly paramNames: readonly string[],
    private readonly paramOffsets: readonly number[],
  ) {
    this._params = eagerParams
  }
  get params(): Record<string, string> {
    if (this._params) return this._params
    const out: Record<string, string> = {}
    const m = this.m
    if (m) {
      const names = this.paramNames
      const offs = this.paramOffsets
      for (let i = 0; i < names.length; i++) out[names[i]!] = m[offs[i]!]!
    }
    this._params = out
    return out
  }
  private getQs(): string | null {
    if (this._qs !== undefined) return this._qs
    const url = this.request.url
    const qIdx = url.indexOf('?')
    if (qIdx === -1) { this._qs = null; return null }
    const hashIdx = url.indexOf('#', qIdx)
    this._qs = hashIdx === -1 ? url.slice(qIdx + 1) : url.slice(qIdx + 1, hashIdx)
    return this._qs
  }
  // Adapter-agnostic query accessor. Works for both Bun's standard Request
  // (full URL) and the Node shim's path+query string — both have `?` at the
  // same boundary.
  get query(): URLSearchParams {
    if (this._query) return this._query
    this._query = new URLSearchParams(this.getQs() ?? '')
    return this._query
  }
  queryGet(name: string): string | null {
    const qs = this.getQs()
    if (qs === null) return null
    return queryGetFast(qs, name, () => this.query.get(name))
  }
}

const dispatchCore = (
  routes: Compiled[],
  mut: Mutable,
  options: AppOptions,
  method: string,
  pathname: string,
  request: Request,
  signal?: AbortSignal,
): DispatchResult | Promise<DispatchResult> => {
  const matcher = ensureMatcher(routes, mut)
  // RFC 9110: HEAD should be treated as GET sans body. Try the matched method
  // first, then fall back to GET on HEAD-miss so users don't have to register
  // duplicate HEAD handlers.
  let hit = matcher(method, pathname)
  if (!hit && method === 'HEAD') hit = matcher('GET', pathname)
  if (!hit) return { kind: 'notFound' }
  const route = routes[hit.index]!

  // Static-response fast path — fully synchronous. Skips ctx allocation,
  // handler call, serializer, and the await microtask the adapter would
  // otherwise pay.
  if (route.staticBody !== undefined && route.hooks.length === 0 && (options.hooks?.length ?? 0) === 0) {
    return {
      kind: 'static',
      body: route.staticBody,
      byteLength: route.staticBodyLength ?? null,
      status: route.staticStatus,
      headers: route.staticHeaders,
    }
  }

  return dispatchCoreAsync(routes, mut, options, request, signal, route, hit.params, hit.m, hit.paramNames, hit.paramOffsets)
}

// Pre-serialize the handler return into a DispatchResult value variant.
// When the route has a compiled serializer, it returns both the body and a
// byteLength hint (null when output may contain non-ASCII). Without a
// serializer, fall back to JSON.stringify and leave the adapter to compute
// the byte length.
const finalizeValue = (
  serializer: JsonSerializerWithBytes | undefined,
  value: unknown,
  status?: number,
  headers?: Readonly<Record<string, string>>,
): DispatchResult => {
  if (serializer) {
    const out = serializer(value)
    return { kind: 'value', body: out.body, byteLength: out.byteLength, status, headers }
  }
  return { kind: 'value', body: JSON.stringify(value), byteLength: null, status, headers }
}

const dispatchCoreAsync = async (
  routes: Compiled[],
  mut: Mutable,
  options: AppOptions,
  request: Request,
  signal: AbortSignal | undefined,
  route: Compiled,
  eagerParams: Record<string, string> | null,
  m: RegExpExecArray | null,
  paramNames: readonly string[],
  paramOffsets: readonly number[],
): Promise<DispatchResult> => {
  const ctx = new RequestCtx(request, eagerParams, m, paramNames, paramOffsets)

  // Hook chains. Empty in the common case — skip the spreads entirely so the
  // hot path makes zero array allocations.
  const globalHooks = options.hooks
  const routeHooks = route.hooks
  const hasGlobal = globalHooks != null && globalHooks.length > 0
  const hasRoute = routeHooks.length > 0
  let beforeHooks: readonly LifecycleHook[]
  let afterHooks: readonly LifecycleHook[]
  if (!hasGlobal && !hasRoute) {
    beforeHooks = EMPTY_HOOKS
    afterHooks = EMPTY_HOOKS
  } else if (!hasGlobal) {
    beforeHooks = routeHooks
    afterHooks = [...routeHooks].reverse()
  } else if (!hasRoute) {
    beforeHooks = globalHooks!
    afterHooks = [...globalHooks!].reverse()
  } else {
    beforeHooks = [...globalHooks!, ...routeHooks]
    afterHooks = [...routeHooks].reverse().concat([...globalHooks!].reverse())
  }

  try {
    if (beforeHooks.length > 0) await runBefore(ctx as Ctx, beforeHooks)
    const direct = (route.handler as Handler<unknown, unknown, unknown>).__direct
    const value = direct
      ? await direct(ctx as never, signal)
      : await route.handler(ctx as never).run(signal)
    if (afterHooks.length === 0) {
      if (isFastJson(value)) {
        const fj = value as FastJson
        return finalizeValue(route.serializer, fj.value, fj.status, fj.headers)
      }
      if (!(value instanceof Response)) return finalizeValue(route.serializer, value)
    }
    const response = await runAfter(ctx as Ctx, toResponse(value), afterHooks)
    return { kind: 'response', response }
  } catch (e) {
    if (afterHooks.length === 0) {
      return { kind: 'response', response: route.render(e) }
    }
    const handled = await runOnError(ctx as Ctx, e, afterHooks)
    const errorResponse = handled ?? route.render(e)
    const response = await runAfter(ctx as Ctx, errorResponse, afterHooks)
    return { kind: 'response', response }
  }
}

const makeApp = (routes: Compiled[], mut: Mutable, options: AppOptions = {}): App => ({
  routes,
  get:    register(routes, mut, options, 'GET'),
  post:   register(routes, mut, options, 'POST'),
  put:    register(routes, mut, options, 'PUT'),
  patch:  register(routes, mut, options, 'PATCH'),
  delete: register(routes, mut, options, 'DELETE'),
  head:   register(routes, mut, options, 'HEAD'),
  options:register(routes, mut, options, 'OPTIONS'),

  dispatch(method, pathname, request, signal) {
    return dispatchCore(routes, mut, options, method, pathname, request, signal)
  },

  async fetch(request) {
    for (const hook of options.edge ?? []) {
      const next = await hook(request)
      if (next instanceof Response) return next
      if (next instanceof Request) request = next
    }
    const pathname = pathnameOf(request.url)
    const maybe = dispatchCore(routes, mut, options, request.method, pathname, request, request.signal)
    const result = maybe instanceof Promise ? await maybe : maybe
    if (result.kind === 'notFound') return new Response('not found', { status: 404 })
    if (result.kind === 'value' || result.kind === 'static') {
      const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' }
      if (result.headers) Object.assign(headers, result.headers)
      return new Response(result.body, { status: result.status ?? 200, headers })
    }
    return result.response
  },
})

export const createApp = (options?: AppOptions): App => makeApp([], { matcher: null }, options)

export const handler =
  <C, R>(fn: (ctx: C) => R | Promise<R>): Handler<C, R, unknown> =>
  (ctx) => of(async () => fn(ctx))
