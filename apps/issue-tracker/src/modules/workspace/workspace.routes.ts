import { route, defineRoutes } from '@stopcock/server'
import { withBody } from '../../middleware/with-body'
import type { makeWithAuth } from '../../middleware/auth'
import type { makeAuthz } from '../../middleware/authz'
import type { WorkspacesController } from './workspace.controller'
import { parseCreate, parseAddMember } from './workspace.schema'

export type WorkspacesRoutesDeps = {
  controller: WorkspacesController
  withAuth: ReturnType<typeof makeWithAuth>
  authz: ReturnType<typeof makeAuthz>
}

export const workspacesRoutes = defineRoutes('workspace', ({ controller, withAuth, authz }: WorkspacesRoutesDeps) => [

  route.get('/workspaces')
    .handler(() => controller.list()),

  route.post('/workspaces')
    .use(withBody(parseCreate))
    .handler((ctx) => controller.create(ctx.body)),

  route.get('/workspaces/:ws')
    .handler((ctx) => controller.find(ctx.params.ws)),

  route.get('/workspaces/:ws/members')
    .handler((ctx) => controller.members(ctx.params.ws)),

  route.post('/workspaces/:ws/members')
    .use(withAuth)
    .use(authz('write'))
    .use(withBody(parseAddMember))
    .handler((ctx) => controller.addMember(ctx.params.ws, ctx.body.userId, ctx.body.role ?? 'member')),

  route.delete('/workspaces/:ws/members/:userId')
    .use(withAuth)
    .use(authz('write'))
    .handler((ctx) => controller.removeMember(ctx.params.ws, ctx.params.userId)),

])
