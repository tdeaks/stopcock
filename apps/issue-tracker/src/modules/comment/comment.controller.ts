import { defineController } from '@stopcock/server'
import type { CommentsService } from './comment.service'
import type { CreateCommentInput } from './comment.schema'

export const makeCommentsController = defineController('comments', ({ comments }: { comments: CommentsService }) => ({
  list:   (issueId: string) => comments.list(issueId),
  find:   (id: string) => comments.find(id),
  create: (issueId: string, input: CreateCommentInput) => comments.create(issueId, input),
}))

export type CommentsController = ReturnType<typeof makeCommentsController>
