import { defineMiddleware, defineRoutePlugin, type RoutePlugin } from '@stopcock/server'

export type SameSite = 'strict' | 'lax' | 'none' | 'Strict' | 'Lax' | 'None'

export type CookieOptions = {
  readonly domain?: string
  readonly path?: string
  readonly expires?: Date
  readonly maxAge?: number
  readonly httpOnly?: boolean
  readonly secure?: boolean
  readonly sameSite?: SameSite
  readonly priority?: 'low' | 'medium' | 'high' | 'Low' | 'Medium' | 'High'
  readonly partitioned?: boolean
}

export type CookieJar = {
  get(name: string): string | undefined
  set(name: string, value: string, options?: CookieOptions): void
  delete(name: string, options?: Omit<CookieOptions, 'expires' | 'maxAge'>): void
  all(): Record<string, string>
}

type CookieState = {
  readonly values: Map<string, string>
  readonly outgoing: string[]
}

const COOKIE_STATE = Symbol.for('@stopcock/server-cookie/state')
type InternalCookieJar = CookieJar & { readonly [COOKIE_STATE]: CookieState }

const decode = (value: string): string => {
  const unquoted = value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"'
    ? value.slice(1, -1)
    : value
  try {
    return decodeURIComponent(unquoted)
  } catch {
    return unquoted
  }
}

export const parseCookieHeader = (header: string | null | undefined): Record<string, string> => {
  const out: Record<string, string> = {}
  if (!header) return out

  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const name = part.slice(0, index).trim()
    if (!name) continue
    out[name] = decode(part.slice(index + 1).trim())
  }
  return out
}

const normalizeCase = (value: string): string => value[0]!.toUpperCase() + value.slice(1).toLowerCase()

const assertCookieName = (name: string): void => {
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
    throw new TypeError(`invalid cookie name: ${name}`)
  }
}

const encodeValue = (value: string): string => encodeURIComponent(value)

export const serializeCookie = (name: string, value: string, options: CookieOptions = {}): string => {
  assertCookieName(name)

  const parts = [`${name}=${encodeValue(value)}`]
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`)
  if (options.domain) parts.push(`Domain=${options.domain}`)
  if (options.path) parts.push(`Path=${options.path}`)
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
  if (options.httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  if (options.sameSite) parts.push(`SameSite=${normalizeCase(options.sameSite)}`)
  if (options.priority) parts.push(`Priority=${normalizeCase(options.priority)}`)
  if (options.partitioned) parts.push('Partitioned')
  return parts.join('; ')
}

const createCookieJar = (header: string | null): InternalCookieJar => {
  const state: CookieState = {
    values: new Map(Object.entries(parseCookieHeader(header))),
    outgoing: [],
  }

  const jar: InternalCookieJar = {
    [COOKIE_STATE]: state,
    get: (name) => state.values.get(name),
    set: (name, value, options) => {
      state.values.set(name, value)
      state.outgoing.push(serializeCookie(name, value, options))
    },
    delete: (name, options) => {
      state.values.delete(name)
      state.outgoing.push(serializeCookie(name, '', {
        ...options,
        maxAge: 0,
        expires: new Date(0),
      }))
    },
    all: () => Object.fromEntries(state.values),
  }
  return jar
}

const appendHeader = (response: Response, name: string, value: string): Response => {
  try {
    response.headers.append(name, value)
    return response
  } catch {
    const headers = new Headers(response.headers)
    headers.append(name, value)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}

export const cookies = (): RoutePlugin<{ cookies: CookieJar }> => defineRoutePlugin({
  name: 'cookies',
  middleware: defineMiddleware<{ cookies: CookieJar }>((ctx) => ({
    cookies: createCookieJar(ctx.request.headers.get('cookie')),
  })),
  hooks: [
    {
      after: (ctx, response) => {
        const jar = (ctx as { cookies?: CookieJar }).cookies as InternalCookieJar | undefined
        const outgoing = jar?.[COOKIE_STATE].outgoing ?? []
        let current = response
        for (const value of outgoing) current = appendHeader(current, 'Set-Cookie', value)
        return current
      },
    },
  ],
})

export const cookie = cookies
