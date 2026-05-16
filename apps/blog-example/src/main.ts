/**
 * Bootstrap: smash modules together, listen.
 *
 * Adding a feature: create src/modules/<name>/<name>.module.ts that exports
 * a `<Name>Module`. Add it to the modules array below — that's it.
 * Services, controllers, repos all wire themselves through module imports.
 */
import { defineModule, defineApp, route } from '@stopcock/server'
import { renderDomain } from './errors/domain'
import { PostsModule } from './modules/posts/posts.module'
import { AuthModule } from './modules/auth/auth.module'

const HealthModule = defineModule({
  name: 'health',
  routes: () => [
    route.get('/health').handler(() => ({ ok: true })),
  ],
})

const ApiV1Module = defineModule({
  name: 'api-v1',
  prefix: '/api/v1',
  imports: [PostsModule, AuthModule],
})

const app = defineApp({
  renderError: renderDomain,
  modules: [HealthModule, ApiV1Module],
})

declare const Bun: { serve: (opts: { port: number; fetch: (req: Request) => Promise<Response> }) => unknown }
if (typeof Bun !== 'undefined') {
  const port = Number(process.env['PORT'] ?? 3000)
  Bun.serve({ port, fetch: (req) => app.fetch(req) })
  console.log(`blog API listening on http://localhost:${port}`)
}
