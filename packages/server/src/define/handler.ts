import { of } from '@stopcock/async'
import type { Handler, Ctx } from '../router/types'
import type { Params } from '../router/routing'
import type { Middleware } from '../middleware/define'

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type RouteDef = {
  readonly _tag: 'RouteDef'
  readonly method: Method
  readonly path: string
  readonly handler: Handler<Ctx<any>, any, any>
  readonly render?: (e: any) => Response
  /** Middlewares in order of application. Their `.meta` drives codegen (OpenAPI, RPC). */
  readonly middlewares: ReadonlyArray<Middleware<any, any>>
}

export function defineHandler<P extends string, R, E>(config: {
  method: Method
  path: P
  handler: Handler<Ctx<Params<P>>, R, E>
  render?: (e: E) => Response
  middlewares?: ReadonlyArray<Middleware<any, any>>
}): RouteDef {
  const { middlewares = [], ...rest } = config
  return { _tag: 'RouteDef', ...rest, middlewares }
}

export interface RouteChain<C, E> {
  use<Provides extends object, EAdded>(
    mw: Middleware<Provides, EAdded>,
  ): RouteChain<C & Provides, E | EAdded>
  /** Plain handler. Framework lifts the return value to a Task internally. */
  handler<R>(fn: (ctx: C) => R | Promise<R>): RouteDef
  /** Task-returning handler. Use when composing with resilience combinators. */
  taskHandler<R, EHandler = never>(fn: Handler<C, R, EHandler>): RouteDef
}

function makeChain<C, E>(
  method: Method,
  path: string,
  mws: ReadonlyArray<Middleware<any, any>>,
): RouteChain<C, E> {
  const compose = (h: Handler<any, any, any>): Handler<any, any, any> =>
    mws.reduceRight<Handler<any, any, any>>((acc, mw) => mw(acc), h)
  return {
    use(mw) { return makeChain(method, path, [...mws, mw]) },
    handler(fn) {
      const lifted: Handler<any, any, any> = (ctx) => of(async () => fn(ctx))
      return { _tag: 'RouteDef', method, path, handler: compose(lifted), middlewares: mws }
    },
    taskHandler(fn) {
      return { _tag: 'RouteDef', method, path, handler: compose(fn), middlewares: mws }
    },
  }
}

const startChain = (method: Method) =>
  <P extends string>(path: P): RouteChain<Ctx<Params<P>>, never> =>
    makeChain<Ctx<Params<P>>, never>(method, path, [])

export const route = {
  get:    startChain('GET'),
  post:   startChain('POST'),
  put:    startChain('PUT'),
  patch:  startChain('PATCH'),
  delete: startChain('DELETE'),
}
