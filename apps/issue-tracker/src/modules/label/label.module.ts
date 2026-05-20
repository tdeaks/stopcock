import { defineModule } from '@stopcock/server'
import { DbModule } from '../../infra/db.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { TeamModule } from '../team/team.module'
import { makeWithAuth } from '../../middleware/auth'
import { makeAuthz } from '../../middleware/authz'
import { makeLabelsRepo } from './label.repo'
import { makeLabelsService } from './label.service'
import { makeLabelsController } from './label.controller'
import { labelsRoutes } from './label.routes'

export type { LabelsService } from './label.service'

export const LabelModule = defineModule({
  name: 'label',
  imports: [DbModule, WorkspaceModule, TeamModule],
  provides: ({ db }) => ({ labels: makeLabelsService({ repo: makeLabelsRepo({ db }) }) }),
  routes: ({ labels, workspaces, teams, db }) => labelsRoutes({
    controller: makeLabelsController({ labels, workspaces, teams }),
    withAuth: makeWithAuth({ db }),
    authz: makeAuthz({ db }),
  }),
})
