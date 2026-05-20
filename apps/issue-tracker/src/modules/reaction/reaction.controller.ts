import { defineController } from '@stopcock/server'
import type { ReactionsService } from './reaction.service'
import type { AddReactionInput } from './reaction.schema'

export const makeReactionsController = defineController('reactions', ({ reactions }: { reactions: ReactionsService }) => ({
  list:   (commentId: string) => reactions.list(commentId),
  add:    (commentId: string, input: AddReactionInput) => reactions.add(commentId, input),
  remove: (commentId: string, userId: string, emoji: string) => reactions.remove(commentId, userId, emoji),
}))

export type ReactionsController = ReturnType<typeof makeReactionsController>
