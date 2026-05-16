import { of } from '@stopcock/async'
import type { Handler, Ctx } from './types'
import type { Params } from './routing'
import { compileMatcher, type MatcherFn } from './compile'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type AnyHandler = Handler<Ctx<Record<string, string>>, unknown, unknown>

type Compiled = {
  method: Method
  path: string
  pattern: RegExp
  paramNames: readonly string[]
  handler: AnyHandler
  render: (e: unknown) => Response
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
  ): App
  post<P extends string, Res, E>(
    path: P,
    handler: Handler<Ctx<Params<P>>, Res, E>,
    render?: (e: E) => Response,
  ): App
  put<P extends string, Res, E>(
    path: P,
    handler: Handler<Ctx<Params<P>>, Res, E>,
    render?: (e: E) => Response,
  ): App
  patch<P extends string, Res, E>(
    path: P,
    handler: Handler<Ctx<Params<P>>, Res, E>,
    render?: (e: E) => Response,
  ): App
  delete<P extends string, Res, E>(
    path: P,
    handler: Handler<Ctx<Params<P>>, Res, E>,
    render?: (e: E) => Response,
  ): App
  fetch(request: Request): Promise<Response>
}

type Mutable = { matcher: MatcherFn | null }

const register = (routes: Compiled[], mut: Mutable, method: Method) =>
  <P extends string, R, E>(path: P, handler: Handler<Ctx<Params<P>>, R, E>, render?: (e: E) => Response): App => {
    const { pattern, paramNames } = compilePath(path)
    routes.push({ method, path, pattern, paramNames, handler: handler as AnyHandler, render: (render ?? defaultRender) as (e: unknown) => Response })
    mut.matcher = null
    return makeApp(routes, mut)
  }

const makeApp = (routes: Compiled[], mut: Mutable): App => ({
  routes,
  get:    register(routes, mut, 'GET'),
  post:   register(routes, mut, 'POST'),
  put:    register(routes, mut, 'PUT'),
  patch:  register(routes, mut, 'PATCH'),
  delete: register(routes, mut, 'DELETE'),

  async fetch(request) {
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
    try {
      const value = await route.handler(ctx as never).run(request.signal)
      return value instanceof Response ? value : Response.json(value)
    } catch (e) {
      return route.render(e)
    }
  },
})

export const createApp = (): App => makeApp([], { matcher: null })

export const handler =
  <C, R>(fn: (ctx: C) => R | Promise<R>): Handler<C, R, unknown> =>
  (ctx) => of(async () => fn(ctx))
