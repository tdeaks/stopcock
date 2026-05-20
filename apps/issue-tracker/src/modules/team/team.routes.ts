import { route, defineRoutes } from '@stopcock/server'
import { withBody } from '../../middleware/with-body'
import type { makeWithAuth } from '../../middleware/auth'
import type { makeAuthz } from '../../middleware/authz'
import type { TeamsController } from './team.controller'
import { parseCreate } from './team.schema'

export type TeamsRoutesDeps = {
  controller: TeamsController
  withAuth: ReturnType<typeof makeWithAuth>
  authz: ReturnType<typeof makeAuthz>
}

export const teamsRoutes = defineRoutes('team', ({ controller, withAuth, authz }: TeamsRoutesDeps) => [

  route.get('/workspaces/:ws/teams')
    .handler((ctx) => controller.list(ctx.params.ws)),

  route.post('/workspaces/:ws/teams')
    .use(withAuth)
    .use(authz('write'))
    .use(withBody(parseCreate))
    .handler((ctx) => controller.create(ctx.params.ws, ctx.body)),

  route.get('/workspaces/:ws/teams/:team')
    .handler((ctx) => controller.find(ctx.params.ws, ctx.params.team)),

  route.get('/workspaces/:ws/teams/:team/members')
    .handler((ctx) => controller.members(ctx.params.ws, ctx.params.team)),

])
