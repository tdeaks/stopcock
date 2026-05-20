import { defineModule } from '@stopcock/server'
import { DbModule } from '../../infra/db.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { makeWithAuth } from '../../middleware/auth'
import { makeAuthz } from '../../middleware/authz'
import { makeTeamsRepo } from './team.repo'
import { makeTeamsService } from './team.service'
import { makeTeamsController } from './team.controller'
import { teamsRoutes } from './team.routes'

export type { TeamsService } from './team.service'

export const TeamModule = defineModule({
  name: 'team',
  imports: [DbModule, WorkspaceModule],
  provides: ({ db }) => ({ teams: makeTeamsService({ repo: makeTeamsRepo({ db }) }) }),
  routes: ({ teams, workspaces, db }) => teamsRoutes({
    controller: makeTeamsController({ teams, workspaces }),
    withAuth: makeWithAuth({ db }),
    authz: makeAuthz({ db }),
  }),
})
