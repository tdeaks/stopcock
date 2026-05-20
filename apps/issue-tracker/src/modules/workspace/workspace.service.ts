import { defineService } from '@stopcock/server'
import type { WorkspacesRepo } from './workspace.repo'
import type { CreateWorkspaceInput, Role } from './workspace.schema'

export const makeWorkspacesService = defineService(
  'workspaces',
  ({ repo }: { repo: WorkspacesRepo }) => ({
    list:    () => repo.list(),
    find:    (slug: string) => repo.bySlug(slug),
    create:  (input: CreateWorkspaceInput) => repo.create(input),
    members: (id: string) => repo.members(id),
    addMember:    (id: string, userId: string, role: Role) => repo.addMember(id, userId, role),
    removeMember: (id: string, userId: string) => repo.removeMember(id, userId),
    addMemberBySlug: async (slug: string, userId: string, role: Role) => {
      const w = await repo.bySlug(slug)
      await repo.addMember(w.id, userId, role)
    },
    removeMemberBySlug: async (slug: string, userId: string) => {
      const w = await repo.bySlug(slug)
      await repo.removeMember(w.id, userId)
    },
    membersBySlug: async (slug: string) => {
      const w = await repo.bySlug(slug)
      return repo.members(w.id)
    },
  })
)

export type WorkspacesService = ReturnType<typeof makeWorkspacesService>
