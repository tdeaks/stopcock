import { of } from '@stopcock/async'
import type { Handler, Ctx } from '../router/types'

/**
 * Open metadata bag for middlewares. Plugins namespace their entries by a
 * stable key (e.g. `stopcock.validate`, `stopcock.auth`) so multiple plugins
 * can coexist without collision. Codegen walks `RouteDef.middlewares` and
 * narrows by key.
 */
export type MiddlewareMeta = Readonly<Record<string, unknown>>

export type Middleware<Provides extends object, E = never> = {
  <C extends Ctx & Provides, R, E2>(
    inner: Handler<C, R, E2>,
  ): Handler<Omit<C, keyof Provides>, R, E | E2>
  readonly meta?: MiddlewareMeta
  withMeta(meta: MiddlewareMeta): Middleware<Provides, E>
}

const makeMiddleware = <Provides extends object, E>(
  run: (ctx: Ctx) => Promise<Provides> | Provides,
  meta?: MiddlewareMeta,
): Middleware<Provides, E> => {
  const mw = (<C extends Ctx & Provides, R, E2>(inner: Handler<C, R, E2>) =>
    (ctx: Omit<C, keyof Provides>) =>
      of(async (signal) => {
        const base = ctx as unknown as Ctx
        const provided = await run(base)
        return inner({ ...base, ...provided } as unknown as C).run(signal)
      })) as Middleware<Provides, E>

  Object.assign(mw, {
    meta,
    withMeta: (m: MiddlewareMeta) => makeMiddleware<Provides, E>(run, m),
  })
  return mw
}

/**
 * Define a middleware that provides fields to ctx and may throw typed errors.
 *
 *   const withAuth = defineMiddleware<{ userId: string }, Unauthorized>(async (ctx) => {
 *     const token = ctx.request.headers.get('authorization')
 *     if (!token) throw new Unauthorized()
 *     return { userId: lookup(token) }
 *   })
 *
 * Attach codegen metadata via `.withMeta({...})`. Returns a fresh middleware;
 * the original is unchanged.
 */
export const defineMiddleware = <Provides extends object, E = never>(
  run: (ctx: Ctx) => Promise<Provides> | Provides,
): Middleware<Provides, E> => makeMiddleware<Provides, E>(run)
