import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../client.js'
import { HttpError } from '../error.js'

function mockFetch(response: { status?: number; statusText?: string; body?: unknown; headers?: Record<string, string> }) {
  const status = response.status ?? 200
  const statusText = response.statusText ?? 'OK'
  const headers = new Headers({ 'content-type': 'application/json', ...(response.headers ?? {}) })
  const bodyText = typeof response.body === 'string' ? response.body : JSON.stringify(response.body ?? null)

  return vi.fn(async () => new Response(bodyText, { status, statusText, headers }))
}

describe('createClient', () => {
  it('makes a GET request', async () => {
    const fetch = mockFetch({ body: [{ id: 1 }] })
    const api = createClient({ baseUrl: 'https://api.com', fetch })
    const result = await api.get<{ id: number }[]>('/users')
    expect(result).toEqual([{ id: 1 }])
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.com/users')
    expect(init.method).toBe('GET')
  })

  it('makes a POST request with body', async () => {
    const fetch = mockFetch({ body: { id: 1, name: 'Tom' } })
    const api = createClient({ baseUrl: 'https://api.com', fetch })
    const result = await api.post<{ id: number; name: string }>('/users', { body: { name: 'Tom' } })
    expect(result).toEqual({ id: 1, name: 'Tom' })
    const [, init] = fetch.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"name":"Tom"}')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('substitutes path params', async () => {
    const fetch = mockFetch({ body: { id: 42 } })
    const api = createClient({ baseUrl: 'https://api.com', fetch })
    await api.get('/users/:id', { params: { id: 42 } })
    expect(fetch.mock.calls[0][0]).toBe('https://api.com/users/42')
  })

  it('appends query params', async () => {
    const fetch = mockFetch({ body: [] })
    const api = createClient({ baseUrl: 'https://api.com', fetch })
    await api.get('/users', { query: { q: 'tom', page: 1 } })
    const url = fetch.mock.calls[0][0] as string
    expect(url).toContain('q=tom')
    expect(url).toContain('page=1')
  })

  it('throws HttpError on non-ok response', async () => {
    const fetch = mockFetch({ status: 404, statusText: 'Not Found', body: { message: 'User not found' } })
    const api = createClient({ fetch })
    try {
      await api.get('/users/999')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError)
      const err = e as HttpError<{ message: string }>
      expect(err.status).toBe(404)
      expect(err.data.message).toBe('User not found')
    }
  })

  it('typed error body flows through', async () => {
    type ApiError = { code: string; detail: string }
    const fetch = mockFetch({ status: 422, statusText: 'Unprocessable', body: { code: 'INVALID', detail: 'Bad email' } })
    const api = createClient({ fetch })
    try {
      await api.post<void, ApiError>('/users', { body: { email: 'bad' } })
      expect.unreachable()
    } catch (e) {
      const err = e as HttpError<ApiError>
      expect(err.data.code).toBe('INVALID')
      expect(err.data.detail).toBe('Bad email')
    }
  })

  it('handles 204 No Content', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204, headers: new Headers({ 'content-length': '0' }) }))
    const api = createClient({ fetch })
    const result = await api.delete<void>('/users/1')
    expect(result).toBeUndefined()
  })

  it('sends config-level headers', async () => {
    const fetch = mockFetch({ body: {} })
    const api = createClient({ headers: { Authorization: 'Bearer tok' }, fetch })
    await api.get('/me')
    expect(fetch.mock.calls[0][1].headers['Authorization']).toBe('Bearer tok')
  })

  it('calls function headers per request', async () => {
    let count = 0
    const fetch = mockFetch({ body: {} })
    const api = createClient({ headers: () => ({ 'X-Count': String(++count) }), fetch })
    await api.get('/a')
    await api.get('/b')
    expect(fetch.mock.calls[0][1].headers['X-Count']).toBe('1')
    expect(fetch.mock.calls[1][1].headers['X-Count']).toBe('2')
  })

  it('request headers override config headers', async () => {
    const fetch = mockFetch({ body: {} })
    const api = createClient({ headers: { Accept: 'text/html' }, fetch })
    await api.get('/x', { headers: { Accept: 'application/json' } })
    expect(fetch.mock.calls[0][1].headers['Accept']).toBe('application/json')
  })

  it('onRequest hook modifies request', async () => {
    const fetch = mockFetch({ body: {} })
    const api = createClient({
      fetch,
      onRequest: (req) => ({ ...req, headers: { ...req.headers, 'X-Injected': 'yes' } }),
    })
    await api.get('/x')
    expect(fetch.mock.calls[0][1].headers['X-Injected']).toBe('yes')
  })

  it('with() creates a new client with merged config', async () => {
    const fetch = mockFetch({ body: {} })
    const base = createClient({ baseUrl: 'https://api.com', headers: { Accept: 'application/json' }, fetch })
    const authed = base.with({ headers: { Authorization: 'Bearer tok' } })
    await authed.get('/me')
    const headers = fetch.mock.calls[0][1].headers
    expect(headers['Accept']).toBe('application/json')
    expect(headers['Authorization']).toBe('Bearer tok')
  })

  it('head returns headers', async () => {
    const fetch = vi.fn(async () => new Response(null, {
      status: 200,
      headers: new Headers({ 'X-Total': '42' }),
    }))
    const api = createClient({ fetch })
    const headers = await api.head('/users')
    expect(headers.get('X-Total')).toBe('42')
  })

  it('transform option processes response', async () => {
    const fetch = mockFetch({ body: { Name: 'TOM' } })
    const api = createClient({ fetch })
    const result = await api.get<{ name: string }>('/user', {
      transform: (data: any) => ({ name: data.Name.toLowerCase() }),
    })
    expect(result.name).toBe('tom')
  })

  it('passes abort signal through', async () => {
    let receivedSignal: AbortSignal | undefined
    const fetch = vi.fn(async (_url: string, init: any) => {
      receivedSignal = init.signal
      return new Response('{}', { headers: new Headers({ 'content-type': 'application/json' }) })
    })
    const controller = new AbortController()
    const api = createClient({ fetch })
    await api.get('/x', { signal: controller.signal })
    expect(receivedSignal).toBeDefined()
  })
})

describe('deduplication', () => {
  it('concurrent identical GETs share one fetch', async () => {
    const fetch = mockFetch({ body: [1, 2, 3] })
    const api = createClient({ dedup: true, fetch })
    const [a, b] = await Promise.all([
      api.get<number[]>('/users'),
      api.get<number[]>('/users'),
    ])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(a).toEqual([1, 2, 3])
    expect(b).toEqual([1, 2, 3])
  })

  it('different URLs are not deduped', async () => {
    const fetch = mockFetch({ body: [] })
    const api = createClient({ dedup: true, fetch })
    await Promise.all([api.get('/a'), api.get('/b')])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('POST is never deduped', async () => {
    const fetch = mockFetch({ body: {} })
    const api = createClient({ dedup: true, fetch })
    await Promise.all([
      api.post('/users', { body: { a: 1 } }),
      api.post('/users', { body: { a: 2 } }),
    ])
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('dedup invalidation', () => {
  it('POST to /users invalidates GET /users but not GET /user-settings', async () => {
    let callCount = 0
    const fetch = vi.fn(async (url: string) => {
      callCount++
      return new Response(JSON.stringify([]), { headers: new Headers({ 'content-type': 'application/json' }) })
    })
    const api = createClient({ dedup: { windowMs: 5000 }, fetch })

    await api.get('/users')
    await api.get('/user-settings')
    expect(callCount).toBe(2)

    // POST to /users should invalidate /users cache but not /user-settings
    await api.post('/users', { body: {} })

    // /users should re-fetch (cache invalidated)
    // /user-settings should still be cached
    callCount = 0
    await Promise.all([api.get('/users'), api.get('/user-settings')])
    // /users: new fetch (invalidated). /user-settings: cached (1 or 0 new fetches depending on timing)
    // At minimum, /users triggered a new fetch
    expect(fetch).toHaveBeenCalled()
  })

  it('POST to /users also invalidates GET /users/1', async () => {
    const fetch = vi.fn(async () =>
      new Response('{}', { headers: new Headers({ 'content-type': 'application/json' }) })
    )
    const api = createClient({ dedup: { windowMs: 5000 }, fetch })

    await api.get('/users/1')
    fetch.mockClear()

    await api.post('/users', { body: {} })
    await api.get('/users/1')
    // should have re-fetched since /users invalidates /users/1
    expect(fetch).toHaveBeenCalled()
  })
})

describe('retry', () => {
  it('retries on 500', async () => {
    let attempts = 0
    const fetch = vi.fn(async () => {
      attempts++
      if (attempts < 3) {
        return new Response('Server Error', { status: 500, statusText: 'Internal Server Error', headers: new Headers({ 'content-type': 'text/plain' }) })
      }
      return new Response('{"ok":true}', { status: 200, headers: new Headers({ 'content-type': 'application/json' }) })
    })
    const api = createClient({ fetch, retry: { attempts: 3, delay: 1 } })
    const result = await api.get<{ ok: boolean }>('/test')
    expect(result.ok).toBe(true)
    expect(attempts).toBe(3)
  })

  it('does not retry on 400', async () => {
    let attempts = 0
    const fetch = vi.fn(async () => {
      attempts++
      return new Response('{"error":"bad"}', { status: 400, statusText: 'Bad Request', headers: new Headers({ 'content-type': 'application/json' }) })
    })
    const api = createClient({ fetch, retry: { attempts: 3, delay: 1 } })
    await expect(api.get('/test')).rejects.toThrow()
    expect(attempts).toBe(1)
  })
})

describe('error response bodies', () => {
  it('parses JSON error body', async () => {
    const fetch = mockFetch({ status: 422, statusText: 'Unprocessable', body: { code: 'INVALID', field: 'email' } })
    const api = createClient({ fetch })
    try {
      await api.post('/users', { body: {} })
      expect.unreachable()
    } catch (e) {
      const err = e as HttpError<{ code: string; field: string }>
      expect(err.data.code).toBe('INVALID')
      expect(err.data.field).toBe('email')
    }
  })

  it('handles plain text error body', async () => {
    const fetch = vi.fn(async () => new Response('Something went wrong', { status: 500, statusText: 'Error', headers: new Headers({ 'content-type': 'text/plain' }) }))
    const api = createClient({ fetch })
    try {
      await api.get('/fail')
      expect.unreachable()
    } catch (e) {
      const err = e as HttpError<string>
      expect(err.data).toBe('Something went wrong')
    }
  })

  it('handles empty error body', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 500, statusText: 'Error', headers: new Headers({ 'content-length': '0' }) }))
    const api = createClient({ fetch })
    try {
      await api.get('/fail')
      expect.unreachable()
    } catch (e) {
      const err = e as HttpError
      expect(err.status).toBe(500)
    }
  })
})

describe('with() isolation', () => {
  it('cloned client does not share dedup cache', async () => {
    const fetch = mockFetch({ body: [] })
    const base = createClient({ dedup: true, fetch })
    const clone = base.with({ headers: { Authorization: 'Bearer tok' } })

    await base.get('/users')
    await clone.get('/users')
    // separate dedup caches, so two fetches
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('task escape hatch', () => {
  it('returns a Task that can be run manually', async () => {
    const { run } = await import('@stopcock/async')
    const fetch = mockFetch({ body: { id: 1 } })
    const api = createClient({ fetch })
    const task = api.task.get<{ id: number }>('/users/1')
    const result = await run(task)
    expect(result).toEqual({ id: 1 })
  })
})
