import { defineModule } from '@stopcock/server'
import type { Db } from '../../../db/client'
import { DbModule } from '../../infra/db.module'
import { WorkspaceModule, type WorkspacesService } from '../workspace/workspace.module'
import { TeamModule, type TeamsService } from '../team/team.module'
import { makeWithAuth } from '../../middleware/auth'
import { makeAuthz } from '../../middleware/authz'
import { makeProjectsRepo } from './project.repo'
import { makeProjectsService, type ProjectsService } from './project.service'
import { makeProjectsController } from './project.controller'
import { projectsRoutes } from './project.routes'

export type { ProjectsService }

export const ProjectModule = defineModule({
  name: 'project',
  imports: [DbModule, WorkspaceModule, TeamModule],
  provides: ({ db }) => ({ projects: makeProjectsService({ repo: makeProjectsRepo({ db }) }) }),
  routes: ({ projects, workspaces, teams, db }: { projects: ProjectsService; workspaces: WorkspacesService; teams: TeamsService; db: Db }) =>
    projectsRoutes({
      controller: makeProjectsController({ projects }),
      workspaces,
      teams,
      withAuth: makeWithAuth({ db }),
      authz: makeAuthz({ db }),
    }),
})
