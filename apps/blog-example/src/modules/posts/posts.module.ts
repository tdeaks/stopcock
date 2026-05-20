import { defineModule } from '@stopcock/server'
import { bearer } from '@stopcock/server/bearer'
import { DbModule } from '../../infra/db.module'
import { AuthModule } from '../auth/auth.module'
import { makePostsRepo } from './posts.repo'
import { makePostsService } from './posts.service'
import { makePostsController } from './posts.controller'
import { postsRoutes } from './posts.routes'

/**
 * Posts feature module.
 *   provides:  `posts` (service) — other modules can call into it
 *   imports:   db (from DbModule), auth (from AuthModule)
 *   routes:    /posts, /posts/:id, POST /posts
 *
 * The auth middleware is constructed locally from the imported `auth`
 * service — it's an HTTP concern owned by the routes layer.
 */
export const PostsModule = defineModule({
  name: 'posts',
  imports: [DbModule, AuthModule],
  provides: ({ db }) => ({
    posts: makePostsService({ repo: makePostsRepo({ db }) }),
  }),
  routes: ({ posts, auth }) => postsRoutes({
    controller: makePostsController({ posts }),
    withAuth: bearer({
      verify: async (token) => {
        const userId = auth.lookupToken(token)
        return userId ? { userId } : null
      },
    }),
  }),
})
