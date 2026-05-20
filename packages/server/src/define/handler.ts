import { of } from '@stopcock/async'
import type { Handler, Ctx } from '../router/types'
import type { Params } from '../router/routing'
import type { Middleware } from '../middleware/define'
import { isRoutePlugin, mergeMeta, type LifecycleHook, type RouteMeta, type RoutePlugin } from '../plugin'
import { compileJsonSerializerWithBytes, type JsonSchema, type JsonSerializerWithBytes } from '../compile-json'

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export type RouteDef = {
  readonly _tag: 'RouteDef'
  readonly method: Method
  readonly path: string
  readonly handler: Handler<Ctx<any>, any, any>
  readonly render?: (e: any) => Response
  /** Middlewares in order of application. Their `.meta` drives codegen (OpenAPI, RPC). */
  readonly middlewares: ReadonlyArray<Middleware<any, any>>
  readonly hooks: ReadonlyArray<LifecycleHook>
  readonly meta?: RouteMeta
  /** Compiled serializer for the handler's return value. Skips JSON.stringify when present. */
  readonly serializer?: JsonSerializerWithBytes
  /** Pre-encoded body for static routes. Dispatch short-circuits to this. */
  readonly staticBody?: string
  readonly staticStatus?: number
  readonly staticHeaders?: Readonly<Record<string, string>>
}

export function defineHandler<P extends string, R, E>(config: {
  method: Method
  path: P
  handler: Handler<Ctx<Params<P>>, R, E>
  render?: (e: E) => Response
  middlewares?: ReadonlyArray<Middleware<any, any>>
  hooks?: ReadonlyArray<LifecycleHook>
  meta?: RouteMeta
}): RouteDef {
  const { middlewares = [], hooks = [], ...rest } = config
  return { _tag: 'RouteDef', ...rest, middlewares, hooks }
}

export interface RouteChain<C, E> {
  use<Provides extends object, EAdded>(
    mw: Middleware<Provides, EAdded>,
  ): RouteChain<C & Provides, E | EAdded>
  use<Provides extends object, EAdded>(
    plugin: RoutePlugin<Provides, EAdded>,
  ): RouteChain<C & Provides, E | EAdded>
  meta(meta: RouteMeta): RouteChain<C, E>
  /**
   * Declare the response shape. The framework compiles a hardcoded serializer
   * that's faster than JSON.stringify (skips type-checks, key lookups, and
   * JSON.stringify's per-string escape walk for safe ASCII payloads).
   */
  output(schema: JsonSchema): RouteChain<C, E>
  /**
   * Routes that emit a fixed JSON payload. Pre-serializes at registration so
   * dispatch can skip the matcher → ctx → handler → stringify chain entirely
   * and return the cached body directly. Use for /health, /version, etc.
   */
  static<R>(value: R, init?: { status?: number; headers?: Readonly<Record<string, string>> }): RouteDef
  /** Plain handler. Framework lifts the return value to a Task internally. */
  handler<R>(fn: (ctx: C) => R | Promise<R>): RouteDef
  /** Task-returning handler. Use when composing with resilience combinators. */
  taskHandler<R, EHandler = never>(fn: Handler<C, R, EHandler>): RouteDef
}

function makeChain<C, E>(
  method: Method,
  path: string,
  mws: ReadonlyArray<Middleware<any, any>>,
  hooks: ReadonlyArray<LifecycleHook>,
  meta: RouteMeta | undefined,
  serializer: JsonSerializerWithBytes | undefined,
): RouteChain<C, E> {
  const compose = (h: Handler<any, any, any>): Handler<any, any, any> =>
    mws.reduceRight<Handler<any, any, any>>((acc, mw) => mw(acc), h)
  return {
    use(mwOrPlugin) {
      if (isRoutePlugin(mwOrPlugin)) {
        return makeChain(
          method,
          path,
          mwOrPlugin.middleware ? [...mws, mwOrPlugin.middleware] : mws,
          mwOrPlugin.hooks ? [...hooks, ...mwOrPlugin.hooks] : hooks,
          mergeMeta(meta, mwOrPlugin.meta),
          serializer,
        )
      }
      return makeChain(method, path, [...mws, mwOrPlugin], hooks, mergeMeta(meta, mwOrPlugin.meta), serializer)
    },
    meta(next) { return makeChain(method, path, mws, hooks, mergeMeta(meta, next), serializer) },
    output(schema) { return makeChain(method, path, mws, hooks, meta, compileJsonSerializerWithBytes(schema)) },
    static(value, init) {
      const body = serializer ? serializer(value).body : JSON.stringify(value)
      // Dummy handler — kept so the rest of the framework treats this like a
      // normal route. Dispatch never actually invokes it.
      const dummy: Handler<any, any, any> = Object.assign(
        (_ctx: any) => of(async () => value),
        { __direct: () => value },
      )
      return {
        _tag: 'RouteDef',
        method, path,
        handler: compose(dummy),
        middlewares: mws, hooks, meta, serializer,
        staticBody: body,
        staticStatus: init?.status,
        staticHeaders: init?.headers,
      }
    },
    handler(fn) {
      const lifted: Handler<any, any, any> = Object.assign(
        (ctx: any) => of(async () => fn(ctx)),
        { __direct: ((ctx: any) => fn(ctx)) as (ctx: any) => any },
      )
      return { _tag: 'RouteDef', method, path, handler: compose(lifted), middlewares: mws, hooks, meta, serializer }
    },
    taskHandler(fn) {
      return { _tag: 'RouteDef', method, path, handler: compose(fn), middlewares: mws, hooks, meta, serializer }
    },
  }
}

const startChain = (method: Method) =>
  <P extends string>(path: P): RouteChain<Ctx<Params<P>>, never> =>
    makeChain<Ctx<Params<P>>, never>(method, path, [], [], undefined, undefined)

export const route = {
  get:    startChain('GET'),
  post:   startChain('POST'),
  put:    startChain('PUT'),
  patch:  startChain('PATCH'),
  delete: startChain('DELETE'),
  head:   startChain('HEAD'),
  options:startChain('OPTIONS'),
}
