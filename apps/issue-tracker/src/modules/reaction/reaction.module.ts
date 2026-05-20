import { defineModule } from '@stopcock/server'
import { DbModule } from '../../infra/db.module'
import { WorkspaceModule, type WorkspacesService } from '../workspace/workspace.module'
import { TeamModule, type TeamsService } from '../team/team.module'
import { IssueModule, type IssuesService } from '../issue/issue.module'
import { CommentModule } from '../comment/comment.module'
import { UserModule, type UsersService } from '../user/user.module'
import type { CommentsService } from '../comment/comment.service'
import type { Db } from '../../../db/client'
import { makeWithAuth } from '../../middleware/auth'
import { makeAuthz } from '../../middleware/authz'
import { makeReactionsRepo } from './reaction.repo'
import { makeReactionsService, type ReactionsService } from './reaction.service'
import { makeReactionsController } from './reaction.controller'
import { reactionRoutes } from './reaction.routes'

export type { ReactionsService } from './reaction.service'

type Deps = {
  reactions: ReactionsService
  workspaces: WorkspacesService
  teams: TeamsService
  issues: IssuesService
  comments: CommentsService
  users: UsersService
  db: Db
}

export const ReactionModule = defineModule({
  name: 'reaction',
  imports: [DbModule, WorkspaceModule, TeamModule, IssueModule, CommentModule, UserModule],
  provides: ({ db }) => ({ reactions: makeReactionsService({ repo: makeReactionsRepo({ db }) }) }),
  routes: ({ reactions, workspaces, teams, issues, comments, db }: Deps) => reactionRoutes({
    controller: makeReactionsController({ reactions }),
    workspaces, teams, issues, comments,
    withAuth: makeWithAuth({ db }),
    authz: makeAuthz({ db }),
  }),
})
