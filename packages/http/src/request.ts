import type { PathParams, QueryParams, HeadersInit } from './types.js'

export function substitutePath(template: string, params?: PathParams): string {
  if (!params) return template
  return template.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
    if (!(key in params)) throw new Error(`Missing path param: ${key}`)
    return encodeURIComponent(String(params[key]))
  })
}

export function serializeQuery(query?: QueryParams): string {
  if (!query) return ''
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, String(v))
    } else {
      sp.append(key, String(value))
    }
  }
  const str = sp.toString()
  return str ? `?${str}` : ''
}

export function buildUrl(baseUrl: string | undefined, path: string, params?: PathParams, query?: QueryParams): string {
  const resolved = substitutePath(path, params)
  const base = baseUrl ? baseUrl.replace(/\/+$/, '') : ''
  const sep = resolved.startsWith('/') ? '' : '/'
  return `${base}${sep}${resolved}${serializeQuery(query)}`
}

export async function resolveHeaders(
  configHeaders: HeadersInit | undefined,
  requestHeaders: Record<string, string> | undefined,
): Promise<Record<string, string>> {
  let base: Record<string, string> = {}
  if (configHeaders) {
    base = typeof configHeaders === 'function' ? await configHeaders() : { ...configHeaders }
  }
  if (requestHeaders) {
    return { ...base, ...requestHeaders }
  }
  return base
}

function isPassthrough(body: unknown): body is BodyInit {
  return body instanceof FormData
    || body instanceof Blob
    || body instanceof ArrayBuffer
    || body instanceof URLSearchParams
    || body instanceof ReadableStream
    || typeof body === 'string'
}

export function serializeBody(body: unknown): { body: BodyInit | null; contentType?: string } {
  if (body === undefined || body === null) return { body: null }
  if (isPassthrough(body)) return { body }
  return { body: JSON.stringify(body), contentType: 'application/json' }
}
