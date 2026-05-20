import { defineApp, defineModule, route } from '@stopcock/server'
import { cors } from '@stopcock/server/cors'
import { openapi } from '@stopcock/server/openapi'
import { renderDomain } from './errors/domain'
import { UserModule } from './modules/user/user.module'
import { WorkspaceModule } from './modules/workspace/workspace.module'
import { TeamModule } from './modules/team/team.module'
import { LabelModule } from './modules/label/label.module'
import { CycleModule } from './modules/cycle/cycle.module'
import { ProjectModule } from './modules/project/project.module'
import { IssueModule } from './modules/issue/issue.module'
import { CommentModule } from './modules/comment/comment.module'
import { ReactionModule } from './modules/reaction/reaction.module'
import { AttachmentModule } from './modules/attachment/attachment.module'

const HealthModule = defineModule({
  name: 'health',
  routes: () => [route.get('/health').static({ ok: true })],
})

const ApiModule = defineModule({
  name: 'api',
  prefix: '/api/v1',
  imports: [
    UserModule, WorkspaceModule, TeamModule, LabelModule, CycleModule,
    ProjectModule, IssueModule, CommentModule, ReactionModule, AttachmentModule,
  ],
})

const app = defineApp({
  renderError: renderDomain,
  modules: [HealthModule, ApiModule],
  plugins: [
    cors(),
    openapi({
      path: '/openapi.json',
      docsPath: '/docs',
      info: { title: 'Stopcock Issue Tracker', version: '0.0.1' },
    }),
  ],
})

declare const Bun: { serve: (opts: { port: number; fetch: (req: Request) => Promise<Response> }) => unknown }
if (typeof Bun !== 'undefined') {
  const port = Number(process.env['PORT'] ?? 3000)
  Bun.serve({ port, fetch: (req) => app.fetch(req) })
  console.log(`issue-tracker API listening on http://localhost:${port}`)
  console.log(`  docs:    http://localhost:${port}/docs`)
  console.log(`  openapi: http://localhost:${port}/openapi.json`)
}
