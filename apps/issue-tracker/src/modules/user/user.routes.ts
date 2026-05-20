import { route, defineRoutes } from '@stopcock/server'
import type { UsersController } from './user.controller'

export type UsersRoutesDeps = {
  controller: UsersController
}

export const usersRoutes = defineRoutes('user', ({ controller }: UsersRoutesDeps) => [
  route.get('/users').handler(() => controller.list()),
  route.get('/users/:id').handler((ctx) => controller.find(ctx.params.id)),
])
