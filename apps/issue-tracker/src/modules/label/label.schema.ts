import { BadInput } from '../../errors/domain'

export type CreateLabelInput = { name: string; color: string }

export const parseCreate = (raw: unknown): CreateLabelInput => {
  if (typeof raw !== 'object' || raw === null) throw new BadInput(['expected object'])
  const r = raw as Record<string, unknown>
  const issues: string[] = []
  if (typeof r['name']  !== 'string' || !r['name'].length)                issues.push('name: required string')
  if (typeof r['color'] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(r['color'])) issues.push('color: #rrggbb')
  if (issues.length) throw new BadInput(issues)
  return { name: r['name'] as string, color: r['color'] as string }
}
