import { defineController } from '@stopcock/server'
import type { WorkspacesService } from './workspace.service'
import type { CreateWorkspaceInput, Role } from './workspace.schema'

export const makeWorkspacesController = defineController('workspaces', ({ workspaces }: { workspaces: WorkspacesService }) => ({
  list: () => workspaces.list(),
  find: (slug: string) => workspaces.find(slug),
  create: (input: CreateWorkspaceInput) => workspaces.create(input),
  members: (slug: string) => workspaces.membersBySlug(slug),
  addMember: async (slug: string, userId: string, role: Role) => {
    await workspaces.addMemberBySlug(slug, userId, role)
    return { ok: true }
  },
  removeMember: async (slug: string, userId: string) => {
    await workspaces.removeMemberBySlug(slug, userId)
    return { ok: true }
  },
}))

export type WorkspacesController = ReturnType<typeof makeWorkspacesController>
