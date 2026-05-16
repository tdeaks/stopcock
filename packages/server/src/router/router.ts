import { of } from '@stopcock/async'
import type { Handler, Ctx } from './types'
import type { Params } from './routing'
import { compileMatcher, type MatcherFn } from './compile'
import type { EdgeHook, LifecycleHook, RouteMeta } from '../plugin'

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

export interface App {
  readonly routes: readonly Compiled[]
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
}

type AppOptions = {
  readonly edge?: readonly EdgeHook[]
  readonly hooks?: readonly LifecycleHook[]
  readonly meta?: RouteMeta
}

type Mutable = { matcher: MatcherFn | null }

const toResponse = (value: unknown): Response =>
  value instanceof Response ? value : Response.json(value)

const register = (routes: Compiled[], mut: Mutable, appOptions: AppOptions, method: Method) =>
  <P extends string, R, E>(path: P, handler: Handler<Ctx<Params<P>>, R, E>, render?: (e: E) => Response, options?: RegisterOptions): App => {
    const { pattern, paramNames } = compilePath(path)
    routes.push({
      method,
      path,
      pattern,
      paramNames,
      handler: handler as AnyHandler,
      render: (render ?? defaultRender) as (e: unknown) => Response,
      hooks: options?.hooks ?? [],
      meta: options?.meta,
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

const makeApp = (routes: Compiled[], mut: Mutable, options: AppOptions = {}): App => ({
  routes,
  get:    register(routes, mut, options, 'GET'),
  post:   register(routes, mut, options, 'POST'),
  put:    register(routes, mut, options, 'PUT'),
  patch:  register(routes, mut, options, 'PATCH'),
  delete: register(routes, mut, options, 'DELETE'),
  head:   register(routes, mut, options, 'HEAD'),
  options:register(routes, mut, options, 'OPTIONS'),

  async fetch(request) {
    for (const hook of options.edge ?? []) {
      const next = await hook(request)
      if (next instanceof Response) return next
      if (next instanceof Request) request = next
    }

    if (!mut.matcher) mut.matcher = compileMatcher(routes.map((r) => ({ method: r.method, path: r.path, paramNames: [...r.paramNames], pattern: r.pattern })))
    const u = request.url
    const hostStart = u.indexOf('://') + 3
    const pathStart = u.indexOf('/', hostStart)
    let pathname: string
    if (pathStart === -1) {
      pathname = '/'
    } else {
      const q = u.indexOf('?', pathStart)
      const h = u.indexOf('#', pathStart)
      const end = q === -1 ? (h === -1 ? u.length : h) : (h === -1 ? q : Math.min(q, h))
      pathname = u.slice(pathStart, end)
    }
    if (pathname.length > 1 && pathname.charCodeAt(pathname.length - 1) === 47) {
      pathname = pathname.slice(0, -1)
    }
    const hit = mut.matcher(request.method, pathname)
    if (!hit) return new Response('not found', { status: 404 })
    const route = routes[hit.index]!
    const eagerParams = hit.params
    const m = hit.m
    const paramNames = hit.paramNames
    const paramOffsets = hit.paramOffsets
    let paramsCache: Record<string, string> | null = eagerParams
    const ctx = {
      request,
      get params(): Record<string, string> {
        if (paramsCache) return paramsCache
        const out: Record<string, string> = {}
        if (m) for (let i = 0; i < paramNames.length; i++) out[paramNames[i]!] = m[paramOffsets[i]!]!
        paramsCache = out
        return out
      },
    }
    const globalHooks = options.hooks ?? []
    const routeHooks = route.hooks
    const beforeHooks = [...globalHooks, ...routeHooks]
    const afterHooks = [...routeHooks].reverse().concat([...globalHooks].reverse())
    const errorHooks = [...routeHooks].reverse().concat([...globalHooks].reverse())

    let response: Response
    try {
      await runBefore(ctx as Ctx, beforeHooks)
      const value = await route.handler(ctx as never).run(request.signal)
      response = toResponse(value)
    } catch (e) {
      response = await runOnError(ctx as Ctx, e, errorHooks) ?? route.render(e)
    }
    return runAfter(ctx as Ctx, response, afterHooks)
  },
})

export const createApp = (options?: AppOptions): App => makeApp([], { matcher: null }, options)

export const handler =
  <C, R>(fn: (ctx: C) => R | Promise<R>): Handler<C, R, unknown> =>
  (ctx) => of(async () => fn(ctx))
