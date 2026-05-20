import { BadInput } from '../../errors/domain'

export type CreateTeamInput = { key: string; name: string }

export const parseCreate = (raw: unknown): CreateTeamInput => {
  if (typeof raw !== 'object' || raw === null) throw new BadInput(['expected object'])
  const r = raw as Record<string, unknown>
  const issues: string[] = []
  if (typeof r['key'] !== 'string' || !/^[A-Z][A-Z0-9]{1,9}$/.test(r['key'])) issues.push('key: 2-10 uppercase letters/digits, starting with letter')
  if (typeof r['name'] !== 'string' || !r['name'].length) issues.push('name: required string')
  if (issues.length) throw new BadInput(issues)
  return { key: r['key'] as string, name: r['name'] as string }
}
