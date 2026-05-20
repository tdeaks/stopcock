import { describe, it, expect } from 'vitest'
import { defineModule, defineApp } from '../define/module'
import { route } from '../define/handler'

describe('module DI', () => {
  it('memoises provides — one instance per app, shared across consumers', async () => {
    let dbBuilds = 0
    const DbModule = defineModule({
      name: 'db',
      provides: () => { dbBuilds++; return { db: { id: dbBuilds } } },
    })
    const A = defineModule({
      name: 'a',
      imports: [DbModule],
      routes: ({ db }) => [route.get('/a').handler(() => db)],
    })
    const B = defineModule({
      name: 'b',
      imports: [DbModule],
      routes: ({ db }) => [route.get('/b').handler(() => db)],
    })
    const app = defineApp({ modules: [A, B] })
    await app.fetch(new Request('http://x/a'))
    await app.fetch(new Request('http://x/b'))
    expect(dbBuilds).toBe(1)
  })

  it('detects cycles and names a module in the error', () => {
    const A: any = { _tag: 'Module', name: 'a', imports: [] as any[] }
    const B: any = { _tag: 'Module', name: 'b', imports: [A] }
    A.imports = [B]
    A.provides = () => ({})
    B.provides = () => ({})
    A.routes = () => [route.get('/a').handler(() => 'ok')]
    expect(() => defineApp({ modules: [A] })).toThrow(/circular/)
  })

  it('threads transitive provides into routes', () => {
    let captured: unknown
    const DbModule = defineModule({ name: 'db', provides: () => ({ db: 'DB' }) })
    const Feature = defineModule({
      name: 'feature',
      imports: [DbModule],
      routes: (provided) => {
        captured = provided
        return [route.get('/x').handler(() => 'ok')]
      },
    })
    defineApp({ modules: [Feature] })
    expect(captured).toEqual({ db: 'DB' })
  })

  it('accumulates path prefix down the module tree', async () => {
    const Leaf = defineModule({
      name: 'leaf',
      routes: () => [route.get('/leaf').handler(() => 'ok')],
    })
    const Mid  = defineModule({ name: 'mid',  imports: [Leaf], prefix: '/v1' })
    const Root = defineModule({ name: 'root', imports: [Mid],  prefix: '/api' })
    const app = defineApp({ modules: [Root] })
    const res = await app.fetch(new Request('http://x/api/v1/leaf'))
    expect(res.status).toBe(200)
    expect(await res.json()).toBe('ok')
  })

  it('registers each module routes once even if reachable via multiple paths', async () => {
    let hits = 0
    const Shared = defineModule({
      name: 'shared',
      routes: () => [route.get('/shared').handler(() => { hits++; return 'ok' })],
    })
    const A = defineModule({ name: 'a', imports: [Shared] })
    const B = defineModule({ name: 'b', imports: [Shared] })
    const app = defineApp({ modules: [A, B] })
    await app.fetch(new Request('http://x/shared'))
    expect(hits).toBe(1)
  })
})
