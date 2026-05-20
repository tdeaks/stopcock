import { defineController } from '@stopcock/server'
import type { AttachmentsService } from './attachment.service'
import type { CreateAttachmentInput } from './attachment.schema'

export const makeAttachmentsController = defineController('attachments', ({ attachments }: { attachments: AttachmentsService }) => ({
  list:   (issueId: string) => attachments.list(issueId),
  create: (issueId: string, input: CreateAttachmentInput) => attachments.create(issueId, input),
}))

export type AttachmentsController = ReturnType<typeof makeAttachmentsController>
