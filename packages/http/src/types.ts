import type { Task } from '@stopcock/async'
import type { RetryOptions } from '@stopcock/async'
import type { HttpError } from './error.js'

export type ResponseType = 'json' | 'text' | 'blob' | 'arrayBuffer'

export type QueryParams = Record<string,
  string | number | boolean | undefined | null |
  Array<string | number | boolean>
>

export type PathParams = Record<string, string | number>

export type HeadersInit =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>)

export type ResolvedRequest = {
  readonly method: string
  readonly url: string
  readonly headers: Record<string, string>
  readonly body?: BodyInit | null
  readonly signal?: AbortSignal
}

export type RequestOptions = {
  readonly params?: PathParams
  readonly query?: QueryParams
  readonly headers?: Record<string, string>
  readonly signal?: AbortSignal
  readonly responseType?: ResponseType
  readonly transform?: (data: unknown) => unknown
  readonly timeout?: number
}

export type RequestOptionsWithBody = RequestOptions & {
  readonly body?: unknown
  readonly onProgress?: (event: ProgressEvent) => void
}

export type HttpConfig = {
  readonly baseUrl?: string
  readonly headers?: HeadersInit
  readonly timeout?: number
  readonly retry?: RetryOptions
  readonly onRequest?: (req: ResolvedRequest) => ResolvedRequest | void
  readonly onResponse?: (res: Response) => Response | void
  readonly dedup?: boolean | { windowMs?: number }
  readonly responseType?: ResponseType
  readonly transform?: (data: unknown) => unknown
  readonly fetch?: typeof globalThis.fetch
}

export type TaskMethods = {
  get<T, E = unknown>(path: string, options?: RequestOptions): Task<T, HttpError<E>>
  post<T, E = unknown>(path: string, options?: RequestOptionsWithBody): Task<T, HttpError<E>>
  put<T, E = unknown>(path: string, options?: RequestOptionsWithBody): Task<T, HttpError<E>>
  patch<T, E = unknown>(path: string, options?: RequestOptionsWithBody): Task<T, HttpError<E>>
  delete<T = void, E = unknown>(path: string, options?: RequestOptions): Task<T, HttpError<E>>
}

export interface HttpClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>
  post<T>(path: string, options?: RequestOptionsWithBody): Promise<T>
  put<T>(path: string, options?: RequestOptionsWithBody): Promise<T>
  patch<T>(path: string, options?: RequestOptionsWithBody): Promise<T>
  delete<T = void>(path: string, options?: RequestOptions): Promise<T>
  head(path: string, options?: RequestOptions): Promise<Headers>
  readonly task: TaskMethods
  with(overrides: Partial<HttpConfig>): HttpClient
}
