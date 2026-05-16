/**
 * Posts route declarations. Each route is one line of:
 *   path + middleware + which controller method handles it.
 *
 * Routes don't contain business logic — they translate HTTP context into
 * controller calls. Open this file to add a route; open posts.controller.ts
 * to change what a route does.
 */
import { route, defineRoutes } from '@stopcock/server'
import type { Middleware } from '@stopcock/server'
import type { DomainError } from '../../errors/domain'
import { withBody } from '../../middleware/with-body'
import { parseCreatePost } from './posts.schema'
import type { PostsController } from './posts.controller'

export type PostsRoutesDeps = {
  controller: PostsController
  withAuth: Middleware<{ userId: string }, DomainError>
}

export const postsRoutes = defineRoutes('posts', ({ controller, withAuth }: PostsRoutesDeps) => [

  route.get('/posts')
    .handler(() => controller.list()),

  route.get('/posts/:id')
    .handler((ctx) => controller.find(ctx.params.id)),

  route.post('/posts')
    .use(withAuth)
    .use(withBody(parseCreatePost))
    .handler((ctx) => controller.create(ctx.userId, ctx.body)),

])
