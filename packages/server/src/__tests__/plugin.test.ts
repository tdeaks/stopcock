import { describe, it, expect } from 'vitest'
import { of } from '@stopcock/async'
import {
  createApp,
  defineApp,
  defineLifecycle,
  defineMiddleware,
  defineModule,
  definePlugin,
  defineRoutePlugin,
  route,
} from '../index'

const fetch = (app: ReturnType<typeof createApp>, method: string, path: string, init?: RequestInit) =>
  app.fetch(new Request(`http://x${path}`, { method, ...init }))

describe('server plugins', () => {
  it('stores namespaced route metadata and route plugin metadata', () => {
    const plugin = defineRoutePlugin({
      name: 'auth',
      meta: { 'stopcock.auth': { type: 'bearer' } },
    })

    const def = route.get('/posts')
      .meta({ 'stopcock.openapi': { summary: 'List posts' } })
      .use(plugin)
      .handler(() => [])

    expect(def.meta).toEqual({
      'stopcock.openapi': { summary: 'List posts' },
      'stopcock.auth': { type: 'bearer' },
    })
  })

  it('runs route plugin middleware and after hooks with the enriched ctx', async () => {
    const auth = defineRoutePlugin({
      name: 'auth',
      middleware: defineMiddleware<{ auth: { userId: string } }>(() => ({
        auth: { userId: 'u1' },
      })),
      hooks: [
        {
          after: (ctx, response) => {
            response.headers.set('x-user-id', (ctx as { auth: { userId: string } }).auth.userId)
            return response
          },
        },
      ],
    })

    const app = defineApp({
      modules: [
        defineModule({
          name: 'me',
          routes: () => [
            route.get('/me')
              .use(auth)
              .handler((ctx) => ({ userId: ctx.auth.userId })),
          ],
        }),
      ],
    })

    const res = await fetch(app, 'GET', '/me')
    expect(res.headers.get('x-user-id')).toBe('u1')
    expect(await res.json()).toEqual({ userId: 'u1' })
  })

  it('runs edge hooks before route matching and can short-circuit', async () => {
    const app = defineApp({
      modules: [
        defineModule({
          name: 'health',
          routes: () => [route.get('/health').handler(() => ({ ok: true }))],
        }),
      ],
      plugins: [
        definePlugin({
          name: 'maintenance',
          setup: () => ({
            edge: [
              (request) => request.headers.get('x-maintenance') === '1'
                ? new Response('down', { status: 503 })
                : undefined,
            ],
          }),
        }),
      ],
    })

    const res = await fetch(app, 'GET', '/missing', { headers: { 'x-maintenance': '1' } })
    expect(res.status).toBe(503)
    expect(await res.text()).toBe('down')
  })

  it('runs global and route lifecycle hooks in deterministic order', async () => {
    const events: string[] = []
    const app = defineApp({
      modules: [
        defineModule({
          name: 'test',
          routes: () => [
            route.get('/x')
              .use(defineLifecycle({
                before: () => { events.push('route-before') },
                after: (_ctx, response) => {
                  events.push('route-after')
                  response.headers.set('x-route', '1')
                  return response
                },
              }))
              .handler(() => ({ ok: true })),
          ],
        }),
      ],
      plugins: [
        definePlugin({
          name: 'global',
          setup: () => ({
            hooks: [
              {
                before: () => { events.push('global-before') },
                after: (_ctx, response) => {
                  events.push('global-after')
                  response.headers.set('x-global', '1')
                  return response
                },
              },
            ],
          }),
        }),
      ],
    })

    const res = await fetch(app, 'GET', '/x')
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get('x-route')).toBe('1')
    expect(res.headers.get('x-global')).toBe('1')
    expect(events).toEqual(['global-before', 'route-before', 'route-after', 'global-after'])
  })

  it('runs after hooks on rendered error responses', async () => {
    class Boom {
      readonly _tag = 'Boom' as const
    }

    const app = defineApp({
      renderError: () => Response.json({ error: 'boom' }, { status: 418 }),
      modules: [
        defineModule({
          name: 'test',
          routes: () => [
            route.get('/boom')
              .use(defineLifecycle({
                after: (_ctx, response) => {
                  response.headers.set('x-after-error', '1')
                  return response
                },
              }))
              .taskHandler(() => of(async () => { throw new Boom() })),
          ],
        }),
      ],
    })

    const res = await fetch(app, 'GET', '/boom')
    expect(res.status).toBe(418)
    expect(res.headers.get('x-after-error')).toBe('1')
    expect(await res.json()).toEqual({ error: 'boom' })
  })
})
