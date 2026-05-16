import { describe, it, expect } from 'vitest'
import { defineApp, defineModule, route } from '@stopcock/server'
import { cookies } from '../index'

const fetch = (app: ReturnType<typeof defineApp>, method: string, path: string, init?: RequestInit) =>
  app.fetch(new Request(`http://x${path}`, { method, ...init }))

const setCookieValues = (headers: Headers): string[] => {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  if (getSetCookie) return getSetCookie.call(headers)
  const value = headers.get('set-cookie')
  return value ? value.split(/, (?=[^;,]+=)/) : []
}

describe('cookies route plugin', () => {
  it('parses Cookie header and exposes lookups and all cookies', async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: 'cookie-read',
          routes: () => [
            route.get('/read')
              .use(cookies())
              .handler((ctx) => ({
                session: ctx.cookies.get('session'),
                theme: ctx.cookies.get('theme'),
                missing: ctx.cookies.get('missing') ?? null,
                all: ctx.cookies.all(),
              })),
          ],
        }),
      ],
    })

    const res = await fetch(app, 'GET', '/read', {
      headers: { cookie: 'session=s%3Aabc; theme=light; empty=' },
    })

    expect(await res.json()).toEqual({
      session: 's:abc',
      theme: 'light',
      missing: null,
      all: { session: 's:abc', theme: 'light', empty: '' },
    })
  })

  it('commits queued Set-Cookie headers in the after hook', async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: 'cookie-write',
          routes: () => [
            route.get('/write')
              .use(cookies())
              .handler((ctx) => {
                ctx.cookies.set('session', 'abc 123', {
                  httpOnly: true,
                  maxAge: 60,
                  path: '/',
                  sameSite: 'lax',
                })
                ctx.cookies.delete('theme', { path: '/' })
                return { ok: true }
              }),
          ],
        }),
      ],
    })

    const res = await fetch(app, 'GET', '/write')
    expect(await res.json()).toEqual({ ok: true })

    const headers = setCookieValues(res.headers)
    expect(headers).toContain('session=abc%20123; Max-Age=60; Path=/; HttpOnly; SameSite=Lax')
    expect(headers).toContain('theme=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })

  it('commits cookies on rendered error responses', async () => {
    const app = defineApp({
      renderError: () => Response.json({ error: 'boom' }, { status: 418 }),
      modules: [
        defineModule({
          name: 'cookie-error',
          routes: () => [
            route.get('/boom')
              .use(cookies())
              .handler((ctx) => {
                ctx.cookies.set('seen', '1')
                throw new Error('boom')
              }),
          ],
        }),
      ],
    })

    const res = await fetch(app, 'GET', '/boom')
    expect(res.status).toBe(418)
    expect(await res.json()).toEqual({ error: 'boom' })
    expect(setCookieValues(res.headers)).toContain('seen=1')
  })
})
