import { defineRepository } from '@stopcock/server'
import { asc, eq } from 'drizzle-orm'
import { comments } from '../../../db/schema'
import type { Db } from '../../../db/client'
import { NotFound } from '../../errors/domain'
import type { CreateCommentInput } from './comment.schema'

export const makeCommentsRepo = defineRepository('comments', ({ db }: { db: Db }) => ({
  list: (issueId: string) =>
    db.select().from(comments).where(eq(comments.issueId, issueId)).orderBy(asc(comments.createdAt)),
  byId: async (id: string) => {
    const [c] = await db.select().from(comments).where(eq(comments.id, id)).limit(1)
    if (!c) throw new NotFound('comment', id)
    return c
  },
  create: async (issueId: string, input: CreateCommentInput) => {
    const [c] = await db.insert(comments).values({
      issueId, authorId: input.authorId, body: input.body,
      parentCommentId: input.parentCommentId ?? null,
    }).returning()
    return c!
  },
}))

export type CommentsRepo = ReturnType<typeof makeCommentsRepo>
