import { defineController } from '@stopcock/server'
import type { UsersService } from './user.service'

export const makeUsersController = defineController('users', ({ users }: { users: UsersService }) => ({
  list: () => users.list(),
  find: (id: string) => users.find(id),
}))

export type UsersController = ReturnType<typeof makeUsersController>
