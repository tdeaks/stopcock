/**
 * Posts service. Pure business logic. Repos passed in; nothing framework-specific.
 * Direct callable from tests, scripts, queue workers — no HTTP context required.
 */
import { defineService } from '@stopcock/server'
import type { PostsRepo } from './posts.repo'
import type { CreatePostInput, Post } from './posts.schema'

export const makePostsService = defineService(
  'posts',
  ({ repo }: { repo: PostsRepo }) => ({
    list: (): Post[] => repo.list(),

    find: (id: string): Post => repo.findById(id),

    create: (authorId: string, input: CreatePostInput): Post =>
      repo.create(authorId, input),}
  )
)

export type PostsService = ReturnType<typeof makePostsService>
