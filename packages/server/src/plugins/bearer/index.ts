import { defineMiddleware } from '../../middleware/define'
import { defineRoutePlugin } from '../../plugin'
import type { Middleware } from '../../middleware/define'
import type { RoutePlugin } from '../../plugin'
import type { Ctx } from '../../router/types'

export const AUTH_META_KEY = 'stopcock.auth' as const

export type AuthMeta = {
  readonly type: 'bearer'
}

export type UnauthorizedReason = 'missing' | 'malformed' | 'invalid'

export class Unauthorized extends Error {
  readonly _tag = 'Unauthorized' as const
  readonly status = 401

  constructor(
    readonly reason: UnauthorizedReason = 'missing',
    readonly cause?: unknown,
  ) {
    super(messageFor(reason))
    this.name = 'Unauthorized'
  }
}

export type BearerProvides<Auth extends object> = {
  readonly auth: Auth
  readonly token: string
}

export type VerifyResult<Auth extends object> = Auth | false | null | undefined

export type BearerVerify<Auth extends object, C extends Ctx = Ctx> =
  (token: string, ctx: C) => VerifyResult<Auth> | Promise<VerifyResult<Auth>>

export type BearerOptions<Auth extends object, C extends Ctx = Ctx> = {
  readonly verify: BearerVerify<Auth, C>
}

export type BearerPlugin<Auth extends object> =
  RoutePlugin<BearerProvides<Auth>, Unauthorized> & {
    readonly name: 'bearer'
    readonly middleware: Middleware<BearerProvides<Auth>, Unauthorized>
    readonly meta: { readonly [AUTH_META_KEY]: AuthMeta }
  }

const meta = { [AUTH_META_KEY]: { type: 'bearer' as const } }

const messageFor = (reason: UnauthorizedReason): string => {
  switch (reason) {
    case 'missing': return 'missing bearer token'
    case 'malformed': return 'malformed authorization header'
    case 'invalid': return 'invalid bearer token'
  }
}

const parseBearer = (header: string | null): string => {
  if (!header || !header.trim()) throw new Unauthorized('missing')

  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  if (!token) throw new Unauthorized('malformed')
  return token
}

export function bearer<Auth extends object>(
  verify: BearerVerify<Auth>,
): BearerPlugin<Auth>
export function bearer<Auth extends object>(
  options: BearerOptions<Auth>,
): BearerPlugin<Auth>
export function bearer<Auth extends object>(
  input: BearerOptions<Auth> | BearerVerify<Auth>,
): BearerPlugin<Auth> {
  const verify = typeof input === 'function' ? input : input.verify
  const middleware = defineMiddleware<BearerProvides<Auth>, Unauthorized>(async (ctx) => {
    const token = parseBearer(ctx.request.headers.get('authorization'))
    const auth = await verify(token, ctx)
    if (!auth) throw new Unauthorized('invalid')
    return { auth, token }
  })

  return defineRoutePlugin({
    name: 'bearer',
    middleware,
    meta,
  }) as BearerPlugin<Auth>
}
