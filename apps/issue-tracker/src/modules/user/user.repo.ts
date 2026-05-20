import { defineRepository } from '@stopcock/server'
import { eq } from 'drizzle-orm'
import { users } from '../../../db/schema'
import type { Db } from '../../../db/client'
import { NotFound } from '../../errors/domain'

export const makeUsersRepo = defineRepository('users', ({ db }: { db: Db }) => ({
  list: () => db.select().from(users),
  findById: async (id: string) => {
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!u) throw new NotFound('user', id)
    return u
  },
}))

export type UsersRepo = ReturnType<typeof makeUsersRepo>
