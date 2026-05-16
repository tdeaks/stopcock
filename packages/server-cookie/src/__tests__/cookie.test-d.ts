import { describe, it, expectTypeOf } from 'vitest'
import { route } from '@stopcock/server'
import { cookies, type CookieJar } from '../index'

describe('cookies route plugin types', () => {
  it('adds ctx.cookies helpers', () => {
    route.get('/cookies').use(cookies()).handler((ctx) => {
      expectTypeOf(ctx.cookies).toEqualTypeOf<CookieJar>()
      expectTypeOf(ctx.cookies.get('session')).toEqualTypeOf<string | undefined>()
      expectTypeOf(ctx.cookies.all()).toEqualTypeOf<Record<string, string>>()

      ctx.cookies.set('session', 'abc', { httpOnly: true, sameSite: 'strict' })
      ctx.cookies.delete('session', { path: '/' })

      return ctx.cookies.get('session') ?? 'missing'
    })
  })
})
