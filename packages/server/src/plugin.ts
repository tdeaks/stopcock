import type { Middleware } from './middleware/define'
import type { RouteDef } from './define/handler'
import type { Ctx } from './router/types'

export type RouteMeta = Readonly<Record<string, unknown>>

export type LifecycleHook<C extends Ctx = Ctx> = {
  readonly before?: (ctx: C) => void | Promise<void>
  readonly after?: (ctx: C, response: Response) => Response | Promise<Response>
  readonly onError?: (ctx: C, error: unknown) => Response | void | Promise<Response | void>
  readonly meta?: RouteMeta
}

export type RoutePlugin<Provides extends object = {}, E = never> = {
  readonly _tag: 'RoutePlugin'
  readonly name?: string
  readonly middleware?: Middleware<Provides, E>
  readonly hooks?: readonly LifecycleHook[]
  readonly meta?: RouteMeta
}

export type EdgeHook =
  (request: Request) => void | Request | Response | Promise<void | Request | Response>

export type PluginContext = {
  readonly routes: readonly RouteDef[]
  readonly meta: RouteMeta
}

export type PluginContribution = {
  readonly routes?: readonly RouteDef[]
  readonly edge?: readonly EdgeHook[]
  readonly hooks?: readonly LifecycleHook[]
  readonly meta?: RouteMeta
}

export type ServerPlugin = {
  readonly _tag: 'ServerPlugin'
  readonly name: string
  readonly setup?: (ctx: PluginContext) => PluginContribution
}

export const mergeMeta = (...metas: readonly (RouteMeta | undefined)[]): RouteMeta | undefined => {
  let out: Record<string, unknown> | undefined
  for (const meta of metas) {
    if (!meta) continue
    out ??= {}
    Object.assign(out, meta)
  }
  return out
}

export const defineRoutePlugin = <Provides extends object = {}, E = never>(
  config: Omit<RoutePlugin<Provides, E>, '_tag'>,
): RoutePlugin<Provides, E> => ({
  _tag: 'RoutePlugin',
  ...config,
})

export const defineLifecycle = (hook: LifecycleHook): RoutePlugin =>
  defineRoutePlugin({ hooks: [hook], meta: hook.meta })

export const definePlugin = (plugin: Omit<ServerPlugin, '_tag'>): ServerPlugin => ({
  _tag: 'ServerPlugin',
  ...plugin,
})

export const isRoutePlugin = (value: unknown): value is RoutePlugin<any, any> =>
  typeof value === 'object' && value !== null && (value as { _tag?: unknown })._tag === 'RoutePlugin'
