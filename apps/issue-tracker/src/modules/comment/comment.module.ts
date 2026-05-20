import { defineModule } from '@stopcock/server'
import { DbModule } from '../../infra/db.module'
import { WorkspaceModule, type WorkspacesService } from '../workspace/workspace.module'
import { TeamModule, type TeamsService } from '../team/team.module'
import { IssueModule, type IssuesService } from '../issue/issue.module'
import { UserModule, type UsersService } from '../user/user.module'
import type { Db } from '../../../db/client'
import { makeWithAuth } from '../../middleware/auth'
import { makeAuthz } from '../../middleware/authz'
import { makeCommentsRepo } from './comment.repo'
import { makeCommentsService, type CommentsService } from './comment.service'
export type { CommentsService } from './comment.service'
import { makeCommentsController } from './comment.controller'
import { commentRoutes } from './comment.routes'

type Deps = {
  comments: CommentsService
  workspaces: WorkspacesService
  teams: TeamsService
  issues: IssuesService
  users: UsersService
  db: Db
}

export const CommentModule = defineModule({
  name: 'comment',
  imports: [DbModule, WorkspaceModule, TeamModule, IssueModule, UserModule],
  provides: ({ db }) => ({ comments: makeCommentsService({ repo: makeCommentsRepo({ db }) }) }),
  routes: ({ comments, workspaces, teams, issues, db }: Deps) => commentRoutes({
    controller: makeCommentsController({ comments }),
    workspaces, teams, issues,
    withAuth: makeWithAuth({ db }),
    authz: makeAuthz({ db }),
  }),
})
