import { definePlugin } from '../../plugin'
import type { ServerPlugin } from '../../plugin'
import type { Method } from '../../define/handler'

export type CorsOriginResult = string | false | null | undefined

export type CorsOrigin =
  | string
  | readonly string[]
  | ((origin: string | null, request: Request) => CorsOriginResult | Promise<CorsOriginResult>)

export type CorsHeaderList = string | readonly string[]

export type CorsOptions = {
  readonly origin?: CorsOrigin
  readonly methods?: readonly Method[] | readonly string[]
  readonly allowedHeaders?: CorsHeaderList
  readonly exposedHeaders?: CorsHeaderList
  readonly credentials?: boolean
  readonly maxAge?: number
}

const DEFAULT_METHODS: readonly Method[] = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
]

const join = (value: CorsHeaderList | readonly string[] | undefined): string | undefined => {
  if (!value) return undefined
  return typeof value === 'string' ? value : value.join(', ')
}

const appendVary = (headers: Headers, value: string): void => {
  const current = headers.get('vary')
  if (!current) {
    headers.set('vary', value)
    return
  }
  const seen = current.split(',').map((part) => part.trim().toLowerCase())
  if (!seen.includes(value.toLowerCase())) headers.set('vary', `${current}, ${value}`)
}

const resolveOrigin = async (
  request: Request,
  configured: CorsOrigin | undefined,
): Promise<string | undefined> => {
  const requestOrigin = request.headers.get('origin')
  const origin = configured ?? '*'

  if (typeof origin === 'string') return origin
  if (typeof origin === 'function') {
    const resolved = await origin(requestOrigin, request)
    return resolved || undefined
  }

  const resolved = requestOrigin && origin.includes(requestOrigin) ? requestOrigin : undefined
  return resolved || undefined
}

const makeMutable = (response: Response): Response => {
  try {
    response.headers.set('x-stopcock-cors-probe', '1')
    response.headers.delete('x-stopcock-cors-probe')
    return response
  } catch {
    return new Response(response.body, response)
  }
}

const applyBaseHeaders = async (
  headers: Headers,
  request: Request,
  options: CorsOptions,
): Promise<boolean> => {
  const origin = await resolveOrigin(request, options.origin)
  if (!origin) return false

  headers.set('access-control-allow-origin', origin)
  if (origin !== '*') appendVary(headers, 'Origin')
  if (options.credentials) headers.set('access-control-allow-credentials', 'true')
  return true
}

const applyPreflightHeaders = async (
  headers: Headers,
  request: Request,
  options: CorsOptions,
): Promise<boolean> => {
  if (!await applyBaseHeaders(headers, request, options)) return false

  headers.set('access-control-allow-methods', join(options.methods ?? DEFAULT_METHODS)!)

  const allowedHeaders = join(options.allowedHeaders)
  const requestedHeaders = request.headers.get('access-control-request-headers')
  const allowHeaders = allowedHeaders ?? requestedHeaders ?? undefined
  if (allowHeaders) headers.set('access-control-allow-headers', allowHeaders)
  if (!allowedHeaders && requestedHeaders) appendVary(headers, 'Access-Control-Request-Headers')

  if (options.maxAge !== undefined) headers.set('access-control-max-age', String(options.maxAge))
  return true
}

const applyNormalHeaders = async (
  response: Response,
  request: Request,
  options: CorsOptions,
): Promise<Response> => {
  const next = makeMutable(response)
  if (!await applyBaseHeaders(next.headers, request, options)) return next

  const exposedHeaders = join(options.exposedHeaders)
  if (exposedHeaders) next.headers.set('access-control-expose-headers', exposedHeaders)
  return next
}

const isPreflight = (request: Request): boolean =>
  request.method.toUpperCase() === 'OPTIONS' &&
  request.headers.has('access-control-request-method')

export const cors = (options: CorsOptions = {}): ServerPlugin =>
  definePlugin({
    name: 'cors',
    setup: () => ({
      edge: [
        async (request) => {
          if (!isPreflight(request)) return undefined

          const headers = new Headers()
          if (!await applyPreflightHeaders(headers, request, options)) {
            return new Response('CORS origin not allowed', { status: 403 })
          }
          return new Response(null, { status: 204, headers })
        },
      ],
      hooks: [
        {
          after: (ctx, response) => applyNormalHeaders(response, ctx.request, options),
        },
      ],
    }),
  })
