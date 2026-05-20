import { route, defineRoutes } from '@stopcock/server'
import { withBody } from '../../middleware/with-body'
import { parseCreate } from './project.schema'
import type { ProjectsController } from './project.controller'
import type { WorkspacesService } from '../workspace/workspace.module'
import type { TeamsService } from '../team/team.module'
import type { makeWithAuth } from '../../middleware/auth'
import type { makeAuthz } from '../../middleware/authz'

export type ProjectsRoutesDeps = {
  controller: ProjectsController
  workspaces: WorkspacesService
  teams: TeamsService
  withAuth: ReturnType<typeof makeWithAuth>
  authz: ReturnType<typeof makeAuthz>
}

export const projectsRoutes = defineRoutes('project', ({ controller, workspaces, teams, withAuth, authz }: ProjectsRoutesDeps) => [

  route.get('/workspaces/:ws/teams/:team/projects').handler(async (ctx) => {
    const w = await workspaces.find(ctx.params.ws)
    const t = await teams.find(w.id, ctx.params.team)
    return controller.list(t.id)
  }),

  route.post('/workspaces/:ws/teams/:team/projects')
    .use(withAuth).use(authz('write'))
    .use(withBody(parseCreate))
    .handler(async (ctx) => {
      const w = await workspaces.find(ctx.params.ws)
      const t = await teams.find(w.id, ctx.params.team)
      return controller.create(t.id, ctx.body)
    }),

  route.get('/workspaces/:ws/teams/:team/projects/:project').handler(async (ctx) => {
    const w = await workspaces.find(ctx.params.ws)
    const t = await teams.find(w.id, ctx.params.team)
    return controller.find(t.id, ctx.params.project)
  }),

])
