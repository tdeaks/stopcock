import { defineRepository } from '@stopcock/server'
import { eq } from 'drizzle-orm'
import { attachments } from '../../../db/schema'
import type { Db } from '../../../db/client'
import type { CreateAttachmentInput } from './attachment.schema'

export const makeAttachmentsRepo = defineRepository('attachments', ({ db }: { db: Db }) => ({
  list: (issueId: string) => db.select().from(attachments).where(eq(attachments.issueId, issueId)),
  create: async (issueId: string, input: CreateAttachmentInput) => {
    const [a] = await db.insert(attachments).values({ issueId, ...input }).returning()
    return a!
  },
}))

export type AttachmentsRepo = ReturnType<typeof makeAttachmentsRepo>
