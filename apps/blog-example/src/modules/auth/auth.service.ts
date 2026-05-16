import { defineService } from '@stopcock/server'
import type { Db } from '../../infra/db'
import type { LoginInput, LoginOutput } from './auth.schema'
import { Unauthorized } from '../../errors/domain'

export const makeAuthService = defineService('auth', ({ db }: { db: Db }) => ({
  login: ({ email, password }: LoginInput): LoginOutput => {
    const user = Array.from(db.users.values()).find((u) => u.email === email)
    if (!user || user.password !== password) throw new Unauthorized()
    const token = `t-${user.id}-${Math.random().toString(36).slice(2, 10)}`
    db.tokens.set(token, user.id)
    return { token }
  },

  lookupToken: (token: string): string | null => db.tokens.get(token) ?? null,
}))

export type AuthService = ReturnType<typeof makeAuthService>
