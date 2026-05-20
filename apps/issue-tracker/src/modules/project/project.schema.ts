import { BadInput } from '../../errors/domain'

export type CreateProjectInput = { name: string; description?: string }

export const parseCreate = (raw: unknown): CreateProjectInput => {
  if (typeof raw !== 'object' || raw === null) throw new BadInput(['expected object'])
  const r = raw as Record<string, unknown>
  if (typeof r['name'] !== 'string' || !r['name'].length) throw new BadInput(['name: required string'])
  const desc = r['description']
  if (desc !== undefined && typeof desc !== 'string') throw new BadInput(['description: string'])
  return { name: r['name'] as string, description: desc as string | undefined }
}
