import { defineRepository } from '@stopcock/server'
import { and, eq } from 'drizzle-orm'
import { issueLabels, issues } from '../../../db/schema'
import type { Db } from '../../../db/client'
import { NotFound } from '../../errors/domain'
import type { PatchIssueInput } from './issue.schema'

export const makeIssuesRepo = defineRepository('issues', ({ db }: { db: Db }) => ({
  listByProject: (projectId: string) =>
    db.select().from(issues).where(eq(issues.projectId, projectId)),
  byNumber: async (teamId: string, number: number) => {
    const [iss] = await db.select().from(issues)
      .where(and(eq(issues.teamId, teamId), eq(issues.number, number))).limit(1)
    if (!iss) throw new NotFound('issue', String(number))
    return iss
  },
  children: (parentId: string) =>
    db.select().from(issues).where(eq(issues.parentIssueId, parentId)),
  create: async (input: typeof issues.$inferInsert) => {
    const [iss] = await db.insert(issues).values(input).returning()
    return iss!
  },
  patch: async (id: string, patch: PatchIssueInput) => {
    const [iss] = await db.update(issues)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(issues.id, id))
      .returning()
    if (!iss) throw new NotFound('issue', id)
    return iss
  },
  attachLabel: async (issueId: string, labelId: string) => {
    await db.insert(issueLabels).values({ issueId, labelId }).onConflictDoNothing()
  },
  detachLabel: async (issueId: string, labelId: string) => {
    await db.delete(issueLabels)
      .where(and(eq(issueLabels.issueId, issueId), eq(issueLabels.labelId, labelId)))
  },
  listLabels: (issueId: string) =>
    db.select().from(issueLabels).where(eq(issueLabels.issueId, issueId)),
}))

export type IssuesRepo = ReturnType<typeof makeIssuesRepo>
