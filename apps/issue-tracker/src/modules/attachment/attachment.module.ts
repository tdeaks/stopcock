import { defineModule } from '@stopcock/server'
import { DbModule } from '../../infra/db.module'
import { WorkspaceModule, type WorkspacesService } from '../workspace/workspace.module'
import { TeamModule, type TeamsService } from '../team/team.module'
import { IssueModule, type IssuesService } from '../issue/issue.module'
import { UserModule, type UsersService } from '../user/user.module'
import type { Db } from '../../../db/client'
import { makeWithAuth } from '../../middleware/auth'
import { makeAuthz } from '../../middleware/authz'
import { makeAttachmentsRepo } from './attachment.repo'
import { makeAttachmentsService, type AttachmentsService } from './attachment.service'
import { makeAttachmentsController } from './attachment.controller'
import { attachmentRoutes } from './attachment.routes'

export type { AttachmentsService } from './attachment.service'

type Deps = {
  attachments: AttachmentsService
  workspaces: WorkspacesService
  teams: TeamsService
  issues: IssuesService
  users: UsersService
  db: Db
}

export const AttachmentModule = defineModule({
  name: 'attachment',
  imports: [DbModule, WorkspaceModule, TeamModule, IssueModule, UserModule],
  provides: ({ db }) => ({ attachments: makeAttachmentsService({ repo: makeAttachmentsRepo({ db }) }) }),
  routes: ({ attachments, workspaces, teams, issues, db }: Deps) => attachmentRoutes({
    controller: makeAttachmentsController({ attachments }),
    workspaces, teams, issues,
    withAuth: makeWithAuth({ db }),
    authz: makeAuthz({ db }),
  }),
})
