import { defineModule } from '@stopcock/server'
import type { Db } from '../../../db/client'
import { DbModule } from '../../infra/db.module'
import { WorkspaceModule, type WorkspacesService } from '../workspace/workspace.module'
import { TeamModule, type TeamsService } from '../team/team.module'
import { ProjectModule, type ProjectsService } from '../project/project.module'
import { LabelModule } from '../label/label.module'
import { CycleModule } from '../cycle/cycle.module'
import { UserModule } from '../user/user.module'
import { makeWithAuth } from '../../middleware/auth'
import { makeAuthz } from '../../middleware/authz'
import { makeIssuesRepo } from './issue.repo'
import { makeIssuesService, type IssuesService } from './issue.service'
import { makeIssuesController } from './issue.controller'
import { issuesRoutes } from './issue.routes'

export type { IssuesService }

type Deps = {
  issues: IssuesService
  workspaces: WorkspacesService
  teams: TeamsService
  projects: ProjectsService
  db: Db
}

export const IssueModule = defineModule({
  name: 'issue',
  imports: [DbModule, WorkspaceModule, TeamModule, ProjectModule, LabelModule, CycleModule, UserModule],
  provides: ({ db }) => ({ issues: makeIssuesService({ db, repo: makeIssuesRepo({ db }) }) }),
  routes: ({ issues, workspaces, teams, projects, db }: Deps) =>
    issuesRoutes({
      controller: makeIssuesController({ issues }),
      workspaces,
      teams,
      projects,
      withAuth: makeWithAuth({ db }),
      authz: makeAuthz({ db }),
    }),
})
