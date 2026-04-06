import { describe, it, expect, afterAll } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createClient } from '../client.js'
import { HttpError } from '../error.js'

let attempts = 0

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk })
    req.on('end', () => resolve(data))
  })
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost`)
  if (url.pathname === '/json') return json(res, { ok: true })
  if (url.pathname === '/text') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('hello') }
  if (url.pathname === '/echo') {
    const body = await readBody(req)
    return json(res, JSON.parse(body))
  }
  if (url.pathname === '/error') return json(res, { code: 'BAD', message: 'invalid' }, 422)
  if (url.pathname === '/slow') {
    return setTimeout(() => json(res, { slow: true }), 2000)
  }
  if (url.pathname === '/fail-then-ok') {
    attempts++
    if (attempts < 3) return json(res, { error: 'down' }, 500)
    return json(res, { attempt: attempts })
  }
  if (url.pathname === '/headers') {
    const auth = req.headers['authorization'] ?? 'none'
    return json(res, { auth })
  }
  if (url.pathname === '/empty') { res.writeHead(204); return res.end() }
  res.writeHead(404); res.end('Not found')
})

const port = await new Promise<number>((resolve) => {
  server.listen(0, () => resolve((server.address() as { port: number }).port))
})

afterAll(() => server.close())

const baseUrl = `http://localhost:${port}`
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
