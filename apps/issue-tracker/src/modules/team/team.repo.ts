import { defineRepository } from '@stopcock/server'
import { and, eq } from 'drizzle-orm'
import { teamMembers, teams } from '../../../db/schema'
import type { Db } from '../../../db/client'
import { NotFound } from '../../errors/domain'
import type { CreateTeamInput } from './team.schema'

export const makeTeamsRepo = defineRepository('teams', ({ db }: { db: Db }) => ({
  listByWorkspace: (workspaceId: string) =>
    db.select().from(teams).where(eq(teams.workspaceId, workspaceId)),
  byKey: async (workspaceId: string, key: string) => {
    const [t] = await db.select().from(teams)
      .where(and(eq(teams.workspaceId, workspaceId), eq(teams.key, key))).limit(1)
    if (!t) throw new NotFound('team', key)
    return t
  },
  create: async (workspaceId: string, input: CreateTeamInput) => {
    const [t] = await db.insert(teams).values({ workspaceId, ...input }).returning()
    return t!
  },
  members: (teamId: string) =>
    db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)),
}))

export type TeamsRepo = ReturnType<typeof makeTeamsRepo>
