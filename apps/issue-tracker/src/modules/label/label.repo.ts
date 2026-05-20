import { defineRepository } from '@stopcock/server'
import { and, eq } from 'drizzle-orm'
import { labels } from '../../../db/schema'
import type { Db } from '../../../db/client'
import { NotFound } from '../../errors/domain'
import type { CreateLabelInput } from './label.schema'

export const makeLabelsRepo = defineRepository('labels', ({ db }: { db: Db }) => ({
  listByTeam: (teamId: string) => db.select().from(labels).where(eq(labels.teamId, teamId)),
  byId: async (teamId: string, id: string) => {
    const [l] = await db.select().from(labels)
      .where(and(eq(labels.teamId, teamId), eq(labels.id, id))).limit(1)
    if (!l) throw new NotFound('label', id)
    return l
  },
  create: async (teamId: string, input: CreateLabelInput) => {
    const [l] = await db.insert(labels).values({ teamId, ...input }).returning()
    return l!
  },
  remove: async (teamId: string, id: string) => {
    await db.delete(labels).where(and(eq(labels.teamId, teamId), eq(labels.id, id)))
  },
}))

export type LabelsRepo = ReturnType<typeof makeLabelsRepo>
