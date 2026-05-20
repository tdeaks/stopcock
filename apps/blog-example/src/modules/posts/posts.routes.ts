/**
 * Posts route declarations. Each route is one line of:
 *   path + middleware + which controller method handles it.
 *
 * Routes don't contain business logic — they translate HTTP context into
 * controller calls. Open this file to add a route; open posts.controller.ts
 * to change what a route does.
 */
import { route, defineRoutes } from '@stopcock/server'
import type { RoutePlugin } from '@stopcock/server'
import { openapiMeta } from '@stopcock/server/openapi'
import { withBody } from '../../middleware/with-body'
import { parseCreatePost } from './posts.schema'
import type { PostsController } from './posts.controller'

export type PostsRoutesDeps = {
  controller: PostsController
  withAuth: RoutePlugin<{ auth: { userId: string }; token: string }, unknown>
}

export const postsRoutes = defineRoutes('posts', ({ controller, withAuth }: PostsRoutesDeps) => [

  route.get('/posts')
    .handler(() => controller.list()),

  route.get('/posts/:id')
    .handler((ctx) => controller.find(ctx.params.id)),

  route.post('/posts')
    .meta(openapiMeta({
      summary: 'Create post',
      tags: ['Posts'],
      responses: { 200: { description: 'Created post' } },
    }))
    .use(withAuth)
    .use(withBody(parseCreatePost))
    .handler((ctx) => controller.create(ctx.auth.userId, ctx.body)),

])
