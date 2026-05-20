import { defineModule } from '@stopcock/server'
import { DbModule } from '../../infra/db.module'
import { WorkspaceModule, type WorkspacesService } from '../workspace/workspace.module'
import { TeamModule, type TeamsService } from '../team/team.module'
import { makeCyclesRepo } from './cycle.repo'
import { makeCyclesService, type CyclesService } from './cycle.service'
import { makeCyclesController } from './cycle.controller'
import { cyclesRoutes } from './cycle.routes'

export type { CyclesService }

export const CycleModule = defineModule({
  name: 'cycle',
  imports: [DbModule, WorkspaceModule, TeamModule],
  provides: ({ db }) => ({ cycles: makeCyclesService({ repo: makeCyclesRepo({ db }) }) }),
  routes: ({ cycles, workspaces, teams }: { cycles: CyclesService; workspaces: WorkspacesService; teams: TeamsService }) =>
    cyclesRoutes({
      controller: makeCyclesController({ cycles }),
      workspaces,
      teams,
    }),
})
