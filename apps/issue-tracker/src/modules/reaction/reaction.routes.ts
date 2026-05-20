import { route, defineRoutes } from '@stopcock/server'
import { withBody } from '../../middleware/with-body'
import { parseAdd } from './reaction.schema'
import type { ReactionsController } from './reaction.controller'
import type { WorkspacesService } from '../workspace/workspace.module'
import type { TeamsService } from '../team/team.module'
import type { IssuesService } from '../issue/issue.module'
import type { CommentsService } from '../comment/comment.service'
import type { makeWithAuth } from '../../middleware/auth'
import type { makeAuthz } from '../../middleware/authz'

export type ReactionRoutesDeps = {
  controller: ReactionsController
  workspaces: WorkspacesService
  teams: TeamsService
  issues: IssuesService
  comments: CommentsService
  withAuth: ReturnType<typeof makeWithAuth>
  authz: ReturnType<typeof makeAuthz>
}

export const reactionRoutes = defineRoutes('reaction', ({ controller, workspaces, teams, issues, comments, withAuth, authz }: ReactionRoutesDeps) => [

  route.get('/workspaces/:ws/teams/:team/projects/:project/issues/:issue/comments/:comment/reactions')
    .handler(async (ctx) => {
      const w = await workspaces.find(ctx.params.ws)
      const t = await teams.find(w.id, ctx.params.team)
      await issues.find(t.id, Number(ctx.params.issue))
      const c = await comments.find(ctx.params.comment)
      return controller.list(c.id)
    }),

  route.post('/workspaces/:ws/teams/:team/projects/:project/issues/:issue/comments/:comment/reactions')
    .use(withAuth).use(authz('write'))
    .use(withBody(parseAdd))
    .handler(async (ctx) => {
      const c = await comments.find(ctx.params.comment)
      await controller.add(c.id, ctx.body)
      return { ok: true }
    }),

  route.delete('/workspaces/:ws/teams/:team/projects/:project/issues/:issue/comments/:comment/reactions/:userId/:emoji')
    .use(withAuth).use(authz('write'))
    .handler(async (ctx) => {
      const c = await comments.find(ctx.params.comment)
      await controller.remove(c.id, ctx.params.userId, decodeURIComponent(ctx.params.emoji))
      return { ok: true }
    }),

])
