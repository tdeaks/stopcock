import { describe, it, expect } from 'vitest'
import { defineApp, defineModule } from '../../../define/module'
import { route } from '../../../define/handler'
import { serverTiming, timing } from '../index'

const fetch = (app: ReturnType<typeof defineApp>, method: string, path: string, init?: RequestInit) =>
  app.fetch(new Request(`http://x${path}`, { method, ...init }))

const entries = (header: string | null): string[] =>
  header?.split(',').map((part) => part.trim()).filter(Boolean) ?? []

describe('server timing plugins', () => {
  it('emits a total Server-Timing metric from the app plugin', async () => {
    const app = defineApp({
      plugins: [serverTiming()],
      modules: [
        defineModule({
          name: 'timed',
          routes: () => [route.get('/ok').handler(() => ({ ok: true }))],
        }),
      ],
    })

    const res = await fetch(app, 'GET', '/ok')
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get('server-timing')).toMatch(/^total;dur=\d+(?:\.\d+)?$/)
  })

  it('emits named route marks alongside total timing', async () => {
    const app = defineApp({
      plugins: [serverTiming()],
      modules: [
        defineModule({
          name: 'marked',
          routes: () => [
            route.get('/marked')
              .use(timing())
              .handler((ctx) => {
                ctx.timing.mark('db')
                ctx.timing.mark('render')
                return { ok: true, marks: ctx.timing.marks.map((mark) => mark.name) }
              }),
          ],
        }),
      ],
    })

    const res = await fetch(app, 'GET', '/marked')
    expect(await res.json()).toEqual({ ok: true, marks: ['db', 'render'] })

    const header = entries(res.headers.get('server-timing'))
    expect(header.some((entry) => /^db;dur=\d+(?:\.\d+)?$/.test(entry))).toBe(true)
    expect(header.some((entry) => /^render;dur=\d+(?:\.\d+)?$/.test(entry))).toBe(true)
    expect(header.some((entry) => /^total;dur=\d+(?:\.\d+)?$/.test(entry))).toBe(true)
  })

  it('preserves existing Server-Timing entries', async () => {
    const app = defineApp({
      plugins: [serverTiming({ metric: 'app' })],
      modules: [
        defineModule({
          name: 'existing',
          routes: () => [
            route.get('/existing').handler(() =>
              new Response('ok', { headers: { 'server-timing': 'cache;desc="hit"' } }),
            ),
          ],
        }),
      ],
    })

    const res = await fetch(app, 'GET', '/existing')
    expect(entries(res.headers.get('server-timing'))[0]).toBe('cache;desc="hit"')
    expect(entries(res.headers.get('server-timing')).at(-1)).toMatch(/^app;dur=\d+(?:\.\d+)?$/)
  })
})
