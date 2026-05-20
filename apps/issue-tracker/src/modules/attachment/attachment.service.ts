import { defineService } from '@stopcock/server'
import type { AttachmentsRepo } from './attachment.repo'
import type { CreateAttachmentInput } from './attachment.schema'

export const makeAttachmentsService = defineService(
  'attachments',
  ({ repo }: { repo: AttachmentsRepo }) => ({
    list:   (issueId: string) => repo.list(issueId),
    create: (issueId: string, input: CreateAttachmentInput) => repo.create(issueId, input),
  }),
)

export type AttachmentsService = ReturnType<typeof makeAttachmentsService>
