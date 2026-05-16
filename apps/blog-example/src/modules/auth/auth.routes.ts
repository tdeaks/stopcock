import { route, defineRoutes } from '@stopcock/server'
import { withBody } from '../../middleware/with-body'
import { parseLogin } from './auth.schema'
import type { AuthController } from './auth.controller'

export type AuthRoutesDeps = { controller: AuthController }

export const authRoutes = defineRoutes('auth', ({ controller }: AuthRoutesDeps) => [

  route.post('/auth/login')
    .use(withBody(parseLogin))
    .handler((ctx) => controller.login(ctx.body)),

])
