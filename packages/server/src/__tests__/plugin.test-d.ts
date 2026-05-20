import { describe, it, expectTypeOf } from 'vitest'
import {
  defineLifecycle,
  defineRoutePlugin,
  defineMiddleware,
  route,
} from '../index'

class Unauthorized {
  readonly _tag = 'Unauthorized' as const
}

const authPlugin = defineRoutePlugin({
  name: 'auth',
  middleware: defineMiddleware<{ auth: { userId: string } }, Unauthorized>(() => ({
    auth: { userId: 'u1' },
  })),
  meta: { 'stopcock.auth': { type: 'bearer' } },
})

const lifecycleOnly = defineLifecycle({
  after: (_ctx, response) => response,
})

describe('route plugin types', () => {
  it('adds route plugin middleware provides to ctx', () => {
    route.get('/me').use(authPlugin).handler((ctx) => {
      expectTypeOf(ctx.auth.userId).toEqualTypeOf<string>()
      return ctx.auth.userId
    })
  })

  it('does not add ctx fields for lifecycle-only plugins', () => {
    route.get('/x').use(lifecycleOnly).handler((ctx) => {
      // @ts-expect-error lifecycle plugins do not provide auth
      ctx.auth
      return 'ok'
    })
  })

  it('keeps path param inference for HEAD and OPTIONS', () => {
    route.head('/users/:id').handler((ctx) => {
      expectTypeOf(ctx.params).toEqualTypeOf<{ id: string }>()
      return 'ok'
    })

    route.options('/orgs/:orgId/users/:userId').handler((ctx) => {
      expectTypeOf(ctx.params).toEqualTypeOf<{ orgId: string; userId: string }>()
      return 'ok'
    })
  })

  it('keeps handler inference after metadata', () => {
    route.post('/posts/:id')
      .meta({ 'stopcock.openapi': { summary: 'Update post' } })
      .use(authPlugin)
      .handler((ctx) => {
        expectTypeOf(ctx.params.id).toEqualTypeOf<string>()
        expectTypeOf(ctx.auth.userId).toEqualTypeOf<string>()
        return ctx.params.id
      })
  })
})
