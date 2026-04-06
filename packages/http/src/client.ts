import { of, retry as asyncRetry, timeout as asyncTimeout, type Task } from '@stopcock/async'
import { pipe } from '@stopcock/fp'
import type { HttpClient, HttpConfig, RequestOptions, RequestOptionsWithBody, TaskMethods } from './types.js'
import { HttpError } from './error.js'
import { buildUrl, resolveHeaders, serializeBody } from './request.js'
import { parseResponse, throwIfNotOk } from './response.js'
import { createDedupCache, dedupKey, isMutation, type DedupCache } from './dedup.js'

function mergeConfig(base: HttpConfig, overrides: Partial<HttpConfig>): HttpConfig {
  const merged: HttpConfig = { ...base, ...overrides }
  // merge headers
  if (base.headers && overrides.headers) {
    const bh = base.headers
    const oh = overrides.headers
    if (typeof bh === 'function' || typeof oh === 'function') {
      (merged as any).headers = async () => {
        const b = typeof bh === 'function' ? await bh() : { ...bh }
        const o = typeof oh === 'function' ? await oh() : { ...oh }
        return { ...b, ...o }
      }
    } else {
      (merged as any).headers = { ...bh, ...oh }
    }
  }
  return merged
}

export function createClient(config: HttpConfig = {}): HttpClient {
  const fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis)
  const dedupConfig = config.dedup
  const dedup: DedupCache | null = dedupConfig
    ? createDedupCache(typeof dedupConfig === 'object' ? dedupConfig.windowMs : 0)
    : null

  function makeTask<T, E>(method: string, path: string, options?: RequestOptions | RequestOptionsWithBody): Task<T, HttpError<E>> {
    return of(async (signal) => {
      const url = buildUrl(config.baseUrl, path, options?.params, options?.query)
      const headers = await resolveHeaders(config.headers, options?.headers)
      let body: BodyInit | null = null

      if ('body' in (options ?? {})) {
        const serialized = serializeBody((options as RequestOptionsWithBody).body)
        body = serialized.body
        if (serialized.contentType && !headers['content-type'] && !headers['Content-Type']) {
          headers['Content-Type'] = serialized.contentType
        }
      }

      let resolved: { method: string; url: string; headers: Record<string, string>; body: BodyInit | null; signal: AbortSignal | undefined } = { method, url, headers, body, signal }

      if (config.onRequest) {
        const modified = config.onRequest(resolved)
        if (modified) resolved = { method: modified.method, url: modified.url, headers: modified.headers, body: modified.body ?? null, signal }
      }

      // dedup for GET/HEAD
      if (dedup && !isMutation(method)) {
        const key = dedupKey(method, url)
        const existing = dedup.get(key)
        if (existing) return existing as Promise<T>

        const promise = doFetch<T>(resolved, method, url, options)
        dedup.set(key, promise)
        return promise
      }

      // mutations invalidate dedup cache
      if (dedup && isMutation(method)) {
        dedup.invalidate(url)
      }

      return doFetch<T>(resolved, method, url, options)
    }) as Task<T, HttpError<E>>
  }

  function xhrFetch(
    resolved: { method: string; url: string; headers: Record<string, string>; body?: BodyInit | null; signal?: AbortSignal },
    onProgress: (event: ProgressEvent) => void,
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open(resolved.method, resolved.url)
      for (const [k, v] of Object.entries(resolved.headers)) xhr.setRequestHeader(k, v)
      xhr.upload.onprogress = onProgress
      xhr.onload = () => {
        const headers = new Headers()
        const rawHeaders = xhr.getAllResponseHeaders().trim()
        if (rawHeaders) {
          for (const line of rawHeaders.split('\r\n')) {
            const idx = line.indexOf(': ')
            if (idx > 0) headers.set(line.slice(0, idx), line.slice(idx + 2))
          }
        }
        resolve(new Response(xhr.response, { status: xhr.status, statusText: xhr.statusText, headers }))
      }
      xhr.onerror = () => reject(new TypeError('Network error'))
      if (resolved.signal) {
        if (resolved.signal.aborted) { xhr.abort(); reject(new DOMException('Aborted', 'AbortError')); return }
        resolved.signal.addEventListener('abort', () => { xhr.abort(); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
      }
      xhr.send(resolved.body as XMLHttpRequestBodyInit | null | undefined)
    })
  }

  async function doFetch<T>(
    resolved: { method: string; url: string; headers: Record<string, string>; body?: BodyInit | null; signal?: AbortSignal },
    method: string,
    url: string,
    options?: RequestOptions | RequestOptionsWithBody,
  ): Promise<T> {
    const onProgress = options && 'onProgress' in options ? (options as RequestOptionsWithBody).onProgress : undefined
    const useXhr = onProgress && resolved.body && typeof XMLHttpRequest !== 'undefined'

    let response = useXhr
      ? await xhrFetch(resolved, onProgress!)
      : await fetchFn(resolved.url, {
          method: resolved.method,
          headers: resolved.headers,
          body: resolved.body,
          signal: resolved.signal,
        })

    if (config.onResponse) {
      const modified = config.onResponse(response)
      if (modified) response = modified
    }

    await throwIfNotOk<unknown>(response, method, url)

    const responseType = options?.responseType ?? config.responseType
    const transform = options?.transform ?? config.transform
    return parseResponse<T>(response, responseType, transform)
  }

  function applyMiddleware<T, E>(task: Task<T, HttpError<E>>, options?: RequestOptions): Task<T, HttpError<E>> {
    let t: Task<T, HttpError<E>> = task
    const tm = options?.timeout ?? config.timeout
    if (tm) t = pipe(t, asyncTimeout(tm)) as Task<T, HttpError<E>>
    if (config.retry) {
      const userRetryIf = config.retry.retryIf
      t = pipe(t, asyncRetry({
        ...config.retry,
        retryIf: (error, attempt) => {
          if (error instanceof HttpError) {
            if (error.status >= 500 || error.status === 429) return true
            return false
          }
          if (userRetryIf) return userRetryIf(error, attempt)
          return true // network errors
        },
      })) as Task<T, HttpError<E>>
    }
    return t
  }

  function request<T, E>(method: string, path: string, options?: RequestOptions | RequestOptionsWithBody): Promise<T> {
    const task = applyMiddleware<T, E>(makeTask<T, E>(method, path, options), options)
    return task.run(options?.signal) as Promise<T>
  }

  const taskMethods: TaskMethods = {
    get: (path, options) => applyMiddleware(makeTask('GET', path, options), options),
    post: (path, options) => applyMiddleware(makeTask('POST', path, options), options),
    put: (path, options) => applyMiddleware(makeTask('PUT', path, options), options),
    patch: (path, options) => applyMiddleware(makeTask('PATCH', path, options), options),
    delete: (path, options) => applyMiddleware(makeTask('DELETE', path, options), options),
  }

  const client: HttpClient = {
    get: (path, options) => request('GET', path, options),
    post: (path, options) => request('POST', path, options),
    put: (path, options) => request('PUT', path, options),
    patch: (path, options) => request('PATCH', path, options),
    delete: (path, options) => request('DELETE', path, options),

    head(path, options) {
      const task = of(async (signal?: AbortSignal) => {
        const url = buildUrl(config.baseUrl, path, options?.params, options?.query)
        const headers = await resolveHeaders(config.headers, options?.headers)
        let resolved: { method: string; url: string; headers: Record<string, string>; body: BodyInit | null; signal: AbortSignal | undefined } = { method: 'HEAD', url, headers, body: null, signal }
        if (config.onRequest) {
          const modified = config.onRequest(resolved)
          if (modified) resolved = { method: modified.method, url: modified.url, headers: modified.headers, body: modified.body ?? null, signal }
        }
        const response = await fetchFn(resolved.url, { method: 'HEAD', headers: resolved.headers, signal: resolved.signal })
        if (!response.ok) {
          throw new HttpError({ status: response.status, statusText: response.statusText, data: undefined, method: 'HEAD', url })
        }
        return response.headers
      })
      return applyMiddleware(task, options).run(options?.signal) as Promise<Headers>
    },

    task: taskMethods,
    with: (overrides) => createClient(mergeConfig(config, overrides)),
  }

  return client
}
