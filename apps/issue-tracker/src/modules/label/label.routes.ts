import { route, defineRoutes } from '@stopcock/server'
import { withBody } from '../../middleware/with-body'
import type { makeWithAuth } from '../../middleware/auth'
import type { makeAuthz } from '../../middleware/authz'
import type { LabelsController } from './label.controller'
import { parseCreate } from './label.schema'

export type LabelsRoutesDeps = {
  controller: LabelsController
  withAuth: ReturnType<typeof makeWithAuth>
  authz: ReturnType<typeof makeAuthz>
}

export const labelsRoutes = defineRoutes('label', ({ controller, withAuth, authz }: LabelsRoutesDeps) => [

  route.get('/workspaces/:ws/teams/:team/labels')
    .handler((ctx) => controller.list(ctx.params.ws, ctx.params.team)),

  route.post('/workspaces/:ws/teams/:team/labels')
    .use(withAuth)
    .use(authz('write'))
    .use(withBody(parseCreate))
    .handler((ctx) => controller.create(ctx.params.ws, ctx.params.team, ctx.body)),

  route.delete('/workspaces/:ws/teams/:team/labels/:id')
    .use(withAuth)
    .use(authz('write'))
    .handler((ctx) => controller.remove(ctx.params.ws, ctx.params.team, ctx.params.id)),

])
