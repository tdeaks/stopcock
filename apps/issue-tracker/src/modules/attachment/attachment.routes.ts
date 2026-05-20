import { route, defineRoutes } from '@stopcock/server'
import { withBody } from '../../middleware/with-body'
import { parseCreate } from './attachment.schema'
import type { AttachmentsController } from './attachment.controller'
import type { WorkspacesService } from '../workspace/workspace.module'
import type { TeamsService } from '../team/team.module'
import type { IssuesService } from '../issue/issue.module'
import type { makeWithAuth } from '../../middleware/auth'
import type { makeAuthz } from '../../middleware/authz'

export type AttachmentRoutesDeps = {
  controller: AttachmentsController
  workspaces: WorkspacesService
  teams: TeamsService
  issues: IssuesService
  withAuth: ReturnType<typeof makeWithAuth>
  authz: ReturnType<typeof makeAuthz>
}

export const attachmentRoutes = defineRoutes('attachment', ({ controller, workspaces, teams, issues, withAuth, authz }: AttachmentRoutesDeps) => [

  route.get('/workspaces/:ws/teams/:team/projects/:project/issues/:issue/attachments').handler(async (ctx) => {
    const w = await workspaces.find(ctx.params.ws)
    const t = await teams.find(w.id, ctx.params.team)
    const iss = await issues.find(t.id, Number(ctx.params.issue))
    return controller.list(iss.id)
  }),

  route.post('/workspaces/:ws/teams/:team/projects/:project/issues/:issue/attachments')
    .use(withAuth).use(authz('write'))
    .use(withBody(parseCreate))
    .handler(async (ctx) => {
      const w = await workspaces.find(ctx.params.ws)
      const t = await teams.find(w.id, ctx.params.team)
      const iss = await issues.find(t.id, Number(ctx.params.issue))
      return controller.create(iss.id, ctx.body)
    }),

])
