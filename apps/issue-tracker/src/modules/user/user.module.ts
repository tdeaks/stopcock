import { defineModule } from '@stopcock/server'
import { DbModule } from '../../infra/db.module'
import { makeUsersRepo } from './user.repo'
import { makeUsersService } from './user.service'
import { makeUsersController } from './user.controller'
import { usersRoutes } from './user.routes'

export type { UsersService } from './user.service'

export const UserModule = defineModule({
  name: 'user',
  imports: [DbModule],
  provides: ({ db }) => ({ users: makeUsersService({ repo: makeUsersRepo({ db }) }) }),
  routes: ({ users }) => usersRoutes({ controller: makeUsersController({ users }) }),
})
