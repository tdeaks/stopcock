export class HttpError<E = unknown> extends Error {
  readonly _tag = 'HttpError' as const
  readonly status: number
  readonly statusText: string
  readonly data: E
  readonly request: { readonly method: string; readonly url: string }

  constructor(config: {
    status: number
    statusText: string
    data: E
    method: string
    url: string
  }) {
    super(`HTTP ${config.status} ${config.statusText}: ${config.method} ${config.url}`)
    this.name = 'HttpError'
    this.status = config.status
    this.statusText = config.statusText
    this.data = config.data
    this.request = { method: config.method, url: config.url }
  }
}
