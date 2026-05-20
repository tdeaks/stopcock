import { BadInput } from '../../errors/domain'

export type Role = 'owner' | 'admin' | 'member'

export type CreateWorkspaceInput = { slug: string; name: string }

export const parseCreate = (raw: unknown): CreateWorkspaceInput => {
  if (typeof raw !== 'object' || raw === null) throw new BadInput(['expected object'])
  const r = raw as Record<string, unknown>
  const issues: string[] = []
  if (typeof r['slug'] !== 'string' || !/^[a-z0-9-]+$/.test(r['slug'])) issues.push('slug: lowercase letters, digits, hyphens')
  if (typeof r['name'] !== 'string' || !r['name'].length)               issues.push('name: required string')
  if (issues.length) throw new BadInput(issues)
  return { slug: r['slug'] as string, name: r['name'] as string }
}

export type AddMemberInput = { userId: string; role?: Role }

export const parseAddMember = (raw: unknown): AddMemberInput => {
  if (typeof raw !== 'object' || raw === null) throw new BadInput(['expected object'])
  const r = raw as Record<string, unknown>
  if (typeof r['userId'] !== 'string') throw new BadInput(['userId: required string'])
  const role = r['role']
  if (role !== undefined && role !== 'owner' && role !== 'admin' && role !== 'member') {
    throw new BadInput(['role: owner | admin | member'])
  }
  return { userId: r['userId'], role: (role ?? 'member') as Role }
}
