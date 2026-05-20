import type { Task } from '@stopcock/async'

export type Ctx<P = Record<string, string>> = {
  request: Request
  params: P
}

/**
 * Optional direct-call shortcut on a Handler. When present, the dispatch path
 * uses this to skip Task wrapper allocation per request. Composed middleware
 * propagates it automatically; user code shouldn't need to set it.
 */
export type DirectCall<C, R> = (ctx: C, signal?: AbortSignal) => Promise<R> | R

export type Handler<C, R, E> = ((ctx: C) => Task<R, E>) & {
  readonly __direct?: DirectCall<C, R>
}
