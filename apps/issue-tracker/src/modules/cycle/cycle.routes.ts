import { route, defineRoutes } from '@stopcock/server'
import type { CyclesController } from './cycle.controller'
import type { WorkspacesService } from '../workspace/workspace.module'
import type { TeamsService } from '../team/team.module'

export type CyclesRoutesDeps = {
  controller: CyclesController
  workspaces: WorkspacesService
  teams: TeamsService
}

export const cyclesRoutes = defineRoutes('cycle', ({ controller, workspaces, teams }: CyclesRoutesDeps) => [

  route.get('/workspaces/:ws/teams/:team/cycles').handler(async (ctx) => {
    const w = await workspaces.find(ctx.params.ws)
    const t = await teams.find(w.id, ctx.params.team)
    return controller.list(t.id)
  }),

  route.get('/workspaces/:ws/teams/:team/cycles/current').handler(async (ctx) => {
    const w = await workspaces.find(ctx.params.ws)
    const t = await teams.find(w.id, ctx.params.team)
    return controller.current(t.id)
  }),

  route.get('/workspaces/:ws/teams/:team/cycles/:number').handler(async (ctx) => {
    const w = await workspaces.find(ctx.params.ws)
    const t = await teams.find(w.id, ctx.params.team)
    return controller.find(t.id, Number(ctx.params.number))
  }),

])
