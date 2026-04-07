import { describe, it, expect, afterAll } from 'vitest'
import { createClient } from '../client.js'
import { HttpError } from '../error.js'

let attempts = 0

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/json') return Response.json({ ok: true })
    if (url.pathname === '/text') return new Response('hello', { headers: { 'content-type': 'text/plain' } })
    if (url.pathname === '/echo') {
      return req.json().then((body: unknown) => Response.json(body))
    }
    if (url.pathname === '/error') return Response.json({ code: 'BAD', message: 'invalid' }, { status: 422 })
    if (url.pathname === '/slow') {
      return new Promise(r => setTimeout(() => r(Response.json({ slow: true })), 2000))
    }
    if (url.pathname === '/fail-then-ok') {
      attempts++
      if (attempts < 3) return Response.json({ error: 'down' }, { status: 500 })
      return Response.json({ attempt: attempts })
    }
    if (url.pathname === '/headers') {
      const auth = req.headers.get('authorization') ?? 'none'
      return Response.json({ auth })
    }
    if (url.pathname === '/empty') return new Response(null, { status: 204 })
    return new Response('Not found', { status: 404 })
  },
})

afterAll(() => server.stop())

const baseUrl = `http://localhost:${server.port}`
const api = createClient({ baseUrl })

describe('real HTTP integration', () => {
  it('GET /json returns parsed JSON', async () => {
    const result = await api.get<{ ok: boolean }>('/json')
    expect(result.ok).toBe(true)
  })

  it('GET /text returns text', async () => {
    const result = await api.get<string>('/text', { responseType: 'text' })
    expect(result).toBe('hello')
  })

  it('POST /echo echoes body', async () => {
    const result = await api.post<{ name: string }>('/echo', { body: { name: 'Tom' } })
    expect(result.name).toBe('Tom')
  })

  it('GET /error throws HttpError with parsed body', async () => {
    try {
      await api.get('/error')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError)
      const err = e as HttpError<{ code: string; message: string }>
      expect(err.status).toBe(422)
      expect(err.data.code).toBe('BAD')
      expect(err.data.message).toBe('invalid')
    }
  })

  it('204 returns undefined', async () => {
    const result = await api.delete<void>('/empty')
    expect(result).toBeUndefined()
  })

  it('headers flow through', async () => {
    const authed = api.with({ headers: { Authorization: 'Bearer tok123' } })
    const result = await authed.get<{ auth: string }>('/headers')
    expect(result.auth).toBe('Bearer tok123')
  })

  it('retry on 500 then succeed', async () => {
    attempts = 0
    const retryApi = createClient({ baseUrl, retry: { attempts: 3, delay: 10 } })
    const result = await retryApi.get<{ attempt: number }>('/fail-then-ok')
    expect(result.attempt).toBe(3)
  })

  it('abort cancels request', async () => {
    const controller = new AbortController()
    const promise = api.get('/slow', { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toThrow()
  })

  it('head returns headers', async () => {
    const headers = await api.head('/json')
    expect(headers.get('content-type')).toContain('application/json')
  })

  it('path params work against real server', async () => {
    try {
      await api.get('/users/:id', { params: { id: 999 } })
    } catch (e) {
      expect((e as HttpError).status).toBe(404)
    }
  })
})
