import { describe, it, expect, vi } from 'vitest'
import { defineApp, defineModule } from '../../../define/module'
import { route } from '../../../define/handler'
import { AUTH_META_KEY, Unauthorized, bearer, type AuthMeta } from '../index'

const fetch = (app: ReturnType<typeof defineApp>, method: string, path: string, init?: RequestInit) =>
  app.fetch(new Request(`http://x${path}`, { method, ...init }))

describe('bearer route plugin', () => {
  it('parses bearer tokens, verifies them, and provides ctx.auth and ctx.token', async () => {
    const verify = vi.fn(async (token: string, ctx: { request: Request }) => {
      expect(ctx.request.url).toBe('http://x/me')
      return token === 'good-token' ? { userId: 'u1', roles: ['admin'] } : null
    })

    const app = defineApp({
      modules: [
        defineModule({
          name: 'me',
          routes: () => [
            route.get('/me')
              .use(bearer({ verify }))
              .handler((ctx) => ({
                userId: ctx.auth.userId,
                roles: ctx.auth.roles,
                token: ctx.token,
              })),
          ],
        }),
      ],
    })

    const res = await fetch(app, 'GET', '/me', {
      headers: { authorization: 'Bearer good-token' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      userId: 'u1',
      roles: ['admin'],
      token: 'good-token',
    })
    expect(verify).toHaveBeenCalledWith('good-token', expect.objectContaining({ request: expect.any(Request) }))
  })

  it('throws typed Unauthorized for missing, malformed, and rejected tokens', async () => {
    const verify = vi.fn(async () => null)
    const plugin = bearer({ verify })
    const inner = () => ({ _tag: 'Task' as const, run: async () => 'ok' })
    const run = (authorization?: string) => plugin.middleware!(inner as any)({
      request: new Request('http://x/me', {
        headers: authorization ? { authorization } : undefined,
      }),
      params: {},
    } as any).run()

    await expect(run()).rejects.toMatchObject({
      _tag: 'Unauthorized',
      status: 401,
      reason: 'missing',
    })
    await expect(run('Basic abc')).rejects.toMatchObject({
      _tag: 'Unauthorized',
      status: 401,
      reason: 'malformed',
    })
    await expect(run('Bearer bad-token')).rejects.toMatchObject({
      _tag: 'Unauthorized',
      status: 401,
      reason: 'invalid',
    })
    expect(verify).toHaveBeenCalledTimes(1)
  })

  it('renders Unauthorized as a 401 through the server default renderer', async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: 'me',
          routes: () => [
            route.get('/me')
              .use(bearer({ verify: async () => null }))
              .handler(() => ({ ok: true })),
          ],
        }),
      ],
    })

    const res = await fetch(app, 'GET', '/me', {
      headers: { authorization: 'Bearer bad-token' },
    })

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({
      error: 'Unauthorized',
      message: 'invalid bearer token',
    })
  })

  it('adds stopcock.auth route metadata', () => {
    const def = route.get('/me')
      .use(bearer({ verify: async () => ({ userId: 'u1' }) }))
      .handler((ctx) => ctx.auth.userId)

    expect(def.meta?.[AUTH_META_KEY]).toEqual({ type: 'bearer' } satisfies AuthMeta)
  })

  it('supports the shorthand bearer(verify) form', async () => {
    const plugin = bearer(async (token) => ({ token }))
    const inner = (ctx: any) => ({ _tag: 'Task' as const, run: async () => ctx.auth })

    const out = await plugin.middleware!(inner)({
      request: new Request('http://x/me', {
        headers: { authorization: 'Bearer abc' },
      }),
      params: {},
    } as any).run()

    expect(out).toEqual({ token: 'abc' })
  })
})
