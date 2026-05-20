import { route, defineRoutes } from '@stopcock/server'
import { withBody } from '../../middleware/with-body'
import { parseCreate, parsePatch } from './issue.schema'
import type { IssuesController } from './issue.controller'
import type { WorkspacesService } from '../workspace/workspace.module'
import type { TeamsService } from '../team/team.module'
import type { ProjectsService } from '../project/project.module'
import type { makeWithAuth } from '../../middleware/auth'
import type { makeAuthz } from '../../middleware/authz'

export type IssuesRoutesDeps = {
  controller: IssuesController
  workspaces: WorkspacesService
  teams: TeamsService
  projects: ProjectsService
  withAuth: ReturnType<typeof makeWithAuth>
  authz: ReturnType<typeof makeAuthz>
}

export const issuesRoutes = defineRoutes('issue', ({ controller, workspaces, teams, projects, withAuth, authz }: IssuesRoutesDeps) => [

  route.get('/workspaces/:ws/teams/:team/projects/:project/issues').handler(async (ctx) => {
    const w = await workspaces.find(ctx.params.ws)
    const t = await teams.find(w.id, ctx.params.team)
    const p = await projects.find(t.id, ctx.params.project)
    return controller.list(p.id)
  }),

  route.post('/workspaces/:ws/teams/:team/projects/:project/issues')
    .use(withAuth).use(authz('write'))
    .use(withBody(parseCreate))
    .handler(async (ctx) => {
      const w = await workspaces.find(ctx.params.ws)
      const t = await teams.find(w.id, ctx.params.team)
      const p = await projects.find(t.id, ctx.params.project)
      return controller.create(t.id, p.id, ctx.body.creatorId, ctx.body)
    }),

  route.get('/workspaces/:ws/teams/:team/projects/:project/issues/:issue').handler(async (ctx) => {
    const w = await workspaces.find(ctx.params.ws)
    const t = await teams.find(w.id, ctx.params.team)
    return controller.find(t.id, Number(ctx.params.issue))
  }),

  route.patch('/workspaces/:ws/teams/:team/projects/:project/issues/:issue')
    .use(withAuth).use(authz('write'))
    .use(withBody(parsePatch))
    .handler(async (ctx) => {
      const w = await workspaces.find(ctx.params.ws)
      const t = await teams.find(w.id, ctx.params.team)
      const iss = await controller.find(t.id, Number(ctx.params.issue))
      return controller.patch(iss.id, ctx.body)
    }),

  route.get('/workspaces/:ws/teams/:team/projects/:project/issues/:issue/children').handler(async (ctx) => {
    const w = await workspaces.find(ctx.params.ws)
    const t = await teams.find(w.id, ctx.params.team)
    const iss = await controller.find(t.id, Number(ctx.params.issue))
    return controller.children(iss.id)
  }),

  route.get('/workspaces/:ws/teams/:team/projects/:project/issues/:issue/labels').handler(async (ctx) => {
    const w = await workspaces.find(ctx.params.ws)
    const t = await teams.find(w.id, ctx.params.team)
    const iss = await controller.find(t.id, Number(ctx.params.issue))
    return controller.labels(iss.id)
  }),

  route.post('/workspaces/:ws/teams/:team/projects/:project/issues/:issue/labels/:labelId')
    .use(withAuth).use(authz('write'))
    .handler(async (ctx) => {
      const w = await workspaces.find(ctx.params.ws)
      const t = await teams.find(w.id, ctx.params.team)
      const iss = await controller.find(t.id, Number(ctx.params.issue))
      await controller.attachLabel(iss.id, ctx.params.labelId)
      return { ok: true }
    }),

  route.delete('/workspaces/:ws/teams/:team/projects/:project/issues/:issue/labels/:labelId')
    .use(withAuth).use(authz('write'))
    .handler(async (ctx) => {
      const w = await workspaces.find(ctx.params.ws)
      const t = await teams.find(w.id, ctx.params.team)
      const iss = await controller.find(t.id, Number(ctx.params.issue))
      await controller.detachLabel(iss.id, ctx.params.labelId)
      return { ok: true }
    }),

])
