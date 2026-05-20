import { defineRepository } from '@stopcock/server'
import { and, eq } from 'drizzle-orm'
import { projects } from '../../../db/schema'
import type { Db } from '../../../db/client'
import { NotFound } from '../../errors/domain'
import type { CreateProjectInput } from './project.schema'

export const makeProjectsRepo = defineRepository('projects', ({ db }: { db: Db }) => ({
  list: (teamId: string) => db.select().from(projects).where(eq(projects.teamId, teamId)),
  byId: async (teamId: string, id: string) => {
    const [p] = await db.select().from(projects)
      .where(and(eq(projects.teamId, teamId), eq(projects.id, id))).limit(1)
    if (!p) throw new NotFound('project', id)
    return p
  },
  create: async (teamId: string, input: CreateProjectInput) => {
    const [p] = await db.insert(projects).values({ teamId, ...input }).returning()
    return p!
  },
}))

export type ProjectsRepo = ReturnType<typeof makeProjectsRepo>
