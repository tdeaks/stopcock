import { of } from '@stopcock/async'
import type { DirectCall, Handler, Ctx } from '../router/types'
import type { RouteMeta } from '../plugin'

/**
 * Open metadata bag for middlewares. Plugins namespace their entries by a
 * stable key (e.g. `stopcock.validate`, `stopcock.auth`) so multiple plugins
 * can coexist without collision. Codegen walks `RouteDef.middlewares` and
 * narrows by key.
 */
export type MiddlewareMeta = RouteMeta

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
  const mw = (<C extends Ctx & Provides, R, E2>(inner: Handler<C, R, E2>) => {
    const taskForm = (ctx: Omit<C, keyof Provides>) =>
      of<R, E | E2>(async (signal) => {
        const base = ctx as unknown as Ctx
        const provided = await run(base)
        Object.assign(base, provided)
        return inner(base as unknown as C).run(signal)
      })
    // Direct-call sibling. Propagates only when the inner handler offers one,
    // so dispatch can skip Task allocation per middleware on the hot path.
    if (inner.__direct) {
      const innerDirect = inner.__direct
      ;(taskForm as { __direct?: DirectCall<Omit<C, keyof Provides>, R> }).__direct = (ctx, signal) => {
        const base = ctx as unknown as Ctx
        const out = run(base)
        // Skip the await microtask when the middleware is sync. Most auth /
        // request-scope middlewares are; this halves per-request awaits.
        if (out instanceof Promise) {
          return out.then((p) => {
            if (p) Object.assign(base, p)
            return innerDirect(base as unknown as C, signal)
          })
        }
        if (out) Object.assign(base, out)
        return innerDirect(base as unknown as C, signal)
      }
    }
    return taskForm as Handler<Omit<C, keyof Provides>, R, E | E2>
  }) as Middleware<Provides, E>

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
