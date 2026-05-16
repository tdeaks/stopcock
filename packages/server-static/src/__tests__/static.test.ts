import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { defineApp, defineModule, route } from '@stopcock/server'
import { staticFiles } from '../index'

const fetch = (app: ReturnType<typeof defineApp>, method: string, path: string, init?: RequestInit) =>
  app.fetch(new Request(`http://x${path}`, { method, ...init }))

const makeDir = async () => mkdtemp(join(tmpdir(), 'stopcock-static-'))

describe('staticFiles app plugin', () => {
  it('serves files from a directory under a URL prefix', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'hello.txt'), 'hello static')

    const app = defineApp({
      plugins: [staticFiles({ dir, prefix: '/assets' })],
      modules: [defineModule({ name: 'empty', routes: () => [] })],
    })

    const res = await fetch(app, 'GET', '/assets/hello.txt')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await res.text()).toBe('hello static')
  })

  it('serves directory index files when configured', async () => {
    const dir = await makeDir()
    await mkdir(join(dir, 'docs'))
    await writeFile(join(dir, 'docs', 'index.html'), '<h1>Docs</h1>')

    const app = defineApp({
      plugins: [staticFiles({ dir, prefix: '/assets', index: 'index.html' })],
      modules: [defineModule({ name: 'empty', routes: () => [] })],
    })

    const res = await fetch(app, 'GET', '/assets/docs/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await res.text()).toBe('<h1>Docs</h1>')
  })

  it('falls through when a prefixed file is missing', async () => {
    const dir = await makeDir()
    const app = defineApp({
      plugins: [staticFiles({ dir, prefix: '/assets' })],
      modules: [
        defineModule({
          name: 'fallback',
          routes: () => [route.get('/assets/missing.txt').handler(() => new Response('fallback'))],
        }),
      ],
    })

    const res = await fetch(app, 'GET', '/assets/missing.txt')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('fallback')
  })

  it('blocks encoded path traversal under the prefix', async () => {
    const dir = await makeDir()
    const outside = await makeDir()
    await writeFile(join(outside, 'secret.txt'), 'nope')

    const app = defineApp({
      plugins: [staticFiles({ dir, prefix: '/assets' })],
      modules: [defineModule({ name: 'empty', routes: () => [] })],
    })

    const res = await fetch(app, 'GET', '/assets/%2e%2e%2fsecret.txt')
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('forbidden')
  })

  it('only serves safe methods', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'hello.txt'), 'hello static')

    const app = defineApp({
      plugins: [staticFiles({ dir, prefix: '/assets' })],
      modules: [defineModule({ name: 'empty', routes: () => [] })],
    })

    const res = await fetch(app, 'POST', '/assets/hello.txt')
    expect(res.status).toBe(404)
  })
})
