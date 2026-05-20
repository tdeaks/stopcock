import { defineService } from '@stopcock/server'
import type { Db } from '../../../db/client'
import type { IssuesRepo } from './issue.repo'
import type { CreateIssueInput, PatchIssueInput } from './issue.schema'
import { allocateIssueNumber } from './numbering'

export const makeIssuesService = defineService('issues', ({ db, repo }: { db: Db; repo: IssuesRepo }) => ({
  list:     (projectId: string) => repo.listByProject(projectId),
  find:     (teamId: string, number: number) => repo.byNumber(teamId, number),
  children: (issueId: string) => repo.children(issueId),
  create: async (teamId: string, projectId: string, creatorId: string, input: CreateIssueInput) => {
    const number = await allocateIssueNumber(db, teamId)
    return repo.create({
      teamId, projectId, creatorId, number,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? 'backlog',
      priority: input.priority ?? 0,
      assigneeId: input.assigneeId ?? null,
      cycleId: input.cycleId ?? null,
      parentIssueId: input.parentIssueId ?? null,
    })
  },
  patch:       (id: string, patch: PatchIssueInput) => repo.patch(id, patch),
  attachLabel: (issueId: string, labelId: string) => repo.attachLabel(issueId, labelId),
  detachLabel: (issueId: string, labelId: string) => repo.detachLabel(issueId, labelId),
  labels:      (issueId: string) => repo.listLabels(issueId),
}))

export type IssuesService = ReturnType<typeof makeIssuesService>
