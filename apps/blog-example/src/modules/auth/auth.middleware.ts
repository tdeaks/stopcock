/**
 * Auth middleware. Lives with the auth feature; depends on the AuthService
 * (not directly on db). Construct it where you need it:
 *
 *   import { makeWithAuth } from '../../modules/auth/auth.middleware'
 *   const withAuth = makeWithAuth({ auth })
 *
 * The middleware itself does no business logic — it just adapts ctx into
 * a service call. AuthService.lookupToken holds the real logic.
 */
import { defineMiddleware } from '@stopcock/server'
import { Unauthorized } from '../../errors/domain'
import type { AuthService } from './auth.service'

export const makeWithAuth = (deps: { auth: AuthService }) =>
  defineMiddleware<{ userId: string }, Unauthorized>(async (ctx) => {
    const header = ctx.request.headers.get('authorization')
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) throw new Unauthorized()
    const userId = deps.auth.lookupToken(token)
    if (!userId) throw new Unauthorized()
    return { userId }
  })
