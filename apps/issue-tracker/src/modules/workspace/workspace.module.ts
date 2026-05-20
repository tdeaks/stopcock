import { defineModule } from '@stopcock/server'
import { DbModule } from '../../infra/db.module'
import { makeWithAuth } from '../../middleware/auth'
import { makeAuthz } from '../../middleware/authz'
import { makeWorkspacesRepo } from './workspace.repo'
import { makeWorkspacesService } from './workspace.service'
import { makeWorkspacesController } from './workspace.controller'
import { workspacesRoutes } from './workspace.routes'

export type { WorkspacesService } from './workspace.service'

export const WorkspaceModule = defineModule({
  name: 'workspace',
  imports: [DbModule],
  provides: ({ db }) => ({ workspaces: makeWorkspacesService({ repo: makeWorkspacesRepo({ db }) }) }),
  routes: ({ workspaces, db }) => workspacesRoutes({
    controller: makeWorkspacesController({ workspaces }),
    withAuth: makeWithAuth({ db }),
    authz: makeAuthz({ db }),
  }),
})
