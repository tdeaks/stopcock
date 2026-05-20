import { BadInput } from '../../errors/domain'

export type CreateCommentInput = {
  authorId: string
  body: string
  parentCommentId?: string
}

export const parseCreate = (raw: unknown): CreateCommentInput => {
  if (typeof raw !== 'object' || raw === null) throw new BadInput(['expected object'])
  const r = raw as Record<string, unknown>
  if (typeof r['authorId'] !== 'string') throw new BadInput(['authorId: required string'])
  if (typeof r['body']     !== 'string' || !r['body'].length) throw new BadInput(['body: required string'])
  return {
    authorId: r['authorId'],
    body:     r['body'],
    parentCommentId: typeof r['parentCommentId'] === 'string' ? r['parentCommentId'] : undefined,
  }
}
