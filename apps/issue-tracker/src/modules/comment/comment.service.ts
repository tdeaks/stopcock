import { defineService } from '@stopcock/server'
import type { CommentsRepo } from './comment.repo'
import type { CreateCommentInput } from './comment.schema'

export const makeCommentsService = defineService(
  'comments',
  ({ repo }: { repo: CommentsRepo }) => ({
    list:   (issueId: string) => repo.list(issueId),
    find:   (id: string) => repo.byId(id),
    create: (issueId: string, input: CreateCommentInput) => repo.create(issueId, input),
  }),
)

export type CommentsService = ReturnType<typeof makeCommentsService>
