import { describe, it, expect } from 'vitest'
import { of } from '@stopcock/async'
import { createApp } from '../router/router'

const fetch = (app: ReturnType<typeof createApp>, method: string, path: string, init?: RequestInit) =>
  app.fetch(new Request(`http://x${path}`, { method, ...init }))

describe('router', () => {
  it('matches a registered GET and returns JSON', async () => {
    const app = createApp().get('/health', () => of(async () => ({ ok: true })))
    const res = await fetch(app, 'GET', '/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 404 for unknown path', async () => {
    const app = createApp().get('/a', () => of(async () => 1))
    const res = await fetch(app, 'GET', '/b')
    expect(res.status).toBe(404)
  })

  it('parses single path param', async () => {
    const app = createApp().get('/users/:id', (ctx) => of(async () => ctx.params.id))
    const res = await fetch(app, 'GET', '/users/42')
    expect(await res.json()).toBe('42')
  })

  it('parses multiple path params', async () => {
    const app = createApp().get('/orgs/:orgId/users/:userId',
      (ctx) => of(async () => ctx.params))
    const res = await fetch(app, 'GET', '/orgs/acme/users/alice')
    expect(await res.json()).toEqual({ orgId: 'acme', userId: 'alice' })
  })

  it('discriminates on method', async () => {
    const app = createApp()
      .get('/x', () => of(async () => 'g'))
      .post('/x', () => of(async () => 'p'))
    expect(await (await fetch(app, 'GET', '/x')).json()).toBe('g')
    expect(await (await fetch(app, 'POST', '/x')).json()).toBe('p')
  })

  it('normalises trailing slash', async () => {
    const app = createApp().get('/x', () => of(async () => 'ok'))
    expect((await fetch(app, 'GET', '/x/')).status).toBe(200)
    expect((await fetch(app, 'GET', '/x')).status).toBe(200)
  })

  it('strips query string before matching', async () => {
    const app = createApp().get('/x', () => of(async () => 'ok'))
    expect((await fetch(app, 'GET', '/x?a=1&b=2')).status).toBe(200)
  })

  it('uses custom render for thrown error', async () => {
    class E { readonly _tag = 'E' as const }
    const app = createApp().get('/boom',
      () => of(async () => { throw new E() }),
      (e) => Response.json({ caught: e._tag }, { status: 418 }))
    const res = await fetch(app, 'GET', '/boom')
    expect(res.status).toBe(418)
    expect(await res.json()).toEqual({ caught: 'E' })
  })

  it('returns Response if handler produces one directly', async () => {
    const app = createApp().get('/raw', () => of(async () => new Response('hi', { status: 201 })))
    const res = await fetch(app, 'GET', '/raw')
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('hi')
  })
})
