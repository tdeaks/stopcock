import type { Task } from '@stopcock/async'

export type Ctx<P = Record<string, string>> = {
  request: Request
  params: P
}

export type Handler<C, R, E> = (ctx: C) => Task<R, E>
