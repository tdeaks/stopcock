import { defineRepository } from '@stopcock/server'
import { and, eq } from 'drizzle-orm'
import { workspaceMembers, workspaces } from '../../../db/schema'
import type { Db } from '../../../db/client'
import { NotFound } from '../../errors/domain'
import type { CreateWorkspaceInput, Role } from './workspace.schema'

export const makeWorkspacesRepo = defineRepository('workspaces', ({ db }: { db: Db }) => ({
  list: () => db.select().from(workspaces).orderBy(workspaces.createdAt),
  bySlug: async (slug: string) => {
    const [w] = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1)
    if (!w) throw new NotFound('workspace', slug)
    return w
  },
  create: async (input: CreateWorkspaceInput) => {
    const [w] = await db.insert(workspaces).values(input).returning()
    return w!
  },
  members: (workspaceId: string) =>
    db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)),
  addMember: async (workspaceId: string, userId: string, role: Role) => {
    await db.insert(workspaceMembers).values({ workspaceId, userId, role })
      .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: { role },
      })
  },
  removeMember: async (workspaceId: string, userId: string) => {
    await db.delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
  },
}))

export type WorkspacesRepo = ReturnType<typeof makeWorkspacesRepo>
