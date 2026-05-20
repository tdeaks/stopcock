import { defineController } from '@stopcock/server'
import type { IssuesService } from './issue.service'
import type { CreateIssueInput, PatchIssueInput } from './issue.schema'

export const makeIssuesController = defineController('issues', ({ issues }: { issues: IssuesService }) => ({
  list:     (projectId: string) => issues.list(projectId),
  find:     (teamId: string, number: number) => issues.find(teamId, number),
  children: (issueId: string) => issues.children(issueId),
  create:   (teamId: string, projectId: string, creatorId: string, input: CreateIssueInput) =>
              issues.create(teamId, projectId, creatorId, input),
  patch:    (id: string, patch: PatchIssueInput) => issues.patch(id, patch),
  labels:       (issueId: string) => issues.labels(issueId),
  attachLabel:  (issueId: string, labelId: string) => issues.attachLabel(issueId, labelId),
  detachLabel:  (issueId: string, labelId: string) => issues.detachLabel(issueId, labelId),
}))

export type IssuesController = ReturnType<typeof makeIssuesController>
