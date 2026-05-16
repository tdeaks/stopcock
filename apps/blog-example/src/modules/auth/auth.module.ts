import { defineModule } from '@stopcock/server'
import { DbModule } from '../../infra/db.module'
import { makeAuthService } from './auth.service'
import { makeAuthController } from './auth.controller'
import { authRoutes } from './auth.routes'

/**
 * Auth feature module.
 *   provides:  `auth` — the AuthService, exposed to controllers in any
 *              module that imports AuthModule
 *   imports:   db (from DbModule)
 *   routes:    POST /auth/login
 *
 * The auth MIDDLEWARE (`withAuth`) lives in auth.middleware.ts and is
 * constructed by consumers from this module's `auth` service. It is not
 * exposed via `provides` because middleware is an HTTP-layer concern, not
 * a service.
 */
export const AuthModule = defineModule({
  name: 'auth',
  imports: [DbModule],
  provides: ({ db }) => ({
    auth: makeAuthService({ db }),
  }),
  routes: ({ auth }) => authRoutes({ controller: makeAuthController({ auth }) }),
})
