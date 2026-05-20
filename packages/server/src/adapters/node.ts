import type { IncomingMessage, ServerResponse, IncomingHttpHeaders } from 'node:http'
import type { App } from '../router/router'
import { queryGetFast } from '../query-fast'

/**
 * Node http listener. Designed to skip Web-API allocations on the hot path:
 *
 *   - Headers: lazy `.get`-only shim over `req.headers` (no `new Headers()`)
 *   - Request: minimal shim with on-demand `.json()` / `.text()` (no `new Request()`)
 *   - Body: only collected when the handler awaits one of the body methods
 *   - Response: skipped entirely when the handler returns a plain JSON value
 *     (no Response/Blob/ReadableStream/getReader pump)
 *
 * Anything fancier (FormData, streaming bodies, AbortSignal propagation) falls
 * through to the slow path: a normal Response is constructed and pumped.
 */

// Pre-resolved lowercase for the headers handlers/middleware read most often.
// Saves a String.prototype.toLowerCase per get for callers that pass either
// the canonical form ("Content-Type"), all-caps ("AUTHORIZATION"), or the
// already-lowercase form ("authorization"). Unknown headers fall back.
export const KNOWN_LOWER: Record<string, string> = Object.create(null)
const seedKnownHeaders = (names: readonly string[]) => {
  for (const lc of names) {
    KNOWN_LOWER[lc] = lc
    KNOWN_LOWER[lc.toUpperCase()] = lc
    KNOWN_LOWER[lc.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-')] = lc
  }
}
seedKnownHeaders([
  'authorization', 'content-type', 'content-length', 'cookie', 'accept',
  'accept-encoding', 'user-agent', 'host',
  'x-forwarded-for', 'x-request-id', 'x-trace-id',
  'accept-language', 'if-none-match', 'x-csrf-token',
])

// Class form keeps V8 hidden classes stable across requests — measurably
// cheaper than `{ get(name) { ... } }` object literals.
export class HeadersShim {
  constructor(private readonly raw: IncomingHttpHeaders) {}
  get(name: string): string | null {
    const lc = KNOWN_LOWER[name] ?? name.toLowerCase()
    const v = this.raw[lc]
    if (v == null) return null
    return Array.isArray(v) ? v.join(', ') : v
  }
}

const collectBody = (req: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

const NOT_FOUND_BODY = 'not found'

// Per-request request shim. A class with monomorphic getters lets V8 inline
// the property accesses across many calls. Stays compatible with handlers
// that use `request.headers.get`, `request.url`, `request.json()`, etc.
class NodeRequestShim {
  private _url: string | null = null
  private _query: URLSearchParams | null = null
  // undefined = not yet computed; null = no query string
  private _qs: string | null | undefined = undefined
  private _body: Promise<Buffer> | null = null
  readonly headers: HeadersShim
  readonly signal: AbortSignal | undefined = undefined

  constructor(
    private readonly req: IncomingMessage,
    readonly method: string,
    private readonly rawUrl: string,
  ) {
    this.headers = new HeadersShim(req.headers)
  }

  get url(): string {
    if (this._url) return this._url
    const host = this.req.headers.host ?? 'localhost'
    this._url = `http://${host}${this.rawUrl}`
    return this._url
  }

  private getQs(): string | null {
    if (this._qs !== undefined) return this._qs
    const qIdx = this.rawUrl.indexOf('?')
    if (qIdx === -1) { this._qs = null; return null }
    const hashIdx = this.rawUrl.indexOf('#', qIdx)
    this._qs = hashIdx === -1 ? this.rawUrl.slice(qIdx + 1) : this.rawUrl.slice(qIdx + 1, hashIdx)
    return this._qs
  }

  get query(): URLSearchParams {
    if (this._query) return this._query
    this._query = new URLSearchParams(this.getQs() ?? '')
    return this._query
  }

  queryGet(name: string): string | null {
    const qs = this.getQs()
    if (qs === null) return null
    return queryGetFast(qs, name, () => this.query.get(name))
  }

  get body(): null { return null }

  private ensureBody(): Promise<Buffer> {
    if (this._body) return this._body
    if (this.method === 'GET' || this.method === 'HEAD') {
      this._body = Promise.resolve(EMPTY_BUFFER)
    } else {
      this._body = collectBody(this.req)
    }
    return this._body
  }

  async json(): Promise<unknown> {
    return JSON.parse((await this.ensureBody()).toString('utf8'))
  }

  async text(): Promise<string> {
    return (await this.ensureBody()).toString('utf8')
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const b = await this.ensureBody()
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
  }
}

const EMPTY_BUFFER = Buffer.alloc(0)

export const toNodeListener = (app: App) => {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET'
    const rawUrl = req.url ?? '/'

    // Resolve pathname inline — avoids allocating a full URL object. The host
    // header is only needed by handlers that reconstruct an absolute URL.
    const queryStart = rawUrl.indexOf('?')
    const hashStart = rawUrl.indexOf('#')
    let pathEnd = rawUrl.length
    if (queryStart !== -1) pathEnd = queryStart
    if (hashStart !== -1 && hashStart < pathEnd) pathEnd = hashStart
    let pathname = pathEnd === rawUrl.length ? rawUrl : rawUrl.slice(0, pathEnd)
    if (pathname.length > 1 && pathname.charCodeAt(pathname.length - 1) === 47) {
      pathname = pathname.slice(0, -1)
    }

    const request = new NodeRequestShim(req, method, rawUrl) as unknown as Request

    let result
    try {
      const maybe = app.dispatch(method, pathname, request)
      result = maybe instanceof Promise ? await maybe : maybe
    } catch (error) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({
        error: (error as { name?: string })?.name ?? 'Error',
        message: (error as { message?: string })?.message ?? 'internal error',
      }))
      return
    }

    if (result.kind === 'notFound') {
      res.statusCode = 404
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end(NOT_FOUND_BODY)
      return
    }

    if (result.kind === 'static' || result.kind === 'value') {
      // Pre-serialized body (static cache or dispatch-time serializer).
      // Skip Buffer.byteLength's UTF-8 scan when the serializer/register
      // proved the body is ASCII-only.
      res.statusCode = result.status ?? 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      // HEAD: spec allows Content-Length to match GET, but keep-alive clients
      // (autocannon, etc.) need Content-Length: 0 to know the response ended.
      const len = result.byteLength ?? Buffer.byteLength(result.body)
      res.setHeader('content-length', method === 'HEAD' ? 0 : len)
      if (result.headers) {
        for (const key in result.headers) res.setHeader(key, result.headers[key]!)
      }
      res.end(method === 'HEAD' ? undefined : result.body)
      return
    }

    // Slow path: full Response. Pump the body stream into res.
    const response = result.response
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    if (response.body) {
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
    }
    res.end()
  }
}
