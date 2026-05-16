import { defineController } from '@stopcock/server'
import type { AuthService } from './auth.service'
import type { LoginInput } from './auth.schema'

export const makeAuthController = defineController('auth', ({ auth }: { auth: AuthService }) => ({
  login: (input: LoginInput) => auth.login(input),
}))

export type AuthController = ReturnType<typeof makeAuthController>
