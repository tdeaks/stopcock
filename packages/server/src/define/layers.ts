/**
 * Layer factories. Each `define*` returns the factory you call from a module's
 * `provides` / `routes`. The framework owns the function shape so it can stamp
 * metadata (kind, name) on the factory for CLI scaffolding, OpenAPI walks,
 * devtools, etc.
 *
 *   export const makePostsRepo = defineRepository(
 *     'posts',
 *     ({ db }: { db: Db }) => ({ list, findById, create }),
 *   )
 */

type Branded<T, B extends string> = T & { readonly __brand?: B }

export const LAYER_KIND = Symbol.for('@stopcock/server/layer-kind')
export const LAYER_NAME = Symbol.for('@stopcock/server/layer-name')

export type LayerFactory<Deps, Impl, B extends string> =
  ((deps: Deps) => Branded<Impl, B>) & {
    readonly [LAYER_KIND]: B
    readonly [LAYER_NAME]: string
  }

const makeLayer = <B extends string>(kind: B) =>
  <Deps, Impl>(
    name: string,
    build: (deps: Deps) => Impl,
  ): LayerFactory<Deps, Impl, B> => {
    const factory = ((deps: Deps) => build(deps)) as LayerFactory<Deps, Impl, B>
    Object.defineProperty(factory, LAYER_KIND, { value: kind })
    Object.defineProperty(factory, LAYER_NAME, { value: name })
    return factory
  }

export const defineRepository = makeLayer('Repository')
export const defineService    = makeLayer('Service')
export const defineController = makeLayer('Controller')
export const defineRoutes     = makeLayer('Routes')
