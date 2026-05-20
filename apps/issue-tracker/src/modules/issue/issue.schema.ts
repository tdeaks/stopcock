import { BadInput } from '../../errors/domain'

export type Status = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled'

export type CreateIssueInput = {
  title: string
  creatorId: string
  description?: string
  status?: Status
  priority?: number
  assigneeId?: string
  cycleId?: string
  parentIssueId?: string
}

export type PatchIssueInput = Partial<Pick<CreateIssueInput, 'title' | 'description' | 'status' | 'priority' | 'assigneeId' | 'cycleId'>>

export const parseCreate = (raw: unknown): CreateIssueInput => {
  if (typeof raw !== 'object' || raw === null) throw new BadInput(['expected object'])
  const r = raw as Record<string, unknown>
  const issues: string[] = []
  if (typeof r['title']     !== 'string' || !r['title'].length) issues.push('title: required string')
  if (typeof r['creatorId'] !== 'string')                       issues.push('creatorId: required string (until auth is wired)')
  if (issues.length) throw new BadInput(issues)
  return {
    title:         r['title'] as string,
    creatorId:     r['creatorId'] as string,
    description:   typeof r['description'] === 'string' ? r['description'] : undefined,
    status:        typeof r['status'] === 'string' ? r['status'] as Status : undefined,
    priority:      typeof r['priority'] === 'number' ? r['priority'] : undefined,
    assigneeId:    typeof r['assigneeId'] === 'string' ? r['assigneeId'] : undefined,
    cycleId:       typeof r['cycleId'] === 'string' ? r['cycleId'] : undefined,
    parentIssueId: typeof r['parentIssueId'] === 'string' ? r['parentIssueId'] : undefined,
  }
}

export const parsePatch = (raw: unknown): PatchIssueInput => {
  if (typeof raw !== 'object' || raw === null) throw new BadInput(['expected object'])
  const r = raw as Record<string, unknown>
  const out: PatchIssueInput = {}
  if (typeof r['title']       === 'string') out.title = r['title']
  if (typeof r['description'] === 'string') out.description = r['description']
  if (typeof r['status']      === 'string') out.status = r['status'] as Status
  if (typeof r['priority']    === 'number') out.priority = r['priority']
  if (typeof r['assigneeId']  === 'string') out.assigneeId = r['assigneeId']
  if (typeof r['cycleId']     === 'string') out.cycleId = r['cycleId']
  return out
}
