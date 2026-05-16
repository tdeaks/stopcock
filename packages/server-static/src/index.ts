import { readFile, stat } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import { definePlugin, type ServerPlugin } from '@stopcock/server'

export type StaticFilesOptions = {
  readonly dir: string
  readonly prefix?: string
  readonly index?: string | false
  readonly cacheControl?: string
  readonly headers?: HeadersInit | ((filePath: string) => HeadersInit)
}

const textTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

const binaryTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const contentType = (filePath: string): string =>
  textTypes[extname(filePath).toLowerCase()] ?? binaryTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream'

const normalizePrefix = (prefix = '/'): string => {
  const withSlash = prefix.startsWith('/') ? prefix : `/${prefix}`
  return withSlash.length > 1 && withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash
}

const matchesPrefix = (pathname: string, prefix: string): boolean =>
  prefix === '/' || pathname === prefix || pathname.startsWith(`${prefix}/`)

const stripPrefix = (pathname: string, prefix: string): string =>
  prefix === '/' ? pathname.slice(1) : pathname.slice(prefix.length).replace(/^\/+/, '')

const safeResolve = (root: string, encodedPath: string): string | Response | undefined => {
  let decoded: string
  try {
    decoded = decodeURIComponent(encodedPath)
  } catch {
    return new Response('bad request', { status: 400 })
  }

  if (decoded.includes('\0') || decoded.startsWith('/') || decoded.startsWith('\\')) {
    return new Response('forbidden', { status: 403 })
  }

  const target = resolve(root, decoded)
  const rel = relative(root, target)
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return target
  return new Response('forbidden', { status: 403 })
}

const readCandidate = async (
  request: Request,
  filePath: string,
  headers: Headers,
): Promise<Response | undefined> => {
  let info
  try {
    info = await stat(filePath)
  } catch {
    return undefined
  }

  if (!info.isFile()) return undefined
  headers.set('content-type', contentType(filePath))
  headers.set('content-length', String(info.size))
  headers.set('last-modified', info.mtime.toUTCString())

  if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
  const body = await readFile(filePath)
  return new Response(body, { status: 200, headers })
}

const applyHeaders = (base: Headers, headers: HeadersInit | undefined): void => {
  if (!headers) return
  new Headers(headers).forEach((value, key) => base.set(key, value))
}

export const staticFiles = (options: StaticFilesOptions): ServerPlugin => {
  const root = resolve(options.dir)
  const prefix = normalizePrefix(options.prefix)
  const index = options.index ?? false

  return definePlugin({
    name: 'static-files',
    setup: () => ({
      edge: [
        async (request) => {
          if (request.method !== 'GET' && request.method !== 'HEAD') return undefined

          const pathname = new URL(request.url).pathname
          if (!matchesPrefix(pathname, prefix)) return undefined

          const resolved = safeResolve(root, stripPrefix(pathname, prefix))
          if (resolved instanceof Response) return resolved
          if (!resolved) return undefined

          const headers = new Headers()
          if (options.cacheControl) headers.set('cache-control', options.cacheControl)
          applyHeaders(headers, typeof options.headers === 'function' ? options.headers(resolved) : options.headers)

          const file = await readCandidate(request, resolved, headers)
          if (file) return file

          if (!index) return undefined
          const directoryIndex = safeResolve(root, `${stripPrefix(pathname, prefix).replace(/\/?$/, '/')}${index}`)
          if (directoryIndex instanceof Response) return directoryIndex
          return directoryIndex ? readCandidate(request, directoryIndex, headers) : undefined
        },
      ],
    }),
  })
}

export const serveStatic = staticFiles
