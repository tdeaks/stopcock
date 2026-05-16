/**
 * uWebSockets.js adapter. Node-only (uWS ships a native binary that doesn't
 * match Bun's ABI).
 *
 * uWS's req/res are stack-allocated and invalidated as soon as the handler
 * returns synchronously. Everything from req must be snapshotted before any
 * await. Every res that does async work must register an abort handler.
 */
import type { TemplatedApp, HttpRequest, HttpResponse } from 'uWebSockets.js'
import { compileMatcher, type App } from '@stopcock/server'

type HeadersLike = { get: (name: string) => string | null }

// Plain-object header bag with Headers-compatible .get(). uWS req is invalid
// after sync return so we snapshot up front; full Headers is ~3x more
// expensive to build for a one-shot read.
const snapshotHeaderBag = (req: HttpRequest): HeadersLike => {
  const bag: Record<string, string> = {}
  req.forEach((key, value) => { bag[key] = value })
  return { get: (name) => bag[name.toLowerCase()] ?? null }
}

export const mountUws = (uwsApp: TemplatedApp, app: App): void => {
  const matcher = compileMatcher(app.routes.map((r) => ({
    method: r.method,
    path: r.path,
    paramNames: [...r.paramNames],
    pattern: r.pattern,
  })))

  uwsApp.any('/*', (res: HttpResponse, req: HttpRequest) => {
    const method = req.getMethod().toUpperCase()
    const url = req.getUrl()
    const query = req.getQuery()
    const headers = snapshotHeaderBag(req)
    const path = url.length > 1 && url.charCodeAt(url.length - 1) === 47
      ? url.slice(0, -1)
      : url
    const request = { method, url: query ? `${url}?${query}` : url, headers } as unknown as Request

    let aborted = false
    res.onAborted(() => { aborted = true })

    const hit = matcher(method, path)
    if (!hit) {
      res.cork(() => res.writeStatus('404 Not Found').end('not found'))
      return
    }
    const route = app.routes[hit.index]!
    const eagerParams = hit.params
    const m = hit.m
    const paramNames = hit.paramNames
    const paramOffsets = hit.paramOffsets
    let paramsCache: Record<string, string> | null = eagerParams
    const ctx = {
      request,
      get params(): Record<string, string> {
        if (paramsCache) return paramsCache
        const out: Record<string, string> = {}
        if (m) for (let i = 0; i < paramNames.length; i++) out[paramNames[i]!] = m[paramOffsets[i]!]!
        paramsCache = out
        return out
      },
    }

    ;(async () => {
      let value: unknown
      let errored = false
      try {
        value = await route.handler(ctx as never).run()
      } catch (e) {
        value = e
        errored = true
      }
      if (aborted) return

      // Fast path: plain JSON value. Skips Response construction, Blob,
      // arrayBuffer, header iteration. ~3x throughput vs the slow path.
      if (!errored && !(value instanceof Response)) {
        const body = JSON.stringify(value)
        res.cork(() => {
          res.writeHeader('content-type', 'application/json')
          res.end(body)
        })
        return
      }

      const response = errored ? route.render(value) : (value as Response)
      const body = await response.arrayBuffer()
      if (aborted) return
      res.cork(() => {
        res.writeStatus(`${response.status} ${response.statusText || statusTextFor(response.status)}`)
        response.headers.forEach((v, k) => res.writeHeader(k, v))
        res.end(body)
      })
    })()
  })
}

const statusTextFor = (code: number): string => {
  switch (code) {
    case 200: return 'OK'
    case 201: return 'Created'
    case 204: return 'No Content'
    case 400: return 'Bad Request'
    case 401: return 'Unauthorized'
    case 403: return 'Forbidden'
    case 404: return 'Not Found'
    case 429: return 'Too Many Requests'
    case 500: return 'Internal Server Error'
    case 504: return 'Gateway Timeout'
    default: return ''
  }
}
