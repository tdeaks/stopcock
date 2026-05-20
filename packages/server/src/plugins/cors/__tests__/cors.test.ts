import { describe, it, expect } from 'vitest'
import { defineApp, defineModule } from '../../../define/module'
import { route } from '../../../define/handler'
import { cors } from '../index'

const fetch = (app: ReturnType<typeof defineApp>, method: string, path: string, init?: RequestInit) =>
  app.fetch(new Request(`http://x${path}`, { method, ...init }))

describe('cors plugin', () => {
  it('short-circuits OPTIONS preflight at the edge with permissive defaults', async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: 'api',
          routes: () => [route.get('/posts').handler(() => ({ ok: true }))],
        }),
      ],
      plugins: [cors()],
    })

    const res = await fetch(app, 'OPTIONS', '/missing', {
      headers: {
        origin: 'https://app.example',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'x-api-key, content-type',
      },
    })

    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS')
    expect(res.headers.get('access-control-allow-headers')).toBe('x-api-key, content-type')
    expect(res.headers.has('access-control-allow-credentials')).toBe(false)
  })

  it('adds CORS headers to normal responses with configured options', async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: 'api',
          routes: () => [
            route.get('/posts').handler(() =>
              Response.json({ ok: true }, { headers: { vary: 'Accept-Encoding' } }),
            ),
          ],
        }),
      ],
      plugins: [
        cors({
          origin: ['https://app.example'],
          credentials: true,
          exposedHeaders: ['x-total-count'],
        }),
      ],
    })

    const res = await fetch(app, 'GET', '/posts', {
      headers: { origin: 'https://app.example' },
    })

    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example')
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
    expect(res.headers.get('access-control-expose-headers')).toBe('x-total-count')
    expect(res.headers.get('vary')).toBe('Accept-Encoding, Origin')
  })

  it('uses configured preflight methods, headers, credentials, and max age', async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: 'api',
          routes: () => [],
        }),
      ],
      plugins: [
        cors({
          origin: 'https://admin.example',
          methods: ['GET', 'POST'],
          allowedHeaders: ['authorization', 'content-type'],
          credentials: true,
          maxAge: 600,
        }),
      ],
    })

    const res = await fetch(app, 'OPTIONS', '/posts', {
      headers: {
        origin: 'https://admin.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'x-ignored',
      },
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://admin.example')
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, POST')
    expect(res.headers.get('access-control-allow-headers')).toBe('authorization, content-type')
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
    expect(res.headers.get('access-control-max-age')).toBe('600')
    expect(res.headers.get('vary')).toBe('Origin')
  })

  it('does not short-circuit ordinary OPTIONS requests without preflight headers', async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: 'api',
          routes: () => [route.options('/health').handler(() => ({ ok: true }))],
        }),
      ],
      plugins: [cors()],
    })

    const res = await fetch(app, 'OPTIONS', '/health', {
      headers: { origin: 'https://app.example' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})
