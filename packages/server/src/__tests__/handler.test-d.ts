import { describe, it, expectTypeOf } from 'vitest'
import { route } from '../define/handler'
import { defineMiddleware } from '../middleware/define'

class Unauthorized { readonly _tag = 'Unauthorized' as const }

const withAuth = defineMiddleware<{ userId: string }, Unauthorized>(() => ({ userId: 'u1' }))

describe('route chain types', () => {
  it('exposes path params on ctx without explicit annotation', () => {
    route.get('/users/:id').handler((ctx) => {
      expectTypeOf(ctx.params).toEqualTypeOf<{ id: string }>()
      return 'ok'
    })
  })

  it('adds middleware provides to ctx through .use()', () => {
    route.get('/me').use(withAuth).handler((ctx) => {
      expectTypeOf(ctx.params).toEqualTypeOf<{}>()
      expectTypeOf(ctx.userId).toEqualTypeOf<string>()
      return ctx.userId
    })
  })

  it('rejects access to a field the middleware did not provide', () => {
    route.get('/x').handler((ctx) => {
      // @ts-expect-error — no middleware injected `userId`
      ctx.userId
      return 'ok'
    })
  })
})
