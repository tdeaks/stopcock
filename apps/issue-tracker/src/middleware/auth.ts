import { defineMiddleware } from '@stopcock/server'
import { eq } from 'drizzle-orm'
import { users } from '../../db/schema'
import type { Db } from '../../db/client'
import { Unauthorized } from '../errors/domain'

export const makeWithAuth = (deps: { db: Db }) =>
  defineMiddleware<{ userId: string }, Unauthorized>(async (ctx) => {
    const header = ctx.request.headers.get('authorization')
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) throw new Unauthorized()
    const email = token
    const [user] = await deps.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (!user) throw new Unauthorized()
    return { userId: user.id }
  })
