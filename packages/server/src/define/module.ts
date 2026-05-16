import { createApp, type App } from '../router/router'
import type { Handler } from '../router/types'
import type { RouteDef } from './handler'
import {
  SERVER_PLUGIN_ROUTE_META_KEY,
  mergeMeta,
  type EdgeHook,
  type LifecycleHook,
  type RouteMeta,
  type ServerPlugin,
} from '../plugin'

/**
 * A module knows its name, what it imports, what it provides to importers,
 * what HTTP routes it adds, and an optional path prefix.
 *
 * `P` is the type of everything this module exposes downward: own provides
 * plus the merged exports of all its imports (transitive re-export).
 */
export type Module<P extends object = {}> = {
  readonly _tag: 'Module'
  readonly name: string
  readonly imports: ReadonlyArray<Module<any>>
  readonly provides?: (provided: any) => any
  readonly routes?: (provided: any) => ReadonlyArray<RouteDef>
  readonly prefix?: string
  /** Phantom. Never read at runtime. Carries the exposed shape for inference. */
  readonly __exposed?: P
}

type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never

type ExposedOf<M> = M extends Module<infer P> ? P : {}

type MergedImports<Imports extends ReadonlyArray<Module<any>>> =
  Imports['length'] extends 0
    ? {}
    : UnionToIntersection<{ [K in keyof Imports]: ExposedOf<Imports[K]> }[number]>

/**
 * Define a feature module.
 *
 *   const PostsModule = defineModule({
 *     name: 'posts',
 *     imports: [DbModule, AuthModule],
 *     provides: ({ db }) => ({ posts: makePostsService({ repo: makePostsRepo({ db }) }) }),
 *     routes:   ({ posts, auth }) => postsRoutes({
 *       controller: makePostsController({ posts }),
 *       withAuth:   makeWithAuth({ auth }),
 *     }),
 *   })
 *
 * The framework walks the import graph, resolves every `provides()` exactly
 * once (memoised), and threads the merged object into `routes()`.
 */
export function defineModule<
  const Imports extends ReadonlyArray<Module<any>> = readonly [],
  MyProvides extends object = {},
>(config: {
  name: string
  imports?: Imports
  provides?: (provided: MergedImports<Imports>) => MyProvides
  routes?: (provided: MergedImports<Imports> & MyProvides) => ReadonlyArray<RouteDef>
  prefix?: string
}): Module<MergedImports<Imports> & MyProvides> {
  return {
    _tag: 'Module',
    name: config.name,
    imports: config.imports ?? [],
    provides: config.provides,
    routes: config.routes,
    prefix: config.prefix,
  }
}

/**
 * Build the app by listing top-level modules.
 *   1. Topologically resolves every module's `provides()` (memoised — one
 *      DbModule import yields one db instance across all consumers).
 *   2. Walks the module tree, registering each `routes()` at its effective
 *      prefix (accumulated from parent modules).
 */
export function defineApp(config: {
  modules: ReadonlyArray<Module<any>>
  plugins?: ReadonlyArray<ServerPlugin>
  renderError?: (e: any) => Response
}): App {
  const providedFor = new Map<Module<any>, any>()
  const inProgress  = new Set<Module<any>>()
  const resolve = (mod: Module<any>): any => {
    if (providedFor.has(mod)) return providedFor.get(mod)
    if (inProgress.has(mod)) throw new Error(`circular module import involving "${mod.name}"`)
    inProgress.add(mod)
    const importsMerged: any = {}
    for (const imp of mod.imports) Object.assign(importsMerged, resolve(imp))
    const own = mod.provides ? mod.provides(importsMerged) : {}
    const total = { ...importsMerged, ...own }
    providedFor.set(mod, total)
    inProgress.delete(mod)
    return total
  }

  const visited = new Set<Module<any>>()
  const routes: RouteDef[] = []
  const walk = (mod: Module<any>, parentPrefix: string): void => {
    if (visited.has(mod)) return
    visited.add(mod)
    const prefix = parentPrefix + (mod.prefix ?? '')
    if (mod.routes) {
      const provided = resolve(mod)
      for (const route of mod.routes(provided)) {
        const path = prefix + route.path
        routes.push({ ...route, path })
      }
    }
    for (const imp of mod.imports) walk(imp, prefix)
  }

  for (const mod of config.modules) walk(mod, '')

  const edge: EdgeHook[] = []
  const hooks: LifecycleHook[] = []
  let meta: RouteMeta | undefined
  for (const plugin of config.plugins ?? []) {
    const contribution = plugin.setup?.({ routes, meta: meta ?? {} }) ?? {}
    if (contribution.routes) {
      routes.push(...contribution.routes.map((route) => ({
        ...route,
        meta: mergeMeta(route.meta, { [SERVER_PLUGIN_ROUTE_META_KEY]: plugin.name }),
      })))
    }
    if (contribution.edge) edge.push(...contribution.edge)
    if (contribution.hooks) hooks.push(...contribution.hooks)
    meta = mergeMeta(meta, contribution.meta)
  }

  let app = createApp({ edge, hooks, meta })
  for (const route of routes) {
    const render = route.render ?? config.renderError
    const register = (app as unknown as Record<string, (
      path: string,
      h: Handler<any, any, any>,
      r?: (e: any) => Response,
      options?: { hooks?: readonly LifecycleHook[]; meta?: RouteMeta },
    ) => App>)[route.method.toLowerCase()]
    if (!register) throw new Error(`unknown method ${route.method}:${route.path}`)
    app = register.call(app, route.path, route.handler, render, {
      hooks: route.hooks,
      meta: route.meta,
    })
  }
  return app
}
