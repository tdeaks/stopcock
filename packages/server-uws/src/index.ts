/**
 * uWebSockets.js adapter. Node-only (uWS ships a native binary that doesn't
 * match Bun's ABI).
 *
 * uWS's req/res are stack-allocated and invalidated as soon as the handler
 * returns synchronously. Anything from `req` must be snapshotted up front,
 * and any res use after an `await` must be guarded by the abort flag.
 *
 * Hot path bypasses Web-API allocations:
 *   - Headers: lazy `.get`-only shim over a plain-object snapshot
 *   - Request: minimal shim with on-demand `.json()`/`.text()`/`.query`
 *   - Response: skipped entirely when the dispatch returns a plain value
 *     (Response/Blob/stream pumping all stay on the slow path)
 *   - Matching: routes mount on uWS per-method (app.get, app.post, …) so
 *     uWS's C++ router does the dispatch — no JS pathnameOf/matcher work
 */
import type { TemplatedApp, HttpRequest, HttpResponse } from 'uWebSockets.js'
import type { App } from '@stopcock/server'
import { queryGetFast } from '@stopcock/server'

// Pre-resolved lowercase for the headers handlers/middleware read most often.
// Mirrors the table in @stopcock/server's node adapter.
const KNOWN_LOWER: Record<string, string> = Object.create(null)
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

class HeadersShim {
  constructor(private readonly raw: Record<string, string>) {}
  get(name: string): string | null {
    const lc = KNOWN_LOWER[name] ?? name.toLowerCase()
    return this.raw[lc] ?? null
  }
}

class UwsRequestShim {
  private _query: URLSearchParams | null = null
  private _url: string | null = null
  readonly headers: HeadersShim
  readonly signal: AbortSignal | undefined = undefined

  constructor(
    readonly method: string,
    private readonly rawUrl: string,
    private readonly queryStr: string,
    rawHeaders: Record<string, string>,
    private readonly bodyPromise: Promise<Buffer> | null,
  ) {
    this.headers = new HeadersShim(rawHeaders)
  }

  get url(): string {
    if (this._url) return this._url
    this._url = this.queryStr ? `${this.rawUrl}?${this.queryStr}` : this.rawUrl
    return this._url
  }

  get query(): URLSearchParams {
    if (this._query) return this._query
    this._query = new URLSearchParams(this.queryStr)
    return this._query
  }

  queryGet(name: string): string | null {
    return queryGetFast(this.queryStr, name, () => this.query.get(name))
  }

  get body(): null { return null }

  async json(): Promise<unknown> {
    if (!this.bodyPromise) return null
    return JSON.parse((await this.bodyPromise).toString('utf8'))
  }

  async text(): Promise<string> {
    if (!this.bodyPromise) return ''
    return (await this.bodyPromise).toString('utf8')
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (!this.bodyPromise) return new ArrayBuffer(0)
    const b = await this.bodyPromise
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  }
}

class UwsCtx {
  constructor(public request: UwsRequestShim, public params: Record<string, string>) {}
  get query(): URLSearchParams { return this.request.query }
}

const collectBodyUws = (res: HttpResponse): Promise<Buffer> =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = []
    res.onData((chunk, isLast) => {
      chunks.push(Buffer.from(chunk))
      if (isLast) resolve(chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks))
    })
  })

const statusTextFor = (code: number): string => {
  switch (code) {
    case 200: return 'OK'
    case 201: return 'Created'
    case 204: return 'No Content'
    case 301: return 'Moved Permanently'
    case 302: return 'Found'
    case 304: return 'Not Modified'
    case 400: return 'Bad Request'
    case 401: return 'Unauthorized'
    case 403: return 'Forbidden'
    case 404: return 'Not Found'
    case 409: return 'Conflict'
    case 422: return 'Unprocessable Entity'
    case 429: return 'Too Many Requests'
    case 500: return 'Internal Server Error'
    case 502: return 'Bad Gateway'
    case 503: return 'Service Unavailable'
    case 504: return 'Gateway Timeout'
    default: return ''
  }
}

// Translate /:param patterns to uWS's :param syntax (they're already the same
// in current uWS versions; this is a stub for future divergence).
const toUwsPath = (path: string): string => path

// Methods supported by uWS. We mount each route on the method-specific
// handler — uWS's native router then matches without JS overhead.
const UWS_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const
type UwsMethod = (typeof UWS_METHODS)[number]

const buildRouteHandler = (route: App['routes'][number]) => {
  const paramNames = route.paramNames
  const direct = (route.handler as { __direct?: (ctx: unknown) => unknown }).__direct
  const handler = route.handler
  const serializer = route.serializer
  const render = route.render

  return (res: HttpResponse, req: HttpRequest) => {
    // Snapshot synchronously; req is invalid after this function returns.
    const method = req.getMethod().toUpperCase()
    const rawUrl = req.getUrl()
    const queryStr = req.getQuery()
    const rawHeaders: Record<string, string> = {}
    req.forEach((k, v) => { rawHeaders[k] = v })

    // Param extraction — uWS gives us by index after we declared the pattern.
    const params: Record<string, string> = {}
    for (let i = 0; i < paramNames.length; i++) {
      params[paramNames[i]!] = req.getParameter(i) as string
    }

    let aborted = false
    res.onAborted(() => { aborted = true })

    const bodyPromise = method === 'GET' || method === 'HEAD' ? null : collectBodyUws(res)

    // Static-route fast path: precomputed body, no handler invocation.
    if (route.staticBody !== undefined && route.hooks.length === 0) {
      const status = route.staticStatus ?? 200
      const headers = route.staticHeaders
      res.cork(() => {
        if (status !== 200) res.writeStatus(`${status} ${statusTextFor(status)}`)
        res.writeHeader('content-type', 'application/json')
        if (headers) {
          for (const k in headers) res.writeHeader(k, headers[k]!)
        }
        res.end(route.staticBody)
      })
      return
    }

    const request = new UwsRequestShim(method, rawUrl, queryStr, rawHeaders, bodyPromise)
    const ctx = new UwsCtx(request, params)

    ;(async () => {
      let value: unknown
      try {
        value = direct
          ? await direct(ctx)
          : await handler(ctx as never).run()
      } catch (error) {
        if (aborted) return
        const response = render(error)
        const body = await response.arrayBuffer()
        if (aborted) return
        res.cork(() => {
          res.writeStatus(`${response.status} ${response.statusText || statusTextFor(response.status)}`)
          response.headers.forEach((v, k) => res.writeHeader(k, v))
          res.end(body)
        })
        return
      }
      if (aborted) return

      // FastJson helper.
      if (value && typeof value === 'object' && (value as { [k: symbol]: unknown })[Symbol.for('stopcock.fastJson')] === true) {
        const fj = value as { status?: number; headers?: Record<string, string>; value: unknown }
        const body = serializer ? serializer(fj.value).body : JSON.stringify(fj.value)
        const status = fj.status ?? 200
        res.cork(() => {
          if (status !== 200) res.writeStatus(`${status} ${statusTextFor(status)}`)
          res.writeHeader('content-type', 'application/json')
          if (fj.headers) {
            for (const k in fj.headers) res.writeHeader(k, fj.headers[k]!)
          }
          res.end(body)
        })
        return
      }

      if (value instanceof Response) {
        const body = await value.arrayBuffer()
        if (aborted) return
        res.cork(() => {
          res.writeStatus(`${value.status} ${value.statusText || statusTextFor(value.status)}`)
          value.headers.forEach((v, k) => res.writeHeader(k, v))
          res.end(body)
        })
        return
      }

      // Plain JSON value — hot path.
      const body = serializer ? serializer(value).body : JSON.stringify(value)
      res.cork(() => {
        res.writeHeader('content-type', 'application/json')
        res.end(body)
      })
    })()
  }
}

export const mountUws = (uwsApp: TemplatedApp, app: App): void => {
  // Mount each route on its method-specific handler. uWS's native router
  // matches the path and dispatches to the matching handler — we never
  // touch the matcher in JS.
  for (const route of app.routes) {
    const method = route.method.toLowerCase() as UwsMethod
    if (!UWS_METHODS.includes(method)) continue
    const handler = buildRouteHandler(route)
    ;(uwsApp[method] as (path: string, h: typeof handler) => unknown)(toUwsPath(route.path), handler)
  }

  // 404 fallthrough. Anything not matched above lands here.
  uwsApp.any('/*', (res) => {
    res.cork(() => {
      res.writeStatus('404 Not Found')
      res.writeHeader('content-type', 'text/plain; charset=utf-8')
      res.end('not found')
    })
  })
}
