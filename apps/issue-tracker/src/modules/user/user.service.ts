import { defineService } from '@stopcock/server'
import type { UsersRepo } from './user.repo'

export const makeUsersService = defineService('users', ({ repo }: { repo: UsersRepo }) => ({
  list: () => repo.list(),
  find: (id: string) => repo.findById(id),
}))

export type UsersService = ReturnType<typeof makeUsersService>
