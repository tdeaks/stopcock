import { BadInput } from '../../errors/domain'

export type AddReactionInput = { userId: string; emoji: string }

export const parseAdd = (raw: unknown): AddReactionInput => {
  if (typeof raw !== 'object' || raw === null) throw new BadInput(['expected object'])
  const r = raw as Record<string, unknown>
  if (typeof r['userId'] !== 'string') throw new BadInput(['userId: required string'])
  if (typeof r['emoji']  !== 'string' || !r['emoji'].length) throw new BadInput(['emoji: required string'])
  return { userId: r['userId'], emoji: r['emoji'] }
}
