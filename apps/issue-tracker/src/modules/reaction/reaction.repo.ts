import { defineRepository } from '@stopcock/server'
import { and, eq } from 'drizzle-orm'
import { reactions } from '../../../db/schema'
import type { Db } from '../../../db/client'
import type { AddReactionInput } from './reaction.schema'

export const makeReactionsRepo = defineRepository('reactions', ({ db }: { db: Db }) => ({
  list: (commentId: string) =>
    db.select().from(reactions).where(eq(reactions.commentId, commentId)),
  add: async (commentId: string, input: AddReactionInput) => {
    await db.insert(reactions).values({ commentId, userId: input.userId, emoji: input.emoji })
      .onConflictDoNothing()
  },
  remove: async (commentId: string, userId: string, emoji: string) => {
    await db.delete(reactions).where(and(
      eq(reactions.commentId, commentId),
      eq(reactions.userId, userId),
      eq(reactions.emoji, emoji),
    ))
  },
}))

export type ReactionsRepo = ReturnType<typeof makeReactionsRepo>
