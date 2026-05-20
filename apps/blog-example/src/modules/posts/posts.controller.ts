/**
 * Posts controller. HTTP-aware shim between routes and services.
 *
 * Controllers take primitive args (id, userId, input). The route file
 * destructures ctx and forwards. Keeps controllers testable without HTTP
 * machinery and keeps services HTTP-agnostic.
 *
 * For trivial passthrough you might skip the controller; the convention
 * exists for the moment your route grows logic (HATEOAS shaping, status
 * code decisions, response envelopes, audit logging).
 */
import { defineController } from '@stopcock/server'
import type { PostsService } from './posts.service'
import type { CreatePostInput } from './posts.schema'

export const makePostsController = defineController('posts', ({ posts }: { posts: PostsService }) => ({
  list: () => posts.list(),
  find: (id: string) => posts.find(id),
  create: (userId: string, input: CreatePostInput) => posts.create(userId, input),
}))

export type PostsController = ReturnType<typeof makePostsController>
