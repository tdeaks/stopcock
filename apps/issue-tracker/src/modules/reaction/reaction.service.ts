import { defineService } from '@stopcock/server'
import type { ReactionsRepo } from './reaction.repo'
import type { AddReactionInput } from './reaction.schema'

export const makeReactionsService = defineService(
  'reactions',
  ({ repo }: { repo: ReactionsRepo }) => ({
    list:   (commentId: string) => repo.list(commentId),
    add:    (commentId: string, input: AddReactionInput) => repo.add(commentId, input),
    remove: (commentId: string, userId: string, emoji: string) => repo.remove(commentId, userId, emoji),
  }),
)

export type ReactionsService = ReturnType<typeof makeReactionsService>
