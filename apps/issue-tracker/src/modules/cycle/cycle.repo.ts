import { defineRepository } from '@stopcock/server'
import { and, asc, eq, gt, lte } from 'drizzle-orm'
import { cycles } from '../../../db/schema'
import type { Db } from '../../../db/client'
import { NotFound } from '../../errors/domain'

export const makeCyclesRepo = defineRepository('cycles', ({ db }: { db: Db }) => ({
  list: (teamId: string) =>
    db.select().from(cycles).where(eq(cycles.teamId, teamId)).orderBy(asc(cycles.number)),
  current: async (teamId: string) => {
    const now = new Date()
    const [c] = await db.select().from(cycles)
      .where(and(eq(cycles.teamId, teamId), lte(cycles.startsAt, now), gt(cycles.endsAt, now)))
      .limit(1)
    return c ?? null
  },
  byNumber: async (teamId: string, number: number) => {
    const [c] = await db.select().from(cycles)
      .where(and(eq(cycles.teamId, teamId), eq(cycles.number, number))).limit(1)
    if (!c) throw new NotFound('cycle', String(number))
    return c
  },
}))

export type CyclesRepo = ReturnType<typeof makeCyclesRepo>
