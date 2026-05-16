import { describe, it, expectTypeOf } from 'vitest'
import { route } from '@stopcock/server'
import { bearer, Unauthorized } from '../index'

describe('bearer route plugin types', () => {
  it('adds verified auth and token to ctx', () => {
    route.get('/me')
      .use(bearer(async (token) => ({ userId: token })))
      .handler((ctx) => {
        expectTypeOf(ctx.auth.userId).toEqualTypeOf<string>()
        expectTypeOf(ctx.token).toEqualTypeOf<string>()
        return ctx.auth.userId
      })
  })

  it('threads Unauthorized into route errors', () => {
    const plugin = bearer<{ userId: string }>({
      verify: async () => ({ userId: 'u1' }),
    })

    expectTypeOf(plugin).toMatchTypeOf<{
      middleware?: unknown
      meta?: { 'stopcock.auth': { type: 'bearer' } }
    }>()
    expectTypeOf<Unauthorized>().toMatchTypeOf<Error>()
  })
})
